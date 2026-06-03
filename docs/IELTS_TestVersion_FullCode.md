# IELTS Platform — Complete Test-Version Code (Supabase Postgres)

Replace/create each file below with the exact contents shown. After this, the app boots with: `auth`, `tests` (import/export), `autograde`, `analytics`, and `/api/health`. The other OSCE routers (`grading`, `marking`, `stt`, `circuits`, `create_exam`, `dashboard`, `attempts`) are left in the repo but **not imported**, so they can't cause errors. You can delete them later or adapt them.

## File map
```
backend/requirements.txt          (replace)
backend/main.py                   (replace)
backend/service/config.py         (replace)
backend/service/database.py       (replace)
backend/service/models.py         (replace)
backend/service/autograde.py      (new)
backend/routers/auth.py           (replace)
backend/routers/tests_io.py       (new)
backend/routers/autograde.py      (new)
backend/routers/analytics.py      (new)
frontend/src/pages/Weakness.js    (new, optional)
```

---

## `backend/requirements.txt`
```
fastapi
uvicorn[standard]
sqlalchemy
pydantic
python-dotenv
bcrypt
psycopg2-binary
```

---

## `backend/service/config.py`
```python
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self):
        url = os.getenv("DATABASE_URL", "")
        # SQLAlchemy needs the +psycopg2 driver tag on the scheme.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg2://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and "+psycopg2" not in url:
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        self.DATABASE_URL = url

        self.API_HOST = os.getenv("API_HOST", "0.0.0.0")
        self.API_PORT = int(os.getenv("API_PORT", "8000"))
        self.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


settings = Settings()
```

---

## `backend/service/database.py`
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

# Use with the Supabase SESSION pooler (port 5432) or the direct connection.
engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)

