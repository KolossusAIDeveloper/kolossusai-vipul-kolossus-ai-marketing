"""Tests for the backend fixes ported to the PostgreSQL implementation.

The database is mocked (no live PostgreSQL needed): the db-layer tests check
the SQL and parameters sent to psycopg2, and the API tests call the real
FastAPI app in-process through a minimal ASGI client.
"""
import asyncio
import io
import json
import urllib.parse
from unittest.mock import Mock, patch

import psycopg2
import psycopg2.errors
import pytest
from openpyxl import Workbook

from backend import db
from backend import main

AUTH = {"authorization": "Bearer kolossus-static-token"}
CLOSED = sorted(db.CLOSED_STATUSES)


# ---------------------------------------------------------------- helpers
def make_conn(fetchone=None, fetchall=None, execute_error=None):
    cur = Mock()
    cur.fetchone.side_effect = list(fetchone or [])
    cur.fetchall.return_value = fetchall or []
    if execute_error is not None:
        cur.execute.side_effect = execute_error
    conn = Mock()
    conn.cursor.return_value = cur
    return conn, cur


def executed(cur):
    """[(sql, params), ...] for every cursor.execute call."""
    return [(c.args[0], c.args[1] if len(c.args) > 1 else None) for c in cur.execute.call_args_list]


def call_api(method, path, query=None, json_body=None, raw=None, content_type=None):
    """Send one request through the ASGI app (no network, no httpx needed)."""
    body = b""
    headers = dict(AUTH)
    if json_body is not None:
        body, headers["content-type"] = json.dumps(json_body).encode(), "application/json"
    if raw is not None:
        body, headers["content-type"] = raw, content_type
    headers["content-length"] = str(len(body))
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
        "scheme": "http", "path": path, "raw_path": path.encode(), "root_path": "",
        "query_string": urllib.parse.urlencode(query or {}).encode(),
        "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
        "client": ("test", 1), "server": ("test", 80),
    }
    out = {"status": None, "body": b""}

    async def run():
        sent = False

        async def receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.Event().wait()  # stay connected until the response is done

        async def send(msg):
            if msg["type"] == "http.response.start":
                out["status"] = msg["status"]
            elif msg["type"] == "http.response.body":
                out["body"] += msg.get("body", b"")

        await main.app(scope, receive, send)

    asyncio.run(run())
    return out


def multipart(filename, data):
    b = "testboundary"
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    return body, f"multipart/form-data; boundary={b}"


# ---------------------------------------------------------------- 1. pagination
@patch("backend.db.get_conn")
def test_get_users_paginates_correctly(mock_get_conn):
    conn, cur = make_conn(fetchone=[{"cnt": 750}], fetchall=[])
    mock_get_conn.return_value = conn

    db.get_users(page=2, page_size=100)

    select_sql, select_params = executed(cur)[1]
    assert select_sql.endswith("LIMIT %s OFFSET %s")
    assert select_params == [100, 100]


# ---------------------------------------------------------------- 2. editing a follow-up updates the contact
@patch("backend.db.recalc_user")
@patch("backend.db.get_conn")
def test_update_followup_recalculates_the_contact(mock_get_conn, mock_recalc):
    conn, cur = make_conn(fetchone=[{"user_id": 7}])
    mock_get_conn.return_value = conn

    db.update_followup(55, status_after="Interested", followup_at="2026-10-01T10:00")

    mock_recalc.assert_called_once_with(7)
    conn.commit.assert_called_once()


@patch("backend.db.get_conn")
def test_recalc_user_copies_status_and_dates_from_latest_followup(mock_get_conn):
    latest = {
        "status_after": "Demo Scheduled", "followup_at": "2026-10-09 10:00", "channel": "Call",
        "customer_said": "Book a demo", "call_result": "Connected", "next_followup_at": "2026-10-15 11:00",
    }
    conn, cur = make_conn(fetchone=[latest, {"cnt": 3}])
    mock_get_conn.return_value = conn

    db.recalc_user(7)

    update_sql, params = executed(cur)[2]
    assert update_sql.lstrip().startswith("UPDATE users SET")
    assert params == (
        "Demo Scheduled", "2026-10-09 10:00", "2026-10-09 10:00", "Call",
        "Book a demo", "Connected", "2026-10-15 11:00", 3, 7,
    )
    conn.commit.assert_called_once()
    conn.close.assert_called_once()


# ---------------------------------------------------------------- 3. closed statuses never keep a next date
@pytest.mark.parametrize("status", CLOSED)
@patch("backend.db.get_conn")
def test_insert_followup_drops_next_date_for_closed_status(mock_get_conn, status):
    conn, cur = make_conn()
    mock_get_conn.return_value = conn

    db.insert_followup(1, "2026-10-09T10:00", "Call", "Outbound", None, None, "Vipul", None, None,
                       None, "New", status, None, "2026-10-20T11:00")

    _, params = executed(cur)[0]
    assert params[11] == status
    assert params[13] is None  # next_followup_at


