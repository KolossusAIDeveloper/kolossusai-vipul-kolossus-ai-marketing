import streamlit as st
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from auth import require_login
require_login()

import db
import importer

st.title("📥 Import Excel")
st.write("Upload a `Gandhidham I-4.0.xlsx` file to import or refresh contacts.")

uploaded = st.file_uploader("Choose Excel file", type=["xlsx"])

if uploaded:
    with st.spinner("Importing…"):
        result = importer.import_excel(uploaded, source_file=uploaded.name)

    st.success("Import complete!")
    col1, col2, col3 = st.columns(3)
    col1.metric("Rows Read", result["rows_read"])
    col2.metric("Inserted", result["inserted"])
    col3.metric("Updated", result["updated"])
    col4, col5, col6 = st.columns(3)
    col4.metric("Skipped", result["skipped"])
    col5.metric("Possible Duplicates", result["duplicates"])
    col6.metric("Data Quality Flags", result["quality_flags"])

    if result["duplicates"]:
        st.warning(
            f"{result['duplicates']} row(s) share a mobile number with an earlier row — "
            "check the `possible_duplicate_of` field on those contacts."
        )
    if result["quality_flags"]:
        st.warning(
            f"{result['quality_flags']} email address(es) flagged as `check_email` "
            "(domain looks like a typo of gmail.com)."
        )

    if st.button("Go to Contacts"):
        st.switch_page("views/contacts.py")
else:
    st.info(
        "No file selected. The app automatically imports `data/Gandhidham I-4.0.xlsx` "
        "on first run if it is present."
    )
    st.write(f"**Contacts currently in DB:** {db.count_users()}")
