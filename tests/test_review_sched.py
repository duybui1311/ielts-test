import types

from backend.service import review_sched


class FakeDB:
    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)


def _rq(interval):
    return types.SimpleNamespace(interval_days=interval, due_date=None, user_id=1, question_id=2)


def test_correct_doubles_interval():
    rq = _rq(2)
    review_sched.apply_result(FakeDB(), rq, True)
    assert rq.interval_days == 4


def test_correct_caps_at_max():
    rq = _rq(20)
    review_sched.apply_result(FakeDB(), rq, True)
    assert rq.interval_days == review_sched.MAX_INTERVAL_DAYS


def test_wrong_resets_to_one():
    rq = _rq(16)
    review_sched.apply_result(FakeDB(), rq, False)
    assert rq.interval_days == 1


def test_sets_due_date_and_records_history():
    db = FakeDB()
    rq = _rq(1)
    review_sched.apply_result(db, rq, True)
    assert rq.due_date is not None
    assert len(db.added) == 1
