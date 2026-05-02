from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit("PyYAML is required. Install it with: pip install pyyaml") from exc

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from parse_message import classify_message, load_yaml_file  # noqa: E402


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9 _-]+", "", value or "TBC")
    collapsed = re.sub(r"\s+", " ", cleaned).strip()
    return collapsed[:80] or "TBC"


def markdown_link_for(path: str) -> str:
    normalized = path.replace("\\", "/")
    label = Path(normalized).stem
    return f"[[{normalized}|{label}]]"


def write_markdown(path: Path, frontmatter: Dict[str, Any], body: str) -> None:
    serialized = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).strip()
    content = f"---\n{serialized}\n---\n\n{body.strip()}\n"
    path.write_text(content, encoding="utf-8")


def append_section_text(path: Path, heading: str, text: str) -> None:
    existing = path.read_text(encoding="utf-8")
    marker = f"## {heading}"
    if marker not in existing:
        existing = f"{existing.rstrip()}\n\n{marker}\n\n"
    updated = f"{existing.rstrip()}\n{text.rstrip()}\n"
    path.write_text(updated, encoding="utf-8")


def find_existing_action(actions_folder: Path, action_title: str) -> Path | None:
    pattern = re.compile(r"^action_title:\s*(.+)$", re.MULTILINE)
    for candidate in actions_folder.glob("*.md"):
        try:
            text = candidate.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        match = pattern.search(text)
        if match and match.group(1).strip().strip('"') == action_title:
            return candidate
    return None


def create_message_note(
    vault_root: Path,
    payload: Dict[str, Any],
    classification: Dict[str, Any],
) -> str:
    emails_folder = vault_root / "06_Emails_Meetings"
    note_name = (
        f"Hermes Intake - {datetime.now().strftime('%Y-%m-%d')} - "
        f"{slugify(classification['title'])}.md"
    )
    note_path = emails_folder / note_name

    frontmatter = {
        "type": "message_intake",
        "source_channel": payload.get("source_channel", "TBC"),
        "subject": payload.get("subject", "TBC"),
        "sender_name": payload.get("sender_name", "TBC"),
        "sender_email": payload.get("sender_email", "TBC"),
        "sender_org": classification.get("sender_org", "TBC"),
        "related_site": classification.get("related_site", "TBC"),
        "workstream": classification.get("workstream", "TBC"),
        "status": "Pending Verification",
        "created_by": "Hermes Agent",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }

    body = f"""
# {classification['title']}

> [!summary] Intake Summary
> Internal intake summary created by Hermes Agent. Raw email content remains internal.

## Source

- Channel: {payload.get('source_channel', 'TBC')}
- Sender: {payload.get('sender_name', 'TBC')}
- Sender Org: {classification.get('sender_org', 'TBC')}
- Received At: {payload.get('received_at', 'TBC')}
- Source File: `{payload.get('source_file', 'TBC')}`

## Classification

- Route: {classification.get('route_target', 'TBC')}
- Workstream: {classification.get('workstream', 'TBC')}
- Related Site: {classification.get('related_site', 'TBC')}
- Due Date: {classification.get('due_date', 'TBC')}
- Evidence Status: {classification.get('evidence_status', 'Pending Verification')}

## Summary

{payload.get('body', 'TBC')[:1200] or 'TBC'}
"""

    write_markdown(note_path, frontmatter, body)
    return str(note_path.relative_to(vault_root)).replace("\\", "/")


def create_ceo_record(
    vault_root: Path,
    payload: Dict[str, Any],
    classification: Dict[str, Any],
) -> str:
    ceo_folder = vault_root / "CEO_Arrangement"
    note_name = (
        f"CEO Record - {datetime.now().strftime('%Y-%m-%d')} - "
        f"{slugify(classification['title'])}.md"
    )
    note_path = ceo_folder / note_name

    frontmatter = {
        "type": "ceo_record",
        "subject": payload.get("subject", "TBC"),
        "source_channel": payload.get("source_channel", "TBC"),
        "sender_name": payload.get("sender_name", "TBC"),
        "sender_org": classification.get("sender_org", "TBC"),
        "status": "Pending Verification",
        "priority": classification.get("priority", "Critical"),
        "due_date": classification.get("due_date", "TBC"),
        "created_by": "Hermes Agent",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }

    body = f"""
# {classification['title']}

## CEO Intake Summary

- Channel: {payload.get('source_channel', 'TBC')}
- Sender: {payload.get('sender_name', 'TBC')}
- Sender Org: {classification.get('sender_org', 'TBC')}
- Due Date: {classification.get('due_date', 'TBC')}
- Related Site: {classification.get('related_site', 'TBC')}
- Status: Pending Verification

## Notes

{payload.get('body', 'TBC')[:1200] or 'TBC'}
"""

    write_markdown(note_path, frontmatter, body)

    note_link = f"[[CEO_Arrangement/{note_name}|{classification['title']}]]"
    append_section_text(
        ceo_folder / "CEO Inbox.md",
        "Hermes Updates",
        f"- {datetime.now().strftime('%Y-%m-%d %H:%M')} - {note_link} - Pending Verification",
    )

    lowered = (payload.get("subject", "") + " " + payload.get("body", "")).lower()
    if "decision" in lowered:
        append_section_text(
            ceo_folder / "CEO Decision Queue.md",
            "Hermes Updates",
            f"- {note_link} - Decision required - Due: {classification.get('due_date', 'TBC')}",
        )

    if any(term in lowered for term in ["meeting", "call", "visit", "schedule", "calendar"]):
        append_section_text(
            ceo_folder / "CEO Calendar Notes.md",
            "Hermes Updates",
            f"- {note_link} - Calendar item - {classification.get('due_date', 'TBC')}",
        )

    append_section_text(
        ceo_folder / "CEO Follow-up Tracker.md",
        "Hermes Updates",
        f"- {note_link} - Follow-up owner: TBC - Next step: Pending Verification",
    )

    return str(note_path.relative_to(vault_root)).replace("\\", "/")