# If you use the TRANSACTION pooler (port 6543), comment out the engine above
# and use this one instead:
# from sqlalchemy.pool import NullPool
# engine = create_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool, future=True)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## `backend/service/models.py`
```python
from __future__ import annotations
from datetime import datetime
from typing import Optional, List
import enum
from sqlalchemy import (
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Enum,
    Float,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .database import Base

# -------------------- ENUM TYPES --------------------

class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    admin = "admin"

class ExamType(str, enum.Enum):
    practice = "practice"
    exam = "exam"

class DifficultyLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"

class QuestionType(str, enum.Enum):
    mcq = "mcq"
    short = "short"
    explain = "explain"

class AttemptStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    graded = "graded"

class ChatSide(str, enum.Enum):
    user = "user"
    ai = "ai"

class VirtualPatientRole(str, enum.Enum):
    student = "student"
    patient = "patient"

# -------------------- CORE ENTITIES --------------------

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.student
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    classes: Mapped[List["Class"]] = relationship("Class", back_populates="owner")
    enrolments: Mapped[List["ClassEnrolment"]] = relationship(
        "ClassEnrolment", back_populates="user", cascade="all, delete-orphan"
    )
    cases: Mapped[List["Case"]] = relationship("Case", back_populates="author")
    exams: Mapped[List["Exam"]] = relationship("Exam", back_populates="author")
    exam_attempts: Mapped[List["ExamAttempt"]] = relationship(
        "ExamAttempt", back_populates="candidate"
    )
    feedback_given: Mapped[List["Feedback"]] = relationship(
        "Feedback", back_populates="teacher"
    )
    access_logs: Mapped[List["ExamAccessLog"]] = relationship(
        "ExamAccessLog", back_populates="user"
    )
    flashcard_decks: Mapped[List["FlashcardDeck"]] = relationship(
        "FlashcardDeck", back_populates="owner"
    )
    flashcard_reviews: Mapped[List["FlashcardReview"]] = relationship(
        "FlashcardReview", back_populates="user"
    )

class Class(Base):
    __tablename__ = "classes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    owner: Mapped["User"] = relationship("User", back_populates="classes")
    enrolments: Mapped[List["ClassEnrolment"]] = relationship(
        "ClassEnrolment", back_populates="klass", cascade="all, delete-orphan"
    )
    exams: Mapped[List["Exam"]] = relationship("Exam", back_populates="klass")

class ClassEnrolment(Base):
    __tablename__ = "class_enrolments"
    __table_args__ = (
        UniqueConstraint("class_id", "user_id", name="uq_class_user"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    klass: Mapped["Class"] = relationship("Class", back_populates="enrolments")
    user: Mapped["User"] = relationship("User", back_populates="enrolments")

class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    author: Mapped["User"] = relationship("User", back_populates="cases")
    stations: Mapped[List["Station"]] = relationship("Station", back_populates="case")

class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    exam_type: Mapped[ExamType] = mapped_column(Enum(ExamType), nullable=False)
    difficulty: Mapped[DifficultyLevel] = mapped_column(
        Enum(DifficultyLevel), nullable=False
    )
    total_stations: Mapped[int] = mapped_column(Integer, nullable=False)
    time_limit_min: Mapped[int] = mapped_column(Integer, nullable=False)
    reading_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    access_code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    start_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    klass: Mapped["Class"] = relationship("Class", back_populates="exams")
    author: Mapped["User"] = relationship("User", back_populates="exams")
    stations: Mapped[List["Station"]] = relationship(
        "Station",
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="Station.position",
    )
    exam_attempts: Mapped[List["ExamAttempt"]] = relationship(
        "ExamAttempt", back_populates="exam"
    )
    access_logs: Mapped[List["ExamAccessLog"]] = relationship(
        "ExamAccessLog", back_populates="exam"
    )

class Station(Base):
    __tablename__ = "stations"
    __table_args__ = (
        UniqueConstraint("exam_id", "position", name="uq_station_order"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), nullable=False)
    # IELTS additions:
    skill: Mapped[Optional[str]] = mapped_column(String(20))        # listening|reading|writing|speaking
    audio_url: Mapped[Optional[str]] = mapped_column(String(500))   # Listening audio (Supabase Storage URL)
    exam: Mapped["Exam"] = relationship("Exam", back_populates="stations")
    case: Mapped["Case"] = relationship("Case", back_populates="stations")
    questions: Mapped[List["Question"]] = relationship(
        "Question",
        back_populates="station",
        cascade="all, delete-orphan",
        order_by="Question.display_order",
    )
    rubrics: Mapped[List["Rubric"]] = relationship(
        "Rubric", back_populates="station", cascade="all, delete-orphan"
    )
    station_attempts: Mapped[List["StationAttempt"]] = relationship(
        "StationAttempt", back_populates="station"
    )

class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), nullable=False)
    qtype: Mapped[QuestionType] = mapped_column(Enum(QuestionType), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    options_json: Mapped[Optional[list]] = mapped_column(JSON)
    correct_index: Mapped[Optional[int]] = mapped_column(Integer)
    reference_text: Mapped[Optional[str]] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # IELTS additions:
    sub_skill: Mapped[Optional[str]] = mapped_column(String(50))    # e.g. matching_headings, gap_fill
    accept_answers: Mapped[Optional[list]] = mapped_column(JSON)    # accepted strings for `short` answers
    station: Mapped["Station"] = relationship("Station", back_populates="questions")
    answers: Mapped[List["Answer"]] = relationship("Answer", back_populates="question")

# -------------------- ATTEMPTS & ANSWERS --------------------

class ExamAttempt(Base):
    __tablename__ = "exam_attempts"
    __table_args__ = (
        UniqueConstraint("exam_id", "user_id", name="uq_exam_user"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus), nullable=False, default=AttemptStatus.draft
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    graded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    total_score: Mapped[Optional[float]] = mapped_column(Float)
    overall_band: Mapped[Optional[float]] = mapped_column(Float)   # IELTS addition
    exam: Mapped["Exam"] = relationship("Exam", back_populates="exam_attempts")
    candidate: Mapped["User"] = relationship("User", back_populates="exam_attempts")
    station_attempts: Mapped[List["StationAttempt"]] = relationship(
        "StationAttempt",
        back_populates="exam_attempt",
        cascade="all, delete-orphan",
    )

class StationAttempt(Base):
    __tablename__ = "station_attempts"
    __table_args__ = (
        UniqueConstraint("exam_attempt_id", "station_id", name="uq_station_attempt"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exam_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("exam_attempts.id"), nullable=False
    )
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), nullable=False)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus), nullable=False, default=AttemptStatus.draft
    )
    work_min: Mapped[Optional[int]] = mapped_column(Integer)
    reading_min: Mapped[Optional[int]] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    raw_score: Mapped[Optional[float]] = mapped_column(Float)       # IELTS addition
    band: Mapped[Optional[float]] = mapped_column(Float)           # IELTS addition
    exam_attempt: Mapped["ExamAttempt"] = relationship(
        "ExamAttempt", back_populates="station_attempts"
    )
    station: Mapped["Station"] = relationship("Station", back_populates="station_attempts")
    answers: Mapped[List["Answer"]] = relationship(
        "Answer", back_populates="station_attempt", cascade="all, delete-orphan"
    )
    messages: Mapped[List["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="station_attempt",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )
    rubric_marks: Mapped[List["RubricMark"]] = relationship(
        "RubricMark", back_populates="station_attempt", cascade="all, delete-orphan"
    )
    feedbacks: Mapped[List["Feedback"]] = relationship(
        "Feedback", back_populates="station_attempt", cascade="all, delete-orphan"
    )

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=False
    )
    side: Mapped[ChatSide] = mapped_column(Enum(ChatSide), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    station_attempt: Mapped["StationAttempt"] = relationship(
        "StationAttempt", back_populates="messages"
    )

class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("station_attempt_id", "question_id", name="uq_answer_once"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), nullable=False)
    value_text: Mapped[Optional[str]] = mapped_column(Text)
    choice_index: Mapped[Optional[int]] = mapped_column(Integer)
    is_auto_correct: Mapped[Optional[bool]] = mapped_column(Boolean)
    auto_score: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    station_attempt: Mapped["StationAttempt"] = relationship(
        "StationAttempt", back_populates="answers"
    )
    question: Mapped["Question"] = relationship("Question", back_populates="answers")

# -------------------- RUBRICS & FEEDBACK --------------------

class Rubric(Base):
    __tablename__ = "rubrics"
    __table_args__ = (
        UniqueConstraint("station_id", "rubric_key", name="uq_rubric_key"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), nullable=False)
    rubric_key: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    max_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    station: Mapped["Station"] = relationship("Station", back_populates="rubrics")
    rubric_marks: Mapped[List["RubricMark"]] = relationship(
        "RubricMark", back_populates="rubric", cascade="all, delete-orphan"
    )

class RubricMark(Base):
    __tablename__ = "rubric_marks"
    __table_args__ = (
        UniqueConstraint("station_attempt_id", "rubric_id", name="uq_rubric_once"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=False
    )
    rubric_id: Mapped[int] = mapped_column(ForeignKey("rubrics.id"), nullable=False)
    met: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    points: Mapped[Optional[int]] = mapped_column(Integer)
    station_attempt: Mapped["StationAttempt"] = relationship(
        "StationAttempt", back_populates="rubric_marks"
    )
    rubric: Mapped["Rubric"] = relationship("Rubric", back_populates="rubric_marks")

class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=False
    )
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    station_attempt: Mapped["StationAttempt"] = relationship(
        "StationAttempt", back_populates="feedbacks"
    )
    teacher: Mapped["User"] = relationship("User", back_populates="feedback_given")

class ExamAccessLog(Base):
    __tablename__ = "exam_access_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    ip: Mapped[Optional[str]] = mapped_column(String(64))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    accepted_integrity: Mapped[bool] = mapped_column(Boolean, nullable=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    exam: Mapped["Exam"] = relationship("Exam", back_populates="access_logs")
    user: Mapped["User"] = relationship("User", back_populates="access_logs")

# -------------------- FLASHCARDS --------------------

class FlashcardDeck(Base):
    __tablename__ = "flashcard_decks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    owner: Mapped["User"] = relationship("User", back_populates="flashcard_decks")
    cards: Mapped[List["Flashcard"]] = relationship(
        "Flashcard", back_populates="deck", cascade="all, delete-orphan"
    )

class Flashcard(Base):
    __tablename__ = "flashcards"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("flashcard_decks.id"), nullable=False)
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deck: Mapped["FlashcardDeck"] = relationship("FlashcardDeck", back_populates="cards")
    reviews: Mapped[List["FlashcardReview"]] = relationship(
        "FlashcardReview", back_populates="card", cascade="all, delete-orphan"
    )

class FlashcardReview(Base):
    __tablename__ = "flashcard_reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("flashcards.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    card: Mapped["Flashcard"] = relationship("Flashcard", back_populates="reviews")
    user: Mapped["User"] = relationship("User", back_populates="flashcard_reviews")

# -------------------- MISTAKE-PATTERN TAGS (IELTS) --------------------

class ErrorTag(Base):
    __tablename__ = "error_tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=False
    )
    answer_id: Mapped[int] = mapped_column(ForeignKey("answers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), nullable=False)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), nullable=False)
    skill: Mapped[Optional[str]] = mapped_column(String(20))
    question_type: Mapped[Optional[str]] = mapped_column(String(20))
    sub_skill: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

---

## `backend/service/autograde.py`
```python
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
```

---

## `backend/routers/auth.py`
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from pydantic import BaseModel
import bcrypt
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str          # accepts email OR username
    password: str


class LoginOut(BaseModel):
    user_id: int
    name: Optional[str] = None
    role: str
    token: str


def verify_password(plain: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    sh = stored_hash.strip()
    if sh.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), sh.encode("utf-8"))
        except Exception:
            return False
    return False


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> LoginOut:
    identifier = (payload.email or "").strip().lower()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username is required.",
        )
    user = (
        db.query(models.User)
        .filter(
            or_(
                func.lower(models.User.email) == identifier,
                func.lower(models.User.username) == identifier,
            )
        )
        .first()
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )
    # TEST-VERSION token only. Replace with a signed JWT before production.
    return LoginOut(
        user_id=user.id,
        name=user.full_name,
        role=user.role.value,
        token=f"test-{user.id}",
    )
```