@patch("backend.db.get_conn")
def test_insert_followup_keeps_next_date_for_open_status(mock_get_conn):
    conn, cur = make_conn()
    mock_get_conn.return_value = conn

    db.insert_followup(1, "2026-10-09T10:00", "Call", "Outbound", None, None, "Vipul", None, None,
                       None, "New", "Interested", None, "2026-10-20T11:00")

    _, params = executed(cur)[0]
    assert params[13] == "2026-10-20T11:00"


@patch("backend.db.recalc_user")
@patch("backend.db.get_conn")
def test_update_followup_clears_next_date_when_status_is_closed(mock_get_conn, _recalc):
    conn, cur = make_conn(fetchone=[{"user_id": 7}])
    mock_get_conn.return_value = conn

    db.update_followup(55, status_after="Do Not Contact")

    clear = [(s, p) for s, p in executed(cur) if "next_followup_at = NULL" in s]
    assert len(clear) == 1
    assert "status_after = ANY(%s)" in clear[0][0]
    assert clear[0][1] == (55, CLOSED)


# ---------------------------------------------------------------- 4. overdue list excludes closed contacts
@patch("backend.db.get_conn")
def test_overdue_filter_excludes_closed_contacts(mock_get_conn):
    conn, cur = make_conn(fetchone=[{"cnt": 0}], fetchall=[])
    mock_get_conn.return_value = conn

    db.get_users(next_followup_filter="Overdue")

    count_sql, _ = executed(cur)[0]
    assert "next_followup_at::date < %s" in count_sql
    assert "current_status NOT IN" in count_sql
    for status in CLOSED:
        assert f"'{status}'" in count_sql


# ---------------------------------------------------------------- 5. % and _ match literally
@patch("backend.db.get_conn")
def test_search_escapes_like_wildcards(mock_get_conn):
    conn, cur = make_conn(fetchone=[{"cnt": 0}], fetchall=[])
    mock_get_conn.return_value = conn

    db.get_users(search="50%_off\\x")

    count_sql, params = executed(cur)[0]
    assert count_sql.count("ESCAPE '\\'") == 4
    assert params == ["%50\\%\\_off\\\\x%"] * 4


@patch("backend.db.get_conn")
def test_plain_search_is_unchanged(mock_get_conn):
    conn, cur = make_conn(fetchone=[{"cnt": 0}], fetchall=[])
    mock_get_conn.return_value = conn

    db.get_users(search="patel")

    _, params = executed(cur)[0]
    assert params == ["%patel%"] * 4


# ---------------------------------------------------------------- 6. alphabetic ID search does not crash
@pytest.mark.parametrize("value", ["abc", "12a", " "])
@patch("backend.db.get_conn")
def test_non_numeric_id_search_adds_no_dangling_placeholder(mock_get_conn, value):
    conn, cur = make_conn(fetchone=[{"cnt": 0}], fetchall=[])
    mock_get_conn.return_value = conn

    db.get_users(id_search=value)

    for sql, params in executed(cur):
        assert "id = %s" not in sql
        # psycopg2 raises when placeholders and values don't line up
        assert sql.count("%s") == len(params)


@patch("backend.db.get_conn")
def test_numeric_id_search_still_filters(mock_get_conn):
    conn, cur = make_conn(fetchone=[{"cnt": 1}], fetchall=[])
    mock_get_conn.return_value = conn

    db.get_users(id_search="42")

    count_sql, params = executed(cur)[0]
    assert "id = %s" in count_sql and params == [42]


# ---------------------------------------------------------------- 7. connections close when a save fails
@pytest.mark.parametrize("call", [
    lambda: db.insert_followup(1, "2026-10-09T10:00", "Call", "Outbound", None, None, "X", None,
                               None, None, "New", "Contacted", None, None),
    lambda: db.update_followup(55, channel="Call"),
    lambda: db.update_user(1, notes="x"),
    lambda: db.delete_followup(55),
    lambda: db.recalc_user(1),
], ids=["insert_followup", "update_followup", "update_user", "delete_followup", "recalc_user"])
@patch("backend.db.get_conn")
def test_connection_is_closed_when_a_save_fails(mock_get_conn, call):
    conn, _ = make_conn(execute_error=psycopg2.errors.NotNullViolation("boom"))
    mock_get_conn.return_value = conn

    with pytest.raises(psycopg2.IntegrityError):
        call()

    conn.close.assert_called_once()
    conn.commit.assert_not_called()


READ_CALLS = {
    "count_users": lambda: db.count_users(),
    "get_status_counts": lambda: db.get_status_counts(),
    "get_kpis": lambda: db.get_kpis(),
    "get_filter_options": lambda: db.get_filter_options(),
    "get_chart_data": lambda: db.get_chart_data(),
    "get_users": lambda: db.get_users(),
    "get_user": lambda: db.get_user(1),
    "get_followups": lambda: db.get_followups(1),
}


