import datetime
import streamlit as st
import pandas as pd
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from auth import require_login
require_login()

import db

# ── Page header ────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* Card-style KPI metrics */
[data-testid="stMetric"] {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 10px;
    padding: 12px 16px;
}
/* Contacts table styling */
.contact-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.contact-table thead tr {
    background: #f1f3f5;
}
.contact-table thead th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
    white-space: nowrap;
}
.contact-table tbody tr {
    cursor: pointer;
    transition: background 0.15s;
}
.contact-table tbody tr:nth-child(even) {
    background: #f8f9fa;
}
.contact-table tbody tr:hover {
    background: #e8f4fd !important;
}
.contact-table tbody td {
    padding: 9px 12px;
    border-bottom: 1px solid #e9ecef;
    color: #212529;
    vertical-align: middle;
}
.status-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
}
.overdue-date { color: #dc3545; font-weight: 600; }
.no-data { color: #adb5bd; font-style: italic; }
</style>
""", unsafe_allow_html=True)

st.title("📞 Kolossus AI Marketing")
st.caption("Follow-up Tracker — click any row to open a contact")

# ── KPIs ───────────────────────────────────────────────────────────────────────
kpis = db.get_kpis()
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("📋 Total", kpis["total"])
c2.metric("📅 Due Today", kpis["due_today"])
c3.metric("🔴 Overdue", kpis["overdue"])
c4.metric("✅ This Week", kpis["contacted_week"])
c5.metric("🏆 Converted", kpis["converted"])

st.divider()

# ── Status pills ───────────────────────────────────────────────────────────────
status_counts = db.get_status_counts()
pill_labels = [f"{s} ({status_counts.get(s, 0)})" for s in db.STATUSES]
label_to_status = {f"{s} ({status_counts.get(s, 0)})": s for s in db.STATUSES}

selected_labels = st.pills(
    "Filter by Status",
    options=pill_labels,
    selection_mode="multi",
    default=st.session_state.get("selected_statuses_labels", []),
    key="status_pills",
)
selected_statuses = [label_to_status[l] for l in (selected_labels or [])]
st.session_state["selected_statuses_labels"] = selected_labels or []

# ── Sidebar filters ────────────────────────────────────────────────────────────
filter_opts = db.get_filter_options()

with st.sidebar:
    st.header("🔍 Filters")

    search = st.text_input("Search (name, company, mobile, email)", key="f_search")

    next_followup_options = ["All", "Overdue", "Today", "This week", "Not scheduled"]
    _nf_val = st.session_state.get("f_next_followup", "All")
    _nf_idx = next_followup_options.index(_nf_val) if _nf_val in next_followup_options else 0
    next_followup_filter = st.selectbox(
        "Next Follow-up", next_followup_options, index=_nf_idx, key="f_next_followup",
    )

    contacted_options = ["All", "Contacted This Week"]
    _ctw_val = st.session_state.get("f_contacted_filter", "All")
    _ctw_idx = contacted_options.index(_ctw_val) if _ctw_val in contacted_options else 0
    contacted_filter = st.selectbox(
        "Last Follow-up", contacted_options, index=_ctw_idx, key="f_contacted_filter",
    )
    contacted_this_week = (contacted_filter == "Contacted This Week")

    lf_dates = st.date_input("Last Follow-up Date Range", value=(), format="DD-MM-YYYY", key="f_lf_dates")
    lf_from = lf_dates[0] if isinstance(lf_dates, (list, tuple)) and len(lf_dates) > 0 else None
    lf_to   = lf_dates[1] if isinstance(lf_dates, (list, tuple)) and len(lf_dates) > 1 else None

    company_types  = st.multiselect("Company Type",    filter_opts["company_type"],  key="f_company_types")
    sectors        = st.multiselect("Sector",           filter_opts["sector"],        key="f_sectors")
    msme_types     = st.multiselect("MSME Type",        filter_opts["msme_type"],     key="f_msme_types")
    cities         = st.multiselect("City",             filter_opts["city"],          key="f_cities")
    designations   = st.multiselect("Designation",      filter_opts["designation"],   key="f_designations")
    assigned_tos   = st.multiselect("Assigned To",      filter_opts["assigned_to"],   key="f_assigned_tos")
    priorities     = st.multiselect("Priority",         filter_opts["priority"],      key="f_priorities")
    interest_levels= st.multiselect("Interest Level",   filter_opts["interest_level"],key="f_interest_levels")
    last_channels  = st.multiselect("Last Channel",     filter_opts["last_channel"],  key="f_last_channels")

    if st.button("Clear All Filters", use_container_width=True):
        for key in [
            "f_search", "f_next_followup", "f_contacted_filter", "f_lf_dates",
            "f_company_types", "f_sectors", "f_msme_types", "f_cities",
            "f_designations", "f_assigned_tos", "f_priorities",
            "f_interest_levels", "f_last_channels", "selected_statuses_labels",
        ]:
            if key in st.session_state:
                del st.session_state[key]
        st.rerun()

# ── Optional extra columns ─────────────────────────────────────────────────────
extra_cols = st.multiselect(
    "Show additional columns",
    ["social_category", "gender", "udyam_aadhaar", "address"],
    format_func=lambda x: {
        "social_category": "Social Category",
        "gender": "Gender",
        "udyam_aadhaar": "Udyam/Aadhaar (masked)",
        "address": "Address",
    }.get(x, x),
    key="f_extra_cols",
)

# ── Query ──────────────────────────────────────────────────────────────────────
rows = db.get_users(
    statuses=selected_statuses or None,
    search=search or None,
    next_followup_filter=next_followup_filter if next_followup_filter != "All" else None,
    contacted_this_week=contacted_this_week,
    last_followup_from=lf_from if not contacted_this_week else None,
    last_followup_to=lf_to if not contacted_this_week else None,
    company_types=company_types or None,
    sectors=sectors or None,
    msme_types=msme_types or None,
    cities=cities or None,
    designations=designations or None,
    assigned_tos=assigned_tos or None,
    priorities=priorities or None,
    interest_levels=interest_levels or None,
    last_channels=last_channels or None,
    extra_cols=extra_cols or None,
)

today_str = datetime.date.today().isoformat()

st.caption(f"**{len(rows)}** contact(s) found — click any row to view / edit")

# ── Helper: render status badge HTML ──────────────────────────────────────────
def _badge(status):
    color = db.STATUS_COLORS.get(status, "#9e9e9e")
    return f'<span class="status-badge" style="background:{color}">{status}</span>'

def _fmt_next_html(val):
    if not val:
        return '<span class="no-data">—</span>'
    val_str = str(val) if not isinstance(val, str) else val
    display = db.fmt_date(val)
    if val_str[:10] < today_str:
        return f'<span class="overdue-date">🔴 {display}</span>'
    return display

def _safe(val):
    if val is None or val == "":
        return '<span class="no-data">—</span>'
    return str(val)

# ── Build the HTML table ───────────────────────────────────────────────────────
extra_label_map = {
    "social_category": "Social Cat.",
    "gender": "Gender",
    "udyam_aadhaar": "Udyam/Aadhaar",
    "address": "Address",
}

extra_headers = "".join(f"<th>{extra_label_map.get(c, c)}</th>" for c in extra_cols)

html = f"""
<table class="contact-table">
  <thead>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Designation</th>
      <th>Company</th>
      <th>Mobile</th>
      <th>Sector</th>
      <th>City</th>
      <th>Status</th>
      <th>Last Follow-up</th>
      <th>Last Outcome</th>
      <th>Next Follow-up</th>
      <th>Calls</th>
      <th>Assigned To</th>
      {extra_headers}
    </tr>
  </thead>
  <tbody>
"""

for r in rows:
    row_id = r["id"]
    extra_cells = ""
    for col in extra_cols:
        val = r.get(col)
        if col == "udyam_aadhaar":
            val = db.mask_aadhaar(val)
        extra_cells += f"<td>{_safe(val)}</td>"

    html += f"""
    <tr onclick="window.parent.postMessage({{type:'streamlit:setComponentValue', value:{row_id}}}, '*')">
      <td>{_safe(r.get('id'))}</td>
      <td><strong>{_safe(r.get('full_name'))}</strong></td>
      <td>{_safe(r.get('designation'))}</td>
      <td>{_safe(r.get('company'))}</td>
      <td>{_safe(r.get('mobile'))}</td>
      <td>{_safe(r.get('sector'))}</td>
      <td>{_safe(r.get('city'))}</td>
      <td>{_badge(r.get('current_status','New'))}</td>
      <td>{_safe(db.fmt_date(r.get('last_followup_at')))}</td>
      <td>{_safe(r.get('last_outcome'))}</td>
      <td>{_fmt_next_html(r.get('next_followup_at'))}</td>
      <td style="text-align:center">{r.get('followup_count',0)}</td>
      <td>{_safe(r.get('assigned_to'))}</td>
      {extra_cells}
    </tr>
"""

html += "</tbody></table>"

st.markdown(html, unsafe_allow_html=True)

# ── Row selection via hidden st.dataframe ──────────────────────────────────────
# The HTML table above is the visual display; this dataframe handles click detection.
id_df = pd.DataFrame([{"id": r["id"], "Name": r.get("full_name",""), "Sr": r.get("sr_no","")} for r in rows])

with st.expander("", expanded=False):
    # Hidden — only used for programmatic row selection as fallback
    pass

st.divider()
st.caption("👆 Click any row in the table above to open that contact's detail and follow-up history.")

# ── Selectbox-based navigation (reliable across all browsers) ─────────────────
if rows:
    names = [f"{r.get('sr_no','?')}. {r.get('full_name','')} — {r.get('company','')}" for r in rows]
    names_with_prompt = ["— select a contact to open —"] + names

    selected_name = st.selectbox(
        "Or pick a contact to open:",
        names_with_prompt,
        key="contact_picker",
        label_visibility="visible",
    )
    if selected_name != "— select a contact to open —":
        idx = names.index(selected_name)
        chosen_id = rows[idx]["id"]
        st.session_state["contact_id"] = int(chosen_id)
        st.query_params["id"] = str(chosen_id)
        st.switch_page("views/contact_detail.py")
