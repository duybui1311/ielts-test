"""Seed the database with demo data so every page is populated out of the box.

Run from the repo root:

    python -m backend.seed            # seed only if no demo content exists
    python -m backend.seed --reset    # DELETE all tests/attempts/content (users
                                      # are kept) and seed the fresh demo data

Creates a demo teacher and student, a class, one IELTS exam that shows off every
native question format (TFNG buttons, matching dropdown, choose-two checkboxes,
inline gap-fill), flashcard decks, and one fully graded student attempt (so the
dashboard, analytics and history have real numbers).
"""
import sys
from datetime import datetime, timedelta, timezone

import bcrypt

from backend.service.database import Base, engine, SessionLocal
from backend.service import models
from backend.service.autograde import autograde_exam_attempt

TEACHER_EMAIL = "teacher@demo.io"
STUDENT_EMAIL = "student@demo.io"
ADMIN_EMAIL = "admin@demo.io"
PASSWORD = "demo1234"
ADMIN_PASSWORD = "admin1234"


def ensure_admin(db):
    """Create the site admin account if it doesn't exist (idempotent)."""
    admin = db.query(models.User).filter(models.User.email == ADMIN_EMAIL).first()
    if not admin:
        admin = models.User(
            email=ADMIN_EMAIL, username="admin", full_name="Site Admin",
            role=models.UserRole.admin, password_hash=_hash(ADMIN_PASSWORD),
            is_active=True,
        )
        db.add(admin)
        db.commit()
    return admin


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
READING_PASSAGE = """Why Cities Are Planting More Trees

Paragraph A. City councils around the world are planting trees at record rates,
and the reasons are practical as much as environmental. Leafy streets stay
noticeably cooler in hot weather: measurements in Melbourne, which runs one of
the world's best-known urban forest programmes, show that shaded streets can be
up to four degrees cooler in summer than bare ones. Trees also clean the air,
trapping dust and absorbing polluting gases through their leaves.

Paragraph B. The benefits are not only physical. Researchers have found that
people who live on greener streets report lower stress and are more likely to
know their neighbours. Shops on tree-lined high streets even report more
customers, because people walk more slowly and stay longer in the shade.

Paragraph C. Planting is not free, of course. A mature street tree costs
hundreds of pounds a year to water, prune and insure, and roots can damage
pavements if the wrong species is chosen. Yet most economists who have studied
urban forests conclude that the savings on air conditioning, healthcare and
drainage comfortably outweigh the costs.

List of Headings
i. The hidden price of street trees
ii. How trees change people's behaviour
iii. Cooler streets, cleaner air
"""

LISTENING_NOTE = """Joining the City Gym (transcript summary)

A student calls City Gym to ask about joining. The receptionist explains that a
monthly membership costs twenty-five pounds and that the gym opens at six in
the morning on weekdays. New members pay five pounds for their membership card
and must bring one photo. The beginners' class on Tuesday evenings is taught by
an instructor called Karen.
"""


