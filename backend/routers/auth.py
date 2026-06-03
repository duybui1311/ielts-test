from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from pydantic import BaseModel
import bcrypt
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str          # accepts email OR username
    password: str


class LoginOut(BaseModel):
    user_id: int
    name: Optional[str] = None
    role: str
    token: str


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
def login(payload: LoginIn, db: Session = Depends(get_db)) -> LoginOut:
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
    # TEST-VERSION token only. Replace with a signed JWT before production.
    return LoginOut(
        user_id=user.id,
        name=user.full_name,
        role=user.role.value,
        token=f"test-{user.id}",
    )
