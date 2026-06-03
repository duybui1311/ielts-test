"""
One-shot seed: creates a teacher + student user, a class, and a sample Reading exam.
Run from repo root with the venv active:
  python seed_test_data.py
"""
import sys, os, secrets
sys.path.insert(0, os.path.dirname(__file__))

import bcrypt
from backend.service.database import engine
from backend.service import models
from sqlalchemy.orm import Session

def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

with Session(engine) as db:
    # ── Teacher user ──────────────────────────────────────────────────────────
    teacher = db.query(models.User).filter(models.User.username == "teacher1").first()
    if not teacher:
        teacher = models.User(
            username="teacher1",
            email="teacher1@test.com",
            full_name="Test Teacher",
            password_hash=hash_pw("password123"),
            role=models.UserRole.teacher,
            is_active=True,
        )
        db.add(teacher)
        db.flush()
        print(f"Created teacher: id={teacher.id}, username=teacher1, password=password123")
    else:
        teacher.password_hash = hash_pw("password123")
        print(f"Found teacher: id={teacher.id}")

    # ── Student user ──────────────────────────────────────────────────────────
    student = db.query(models.User).filter(models.User.username == "student1").first()
    if not student:
        student = models.User(
            username="student1",
            email="student1@test.com",
            full_name="Test Student",
            password_hash=hash_pw("password123"),
            role=models.UserRole.student,
            is_active=True,
        )
        db.add(student)
        db.flush()
        print(f"Created student: id={student.id}, username=student1, password=password123")
    else:
        student.password_hash = hash_pw("password123")
        print(f"Found student: id={student.id}")

    # ── Class ─────────────────────────────────────────────────────────────────
    klass = db.query(models.Class).filter(
        models.Class.name == "IELTS Test Class",
        models.Class.owner_id == teacher.id,
    ).first()
    if not klass:
        klass = models.Class(
            name="IELTS Test Class",
            owner_id=teacher.id,
        )
        db.add(klass)
        db.flush()
        print(f"Created class: id={klass.id}")
    else:
        print(f"Found class: id={klass.id}")

    # Enrol student
    enrolment = db.query(models.ClassEnrolment).filter(
        models.ClassEnrolment.class_id == klass.id,
        models.ClassEnrolment.user_id == student.id,
    ).first()
    if not enrolment:
        db.add(models.ClassEnrolment(class_id=klass.id, user_id=student.id))
        print(f"Enrolled student in class")

    # ── Sample Reading exam ───────────────────────────────────────────────────
    exam = db.query(models.Exam).filter(models.Exam.name == "Sample IELTS Reading Test").first()
    if not exam:
        exam = models.Exam(
            class_id=klass.id,
            name="Sample IELTS Reading Test",
            exam_type=models.ExamType.practice,
            difficulty=models.DifficultyLevel.medium,
            total_stations=1,
            time_limit_min=60,
            reading_min=60,
            access_code_hash=secrets.token_hex(16),
            created_by=teacher.id,
        )
        db.add(exam)
        db.flush()

        # Passage (Case)
        case = models.Case(
            title="The History of Paper",
            body_md="""## The History of Paper

Paper was invented in China around 105 AD by Cai Lun, a court official. Before paper,
people wrote on materials such as bamboo, silk, and clay tablets. Paper making spread
from China to the Islamic world by the 8th century, and eventually reached Europe in
the 12th century through Spain.

The industrial revolution transformed paper production. In 1844, Friedrich Gottlob Keller
developed the wood-pulp process, making paper far cheaper to produce. Today, paper is
made from wood fibres, recycled paper, or a combination of both. Despite the rise of
digital media, global paper production continues to be significant, though environmental
concerns have led to greater recycling efforts.

Paper remains essential for education, packaging, and art around the world.""",
            created_by=teacher.id,
        )
        db.add(case)
        db.flush()

        station = models.Station(
            exam_id=exam.id,
            case_id=case.id,
            position=1,
            skill="reading",
        )
        db.add(station)
        db.flush()

        questions = [
            models.Question(
                station_id=station.id,
                qtype=models.QuestionType.mcq,
                sub_skill="multiple_choice",
                prompt="Who invented paper?",
                options_json=["Cai Lun", "Friedrich Keller", "Marco Polo", "Ibn Battuta"],
                correct_index=0,
                display_order=1,
            ),
            models.Question(
                station_id=station.id,
                qtype=models.QuestionType.mcq,
                sub_skill="multiple_choice",
                prompt="When did paper-making reach Europe?",
                options_json=["8th century", "10th century", "12th century", "14th century"],
                correct_index=2,
                display_order=2,
            ),
            models.Question(
                station_id=station.id,
                qtype=models.QuestionType.mcq,
                sub_skill="true_false_notgiven",
                prompt="The wood-pulp process made paper more expensive to produce.",
                options_json=["True", "False", "Not Given"],
                correct_index=1,
                display_order=3,
            ),
            models.Question(
                station_id=station.id,
                qtype=models.QuestionType.short,
                sub_skill="sentence_completion",
                prompt="Paper was invented in China around ___ AD.",
                accept_answers=["105", "105 ad", "105ad"],
                display_order=4,
            ),
            models.Question(
                station_id=station.id,
                qtype=models.QuestionType.mcq,
                sub_skill="multiple_choice",
                prompt="Through which country did paper first reach Europe?",
                options_json=["France", "Italy", "Spain", "Portugal"],
                correct_index=2,
                display_order=5,
            ),
        ]
        for q in questions:
            db.add(q)

        db.commit()
        print(f"Created exam: id={exam.id}  ({len(questions)} questions)")
    else:
        print(f"Exam already exists: id={exam.id}")
        db.commit()

    print("\n=== Credentials ===")
    print("  student:  username=student1   password=password123")
    print("  teacher:  username=teacher1   password=password123")
