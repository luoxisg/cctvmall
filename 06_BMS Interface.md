# 06_BMS Interface

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

## VA / Footfall Event Mapping

| Mall | VA Points | Footfall Points | Event Type Required | Mapping Status | Owner | Next Action |
|---|---|---|---|---|---|---|
| Loyang Point | TBC | TBC | Intrusion / Line Crossing / Human Detection | TBC | Univers / CCTC | Confirm BMS data schema |
| Canberra Plaza | TBC | TBC | Intrusion / Line Crossing / Human Detection | TBC | Univers / CCTC | Confirm BMS data schema |
| Rivervale Plaza | TBC | TBC | Footfall Count / Occupancy Trend | TBC | Univers / BMS | Define footfall data stream |
| Parc Point | TBC | TBC | TBC | TBC | TBC | Pending scope confirmation |

**VA Function Events:**
- Intrusion detection alert
- Line crossing event
- Human detection event
- Device health status
- Alarm status

**Footfall Function Data:**
- Footfall count (directional / bidirectional)
- Hourly aggregation
- Daily count
- Occupancy trend / peak hours

*See [02_Mall Tracker](./02_Mall Tracker.md) for detailed VA / Footfall point counts.*

## Immediate Focus

- Confirm Cloud BMS interface owner
- Confirm data types and event mapping per mall
- Confirm network path and testing dependency
- Confirm VA function point list for event mapping
- Confirm footfall data stream and aggregation rules
- Confirm mall-level interface readiness
