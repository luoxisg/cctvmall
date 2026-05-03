# 02_Mall Tracker

> [!note] Installation Data Control Board
> Track CCTV / VA / Footfall installation data across all malls by installation type, function type, region, and stage.

[01_Project Dashboard](./01_Project Dashboard.md) | [02_Mall Tracker](./02_Mall Tracker.md) | [03_Submission Tracker](./03_Submission Tracker.md) | [04_Site & Installation Tracker](./04_Site & Installation Tracker.md) | [05_Risk Commercial Decision Log](./05_Risk Commercial Decision Log.md)

## Mall Installation Data

| Mall | Region | Priority | Replacement | Relocation | New Install | VA | Footfall | Drawing | MA Add-on | TBC | Stage | Status | Owner | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Loyang Point | East | High | TBC | TBC | TBC | TBC | TBC | TBC | TBC | TBC | Submission | At Risk | CCTC / Xjera | Confirm point list and survey package |
| Canberra Plaza | Central | High | TBC | TBC | TBC | TBC | TBC | TBC | TBC | TBC | Submission | In Preparation | CCTC / Xjera | Complete submission documentation |
| Rivervale Plaza | East | Medium | TBC | TBC | TBC | TBC | TBC | TBC | TBC | TBC | Survey | TBC | Univers / BMS | Site-level control summary required |
| Parc Point | Central | Medium | TBC | TBC | TBC | TBC | TBC | TBC | TBC | TBC | Planning | Pending Verification | CCTC / Xjera | Confirm scope and survey response |
| Northshore Plaza | North | Low | TBC | TBC | TBC | TBC | TBC | TBC | TBC | TBC | Planning | TBC | TBC | Awaiting project kickoff |

## Installation Type Guide

| Type | Description | Typical Work |
|------|---|---|
| **Replacement** | Using existing position and cables; only camera/device updated | Device replacement, minimal cabling |
| **Relocation** | Moving camera/device to new position within mall | Position change, bracket adjustment, retest and re-pointing |
| **New Installation** | New camera/device with new cabling and infrastructure | Full installation, new conduit, power tap, PoE provisioning, cabling, test, submit |

## Function Type Guide

| Type | Description | BMS/System Impact |
|------|---|---|
| **VA Function** | Video Analytics enabled (intrusion, line crossing, human detection, etc.) | Requires BMS event mapping and configuration |
| **Footfall** | Footfall counting / occupancy points for analytics | Requires footfall data stream to BMS and reporting |

## Source Type Guide

| Type | Description | Commercial Impact |
|------|---|---|
| **As per Drawing** | Points per original design/tender/approved drawing | Baseline scope, included in original VO/rate |
| **MA Requested Addition** | MA / HDB requested add-on points after design phase | Potential VO / cost claim, requires formal change control |

## Filtering & Sorting Tips

- **By Region:** East, Central, North, South, West
- **By Priority:** High (Phase 1), Medium (Phase 2), Low (Future)
- **By Stage:** Planning, Survey, Cabling, Installation, Testing, Submission, BMS, Complete
- **By Installation Type:** Replacement, Relocation, New Install
- **By Function Type:** VA, Footfall, None
- **By Status:** At Risk, On Track, Pending Verification, Complete, TBC

## Installation Data by Mall

### Loyang Point
- **Region:** East
- **Priority:** High (Phase 1 - Xjera CCTV + Univers BMS)
- **Total CCTV Points:** TBC
- **Replacement Only:** TBC | **Relocation:** TBC | **New Installation:** TBC
- **VA Function:** TBC | **Footfall:** TBC
- **As per Drawing:** TBC | **MA Requested Addition:** TBC
- **Current Stage:** Submission Preparation
- **Status:** At Risk (survey/submission package incomplete)
- **Cost Impact:** TBC | **BMS Impact:** Required (Univers Phase 1)
- **Owner:** CCTC / Xjera Labs
- **Next Action:** Confirm point list with survey and cabling team before 4 May 2026

### Canberra Plaza
- **Region:** Central
- **Priority:** High (Phase 1 - Xjera CCTV)
- **Total CCTV Points:** TBC
- **Replacement Only:** TBC | **Relocation:** TBC | **New Installation:** TBC
- **VA Function:** TBC | **Footfall:** TBC
- **As per Drawing:** TBC | **MA Requested Addition:** TBC
- **Current Stage:** Submission Preparation
- **Status:** In Preparation (survey report CR-06 pending)
- **Cost Impact:** TBC | **BMS Impact:** TBC
- **Owner:** CCTC / Xjera Labs
- **Next Action:** Obtain MA/HDB sign-off on survey report (SN 5 / CR-06) before 4 May 2026

### Rivervale Plaza
- **Region:** East
- **Priority:** Medium (Phase 1 - Univers BMS)
- **Total CCTV Points:** TBC
- **Replacement Only:** TBC | **Relocation:** TBC | **New Installation:** TBC
- **VA Function:** TBC | **Footfall:** TBC
- **As per Drawing:** TBC | **MA Requested Addition:** TBC
- **Current Stage:** Site Survey
- **Status:** TBC (site-level control summary required)
- **Cost Impact:** TBC | **BMS Impact:** Required (Univers Phase 1)
- **Owner:** Univers / BMS Integration
- **Next Action:** Prepare site-level control summary and confirm installation points

### Parc Point
- **Region:** Central
- **Priority:** Medium
- **Total CCTV Points:** TBC
- **Replacement Only:** TBC | **Relocation:** TBC | **New Installation:** TBC
- **VA Function:** TBC | **Footfall:** TBC
- **As per Drawing:** TBC | **MA Requested Addition:** TBC
- **Current Stage:** Planning & Scoping
- **Status:** Pending Verification (survey response awaited from MA/HDB)
- **Cost Impact:** TBC | **BMS Impact:** TBC
- **Owner:** CCTC / Xjera Labs
- **Next Action:** Coordinate with MA/HDB to confirm site scope and survey requirements

## Summary Metrics

| Metric | Count |
|--------|-------|
| **Total Malls** | 5 |
| **Phase 1 Malls** | 2 (Loyang Point, Canberra Plaza - CCTV; Loyang Point, Rivervale Plaza - BMS) |
| **Total CCTV Points** | TBC |
| **Replacement Only** | TBC |
| **Relocation** | TBC |
| **New Installation** | TBC |
| **VA Function** | TBC |
| **Footfall** | TBC |
| **As per Drawing** | TBC |
| **MA Requested Addition** | TBC |
| **Malls At Risk** | 1 (Loyang Point) |
| **Malls Pending Verification** | 2 (Parc Point, Rivervale Plaza) |
| **Malls Complete** | 0 |

## Related Control Pages

- **[01_Project Dashboard](./01_Project Dashboard.md)** — Executive summary and critical deadlines
- **[03_Submission Tracker](./03_Submission Tracker.md)** — Installation Point List status and document control
- **[04_Site & Installation Tracker](./04_Site & Installation Tracker.md)** — Site-level detail and subcontractor management
- **[05_Risk Commercial Decision Log](./05_Risk Commercial Decision Log.md)** — Point quantity and MA Add-on risks
- **[06_BMS Interface](./06_BMS Interface.md)** — VA and Footfall function to BMS event mapping
- **[07_Cost Management](./07_Cost Management.md)** — Installation type cost breakdown and VO tracking

## Download / Export

*CSV and Excel export coming soon. For now, reference the markdown table above or contact the project team for detailed point lists and schedules.*
