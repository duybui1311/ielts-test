"""Seed the database with demo data so every page is populated out of the box.

Run from the repo root:

    python -m backend.seed

Idempotent: if the demo accounts already exist it does nothing. Creates a demo
teacher and student, a class, one IELTS exam (reading + listening), a couple of
flashcard decks, and one fully graded student attempt (so the dashboard,
analytics and history have real numbers).
"""
from datetime import datetime, timedelta

import bcrypt

from backend.service.database import Base, engine, SessionLocal
from backend.service import models
from backend.service.autograde import autograde_exam_attempt

TEACHER_EMAIL = "teacher@demo.io"
STUDENT_EMAIL = "student@demo.io"
PASSWORD = "demo1234"


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _user(db, *, email, username, name, role):
    u = db.query(models.User).filter(models.User.email == email).first()
    if u:
        return u
    u = models.User(
        email=email,
        username=username,
        full_name=name,
        role=role,
        password_hash=_hash(PASSWORD),
        is_active=True,
    )
    db.add(u)
    db.flush()
    return u


# ── Exam content ────────────────────────────────────────────────────────────
READING_PASSAGE = """The History of Tea

Tea is one of the most widely consumed beverages in the world, second only to
water. According to legend, tea was first discovered by the Chinese Emperor Shen
Nong in 2737 BCE when leaves from a wild tree blew into his pot of boiling water.
For centuries tea remained a Chinese secret, prized both as a medicine and as a
refreshing drink. It was not until the 9th century that a Japanese monk carried
tea seeds home, and only in the 17th century did Dutch traders bring tea to
Europe, where it quickly became a fashionable luxury.
"""

LISTENING_NOTE = """Booking a Hotel Room (transcript summary)

A traveller calls the Riverside Hotel to reserve a room. The receptionist
confirms a double room is available for three nights at a rate of ninety pounds
per night, including breakfast. The guest provides a credit card to hold the
booking and is given the confirmation number RH4821.
"""


def _question(station_id, qtype, prompt, *, options=None, correct_index=None,
              accept_answers=None, sub_skill=None, order=1):
    return models.Question(
        station_id=station_id,
        qtype=models.QuestionType(qtype),
        prompt=prompt,
        options_json=options,
        correct_index=correct_index,
        accept_answers=accept_answers,
        sub_skill=sub_skill,
        display_order=order,
    )


def _build_exam(db, *, class_id, teacher_id):
    code_hash = _hash("1234")
    exam = models.Exam(
        class_id=class_id,
        name="IELTS Practice Test 1",
        exam_type=models.ExamType.practice,
        difficulty=models.DifficultyLevel.medium,
        total_stations=2,
        time_limit_min=40,
        reading_min=0,
        access_code_hash=code_hash,
        description="A short demo test: one Reading section and one Listening section.",
        created_by=teacher_id,
    )
    db.add(exam)
    db.flush()

    # Reading section
    reading_case = models.Case(title="Reading: The History of Tea",
                               body_md=READING_PASSAGE, created_by=teacher_id)
    db.add(reading_case)
    db.flush()
    reading = models.Station(exam_id=exam.id, position=1, case_id=reading_case.id, skill="reading")
    db.add(reading)
    db.flush()
    db.add_all([
        _question(reading.id, "mcq", "Who is said to have discovered tea?",
                  options=["A Japanese monk", "Emperor Shen Nong", "Dutch traders", "A European merchant"],
                  correct_index=1, sub_skill="multiple_choice", order=1),
        _question(reading.id, "mcq", "When did tea arrive in Europe?",
                  options=["9th century", "2737 BCE", "17th century", "21st century"],
                  correct_index=2, sub_skill="multiple_choice", order=2),
        _question(reading.id, "short", "Tea is the second most consumed drink after ____.",
                  accept_answers=["water"], sub_skill="sentence_completion", order=3),
        _question(reading.id, "short", "Which country first kept tea a secret?",
                  accept_answers=["china"], sub_skill="gap_fill", order=4),
    ])

    # Listening section
    listening_case = models.Case(title="Listening: Booking a Hotel Room",
                                 body_md=LISTENING_NOTE, created_by=teacher_id)
    db.add(listening_case)
    db.flush()
    listening = models.Station(exam_id=exam.id, position=2, case_id=listening_case.id, skill="listening")
    db.add(listening)
    db.flush()
    db.add_all([
        _question(listening.id, "mcq", "How many nights does the guest book?",
                  options=["One", "Two", "Three", "Four"],
                  correct_index=2, sub_skill="multiple_choice", order=1),
        _question(listening.id, "mcq", "What is included in the room rate?",
                  options=["Dinner", "Breakfast", "Parking", "Nothing"],
                  correct_index=1, sub_skill="multiple_choice", order=2),
        _question(listening.id, "short", "What is the nightly rate in pounds?",
                  accept_answers=["90", "ninety"], sub_skill="gap_fill", order=3),
        _question(listening.id, "short", "What is the booking confirmation number?",
                  accept_answers=["RH4821"], sub_skill="sentence_completion", order=4),
    ])

    db.flush()
    return exam


