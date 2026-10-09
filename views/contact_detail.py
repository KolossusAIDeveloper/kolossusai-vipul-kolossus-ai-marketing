import datetime
import streamlit as st
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from auth import require_login
require_login()

import db

# ── Get contact id ─────────────────────────────────────────────────────────────
contact_id = st.query_params.get("id") or st.session_state.get("contact_id")
if not contact_id:
    st.warning("No contact selected.")
    if st.button("← Back to Contacts"):
        st.switch_page("views/contacts.py")
    st.stop()

try:
    contact_id = int(contact_id)
except (ValueError, TypeError):
    st.error("Invalid contact ID.")
    st.stop()

user = db.get_user(contact_id)
if not user:
    st.error(f"Contact #{contact_id} not found.")
    if st.button("← Back to Contacts"):
        st.switch_page("views/contacts.py")
    st.stop()

agent_name = st.session_state.get("agent_name", "Team")

# ── Back button ────────────────────────────────────────────────────────────────
if st.button("← Back to Contacts"):
    st.switch_page("views/contacts.py")

# ── Header ─────────────────────────────────────────────────────────────────────
status = user.get("current_status", "New")
color = db.STATUS_COLORS.get(status, "#9e9e9e")
st.markdown(
    f"## {user.get('full_name', '')}  "
    f"<span style='background:{color};color:#fff;padding:3px 10px;border-radius:12px;font-size:0.8em'>{status}</span>",
    unsafe_allow_html=True,
)
if user.get("designation") or user.get("company"):
    st.caption(f"{user.get('designation', '')}  @  {user.get('company', '')}")

st.divider()

# ── Two columns ───────────────────────────────────────────────────────────────
col_left, col_right = st.columns([1, 1])

with col_left:
    with st.container(border=True):
        st.subheader("📇 Profile")

        if user.get("possible_duplicate_of"):
            st.warning(f"⚠ Same mobile as #{user['possible_duplicate_of']}")

        mobile = user.get("mobile")
        email = user.get("email")

        def _row(label, val):
            if val:
                st.markdown(f"**{label}:** {val}")

        _row("Sr. No.", user.get("sr_no"))
        if mobile:
            st.markdown(f"**Mobile:** [📞 {mobile}](tel:{mobile})")
            st.link_button(f"💬 WhatsApp {mobile}", f"https://wa.me/91{mobile}")
        if email:
            st.markdown(f"**Email:** [{email}](mailto:{email})")
        _row("Designation", user.get("designation"))
        _row("Company", user.get("company"))
        _row("Company Type", user.get("company_type"))
        _row("Sector", user.get("sector"))
        _row("MSME Type", user.get("msme_type"))
        _row("Gender", user.get("gender"))
        _row("Social Category", user.get("social_category"))
        _row("City", user.get("city"))
        _row("Address", user.get("address"))

        # Udyam/Aadhaar with show toggle
        udyam = user.get("udyam_aadhaar")
        if udyam:
            show_udyam = st.checkbox("Show Udyam/Aadhaar number", value=False)
            if show_udyam:
                st.markdown(f"**Udyam/Aadhaar:** {udyam}")
            else:
                st.markdown(f"**Udyam/Aadhaar:** {db.mask_aadhaar(udyam)}")

        _row("Lead Source", user.get("lead_source"))
        if user.get("data_quality_flag"):
            st.caption(f"⚠ Data quality flag: {user['data_quality_flag']}")

        st.markdown("---")
        with st.expander("✏️ Edit Contact Details", expanded=False):
            with st.form("edit_user_form"):
                e_designation = st.text_input("Designation", value=user.get("designation") or "")
                e_company = st.text_input("Company", value=user.get("company") or "")
                e_mobile = st.text_input("Mobile", value=user.get("mobile") or "")
                e_email = st.text_input("Email", value=user.get("email") or "")
                e_sector = st.text_input("Sector", value=user.get("sector") or "")
                e_company_type = st.selectbox(
                    "Company Type",
                    ["", "Manufacturing", "Service"],
                    index=["", "Manufacturing", "Service"].index(user.get("company_type") or ""),
                )
                e_msme_type = st.selectbox(
                    "MSME Type",
                    ["", "Micro", "Small", "Medium"],
                    index=["", "Micro", "Small", "Medium"].index(user.get("msme_type") or ""),
                )
                e_assigned_to = st.text_input("Assigned To", value=user.get("assigned_to") or "")
                e_priority = st.selectbox(
                    "Priority",
                    ["High", "Medium", "Low"],
                    index=["High", "Medium", "Low"].index(user.get("priority") or "Medium"),
                )
                e_interest = st.selectbox(
                    "Interest Level",
                    ["", "Hot", "Warm", "Cold"],
                    index=["", "Hot", "Warm", "Cold"].index(user.get("interest_level") or ""),
                )
                e_notes = st.text_area("Notes", value=user.get("notes") or "")
                if st.form_submit_button("💾 Save Changes", use_container_width=True):
                    db.update_user(
                        contact_id,
                        designation=e_designation or None,
                        company=e_company or None,
                        mobile=e_mobile or None,
                        email=e_email.lower() if e_email else None,
                        sector=e_sector or None,
                        company_type=e_company_type or None,
                        msme_type=e_msme_type or None,
                        assigned_to=e_assigned_to or None,
                        priority=e_priority,
                        interest_level=e_interest or None,
                        notes=e_notes or None,
                    )
                    st.toast("Details saved.")
                    st.rerun()

