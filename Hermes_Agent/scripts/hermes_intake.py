from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from export_web import build_online_export  # noqa: E402
from github_sync import sync_safe_paths  # noqa: E402
from parse_message import classify_message, load_yaml_file, parse_email_file, parse_telegram_update  # noqa: E402
from update_obsidian import process_payload  # noqa: E402


def load_local_env(vault_root: Path) -> None:
    env_path = vault_root / "Hermes_Agent" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def append_log(vault_root: Path, message: str) -> None:
    log_path = vault_root / "Hermes_Agent" / "logs" / "hermes.log"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


def read_recent_logs(vault_root: Path, lines: int = 40) -> str:
    log_path = vault_root / "Hermes_Agent" / "logs" / "hermes.log"
    if not log_path.exists():
        return "No Hermes logs yet."
    content = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(content[-lines:]) if content else "No Hermes logs yet."


def processed_record_path(vault_root: Path, stem: str) -> Path:
    safe_stem = stem.replace(" ", "_")
    return vault_root / "Hermes_Agent" / "processed" / f"{safe_stem}.json"


def move_to_internal_raw(vault_root: Path, source_path: Path) -> Path:
    raw_folder = vault_root / "Hermes_Agent" / "inbox" / "raw"
    target = raw_folder / source_path.name
    counter = 1
    while target.exists():
        target = raw_folder / f"{source_path.stem}-{counter}{source_path.suffix}"
        counter += 1
    shutil.move(str(source_path), str(target))
    return target


def save_processed_record(vault_root: Path, name_stem: str, payload: Dict[str, Any], result: Dict[str, Any]) -> None:
    record_path = processed_record_path(vault_root, name_stem)
    record = {
        "processed_at": datetime.now().isoformat(timespec="seconds"),
        "payload": payload,
        "result": result,
    }
    record_path.write_text(json.dumps(record, indent=2), encoding="utf-8")


def allowed_telegram_user_ids(vault_root: Path) -> List[str]:
    contacts = load_yaml_file(vault_root / "Hermes_Agent" / "config" / "contacts.yaml")
    return [str(item) for item in contacts.get("telegram", {}).get("allowed_user_ids", [])]


