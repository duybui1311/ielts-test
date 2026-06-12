"""Tests for the Writing submission + AI-grading + teacher-review flow.

The Gemini call (ai_grading.grade_writing) is monkeypatched so these run offline
and deterministically — no network, no GEMINI_API_KEY needed.
"""
from backend.service import ai_grading, models
from backend.service.auth_deps import create_access_token


def _fake_grade(essay_text, task_prompt, task_type="task2"):
    """Deterministic stand-in for the Gemini grader."""
    return {
        "overall_band": 6.5,
        "criteria": [
            {"name": "Task Achievement", "band": 6.0, "comment": "Addresses the task."},
            {"name": "Coherence and Cohesion", "band": 6.5, "comment": "Mostly logical."},
            {"name": "Lexical Resource", "band": 7.0, "comment": "Good range."},
            {"name": "Grammatical Range and Accuracy", "band": 6.5, "comment": "Some slips."},
        ],
        "error_tags": [{"category": "grammar", "excerpt": "trend", "suggestion": "Use past tense."}],
        "tips": ["Vary your sentence structure.", "Add a clear overview."],
    }


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


# ----------------------------- submission -----------------------------

def test_submit_stores_essay_and_metadata(client, db, writing_task, student_headers):
    essay = "The chart shows sales rising steadily over the five year period."
    r = client.post("/api/writing/submissions",
                    json={"task_id": writing_task.id, "response_text": essay},
                    headers=student_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "submitted"
    assert body["word_count"] == len(essay.split())

    detail = client.get(f"/api/writing/submissions/{body['id']}",
                        headers=student_headers).json()
    assert detail["response_text"] == essay


def test_submission_status_submitted_and_ai_grade_none_initially(
        client, db, writing_submission, student_headers):
    detail = client.get(f"/api/writing/submissions/{writing_submission.id}",
                        headers=student_headers).json()
    assert detail["status"] == "submitted"
    assert detail["band"] is None
    assert detail["ai_result"] is None


def test_submission_exposes_task_chart_image(
        client, db, writing_task, writing_submission, student_headers):
    # The Task-1 chart lives on the task; the submission view surfaces it.
    detail = client.get(f"/api/writing/submissions/{writing_submission.id}",
                        headers=student_headers).json()
    assert detail["image_url"] == writing_task.image_url


# ----------------------------- AI grading -----------------------------

def test_ai_grading_populates_criteria_and_tips(
        client, db, writing_submission, teacher_headers, monkeypatch):
    monkeypatch.setattr(ai_grading, "grade_writing", _fake_grade)

    r = client.post(f"/api/writing/submissions/{writing_submission.id}/ai-grade",
                    headers=teacher_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ai_graded"
    assert body["ai_result"]["overall_band"] == 6.5
    assert len(body["ai_result"]["criteria"]) == 4
    assert len(body["ai_result"]["tips"]) == 2

    db.expire_all()
    s = db.get(models.WritingSubmission, writing_submission.id)
    assert s.band == 6.5
    assert s.approved_by_teacher is False     # still a draft until a teacher signs off


def test_ai_grading_writes_writing_error_tags(
        client, db, writing_submission, teacher_headers, monkeypatch):
    monkeypatch.setattr(ai_grading, "grade_writing", _fake_grade)
    client.post(f"/api/writing/submissions/{writing_submission.id}/ai-grade",
                headers=teacher_headers)

    db.expire_all()
    tags = db.query(models.ErrorTag).all()
    assert len(tags) == 1
    assert tags[0].skill == "writing"
    assert tags[0].sub_skill == "grammar"


def test_ai_grade_requires_teacher(client, db, writing_submission, student_headers, monkeypatch):
    monkeypatch.setattr(ai_grading, "grade_writing", _fake_grade)
    r = client.post(f"/api/writing/submissions/{writing_submission.id}/ai-grade",
                    headers=student_headers)
    assert r.status_code == 403


# --------------------------- teacher review ---------------------------

def test_teacher_approval_makes_grade_visible_to_student(
        client, db, writing_submission, teacher_headers, student_headers, monkeypatch):
    monkeypatch.setattr(ai_grading, "grade_writing", _fake_grade)
    client.post(f"/api/writing/submissions/{writing_submission.id}/ai-grade",
                headers=teacher_headers)

    # Before approval the student cannot see the grade.
    pre = client.get(f"/api/writing/submissions/{writing_submission.id}",
                     headers=student_headers).json()
    assert pre["status"] == "submitted"
    assert pre["band"] is None

    # Teacher approves with a final band + feedback.
    r = client.post(f"/api/review/writing/{writing_submission.id}",
                    json={"band": 6.5, "feedback": "Solid Task 1.", "share_ai": True},
                    headers=teacher_headers)
    assert r.status_code == 200

    post = client.get(f"/api/writing/submissions/{writing_submission.id}",
                      headers=student_headers).json()
    assert post["status"] == "reviewed"
    assert post["band"] == 6.5
    assert post["feedback"] == "Solid Task 1."


def test_manual_score_can_withhold_ai_breakdown(
        client, db, writing_submission, teacher_headers, student_headers, monkeypatch):
    monkeypatch.setattr(ai_grading, "grade_writing", _fake_grade)
    client.post(f"/api/writing/submissions/{writing_submission.id}/ai-grade",
                headers=teacher_headers)

    # Teacher overrides with their own band and declines to share the AI draft.
    client.post(f"/api/review/writing/{writing_submission.id}",
                json={"band": 7.0, "feedback": "Reworked grade.", "share_ai": False},
                headers=teacher_headers)

    detail = client.get(f"/api/writing/submissions/{writing_submission.id}",
                        headers=student_headers).json()
    assert detail["band"] == 7.0
    assert detail["feedback"] == "Reworked grade."
    assert detail["ai_result"] is None        # AI breakdown withheld


# --------------------------- inline comments ---------------------------

def test_inline_comment_is_stored_and_returned_to_student(
        client, db, writing_submission, teacher_headers, student_headers):
    r = client.post(
        f"/api/review/writing/{writing_submission.id}/comments",
        json={"start_offset": 4, "end_offset": 9, "quote": "chart",
              "comment": "Good lead-in."},
        headers=teacher_headers,
    )
    assert r.status_code == 200

    detail = client.get(f"/api/writing/submissions/{writing_submission.id}",
                        headers=student_headers).json()
    comments = detail["comments"]
    assert len(comments) == 1
    assert comments[0]["start_offset"] == 4
    assert comments[0]["end_offset"] == 9
    assert comments[0]["comment"] == "Good lead-in."


def test_empty_comment_is_rejected(client, db, writing_submission, teacher_headers):
    r = client.post(
        f"/api/review/writing/{writing_submission.id}/comments",
        json={"start_offset": 0, "end_offset": 1, "quote": "T", "comment": "   "},
        headers=teacher_headers,
    )
    assert r.status_code == 400


def test_other_student_cannot_view_submission(client, db, writing_submission, student_headers):
    other = models.User(email="intruder@test.io", full_name="Other",
                        role=models.UserRole.student, password_hash="x", is_active=True)
    db.add(other)
    db.commit()
    db.refresh(other)

    r = client.get(f"/api/writing/submissions/{writing_submission.id}",
                   headers=_headers(other))
    assert r.status_code == 403
