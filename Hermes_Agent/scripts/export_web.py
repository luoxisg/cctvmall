from __future__ import annotations

import argparse
import html
import hashlib
import re
import shutil
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

MALL_MAP_SOURCE = Path("07_Attachments") / "Images" / "mall map.png"
MALL_MAP_EXPORT = Path("assets") / "images" / "mall-map.png"

PAGE_DESCRIPTIONS = {
    "01_Project Dashboard.md": "Management homepage for the HDB Cloud BMS-CCTV / VA / Footfall PMO export.",
    "02_Action Tracker.md": "Management-level action summary for ownership, follow-up and escalation.",
    "03_Submission Tracker.md": "Management-level submission readiness, checklist control and blockers.",
    "04_Site & Installation Tracker.md": "Management-level site readiness, installation, QA and handover summary.",
    "05_Risk Commercial Decision Log.md": "Management-level risk, commercial and decision control summary.",
    "06_BMS Interface.md": "Management-level interface control summary for CCTV, VA, Footfall and Cloud BMS dependencies.",
    "07_Cost Management.md": "Management-level cost control summary for procurement, subcontractor, variation and claim tracking.",
}

HOME_PAGE_CARDS = [
    (
        "Executive Dashboard",
        "Executive summary, key deadlines, KPI overview, priority sites and blockers.",
        "index.html",
        "00",
        "Core summary",
    ),
    (
        "Action Tracker",
        "Management-level action tracking for open, blocked, waiting and pending verification items.",
        "action-tracker.html",
        "01",
        "Follow-up",
    ),
    (
        "Mall Tracker",
        "Multi-mall site survey, installation, cabling, power, testing and handover control.",
        "site-installation-tracker.html",
        "02",
        "Execution",
    ),
    (
        "Submission Control",
        "Submission readiness, checklist summary, missing documents and key blockers.",
        "submission-tracker.html",
        "03",
        "Regulatory",
    ),
    (
        "BMS Interface",
        "Cloud BMS interface dependencies, data types, owners and testing readiness.",
        "bms-interface.html",
        "04",
        "Integration",
    ),
    (
        "Cost Management",
        "Procurement, materials, subcontractor, VO, claim and payment control.",
        "cost-management.html",
        "05",
        "Cost",
    ),
    (
        "Risk Watchlist",
        "Cabling, power, lift, access and submission risks needing active control.",
        "risk-commercial-decision-log.html",
        "06",
        "Risk",
    ),
    (
        "Publishing Guide",
        "Public publishing flow, release gate and exported package reference.",
        "publishing-guide.html",
        "07",
        "System",
    ),
]


def public_nav_items() -> List[Tuple[str, str, str]]:
    return [(f"{code} {title}", title, href) for title, _description, href, code, _tag in HOME_PAGE_CARDS]


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---"):
        return text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return text
    return parts[2].lstrip()


def html_filename_for(markdown_name: str) -> str:
    if markdown_name == "01_Project Dashboard.md":
        return "index.html"
    if markdown_name == "index.md":
        return "publishing-guide.html"
    stem = html.unescape(Path(markdown_name).stem)
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
    lookup["index.md"] = ("index.md", "publishing-guide.html")
    lookup["index"] = ("index.md", "publishing-guide.html")
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
        ("Executive Dashboard", "index.html"),
        ("Action Tracker", "action-tracker.html"),
        ("Mall Tracker", "site-installation-tracker.html"),
        ("Submission Control", "submission-tracker.html"),
        ("BMS Interface", "bms-interface.html"),
        ("Cost Management", "cost-management.html"),
        ("Risk Watchlist", "risk-commercial-decision-log.html"),
        ("Publishing Guide", "publishing-guide.html"),
    ]
    return "\n".join(f'        <a href="{href}">{label}</a>' for label, href in nav_items)


