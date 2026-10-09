import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.db import STATUSES, STATUS_COLORS, mask_aadhaar, fmt_date
import datetime


def test_statuses_count():
    assert len(STATUSES) == 12


def test_status_colors_keys():
    for s in STATUSES:
        assert s in STATUS_COLORS, f"Missing color for status: {s}"


def test_mask_aadhaar_12_digits():
    result = mask_aadhaar("123456789012")
    assert result == "XXXX-XXXX-9012"


def test_mask_aadhaar_with_spaces():
    result = mask_aadhaar("1234 5678 9012")
    assert result == "XXXX-XXXX-9012"


def test_mask_aadhaar_short():
    result = mask_aadhaar("12345")
    assert result == "12345"


def test_mask_aadhaar_none():
    assert mask_aadhaar(None) is None


def test_fmt_date_none():
    assert fmt_date(None) == ""


def test_fmt_date_date_obj():
    d = datetime.date(2024, 3, 15)
    assert fmt_date(d) == "15-03-2024"


def test_fmt_date_datetime_obj():
    d = datetime.datetime(2024, 3, 15, 14, 30, 0)
    result = fmt_date(d)
    assert "15-03-2024" in result
    assert "02:30" in result


def test_fmt_date_string():
    result = fmt_date("2024-03-15")
    assert result == "15-03-2024"
