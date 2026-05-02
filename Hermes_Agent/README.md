# Hermes Agent

Hermes Agent is a local MVP for the HDB Cloud BMS-CCTV / VA / Footfall Obsidian PMO vault.

It receives Telegram or email input, classifies the message, creates or updates internal Obsidian Markdown records, writes action notes, updates CEO arrangement pages, exports a safe online summary, and can sync safe files to GitHub.

## Update Policy

Hermes Agent is now **manual-update only**.

- By default, intake commands only preview and classify.
- Obsidian records are updated only when you explicitly pass `--update-obsidian`.
- `Online_Export` is refreshed only when you explicitly run the export command or pass `--generate-export`.
- Git commit or push happens only when you explicitly run sync or pass `--sync-safe-files`.

## What Hermes Agent Includes

- Telegram polling MVP using `TELEGRAM_BOT_TOKEN`
- Email text-file intake from `Hermes_Agent/inbox/email`
- Classification rules in YAML
- Action note creation under `08_Bases/Actions`
- Internal message summary notes under `06_Emails_Meetings` when relevant
- CEO arrangement handling under `CEO_Arrangement`
- Safe export generation into `Online_Export`
- Git-based sync for safe pages only

## What Hermes Agent Does Not Publish

- Raw emails
- Worker personal data
- FIN / IC details
- Internal cost files
- Invoices, claims, or payment detail
- Sensitive subcontractor rates
- Confidential source documents

## Core Files

- `config/routing_rules.yaml`
- `config/contacts.yaml`
- `config/project_map.yaml`
- `scripts/hermes_intake.py`
- `scripts/parse_message.py`
- `scripts/update_obsidian.py`
- `scripts/export_web.py`
- `scripts/github_sync.py`

## Setup Summary

1. Copy `.env.example` to `.env`
2. Fill in `TELEGRAM_BOT_TOKEN`
3. Update `contacts.yaml` with allowed Telegram user IDs
4. Confirm `GITHUB_REPO_URL`
5. Install Python dependencies:

```powershell
pip install -r requirements.txt
```

## Visual UI

Run the local Streamlit console:

```powershell
streamlit run Hermes_Agent\app.py
```

The UI allows you to:

- paste Telegram, Email, or WhatsApp summary text
- select source type
- enter sender and sender email
- preview classification before writing to the vault
- choose whether to update Obsidian
- choose whether to refresh `Online_Export`
- choose whether to commit and optionally push safe files
- review updated files and recent Hermes logs

## Main Commands

Process email text files:

```powershell
python Hermes_Agent\scripts\hermes_intake.py process-email
```

Process email text files and update Obsidian:

```powershell
python Hermes_Agent\scripts\hermes_intake.py process-email --update-obsidian
```

Poll Telegram once:

```powershell
python Hermes_Agent\scripts\hermes_intake.py poll-telegram
```

Poll Telegram once and update Obsidian for non-command Telegram messages:

```powershell
python Hermes_Agent\scripts\hermes_intake.py poll-telegram --update-obsidian
```

## Telegram Command Mode

Hermes now supports explicit Telegram bot commands.

Important behavior:

- Plain Telegram messages remain preview-only unless you run polling with `--update-obsidian`.
- Telegram slash commands run only the action requested by the command.
- Web export and Git sync are never triggered by plain text. They require explicit Telegram commands.

Supported Telegram commands:

- `/help`
- `/status`
- `/preview <text>`
- `/update <text>`
- `/ceo <text>`
- `/submission <text>`
- `/site <text>`
- `/commercial <text>`
- `/export_web`
- `/sync_safe`
- `/sync_safe_push`
- `/export_and_sync`
- `/export_and_push`

Examples:

```text
/preview Loyang Point submission follow-up for Device Catalogue and Equipment List before 4 May 2026.
/submission Loyang Point Device Catalogue and Equipment List pending MA sign-off.
/ceo CEO meeting to review Admiralty Place Phase 1 proposal. Pending verification.
/export_web
/export_and_push
```

Telegram command meaning:

- `/preview` classifies only and replies with route, site, due date and status
- `/update` writes normal routed records to the vault
- `/ceo` forces routing to `CEO_Arrangement`
- `/submission` forces routing to `03_Submission Tracker`
- `/site` forces routing to `04_Site & Installation Tracker`
- `/commercial` forces routing to `05_Risk Commercial Decision Log`
- `/export_web` refreshes safe `Online_Export` Markdown and HTML
- `/sync_safe` commits safe files only
- `/sync_safe_push` commits and pushes safe files
- `/export_and_sync` exports first, then commits safe files
- `/export_and_push` exports first, then commits and pushes safe files

Hermes replies to the Telegram chat with a short execution summary after each command.

Run local export:

```powershell
python Hermes_Agent\scripts\export_web.py
```

This export now refreshes:

- `Online_Export/*.md`
- `Online_Export/project-dashboard.html`
- `Online_Export/action-tracker.html`
- `Online_Export/submission-tracker.html`
- `Online_Export/site-installation-tracker.html`
- `Online_Export/risk-commercial-decision-log.html`

Commit safe files:

```powershell
python Hermes_Agent\scripts\github_sync.py --commit-message "Hermes Agent sync"
```

Commit and push safe files:

```powershell
python Hermes_Agent\scripts\github_sync.py --commit-message "Hermes Agent sync" --push
```

Run one full cycle:

```powershell
python Hermes_Agent\scripts\hermes_intake.py run-once
```

Run one full cycle with explicit updates:

```powershell
python Hermes_Agent\scripts\hermes_intake.py run-once --update-obsidian --generate-export --sync-safe-files --push
```

## How to Test with a Sample Message

1. Start the UI:

```powershell
streamlit run Hermes_Agent\app.py
```

2. Paste a sample message such as:

```text
Please complete the Device Catalogue, Equipment List, Floor Plan Markup, Cable Route and Power Point Tap-in Location for Loyang Point before 4 May 2026. Pending MA sign-off status is still TBC.
```

3. Select:
   - `Source Type`: `Email`
   - `Sender`: `Ethan / Xjera Labs`
   - `Subject / Title`: `Loyang Point submission follow-up`

4. Click `Preview Classification` first.
5. Only enable `Update Obsidian records` when you want Hermes to write notes.
6. Enable `Generate Online_Export` only if you want a safe export refresh.

## Git Commit and Push Control

- To disable git push:
  - leave `Git commit safe files` unchecked, or
  - check `Git commit safe files` but leave `Git push after commit` unchecked
- To enable git push:
  - check `Git commit safe files`
  - then check `Git push after commit`

The same control is available from CLI:

```powershell
python Hermes_Agent\scripts\github_sync.py --commit-message "Hermes Agent sync"
python Hermes_Agent\scripts\github_sync.py --commit-message "Hermes Agent sync" --push
```

## Processing Rules

- CEO meeting / call / visit / arrangement -> `CEO_Arrangement`
- HDB / Univers / Xjera email or meeting -> `06_Emails_Meetings`
- Submission documents -> `03_Submission Tracker` plus action notes
- Site survey / cabling / subcontractor / installation -> `04_Site & Installation Tracker` plus action notes
- VO / commercial / claim / payment -> `05_Risk Commercial Decision Log` plus action notes
- Unknown -> `Hermes_Agent/inbox/raw`

## Notes

- Raw emails remain internal.
- Unknown or uncertain items are marked `Pending Verification`.
- Missing dates, owners, or sites remain `TBC`.
- GitHub sync is safe-scope only by default.
- The UI does not hard-code any secret and reads runtime values from `Hermes_Agent/.env`.
