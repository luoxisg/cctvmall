from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit("PyYAML is required. Install it with: pip install pyyaml") from exc


MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def load_yaml_file(path: Path) -> Dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def summarize_title(payload: Dict[str, Any]) -> str:
    subject = (payload.get("subject") or "").strip()
    if subject:
        return subject[:120]

    body = (payload.get("body") or "").strip()
    if not body:
        return "TBC"

    first_line = body.splitlines()[0].strip()
    if first_line:
        return first_line[:120]

    words = re.findall(r"[A-Za-z0-9_/&-]+", body)
    return " ".join(words[:10])[:120] or "TBC"


def extract_due_date(text: str) -> str:
    if not text:
        return "TBC"

    iso_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    if iso_match:
        return iso_match.group(1)

    month_names = "|".join(MONTH_MAP.keys())
    word_match = re.search(
        rf"\b(\d{{1,2}})\s+({month_names})[a-z]*\s+(20\d{{2}})\b",
        text,
        re.IGNORECASE,
    )
    if word_match:
        day = int(word_match.group(1))
        month = MONTH_MAP[word_match.group(2).lower()[:3]]
        year = int(word_match.group(3))
        return f"{year:04d}-{month:02d}-{day:02d}"

    return "TBC"


def detect_site(text: str, project_map: Dict[str, Any]) -> str:
    known_sites = project_map.get("sites", [])
    text_lower = normalize_text(text)
    aliases = {
        "caberra plaza": "Canberra Plaza",
        "canberra plaza": "Canberra Plaza",
        "loyang point": "Loyang Point",
        "rivervale plaza": "Rivervale Plaza",
        "parc point": "Parc Point",
        "northshore plaza": "Northshore Plaza",
    }

    for alias, site_name in aliases.items():
        if alias in text_lower:
            return site_name

    for site_name in known_sites:
        if normalize_text(site_name) in text_lower:
            return site_name

    return "TBC"


def infer_sender_org(payload: Dict[str, Any], contacts: Dict[str, Any]) -> str:
    sender_email = normalize_text(payload.get("sender_email", ""))
    sender_name = normalize_text(payload.get("sender_name", ""))

    organizations = contacts.get("organizations", {})
    for org_name, metadata in organizations.items():
        for domain in metadata.get("domains", []):
            if sender_email.endswith(f"@{domain}") or sender_email.endswith(domain):
                return org_name

    if "univers" in sender_name:
        return "Univers"
    if "xjera" in sender_name:
        return "Xjera Labs"
    if "hdb" in sender_name:
        return "HDB"

    return "TBC"


def score_rule(text: str, rule: Dict[str, Any]) -> int:
    score = 0
    for keyword in rule.get("keywords", []):
        if normalize_text(keyword) in text:
            score += 1
    return score


def classify_message(
    payload: Dict[str, Any],
    routing_rules: Dict[str, Any],
    contacts: Dict[str, Any],
    project_map: Dict[str, Any],
) -> Dict[str, Any]:
    combined_text = normalize_text(
        " ".join(
            [
                payload.get("subject", ""),
                payload.get("body", ""),
                payload.get("sender_name", ""),
                payload.get("sender_email", ""),
            ]
        )
    )

    matched_rule: Optional[Dict[str, Any]] = None
    matched_score = 0
    forced_route_name = normalize_text(payload.get("forced_route_name", ""))

    if forced_route_name:
        for rule in routing_rules.get("rules", []):
            if normalize_text(rule.get("name", "")) == forced_route_name:
                matched_rule = rule
                matched_score = 999
                break

    if not matched_rule:
        for rule in routing_rules.get("rules", []):
            score = score_rule(combined_text, rule)
            if score > matched_score:
                matched_rule = rule
                matched_score = score

    if not matched_rule:
        matched_rule = routing_rules.get("fallback", {})

    source_channel = payload.get("source_channel", "unknown")
    route_name = matched_rule.get("name", matched_rule.get("route", "unknown"))
    due_date = extract_due_date(combined_text)
    site_name = detect_site(combined_text, project_map)
    sender_org = infer_sender_org(payload, contacts)
    subject_title = summarize_title(payload)

    status = routing_rules.get("defaults", {}).get("default_status", "Pending Verification")
    if route_name != "unknown" and matched_rule.get("route") != "raw":
        status = "Open"

    evidence_status = routing_rules.get("defaults", {}).get(
        "default_evidence_status", "Pending Verification"
    )
    if source_channel == "email":
        evidence_status = "Verified by Attachment"
    if source_channel == "telegram":
        evidence_status = "Pending Verification"

    return {
        "route_name": route_name,
        "route_target": matched_rule.get("route", "raw"),
        "target_tracker": matched_rule.get("target_tracker", "Hermes_Agent/inbox/raw"),
        "workstream": matched_rule.get("workstream", "Unknown"),
        "priority": matched_rule.get(
            "priority", routing_rules.get("defaults", {}).get("default_priority", "TBC")
        ),
        "status": status,
        "create_action": bool(matched_rule.get("create_action", False)),
        "create_ceo_note": bool(matched_rule.get("create_ceo_note", False)),
        "create_message_note": bool(matched_rule.get("create_message_note", False)),
        "related_site": site_name,
        "due_date": due_date,
        "sender_org": sender_org,
        "title": subject_title,
        "evidence_status": evidence_status,
        "confidence": "Matched" if matched_score > 0 else "Pending Verification",
    }


