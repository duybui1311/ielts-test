import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from pydantic import BaseModel
import bcrypt
from backend.service.database import get_db
from backend.service.sanitize import OptionalSanitized, Sanitized
from backend.service import mailer, models
from backend.service.ratelimit import rate_limit_ip
from backend.service.auth_deps import create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: Sanitized(255)          # accepts email OR username
    password: Sanitized(200)


class RegisterIn(BaseModel):
    email: Sanitized(255)
    password: Sanitized(200)
    full_name: OptionalSanitized(120) = None
    username: OptionalSanitized(100) = None
    role: str = "student"          # ignored — self-signup is always a student


class LoginOut(BaseModel):
    user_id: int
    name: Optional[str] = None
    role: str
    token: str
    email_verified: bool = True


MIN_PASSWORD_LEN = 8

# Brute-force protection: per-IP windows on the public auth endpoints.
_login_limiter = rate_limit_ip(
    8, 60, "Too many sign-in attempts. Please wait {retry}s and try again.")
_register_limiter = rate_limit_ip(
    5, 300, "Too many sign-up attempts. Please wait {retry}s and try again.")
_forgot_limiter = rate_limit_ip(
    3, 300, "Too many reset requests. Please wait {retry}s and try again.")

# One-time token lifetimes.
RESET_TOKEN_TTL = timedelta(hours=1)
VERIFY_TOKEN_TTL = timedelta(days=3)


def _issue_token(db: Session, user_id: int, purpose: str, ttl: timedelta) -> str:
    """Create a one-time token; only its SHA-256 lands in the DB."""
    raw = secrets.token_urlsafe(32)
    db.add(models.AuthToken(
        user_id=user_id,
        purpose=purpose,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + ttl,
    ))
    db.commit()
    return raw


def _consume_token(db: Session, raw: str, purpose: str) -> models.User:
    """Validate + burn a one-time token; returns its user or raises 400."""
    if not raw or not raw.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing token.")
    h = hashlib.sha256(raw.strip().encode()).hexdigest()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    tok = (
        db.query(models.AuthToken)
        .filter(
            models.AuthToken.token_hash == h,
            models.AuthToken.purpose == purpose,
            models.AuthToken.used_at.is_(None),
            models.AuthToken.expires_at > now,
        )
        .first()
    )
    if not tok:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This link is invalid or has expired. Please request a new one.",
        )
    tok.used_at = now
    user = db.query(models.User).filter(models.User.id == tok.user_id).first()
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account no longer exists.")
    return user


def _frontend_base() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


def _send_verification(db: Session, user: models.User) -> None:
    raw = _issue_token(db, user.id, "verify", VERIFY_TOKEN_TTL)
    url = f"{_frontend_base()}/verify-email?token={raw}"
    mailer.send(
        user.email,
        "Verify your email",
        mailer.action_email(
            "Verify your email",
            "Confirm this address to secure your Bandly account.",
            "Verify email", url,
        ),
    )


def validate_password(plain: Optional[str]) -> None:
    """Enforce the password policy, raising HTTP 400 on violation.

    Shared by registration and password change so both paths apply the same
    rule: a non-empty password (not just whitespace) of at least
    MIN_PASSWORD_LEN characters.
    """
    if not plain or not plain.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is required.")
    if len(plain) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Password must be at least {MIN_PASSWORD_LEN} characters.",
        )


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    sh = stored_hash.strip()
    if sh.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), sh.encode("utf-8"))
        except Exception:
            return False
    return False


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, db: Session = Depends(get_db),
          _rl: None = Depends(_login_limiter)) -> LoginOut:
    identifier = (payload.email or "").strip().lower()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username is required.",
        )
    user = (
        db.query(models.User)
        .filter(
            or_(
                func.lower(models.User.email) == identifier,
                func.lower(models.User.username) == identifier,
            )
        )
        .first()
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )
    return LoginOut(
        user_id=user.id,
        name=user.full_name,
        role=user.role.value,
        token=create_access_token(user.id, user.role.value),
        email_verified=bool(user.email_verified),
    )


