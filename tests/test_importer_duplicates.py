import pandas as pd
from unittest.mock import Mock, patch

from backend.importer import import_excel


def make_workbook():
    # Match the importer's expected 13 Excel columns.
    return pd.DataFrame([[
        "1", "Alice Example", "Manager", "Acme",
        "9876543210", "alice@example.com", "General",
        "Female", "Micro", "", "IT", "Services",
        "Gandhidham",
    ]])


def make_connection(fetchone_results):
    cursor = Mock()
    cursor.fetchone.side_effect = fetchone_results

    conn = Mock()
    conn.cursor.return_value = cursor
    return conn, cursor


@patch("backend.importer.pd.read_excel")
@patch("backend.importer.db.get_conn")
def test_new_contact_is_flagged_if_mobile_already_exists(
    mock_get_conn, mock_read_excel
):
    mock_read_excel.return_value = make_workbook()

    # First lookup: contact does not already exist by source_file + sr_no.
    # Second lookup: same mobile belongs to database user ID 42.
    conn, cursor = make_connection([None, {"id": 42}])
    mock_get_conn.return_value = conn

    result = import_excel("fake.xlsx", source_file="new_file.xlsx")

    assert result["inserted"] == 1
    assert result["duplicates"] == 1
    assert result["skipped"] == 0

    # The INSERT's possible_duplicate_of value is parameter index 14.
    insert_call = next(
        call for call in cursor.execute.call_args_list
        if "INSERT INTO users" in call.args[0]
    )
    assert insert_call.args[1][14] == 42

    conn.commit.assert_called_once()
    conn.close.assert_called_once()


@patch("backend.importer.pd.read_excel")
@patch("backend.importer.db.get_conn")
def test_reimport_does_not_flag_contact_as_duplicate_of_itself(
    mock_get_conn, mock_read_excel
):
    mock_read_excel.return_value = make_workbook()

    # The contact already exists with ID 42; no earlier matching mobile exists.
    conn, cursor = make_connection([{"id": 42}, None])
    mock_get_conn.return_value = conn

    result = import_excel("fake.xlsx", source_file="same_file.xlsx")

    assert result["updated"] == 1
    assert result["duplicates"] == 0
    assert result["skipped"] == 0

    update_call = next(
        call for call in cursor.execute.call_args_list
        if "UPDATE users SET" in call.args[0]
    )
    assert update_call.args[1][13] is None

    conn.commit.assert_called_once()
    conn.close.assert_called_once()
