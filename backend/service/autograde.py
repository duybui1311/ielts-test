import math
from datetime import datetime, timezone
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


def _multi_select_ok(answer, question) -> bool:
    """Grade a multi_select question: the student's picked option indices
    (stored as a JSON array in value_text) must equal the correct set."""
    import json
    try:
        picked = json.loads(answer.value_text or "[]")
    except (ValueError, TypeError):
        return False
    if not isinstance(picked, list):
        return False
    try:
        picked_set = {int(i) for i in picked}
    except (ValueError, TypeError):
        return False
    correct = {int(i) for i in (question.correct_indices or [])}
    return bool(correct) and picked_set == correct


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
        if q.qtype.value == "mcq" and q.qformat == "multi_select":
            ok = _multi_select_ok(a, q)
        elif q.qtype.value == "mcq":
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


# Skills the platform auto-grades into a numeric band. Writing/Speaking are NOT
# here — they are graded separately (AI draft + teacher review) and stored on
# WritingSubmission/SpeakingSubmission, not on StationAttempt.band.
AUTO_GRADED_SKILLS = ("listening", "reading")


def autograde_exam_attempt(db: Session, exam_attempt_id: int):
    """Auto-grade every station of an attempt and set the overall band.

    `overall_band` is the mean of the AUTO-GRADED skills only — i.e. the
    Reading and Listening stations. Writing and Speaking are graded elsewhere
    (AI grading + teacher review, persisted on WritingSubmission /
    SpeakingSubmission), so they never contribute to this average. An exam with
    no reading/listening station leaves `overall_band` as None.

    The mean is rounded the way IELTS rounds: halves go UP to the next half band
    (6.25 -> 6.5, 6.75 -> 7.0). Python's built-in round() uses banker's rounding
    (half-to-even) and would wrongly send 6.25 -> 6.0, so we don't use it.
    """
    ea = db.query(ExamAttempt).filter(ExamAttempt.id == exam_attempt_id).first()
    if not ea:
        return None
    sas = db.query(StationAttempt).filter(
        StationAttempt.exam_attempt_id == exam_attempt_id
    ).all()
    bands = []
    for sa in sas:
        autograde_station_attempt(db, sa.id)
        # Only Reading/Listening stations contribute to the overall band. Check
        # the station skill explicitly (not just `band is not None`) so a future
        # writing station that accidentally sets band=0 can't pollute the mean.
        station = db.query(Station).filter(Station.id == sa.station_id).first()
        skill = station.skill if station else None
        if skill in AUTO_GRADED_SKILLS and sa.band is not None:
            bands.append(sa.band)
    if bands:
        mean = sum(bands) / len(bands)
        ea.overall_band = math.floor(mean * 2 + 0.5) / 2   # nearest 0.5, halves up
    ea.status = AttemptStatus.graded
    ea.graded_at = datetime.now(timezone.utc)
    db.commit()
    return ea
