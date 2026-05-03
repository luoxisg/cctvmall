# Online Export README

## What Is Included

The `Online_Export` folder contains a clean, non-sensitive management-summary version of the PMO dashboard:

- `index.md`
- `index.html`
- `01_Project Dashboard.md`
- `02_Action Tracker.md`
- `03_Submission Tracker.md`
- `04_Site & Installation Tracker.md`
- `05_Risk Commercial Decision Log.md`
- `project-dashboard.html`
- `action-tracker.html`
- `submission-tracker.html`
- `site-installation-tracker.html`
- `risk-commercial-decision-log.html`
- `assets/`

This export is suitable for controlled online sharing at management-summary level only.

## What Is Excluded

The following are intentionally excluded from the online export:

- Private email content and raw email files
- Worker records and personal identifiers
- FIN / IC details
- Payment details and claim amounts
- Sensitive subcontractor rate details
- Internal technical notes
- Raw attachments
- Signed source documents
- Detailed testing sheets, punch lists and handover evidence

## Data Handling Rules Used

- Personal data has been removed or generalized
- Sensitive commercial figures are replaced with `Internal / Confidential`
- Unverified fields are shown as `TBC` or `Pending Verification`
- No new facts have been invented

## Publishing Options

### Obsidian Publish

1. Open the `Online_Export` folder as a separate Obsidian vault, or copy it into a publish-safe vault.
2. Review links and formatting.
3. Publish only the pages inside `Online_Export`.

### GitHub Pages

1. Put `Online_Export` in a GitHub repository or publishing branch.
2. Publish the generated HTML package directly with GitHub Pages.
3. Review the final public output before sharing.

### Cloudflare Pages

1. Upload a repository or generated static site based on `Online_Export`.
2. Configure the build to publish Markdown as a static website.
3. Review the final public output before sharing.

### Google Drive Shared HTML / PDF

1. Export the Markdown pages to PDF or HTML.
2. Upload the exported files to Google Drive.
3. Share only the sanitized output files, not the internal vault.

## Final Reminder

This online dashboard is a management summary snapshot. Source-of-truth records remain in the internal Obsidian vault, Excel trackers, emails and signed project documents.
