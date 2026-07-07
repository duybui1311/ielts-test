"""Minimal object-graph builders for service-level tests.

The grading models have a deep chain of required foreign keys
(User -> Class/Case -> Exam -> Station -> Question, plus
ExamAttempt -> StationAttempt -> Answer). These helpers build just enough of
that graph, flushing as they go so primary keys are populated and callers can
wire rows together. They never commit — the test (or the code under test) owns
the transaction.
"""
from backend.service import models


def make_user(db, role=models.UserRole.student, **kw):
    user = models.User(role=role, is_active=True, **kw)
    db.add(user)
    db.flush()
    return user


def make_exam(db, owner):
    klass = models.Class(name="Class A", owner_id=owner.id)
    db.add(klass)
    db.flush()
    exam = models.Exam(
        class_id=klass.id,
        name="Mock Exam",
        exam_type=models.ExamType.exam,
        difficulty=models.DifficultyLevel.medium,
        total_stations=1,
        time_limit_min=60,
        access_code_hash="x",
        created_by=owner.id,
    )
    db.add(exam)
    db.flush()
    return exam


def make_station(db, exam, owner, skill="reading", position=1):
    case = models.Case(title="Passage", body_md="Body", created_by=owner.id)
    db.add(case)
    db.flush()
    station = models.Station(
        exam_id=exam.id, position=position, case_id=case.id, skill=skill
    )
    db.add(station)
    db.flush()
    return station


def make_question(db, station, qtype, display_order=1, **kw):
    q = models.Question(
        station_id=station.id,
        qtype=qtype,
        prompt="Question?",
        display_order=display_order,
        **kw,
    )
    db.add(q)
    db.flush()
    return q


def make_attempt(db, exam, user):
    ea = models.ExamAttempt(exam_id=exam.id, user_id=user.id)
    db.add(ea)
    db.flush()
    return ea


def make_station_attempt(db, exam_attempt, station):
    sa = models.StationAttempt(
        exam_attempt_id=exam_attempt.id, station_id=station.id
    )
    db.add(sa)
    db.flush()
    return sa


def make_answer(db, station_attempt, question, choice_index=None, value_text=None):
    a = models.Answer(
        station_attempt_id=station_attempt.id,
        question_id=question.id,
        choice_index=choice_index,
        value_text=value_text,
    )
    db.add(a)
    db.flush()
    return a