def classify_manual_payload(vault_root: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    config_root = vault_root / "Hermes_Agent" / "config"
    routing_rules = load_yaml_file(config_root / "routing_rules.yaml")
    contacts = load_yaml_file(config_root / "contacts.yaml")
    project_map = load_yaml_file(config_root / "project_map.yaml")
    return classify_message(payload, routing_rules, contacts, project_map)


def build_manual_payload(
    source_type: str,
    text: str,
    sender: str,
    sender_email: str = "",
    subject: str = "",
) -> Dict[str, Any]:
    channel_map = {
        "Telegram": "telegram",
        "Email": "email",
        "WhatsApp Summary": "whatsapp",
    }
    channel = channel_map.get(source_type, "unknown")
    resolved_subject = subject.strip() or (text.splitlines()[0].strip()[:120] if text.strip() else "TBC")
    return {
        "source_channel": channel,
        "subject": resolved_subject or "TBC",
        "sender_name": sender.strip() or "TBC",
        "sender_email": sender_email.strip(),
        "recipients": "TBC",
        "received_at": datetime.now().isoformat(timespec="seconds"),
        "body": text.strip(),
        "source_file": f"manual_{channel}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
    }


def preview_payload(vault_root: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    classification = classify_manual_payload(vault_root, payload)
    return {
        "payload": payload,
        "classification": classification,
        "created_notes": [],
        "status": "preview_only",
        "processed": {"status": "preview_only"},
    }


def run_manual_intake(
    vault_root: Path,
    payload: Dict[str, Any],
    update_obsidian: bool = False,
    generate_export: bool = False,
    git_commit: bool = False,
    git_push: bool = False,
    commit_message: str | None = None,
) -> Dict[str, Any]:
    classification = classify_manual_payload(vault_root, payload)
    result: Dict[str, Any] = {
        "payload": payload,
        "classification": classification,
        "updated_files": [],
        "sync": "",
    }

    if update_obsidian:
        processed = process_payload(vault_root, payload)
        result["processed"] = processed
        result["updated_files"].extend(processed.get("created_notes", []))
        append_log(
            vault_root,
            f"Manual intake processed for {classification.get('title', 'TBC')} ({payload.get('source_channel', 'TBC')})",
        )
    else:
        result["processed"] = {"status": "preview_only"}

    if generate_export:
        exported_files = build_online_export(vault_root)
        result["exported"] = exported_files
        result["updated_files"].extend(exported_files)
        append_log(vault_root, "Online_Export refreshed from manual intake request.")
    else:
        result["exported"] = []

    if git_commit:
        message = commit_message or f"Hermes Agent sync {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        sync_result = sync_safe_paths(vault_root, commit_message=message, push=git_push)
        result["sync"] = sync_result
        append_log(vault_root, sync_result)
    else:
        result["sync"] = "Git sync not requested."

    return result


def telegram_offset_path(vault_root: Path) -> Path:
    return vault_root / "Hermes_Agent" / "logs" / "telegram_offset.txt"


def load_telegram_offset(vault_root: Path) -> int:
    path = telegram_offset_path(vault_root)
    if not path.exists():
        return 0
    try:
        return int(path.read_text(encoding="utf-8").strip() or "0")
    except ValueError:
        return 0


def save_telegram_offset(vault_root: Path, offset: int) -> None:
    telegram_offset_path(vault_root).write_text(str(offset), encoding="utf-8")


def telegram_api_get_updates(token: str, offset: int, timeout: int) -> List[Dict[str, Any]]:
    query = urllib.parse.urlencode({"offset": offset, "timeout": timeout})
    url = f"https://api.telegram.org/bot{token}/getUpdates?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "Hermes-Agent/0.1"})
    with urllib.request.urlopen(request, timeout=timeout + 10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError("Telegram API returned a non-ok response.")
    return payload.get("result", [])


def telegram_api_send_message(token: str, chat_id: str, text: str) -> None:
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "User-Agent": "Hermes-Agent/0.1",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError("Telegram sendMessage returned a non-ok response.")


def telegram_help_text() -> str:
    return "\n".join(
        [
            "Hermes commands:",
            "/help - show command list",
            "/status - show recent Hermes status",
            "/preview <text> - classify only",
            "/update <text> - update Obsidian by normal routing",
            "/ceo <text> - create CEO arrangement record",
            "/submission <text> - create submission-related record",
            "/site <text> - create site / installation-related record",
            "/commercial <text> - create risk / commercial-related record",
            "/export_web - refresh Online_Export and HTML",
            "/sync_safe - git commit safe files",
            "/sync_safe_push - git commit and push safe files",
            "/export_and_sync - export then commit safe files",
            "/export_and_push - export then commit and push safe files",
        ]
    )


def parse_telegram_command(message_text: str) -> Dict[str, str] | None:
    stripped = (message_text or "").strip()
    if not stripped.startswith("/"):
        return None

    first_line = stripped.splitlines()[0]
    match = re.match(r"^/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$", first_line)
    if not match:
        return None

    command = match.group(1).lower()
    first_line_args = match.group(2) or ""
    remaining_lines = stripped.splitlines()[1:]
    full_args = "\n".join([first_line_args] + remaining_lines).strip()
    return {
        "command": command,
        "args": full_args,
    }


def summarize_updated_files(paths: List[str]) -> str:
    if not paths:
        return "No files updated."
    display = [Path(item).name for item in paths[:5]]
    suffix = "" if len(paths) <= 5 else f" (+{len(paths) - 5} more)"
    return ", ".join(display) + suffix


def build_command_payload(base_payload: Dict[str, Any], body_text: str, forced_route_name: str = "") -> Dict[str, Any]:
    payload = dict(base_payload)
    payload["body"] = body_text.strip()
    payload["subject"] = (body_text.strip().splitlines()[0][:120] if body_text.strip() else "TBC")
    if forced_route_name:
        payload["forced_route_name"] = forced_route_name
    return payload


def execute_telegram_command(vault_root: Path, payload: Dict[str, Any], command_name: str, command_args: str) -> Dict[str, Any]:
    reply_lines: List[str] = []
    command_result: Dict[str, Any] = {
        "status": "command_processed",
        "command": command_name,
        "updated_files": [],
        "details": {},
    }

    def require_args() -> bool:
        if command_args.strip():
            return True
        reply_lines.append(f"Usage error: /{command_name} requires message text.")
        command_result["status"] = "command_usage_error"
        return False

    if command_name == "help":
        reply_lines.append(telegram_help_text())
        command_result["status"] = "command_help"
    elif command_name == "status":
        reply_lines.append("Hermes status:")
        reply_lines.append("Manual update mode is active.")
        reply_lines.append(read_recent_logs(vault_root, lines=6))
        command_result["status"] = "command_status"
    elif command_name == "preview":
        if require_args():
            preview = preview_payload(vault_root, build_command_payload(payload, command_args))
            command_result["details"] = preview
            classification = preview.get("classification", {})
            reply_lines.extend(
                [
                    "Preview complete.",
                    f"Route: {classification.get('route_target', 'TBC')}",
                    f"Workstream: {classification.get('workstream', 'TBC')}",
                    f"Site: {classification.get('related_site', 'TBC')}",
                    f"Due: {classification.get('due_date', 'TBC')}",
                    f"Status: {classification.get('status', 'TBC')}",
                ]
            )
            append_log(vault_root, f"Telegram preview command processed for {classification.get('title', 'TBC')}")
    elif command_name in {"update", "update_obsidian"}:
        if require_args():
            result = run_manual_intake(vault_root, build_command_payload(payload, command_args), update_obsidian=True)
            command_result["details"] = result
            command_result["updated_files"] = result.get("updated_files", [])
            reply_lines.extend(
                [
                    "Obsidian update completed.",
                    f"Route: {result.get('classification', {}).get('route_target', 'TBC')}",
                    f"Files: {summarize_updated_files(result.get('updated_files', []))}",
                ]
            )
    elif command_name in {"ceo", "submission", "site", "commercial"}:
        if require_args():
            forced_routes = {
                "ceo": "ceo_arrangement",
                "submission": "submission_documents",
                "site": "site_installation",
                "commercial": "risk_commercial",
            }
            route_name = forced_routes[command_name]
            result = run_manual_intake(
                vault_root,
                build_command_payload(payload, command_args, forced_route_name=route_name),
                update_obsidian=True,
            )
            command_result["details"] = result
            command_result["updated_files"] = result.get("updated_files", [])
            reply_lines.extend(
                [
                    f"{command_name.title()} update completed.",
                    f"Route: {result.get('classification', {}).get('route_target', 'TBC')}",
                    f"Files: {summarize_updated_files(result.get('updated_files', []))}",
                ]
            )
    elif command_name == "export_web":
        exported = build_online_export(vault_root)
        command_result["updated_files"] = exported
        command_result["details"] = {"exported": exported}
        reply_lines.extend(
            [
                "Online export refreshed.",
                f"Files: {summarize_updated_files(exported)}",
            ]
        )
        append_log(vault_root, "Telegram command refreshed Online_Export.")
    elif command_name in {"sync_safe", "sync_safe_push", "export_and_sync", "export_and_push"}:
        push = command_name in {"sync_safe_push", "export_and_push"}
        updated_files: List[str] = []
        if command_name.startswith("export_and_"):
            exported = build_online_export(vault_root)
            updated_files.extend(exported)
            command_result["details"]["exported"] = exported
            append_log(vault_root, "Telegram command refreshed Online_Export before sync.")

        message = f"Hermes Telegram command sync {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        sync_result = sync_safe_paths(vault_root, commit_message=message, push=push)
        command_result["updated_files"] = updated_files
        command_result["details"]["sync"] = sync_result
        reply_lines.extend(
            [
                "Safe sync completed.",
                sync_result,
            ]
        )
    else:
        command_result["status"] = "command_unknown"
        reply_lines.append("Unknown Hermes command. Use /help.")

    command_result["reply_text"] = "\n".join(reply_lines).strip() or "Command processed."
    return command_result


def process_email_file(vault_root: Path, email_path: Path) -> Dict[str, Any]:
    payload = parse_email_file(email_path)
    result = process_payload(vault_root, payload)

    if result.get("status") == "routed_to_raw":
        raw_path = move_to_internal_raw(vault_root, email_path)
        append_log(vault_root, f"Email routed to raw: {raw_path.name}")
    else:
        target = vault_root / "Hermes_Agent" / "processed" / email_path.name
        shutil.move(str(email_path), str(target))
        append_log(vault_root, f"Email processed: {target.name}")

    save_processed_record(vault_root, email_path.stem, payload, result)
    return result


def preview_email_file(vault_root: Path, email_path: Path) -> Dict[str, Any]:
    payload = parse_email_file(email_path)
    result = preview_payload(vault_root, payload)
    save_processed_record(vault_root, f"{email_path.stem}_preview", payload, result)
    append_log(vault_root, f"Email preview only: {email_path.name}")
    return result


def process_all_email_files(vault_root: Path, update_obsidian: bool = False) -> List[Dict[str, Any]]:
    email_folder = vault_root / "Hermes_Agent" / "inbox" / "email"
    results = []
    for path in sorted(email_folder.iterdir()):
        if path.is_file() and path.suffix.lower() in {".txt", ".md", ".eml"}:
            if update_obsidian:
                results.append(process_email_file(vault_root, path))
            else:
                results.append(preview_email_file(vault_root, path))
    return results


def process_telegram_updates(vault_root: Path, update_obsidian: bool = False) -> List[Dict[str, Any]]:
    load_local_env(vault_root)
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        append_log(vault_root, "Telegram polling skipped: TELEGRAM_BOT_TOKEN is not configured.")
        return []

    timeout = int(os.environ.get("HERMES_TELEGRAM_TIMEOUT", "30"))
    offset = load_telegram_offset(vault_root)
    updates = telegram_api_get_updates(token, offset=offset, timeout=timeout)
    allowed_ids = allowed_telegram_user_ids(vault_root)
    results: List[Dict[str, Any]] = []

    for update in updates:
        update_id = int(update.get("update_id", 0))
        payload = parse_telegram_update(update)
        source_id = str(payload.get("sender_telegram_id", ""))
        raw_path = vault_root / "Hermes_Agent" / "inbox" / "telegram" / f"telegram_{update_id}.json"
        raw_path.write_text(json.dumps(update, indent=2), encoding="utf-8")

        if source_id not in allowed_ids:
            moved = move_to_internal_raw(vault_root, raw_path)
            result = {
                "status": "rejected_unknown_telegram_user",
                "source": str(moved.relative_to(vault_root)).replace("\\", "/"),
                "reason": "Telegram user ID not in contacts.yaml",
            }
            save_processed_record(vault_root, f"telegram_{update_id}", payload, result)
            append_log(vault_root, f"Telegram user rejected: {source_id}")
        else:
            command_info = parse_telegram_command(payload.get("body", ""))
            if command_info:
                result = execute_telegram_command(
                    vault_root,
                    payload,
                    command_name=command_info["command"],
                    command_args=command_info["args"],
                )
                processed_target = vault_root / "Hermes_Agent" / "processed" / raw_path.name
                shutil.move(str(raw_path), str(processed_target))
                save_processed_record(vault_root, f"telegram_{update_id}", payload, result)
                append_log(vault_root, f"Telegram command processed: {update_id} /{command_info['command']}")
                try:
                    telegram_api_send_message(token, payload.get("recipients", ""), result.get("reply_text", "Command processed."))
                except Exception as exc:  # pragma: no cover
                    append_log(vault_root, f"Telegram reply failed for {update_id}: {exc}")
                    result["reply_error"] = str(exc)
            elif update_obsidian:
                result = process_payload(vault_root, payload)
                processed_target = vault_root / "Hermes_Agent" / "processed" / raw_path.name
                shutil.move(str(raw_path), str(processed_target))
                save_processed_record(vault_root, f"telegram_{update_id}", payload, result)
                append_log(vault_root, f"Telegram update processed: {update_id}")
            else:
                result = preview_payload(vault_root, payload)
                save_processed_record(vault_root, f"telegram_{update_id}_preview", payload, result)
                append_log(vault_root, f"Telegram preview only: {update_id}")

        results.append(result)
        save_telegram_offset(vault_root, update_id + 1)

    return results


def run_once(
    vault_root: Path,
    update_obsidian: bool = False,
    generate_export: bool = False,
    sync_safe_files: bool = False,
    push: bool = False,
) -> Dict[str, Any]:
    results = {
        "emails": process_all_email_files(vault_root, update_obsidian=update_obsidian),
        "telegram": process_telegram_updates(vault_root, update_obsidian=update_obsidian),
        "exported": [],
        "sync": "Git sync not requested.",
    }
    if generate_export:
        results["exported"] = build_online_export(vault_root)
    if sync_safe_files:
        commit_message = f"Hermes Agent sync {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        results["sync"] = sync_safe_paths(vault_root, commit_message=commit_message, push=push)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Hermes Agent local intake controller.")
    parser.add_argument(
        "command",
        choices=["poll-telegram", "process-email", "process-all", "export", "sync", "run-once"],
    )
    parser.add_argument("--vault-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--update-obsidian", action="store_true")
    parser.add_argument("--generate-export", action="store_true")
    parser.add_argument("--sync-safe-files", action="store_true")
    parser.add_argument("--push", action="store_true")
    args = parser.parse_args()

    vault_root = Path(args.vault_root)
    load_local_env(vault_root)

    if args.command == "poll-telegram":
        result = process_telegram_updates(vault_root, update_obsidian=args.update_obsidian)
    elif args.command == "process-email":
        result = process_all_email_files(vault_root, update_obsidian=args.update_obsidian)
    elif args.command == "process-all":
        result = {
            "emails": process_all_email_files(vault_root, update_obsidian=args.update_obsidian),
            "telegram": process_telegram_updates(vault_root, update_obsidian=args.update_obsidian),
        }
    elif args.command == "export":
        result = build_online_export(vault_root)
    elif args.command == "sync":
        commit_message = f"Hermes Agent sync {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        result = sync_safe_paths(vault_root, commit_message=commit_message, push=args.push)
    else:
        result = run_once(
            vault_root,
            update_obsidian=args.update_obsidian,
            generate_export=args.generate_export,
            sync_safe_files=args.sync_safe_files,
            push=args.push,
        )

    print(json.dumps(result, indent=2, ensure_ascii=False) if isinstance(result, (dict, list)) else result)


if __name__ == "__main__":
    main()
