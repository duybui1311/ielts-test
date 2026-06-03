from __future__ import annotations

from typing import Optional
import secrets
import string

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..service.database import get_db
from ..service.models import User, UserRole
from ..service.schemas import (
    AdminUserOut,
    AdminUserCreateIn,
    AdminUserCreateOut,
    AdminUserUpdateIn,
    AdminPasswordResetOut,
    PageOut,
    PageMeta,
)

router = APIRouter(
    prefix="/api/admin/users",
    tags=["admin-users"],
)

ROLE_VALUES = {"student", "teacher", "admin"}
STATUS_VALUES = {"active", "disabled"}


def _require_admin(db: Session, x_user_id: Optional[str]) -> int:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        user_id = int(x_user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid X-User-Id header")

    row = (
        db.query(User.id, User.role, User.is_active)
        .filter(User.id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    if not row.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if row.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user_id


def _generate_password(length: int = 6) -> str:
    alphabet = string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@router.get("", response_model=PageOut)
def list_users(
    role: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    size: int = 20,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    _require_admin(db, x_user_id)

    if role and role not in ROLE_VALUES:
        raise HTTPException(status_code=400, detail="Invalid role filter")
    if status and status not in STATUS_VALUES:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    if page < 1:
        page = 1
    if size < 1:
        size = 20
    if size > 100:
        size = 100

    q = db.query(User)

    if role:
        q = q.filter(User.role == UserRole(role))
    if status:
        is_active = status == "active"
        q = q.filter(User.is_active == is_active)
    if search:
        term = search.strip().lower()
        s_prefix = f"{term}%"
        s_word = f"% {term}%"
        q = q.filter(
            func.lower(User.email).like(s_prefix)
            | func.lower(User.username).like(s_prefix)
            | func.lower(User.full_name).like(s_prefix)
            | func.lower(User.full_name).like(s_word)
        )

    total = q.count()
    items = (
        q.order_by(User.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    def _as_dict(u: User) -> dict:
        return {
            "id": u.id,
            "email": u.email,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role.value if hasattr(u.role, "value") else u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
        }

    return PageOut(
        meta=PageMeta(page=page, size=size, total=total),
        items=[_as_dict(u) for u in items],
    )


@router.post("", response_model=AdminUserCreateOut)
def create_user(
    payload: AdminUserCreateIn,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    _require_admin(db, x_user_id)

    email = (payload.email or "").strip() or None
    username = (payload.username or "").strip() or None
    full_name = (payload.full_name or "").strip() or None

    if not email and not username:
        raise HTTPException(status_code=400, detail="Email or username is required")

    if email:
        if "@" not in email:
            raise HTTPException(status_code=400, detail="Email must contain '@'")
        exists = (
            db.query(User.id)
            .filter(func.lower(User.email) == email.lower())
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="Email already exists")

    if username:
        exists = (
            db.query(User.id)
            .filter(func.lower(User.username) == username.lower())
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="Username already exists")

    temp_password = _generate_password()
    user = User(
        email=email,
        username=username,
        full_name=full_name,
        role=UserRole(payload.role),
        is_active=payload.is_active,
        password_hash=_hash_password(temp_password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return AdminUserCreateOut(
        user=AdminUserOut.from_orm(user),
        temp_password=temp_password,
    )


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdateIn,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    _require_admin(db, x_user_id)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        email = payload.email.strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email cannot be empty")
        if "@" not in email:
            raise HTTPException(status_code=400, detail="Email must contain '@'")
        exists = (
            db.query(User.id)
            .filter(func.lower(User.email) == email.lower(), User.id != user_id)
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="Email already exists")
        user.email = email

    if payload.username is not None:
        username = payload.username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        exists = (
            db.query(User.id)
            .filter(func.lower(User.username) == username.lower(), User.id != user_id)
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = username

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None

    if payload.role is not None:
        user.role = UserRole(payload.role)

    if payload.is_active is not None:
        if user_id == _require_admin(db, x_user_id) and payload.is_active is False:
            raise HTTPException(status_code=403, detail="Admin cannot disable self")
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return AdminUserOut.from_orm(user)


@router.post("/{user_id}/reset-password", response_model=AdminPasswordResetOut)
def reset_password(
    user_id: int,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    _require_admin(db, x_user_id)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = _generate_password()
    user.password_hash = _hash_password(temp_password)
    db.commit()

    return AdminPasswordResetOut(user_id=user_id, temp_password=temp_password)
