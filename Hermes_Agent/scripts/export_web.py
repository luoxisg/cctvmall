from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

try:
    import markdown as md
except ImportError as exc:  # pragma: no cover
    raise SystemExit("The 'markdown' package is required. Install it with: pip install markdown") from exc

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from parse_message import load_yaml_file  # noqa: E402


DISCLAIMER = (
    "This online dashboard is a management summary snapshot. Source-of-truth records remain "
    "in the internal Obsidian vault, Excel trackers, emails and signed project documents."
)

PAGE_DESCRIPTIONS = {
    "01_Project Dashboard.md": "Management homepage for the HDB Cloud BMS-CCTV / VA / Footfall PMO export.",
    "02_Action Tracker.md": "Management-level action summary for ownership, follow-up and escalation.",
    "03_Submission Tracker.md": "Management-level submission readiness, checklist control and blockers.",
    "04_Site & Installation Tracker.md": "Management-level site readiness, installation, QA and handover summary.",
    "05_Risk Commercial Decision Log.md": "Management-level risk, commercial and decision control summary.",
}


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---"):
        return text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return text
    return parts[2].lstrip()


def html_filename_for(markdown_name: str) -> str:
    if markdown_name == "index.md":
        return "index.html"
    stem = Path(markdown_name).stem
    stem = re.sub(r"^\d+_", "", stem)
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return f"{slug}.html"


def exported_page_lookup(export_pages: List[str]) -> Dict[str, Tuple[str, str]]:
    lookup: Dict[str, Tuple[str, str]] = {}
    for page in export_pages:
        name = Path(page).name
        stem = Path(page).stem
        html_name = html_filename_for(name)
        lookup[name] = (name, html_name)
        lookup[stem] = (name, html_name)
    lookup["index.md"] = ("index.md", "index.html")
    lookup["index"] = ("index.md", "index.html")
    return lookup


def convert_obsidian_links(text: str, page_lookup: Dict[str, Tuple[str, str]]) -> str:
    pattern = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")

    def replacer(match: re.Match[str]) -> str:
        target = match.group(1).strip()
        label = (match.group(2) or Path(target).stem).strip()
        target_name = Path(target).name
        lookup_key = target if target in page_lookup else target_name
        if lookup_key in page_lookup:
            markdown_name, _html_name = page_lookup[lookup_key]
            return f"[{label}](./{markdown_name})"
        return f"{label} (Internal / Confidential)"

    return pattern.sub(replacer, text)


def sanitize_markdown(text: str, page_lookup: Dict[str, Tuple[str, str]]) -> str:
    cleaned = strip_frontmatter(text)
    lines: List[str] = []
    sensitive_patterns = [
        "06_Emails_Meetings",
        "07_Attachments",
        "08_Bases",
        "10_Subcontractors/Worker_Records",
        "14_Payment_Claims",
    ]

    for line in cleaned.splitlines():
        if line.strip().startswith("![["):
            continue
        if any(pattern in line for pattern in sensitive_patterns):
            continue
        line = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "Internal / Confidential", line)
        lines.append(line)

    cleaned = "\n".join(lines).strip()
    cleaned = convert_obsidian_links(cleaned, page_lookup)

    title_match = re.search(r"^#\s+(.+)$", cleaned, re.MULTILINE)
    if not title_match:
        return cleaned

    title = title_match.group(0)
    rest = cleaned[len(title) :].lstrip()
    disclaimer = (
        "> [!note] Disclaimer\n"
        f"> {DISCLAIMER}\n"
    )
    return f"{title}\n\n{disclaimer}\n\n{rest}".strip() + "\n"


def split_title_and_body(markdown_text: str) -> Tuple[str, str]:
    lines = markdown_text.splitlines()
    title = "Dashboard"
    body_lines: List[str] = []
    title_found = False
    skip_disclaimer = False

    for idx, line in enumerate(lines):
        if not title_found and line.startswith("# "):
            title = line[2:].strip()
            title_found = True
            continue

        if title_found and not skip_disclaimer and line.strip() == "> [!note] Disclaimer":
            skip_disclaimer = True
            continue

        if skip_disclaimer:
            if line.startswith("> "):
                continue
            if not line.strip():
                continue
            skip_disclaimer = False

        if (
            "01_Project Dashboard" in line
            and "05_Risk Commercial Decision Log" in line
            and "|" in line
        ):
            continue

        body_lines.append(line)

    body = "\n".join(body_lines).strip()
    return title, body


def replace_inline_formatting(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"~~([^~]+)~~", r"<del>\1</del>", text)
    return text