def build_sidebar_nav(active_html: str) -> str:
    return "\n".join(
        [
            f'          <a class="cc-nav-item{" active" if href == active_html else ""}" href="{href}">'
            f'<span class="cc-nav-label">{label}</span></a>'
            for label, _title, href in public_nav_items()
        ]
    )


def build_quick_links(active_html: str) -> str:
    return "\n".join(
        [
            f'          <a class="cc-linkchip{" active" if href == active_html else ""}" href="{href}">{title}</a>'
            for _label, title, href in public_nav_items()
        ]
    )


def topbar_title_for(current_html: str, display_title: str) -> str:
    if current_html == "index.html":
        return "Home / Executive Dashboard"
    if current_html == "publishing-guide.html":
        return "System / Publishing Guide"
    return display_title


def shell_behavior_script() -> str:
    return """<script>
  (() => {
    const shell = document.querySelector('.cc-shell');
    const toggle = document.querySelector('.cc-menu-toggle');
    const sidebar = document.querySelector('.cc-sidebar');
    const backdrop = document.querySelector('.cc-sidebar-backdrop');
    if (!shell || !toggle || !sidebar || !backdrop) return;

    const setOpen = (open) => {
      shell.classList.toggle('is-sidebar-open', open);
      document.body.classList.toggle('cc-nav-lock', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    toggle.addEventListener('click', () => {
      setOpen(!shell.classList.contains('is-sidebar-open'));
    });

    backdrop.addEventListener('click', () => setOpen(false));
    sidebar.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });
  })();
</script>"""


def completion_checkbox_html(checked: bool) -> str:
    checked_attr = " checked" if checked else ""
    aria_checked = "true" if checked else "false"
    return (
        f'<td class="cc-check-cell" data-label="Done">'
        f'<input class="cc-check" type="checkbox" disabled aria-checked="{aria_checked}"{checked_attr}>'
        f"</td>"
    )