def _question(station_id, qtype, prompt, *, options=None, correct_index=None,
              accept_answers=None, sub_skill=None, order=1, qformat=None,
              correct_indices=None, select_count=None):
    return models.Question(
        station_id=station_id,
        qtype=models.QuestionType(qtype),
        prompt=prompt,
        options_json=options,
        correct_index=correct_index,
        accept_answers=accept_answers,
        sub_skill=sub_skill,
        display_order=order,
        qformat=qformat,
        correct_indices=correct_indices,
        select_count=select_count,
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

    # Reading section — one question of every native IELTS format.
    reading_case = models.Case(title="Reading: Why Cities Are Planting More Trees",
                               body_md=READING_PASSAGE, created_by=teacher_id)
    db.add(reading_case)
    db.flush()
    reading = models.Station(exam_id=exam.id, position=1, case_id=reading_case.id, skill="reading")
    db.add(reading)
    db.flush()
    db.add_all([
        _question(reading.id, "mcq", "Which city is named for its urban forest programme?",
                  options=["London", "Melbourne", "Paris", "Tokyo"],
                  correct_index=1, sub_skill="multiple_choice", order=1),
        _question(reading.id, "mcq", "Shaded streets can be up to four degrees cooler in summer.",
                  options=["TRUE", "FALSE", "NOT GIVEN"], correct_index=0,
                  qformat="tfng", sub_skill="true_false_notgiven", order=2),
        _question(reading.id, "mcq", "The passage says street trees reduce crime.",
                  options=["TRUE", "FALSE", "NOT GIVEN"], correct_index=2,
                  qformat="tfng", sub_skill="true_false_notgiven", order=3),
        _question(reading.id, "mcq", "Choose the heading that best matches Paragraph B.",
                  options=["i. The hidden price of street trees",
                           "ii. How trees change people's behaviour",
                           "iii. Cooler streets, cleaner air"],
                  correct_index=1, qformat="matching", sub_skill="matching_headings", order=4),
        _question(reading.id, "mcq", "Which TWO physical benefits of street trees are mentioned in Paragraph A?",
                  options=["Cooler streets", "Cheaper housing", "Cleaner air",
                           "Quieter roads", "More parking"],
                  correct_index=0, correct_indices=[0, 2], select_count=2,
                  qformat="multi_select", sub_skill="multiple_choice", order=5),
        _question(reading.id, "short", "A mature street tree costs ________ of pounds a year to maintain.",
                  accept_answers=["hundreds"], qformat="gap_fill",
                  sub_skill="sentence_completion", order=6),
        _question(reading.id, "short", "Who concludes that the savings outweigh the costs? (ONE WORD)",
                  accept_answers=["economists"], sub_skill="short_answer", order=7),
    ])

    # Listening section
    listening_case = models.Case(title="Listening: Joining the City Gym",
                                 body_md=LISTENING_NOTE, created_by=teacher_id)
    db.add(listening_case)
    db.flush()
    listening = models.Station(exam_id=exam.id, position=2, case_id=listening_case.id, skill="listening")
    db.add(listening)
    db.flush()
    db.add_all([
        _question(listening.id, "mcq", "How much does a monthly membership cost?",
                  options=["£20", "£25", "£30", "£35"],
                  correct_index=1, sub_skill="multiple_choice", order=1),
        _question(listening.id, "short", "On weekdays the gym opens at ________ in the morning.",
                  accept_answers=["six", "6", "6 am", "six am"], qformat="gap_fill",
                  sub_skill="sentence_completion", order=2),
        _question(listening.id, "short", "The membership card costs ________ pounds.",
                  accept_answers=["five", "5"], qformat="gap_fill",
                  sub_skill="gap_fill", order=3),
        _question(listening.id, "short", "What is the name of the Tuesday-class instructor?",
                  accept_answers=["karen"], sub_skill="short_answer", order=4),
    ])

    db.flush()
    return exam


def _attempt(db, *, exam, student_id):
    """Create a graded attempt: mostly correct, a couple wrong (for analytics)."""
    ea = models.ExamAttempt(
        exam_id=exam.id, user_id=student_id,
        status=models.AttemptStatus.draft,
        started_at=datetime.now(timezone.utc) - timedelta(days=2),
    )
    db.add(ea)
    db.flush()

    # Deliberately wrong answers to populate mistake-pattern analytics.
    wrong = {("reading", 3), ("reading", 5), ("listening", 4)}  # (skill, display_order)

    import json as _json
    for station in sorted(exam.stations, key=lambda s: s.position):
        sa = models.StationAttempt(
            exam_attempt_id=ea.id, station_id=station.id,
            status=models.AttemptStatus.draft,
        )
        db.add(sa)
        db.flush()
        for q in station.questions:
            be_wrong = (station.skill, q.display_order) in wrong
            if q.qformat == "multi_select":
                picked = [0, 1] if be_wrong else list(q.correct_indices or [])
                db.add(models.Answer(station_attempt_id=sa.id, question_id=q.id,
                                     value_text=_json.dumps(picked)))
            elif q.qtype == models.QuestionType.mcq:
                if be_wrong:
                    idx = 0 if q.correct_index != 0 else 1
                else:
                    idx = q.correct_index
                db.add(models.Answer(station_attempt_id=sa.id, question_id=q.id, choice_index=idx))
            else:  # short
                val = "definitely wrong" if be_wrong else (q.accept_answers or [""])[0]
                db.add(models.Answer(station_attempt_id=sa.id, question_id=q.id, value_text=val))

    ea.status = models.AttemptStatus.submitted
    ea.submitted_at = datetime.now(timezone.utc) - timedelta(days=2)
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


def reset_content(db):
    """Delete every test, attempt, submission and piece of learning data —
    user accounts are kept. Child tables first (no ON DELETE CASCADE)."""
    for model in (
        models.ErrorTag, models.Answer, models.StationAttempt, models.ExamAttempt,
        models.ReviewHistory, models.ReviewQueue, models.ExplanationReport,
        models.ExamAccessLog, models.Feedback,
        models.Question, models.Station, models.Exam, models.Case,
        models.WritingComment, models.WritingSubmission, models.SpeakingSubmission,
        models.WritingTask, models.SpeakingTask,
        models.PracticeSession,
        models.FlashcardReview, models.Flashcard, models.FlashcardDeck,
        models.ClassEnrolment, models.Class,
    ):
        db.query(model).delete(synchronize_session=False)
    db.commit()
    print("All old tests, attempts and content removed (user accounts kept).")


def main(reset: bool = False):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_admin(db)
        if reset:
            reset_content(db)
        existing_teacher = db.query(models.User).filter(models.User.email == TEACHER_EMAIL).first()
        if existing_teacher and not reset and db.query(models.Exam).first():
            _practice_tasks(db, owner_id=existing_teacher.id)
            print("Demo data already present — ensured practice tasks. (Use --reset to replace it.)")
            print(f"  Admin:   {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
            print(f"  Teacher: {TEACHER_EMAIL} / {PASSWORD}")
            print(f"  Student: {STUDENT_EMAIL} / {PASSWORD}")
            return

        teacher = _user(db, email=TEACHER_EMAIL, username="demo_teacher",
                        name="Dana Teacher", role=models.UserRole.teacher)
        student = _user(db, email=STUDENT_EMAIL, username="demo_student",
                        name="Sam Student", role=models.UserRole.student)

        klass = models.Class(name="Demo Class 2026", owner_id=teacher.id, join_code="DEMO26")
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
        print(f"  Admin:   {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"  Teacher: {TEACHER_EMAIL} / {PASSWORD}")
        print(f"  Student: {STUDENT_EMAIL} / {PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