---

## `backend/routers/tests_io.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import bcrypt
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/tests", tags=["tests"])


class QuestionIn(BaseModel):
    qtype: str                                  # mcq | short | explain
    prompt: str
    options: Optional[List[str]] = None         # for mcq
    correct_index: Optional[int] = None         # for mcq
    accept_answers: Optional[List[str]] = None  # for short
    sub_skill: Optional[str] = None
    display_order: int = 1


class SectionIn(BaseModel):
    position: int
    skill: str                                  # listening | reading | writing | speaking
    title: str
    passage_md: str = ""
    audio_url: Optional[str] = None
    questions: List[QuestionIn] = []


class TestIn(BaseModel):
    name: str
    difficulty: str = "medium"                  # low | medium | high
    time_limit_min: int = 60
    reading_min: int = 0
    access_code: str = "1234"
    class_id: Optional[int] = None
    created_by: int                             # teacher id (until auth is wired)
    sections: List[SectionIn]


@router.post("/import")
def import_test(payload: TestIn, db: Session = Depends(get_db)):
    class_id = payload.class_id
    if not class_id:
        klass = (
            db.query(models.Class)
            .filter(models.Class.name == "Sandbox", models.Class.owner_id == payload.created_by)
            .first()
        )
        if not klass:
            klass = models.Class(name="Sandbox", owner_id=payload.created_by)
            db.add(klass)
            db.flush()
        class_id = klass.id

    code_hash = bcrypt.hashpw(payload.access_code.encode(), bcrypt.gensalt()).decode()
    exam = models.Exam(
        class_id=class_id,
        name=payload.name,
        exam_type=models.ExamType.practice,
        difficulty=models.DifficultyLevel(payload.difficulty),
        total_stations=len(payload.sections),
        time_limit_min=payload.time_limit_min,
        reading_min=payload.reading_min,
        access_code_hash=code_hash,
        created_by=payload.created_by,
    )
    db.add(exam)
    db.flush()

    for s in payload.sections:
        case = models.Case(title=s.title, body_md=s.passage_md, created_by=payload.created_by)
        db.add(case)
        db.flush()
        station = models.Station(
            exam_id=exam.id, position=s.position, case_id=case.id,
            skill=s.skill, audio_url=s.audio_url,
        )
        db.add(station)
        db.flush()
        for q in s.questions:
            db.add(models.Question(
                station_id=station.id,
                qtype=models.QuestionType(q.qtype),
                prompt=q.prompt,
                options_json=q.options,
                correct_index=q.correct_index,
                accept_answers=q.accept_answers,
                sub_skill=q.sub_skill,
                display_order=q.display_order,
            ))
    db.commit()
    return {"exam_id": exam.id, "sections": len(payload.sections)}