with col_right:
    with st.container(border=True):
        st.subheader("📊 Follow-up Summary")
        st.markdown(
            f"**Status:** <span style='background:{color};color:#fff;padding:2px 8px;border-radius:8px'>{status}</span>",
            unsafe_allow_html=True,
        )
        st.markdown(f"**Last Follow-up:** {db.fmt_date(user.get('last_followup_at')) or '—'}")
        st.markdown(f"**Last Channel:** {user.get('last_channel') or '—'}")

        next_fu = user.get("next_followup_at")
        next_fu_str = str(next_fu) if next_fu else None
        today_str = datetime.date.today().isoformat()
        if next_fu_str and next_fu_str[:10] < today_str:
            st.markdown(f"**Next Follow-up:** 🔴 {db.fmt_date(next_fu)}")
        else:
            st.markdown(f"**Next Follow-up:** {db.fmt_date(next_fu) or '—'}")

        st.markdown(f"**Total Follow-ups:** {user.get('followup_count', 0)}")
        st.markdown(f"**Lead Source:** {user.get('lead_source', '—')}")
        st.markdown(f"**Priority:** {user.get('priority', '—')}")
        st.markdown(f"**Interest Level:** {user.get('interest_level') or '—'}")
        st.markdown(f"**Assigned To:** {user.get('assigned_to') or '—'}")
        if user.get("notes"):
            st.markdown(f"**Notes:** {user['notes']}")

st.divider()

# ── Add Follow-up form ─────────────────────────────────────────────────────────
st.subheader("➕ Add Follow-up")

CLOSED = db.CLOSED_STATUSES

