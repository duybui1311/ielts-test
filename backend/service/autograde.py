from datetime import datetime
from sqlalchemy.orm import Session
from backend.service.models import (
    StationAttempt,
    Station,
    Question,
    Answer,
    ErrorTag,
    ExamAttempt,
    AttemptStatus,
)
from backend.service.review_sched import enqueue_wrong

# Approximate raw(/40) -> band. EDITABLE — official tables vary per test.
LISTENING = [(39, 9.0), (37, 8.5), (35, 8.0), (32, 7.5), (30, 7.0), (26, 6.5),
             (23, 6.0), (18, 5.5), (16, 5.0), (13, 4.5), (10, 4.0), (6, 3.5)]
READING = [(39, 9.0), (37, 8.5), (35, 8.0), (33, 7.5), (30, 7.0), (27, 6.5),
           (23, 6.0), (19, 5.5), (15, 5.0), (13, 4.5), (10, 4.0), (6, 3.5)]


def raw_to_band(raw: int, total: int, skill: str) -> float:
    scaled = round(raw / total * 40) if total else 0
    table = LISTENING if skill == "listening" else READING
    for threshold, band in table:
        if scaled >= threshold:
            return band
    return 2.5


def _norm(t):
    return " ".join((t or "").strip().lower().split())


def autograde_station_attempt(db: Session, station_attempt_id: int):
    sa = db.query(StationAttempt).filter(StationAttempt.id == station_attempt_id).first()
    if not sa:
        return None
    station = db.query(Station).filter(Station.id == sa.station_id).first()
    questions = {
        q.id: q
        for q in db.query(Question).filter(Question.station_id == sa.station_id).all()
    }
    answers = db.query(Answer).filter(Answer.station_attempt_id == station_attempt_id).all()

    db.query(ErrorTag).filter(
        ErrorTag.station_attempt_id == station_attempt_id
    ).delete(synchronize_session=False)

    correct = 0
    autogradable = [q for q in questions.values() if q.qtype.value in ("mcq", "short")]
    for a in answers:
        q = questions.get(a.question_id)
        if not q or q.qtype.value == "explain":   # writing -> AI later
            continue
        if q.qtype.value == "mcq":
            ok = a.choice_index is not None and a.choice_index == q.correct_index
        else:  # short
            accept = {_norm(x) for x in (q.accept_answers or [])}
            ok = _norm(a.value_text) in accept
        a.is_auto_correct = bool(ok)
        a.auto_score = 1.0 if ok else 0.0
        if ok:
            correct += 1
        else:
            db.add(ErrorTag(
                station_attempt_id=sa.id,
                answer_id=a.id,
                user_id=sa.exam_attempt.user_id,
                exam_id=sa.exam_attempt.exam_id,
                station_id=sa.station_id,
                skill=station.skill if station else None,
                question_type=q.qtype.value,
                sub_skill=q.sub_skill,
            ))
            # Spaced review: resurface this missed question later.
            enqueue_wrong(db, sa.exam_attempt.user_id, q.id)

    sa.raw_score = float(correct)
    if station and station.skill in ("listening", "reading"):
        sa.band = raw_to_band(correct, len(autogradable), station.skill)
    sa.status = AttemptStatus.graded
    db.commit()
    return {"raw_score": correct, "total": len(autogradable), "band": sa.band}


def autograde_exam_attempt(db: Session, exam_attempt_id: int):
    ea = db.query(ExamAttempt).filter(ExamAttempt.id == exam_attempt_id).first()
    if not ea:
        return None
    sas = db.query(StationAttempt).filter(
        StationAttempt.exam_attempt_id == exam_attempt_id
    ).all()
    bands = []
    for sa in sas:
        autograde_station_attempt(db, sa.id)
        if sa.band is not None:
            bands.append(sa.band)
    if bands:
        ea.overall_band = round((sum(bands) / len(bands)) * 2) / 2   # nearest 0.5
    ea.status = AttemptStatus.graded
    ea.graded_at = datetime.utcnow()
    db.commit()
    return ea