@router.post("/register", response_model=LoginOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db),
             _rl: None = Depends(_register_limiter)) -> LoginOut:
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid email is required.")
    validate_password(payload.password)

    # Self-signup is students only. Teacher/admin accounts are provisioned by
    # hand (seed) or a future admin page, so the requested role is ignored here.
    role = models.UserRole.student

    username = (payload.username or "").strip().lower() or None

    conflicts = [func.lower(models.User.email) == email]
    if username:
        conflicts.append(func.lower(models.User.username) == username)
    existing = db.query(models.User).filter(or_(*conflicts)).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with that email or username already exists.",
        )

    user = models.User(
        email=email,
        username=username,
        full_name=(payload.full_name or "").strip() or None,
        role=role,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _send_verification(db, user)

    return LoginOut(
        user_id=user.id,
        name=user.full_name,
        role=user.role.value,
        token=create_access_token(user.id, user.role.value),
        email_verified=False,
    )


# ── Password reset ───────────────────────────────────────────────────────────

class ForgotIn(BaseModel):
    email: Sanitized(255)


@router.post("/forgot")
def forgot_password(payload: ForgotIn, db: Session = Depends(get_db),
                    _rl: None = Depends(_forgot_limiter)):
    """Always 200 (no account enumeration); emails a reset link when the
    account exists."""
    email = (payload.email or "").strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if user and user.is_active:
        raw = _issue_token(db, user.id, "reset", RESET_TOKEN_TTL)
        url = f"{_frontend_base()}/reset-password?token={raw}"
        mailer.send(
            user.email,
            "Reset your password",
            mailer.action_email(
                "Reset your password",
                "Someone (hopefully you) asked to reset the password for this "
                "account. The link works once and expires in 1 hour.",
                "Choose a new password", url,
            ),
        )
    return {"ok": True, "detail": "If that email has an account, a reset link is on its way."}


class ResetIn(BaseModel):
    token: Sanitized(128)
    password: Sanitized(200)


@router.post("/reset")
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    validate_password(payload.password)
    user = _consume_token(db, payload.token, "reset")
    user.password_hash = hash_password(payload.password)
    db.commit()
    return {"ok": True, "detail": "Password updated — you can sign in now."}


# ── Email verification ───────────────────────────────────────────────────────

class VerifyIn(BaseModel):
    token: Sanitized(128)


@router.post("/verify")
def verify_email(payload: VerifyIn, db: Session = Depends(get_db)):
    user = _consume_token(db, payload.token, "verify")
    user.email_verified = True
    db.commit()
    return {"ok": True, "detail": "Email verified — thank you!"}


@router.post("/resend-verification")
def resend_verification(db: Session = Depends(get_db),
                        user: models.User = Depends(get_current_user)):
    if user.email_verified:
        return {"ok": True, "detail": "Your email is already verified."}
    _send_verification(db, user)
    return {"ok": True, "detail": "Verification email sent."}


# ── Google sign-in ───────────────────────────────────────────────────────────

class GoogleIn(BaseModel):
    credential: Sanitized(4096)    # Google Identity Services ID token


@router.post("/google", response_model=LoginOut)
def google_login(payload: GoogleIn, db: Session = Depends(get_db),
                 _rl: None = Depends(_login_limiter)) -> LoginOut:
    """Sign in (or sign up as a student) with a Google account. The frontend
    obtains an ID token from Google Identity Services; we verify it against
    Google and trust only a matching audience + verified email."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(
            503, "Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the server.")
    import httpx  # lazy

    try:
        resp = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": payload.credential},
            timeout=10,
        )
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "Could not reach Google to verify the sign-in. Try again.")
    if resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")
    info = resp.json()
    if info.get("aud") != client_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")
    if info.get("email_verified") not in ("true", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your Google email is not verified.")
    sub = info.get("sub")
    email = (info.get("email") or "").strip().lower()
    if not sub or not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")

    user = db.query(models.User).filter(models.User.google_sub == sub).first()
    if not user:
        # Link by email when the account already exists, else create a student.
        user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
        if user:
            user.google_sub = sub
            user.email_verified = True
        else:
            user = models.User(
                email=email,
                full_name=(info.get("name") or "").strip() or None,
                role=models.UserRole.student,
                password_hash=None,          # Google-only account
                google_sub=sub,
                email_verified=True,
                is_active=True,
            )
            db.add(user)
        db.commit()
        db.refresh(user)
    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is disabled.")

    return LoginOut(
        user_id=user.id,
        name=user.full_name,
        role=user.role.value,
        token=create_access_token(user.id, user.role.value),
        email_verified=bool(user.email_verified),
    )