with st.form("add_followup_form", clear_on_submit=True):
    row1a, row1b = st.columns(2)
    with row1a:
        fu_date = st.date_input("Date", value=datetime.date.today(), format="DD-MM-YYYY")
    with row1b:
        fu_time = st.time_input("Time", value=datetime.datetime.now().time())

    row2a, row2b = st.columns(2)
    with row2a:
        channel = st.selectbox("Channel *", db.CHANNELS)
        direction = st.selectbox("Direction", ["Outbound", "Inbound"])
    with row2b:
        call_result = st.selectbox("Call Result", [""] + db.CALL_RESULTS)
        duration_min = st.number_input("Duration (min)", min_value=0, value=0, step=1)

    row3a, row3b = st.columns(2)
    with row3a:
        contacted_by = st.text_input("Contacted By *", value=agent_name)
    with row3b:
        spoke_with = st.text_input("Spoke With", value=user.get("full_name", ""))

    customer_said = st.text_area("What They Said")
    our_notes = st.text_area("Our Notes / Pitch")

    row4a, row4b = st.columns(2)
    with row4a:
        status_after = st.selectbox(
            "Status After *",
            db.STATUSES,
            index=db.STATUSES.index(status) if status in db.STATUSES else 0,
        )
    with row4b:
        next_action = st.text_input("Next Action")

    row5a, row5b = st.columns(2)
    with row5a:
        next_fu_date = st.date_input("Next Follow-up Date (optional)", value=None, format="DD-MM-YYYY")
    with row5b:
        next_fu_time = st.time_input("Next Follow-up Time", value=datetime.time(10, 0))

    submitted = st.form_submit_button("💾 Save Follow-up", use_container_width=True)

    if submitted:
        errors = []
        if not channel:
            errors.append("Channel is required.")
        if not contacted_by.strip():
            errors.append("Contacted By is required.")
        if call_result in ("Connected", "Replied") and not customer_said.strip():
            errors.append('"What They Said" is required when call result is Connected or Replied.')
        if next_fu_date and status_after not in CLOSED:
            if str(next_fu_date) < datetime.date.today().isoformat():
                errors.append("Next follow-up date must not be in the past.")

        if errors:
            for e in errors:
                st.error(e)
        else:
            followup_at = f"{fu_date} {fu_time.strftime('%H:%M:%S')}"
            next_followup_at = None
            if next_fu_date:
                next_followup_at = f"{next_fu_date} {next_fu_time.strftime('%H:%M:%S')}"

            db.insert_followup(
                user_id=contact_id,
                followup_at=followup_at,
                channel=channel,
                direction=direction,
                call_result=call_result or None,
                duration_min=int(duration_min) if duration_min else None,
                contacted_by=contacted_by.strip(),
                spoke_with=spoke_with.strip() or None,
                customer_said=customer_said.strip() or None,
                our_notes=our_notes.strip() or None,
                status_before=status,
                status_after=status_after,
                next_action=next_action.strip() or None,
                next_followup_at=next_followup_at,
            )
            st.toast("Follow-up saved ✓")
            st.rerun()

st.divider()

# ── Follow-up History ──────────────────────────────────────────────────────────
st.subheader("📜 Follow-up History")

followups = db.get_followups(contact_id)

CHANNEL_ICONS = {
    "Call": "📞", "WhatsApp": "💬", "Email": "📧", "SMS": "💬",
    "Meeting": "🤝", "Video Call": "🎥", "Visit": "🏢",
    "LinkedIn": "🔗", "Other": "📌",
}

if not followups:
    st.info("No follow-ups yet — add the first one above.")
