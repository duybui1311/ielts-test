"""JWT authentication: token creation and the request dependencies that derive
the current user from a verified `Authorization: Bearer <token>` header.

The user is NEVER trusted from a client-supplied id header — identity always
comes from a signed token. `JWT_SECRET` must be set (config reads it from env);
we fail clearly if it is missing.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.service.config import settings
from backend.service.database import get_db
from backend.service import models

ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 24

_UNAUTHENTICATED = {"WWW-Authenticate": "Bearer"}


_MIN_SECRET_LEN = 32


def _secret() -> str:
    secret = settings.JWT_SECRET
    if not secret:
        # Configuration error, not a client error.
        raise RuntimeError(
            "JWT_SECRET is not set. Add JWT_SECRET to backend/.env (a long random "
            "string) and restart the backend."
        )
    if len(secret) < _MIN_SECRET_LEN:
        # A short secret is brute-forceable, so it is as risky as a missing one.
        raise RuntimeError(
            f"JWT_SECRET is too short ({len(secret)} chars). Use at least "
            f"{_MIN_SECRET_LEN} characters (a long random string) and restart the backend."
        )
    return secret


def create_access_token(user_id: int, role: str) -> str:
    """Sign a token carrying the user id and role with a 24h expiry."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=TOKEN_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    """Verify the bearer token and load the active user, or 401."""
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers=_UNAUTHENTICATED)
    try:
        data = jwt.decode(creds.credentials, _secret(), algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token has expired", headers=_UNAUTHENTICATED)
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token", headers=_UNAUTHENTICATED)

    user = db.query(models.User).filter(models.User.id == data.get("user_id")).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive", headers=_UNAUTHENTICATED)
    return user


def require_role(*roles: str):
    """Dependency factory: allow only users whose role is in `roles`.
    e.g. require_role("teacher"), require_role("admin"), require_role("teacher", "admin")."""
    allowed = set(roles)

    def _dep(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role.value not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return _dep
