"""Tests for the analytics aggregation endpoints (backend/routers/analytics.py).

These hit the API through the TestClient with a teacher bearer token (the routes
are teacher/admin only) and seed ErrorTag rows directly in the DB.
"""
from backend.service import models
from backend.service.autograde import autograde_station_attempt


def _err(db, user, *, skill, sub_skill, exam_id=None):
    db.add(models.ErrorTag(
        user_id=user.id, skill=skill, sub_skill=sub_skill,
        question_type=skill, exam_id=exam_id,
    ))


def _extra_student(db, email="second@test.io"):
    u = models.User(email=email, full_name="Second Student",
                    role=models.UserRole.student, password_hash="x", is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_no_errors_returns_empty(client, db, student_user, teacher_headers):
    r = client.get(f"/api/analytics/student/{student_user.id}", headers=teacher_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_aggregates_by_sub_skill(client, db, student_user, teacher_headers):
    _err(db, student_user, skill="reading", sub_skill="gap_fill")
    _err(db, student_user, skill="reading", sub_skill="matching_headings")
    _err(db, student_user, skill="reading", sub_skill="true_false_notgiven")
    db.commit()

    rows = client.get(f"/api/analytics/student/{student_user.id}",
                      headers=teacher_headers).json()
    by_sub = {r["sub_skill"]: r["misses"] for r in rows}
    assert by_sub == {"gap_fill": 1, "matching_headings": 1, "true_false_notgiven": 1}


def test_counts_repeated_sub_skill(client, db, student_user, teacher_headers):
    for _ in range(3):
        _err(db, student_user, skill="reading", sub_skill="gap_fill")
    db.commit()

    rows = client.get(f"/api/analytics/student/{student_user.id}",
                      headers=teacher_headers).json()
    assert len(rows) == 1
    assert rows[0]["sub_skill"] == "gap_fill"
    assert rows[0]["misses"] == 3


def test_filters_strictly_by_student(client, db, student_user, teacher_headers):
    other = _extra_student(db)
    _err(db, student_user, skill="reading", sub_skill="gap_fill")
    _err(db, other, skill="reading", sub_skill="matching_headings")
    db.commit()

    rows = client.get(f"/api/analytics/student/{student_user.id}",
                      headers=teacher_headers).json()
    assert [r["sub_skill"] for r in rows] == ["gap_fill"]


def test_breakdown_by_skill(client, db, student_user, teacher_headers):
    _err(db, student_user, skill="reading", sub_skill="gap_fill")
    _err(db, student_user, skill="listening", sub_skill="multiple_choice")
    _err(db, student_user, skill="writing", sub_skill="grammar")
    _err(db, student_user, skill="speaking", sub_skill="fluency")
    db.commit()

    rows = client.get(f"/api/analytics/student/{student_user.id}",
                      headers=teacher_headers).json()
    assert {r["skill"] for r in rows} == {"reading", "listening", "writing", "speaking"}


def test_multiple_exams_tally_all_errors(client, db, student_user, teacher_headers):
    # Same sub_skill missed in two different exams -> counts combine.
    _err(db, student_user, skill="reading", sub_skill="gap_fill", exam_id=1)
    _err(db, student_user, skill="reading", sub_skill="gap_fill", exam_id=2)
    db.commit()

    rows = client.get(f"/api/analytics/student/{student_user.id}",
                      headers=teacher_headers).json()
    assert len(rows) == 1
    assert rows[0]["misses"] == 2


def test_correct_answers_excluded_from_analytics(
        client, db, teacher_headers, exam_attempt_with_answers):
    # Grade a real attempt (7 right / 3 wrong); only the 3 mistakes are tagged.
    ea, sa, questions_by_id, answers = exam_attempt_with_answers
    autograde_station_attempt(db, sa.id)

    rows = client.get(f"/api/analytics/student/{ea.user_id}",
                      headers=teacher_headers).json()
    assert sum(r["misses"] for r in rows) == 3
    # The sub_skills the student got right never appear.
    assert "sentence_completion" not in {r["sub_skill"] for r in rows}


def test_class_level_sums_across_students(client, db, teacher_user, teacher_headers,
                                          student_user):
    other = _extra_student(db)
    klass = models.Class(name="Class X", owner_id=teacher_user.id)
    db.add(klass)
    db.flush()
    db.add(models.ClassEnrolment(class_id=klass.id, user_id=student_user.id))
    db.add(models.ClassEnrolment(class_id=klass.id, user_id=other.id))
    _err(db, student_user, skill="reading", sub_skill="gap_fill")
    _err(db, other, skill="reading", sub_skill="gap_fill")
    _err(db, other, skill="reading", sub_skill="matching_headings")
    db.commit()

    rows = client.get(f"/api/analytics/class/{klass.id}", headers=teacher_headers).json()
    by_sub = {r["sub_skill"]: r["misses"] for r in rows}
    assert by_sub == {"gap_fill": 2, "matching_headings": 1}


def test_class_with_no_enrolments_returns_empty(client, db, teacher_user, teacher_headers):
    klass = models.Class(name="Empty Class", owner_id=teacher_user.id)
    db.add(klass)
    db.commit()
    r = client.get(f"/api/analytics/class/{klass.id}", headers=teacher_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_analytics_requires_teacher_role(client, db, student_user, student_headers):
    r = client.get(f"/api/analytics/student/{student_user.id}", headers=student_headers)
    assert r.status_code == 403