@router.get("/{exam_id}/export")
def export_test(exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    out = {"name": exam.name, "time_limit_min": exam.time_limit_min, "sections": []}
    for st in sorted(exam.stations, key=lambda x: x.position):
        out["sections"].append({
            "position": st.position,
            "skill": st.skill,
            "title": st.case.title,
            "passage_md": st.case.body_md,
            "audio_url": st.audio_url,
            "questions": [{
                "qtype": q.qtype.value,
                "prompt": q.prompt,
                "options": q.options_json,
                "correct_index": q.correct_index,
                "accept_answers": q.accept_answers,
                "sub_skill": q.sub_skill,
            } for q in st.questions],
        })
    return out
```

---

## `backend/routers/autograde.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.service.database import get_db
from backend.service.autograde import autograde_station_attempt, autograde_exam_attempt

router = APIRouter(prefix="/api/autograde", tags=["autograde"])


@router.post("/station/{station_attempt_id}")
def grade_station(station_attempt_id: int, db: Session = Depends(get_db)):
    res = autograde_station_attempt(db, station_attempt_id)
    if res is None:
        raise HTTPException(404, "Station attempt not found")
    return res


@router.post("/exam/{exam_attempt_id}")
def grade_exam(exam_attempt_id: int, db: Session = Depends(get_db)):
    ea = autograde_exam_attempt(db, exam_attempt_id)
    if ea is None:
        raise HTTPException(404, "Exam attempt not found")
    return {
        "exam_attempt_id": ea.id,
        "overall_band": ea.overall_band,
        "status": ea.status.value,
    }
```

---

## `backend/routers/analytics.py`
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/student/{user_id}")
def student_patterns(user_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.ErrorTag.skill, models.ErrorTag.sub_skill, func.count().label("misses"))
        .filter(models.ErrorTag.user_id == user_id)
        .group_by(models.ErrorTag.skill, models.ErrorTag.sub_skill)
        .order_by(func.count().desc())
        .all()
    )
    return [{"skill": r[0], "sub_skill": r[1], "misses": r[2]} for r in rows]


@router.get("/class/{class_id}")
def class_patterns(class_id: int, db: Session = Depends(get_db)):
    user_ids = [
        e.user_id
        for e in db.query(models.ClassEnrolment).filter(
            models.ClassEnrolment.class_id == class_id
        ).all()
    ]
    if not user_ids:
        return []
    rows = (
        db.query(models.ErrorTag.sub_skill, func.count().label("misses"))
        .filter(models.ErrorTag.user_id.in_(user_ids))
        .group_by(models.ErrorTag.sub_skill)
        .order_by(func.count().desc())
        .all()
    )
    return [{"sub_skill": r[0], "misses": r[1]} for r in rows]
```

---

## `backend/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .service.config import settings
from .service.database import Base, engine
from .service import models  # noqa: F401  (registers tables)
from .routers import auth, tests_io, autograde, analytics

Base.metadata.create_all(bind=engine)


def create_app() -> FastAPI:
    app = FastAPI(title="IELTS Platform API", version="0.1.0")

    origins = {
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(tests_io.router)
    app.include_router(autograde.router)
    app.include_router(analytics.router)

    @app.get("/api/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
```

---

## `frontend/src/pages/Weakness.js` (optional)
```jsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = process.env.REACT_APP_API_URL;

export default function Weakness({ userId }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/analytics/student/${userId}`)
      .then((r) => r.json())
      .then((rows) =>
        setData(rows.map((d) => ({ name: d.sub_skill || d.skill, misses: d.misses })))
      )
      .catch(() => setData([]));
  }, [userId]);

  return (
    <div style={{ width: "100%", height: 320 }}>
      <h3>Your most frequent mistakes</h3>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip />
          <Bar dataKey="misses" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```
To use it, add a route in `frontend/src/App.js` among the existing `<Route>` entries: `<Route path="/weakness" element={<Weakness userId={1} />} />` and import it at the top.

---

# Run, seed, and test (Postgres / Supabase)

**1. `backend/.env`** (gitignored):
```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:3000
```

**2. Install + run** (from the repo root):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.main:app --reload --port 8000
```
Visit `http://localhost:8000/api/health` → `{"status":"ok"}`, and `http://localhost:8000/docs` to see the endpoints. Tables are auto-created on first run.

**3. Seed a teacher** — generate a hash, then insert via Supabase SQL Editor:
```powershell
python -c "import bcrypt;print(bcrypt.hashpw(b'pass123', bcrypt.gensalt()).decode())"
```
```sql
insert into users (email, username, full_name, role, password_hash, is_active, created_at, updated_at)
values ('t@test.com', 'teacher', 'Teacher One', 'teacher', '<paste-hash>', true, now(), now());
```

**4. Import a sample test** — `POST http://localhost:8000/api/tests/import` (via `/docs` or curl):
```json
{
  "name": "IELTS Reading Practice 1",
  "created_by": 1,
  "sections": [{
    "position": 1, "skill": "reading", "title": "Passage 1: Bees",
    "passage_md": "Bees are vital pollinators...",
    "questions": [
      {"qtype":"mcq","prompt":"Bees mainly help plants by...","options":["Eating pests","Pollination","Making soil"],"correct_index":1,"sub_skill":"multiple_choice","display_order":1},
      {"qtype":"short","prompt":"What do bees collect from flowers?","accept_answers":["nectar","pollen and nectar"],"sub_skill":"gap_fill","display_order":2},
      {"qtype":"mcq","prompt":"The passage suggests bee numbers are...","options":["Rising","Stable","Falling"],"correct_index":2,"sub_skill":"true_false_notgiven","display_order":3}
    ]
  }]
}
```

**5. Simulate a student attempt** (Supabase SQL Editor) — Q1 wrong, Q2 right, Q3 wrong:
```sql
insert into exam_attempts (exam_id, user_id, status, started_at) values (1, 1, 'submitted', now());
insert into station_attempts (exam_attempt_id, station_id, status, started_at) values (1, 1, 'submitted', now());
insert into answers (station_attempt_id, question_id, choice_index, created_at) values (1, 1, 0, now());
insert into answers (station_attempt_id, question_id, value_text, created_at) values (1, 2, 'nectar', now());
insert into answers (station_attempt_id, question_id, choice_index, created_at) values (1, 3, 1, now());
```

**6. Grade and inspect:**
```
POST http://localhost:8000/api/autograde/exam/1     -> { overall_band, status: "graded" }
GET  http://localhost:8000/api/analytics/student/1  -> [{skill, sub_skill, misses}, ...]
```
Two wrong answers should appear as error tags, and the attempt gets a band. That's the full pipeline working.

> Reset the schema anytime (test version only): in Supabase SQL Editor run
> `drop schema public cascade; create schema public; grant all on schema public to postgres, anon, authenticated, service_role;`
> then restart the app to rebuild the tables.
