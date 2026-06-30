from backend.service.explain import _appears_in_passage, _ground_support

PASSAGE = "The reef is the world's largest coral system.\nIt can be seen from space."


def test_keeps_verbatim_whitespace_and_case_tolerant():
    assert _appears_in_passage("the world's LARGEST   coral system", PASSAGE)


def test_rejects_fabricated_sentence():
    assert not _appears_in_passage("Built by ancient engineers", PASSAGE)


def test_ground_support_keeps_only_present():
    out = _ground_support(["It can be seen from space.", "Totally invented."], PASSAGE)
    assert out == ["It can be seen from space."]


def test_ground_support_drops_trivially_short():
    assert _ground_support(["ab"], PASSAGE) == []


def test_ground_support_empty_passage_drops_all():
    assert _ground_support(["anything at all"], "") == []