def transform_callouts(markdown_body: str) -> str:
    lines = markdown_body.splitlines()
    output: List[str] = []
    idx = 0

    while idx < len(lines):
        line = lines[idx]
        match = re.match(r"^>\s+\[!([A-Za-z]+)\]\s*(.*)$", line)
        if not match:
            output.append(line)
            idx += 1
            continue

        callout_type = match.group(1).lower()
        callout_title = match.group(2).strip() or callout_type.title()
        callout_lines: List[str] = []
        idx += 1

        while idx < len(lines) and lines[idx].startswith("> "):
            callout_lines.append(lines[idx][2:])
            idx += 1

        inner_markdown = "\n".join(callout_lines).strip()
        inner_html = md.markdown(inner_markdown, extensions=["tables", "fenced_code", "sane_lists"])
        output.append(
            "\n".join(
                [
                    f'<div class="notice callout callout-{callout_type}">',
                    f"  <strong>{replace_inline_formatting(callout_title)}:</strong>",
                    f"  {inner_html}",
                    "</div>",
                ]
            )
        )

    return "\n".join(output)


def build_navigation(current_html: str) -> str:
    nav_items = [
        ("Home", "index.html"),
        ("Project Dashboard", "project-dashboard.html"),
        ("Action Tracker", "action-tracker.html"),
        ("Submission Tracker", "submission-tracker.html"),
        ("Site & Installation Tracker", "site-installation-tracker.html"),
        ("Risk Commercial Decision Log", "risk-commercial-decision-log.html"),
    ]
    return "\n".join(f'        <a href="{href}">{label}</a>' for label, href in nav_items)


def render_html_page(markdown_name: str, markdown_text: str) -> str:
    title, body = split_title_and_body(markdown_text)
    body = transform_callouts(body)
    body_html = md.markdown(body, extensions=["tables", "fenced_code", "sane_lists"])
    body_html = re.sub(
        r'href="\./([^"]+)\.md"',
        lambda m: f'href="./{html_filename_for(m.group(1) + ".md")}"',
        body_html,
    )
    description = PAGE_DESCRIPTIONS.get(markdown_name, "Management summary page.")
    current_html = html_filename_for(markdown_name)
    display_title = title.replace("_", " ")

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{display_title}</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>{display_title}</h1>
      <p>{description}</p>
      <div class="nav">
{build_navigation(current_html)}
      </div>
    </section>

    <div class="notice">
      <strong>Disclaimer:</strong> {DISCLAIMER}
    </div>

    <section class="panel markdown-body">
{body_html}
    </section>
  </div>
</body>
</html>
"""


def write_html_exports(export_folder: Path, markdown_files: List[Path]) -> List[str]:
    written_files: List[str] = []
    for markdown_path in markdown_files:
        markdown_name = markdown_path.name
        if markdown_name == "index.md":
            continue
        html_name = html_filename_for(markdown_name)
        html_content = render_html_page(markdown_name, markdown_path.read_text(encoding="utf-8"))
        target_path = export_folder / html_name
        target_path.write_text(html_content, encoding="utf-8")
        written_files.append(str(target_path.relative_to(export_folder.parent)).replace("\\", "/"))
    return written_files


def build_online_export(vault_root: Path) -> List[str]:
    project_map = load_yaml_file(vault_root / "Hermes_Agent" / "config" / "project_map.yaml")
    export_pages = project_map.get("export", {}).get("selected_pages", [])
    export_folder = vault_root / project_map.get("paths", {}).get("online_export_folder", "Online_Export")
    export_folder.mkdir(parents=True, exist_ok=True)

    page_lookup = exported_page_lookup(export_pages)
    written_files: List[str] = []
    markdown_paths: List[Path] = []

    for page in export_pages:
        source_path = vault_root / page
        if not source_path.exists():
            continue
        target_path = export_folder / source_path.name
        sanitized = sanitize_markdown(source_path.read_text(encoding="utf-8"), page_lookup)
        target_path.write_text(sanitized, encoding="utf-8")
        written_files.append(str(target_path.relative_to(vault_root)).replace("\\", "/"))
        markdown_paths.append(target_path)

    index_body = """# HDB Cloud BMS-CCTV / VA / Footfall PMO Dashboard

This online export is a clean management-summary version of the internal PMO dashboard.

> [!note] Disclaimer
> This online dashboard is a management summary snapshot. Source-of-truth records remain in the internal Obsidian vault, Excel trackers, emails and signed project documents.

## Navigation

- [01_Project Dashboard](./01_Project Dashboard.md)
- [02_Action Tracker](./02_Action Tracker.md)
- [03_Submission Tracker](./03_Submission Tracker.md)
- [04_Site & Installation Tracker](./04_Site & Installation Tracker.md)
- [05_Risk Commercial Decision Log](./05_Risk Commercial Decision Log.md)
"""
    index_path = export_folder / "index.md"
    index_path.write_text(index_body, encoding="utf-8")
    written_files.append(str(index_path.relative_to(vault_root)).replace("\\", "/"))

    written_files.extend(write_html_exports(export_folder, markdown_paths))
    return written_files


def main() -> None:
    parser = argparse.ArgumentParser(description="Export safe dashboard pages to Online_Export.")
    parser.add_argument("--vault-root", default=str(Path(__file__).resolve().parents[2]))
    args = parser.parse_args()
    written = build_online_export(Path(args.vault_root))
    for item in written:
        print(item)


if __name__ == "__main__":
    main()
