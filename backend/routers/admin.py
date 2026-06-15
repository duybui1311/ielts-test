"""Admin area — site-wide management for the single admin role.

Admin is identified by the verified JWT (role must be `admin`, enforced by the
`require_role("admin")` dependency). Capabilities:
- Site overview counts.
- User management: list, change role, activate/deactivate, delete (guarded).
- Test list with attempt counts (delete reuses /api/tests/{id}).

Identity and role come from the verified JWT (never a client-supplied header).
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import require_role
from backend.routers.auth import hash_password, validate_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Roles an admin may assign when creating an account.
_ASSIGNABLE_ROLES = {"student", "teacher", "admin"}


def _user_row(u: models.User, attempts: int = 0) -> dict:
    """Serialise a user the same way list_users does, for create/list parity."""
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "username": u.username,
        "role": u.role.value,
        "is_active": u.is_active,
        "attempts": attempts,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    users = db.query(models.User).all()
    by_role = {"student": 0, "teacher": 0, "admin": 0}
    active = 0
    for u in users:
        by_role[u.role.value] = by_role.get(u.role.value, 0) + 1
        if u.is_active:
            active += 1
    return {
        "users": len(users),
        "active_users": active,
        "students": by_role.get("student", 0),
        "teachers": by_role.get("teacher", 0),
        "admins": by_role.get("admin", 0),
        "classes": db.query(models.Class).count(),
        "exams": db.query(models.Exam).count(),
        "attempts": db.query(models.ExamAttempt).count(),
        "writing_subs": db.query(models.WritingSubmission).count(),
        "speaking_subs": db.query(models.SpeakingSubmission).count(),
    }


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    # attempt counts per user (one query)
    counts = dict(
        db.query(models.ExamAttempt.user_id, func.count(models.ExamAttempt.id))
        .group_by(models.ExamAttempt.user_id)
        .all()
    )
    users = db.query(models.User).order_by(models.User.created_at.asc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "username": u.username,
            "role": u.role.value,
            "is_active": u.is_active,
            "attempts": counts.get(u.id, 0),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


class CreateUserIn(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    username: Optional[str] = None
    role: str = "teacher"               # student | teacher | admin (default teacher)


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: CreateUserIn,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    """Provision an account with any role. The primary use is creating teacher
    accounts, since self-signup is students-only."""
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid email is required.")
    if payload.role not in _ASSIGNABLE_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid role.")
    validate_password(payload.password)

    username = (payload.username or "").strip().lower() or None
    conflicts = [func.lower(models.User.email) == email]
    if username:
        conflicts.append(func.lower(models.User.username) == username)
    if db.query(models.User).filter(or_(*conflicts)).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with that email or username already exists.",
        )

    user = models.User(
        email=email,
        username=username,
        full_name=(payload.full_name or "").strip() or None,
        role=models.UserRole(payload.role),
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_row(user)


class PasswordIn(BaseModel):
    password: str


@router.post("/users/{user_id}/password")
def set_user_password(
    user_id: int,
    payload: PasswordIn,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    """Set/reset a user's password (admin-initiated, e.g. onboarding a teacher
    or recovering a locked-out account)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    validate_password(payload.password)
    user.password_hash = hash_password(payload.password)
    db.commit()
    return {"ok": True, "id": user.id}


class UserPatchIn(BaseModel):
    role: Optional[str] = None          # student | teacher | admin
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserPatchIn,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if payload.role is not None:
        try:
            new_role = models.UserRole(payload.role)
        except ValueError:
            raise HTTPException(400, "Invalid role.")
        if user.id == admin.id and new_role != models.UserRole.admin:
            raise HTTPException(400, "You can't change your own admin role.")
        user.role = new_role

    if payload.is_active is not None:
        if user.id == admin.id and not payload.is_active:
            raise HTTPException(400, "You can't deactivate your own account.")
        user.is_active = payload.is_active

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None

    db.commit()
    return {"id": user.id, "role": user.role.value, "is_active": user.is_active}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    """Hard-delete a user — only when they own no content and have no attempts.
    Otherwise the admin should deactivate them instead (keeps data intact)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You can't delete your own account.")

    blockers = []
    if db.query(models.ExamAttempt).filter(models.ExamAttempt.user_id == user_id).count():
        blockers.append("test attempts")
    if db.query(models.Exam).filter(models.Exam.created_by == user_id).count():
        blockers.append("authored exams")
    if db.query(models.Class).filter(models.Class.owner_id == user_id).count():
        blockers.append("owned classes")
    if blockers:
        raise HTTPException(
            409,
            "User has " + ", ".join(blockers) + ". Deactivate the account instead "
            "of deleting it to keep that data.",
        )

    # Safe to remove light dependents, then the user.
    db.query(models.ClassEnrolment).filter(
        models.ClassEnrolment.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(models.WritingSubmission).filter(
        models.WritingSubmission.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(models.SpeakingSubmission).filter(
        models.SpeakingSubmission.user_id == user_id
    ).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    return {"ok": True, "deleted": user_id}


@router.get("/tests")
def list_tests(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    exams = db.query(models.Exam).order_by(models.Exam.created_at.desc()).all()
    owners = {
        u.id: (u.full_name or u.username or u.email or f"User {u.id}")
        for u in db.query(models.User).all()
    }
    out = []
    for e in exams:
        skills = sorted({st.skill for st in e.stations if st.skill})
        attempts = db.query(models.ExamAttempt).filter(
            models.ExamAttempt.exam_id == e.id
        ).count()
        out.append({
            "id": e.id,
            "name": e.name,
            "skills": skills,
            "owner": owners.get(e.created_by, f"User {e.created_by}"),
            "attempts": attempts,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        })
    return out
