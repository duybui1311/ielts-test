from __future__ import annotations
from datetime import datetime, timezone
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


def utcnow() -> datetime:
    """Timezone-aware UTC now, used as the default for every timestamp column.

    Replaces the deprecated naive ``utcnow`` and matches the rest of
    the codebase (routers/services already use ``datetime.now(timezone.utc)``),
    so stored defaults and explicit assignments agree.
    """
    return datetime.now(timezone.utc)


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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    klass: Mapped["Class"] = relationship("Class", back_populates="enrolments")
    user: Mapped["User"] = relationship("User", back_populates="enrolments")

class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
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
    image_url: Mapped[Optional[str]] = mapped_column(String(500))   # Writing Task 1 chart/diagram (Supabase Storage URL)
    exam: Mapped["Exam"] = relationship("Exam", back_populates="stations")
    case: Mapped["Case"] = relationship("Case", back_populates="stations")
    questions: Mapped[List["Question"]] = relationship(
        "Question",
        back_populates="station",
        cascade="all, delete-orphan",
        order_by="Question.display_order",
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
    # Learning features: per-question explanation + the passage sentence(s) that
    # support the correct answer. Generated by the AI importer or on-demand and
    # cached here so each question is only explained once.
    explanation: Mapped[Optional[str]] = mapped_column(Text)
    support_sentences: Mapped[Optional[list]] = mapped_column(JSON)
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
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
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
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
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
    feedbacks: Mapped[List["Feedback"]] = relationship(
        "Feedback", back_populates="station_attempt", cascade="all, delete-orphan"
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    station_attempt: Mapped["StationAttempt"] = relationship(
        "StationAttempt", back_populates="answers"
    )
    question: Mapped["Question"] = relationship("Question", back_populates="answers")

# -------------------- FEEDBACK --------------------

class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=False
    )
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
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
    verified_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    exam: Mapped["Exam"] = relationship("Exam", back_populates="access_logs")
    user: Mapped["User"] = relationship("User", back_populates="access_logs")

# -------------------- FLASHCARDS --------------------

class FlashcardDeck(Base):
    __tablename__ = "flashcard_decks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
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
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    card: Mapped["Flashcard"] = relationship("Flashcard", back_populates="reviews")
    user: Mapped["User"] = relationship("User", back_populates="flashcard_reviews")

# -------------------- WRITING & SPEAKING PRACTICE --------------------

class WritingTask(Base):
    __tablename__ = "writing_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_type: Mapped[str] = mapped_column(String(10), nullable=False)  # task1 | task2
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    prompt_md: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500))       # Task 1 chart/diagram
    time_limit_min: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    min_words: Mapped[Optional[int]] = mapped_column(Integer)           # word threshold (null -> task-type default)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SpeakingTask(Base):
    __tablename__ = "speaking_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    part: Mapped[int] = mapped_column(Integer, nullable=False)          # 1 | 2 | 3
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    prompt_md: Mapped[str] = mapped_column(Text, nullable=False)
    prep_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    answer_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WritingSubmission(Base):
    __tablename__ = "writing_submissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("writing_tasks.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")  # submitted | ai_graded | reviewed
    band: Mapped[Optional[float]] = mapped_column(Float)
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    ai_result: Mapped[Optional[dict]] = mapped_column(JSON)               # AI draft: criteria + tips
    approved_by_teacher: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    task: Mapped["WritingTask"] = relationship("WritingTask")


class WritingComment(Base):
    """An inline teacher annotation on a span of a student's writing response."""
    __tablename__ = "writing_comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("writing_submissions.id"), nullable=False
    )
    start_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    end_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False)        # the highlighted text
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SpeakingSubmission(Base):
    __tablename__ = "speaking_submissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("speaking_tasks.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    transcript: Mapped[Optional[str]] = mapped_column(Text)
    audio_url: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")  # submitted | ai_graded | reviewed
    band: Mapped[Optional[float]] = mapped_column(Float)
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    ai_result: Mapped[Optional[dict]] = mapped_column(JSON)               # AI draft: criteria + tips
    approved_by_teacher: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    task: Mapped["SpeakingTask"] = relationship("SpeakingTask")


# -------------------- MISTAKE-PATTERN TAGS (IELTS) --------------------

class ErrorTag(Base):
    __tablename__ = "error_tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Exam (reading/listening) error tags fill these; AI Writing/Speaking error
    # tags leave them null (no station/exam), so they are nullable.
    station_attempt_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("station_attempts.id"), nullable=True
    )
    answer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("answers.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    exam_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exams.id"), nullable=True)
    station_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stations.id"), nullable=True)
    skill: Mapped[Optional[str]] = mapped_column(String(20))
    question_type: Mapped[Optional[str]] = mapped_column(String(20))
    sub_skill: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# -------------------- LEARNING LOOP (IELTS) --------------------

class PracticeSession(Base):
    """One focused practice-by-question-type drill (not a full exam attempt)."""
    __tablename__ = "practice_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    sub_skill: Mapped[str] = mapped_column(String(50), nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ReviewQueue(Base):
    """Spaced-repetition queue: a question a student got wrong, scheduled to
    resurface. One row per (user, question); the schedule updates in place."""
    __tablename__ = "review_queue"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_review_user_question"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ReviewHistory(Base):
    """A single spaced-review answer, kept for analytics."""
    __tablename__ = "review_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
