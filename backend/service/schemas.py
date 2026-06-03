from __future__ import annotations
from typing import List, Optional, Union, Literal, Dict
from datetime import datetime

try:
    from pydantic import BaseModel, Field, ConfigDict  # v2
    class ORMModel(BaseModel):
        model_config = ConfigDict(from_attributes=True)
except Exception:
    from pydantic import BaseModel, Field
    class ORMModel(BaseModel):
        class Config:
            orm_mode = True


# ============================
# Enums (API-level)
# ============================
UserRole = Literal["student", "teacher", "admin"]
ExamStatus = Literal["draft", "active", "closed"]
AttemptStatus = Literal["draft", "in_progress", "submitted", "graded"]
StationAttemptStatus = Literal["draft", "in_progress", "submitted", "graded"]
QuestionType = Literal["mcq", "short", "explain"]
ChatSide = Literal["left", "right", "user", "ai"]
VirtualPatientRole = Literal["student", "patient"]
# ============================
# Auth / Users
# ============================
class LoginIn(BaseModel):
    email: str
    password: str

class LoginOut(ORMModel):
    user_id: int
    name: str
    role: UserRole
    token: Optional[str] = None  # if/when JWT is added

class UserOut(ORMModel):
    id: int
    name: str
    email: str
    role: UserRole
    created_at: Optional[datetime] = None

