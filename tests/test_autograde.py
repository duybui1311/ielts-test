from backend.service.autograde import raw_to_band, _norm


def test_band_top_listening():
    assert raw_to_band(40, 40, "listening") == 9.0


def test_band_reading_scaling():
    # 20/40 reading -> scaled 20 -> 20 >= 19 -> band 5.5
    assert raw_to_band(20, 40, "reading") == 5.5


def test_band_partial_total_scales_to_40():
    # 10/20 listening -> scaled 20 -> 20 >= 18 -> band 5.5
    assert raw_to_band(10, 20, "listening") == 5.5


def test_band_floor_is_2_5():
    assert raw_to_band(0, 40, "reading") == 2.5


def test_band_zero_total_no_div_by_zero():
    assert raw_to_band(0, 0, "reading") == 2.5


def test_norm_collapses_and_lowercases():
    assert _norm("  Hello   World ") == "hello world"
    assert _norm(None) == ""
