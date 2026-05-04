(function () {
  const mapNode = document.getElementById("mall-live-map");
  if (!mapNode) {
    return;
  }

  const config = window.CC_MAP_CONFIG || {};
  const fallbackNode = document.querySelector(".cc-map-fallback");
  const filterContext = document.getElementById("filter-context");
  const heroChipbar = document.getElementById("hero-chipbar");
  const kpiGrid = document.getElementById("kpi-grid");
  const stageChipRow = document.getElementById("stage-chip-row");
  const regionChipRow = document.getElementById("region-chip-row");
  const mapRoster = document.getElementById("map-roster");
  const alertStack = document.getElementById("alert-stack");
  const installationSummary = document.getElementById("installation-summary");
  const priorityMalls = document.getElementById("priority-malls");
  const completedMalls = document.getElementById("completed-malls");
  const blockersPanel = document.getElementById("blockers-panel");
  const bmsSnapshot = document.getElementById("bms-snapshot");
  const bmsEvents = document.getElementById("bms-events");
  const costSnapshot = document.getElementById("cost-snapshot");
  const boardSummary = document.getElementById("board-summary");
  const stageBoardBody = document.getElementById("stage-board-body");
  const searchInput = document.getElementById("search-input");
  const regionSelect = document.getElementById("region-select");
  const stageSelect = document.getElementById("stage-select");
  const statusSelect = document.getElementById("status-select");
  const prioritySelect = document.getElementById("priority-select");
  const ownerSelect = document.getElementById("owner-select");

  const STAGE_FILTERS = [
    "All",
    "Not Started",
    "Site Survey",
    "Installation",
    "Testing",
    "Submitting",
    "BMS Interface",
    "Completed",
    "Blocked",
    "At Risk"
  ];
  const REGION_FILTERS = ["All", "North", "North-East", "East", "Central / South", "West"];
  const STATUS_FILTERS = ["All", "Pending Verification", "Waiting", "In Preparation", "At Risk", "Blocked", "Completed"];
  const PRIORITY_FILTERS = ["All", "High", "Main", "Medium"];
  const EVENT_TYPES = [
    "VA Intrusion Event",
    "Line Crossing Event",
    "Human Detection Event",
    "Camera Offline Event",
    "NVR / Storage Health",
    "Footfall Count",
    "Device Health",
    "Alarm Acknowledgement Status"
  ];

  const state = {
    search: "",
    stage: "All",
    region: "All",
    status: "All",
    priority: "All",
    owner: "All"
  };

  let malls = [];
  let map = null;
  let markerLayer = null;

  function textValue(value, fallback) {
    if (value === null || value === undefined || value === "") {
      return fallback || "TBC";
    }
    return String(value);
  }

  function numericValue(value) {
    return Number.isFinite(value) ? value : null;
  }

  function sumKnown(items, key) {
    const values = items.map((item) => numericValue(item[key])).filter((value) => value !== null);
    if (!values.length) {
      return null;
    }
    return values.reduce((total, value) => total + value, 0);
  }

  function countWhere(items, predicate) {
    return items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
      return "TBC";
    }
    if (typeof value === "number") {
      return value.toLocaleString("en-US");
    }
    return String(value);
  }

  function sortDateValue(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "9999-12-31";
  }

  function hasKeyword(value, keywords) {
    const source = String(value || "").toLowerCase();
    return keywords.some((keyword) => source.includes(keyword));
  }

  function isDoneStatus(value) {
    return hasKeyword(value, ["done", "completed", "live", "connected", "closed"]);
  }

  function isNotApplicable(value) {
    return hasKeyword(value, ["n/a", "not applicable"]);
  }

  function isProgressStatus(value) {
    return hasKeyword(value, ["progress", "preparation", "mapping confirmed", "testing"]);
  }

  function isWaitingStatus(value) {
    return hasKeyword(value, ["waiting"]);
  }

  function isBlockedStatus(value) {
    return hasKeyword(value, ["blocked"]);
  }

  function isRiskStatus(value) {
    return hasKeyword(value, ["risk"]);
  }

  function isTbcStatus(value) {
    return hasKeyword(value, ["tbc", "pending verification"]);
  }

  function isCompletedMall(mall) {
    const surveyDone = isDoneStatus(mall.site_survey_status);
    const installDone = isDoneStatus(mall.installation_status);
    const testDone = isDoneStatus(mall.testing_status);
    const submissionDone = isDoneStatus(mall.submission_status) || isNotApplicable(mall.submission_status);
    const bmsDone = isDoneStatus(mall.bms_interface_status) || isNotApplicable(mall.bms_interface_status);
    const costDone = isDoneStatus(mall.cost_vo_status) || isNotApplicable(mall.cost_vo_status);
    const handoverDone = Boolean(mall.completed_date || mall.handover_evidence_url || mall.handover_evidence);
    return surveyDone && installDone && testDone && submissionDone && bmsDone && costDone && handoverDone;
  }

  function displayStage(mall) {
    return isCompletedMall(mall) ? "Completed" : textValue(mall.current_stage, "Not Started");
  }

  function currentStageFilter(mall) {
    if (isCompletedMall(mall)) {
      return "Completed";
    }
    if (hasKeyword(mall.overall_status, ["blocked"])) {
      return "Blocked";
    }
    if (hasKeyword(mall.overall_status, ["at risk"])) {
      return "At Risk";
    }
    const stage = String(displayStage(mall) || "").toLowerCase();
    if (stage.includes("survey")) {
      return "Site Survey";
    }
    if (stage.includes("install")) {
      return "Installation";
    }
    if (stage.includes("test")) {
      return "Testing";
    }
    if (stage.includes("submit")) {
      return "Submitting";
    }
    if (stage.includes("bms")) {
      return "BMS Interface";
    }
    return "Not Started";
  }

  function stageMarkerClass(stageFilter) {
    switch (stageFilter) {
      case "Site Survey":
        return "is-survey";
      case "Installation":
        return "is-installation";
      case "Testing":
        return "is-testing";
      case "Submitting":
        return "is-submitting";
      case "BMS Interface":
        return "is-bms";
      case "Completed":
        return "is-completed";
      case "Blocked":
      case "At Risk":
        return "is-risk";
      default:
        return "is-not-started";
    }
  }

  function stateClass(value) {
    if (isBlockedStatus(value)) {
      return "is-blocked";
    }
    if (isRiskStatus(value)) {
      return "is-risk";
    }
    if (isDoneStatus(value)) {
      return "is-done";
    }
    if (isWaitingStatus(value)) {
      return "is-waiting";
    }
    if (isProgressStatus(value)) {
      return "is-progress";
    }
    if (isNotApplicable(value)) {
      return "is-na";
    }
    if (isTbcStatus(value)) {
      return "is-tbc";
    }
    if (hasKeyword(value, ["site survey", "installation", "testing", "submitting", "bms interface"])) {
      return "is-progress";
    }
    if (hasKeyword(value, ["not started"])) {
      return "is-not-started";
    }
    return "is-tbc";
  }

  function stateSymbol(value) {
    if (isDoneStatus(value)) {
      return "✓";
    }
    if (isProgressStatus(value)) {
      return "◐";
    }
    if (isWaitingStatus(value)) {
      return "!";
    }
    if (isBlockedStatus(value)) {
      return "×";
    }
    if (isNotApplicable(value)) {
      return "N/A";
    }
    if (isTbcStatus(value)) {
      return "TBC";
    }
    return "–";
  }

  function isBmsPending(mall) {
    return !(isDoneStatus(mall.bms_interface_status) || isNotApplicable(mall.bms_interface_status));
  }

  function isCostExposure(mall) {
    return (
      numericValue(mall.ma_requested_addition_points) > 0 ||
      numericValue(mall.tbc_points) > 0 ||
      isWaitingStatus(mall.cost_vo_status) ||
      isBlockedStatus(mall.cost_vo_status) ||
      hasKeyword(mall.cost_vo_status, ["risk"])
    );
  }

  function isActiveMall(mall) {
    return (
      !isCompletedMall(mall) &&
      (
        mall.priority === "High" ||
        currentStageFilter(mall) !== "Not Started" ||
        ["At Risk", "Blocked", "Waiting", "In Preparation"].includes(mall.overall_status)
      )
    );
  }

  function ownerOptions(items) {
    const set = new Set(items.map((item) => item.owner_group || "PMO"));
    return ["All"].concat(Array.from(set).sort());
  }

  function applySelectOptions(selectNode, options, value) {
    selectNode.innerHTML = options
      .map((option) => `<option value="${option}">${option}</option>`)
      .join("");
    selectNode.value = value;
  }

  function chipButton(filterType, label, count, active) {
    return `<button class="cc-filter-chip${active ? " active" : ""}" type="button" data-filter-type="${filterType}" data-filter-value="${label}">${label} <strong>${count}</strong></button>`;
  }

  function matchesFilters(mall) {
    if (state.search) {
      const haystack = `${mall.mall_name} ${mall.region} ${mall.owner} ${mall.next_action}`.toLowerCase();
      if (!haystack.includes(state.search)) {
        return false;
      }
    }
    if (state.stage !== "All" && currentStageFilter(mall) !== state.stage) {
      return false;
    }
    if (state.region !== "All" && mall.region !== state.region) {
      return false;
    }
    if (state.status !== "All" && mall.overall_status !== state.status) {
      return false;
    }
    if (state.priority !== "All" && mall.priority !== state.priority) {
      return false;
    }
    if (state.owner !== "All" && mall.owner_group !== state.owner) {
      return false;
    }
    return true;
  }

  function filteredMalls() {
    return malls.filter(matchesFilters);
  }

  function renderHeroChips() {
    const riskCount = countWhere(malls, (mall) => ["At Risk", "Blocked"].includes(mall.overall_status));
    const activeCount = countWhere(malls, isActiveMall);
    const completedCount = countWhere(malls, isCompletedMall);
    const bmsPending = countWhere(malls, isBmsPending);
    const markup = [
      { label: "At Risk", value: formatNumber(riskCount), tone: "cc-command-chip-risk" },
      { label: "Active", value: formatNumber(activeCount), tone: "cc-command-chip-neutral" },
      { label: "Malls", value: formatNumber(malls.length), tone: "cc-command-chip-neutral" },
      { label: "CCTV", value: formatNumber(sumKnown(malls, "total_cctv_points")), tone: "cc-command-chip-neutral" },
      { label: "VA", value: formatNumber(sumKnown(malls, "va_function_points")), tone: "cc-command-chip-neutral" },
      { label: "Footfall Pending Split", value: "TBC", tone: "cc-command-chip-warn" },
      { label: "BMS Pending", value: formatNumber(bmsPending), tone: "cc-command-chip-warn" },
      { label: "Completed", value: formatNumber(completedCount), tone: "cc-command-chip-success" }
    ];

    heroChipbar.innerHTML = markup
      .map((item) => `<span class="cc-command-chip ${item.tone}"><strong>${item.value}</strong><span>${item.label}</span></span>`)
      .join("");
  }

  function renderKpis() {
    const totalFootfall = sumKnown(malls, "footfall_points");
    const metrics = [
      { label: "Total Malls", value: formatNumber(malls.length), note: "Current public export baseline", href: "site-installation-tracker.html", tone: "neutral" },
      { label: "Total CCTV Points", value: formatNumber(sumKnown(malls, "total_cctv_points")), note: "Aggregated from mall dataset", href: "site-installation-tracker.html", tone: "neutral" },
      { label: "VA Function Points", value: formatNumber(sumKnown(malls, "va_function_points")), note: "Current VA function baseline", href: "bms-interface.html", tone: "neutral" },
      { label: "Footfall Points", value: totalFootfall === null ? "TBC" : formatNumber(totalFootfall), note: "Pending split remains visible", href: "site-installation-tracker.html", tone: "warn" },
      { label: "Active Malls", value: formatNumber(countWhere(malls, isActiveMall)), note: "High priority or active delivery stage", href: "action-tracker.html", tone: "progress" },
      { label: "Completed Malls", value: formatNumber(countWhere(malls, isCompletedMall)), note: "Formal closure only", href: "site-installation-tracker.html#completed-malls", tone: "success" },
      { label: "Blocked / At Risk", value: formatNumber(countWhere(malls, (mall) => ["At Risk", "Blocked"].includes(mall.overall_status))), note: "Red or blocked status only", href: "risk-commercial-decision-log.html", tone: "risk" },
      { label: "BMS Pending", value: formatNumber(countWhere(malls, isBmsPending)), note: "Not connected or not closed", href: "bms-interface.html", tone: "warn" },
      { label: "Cost / VO Risk", value: countWhere(malls, isCostExposure) ? formatNumber(countWhere(malls, isCostExposure)) : "Pending Split", note: "Unknown split is not forced to zero", href: "cost-management.html", tone: "warn" }
    ];

    kpiGrid.innerHTML = metrics
      .map((item) => {
        const toneClass = `cc-kpi-card-${item.tone}`;
        return [
          `<a class="cc-kpi-card ${toneClass}" href="${item.href}">`,
          `<div class="cc-kpi-label">${item.label}</div>`,
          `<div class="cc-kpi-value">${item.value}</div>`,
          `<div class="cc-kpi-note">${item.note}</div>`,
          `</a>`
        ].join("");
      })
      .join("");
  }

  function renderChips() {
    const stageCounts = STAGE_FILTERS.reduce((acc, label) => {
      acc[label] = label === "All" ? malls.length : countWhere(malls, (mall) => currentStageFilter(mall) === label);
      return acc;
    }, {});

    stageChipRow.innerHTML = STAGE_FILTERS
      .map((label) => chipButton("stage", label, stageCounts[label], state.stage === label))
      .join("");

    const regionCounts = REGION_FILTERS.reduce((acc, label) => {
      acc[label] = label === "All" ? malls.length : countWhere(malls, (mall) => mall.region === label);
      return acc;
    }, {});

    regionChipRow.innerHTML = REGION_FILTERS
      .map((label) => chipButton("region", label, regionCounts[label], state.region === label))
      .join("");

    stageChipRow.querySelectorAll("[data-filter-value]").forEach((button) => {
      button.addEventListener("click", () => {
        state.stage = button.dataset.filterValue;
        stageSelect.value = state.stage;
        refresh();
      });
    });

    regionChipRow.querySelectorAll("[data-filter-value]").forEach((button) => {
      button.addEventListener("click", () => {
        state.region = button.dataset.filterValue;
        regionSelect.value = state.region;
        refresh();
      });
    });
  }

  function markerSizeClass(points) {
    if (!Number.isFinite(points)) {
      return "size-small";
    }
    if (points >= 120) {
      return "size-large";
    }
    if (points >= 45) {
      return "size-medium";
    }
    return "size-small";
  }

  function markerShapeClass(mall) {
    if (["At Risk", "Blocked"].includes(mall.overall_status)) {
      return "shape-diamond";
    }
    if (currentStageFilter(mall) === "BMS Interface") {
      return "shape-square";
    }
    return "shape-circle";
  }

  function markerIcon(mall) {
    const stageClass = stageMarkerClass(currentStageFilter(mall));
    const sizeClass = markerSizeClass(mall.total_cctv_points);
    const shapeClass = markerShapeClass(mall);
    const verifiedClass = mall.coordinate_verified ? "" : " is-unverified";
    const size = sizeClass === "size-large" ? 24 : sizeClass === "size-medium" ? 18 : 14;
    return L.divIcon({
      className: "cc-map-div-icon",
      html: `<span class="cc-map-marker ${stageClass} ${shapeClass} ${sizeClass}${verifiedClass}"></span>`,
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
      popupAnchor: [0, -10]
    });
  }

  function popupHtml(mall) {
    return [
      `<div class="cc-map-popup-title">${mall.mall_name}</div>`,
      `<div class="cc-map-popup-meta">${mall.region} | ${displayStage(mall)} | ${mall.owner}</div>`,
      `<div class="cc-map-popup-grid">`,
      `<div><strong>Total CCTV</strong><span>${formatNumber(mall.total_cctv_points)}</span></div>`,
      `<div><strong>VA Function</strong><span>${formatNumber(mall.va_function_points)}</span></div>`,
      `<div><strong>Footfall</strong><span>${textValue(mall.footfall_points, "TBC")}</span></div>`,
      `<div><strong>Replacement Only</strong><span>${textValue(mall.replacement_only_points, "TBC")}</span></div>`,
      `<div><strong>Relocation</strong><span>${textValue(mall.relocation_points, "TBC")}</span></div>`,
      `<div><strong>New Installation</strong><span>${textValue(mall.new_installation_points, "TBC")}</span></div>`,
      `<div><strong>As per Drawing</strong><span>${textValue(mall.as_per_drawing_points, "TBC")}</span></div>`,
      `<div><strong>MA Requested Addition</strong><span>${textValue(mall.ma_requested_addition_points, "TBC")}</span></div>`,
      `<div><strong>Current Stage</strong><span>${displayStage(mall)}</span></div>`,
      `<div><strong>BMS Interface</strong><span>${textValue(mall.bms_interface_status, "TBC")}</span></div>`,
      `<div><strong>Status</strong><span>${textValue(mall.overall_status, "Pending Verification")}</span></div>`,
      `</div>`,
      `<div class="cc-map-popup-note"><strong>Next Action</strong><span>${textValue(mall.next_action, "Pending verification")}</span></div>`,
      `<div class="cc-map-popup-note"><strong>Owner</strong><span>${textValue(mall.owner, "PMO")}</span></div>`,
      `<a class="cc-map-popup-link" href="${mall.linked_page}">Open linked page</a>`
    ].join("");
  }

  function renderMapRoster(items) {
    const priorityItems = items
      .filter((mall) => mall.priority === "High" || ["At Risk", "Blocked", "Waiting", "In Preparation"].includes(mall.overall_status))
      .slice(0, 6);

    if (!priorityItems.length) {
      mapRoster.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No roster item under current filter</div><p>Adjust the stage or region chips to repopulate the priority marker roster.</p></div>';
      return;
    }

    mapRoster.innerHTML = priorityItems
      .map((mall) => [
        `<a class="cc-map-roster-row" href="${mall.linked_page}">`,
        `<div class="cc-map-roster-main">`,
        `<span class="cc-map-marker ${stageMarkerClass(currentStageFilter(mall))} ${markerShapeClass(mall)} ${markerSizeClass(mall.total_cctv_points)}"></span>`,
        `<div>`,
        `<div class="cc-map-roster-title">${mall.mall_name}</div>`,
        `<div class="cc-map-roster-meta">${mall.region} / ${displayStage(mall)} / ${mall.owner_group}</div>`,
        `</div>`,
        `</div>`,
        `<span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span>`,
        `</a>`
      ].join(""))
      .join("");
  }

  function renderMap(items) {
    if (!map || !markerLayer) {
      return;
    }
    markerLayer.clearLayers();

    items.forEach((mall) => {
      const marker = L.marker([mall.latitude, mall.longitude], { icon: markerIcon(mall) });
      marker.bindPopup(popupHtml(mall));
      markerLayer.addLayer(marker);
    });

    if (items.length) {
      const bounds = L.latLngBounds(items.map((mall) => [mall.latitude, mall.longitude]));
      map.fitBounds(bounds.pad(0.08));
    } else {
      map.setView([config.defaultCenter.lat, config.defaultCenter.lng], config.defaultZoom || 11);
    }

    renderMapRoster(items);
  }

  function renderAlerts() {
    const alerts = malls
      .filter((mall) => mall.priority === "High" || ["At Risk", "Blocked", "Waiting", "In Preparation"].includes(mall.overall_status))
      .sort((left, right) => sortDateValue(left.target_date).localeCompare(sortDateValue(right.target_date)))
      .slice(0, 6)
      .map((mall) => {
        let type = "Critical Deadline";
        if (displayStage(mall) === "BMS Interface") {
          type = "BMS Interface Risk";
        } else if (displayStage(mall) === "Site Survey") {
          type = "Survey Blocker";
        } else if (displayStage(mall) === "Submitting") {
          type = "Submission Risk";
        }
        const severity = mall.overall_status === "At Risk" ? "Critical" : mall.overall_status === "Waiting" ? "Warning" : "Info";
        const tone = severity === "Critical" ? "is-risk" : severity === "Warning" ? "is-waiting" : "is-progress";
        return { mall, type, severity, tone };
      });

    if (!alerts.length) {
      alertStack.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No live alert in current export</div><p>Once a blocker, deadline or BMS dependency is logged, the alert stack will surface it here.</p></div>';
      return;
    }

    alertStack.innerHTML = alerts
      .map(({ mall, type, severity, tone }) => [
        `<a class="cc-alert-card ${tone}" href="${mall.linked_page}">`,
        `<div class="cc-alert-head">`,
        `<div>`,
        `<div class="cc-alert-title">${type}</div>`,
        `<div class="cc-alert-body">${mall.mall_name}</div>`,
        `</div>`,
        `<span class="cc-state ${stateClass(mall.overall_status)}">${severity}</span>`,
        `</div>`,
        `<div class="cc-alert-grid">`,
        `<div class="cc-alert-item"><strong>Affected Scope</strong><span>${mall.region} / ${displayStage(mall)}</span></div>`,
        `<div class="cc-alert-item"><strong>Deadline</strong><span>${textValue(mall.target_date, "TBC")}</span></div>`,
        `<div class="cc-alert-item"><strong>Risk Description</strong><span>${textValue(mall.blocker, "Pending verification")}</span></div>`,
        `<div class="cc-alert-item"><strong>Next Control Step</strong><span>${textValue(mall.next_action, "Pending verification")}</span></div>`,
        `</div>`,
        `</a>`
      ].join(""))
      .join("");
  }

  function summaryCard(label, value, note, toneClass, href) {
    const linkOpen = href ? `<a class="cc-mini-metric cc-mini-metric-linkable ${toneClass}" href="${href}">` : `<div class="cc-mini-metric ${toneClass}">`;
    const linkClose = href ? "</a>" : "</div>";
    return [
      linkOpen,
      `<div class="cc-mini-metric-label">${label}</div>`,
      `<div class="cc-mini-metric-value">${value}</div>`,
      `<div class="cc-mini-metric-note">${note}</div>`,
      linkClose
    ].join("");
  }

  function renderInstallationSummary() {
    const metrics = [
      ["Total CCTV Points", sumKnown(malls, "total_cctv_points"), "Baseline loaded from current mall register", "cc-mini-metric-accent"],
      ["Replacement Only", sumKnown(malls, "replacement_only_points"), "Pending split remains visible until point classification is frozen", "cc-mini-metric-warn"],
      ["Relocation", sumKnown(malls, "relocation_points"), "Public export still awaiting relocation breakdown", "cc-mini-metric-warn"],
      ["New Installation", sumKnown(malls, "new_installation_points"), "New-install count is not forced to zero while unresolved", "cc-mini-metric-warn"],
      ["VA Function", sumKnown(malls, "va_function_points"), "VA function baseline already loaded", "cc-mini-metric-accent"],
      ["Footfall", sumKnown(malls, "footfall_points"), "Footfall split is still TBC in current export", "cc-mini-metric-warn"],
      ["As per Drawing", sumKnown(malls, "as_per_drawing_points"), "Drawing-vs-site split not frozen yet", "cc-mini-metric-warn"],
      ["MA Requested Addition", sumKnown(malls, "ma_requested_addition_points"), "Future VO sensitivity stays highlighted", "cc-mini-metric-risk"],
      ["TBC / Unconfirmed", sumKnown(malls, "tbc_points"), "Unknown points remain explicitly flagged", "cc-mini-metric-risk"]
    ];

    installationSummary.innerHTML = metrics
      .map(([label, value, note, tone]) => summaryCard(label, value === null ? "Pending Split" : formatNumber(value), note, tone, "site-installation-tracker.html"))
      .join("");
  }

  function checkpoint(label, value) {
    return [
      `<span class="cc-checkpoint ${stateClass(value)}">`,
      `<span class="cc-checkpoint-box">${stateSymbol(value)}</span>`,
      `<span class="cc-checkpoint-label">${label}: ${textValue(value, "TBC")}</span>`,
      `</span>`
    ].join("");
  }

  function renderBoard() {
    const items = filteredMalls();
    boardSummary.textContent = `Showing ${items.length} of ${malls.length} malls under the current filter context.`;

    if (!items.length) {
      stageBoardBody.innerHTML = '<tr><td colspan="23"><div class="cc-empty-state"><div class="cc-empty-title">No mall matches the current filter</div><p>Clear one or more filters to recover the delivery control board.</p></div></td></tr>';
      return;
    }

    stageBoardBody.innerHTML = items
      .map((mall) => [
        `<tr>`,
        `<td><a class="cc-inline-link" href="${mall.linked_page}">${mall.mall_name}</a></td>`,
        `<td>${mall.region}</td>`,
        `<td><span class="cc-state ${mall.priority === "High" ? "is-risk" : "is-progress"}">${mall.priority}</span></td>`,
        `<td>${formatNumber(mall.total_cctv_points)}</td>`,
        `<td>${textValue(mall.replacement_only_points, "TBC")}</td>`,
        `<td>${textValue(mall.relocation_points, "TBC")}</td>`,
        `<td>${textValue(mall.new_installation_points, "TBC")}</td>`,
        `<td>${formatNumber(mall.va_function_points)}</td>`,
        `<td>${textValue(mall.footfall_points, "TBC")}</td>`,
        `<td>${textValue(mall.as_per_drawing_points, "TBC")}</td>`,
        `<td>${textValue(mall.ma_requested_addition_points, "TBC")}</td>`,
        `<td><span class="cc-state ${stateClass(displayStage(mall))}">${displayStage(mall)}</span></td>`,
        `<td>${checkpoint("Survey", mall.site_survey_status)}</td>`,
        `<td>${checkpoint("Install", mall.installation_status)}</td>`,
        `<td>${checkpoint("Test", mall.testing_status)}</td>`,
        `<td><a class="cc-inline-link" href="submission-tracker.html">${checkpoint("Submit", mall.submission_status)}</a></td>`,
        `<td><a class="cc-inline-link" href="bms-interface.html">${checkpoint("BMS", mall.bms_interface_status)}</a></td>`,
        `<td><a class="cc-inline-link" href="cost-management.html">${checkpoint("Cost", mall.cost_vo_status)}</a></td>`,
        `<td><span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span></td>`,
        `<td class="cc-wrap-cell">${textValue(mall.next_action, "Pending verification")}</td>`,
        `<td>${textValue(mall.owner, "PMO")}</td>`,
        `<td>${textValue(mall.target_date, "TBC")}</td>`,
        `<td><a class="cc-inline-link" href="${mall.linked_page}">Open</a></td>`,
        `</tr>`
      ].join(""))
      .join("");
  }

  function renderPriorityMalls() {
    const items = filteredMalls()
      .filter((mall) => mall.priority === "High" || ["At Risk", "Blocked", "Waiting", "In Preparation"].includes(mall.overall_status))
      .sort((left, right) => sortDateValue(left.target_date).localeCompare(sortDateValue(right.target_date)))
      .slice(0, 6);

    if (!items.length) {
      priorityMalls.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No active priority mall under current filter</div><p>Priority malls appear here when high attention, waiting or at-risk conditions are present.</p></div>';
      return;
    }

    priorityMalls.innerHTML = items
      .map((mall) => [
        `<a class="cc-mall-card" href="${mall.linked_page}">`,
        `<div class="cc-mall-card-head">`,
        `<div class="cc-mall-card-title">${mall.mall_name}</div>`,
        `<span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span>`,
        `</div>`,
        `<div class="cc-mall-card-meta">Stage: <strong>${displayStage(mall)}</strong></div>`,
        `<div class="cc-mall-card-metrics">CCTV: <strong>${formatNumber(mall.total_cctv_points)}</strong> | VA: <strong>${formatNumber(mall.va_function_points)}</strong> | Footfall: <strong>${textValue(mall.footfall_points, "TBC")}</strong></div>`,
        `<div class="cc-mall-card-meta">Submission: <strong>${textValue(mall.submission_status, "TBC")}</strong> | BMS: <strong>${textValue(mall.bms_interface_status, "TBC")}</strong> | Cost / VO: <strong>${textValue(mall.cost_vo_status, "TBC")}</strong></div>`,
        `<div class="cc-mall-card-note">${textValue(mall.blocker, "No explicit blocker in current export")}</div>`,
        `<div class="cc-mall-card-meta">Owner: <strong>${textValue(mall.owner, "PMO")}</strong> | Due: <strong>${textValue(mall.target_date, "TBC")}</strong></div>`,
        `</a>`
      ].join(""))
      .join("");
  }

  function renderCompleted() {
    const items = malls.filter(isCompletedMall);
    if (!items.length) {
      completedMalls.innerHTML = [
        '<div class="cc-empty-state">',
        '<div class="cc-empty-title">0 confirmed completed malls</div>',
        '<p>No mall is formally closed across installation, testing, submission, BMS and cost at this export.</p>',
        '</div>'
      ].join("");
      return;
    }

    completedMalls.innerHTML = [
      '<div class="table-responsive"><table class="cc-table">',
      '<thead><tr><th>Mall</th><th>Completion Date</th><th>CCTV Completed</th><th>VA Completed</th><th>Footfall Completed</th><th>BMS Status</th><th>Final Submission</th><th>Cost / VO Closure</th><th>Handover Evidence</th></tr></thead>',
      '<tbody>',
      items.map((mall) => [
        '<tr>',
        `<td><a class="cc-inline-link" href="${mall.linked_page}">${mall.mall_name}</a></td>`,
        `<td>${textValue(mall.completed_date, "TBC")}</td>`,
        `<td>${formatNumber(mall.total_cctv_points)}</td>`,
        `<td>${formatNumber(mall.va_function_points)}</td>`,
        `<td>${textValue(mall.footfall_points, "TBC")}</td>`,
        `<td>${textValue(mall.bms_interface_status, "TBC")}</td>`,
        `<td>${textValue(mall.submission_status, "TBC")}</td>`,
        `<td>${textValue(mall.cost_vo_status, "TBC")}</td>`,
        `<td>${mall.handover_evidence_url ? `<a class="cc-inline-link" href="${mall.handover_evidence_url}">Open</a>` : "TBC"}</td>`,
        '</tr>'
      ].join("")).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function blockerImpactType(mall) {
    const stage = displayStage(mall);
    if (stage === "Submitting") {
      return "Submission";
    }
    if (stage === "BMS Interface") {
      return "BMS";
    }
    if (stage === "Site Survey") {
      return "Site";
    }
    if (isCostExposure(mall)) {
      return "Commercial / VO";
    }
    return "Schedule";
  }

  function renderBlockers() {
    const items = filteredMalls()
      .filter((mall) => mall.blocker && mall.blocker !== "None formally logged in public export")
      .slice(0, 8);

    if (!items.length) {
      blockersPanel.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No named blocker under current filter</div><p>As blockers are escalated from submission, BMS, site access or commercial control, they will be surfaced here.</p></div>';
      return;
    }

    blockersPanel.innerHTML = [
      '<div class="table-responsive"><table class="cc-table">',
      '<thead><tr><th>Blocker</th><th>Affected Mall</th><th>Impact Type</th><th>Impact</th><th>Owner</th><th>Next Control Step</th><th>Due Date</th><th>Linked Page</th><th>Status</th></tr></thead><tbody>',
      items.map((mall) => [
        '<tr>',
        `<td class="cc-wrap-cell">${textValue(mall.blocker, "Pending verification")}</td>`,
        `<td>${mall.mall_name}</td>`,
        `<td>${blockerImpactType(mall)}</td>`,
        `<td>${currentStageFilter(mall)} / ${mall.overall_status}</td>`,
        `<td>${textValue(mall.owner, "PMO")}</td>`,
        `<td class="cc-wrap-cell">${textValue(mall.next_action, "Pending verification")}</td>`,
        `<td>${textValue(mall.target_date, "TBC")}</td>`,
        `<td><a class="cc-inline-link" href="${mall.linked_page}">Open</a></td>`,
        `<td><span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span></td>`,
        '</tr>'
      ].join("")).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function renderBmsSnapshot() {
    const connected = countWhere(malls, (mall) => hasKeyword(mall.bms_interface_status, ["connected", "live", "done"]));
    const inProgress = countWhere(malls, (mall) => isProgressStatus(mall.bms_interface_status));
    const pending = countWhere(malls, (mall) => isBmsPending(mall) && !isProgressStatus(mall.bms_interface_status));
    const mappingPending = countWhere(malls, (mall) => currentStageFilter(mall) === "BMS Interface" || isBmsPending(mall));

    const cards = [
      ["BMS Connected Malls", formatNumber(connected), "Formally connected or live", "cc-mini-metric-success"],
      ["BMS In Progress", formatNumber(inProgress), "Interface workstream already active", "cc-mini-metric-accent"],
      ["BMS Pending", formatNumber(pending), "No confirmed BMS closure yet", "cc-mini-metric-warn"],
      ["VA Event Mapping Pending", formatNumber(mappingPending), "Event mapping still open in export", "cc-mini-metric-warn"],
      ["Footfall Data Mapping Pending", sumKnown(malls, "footfall_points") === null ? "Pending Split" : formatNumber(mappingPending), "Footfall pipeline remains unconfirmed", "cc-mini-metric-warn"],
      ["Alarm Routing Pending", formatNumber(mappingPending), "Alarm routing closure not frozen", "cc-mini-metric-risk"],
      ["API / Data Owner TBC", formatNumber(pending), "Interface ownership still open on most malls", "cc-mini-metric-risk"]
    ];

    bmsSnapshot.innerHTML = cards
      .map(([label, value, note, tone]) => summaryCard(label, value, note, tone, "bms-interface.html"))
      .join("");

    bmsEvents.innerHTML = [
      '<div class="cc-sublist-title">Supported BMS event payloads</div>',
      '<div class="cc-badge-list">',
      EVENT_TYPES.map((type) => `<span class="cc-state is-progress">${type}</span>`).join(""),
      '</div>'
    ].join("");
  }

  function renderCostSnapshot() {
    const costCards = [
      ["Replacement Only Points", sumKnown(malls, "replacement_only_points"), "Awaiting detailed point split", "cc-mini-metric-warn"],
      ["Relocation Points", sumKnown(malls, "relocation_points"), "Relocation count not frozen yet", "cc-mini-metric-warn"],
      ["New Installation Points", sumKnown(malls, "new_installation_points"), "New installation remains commercially sensitive", "cc-mini-metric-risk"],
      ["MA Requested Addition Points", sumKnown(malls, "ma_requested_addition_points"), "MA add-ons feed VO exposure", "cc-mini-metric-risk"],
      ["Unconfirmed / TBC Points", sumKnown(malls, "tbc_points"), "Unknown scope stays visible", "cc-mini-metric-risk"],
      ["Estimated VO Exposure", countWhere(malls, (mall) => mall.priority === "High" || isCostExposure(mall)), "High-attention malls need commercial freeze", "cc-mini-metric-risk"],
      ["Procurement Pending Items", countWhere(malls, (mall) => currentStageFilter(mall) !== "Completed"), "Pending mall split affects procurement planning", "cc-mini-metric-warn"],
      ["Subcontractor Pending Items", countWhere(malls, (mall) => !isDoneStatus(mall.installation_status)), "Installation closure not complete across most malls", "cc-mini-metric-warn"]
    ];

    costSnapshot.innerHTML = costCards
      .map(([label, value, note, tone]) => summaryCard(label, value === null ? "Pending Split" : formatNumber(value), note, tone, "cost-management.html"))
      .join("");
  }

  function refreshContext(items) {
    const filters = [];
    if (state.stage !== "All") {
      filters.push(`stage: ${state.stage}`);
    }
    if (state.region !== "All") {
      filters.push(`region: ${state.region}`);
    }
    if (state.status !== "All") {
      filters.push(`status: ${state.status}`);
    }
    if (state.priority !== "All") {
      filters.push(`priority: ${state.priority}`);
    }
    if (state.owner !== "All") {
      filters.push(`owner: ${state.owner}`);
    }
    if (state.search) {
      filters.push(`search: "${state.search}"`);
    }

    filterContext.textContent = filters.length
      ? `Filter active: ${filters.join(" / ")} (${items.length} of ${malls.length} malls)`
      : "Showing all malls";
  }

  function refresh() {
    const items = filteredMalls();
    renderChips();
    renderMap(items);
    renderBoard();
    renderPriorityMalls();
    renderBlockers();
    refreshContext(items);
  }

  function wireControls() {
    applySelectOptions(regionSelect, REGION_FILTERS, state.region);
    applySelectOptions(stageSelect, STAGE_FILTERS, state.stage);
    applySelectOptions(statusSelect, STATUS_FILTERS, state.status);
    applySelectOptions(prioritySelect, PRIORITY_FILTERS, state.priority);
    applySelectOptions(ownerSelect, ownerOptions(malls), state.owner);

    searchInput.addEventListener("input", () => {
      state.search = searchInput.value.trim().toLowerCase();
      refresh();
    });
    regionSelect.addEventListener("change", () => {
      state.region = regionSelect.value;
      refresh();
    });
    stageSelect.addEventListener("change", () => {
      state.stage = stageSelect.value;
      refresh();
    });
    statusSelect.addEventListener("change", () => {
      state.status = statusSelect.value;
      refresh();
    });
    prioritySelect.addEventListener("change", () => {
      state.priority = prioritySelect.value;
      refresh();
    });
    ownerSelect.addEventListener("change", () => {
      state.owner = ownerSelect.value;
      refresh();
    });
  }

  function showFallback(message) {
    if (fallbackNode) {
      fallbackNode.hidden = false;
      const footnote = fallbackNode.querySelector(".cc-map-footnote");
      if (footnote && message) {
        footnote.textContent = message;
      }
    }
    mapNode.hidden = true;
  }

  function setupMap() {
    if (typeof L === "undefined") {
      showFallback("Static fallback shown because live map API is unavailable.");
      return;
    }

    map = L.map(mapNode, {
      zoomControl: true,
      minZoom: 10,
      maxZoom: 18
    }).setView([config.defaultCenter.lat, config.defaultCenter.lng], config.defaultZoom || 11);

    L.tileLayer(config.tilesUrl, {
      maxZoom: 18,
      attribution: config.attribution
    }).addTo(map);

    markerLayer =
      config.enableClustering && typeof L.markerClusterGroup === "function"
        ? L.markerClusterGroup()
        : L.layerGroup();

    map.addLayer(markerLayer);
  }

  async function loadData() {
    const response = await fetch(config.geojsonPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${config.geojsonPath}`);
    }

    const geojson = await response.json();
    return (geojson.features || [])
      .filter((feature) => feature && feature.geometry && feature.geometry.type === "Point")
      .map((feature) => {
        const props = feature.properties || {};
        const coordinates = feature.geometry.coordinates || [];
        return {
          mall_id: props.mall_id,
          mall_name: props.mall_name || "Unnamed Mall",
          region: props.region || "TBC",
          priority: props.priority || "Main",
          total_cctv_points: numericValue(props.total_cctv_points),
          replacement_only_points: numericValue(props.replacement_only_points),
          relocation_points: numericValue(props.relocation_points),
          new_installation_points: numericValue(props.new_installation_points),
          va_function_points: numericValue(props.va_function_points),
          footfall_points: numericValue(props.footfall_points),
          as_per_drawing_points: numericValue(props.as_per_drawing_points),
          ma_requested_addition_points: numericValue(props.ma_requested_addition_points),
          tbc_points: numericValue(props.tbc_points),
          current_stage: props.current_stage || "Not Started",
          site_survey_status: props.site_survey_status || "TBC",
          installation_status: props.installation_status || "TBC",
          testing_status: props.testing_status || "TBC",
          submission_status: props.submission_status || "TBC",
          bms_interface_status: props.bms_interface_status || "TBC",
          cost_vo_status: props.cost_vo_status || "TBC",
          overall_status: props.overall_status || "Pending Verification",
          owner: props.owner || props.delivery_lead || "PMO",
          owner_group: props.owner_group || "PMO",
          next_action: props.next_action || "Pending verification",
          target_date: props.target_date || "TBC",
          blocker: props.blocker || "Pending verification",
          linked_page: props.linked_page || "site-installation-tracker.html",
          vendor_lead: props.vendor_lead || "Pending Verification",
          delivery_lead: props.delivery_lead || props.owner || "Pending Verification",
          subcontractor: props.subcontractor || "Pending Verification",
          coordinate_verified: Boolean(props.coordinate_verified),
          completed_date: props.completed_date || null,
          handover_evidence_url: props.handover_evidence_url || null,
          latitude: Number(coordinates[1]),
          longitude: Number(coordinates[0])
        };
      })
      .filter((mall) => Number.isFinite(mall.latitude) && Number.isFinite(mall.longitude));
  }

  async function init() {
    try {
      malls = await loadData();
      setupMap();
      wireControls();
      renderHeroChips();
      renderKpis();
      renderAlerts();
      renderInstallationSummary();
      renderCompleted();
      renderBmsSnapshot();
      renderCostSnapshot();
      refresh();
    } catch (error) {
      console.warn("Executive dashboard failed to initialize.", error);
      showFallback("Static fallback shown because live map API is unavailable.");
      if (filterContext) {
        filterContext.textContent = "Live data failed to load. Static fallback is shown.";
      }
    }
  }

  init();
})();