def parse_email_file(path: Path) -> Dict[str, Any]:
    content = path.read_text(encoding="utf-8", errors="replace")
    lines = content.splitlines()

    headers: Dict[str, str] = {}
    body_start = 0
    for index, line in enumerate(lines):
        if not line.strip():
            body_start = index + 1
            break
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()

    body = "\n".join(lines[body_start:]).strip()
    if not body and lines:
        body = "\n".join(lines).strip()

    return {
        "source_channel": "email",
        "subject": headers.get("subject", path.stem),
        "sender_name": headers.get("from_name", headers.get("from", "TBC")),
        "sender_email": headers.get("from_email", headers.get("from", "TBC")),
        "recipients": headers.get("to", "TBC"),
        "received_at": headers.get("date", datetime.fromtimestamp(path.stat().st_mtime).isoformat()),
        "body": body,
        "source_file": str(path),
    }


def parse_telegram_update(update: Dict[str, Any]) -> Dict[str, Any]:
    message = update.get("message") or update.get("edited_message") or {}
    sender = message.get("from", {})
    chat = message.get("chat", {})
    text = message.get("text") or message.get("caption") or ""

    sender_name = " ".join(
        part for part in [sender.get("first_name", ""), sender.get("last_name", "")] if part
    ).strip() or sender.get("username", "TBC")

    return {
        "source_channel": "telegram",
        "subject": text.splitlines()[0][:120] if text else "Telegram Message",
        "sender_name": sender_name,
        "sender_email": "",
        "sender_telegram_id": str(sender.get("id", "")),
        "sender_telegram_username": sender.get("username", "TBC"),
        "recipients": str(chat.get("id", "")),
        "received_at": datetime.fromtimestamp(message.get("date", 0)).isoformat()
        if message.get("date")
        else datetime.now().isoformat(),
        "body": text,
        "source_file": f"telegram_update_{update.get('update_id', 'TBC')}.json",
        "telegram_update_id": update.get("update_id"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse and classify a Hermes input payload.")
    parser.add_argument("input_file", help="Path to an email text file or JSON Telegram update file.")
    parser.add_argument(
        "--source",
        choices=["email", "telegram"],
        required=True,
        help="Source type for the input file.",
    )
    parser.add_argument("--config-root", default=str(Path(__file__).resolve().parents[1] / "config"))
    args = parser.parse_args()

    config_root = Path(args.config_root)
    routing_rules = load_yaml_file(config_root / "routing_rules.yaml")
    contacts = load_yaml_file(config_root / "contacts.yaml")
    project_map = load_yaml_file(config_root / "project_map.yaml")

    input_path = Path(args.input_file)
    if args.source == "email":
        payload = parse_email_file(input_path)
    else:
        payload = parse_telegram_update(json.loads(input_path.read_text(encoding="utf-8")))

    result = classify_message(payload, routing_rules, contacts, project_map)
    print(json.dumps({"payload": payload, "classification": result}, indent=2))


if __name__ == "__main__":
    main()
