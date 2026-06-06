"""Current-user resources — identity comes from the verified JWT."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import get_current_user
from backend.routers.auth import hash_password, verify_password

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("")
def my_profile(user: models.User = Depends(get_current_user)):
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
    user: models.User = Depends(get_current_user),
):
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
    user: models.User = Depends(get_current_user),
):
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
    user: models.User = Depends(get_current_user),
):
    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.user_id == user.id)
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
