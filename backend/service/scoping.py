"""Class-based data isolation helpers.

Students only see content from classes they're enrolled in; teachers only see
students from classes they own. Admins see everything.
"""
import secrets

from sqlalchemy.orm import Session

from backend.service import models


def new_join_code() -> str:
    """Short, shareable, unambiguous class code, e.g. '9F3A1C'."""
    return secrets.token_hex(3).upper()


def enrolled_class_ids(db: Session, user_id: int) -> list[int]:
    rows = (
        db.query(models.ClassEnrolment.class_id)
        .filter(models.ClassEnrolment.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def owned_class_ids(db: Session, teacher_id: int) -> list[int]:
    rows = db.query(models.Class.id).filter(models.Class.owner_id == teacher_id).all()
    return [r[0] for r in rows]


def visible_student_ids(db: Session, user: models.User) -> list[int] | None:
    """Student ids a teacher may see (enrolled in a class they own).
    Returns None for admins — meaning 'no restriction'."""
    if user.role == models.UserRole.admin:
        return None
    class_ids = owned_class_ids(db, user.id)
    if not class_ids:
        return []
    rows = (
        db.query(models.ClassEnrolment.user_id)
        .filter(models.ClassEnrolment.class_id.in_(class_ids))
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


def is_student(user: models.User) -> bool:
    return user.role == models.UserRole.student
