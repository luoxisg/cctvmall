from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st

from scripts.hermes_intake import (
    build_manual_payload,
    load_local_env,
    process_telegram_updates,
    read_recent_logs,
    run_manual_intake,
)


VAULT_ROOT = Path(__file__).resolve().parents[1]
load_local_env(VAULT_ROOT)

st.set_page_config(
    page_title="Hermes Agent Console",
    page_icon="H",
    layout="wide",
)


def env_status() -> dict[str, str]:
    env_path = VAULT_ROOT / "Hermes_Agent" / ".env"
    return {
        "Vault Path": str(VAULT_ROOT),
        ".env Present": "Yes" if env_path.exists() else "No",
        "Telegram Token": "Configured" if os.environ.get("TELEGRAM_BOT_TOKEN", "") else "Read from .env or not set",
    }


st.title("Hermes Agent Visual PMO Intake Console")
st.caption("HDB Cloud BMS-CCTV / VA / Footfall PMO vault")

with st.sidebar:
    st.subheader("Execution Controls")
    source_type = st.selectbox("Source Type", ["Telegram", "Email", "WhatsApp Summary"])
    sender = st.text_input("Sender", value="TBC")
    sender_email = st.text_input("Sender Email", value="")
    subject = st.text_input("Subject / Title", value="")
    update_obsidian = st.checkbox("Update Obsidian records", value=False)
    generate_export = st.checkbox("Generate Online_Export", value=False)
    git_commit = st.checkbox("Git commit safe files", value=False)
    git_push = st.checkbox("Git push after commit", value=False, disabled=not git_commit)
    commit_message = st.text_input("Git Commit Message", value="Hermes Agent visual sync")
    st.markdown("---")
    st.subheader("Environment")
    st.json(env_status())
    st.markdown("---")
    st.subheader("Telegram Polling")
    st.caption("The GUI is manual by default. Use the button below to fetch bot messages on demand.")
    poll_telegram_clicked = st.button("Poll Telegram Now")


col_left, col_right = st.columns([1.3, 1.0])

with col_left:
    message_text = st.text_area(
        "Paste Telegram / Email / WhatsApp summary text",
        height=280,
        placeholder="Paste the incoming message or summary here...",
    )

    preview_clicked = st.button("Preview Classification", type="primary")
    process_clicked = st.button("Run Hermes Agent")

with col_right:
    st.subheader("Operator Rules")
    st.markdown(
        """
- Do not mark actions `Done` without verified source evidence.
- Use `TBC` when date, owner, or site is missing.
- Use `Pending Verification` when the message is uncertain.
- Safe export includes dashboard summaries only.
- Git push is optional and disabled unless commit is selected.
"""
    )
    st.info("This UI is not a live Telegram listener. It only processes Telegram when you click `Poll Telegram Now`.")


def render_result(result: dict) -> None:
    classification = result.get("classification", {})
    payload = result.get("payload", {})
    processed = result.get("processed", {})

    left, right = st.columns(2)
    with left:
        st.subheader("Classification Result")
        st.json(classification)

    with right:
        st.subheader("Extracted Action")
        extracted = {
            "action_title": classification.get("title", "TBC"),
            "owner_org": classification.get("sender_org", "TBC"),
            "related_site": classification.get("related_site", "TBC"),
            "workstream": classification.get("workstream", "TBC"),
            "priority": classification.get("priority", "TBC"),
            "due_date": classification.get("due_date", "TBC"),
            "status": classification.get("status", "Pending Verification"),
            "evidence_status": classification.get("evidence_status", "Pending Verification"),
        }
        st.json(extracted)

    st.subheader("Payload Summary")
    st.json(
        {
            "source_channel": payload.get("source_channel", "TBC"),
            "subject": payload.get("subject", "TBC"),
            "sender_name": payload.get("sender_name", "TBC"),
            "sender_email": payload.get("sender_email", ""),
            "received_at": payload.get("received_at", "TBC"),
        }
    )

    st.subheader("Files Updated")
    updated_files = result.get("updated_files", [])
    if updated_files:
        st.code("\n".join(updated_files))
    else:
        st.info("No files updated yet. Preview mode or no export/sync requested.")

    if processed:
        st.subheader("Processing Result")
        st.json(processed)

    sync_text = result.get("sync", "")
    if sync_text:
        st.subheader("Git Sync")
        st.code(sync_text)


def build_preview_result() -> dict:
    payload = build_manual_payload(
        source_type=source_type,
        text=message_text,
        sender=sender,
        sender_email=sender_email,
        subject=subject,
    )
    return run_manual_intake(
        vault_root=VAULT_ROOT,
        payload=payload,
        update_obsidian=False,
        generate_export=False,
        git_commit=False,
        git_push=False,
    )


if poll_telegram_clicked:
    telegram_results = process_telegram_updates(VAULT_ROOT, update_obsidian=update_obsidian)
    st.session_state["hermes_telegram_results"] = telegram_results
    if telegram_results:
        latest = telegram_results[-1]
        if latest.get("details", {}).get("payload"):
            st.session_state["hermes_preview"] = latest["details"]
        elif latest.get("details", {}).get("classification"):
            st.session_state["hermes_preview"] = latest["details"]
        elif latest.get("classification"):
            st.session_state["hermes_preview"] = latest
        st.success(f"Telegram poll completed. {len(telegram_results)} update(s) processed.")
    else:
        st.info("No new Telegram updates were found.")

if preview_clicked:
    if not message_text.strip():
        st.warning("Paste a message first.")
    else:
        st.session_state["hermes_preview"] = build_preview_result()

if process_clicked:
    if not message_text.strip():
        st.warning("Paste a message first.")
    else:
        payload = build_manual_payload(
            source_type=source_type,
            text=message_text,
            sender=sender,
            sender_email=sender_email,
            subject=subject,
        )
        result = run_manual_intake(
            vault_root=VAULT_ROOT,
            payload=payload,
            update_obsidian=update_obsidian,
            generate_export=generate_export,
            git_commit=git_commit,
            git_push=git_push,
            commit_message=commit_message.strip() or None,
        )
        st.session_state["hermes_preview"] = result
        st.success("Hermes Agent run completed.")


if "hermes_preview" in st.session_state:
    render_result(st.session_state["hermes_preview"])


if "hermes_telegram_results" in st.session_state:
    st.subheader("Telegram Poll Results")
    telegram_results = st.session_state["hermes_telegram_results"]
    st.caption("Latest on-demand Telegram processing results from Hermes.")
    if telegram_results:
        st.json(telegram_results)
    else:
        st.info("No Telegram polling results yet.")


st.subheader("Recent Logs")
st.code(read_recent_logs(VAULT_ROOT, lines=40))

with st.expander("Sample Message for Testing"):
    sample = {
        "source_type": "Email",
        "sender": "Ethan / Xjera Labs",
        "sender_email": "Internal / Confidential",
        "subject": "Loyang Point submission follow-up",
        "message": (
            "Please complete the Device Catalogue, Equipment List, Floor Plan Markup, "
            "Cable Route and Power Point Tap-in Location for Loyang Point before 4 May 2026. "
            "Pending MA sign-off status is still TBC."
        ),
    }
    st.code(json.dumps(sample, indent=2))