else:
    for fu in followups:
        with st.container(border=True):
            icon = CHANNEL_ICONS.get(fu.get("channel", ""), "📌")
            duration_txt = f" · {fu['duration_min']} min" if fu.get("duration_min") else ""
            call_result_txt = f" · {fu['call_result']}" if fu.get("call_result") else ""

            st.markdown(
                f"**{db.fmt_date(fu['followup_at'])} · {icon} {fu['channel']} · "
                f"{fu['direction']}{call_result_txt}{duration_txt}**"
            )
            st.caption(
                f"By: {fu.get('contacted_by', '—')}"
                + (f" → {fu['spoke_with']}" if fu.get("spoke_with") else "")
            )

            if fu.get("customer_said"):
                st.markdown(f"**They said:** {fu['customer_said']}")
            if fu.get("our_notes"):
                st.markdown(f"Our notes: {fu['our_notes']}")

            s_before = fu.get("status_before") or "—"
            s_after = fu.get("status_after") or "—"
            next_txt = ""
            if fu.get("next_action"):
                next_txt = f" · Next: {fu['next_action']}"
            if fu.get("next_followup_at"):
                next_txt += f" on {db.fmt_date(fu['next_followup_at'])}"
            st.caption(f"Status: {s_before} → {s_after}{next_txt}")

            btn_col1, btn_col2, _ = st.columns([1, 1, 5])
            with btn_col1:
                if st.button("✏ Edit", key=f"edit_{fu['id']}"):
                    st.session_state[f"editing_{fu['id']}"] = True

            with btn_col2:
                if st.button("🗑 Delete", key=f"del_{fu['id']}"):
                    st.session_state[f"confirm_del_{fu['id']}"] = True

            # Delete confirm
            if st.session_state.get(f"confirm_del_{fu['id']}"):
                confirm = st.checkbox(
                    "Confirm delete this follow-up",
                    key=f"chk_del_{fu['id']}",
                )
                if confirm:
                    db.delete_followup(fu["id"])
                    st.toast("Follow-up deleted.")
                    for k in [f"confirm_del_{fu['id']}", f"chk_del_{fu['id']}"]:
                        if k in st.session_state:
                            del st.session_state[k]
                    st.rerun()

            # Inline edit form
            if st.session_state.get(f"editing_{fu['id']}"):
                with st.form(f"edit_fu_form_{fu['id']}"):
                    _fat = fu["followup_at"]
                    if hasattr(_fat, "strftime"):
                        _fat = _fat.strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        _fat = str(_fat)
                    ef_date = st.date_input(
                        "Date", value=datetime.date.fromisoformat(_fat[:10]),
                        format="DD-MM-YYYY",
                    )
                    ef_time_val = datetime.time(
                        int(_fat[11:13]),
                        int(_fat[14:16]),
                    ) if len(_fat) > 10 else datetime.time(9, 0)
                    ef_time = st.time_input("Time", value=ef_time_val)
                    ef_channel = st.selectbox(
                        "Channel", db.CHANNELS,
                        index=db.CHANNELS.index(fu["channel"]) if fu["channel"] in db.CHANNELS else 0,
                    )
                    ef_direction = st.selectbox(
                        "Direction", ["Outbound", "Inbound"],
                        index=["Outbound", "Inbound"].index(fu.get("direction", "Outbound")),
                    )
                    ef_call_result = st.selectbox(
                        "Call Result", [""] + db.CALL_RESULTS,
                        index=([""] + db.CALL_RESULTS).index(fu["call_result"])
                        if fu.get("call_result") in db.CALL_RESULTS else 0,
                    )
                    ef_duration = st.number_input("Duration (min)", value=fu.get("duration_min") or 0)
                    ef_contacted_by = st.text_input("Contacted By", value=fu.get("contacted_by") or "")
                    ef_spoke_with = st.text_input("Spoke With", value=fu.get("spoke_with") or "")
                    ef_customer_said = st.text_area("What They Said", value=fu.get("customer_said") or "")
                    ef_our_notes = st.text_area("Our Notes", value=fu.get("our_notes") or "")
                    ef_status_after = st.selectbox(
                        "Status After",
                        db.STATUSES,
                        index=db.STATUSES.index(fu["status_after"]) if fu["status_after"] in db.STATUSES else 0,
                    )
                    ef_next_action = st.text_input("Next Action", value=fu.get("next_action") or "")

                    save_edit, cancel_edit = st.columns(2)
                    with save_edit:
                        if st.form_submit_button("Save"):
                            db.update_followup(
                                fu["id"],
                                followup_at=f"{ef_date} {ef_time.strftime('%H:%M:%S')}",
                                channel=ef_channel,
                                direction=ef_direction,
                                call_result=ef_call_result or None,
                                duration_min=int(ef_duration) if ef_duration else None,
                                contacted_by=ef_contacted_by,
                                spoke_with=ef_spoke_with or None,
                                customer_said=ef_customer_said or None,
                                our_notes=ef_our_notes or None,
                                status_after=ef_status_after,
                                next_action=ef_next_action or None,
                            )
                            db.recalc_user(contact_id)
                            del st.session_state[f"editing_{fu['id']}"]
                            st.toast("Follow-up updated.")
                            st.rerun()
                    with cancel_edit:
                        if st.form_submit_button("Cancel"):
                            del st.session_state[f"editing_{fu['id']}"]
                            st.rerun()
