"""Basic smoke tests — do not require a live DB connection."""
import sys
import types
from pathlib import Path

# Make the repo root importable from the tests/ subdirectory
sys.path.insert(0, str(Path(__file__).parent.parent))


def _mock_psycopg2():
    """Provide a minimal psycopg2 stub so db.py can be imported without a server."""
    mod = types.ModuleType("psycopg2")
    extras = types.ModuleType("psycopg2.extras")
    extras.RealDictCursor = object
    mod.extras = extras
    mod.connect = lambda **kw: None
    sys.modules.setdefault("psycopg2", mod)
    sys.modules.setdefault("psycopg2.extras", extras)


_mock_psycopg2()

import db  # noqa: E402


def test_statuses_count():
    assert len(db.STATUSES) == 12


def test_statuses_no_duplicates():
    assert len(db.STATUSES) == len(set(db.STATUSES))


def test_closed_statuses_subset():
    assert db.CLOSED_STATUSES.issubset(set(db.STATUSES))


def test_status_colors_complete():
    for s in db.STATUSES:
        assert s in db.STATUS_COLORS, f"Missing color for status: {s}"


def test_channels_not_empty():
    assert len(db.CHANNELS) > 0


def test_mask_aadhaar_12_digits():
    assert db.mask_aadhaar("123456789012") == "XXXX-XXXX-9012"


def test_mask_aadhaar_none():
    assert db.mask_aadhaar(None) is None


def test_mask_aadhaar_non_aadhaar():
    result = db.mask_aadhaar("UDYAM-GJ-13-0051439")
    assert result == "UDYAM-GJ-13-0051439"


def test_fmt_date_empty():
    assert db.fmt_date(None) == ""
    assert db.fmt_date("") == ""


def test_fmt_date_date_string():
    result = db.fmt_date("2026-10-07")
    assert result == "07-10-2026"


def test_fmt_date_datetime_string():
    result = db.fmt_date("2026-10-07 14:30:00")
    assert "07-10-2026" in result
    assert "PM" in result or "AM" in result


def test_get_contacted_this_week_range_format():
    """Range strings must be valid datetime strings covering Monday 00:00:00 to today 23:59:59."""
    import datetime
    w_from, w_to = db.get_contacted_this_week_range()
    # Must end with time components
    assert w_from.endswith("00:00:00")
    assert w_to.endswith("23:59:59")
    # Monday of current ISO week
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    assert w_from.startswith(monday.isoformat())
    assert w_to.startswith(today.isoformat())


def test_get_contacted_this_week_range_monday_is_start_of_week():
    """Monday (weekday 0) should be the same as the from date."""
    import datetime
    w_from, _ = db.get_contacted_this_week_range()
    from_date = datetime.date.fromisoformat(w_from[:10])
    assert from_date.weekday() == 0  # 0 = Monday
