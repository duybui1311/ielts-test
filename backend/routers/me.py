"""Current-user resources (test-version auth via the `X-User-Id` header)."""
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.routers.auth import hash_password, verify_password

router = APIRouter(prefix="/api/me", tags=["me"])


def _user_id(x_user_id: Optional[str]) -> Optional[int]:
    try:
        return int(x_user_id) if x_user_id else None
    except (TypeError, ValueError):
        return None


def _require_user(db: Session, x_user_id: Optional[str]) -> models.User:
    uid = _user_id(x_user_id)
    user = db.query(models.User).filter(models.User.id == uid).first() if uid else None
    if not user:
        raise HTTPException(401, "Sign in required.")
    return user


@router.get("")
def my_profile(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user = _require_user(db, x_user_id)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "username": user.username,
        "role": user.role.value,
    }


class ProfilePatchIn(BaseModel):
    full_name: Optional[str] = None


@router.patch("")
def update_profile(
    payload: ProfilePatchIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user = _require_user(db, x_user_id)
    if payload.full_name is not None:
        name = payload.full_name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty.")
        user.full_name = name
    db.commit()
    return {"id": user.id, "full_name": user.full_name}


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/password")
def change_password(
    payload: PasswordIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user = _require_user(db, x_user_id)
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    if len(payload.new_password or "") < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.get("/attempts")
def my_attempts(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _user_id(x_user_id)
    if not uid:
        return []
    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.user_id == uid)
        .order_by(models.ExamAttempt.started_at.desc())
        .all()
    )
    return [
        {
            "attempt_id": a.id,
            "exam_name": a.exam.name if a.exam else f"Attempt {a.id}",
            "status": a.status.value,
            "overall_band": a.overall_band,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        }
        for a in attempts
    ]