class UserCreateIn(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole = "student"

class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None

# ============================
# Admin: User Management
# ============================
class AdminUserOut(ORMModel):
    id: int
    email: Optional[str] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: UserRole
    is_active: bool
    created_at: Optional[datetime] = None

class AdminUserCreateIn(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: UserRole = "student"
    is_active: bool = True

class AdminUserCreateOut(ORMModel):
    user: AdminUserOut
    temp_password: str

class AdminUserUpdateIn(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class AdminPasswordResetOut(ORMModel):
    user_id: int
    temp_password: str

# ============================
# Classes / Enrolments
# ============================
class ClassCreateIn(BaseModel):
    name: str

class ClassOut(ORMModel):
    id: int
    name: str
    owner_id: int
    created_at: Optional[datetime] = None

class EnrolmentOut(ORMModel):
    id: int
    class_id: int
    user_id: int
    role: UserRole
    created_at: Optional[datetime] = None


# ============================
# Cases (patient content)
# ============================
class CaseCreateIn(BaseModel):
    title: str
    script_md: str

class CaseOut(ORMModel):
    id: int
    title: str
    script_md: str
    created_by: int
    created_at: Optional[datetime] = None

# ============================
# Exams / Stations / Questions
# ============================
class StationCreateIn(BaseModel):
    position: int = Field(..., ge=1)
    case_id: int
    title: Optional[str] = None

class ExamCreateIn(BaseModel):
    title: str
    class_id: int
    duration_sec: int = Field(600, ge=60)
    access_code: Optional[str] = None
    stations: List[StationCreateIn] = Field(default_factory=list)

class ExamOut(ORMModel):
    id: int
    title: str
    class_id: int
    duration_sec: int
    status: ExamStatus
    created_by: int
    created_at: Optional[datetime] = None

class StationOut(ORMModel):
    id: int
    exam_id: int
    position: int
    case_id: int
    title: Optional[str] = None

class QuestionCreateIn(BaseModel):
    station_id: int
    type: QuestionType
    prompt: str
    options: Optional[List[str]] = None
    order_index: int = 0

class QuestionOut(ORMModel):
    id: int
    type: QuestionType
    prompt: str
    options: Optional[List[str]] = None  # mcq only
    # when returning with station content, order is implied by the list

class VerifyAccessIn(BaseModel):
    access_code: str
    accepted_integrity: bool

class VerifyAccessOut(BaseModel):
    ok: bool
    role: UserRole
    duration_sec: int
    stations: List[StationOut]

class PerStationConfig(BaseModel):
    work_min: int = Field(..., ge=0)
    reading_min: int = Field(..., ge=0)

class NewExamQuestionIn(BaseModel):
    type: QuestionType              # "mcq" | "short" | "explain"
    text: str
    # MCQ
    options: Optional[List[str]] = None
    correct_index: Optional[int] = None
    # Short answer / explanation
    answer: Optional[str] = None        # for type="short"
    reference: Optional[str] = None     # for type="explain"

class NewExamStationIn(BaseModel):
    index: int = Field(..., ge=1)
    case_id: int
    questions: List[NewExamQuestionIn] = Field(default_factory=list)

class ExamCreateFullIn(BaseModel):
    # matches CreateNewExam payload
    name: str
    class_id: int
    # UI uses "Exam" | "Practice" (capitalized)
    exam_type: Literal["Exam", "Practice"]
    # UI uses "Low" | "Medium" | "High"
    difficulty: Literal["Low", "Medium", "High"]
    total_stations: int = Field(..., ge=1)
    time_limit_min: int = Field(..., ge=1)
    per_station: PerStationConfig
    access_code: str
    description: Optional[str] = None
    start_at: Optional[datetime] = None
    stations: List[NewExamStationIn] = Field(default_factory=list)

class ExamCreateOut(BaseModel):
    id: int  # exam_id written to MySQL

class CircuitItemOut(BaseModel):
    id: int
    name: str
    type: str            # "Exam" | "Practice"
    difficulty: str      # "Low" | "Medium" | "High"
    stations: int
    timeLimit: int       # total time in minutes
    perStation: str      # e.g. "8 min + 1 min reading"
    progress: int        # 0–100
    statusState: str     # "not_started" | "in_progress" | "submitted" | "graded"
    statusColor: str     # "ok" | "fail" (for UI colours)


class CircuitListOut(BaseModel):
    items: List[CircuitItemOut]
    total: int


class CircuitAccessIn(BaseModel):
    access_code: str
    accept_integrity: bool


class CircuitAccessOut(BaseModel):
    ok: bool
    circuit_id: int
    total_stations: int
    name: str

# ============================
# Attempts (Virtual Patient runtime)
# ============================
class QuestionOptionOut(BaseModel):
    """
    Legacy placeholder – keep for now in case richer MCQ options later.
    Not used by the current endpoints.
    """
    id: int
    label: str

class QuestionOut(BaseModel):
    """
    Unified question shape for runtime:
    - matches what the DB stores in `questions.prompt`
    - matches what attempts._load_questions() constructs
    - matches what virtualPatient.js expects (q.prompt, q.options: string[])
    """
    id: int
    type: QuestionType
    prompt: str
    options: Optional[List[str]] = None
    max_score: Optional[float] = None

class ChatMessageOut(BaseModel):
    id: Optional[int] = None
    side: ChatSide
    text: str

class StationContentOut(BaseModel):
    attempt_id: int
    station_attempt_id: int
    patient_name: str
    patient_script: str
    questions: List[QuestionOut]
    initial_messages: List[ChatMessageOut] = []

class StartAttemptOut(BaseModel):
    attempt_id: int
    station_attempts: List[Dict[str, int]]  # [{position, station_attempt_id}]

class AnswerIn(BaseModel):
    question_id: int = Field(..., ge=1)
    # mcq → int index; short/explain → str; None = clear draft
    value: Optional[Union[int, str]] = None

class ChatIn(BaseModel):
    text: str = Field(..., min_length=1)

# ----------------------------
# Virtual patient LLM bridge
# ----------------------------
class VirtualPatientTurn(BaseModel):
    """
    One turn in the virtual patient conversation, used when
    calling the external LLM microservice.

    side:
      - "student": message from the student
      - "patient": message from the virtual patient
    """
    side: VirtualPatientRole
    text: str

class VirtualPatientLLMRequest(BaseModel):
    """
    Structured payload the main backend will send to virtual_patient_ai.py.

    - patient_script: scenario text (usually cases.body_md)
    - history: ordered conversation so far
    - student_message: the latest question to answer
    """
    patient_script: str
    history: List[VirtualPatientTurn] = Field(default_factory=list)
    student_message: str

class VirtualPatientLLMResponse(BaseModel):
    """
    Response wrapper for a single LLM-generated patient reply.
    """
    reply: str

class SubmitStationPayload(BaseModel):
    station_attempt_id: int
    answers: Optional[Dict[int, Union[int, str, None]]] = None
    messages: Optional[List[ChatMessageOut]] = None  # FE may send left/right

class SubmitAttemptIn(BaseModel):
    attempt_id: Optional[int] = None
    circuit_id: int  # exam_id
    started_at: Optional[int] = None
    stations: List[SubmitStationPayload] = Field(default_factory=list)

class SubmitAttemptOut(BaseModel):
    ok: bool = True
    reference_id: str

# ============================
# Marking (teacher)
# ============================
class RubricItemOut(ORMModel):
    id: int
    station_id: int
    criterion: str
    max_score: float
    order_index: int

class RubricItemMarkIn(BaseModel):
    rubric_id: int
    score: float
    comment: Optional[str] = None

class StationMarkIn(BaseModel):
    station_attempt_id: int
    items: List[RubricItemMarkIn]

class AttemptFinalizeIn(BaseModel):
    attempt_id: int

class StationAnswerForMarking(BaseModel):
    question_id: int
    type: QuestionType
    prompt: str
    # normalized value
    choice_index: Optional[int] = None
    value_text: Optional[str] = None

class StationChatForMarking(BaseModel):
    side: Literal["user", "ai"]
    text: str
    created_at: Optional[datetime] = None

class StationDetailForMarkingOut(BaseModel):
    station_attempt_id: int
    station_id: int
    position: int
    answers: List[StationAnswerForMarking]
    messages: List[StationChatForMarking]
    rubrics: List[RubricItemOut]
    existing_marks: Optional[List[RubricItemMarkIn]] = None
    score: Optional[float] = None
    status: StationAttemptStatus

class SubmissionListItemOut(BaseModel):
    attempt_id: int
    user_id: int
    student_name: str
    submitted_at: datetime
    progress_pct: float
    status: AttemptStatus

class FinalizeOut(BaseModel):
    ok: bool = True
    total_score: float

class ReviewOut(BaseModel):
    id: int
    attempt_id: int
    reviewer_id: int
    user_id: int
    rating: int
    reviewed_at: datetime

class OkOut(BaseModel):
    ok: bool = True

class PageMeta(BaseModel):
    page: int = 1
    size: int = 20
    total: int = 0

class PageOut(BaseModel):
    meta: PageMeta
    items: List[Dict]

class RubricItem(BaseModel):
    rubric_id: int
    met: bool
    points: float

class SaveGradePayload(BaseModel):
    rubrics: List[RubricItem]
    feedback: Optional[str] = None
    status: str  # draft | published

class GradeUpdate(BaseModel):
    status: str
    score: Optional[float] = None
# ============================
# Dashboards
# ============================
class KpiOut(BaseModel):
    time_spent_min: int = 0
    avg_score_pct: float = 0.0
    critical_misses: int = 0
    attempts: int = 0

class AttemptPoint(BaseModel):
    # student chart
    month: Optional[str] = None
    attempts: Optional[int] = None
    # teacher chart
    label: Optional[str] = None
    avg: Optional[float] = None

class NoteOut(BaseModel):
    time: str
    text: str

class StationHistoryItem(BaseModel):
    id: int
    title: str
    type: str
    system: Optional[str] = None
    difficulty: Optional[str] = None
    progress: float = 0.0
    status: str

class DashboardOut(BaseModel):
    kpis: KpiOut
    chart: List[AttemptPoint]
    stations: List[StationHistoryItem]
    notes: List[NoteOut]

class StationSummary(BaseModel):
    id: int
    title: str
    type: str
    avg: float
    status: str
    attempts: int

class ClassSummary(BaseModel):
    id: str
    name: str
    students: int
    fully_graded: bool
    stations: List[StationSummary]

class ScheduleItem(BaseModel):
    id: str
    when: str
    time: str
    text: str

class TeacherDashboardOut(BaseModel):
    chart: List[AttemptPoint]
    classes: List[ClassSummary]
    schedule: List[ScheduleItem]


# ============================
# Flashcards
# ============================
class DeckCreateIn(BaseModel):
    title: str
    visibility: str = "private"

class DeckOut(ORMModel):
    id: int
    title: str
    owner_id: int
    visibility: str
    created_at: datetime

class CardCreateIn(BaseModel):
    deck_id: int
    front: str
    back: str
    tags: Optional[str] = None

class CardOut(ORMModel):
    id: int
    deck_id: int
    front: str
    back: str
    tags: Optional[str] = None
    created_at: datetime

class ReviewCreateIn(BaseModel):
    card_id: int
    rating: int  # 1..5

class ReviewOut(ORMModel):
    id: int
    card_id: int
    user_id: int
    rating: int
    reviewed_at: datetime

class OkOut(BaseModel):
    ok: bool = True

class PageMeta(BaseModel):
    page: int = 1
    size: int = 20
    total: int = 0

class PageOut(BaseModel):
    meta: PageMeta
    items: List[Dict]
