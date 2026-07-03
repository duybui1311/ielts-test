from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from pydantic import BaseModel
import bcrypt
from backend.service.database import get_db
from backend.service import models
from backend.service.ratelimit import rate_limit_ip
from backend.service.auth_deps import create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str          # accepts email OR username
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    username: Optional[str] = None
    role: str = "student"          # student | teacher


class LoginOut(BaseModel):
    user_id: int
    name: Optional[str] = None
    role: str
    token: str


MIN_PASSWORD_LEN = 8

# Brute-force protection: per-IP windows on the public auth endpoints.
_login_limiter = rate_limit_ip(
    8, 60, "Too many sign-in attempts. Please wait {retry}s and try again.")
_register_limiter = rate_limit_ip(
    5, 300, "Too many sign-up attempts. Please wait {retry}s and try again.")


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

    return LoginOut(
        user_id=user.id,
        name=user.full_name,
        role=user.role.value,
        token=create_access_token(user.id, user.role.value),
    )