def split_markdown_sections(markdown_body: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    current_title: str | None = None
    buffer: List[str] = []

    for line in markdown_body.splitlines():
        match = re.match(r"^##\s+(.+)$", line)
        if match:
            if current_title is not None:
                sections[current_title] = "\n".join(buffer).strip()
            current_title = match.group(1).strip()
            buffer = []
            continue
        if current_title is not None:
            buffer.append(line)

    if current_title is not None:
        sections[current_title] = "\n".join(buffer).strip()
    return sections


def render_markdown_fragment(markdown_text: str) -> str:
    if not markdown_text.strip():
        return ""
    fragment = transform_callouts(markdown_text.strip())
    html_fragment = md.markdown(fragment, extensions=["tables", "fenced_code", "sane_lists"])
    return re.sub(
        r'href="\./([^"]+)\.md"',
        lambda m: f'href="./{html_filename_for(m.group(1) + ".md")}"',
        html_fragment,
    )


def strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def enhance_tables(html_content: str, with_completion_checkbox: bool = False) -> str:
    table_pattern = re.compile(r"<table(?P<attrs>[^>]*)>(?P<body>.*?)</table>", re.DOTALL)

    def add_table_class(attrs: str) -> str:
        if "class=" in attrs:
            return re.sub(
                r'class="([^"]*)"',
                lambda m: f'class="{m.group(1)} cc-table"' if "cc-table" not in m.group(1).split() else m.group(0),
                attrs,
                count=1,
            )
        return f'{attrs} class="cc-table"'

    def replace_table(match: re.Match[str]) -> str:
        attrs = add_table_class(match.group("attrs"))
        table_html = f"<table{attrs}>{match.group('body')}</table>"
        header_match = re.search(r"<thead>.*?<tr>(.*?)</tr>.*?</thead>", table_html, re.DOTALL)
        headers = [strip_tags(item) for item in re.findall(r"<th[^>]*>(.*?)</th>", header_match.group(1), re.DOTALL)] if header_match else []
        if with_completion_checkbox and header_match:
            table_html = re.sub(
                r"(<thead>\s*<tr>)",
                lambda m: f'{m.group(1)}<th class="cc-check-cell">Done</th>',
                table_html,
                count=1,
            )

        def replace_row(row_match: re.Match[str]) -> str:
            row_html = row_match.group(0)
            cell_matches = list(re.finditer(r"<td([^>]*)>(.*?)</td>", row_html, re.DOTALL))
            checked = False
            if with_completion_checkbox and headers:
                for idx, cell_match in enumerate(cell_matches):
                    if idx >= len(headers):
                        continue
                    if headers[idx].strip().lower() != "status":
                        continue
                    status_value = strip_tags(cell_match.group(2)).lower()
                    checked = status_value in {"done", "completed", "complete", "closed"}
                    break
            if not headers:
                return completion_checkbox_html(checked) + row_html if with_completion_checkbox else row_html
            cell_index = [0]

            def replace_cell(cell_match: re.Match[str]) -> str:
                attrs_inner = cell_match.group(1)
                cell_body = cell_match.group(2)
                label = headers[cell_index[0]] if cell_index[0] < len(headers) else f"Column {cell_index[0] + 1}"
                cell_index[0] += 1
                if "data-label=" in attrs_inner:
                    return cell_match.group(0)
                return f'<td{attrs_inner} data-label="{html.escape(label, quote=True)}">{cell_body}</td>'

            rendered_row = re.sub(r"<td([^>]*)>(.*?)</td>", replace_cell, row_html, flags=re.DOTALL)
            if with_completion_checkbox:
                rendered_row = rendered_row.replace("<tr>", f"<tr>{completion_checkbox_html(checked)}", 1)
            return rendered_row

        table_html = re.sub(r"<tbody>.*?</tbody>", lambda m: re.sub(r"<tr>(.*?)</tr>", replace_row, m.group(0), flags=re.DOTALL), table_html, flags=re.DOTALL)
        return f'<div class="table-responsive">{table_html}</div>'

    return table_pattern.sub(replace_table, html_content)


def render_action_buttons(markdown_text: str) -> str:
    items = [line.strip()[2:].strip() for line in markdown_text.splitlines() if line.strip().startswith("- ")]
    if not items:
        return ""

    rendered: List[str] = []
    for item in items:
        link_match = re.match(r"^\[([^\]]+)\]\(([^)]+)\)$", item)
        if link_match:
            label = link_match.group(1).strip()
            href = link_match.group(2).strip()
            if href.startswith("./") and href.endswith(".md"):
                href = f'./{html_filename_for(href[2:])}'
            rendered.append(f'              <a class="cc-btn cc-btn-primary" href="{href}">{label}</a>')
            continue

        label = item
        danger = "Internal / Confidential" in label
        class_name = "cc-btn cc-btn-danger is-disabled" if danger else "cc-btn cc-btn-secondary"
        rendered.append(f'              <span class="{class_name}">{label}</span>')

    return "\n".join(rendered)


def render_section_block(title: str, body_html: str) -> str:
    if not body_html.strip():
        return ""
    return "\n".join(
        [
            '              <section class="cc-section-block">',
            f'                <h3>{title}</h3>',
            f'                <div class="cc-section-content">{body_html}</div>',
            "              </section>",
        ]
    )


def render_dashboard_panel(title: str, tag: str, body_html: str, extra_classes: str = "") -> str:
    panel_classes = "cc-panel"
    if extra_classes:
        panel_classes = f"{panel_classes} {extra_classes}"
    return f"""          <article class="{panel_classes}">
            <div class="cc-panel-head">
              <h2>{title}</h2>
              <span class="cc-panel-tag">{tag}</span>
            </div>
            <div class="cc-panel-body">
{body_html}
            </div>
          </article>"""


def render_mall_map_block() -> str:
    return """
              <div class="cc-media-card">
                <div class="cc-media-frame">
                  <img src="assets/images/mall-map.png" alt="Mall map overview for the HDB Cloud BMS-CCTV, VA and Footfall deployment">
                </div>
                <p class="cc-media-caption">Mall layout reference for executive browsing. Use it as a quick geographic cue alongside the site tracker and priority-site watchlist.</p>
              </div>
""".strip()


def render_executive_dashboard_page(display_title: str, markdown_body: str, description: str, css_href: str) -> str:
    sections = split_markdown_sections(markdown_body)
    action_buttons = render_action_buttons(sections.get("Priority Control Links", ""))
    exec_summary = render_markdown_fragment(sections.get("Executive Summary", ""))
    critical_deadlines = render_markdown_fragment(sections.get("Critical Deadlines", ""))
    kpi_overview = render_markdown_fragment(sections.get("Master KPI Overview", ""))
    priority_sites = render_markdown_fragment(sections.get("Priority Sites", ""))
    key_blockers = render_markdown_fragment(sections.get("Key Blockers", ""))
    week_focus = render_markdown_fragment(sections.get("This Week Focus", ""))
    ceo_updates = render_markdown_fragment(sections.get("CEO Priority Updates", ""))

    panel_one_body = "\n".join(
        [
            '              <div class="cc-action-row">' if action_buttons else "",
            action_buttons,
            "              </div>" if action_buttons else "",
            render_section_block("Executive Summary", exec_summary),
            render_section_block("Critical Deadlines", critical_deadlines),
        ]
    ).strip()
    panel_three_body = "\n".join(
        [
            render_section_block("Priority Sites", priority_sites),
            render_section_block("Key Blockers", key_blockers),
        ]
    ).strip()
    panel_four_body = "\n".join(
        [
            render_section_block("This Week Focus", week_focus),
            render_section_block("CEO Priority Updates", ceo_updates),
        ]
    ).strip()
    mall_map_body = render_mall_map_block()

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{display_title}</title>
  <link rel="stylesheet" href="{css_href}">
</head>
<body>
  <div class="cc-shell">
    <button class="cc-sidebar-backdrop" type="button" aria-label="Close navigation"></button>
    <aside class="cc-sidebar" id="cc-sidebar">
      <div class="cc-brand">
        <div class="cc-brand-eyebrow">PMO Command Center</div>
        <h1 class="cc-brand-title">HDB Cloud BMS-CCTV / VA / Footfall PMO Dashboard</h1>
        <div class="cc-brand-tags">
          <span class="cc-brand-tag">HDB</span>
          <span class="cc-brand-tag">Univers</span>
          <span class="cc-brand-tag success">Xjera</span>
        </div>
      </div>
      <div class="cc-nav-section">Public Dashboards</div>
      <nav class="cc-sidebar-nav" aria-label="Public dashboards">
{build_sidebar_nav("index.html")}
      </nav>
      <div class="cc-sidebar-foot">
        <div class="cc-status-dot"></div>
        <div>
          <div class="cc-status-label">Pending Verification</div>
          <div class="cc-status-meta">Public-safe export only</div>
        </div>
      </div>
    </aside>

    <main class="cc-main">
      <header class="cc-topbar">
        <button class="cc-menu-toggle" type="button" aria-controls="cc-sidebar" aria-expanded="false" aria-label="Open navigation">&#9776;</button>
        <div>
          <div class="cc-topbar-title">Home / Executive Dashboard</div>
          <div class="cc-topbar-subtitle">{description}</div>
        </div>
        <div class="cc-topbar-meta">
          <span>Client: <strong>HDB</strong></span>
          <span>Lead: <strong>Univers</strong></span>
          <span>Subsystem: <strong>Xjera Labs</strong></span>
          <span class="cc-badge">Pending Verification</span>
        </div>
      </header>

      <div class="cc-canvas">
        <section class="cc-page-hero">
          <div>
            <div class="cc-page-eyebrow">Public Dashboard</div>
            <h1>{display_title}</h1>
            <p>{description}</p>
          </div>
          <div class="cc-page-meta">
            <span class="cc-badge">Management Summary</span>
            <div class="cc-page-meta-note">Use this page for controlled browsing and status review.</div>
          </div>
        </section>

        <section class="cc-linkbar">
{build_quick_links("index.html")}
        </section>

        <section class="cc-noticebar">
          <strong>Data note:</strong> {DISCLAIMER}
        </section>

        <section class="cc-grid">
{render_dashboard_panel("Executive Overview", "Deadlines", panel_one_body, "cc-span-2")}
{render_dashboard_panel("This Week Control", "CEO / Follow-up", panel_four_body)}
{render_dashboard_panel("Master KPI Overview", "Control grid", kpi_overview, "cc-span-3")}
{render_dashboard_panel("Priority Sites & Key Blockers", "Execution watchlist", panel_three_body, "cc-span-2")}
{render_dashboard_panel("Mall Coverage Map", "Reference", mall_map_body)}
        </section>
      </div>
    </main>
  </div>
{shell_behavior_script()}
</body>
</html>
"""


def css_asset_href(export_folder: Path) -> str:
    css_path = export_folder / "assets" / "style.css"
    if not css_path.exists():
        return "assets/style.css"
    digest = hashlib.sha1(css_path.read_bytes()).hexdigest()[:10]
    return f"assets/style.css?v={digest}"


def render_html_page(markdown_name: str, markdown_text: str, css_href: str) -> str:
    title, body = split_title_and_body(markdown_text)
    display_title = title.replace("_", " ")
    current_html = html_filename_for(markdown_name)
    description = PAGE_DESCRIPTIONS.get(markdown_name, "Management summary page.")
    if current_html == "index.html":
        return render_executive_dashboard_page(display_title, body, description, css_href)
    if markdown_name == "index.md":
        return render_index_page(display_title, css_href)

    body = transform_callouts(body)
    body_html = md.markdown(body, extensions=["tables", "fenced_code", "sane_lists"])
    body_html = re.sub(
        r'href="\./([^"]+)\.md"',
        lambda m: f'href="./{html_filename_for(m.group(1) + ".md")}"',
        body_html,
    )
    topbar_title = topbar_title_for(current_html, display_title)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{display_title}</title>
  <link rel="stylesheet" href="{css_href}">
</head>
<body>
  <div class="cc-shell">
    <button class="cc-sidebar-backdrop" type="button" aria-label="Close navigation"></button>
    <aside class="cc-sidebar" id="cc-sidebar">
      <div class="cc-brand">
        <div class="cc-brand-eyebrow">PMO Command Center</div>
        <h1 class="cc-brand-title">HDB Cloud BMS-CCTV / VA / Footfall PMO Dashboard</h1>
        <div class="cc-brand-tags">
          <span class="cc-brand-tag">HDB</span>
          <span class="cc-brand-tag">Univers</span>
          <span class="cc-brand-tag success">Xjera</span>
        </div>
      </div>
      <div class="cc-nav-section">Public Dashboards</div>
      <nav class="cc-sidebar-nav" aria-label="Public dashboards">
{build_sidebar_nav(current_html)}
      </nav>
      <div class="cc-sidebar-foot">
        <div class="cc-status-dot"></div>
        <div>
          <div class="cc-status-label">Pending Verification</div>
          <div class="cc-status-meta">Public-safe export only</div>
        </div>
      </div>
    </aside>

    <main class="cc-main">
      <header class="cc-topbar">
        <button class="cc-menu-toggle" type="button" aria-controls="cc-sidebar" aria-expanded="false" aria-label="Open navigation">&#9776;</button>
        <div>
          <div class="cc-topbar-title">{topbar_title}</div>
          <div class="cc-topbar-subtitle">{description}</div>
        </div>
        <div class="cc-topbar-meta">
          <span>Client: <strong>HDB</strong></span>
          <span>Lead: <strong>Univers</strong></span>
          <span>Subsystem: <strong>Xjera Labs</strong></span>
          <span class="cc-badge">Pending Verification</span>
        </div>
      </header>

      <div class="cc-canvas">
        <section class="cc-page-hero">
          <div>
            <div class="cc-page-eyebrow">Public Dashboard</div>
            <h1>{display_title}</h1>
            <p>{description}</p>
          </div>
          <div class="cc-page-meta">
            <span class="cc-badge">Management Summary</span>
            <div class="cc-page-meta-note">Use this page for controlled browsing and status review.</div>
          </div>
        </section>

        <section class="cc-linkbar">
{build_quick_links(current_html)}
        </section>

        <section class="cc-noticebar">
          <strong>Data note:</strong> {DISCLAIMER}
        </section>

        <section class="cc-grid">
          <article class="cc-panel cc-span-3">
            <div class="cc-panel-head">
              <h2>{display_title}</h2>
              <span class="cc-panel-tag">Management summary</span>
            </div>
            <div class="cc-panel-body markdown-body cc-markdown">
{body_html}
            </div>
          </article>
        </section>
      </div>
    </main>
  </div>
{shell_behavior_script()}
</body>
</html>
"""


def render_index_page(display_title: str, css_href: str) -> str:
    kpis = [
        ("Dashboard Views", "8", "public pages", "Executive dashboard, six execution views and one publishing guide."),
        ("HTML Screens", "8", "safe pages", "Includes dashboard, tracker pages, cost and interface placeholders, plus publishing guide."),
        ("Package Mode", "SAFE", "", "Only `Online_Export` belongs in the public sync scope."),
        ("Data Status", "TBC", "", "Use Pending Verification until source evidence is formal."),
        ("Git Sync", "1", "folder", "Publish the generated HTML package directly."),
        ("Release Gate", "MANUAL", "", "Export and sync happen only on explicit request."),
    ]
    kpi_html = "\n".join(
        [
            "\n".join(
                [
                    '        <article class="cc-kpi">',
                    f'          <div class="cc-kpi-label">{label}</div>',
                    f'          <div class="cc-kpi-value">{value}{(f"<span>{unit}</span>" if unit else "")}</div>',
                    f'          <p class="cc-kpi-note">{note}</p>',
                    "        </article>",
                ]
            )
            for label, value, unit, note in kpis
        ]
    )
    stack_rows = "\n".join(
        [
            "\n".join(
                [
                    '            <div class="cc-list-row">',
                    f'              <a class="cc-inline-link" href="{href}">{title}</a>',
                    f'              <span class="cc-chip">{tag}</span>',
                    "            </div>",
                    f'            <p class="cc-row-note">{description}</p>',
                ]
            )
            for title, description, href, _code, tag in HOME_PAGE_CARDS
        ]
    )
    package_rows = "\n".join(
        [
            "\n".join(
                [
                    "              <tr>",
                    f"                <td>{name}</td>",
                    f"                <td>{purpose}</td>",
                    f"                <td>{status}</td>",
                    "              </tr>",
                ]
            )
            for name, purpose, status in [
                ("index.html", "Executive dashboard home page", "Generated"),
                ("action-tracker.html", "Follow-up and escalation view", "Generated"),
                ("site-installation-tracker.html", "Mall tracker and installation readiness view", "Generated"),
                ("submission-tracker.html", "Submission control summary", "Generated"),
                ("bms-interface.html", "Cloud BMS interface control placeholder", "Generated"),
                ("cost-management.html", "Cost management placeholder", "Generated"),
                ("risk-commercial-decision-log.html", "Risk watchlist summary", "Generated"),
                ("publishing-guide.html", "Publishing workflow and release guide", "Generated"),
                ("assets/style.css", "Shared public-safe visual system", "Tracked"),
                (".nojekyll", "Static host compatibility", "Tracked"),
            ]
        ]
    )
    timeline_rows = "\n".join(
        [
            "\n".join(
                [
                    '            <div class="cc-timeline-row">',
                    f'              <div class="cc-timeline-step">{step}</div>',
                    '              <div class="cc-timeline-body">',
                    f'                <div class="cc-timeline-title">{title}</div>',
                    f'                <div class="cc-timeline-note">{note}</div>',
                    "              </div>",
                    "            </div>",
                ]
            )
            for step, title, note in [
                ("01", "Review internal dashboard content", "Confirm the management summary is ready for controlled sharing."),
                ("02", "Run `/export_web` or `export_web.py`", "Rebuild markdown and HTML inside `Online_Export`."),
                ("03", "Check Pending Verification wording", "Do not upgrade project facts without formal source evidence."),
                ("04", "Run safe sync only when requested", "Public publishing should include the generated export package only."),
            ]
        ]
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{display_title}</title>
  <link rel="stylesheet" href="{css_href}">
</head>
<body>
  <div class="cc-shell">
    <button class="cc-sidebar-backdrop" type="button" aria-label="Close navigation"></button>
    <aside class="cc-sidebar" id="cc-sidebar">
      <div class="cc-brand">
        <div class="cc-brand-eyebrow">PMO Command Center</div>
        <h1 class="cc-brand-title">{display_title}</h1>
        <div class="cc-brand-tags">
          <span class="cc-brand-tag">HDB</span>
          <span class="cc-brand-tag">Univers</span>
          <span class="cc-brand-tag success">Xjera</span>
        </div>
      </div>
      <div class="cc-nav-section">Public Dashboards</div>
      <nav class="cc-sidebar-nav" aria-label="Public dashboards">
{build_sidebar_nav("publishing-guide.html")}
      </nav>
      <div class="cc-sidebar-foot">
        <div class="cc-status-dot"></div>
        <div>
          <div class="cc-status-label">Pending Verification</div>
          <div class="cc-status-meta">Public-safe export only</div>
        </div>
      </div>
    </aside>

    <main class="cc-main">
      <header class="cc-topbar">
        <button class="cc-menu-toggle" type="button" aria-controls="cc-sidebar" aria-expanded="false" aria-label="Open navigation">&#9776;</button>
        <div>
          <div class="cc-topbar-title">System / Publishing Guide</div>
          <div class="cc-topbar-subtitle">Management-summary package for controlled external sharing</div>
        </div>
        <div class="cc-topbar-meta">
          <span>Client: <strong>HDB</strong></span>
          <span>Lead: <strong>Univers</strong></span>
          <span>Subsystem: <strong>Xjera Labs</strong></span>
          <span class="cc-badge">Pending Verification</span>
        </div>
      </header>

      <div class="cc-canvas">
        <section class="cc-kpi-row">
{kpi_html}
        </section>

        <section class="cc-noticebar">
          <strong>Data note:</strong> {DISCLAIMER}
        </section>

        <section class="cc-grid">
          <article class="cc-panel">
            <div class="cc-panel-head">
              <h2>Dashboard Stack</h2>
              <span class="cc-panel-tag">8 views</span>
            </div>
            <div class="cc-panel-body cc-list">
{stack_rows}
            </div>
          </article>

          <article class="cc-panel cc-span-2">
            <div class="cc-panel-head">
              <h2>Publishing Workflow</h2>
              <span class="cc-panel-tag">Manual release gate</span>
            </div>
            <div class="cc-panel-body">
              <div class="cc-split">
                <div>
                  <p class="cc-copy">This homepage mirrors the design-system shell used in the offline PMO command center: dark navigation, white control bar, KPI strip, and panel-based review space.</p>
                  <p class="cc-copy">Use this public layer only for management summaries. Internal emails, worker data, attachments, payment detail, and raw PMO notes remain outside the export package.</p>
                </div>
                <div class="cc-rulebox">
                  <div class="cc-rule-title">Public-safe rules</div>
                  <ul class="cc-bullet-list">
                    <li>Keep `Pending Verification` until evidence is formal.</li>
                    <li>Do not publish raw Telegram, email, or attachment content.</li>
                    <li>Safe sync should include `Online_Export` only.</li>
                    <li>Rebuild export before any publishing step.</li>
                  </ul>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section class="cc-grid">
          <article class="cc-panel cc-span-2">
            <div class="cc-panel-head">
              <h2>Publishing Package</h2>
              <span class="cc-panel-tag">Generated artifacts</span>
            </div>
            <div class="cc-panel-body">
              <table class="cc-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Purpose</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
{package_rows}
                </tbody>
              </table>
            </div>
          </article>

          <article class="cc-panel">
            <div class="cc-panel-head">
              <h2>Release Steps</h2>
              <span class="cc-panel-tag">4-step flow</span>
            </div>
            <div class="cc-panel-body">
{timeline_rows}
            </div>
          </article>
        </section>

        <p class="footer">Publishing guidance remains in <a href="README.md">README.md</a>.</p>
      </div>
    </main>
  </div>
{shell_behavior_script()}
</body>
</html>
"""


def write_html_exports(export_folder: Path, markdown_files: List[Path]) -> List[str]:
    written_files: List[str] = []
    css_href = css_asset_href(export_folder)
    for markdown_path in markdown_files:
        markdown_name = markdown_path.name
        html_name = html_filename_for(markdown_name)
        html_content = render_html_page(markdown_name, markdown_path.read_text(encoding="utf-8"), css_href)
        html_content = enhance_tables(html_content, with_completion_checkbox=(html_name == "action-tracker.html"))
        target_path = export_folder / html_name
        target_path.write_text(html_content, encoding="utf-8")
        written_files.append(str(target_path.relative_to(export_folder.parent)).replace("\\", "/"))
    return written_files


def copy_public_assets(vault_root: Path, export_folder: Path) -> List[str]:
    written_files: List[str] = []
    source_path = vault_root / MALL_MAP_SOURCE
    if not source_path.exists():
        return written_files

    target_path = export_folder / MALL_MAP_EXPORT
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)
    written_files.append(str(target_path.relative_to(vault_root)).replace("\\", "/"))
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
    markdown_paths.append(index_path)

    virtual_pages = [
        (
            "06_BMS Interface.md",
            """# 06_BMS Interface

## Interface Control Summary

This page is reserved for the Cloud BMS interface control layer of the multi-mall CCTV / VA / Footfall deployment.

## Current Status

| Field | Value |
|---|---|
| Interface Required | Yes |
| Current Status | TBC |
| Integration Owner | TBC |
| Network Path | TBC |
| Event Mapping | TBC |

## Immediate Focus

- Confirm Cloud BMS interface owner
- Confirm data types and event mapping
- Confirm network path and testing dependency
- Confirm mall-level interface readiness
""",
        ),
        (
            "07_Cost Management.md",
            """# 07_Cost Management

## Cost Control Summary

This page is reserved for procurement, subcontractor, variation order, claim and payment control.

## Current Status

| Field | Value |
|---|---|
| Procurement Status | TBC |
| Subcontractor Status | TBC |
| VO Exposure | TBC |
| Claim Status | TBC |
| Payment Status | TBC |

## Immediate Focus

- Confirm procurement readiness
- Confirm subcontractor availability
- Confirm VO and claim exposure
- Confirm cost risk requiring escalation
""",
        ),
    ]

    for filename, content in virtual_pages:
        virtual_path = export_folder / filename
        virtual_path.write_text(content, encoding="utf-8")
        written_files.append(str(virtual_path.relative_to(vault_root)).replace("\\", "/"))
        markdown_paths.append(virtual_path)

    written_files.extend(copy_public_assets(vault_root, export_folder))
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