def create_or_update_action(
    vault_root: Path,
    payload: Dict[str, Any],
    classification: Dict[str, Any],
    related_message_note: str,
) -> str:
    actions_folder = vault_root / "08_Bases" / "Actions"
    action_title = classification.get("title", "TBC")
    existing_path = find_existing_action(actions_folder, action_title)
    related_site = classification.get("related_site", "TBC")
    source_type = payload.get("source_channel", "TBC").title()

    if existing_path:
        append_section_text(
            existing_path,
            "Hermes Updates",
            (
                f"- {datetime.now().strftime('%Y-%m-%d %H:%M')} - Intake refreshed from "
                f"`{payload.get('source_file', 'TBC')}` - Status kept as-is."
            ),
        )
        return str(existing_path.relative_to(vault_root)).replace("\\", "/")

    file_name = (
        f"Action - {datetime.now().strftime('%Y-%m-%d')} - "
        f"{slugify(action_title)}.md"
    )
    note_path = actions_folder / file_name

    frontmatter = {
        "type": "action",
        "action_title": action_title,
        "site_name": related_site,
        "system": classification.get("workstream", "TBC"),
        "source_type": source_type,
        "source_ref": payload.get("source_file", "TBC"),
        "owner_org": classification.get("sender_org", "TBC"),
        "owner_person": "TBC",
        "status": classification.get("status", "Pending Verification"),
        "completed": False,
        "priority": classification.get("priority", "TBC"),
        "due_date": classification.get("due_date", "TBC"),
        "followup_date": classification.get("due_date", "TBC"),
        "blocker": "",
        "depends_on": "",
        "related_submission": "",
        "evidence_status": classification.get("evidence_status", "Pending Verification"),
        "source_email": payload.get("source_file", "TBC")
        if payload.get("source_channel") == "email"
        else "",
        "source_email_date": payload.get("received_at", "TBC")
        if payload.get("source_channel") == "email"
        else "",
        "verification_note": "Created by Hermes Agent from incoming message. Human review required.",
        "last_verified": datetime.now().strftime("%Y-%m-%d"),
        "related_documents": [markdown_link_for(related_message_note)] if related_message_note else [],
    }

    body = f"""
# {action_title}

## Context

Hermes Agent created this action from a {payload.get('source_channel', 'TBC')} intake.

## Required Outcome

- Review the incoming request
- Confirm accountable owner
- Confirm due date
- Confirm whether the status should remain Open or become Pending Verification

## Action Control

- Owner Org: {classification.get('sender_org', 'TBC')}
- Related Site: {related_site}
- Workstream: {classification.get('workstream', 'TBC')}
- Due Date: {classification.get('due_date', 'TBC')}
- Evidence Status: {classification.get('evidence_status', 'Pending Verification')}

## Source Summary

- Source File: `{payload.get('source_file', 'TBC')}`
- Subject: {payload.get('subject', 'TBC')}
- Sender: {payload.get('sender_name', 'TBC')}
- Related Note: {markdown_link_for(related_message_note) if related_message_note else 'TBC'}

## Notes

{payload.get('body', 'TBC')[:1200] or 'TBC'}
"""

    write_markdown(note_path, frontmatter, body)
    return str(note_path.relative_to(vault_root)).replace("\\", "/")


def process_payload(vault_root: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    config_root = vault_root / "Hermes_Agent" / "config"
    routing_rules = load_yaml_file(config_root / "routing_rules.yaml")
    contacts = load_yaml_file(config_root / "contacts.yaml")
    project_map = load_yaml_file(config_root / "project_map.yaml")

    classification = classify_message(payload, routing_rules, contacts, project_map)
    result: Dict[str, Any] = {
        "payload": payload,
        "classification": classification,
        "created_notes": [],
    }

    if classification.get("route_target") == "raw":
        result["status"] = "routed_to_raw"
        return result

    message_note = ""
    if classification.get("create_message_note"):
        message_note = create_message_note(vault_root, payload, classification)
        result["created_notes"].append(message_note)

    if classification.get("create_ceo_note"):
        ceo_note = create_ceo_record(vault_root, payload, classification)
        result["created_notes"].append(ceo_note)
        if not message_note:
            message_note = ceo_note

    if classification.get("create_action"):
        action_note = create_or_update_action(vault_root, payload, classification, message_note)
        result["created_notes"].append(action_note)

    result["status"] = "processed"
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update Obsidian records from a Hermes payload.")
    parser.add_argument("payload_json", help="Path to a JSON payload file.")
    parser.add_argument("--vault-root", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.payload_json).read_text(encoding="utf-8"))
    result = process_payload(Path(args.vault_root), payload)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