def _attempt(db, *, exam, student_id):
    """Create a graded attempt: mostly correct, a couple wrong (for analytics)."""
    ea = models.ExamAttempt(
        exam_id=exam.id, user_id=student_id,
        status=models.AttemptStatus.draft,
        started_at=datetime.utcnow() - timedelta(days=2),
    )
    db.add(ea)
    db.flush()

    # Deliberately wrong answers to populate mistake-pattern analytics.
    wrong = {("reading", 2), ("listening", 4)}  # (skill, display_order)

    for station in sorted(exam.stations, key=lambda s: s.position):
        sa = models.StationAttempt(
            exam_attempt_id=ea.id, station_id=station.id,
            status=models.AttemptStatus.draft,
        )
        db.add(sa)
        db.flush()
        for q in station.questions:
            be_wrong = (station.skill, q.display_order) in wrong
            if q.qtype == models.QuestionType.mcq:
                if be_wrong:
                    idx = 0 if q.correct_index != 0 else 1
                else:
                    idx = q.correct_index
                db.add(models.Answer(station_attempt_id=sa.id, question_id=q.id, choice_index=idx))
            else:  # short
                val = "definitely wrong" if be_wrong else (q.accept_answers or [""])[0]
                db.add(models.Answer(station_attempt_id=sa.id, question_id=q.id, value_text=val))

    ea.status = models.AttemptStatus.submitted
    ea.submitted_at = datetime.utcnow() - timedelta(days=2)
    for sa in ea.station_attempts:
        sa.status = models.AttemptStatus.submitted
        sa.submitted_at = ea.submitted_at
    db.commit()

    autograde_exam_attempt(db, ea.id)
    return ea


def _flashcards(db, *, owner_id):
    decks = {
        "IELTS Academic Vocabulary": [
            ("ubiquitous", "present, appearing, or found everywhere"),
            ("mitigate", "to make something less severe or serious"),
            ("paramount", "more important than anything else; supreme"),
            ("scrutinise", "to examine or inspect closely and thoroughly"),
        ],
        "Common Collocations": [
            ("make a decision", "to decide (not 'do a decision')"),
            ("heavy rain", "a lot of rain (not 'strong rain')"),
            ("take responsibility", "to accept that you are accountable"),
        ],
    }
    for name, cards in decks.items():
        deck = models.FlashcardDeck(owner_id=owner_id, name=name)
        db.add(deck)
        db.flush()
        for front, back in cards:
            db.add(models.Flashcard(deck_id=deck.id, front=front, back=back))
    db.flush()


def _practice_tasks(db, *, owner_id):
    """Starter Writing + Speaking tasks (idempotent — only seeds once)."""
    if db.query(models.WritingTask).first() or db.query(models.SpeakingTask).first():
        return
    db.add_all([
        models.WritingTask(
            task_type="task1", created_by=owner_id, time_limit_min=20,
            title="Task 1 — Bar chart: coffee consumption",
            prompt_md=("The chart below shows coffee consumption per person in four "
                       "countries in 2010 and 2020. Summarise the information by "
                       "selecting and reporting the main features, and make comparisons "
                       "where relevant. Write at least 150 words."),
        ),
        models.WritingTask(
            task_type="task2", created_by=owner_id, time_limit_min=40,
            title="Task 2 — Technology and communication",
            prompt_md=("Some people think that technology has made face-to-face "
                       "communication less common and weakened relationships. To what "
                       "extent do you agree or disagree? Give reasons and examples. "
                       "Write at least 250 words."),
        ),
    ])
    db.add_all([
        models.SpeakingTask(part=1, created_by=owner_id, prep_sec=0, answer_sec=90,
                            title="Part 1 — Hometown",
                            prompt_md="Where is your hometown? What do you like most about it, and would you like to live there in the future?"),
        models.SpeakingTask(part=2, created_by=owner_id, prep_sec=60, answer_sec=120,
                            title="Part 2 — Describe a memorable journey",
                            prompt_md=("Describe a journey that you remember well. You should say: where you went, "
                                       "who you were with, what happened, and explain why it was memorable.")),
        models.SpeakingTask(part=3, created_by=owner_id, prep_sec=0, answer_sec=120,
                            title="Part 3 — Travel and tourism",
                            prompt_md="How has tourism changed in your country over the last few decades? What are the benefits and drawbacks of international travel?"),
    ])
    db.commit()


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing_teacher = db.query(models.User).filter(models.User.email == TEACHER_EMAIL).first()
        if existing_teacher:
            _practice_tasks(db, owner_id=existing_teacher.id)
            print("Demo data already present — ensured practice tasks.")
            print(f"  Teacher: {TEACHER_EMAIL} / {PASSWORD}")
            print(f"  Student: {STUDENT_EMAIL} / {PASSWORD}")
            return

        teacher = _user(db, email=TEACHER_EMAIL, username="demo_teacher",
                        name="Dana Teacher", role=models.UserRole.teacher)
        student = _user(db, email=STUDENT_EMAIL, username="demo_student",
                        name="Sam Student", role=models.UserRole.student)

        klass = models.Class(name="Demo Class 2026", owner_id=teacher.id)
        db.add(klass)
        db.flush()
        db.add(models.ClassEnrolment(class_id=klass.id, user_id=student.id))

        exam = _build_exam(db, class_id=klass.id, teacher_id=teacher.id)
        db.commit()

        _attempt(db, exam=exam, student_id=student.id)
        _flashcards(db, owner_id=student.id)
        _practice_tasks(db, owner_id=teacher.id)
        db.commit()

        print("Seed complete.")
        print(f"  Teacher: {TEACHER_EMAIL} / {PASSWORD}")
        print(f"  Student: {STUDENT_EMAIL} / {PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