@pytest.mark.parametrize("name", list(READ_CALLS))
@patch("backend.db.get_conn")
def test_connection_is_closed_when_a_read_fails(mock_get_conn, name):
    conn, _ = make_conn(execute_error=psycopg2.errors.UndefinedTable('relation "users" does not exist'))
    mock_get_conn.return_value = conn

    with pytest.raises(psycopg2.ProgrammingError):
        READ_CALLS[name]()

    conn.close.assert_called_once()


@pytest.mark.parametrize("name,fetchone,fetchall,expected", [
    ("count_users", [{"cnt": 1200}], [], 1200),
    ("get_status_counts", [], [{"current_status": "New", "cnt": 205}, {"current_status": "Converted", "cnt": 76}],
     {"New": 205, "Converted": 76}),
    ("get_kpis", [{"cnt": 1200}, {"cnt": 31}, {"cnt": 430}, {"cnt": 12}, {"cnt": 76}], [],
     {"total": 1200, "due_today": 31, "overdue": 430, "contacted_week": 12, "converted": 76}),
    ("get_user", [{"id": 1, "full_name": "Vipul"}], [], {"id": 1, "full_name": "Vipul"}),
    ("get_user", [None], [], None),
    ("get_followups", [], [{"id": 9, "channel": "Call"}], [{"id": 9, "channel": "Call"}]),
], ids=["count_users", "get_status_counts", "get_kpis", "get_user", "get_user missing", "get_followups"])
@patch("backend.db.get_conn")
def test_successful_reads_return_same_values_and_close_once(mock_get_conn, name, fetchone, fetchall, expected):
    conn, _ = make_conn(fetchone=fetchone, fetchall=fetchall)
    mock_get_conn.return_value = conn

    assert READ_CALLS[name]() == expected
    conn.close.assert_called_once()


@patch("backend.db.get_conn")
def test_successful_get_users_returns_same_shape_and_closes_once(mock_get_conn):
    conn, _ = make_conn(fetchone=[{"cnt": 2}], fetchall=[{"id": 2}, {"id": 1}])
    mock_get_conn.return_value = conn

    assert db.get_users(page=1, page_size=100) == {
        "items": [{"id": 2}, {"id": 1}], "total": 2, "page": 1, "page_size": 100,
    }
    conn.close.assert_called_once()


# ---------------------------------------------------------------- 8. invalid follow-up data -> clear 400
@pytest.mark.parametrize("error", [
    psycopg2.errors.NotNullViolation('null value in column "followup_at" violates not-null constraint'),
    psycopg2.errors.ForeignKeyViolation('insert or update on table "followups" violates foreign key constraint'),
    psycopg2.errors.CheckViolation('new row for relation "followups" violates check constraint "followups_channel_check"'),
    psycopg2.errors.InvalidDatetimeFormat('invalid input syntax for type timestamp: "not-a-date"'),
], ids=["missing date", "unknown contact", "invalid channel", "bad date"])
@patch("backend.main.db.insert_followup")
def test_invalid_followup_returns_clear_400(mock_insert, error):
    mock_insert.side_effect = error

    r = call_api("POST", "/api/contacts/999/followups",
                 json_body={"channel": "Pigeon", "contacted_by": "X", "status_after": "Contacted"})

    assert r["status"] == 400
    detail = json.loads(r["body"])["detail"]
    assert detail.startswith("Invalid data:")
    assert str(error).split()[0] in detail


@patch("backend.main.db.update_followup")
def test_invalid_followup_edit_returns_clear_400(mock_update):
    mock_update.side_effect = psycopg2.errors.InvalidDatetimeFormat('invalid input syntax for type timestamp: "x"')

    r = call_api("PUT", "/api/followups/1", json_body={"followup_at": "x"})

    assert r["status"] == 400
    assert json.loads(r["body"])["detail"].startswith("Invalid data:")


# ---------------------------------------------------------------- 9. invalid uploads -> clear 400
def _wrong_sheet_xlsx():
    wb = Workbook()
    wb.active.title = "Data"
    wb.active.append(["Sr No", "Name"])
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


@pytest.mark.parametrize("filename,data", [
    ("notes.txt", b"this is not an excel file"),
    ("broken.xlsx", b"PK\x03\x04 not really a zip"),
    ("wrong_sheet.xlsx", _wrong_sheet_xlsx()),
], ids=["not excel", "corrupt xlsx", "wrong sheet name"])
@patch("backend.importer.db.get_conn")
def test_invalid_upload_returns_clear_400(mock_get_conn, filename, data):
    body, ctype = multipart(filename, data)

    r = call_api("POST", "/api/import", raw=body, content_type=ctype)

    assert r["status"] == 400
    assert json.loads(r["body"])["detail"].startswith("Could not read this file.")
    mock_get_conn.assert_not_called()  # rejected before touching the database
