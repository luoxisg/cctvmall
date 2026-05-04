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
  const secondaryFilterTitle = document.getElementById("secondary-filter-title");
  const mapRoster = document.getElementById("map-roster");
  const alertStack = document.getElementById("alert-stack");
  const ceoArrangements = document.getElementById("ceo-arrangements");
  const deliveryPipeline = document.getElementById("delivery-pipeline");
  const installationSummary = document.getElementById("installation-summary");
  const vendorResponsibility = document.getElementById("vendor-responsibility");
  const kpiSummaryMobile = document.getElementById("kpi-summary-mobile");
  const priorityMalls = document.getElementById("priority-malls");
  const completedMalls = document.getElementById("completed-malls");
  const blockersPanel = document.getElementById("blockers-panel");
  const bmsSnapshot = document.getElementById("bms-snapshot");
  const bmsEvents = document.getElementById("bms-events");
  const costSnapshot = document.getElementById("cost-snapshot");
  const dataQualityLog = document.getElementById("data-quality-log");
  const boardSummary = document.getElementById("board-summary");
  const stageBoardBody = document.getElementById("stage-board-body");
  const searchInput = document.getElementById("search-input");
  const regionSelect = document.getElementById("region-select");
  const stageSelect = document.getElementById("stage-select");
  const statusSelect = document.getElementById("status-select");
  const prioritySelect = document.getElementById("priority-select");
  const ownerSelect = document.getElementById("owner-select");
  const mallSheet = document.getElementById("mall-sheet");
  const mallSheetBackdrop = document.getElementById("mall-sheet-backdrop");
  const mallSheetClose = document.getElementById("mall-sheet-close");
  const mallSheetContent = document.getElementById("mall-sheet-content");

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
  const OWNER_FILTERS = ["All", "Univers", "CCTC", "Xjera", "Subcontractor"];
  const STATUS_FILTERS = ["All", "Pending Verification", "Waiting", "In Preparation", "At Risk", "Blocked", "Completed"];
  const PRIORITY_FILTERS = ["All", "High", "Main", "Medium"];
  const BMS_EVENT_TYPES = [
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

  function isMobileViewport() {
    return window.innerWidth <= 768;
  }

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
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
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

  function shortDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
      return "TBC";
    }
    const parts = String(value).split("-");
    return `${parts[2]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(parts[1]) - 1]}`;
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
    const stage = String(displayStage(mall)).toLowerCase();
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
      return "&#10003;";
    }
    if (isBlockedStatus(value)) {
      return "&#10005;";
    }
    if (isWaitingStatus(value) || isRiskStatus(value)) {
      return "&#9888;";
    }
    if (isProgressStatus(value)) {
      return "...";
    }
    if (isNotApplicable(value)) {
      return "N/A";
    }
    if (isTbcStatus(value)) {
      return "TBC";
    }
    return "-";
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

  function isActionNeeded(mall) {
    return ["At Risk", "Blocked", "Waiting", "In Preparation"].includes(mall.overall_status) || mall.priority === "High";
  }

  function isActiveMall(mall) {
    return !isCompletedMall(mall) && (isActionNeeded(mall) || currentStageFilter(mall) !== "Not Started");
  }

  function ownerOptions(items) {
    const set = new Set(items.map((item) => item.owner_group || "PMO"));
    return ["All"].concat(Array.from(set).sort());
  }

  function applySelectOptions(selectNode, options, value) {
    selectNode.innerHTML = options.map((option) => `<option value="${option}">${option}</option>`).join("");
    selectNode.value = value;
  }

  function chipButton(filterType, label, count, active) {
    return `<button class="cc-filter-chip${active ? " active" : ""}" type="button" data-filter-type="${filterType}" data-filter-value="${label}">${label} <strong>${count}</strong></button>`;
  }

  function matchesFilters(mall) {
    if (state.search) {
      const haystack = `${mall.mall_name} ${mall.region} ${mall.owner} ${mall.next_action} ${mall.blocker}`.toLowerCase();
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

  function derivedPriority(mall) {
    if (["At Risk", "Blocked"].includes(mall.overall_status)) {
      return "P0";
    }
    if (mall.priority === "High" || mall.overall_status === "Waiting") {
      return "P1";
    }
    return "P2";
  }

  function derivedImpact(mall) {
    const stage = displayStage(mall);
    if (stage === "Submitting") {
      return "Impacts submission readiness, formal handover and external delivery dates.";
    }
    if (stage === "BMS Interface") {
      return "Impacts Cloud BMS interface closure, event mapping and live operations handover.";
    }
    if (stage === "Site Survey") {
      return "Impacts survey freeze, point confirmation and installation mobilization.";
    }
    if (stage === "Not Started") {
      return "Impacts baseline freeze, procurement planning and site activation path.";
    }
    return "Impacts installation, testing and close-out sequence.";
  }

  function derivedCeoAction(mall) {
    const blocker = String(mall.blocker || "").toLowerCase();
    const action = String(mall.next_action || "").toLowerCase();
    if (blocker.includes("ptw") || blocker.includes("approval")) {
      return "Escalate approval path with Univers / HDB today.";
    }
    if (blocker.includes("survey") || action.includes("survey")) {
      return "Assign same-day owner to freeze survey evidence and sign-off.";
    }
    if (displayStage(mall) === "BMS Interface") {
      return "Confirm Cloud BMS owner and close event-mapping decisions.";
    }
    if (action.includes("footfall")) {
      return "Freeze footfall scope before the next coordination review.";
    }
    if (action.includes("va")) {
      return "Assign technical confirmation to close the VA point list today.";
    }
    return "Review owner commitment and unblock delivery in today’s control call.";
  }

  function actionItems(items) {
    return items
      .filter(isActionNeeded)
      .sort((left, right) => {
        const priorityOrder = { P0: 0, P1: 1, P2: 2 };
        const leftPriority = priorityOrder[derivedPriority(left)];
        const rightPriority = priorityOrder[derivedPriority(right)];
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        const dueCompare = sortDateValue(left.target_date).localeCompare(sortDateValue(right.target_date));
        if (dueCompare !== 0) {
          return dueCompare;
        }
        return (numericValue(right.total_cctv_points) || 0) - (numericValue(left.total_cctv_points) || 0);
      })
      .slice(0, 5)
      .map((mall) => ({
        mall,
        priority: derivedPriority(mall),
        issue: textValue(mall.blocker, "Pending verification"),
        impact: derivedImpact(mall),
        ceoAction: derivedCeoAction(mall),
        due: shortDate(mall.target_date),
        status: mall.overall_status === "At Risk" ? "Escalated" : mall.overall_status === "Waiting" ? "Open" : "In Progress"
      }));
  }

  function buildMallSheetHtml(mall) {
    const documentRows = [
      ["MOS", "Pending Verification"],
      ["RA", "Pending Verification"],
      ["WAH", "Pending Verification"],
      ["Worker List", "Pending Verification"],
      ["PTW", hasKeyword(mall.blocker, ["ptw"]) ? "Pending" : "Pending Verification"]
    ];

    return [
      `<div class="cc-mall-sheet-header">`,
      `<div>`,
      `<div class="cc-mall-sheet-title">${mall.mall_name}</div>`,
      `<div class="cc-mall-sheet-subtitle">${mall.region} | ${displayStage(mall)} | ${mall.owner}</div>`,
      `</div>`,
      `<span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span>`,
      `</div>`,
      `<div class="cc-mall-sheet-grid">`,
      `<div><span>Status</span><strong>${mall.overall_status}</strong></div>`,
      `<div><span>Vendor Lead</span><strong>${textValue(mall.vendor_lead, "Pending Verification")}</strong></div>`,
      `<div><span>Delivery Lead</span><strong>${textValue(mall.delivery_lead, "Pending Verification")}</strong></div>`,
      `<div><span>Subcontractor</span><strong>${textValue(mall.subcontractor, "TBD")}</strong></div>`,
      `<div><span>Stage</span><strong>${displayStage(mall)}</strong></div>`,
      `<div><span>Next Milestone</span><strong>${textValue(shortDate(mall.target_date), "TBC")}</strong></div>`,
      `<div><span>CCTV Total</span><strong>${formatNumber(mall.total_cctv_points)}</strong></div>`,
      `<div><span>Replace</span><strong>${textValue(mall.replacement_only_points, "TBC")}</strong></div>`,
      `<div><span>Migration</span><strong>${textValue(mall.relocation_points, "TBC")}</strong></div>`,
      `<div><span>New Install</span><strong>${textValue(mall.new_installation_points, "TBC")}</strong></div>`,
      `<div><span>VA Function</span><strong>${formatNumber(mall.va_function_points)}</strong></div>`,
      `<div><span>Footfall</span><strong>${textValue(mall.footfall_points, "Pending")}</strong></div>`,
      `<div><span>Drawing Count</span><strong>${textValue(mall.as_per_drawing_points, "TBC")}</strong></div>`,
      `<div><span>MA Additional Request</span><strong>${textValue(mall.ma_requested_addition_points, "TBC")}</strong></div>`,
      `</div>`,
      `<div class="cc-mall-sheet-note"><span>Current Blocker</span><strong>${textValue(mall.blocker, "Pending verification")}</strong></div>`,
      `<div class="cc-mall-sheet-note"><span>Required Action</span><strong>${textValue(mall.next_action, "Pending verification")}</strong></div>`,
      `<div class="cc-mall-sheet-note"><span>Documents</span>`,
      `<div class="cc-mall-sheet-docs">`,
      documentRows.map(([label, value]) => `<div class="cc-mall-sheet-doc"><span>${label}</span><strong>${value}</strong></div>`).join(""),
      `</div>`,
      `</div>`,
      `<a class="cc-primary-cta cc-primary-cta-inline" href="${mall.linked_page}">Open linked page</a>`
    ].join("");
  }

  function openMallSheet(mall) {
    if (!mallSheet || !mallSheetBackdrop || !mallSheetContent) {
      return;
    }
    mallSheetContent.innerHTML = buildMallSheetHtml(mall);
    mallSheet.hidden = false;
    mallSheetBackdrop.hidden = false;
    document.body.classList.add("cc-sheet-open");
  }

  function closeMallSheet() {
    if (!mallSheet || !mallSheetBackdrop) {
      return;
    }
    mallSheet.hidden = true;
    mallSheetBackdrop.hidden = true;
    document.body.classList.remove("cc-sheet-open");
  }

  function bindSheetControls() {
    if (mallSheetClose) {
      mallSheetClose.addEventListener("click", closeMallSheet);
    }
    if (mallSheetBackdrop) {
      mallSheetBackdrop.addEventListener("click", closeMallSheet);
    }
  }

  function renderHeroChips() {
    const riskCount = countWhere(malls, (mall) => ["At Risk", "Blocked"].includes(mall.overall_status));
    const completedCount = countWhere(malls, isCompletedMall);
    const chips = [
      { value: "At Risk", label: formatNumber(riskCount), tone: "cc-command-chip-risk" },
      { value: formatNumber(malls.length), label: "Malls", tone: "cc-command-chip-neutral" },
      { value: formatNumber(sumKnown(malls, "total_cctv_points")), label: "CCTV", tone: "cc-command-chip-neutral" },
      { value: formatNumber(sumKnown(malls, "va_function_points")), label: "VA", tone: "cc-command-chip-neutral" },
      { value: "Footfall Pending", label: "Split", tone: "cc-command-chip-warn" },
      { value: formatNumber(completedCount), label: "Completed", tone: "cc-command-chip-success" }
    ];

    heroChipbar.innerHTML = chips
      .map((item) => `<span class="cc-command-chip ${item.tone}"><strong>${item.value}</strong><span>${item.label}</span></span>`)
      .join("");
  }

  function renderDesktopKpis() {
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

    kpiGrid.innerHTML = metrics.map((item) => [
      `<a class="cc-kpi-card cc-kpi-card-${item.tone}" href="${item.href}">`,
      `<div class="cc-kpi-label">${item.label}</div>`,
      `<div class="cc-kpi-value">${item.value}</div>`,
      `<div class="cc-kpi-note">${item.note}</div>`,
      `</a>`
    ].join("")).join("");
  }

  function renderMobileKpiSummary() {
    const metrics = [
      { value: formatNumber(malls.length), label: "Malls" },
      { value: formatNumber(sumKnown(malls, "total_cctv_points")), label: "CCTV" },
      { value: formatNumber(sumKnown(malls, "va_function_points")), label: "VA" },
      { value: "Pending", label: "Footfall" },
      { value: formatNumber(countWhere(malls, isCompletedMall)), label: "Completed" },
      { value: formatNumber(countWhere(malls, (mall) => ["At Risk", "Blocked"].includes(mall.overall_status))), label: "At Risk" }
    ];

    kpiSummaryMobile.innerHTML = metrics
      .map((item) => `<div class="cc-compact-kpi"><strong>${item.value}</strong><span>${item.label}</span></div>`)
      .join("");
  }

  function renderChips() {
    const stageCount = (label) => (label === "All" ? malls.length : countWhere(malls, (mall) => currentStageFilter(mall) === label));
    const regionCount = (label) => (label === "All" ? malls.length : countWhere(malls, (mall) => mall.region === label));
    const ownerCount = (label) => (label === "All" ? malls.length : countWhere(malls, (mall) => mall.owner_group === label));

    stageChipRow.innerHTML = STAGE_FILTERS
      .map((label) => chipButton("stage", label, stageCount(label), state.stage === label))
      .join("");

    const usingOwnerRow = isMobileViewport();
    if (secondaryFilterTitle) {
      secondaryFilterTitle.textContent = usingOwnerRow ? "Owner Filter" : "Region Filter";
    }
    const secondaryOptions = usingOwnerRow ? OWNER_FILTERS : REGION_FILTERS;
    regionChipRow.innerHTML = secondaryOptions
      .map((label) => chipButton(usingOwnerRow ? "owner" : "region", label, usingOwnerRow ? ownerCount(label) : regionCount(label), usingOwnerRow ? state.owner === label : state.region === label))
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
        if (button.dataset.filterType === "owner") {
          state.owner = button.dataset.filterValue;
          ownerSelect.value = state.owner;
        } else {
          state.region = button.dataset.filterValue;
          regionSelect.value = state.region;
        }
        refresh();
      });
    });
  }

  function markerSizeClass(points) {
    if (!Number.isFinite(points)) {
      return "size-small";
    }
    if (points > 150) {
      return "size-large";
    }
    if (points >= 50) {
      return "size-medium";
    }
    return "size-small";
  }

  function markerShapeClass(mall) {
    const blocker = String(mall.blocker || "").toLowerCase();
    if (blocker.includes("subcontractor") || blocker.includes("manpower") || blocker.includes("night work")) {
      return "shape-triangle";
    }
    if (blocker.includes("hdb") || blocker.includes("ma") || blocker.includes("approval")) {
      return "shape-diamond";
    }
    if (mall.owner_group === "Univers") {
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
      `<div><strong>Footfall</strong><span>${textValue(mall.footfall_points, "Pending")}</span></div>`,
      `<div><strong>Status</strong><span>${mall.overall_status}</span></div>`,
      `<div><strong>Owner</strong><span>${mall.owner}</span></div>`,
      `<div><strong>Due</strong><span>${shortDate(mall.target_date)}</span></div>`,
      `</div>`,
      `<div class="cc-map-popup-note"><strong>Next Action</strong><span>${textValue(mall.next_action, "Pending verification")}</span></div>`,
      `<a class="cc-map-popup-link" href="${mall.linked_page}">Open linked page</a>`
    ].join("");
  }

  function attachMallClickHandlers(root) {
    root.querySelectorAll("[data-mall-id]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!isMobileViewport()) {
          return;
        }
        const mall = malls.find((item) => item.mall_id === link.dataset.mallId);
        if (!mall) {
          return;
        }
        event.preventDefault();
        openMallSheet(mall);
      });
    });
  }

  function renderMapRoster(items) {
    const rosterItems = items.filter(isActionNeeded).slice(0, 6);
    if (!rosterItems.length) {
      mapRoster.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No roster item under current filter</div><p>Adjust the stage, region or owner chips to repopulate the priority marker roster.</p></div>';
      return;
    }

    mapRoster.innerHTML = rosterItems.map((mall) => [
      `<a class="cc-map-roster-row" href="${mall.linked_page}" data-mall-id="${mall.mall_id}">`,
      `<div class="cc-map-roster-main">`,
      `<span class="cc-map-marker ${stageMarkerClass(currentStageFilter(mall))} ${markerShapeClass(mall)} ${markerSizeClass(mall.total_cctv_points)}"></span>`,
      `<div>`,
      `<div class="cc-map-roster-title">${mall.mall_name}</div>`,
      `<div class="cc-map-roster-meta">${mall.region} / ${displayStage(mall)} / ${mall.owner_group}</div>`,
      `</div>`,
      `</div>`,
      `<span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span>`,
      `</a>`
    ].join("")).join("");

    attachMallClickHandlers(mapRoster);
  }

  function renderMap(items) {
    if (!map || !markerLayer) {
      return;
    }
    markerLayer.clearLayers();

    items.forEach((mall) => {
      const marker = L.marker([mall.latitude, mall.longitude], { icon: markerIcon(mall) });
      if (!isMobileViewport()) {
        marker.bindPopup(popupHtml(mall));
      }
      marker.on("click", () => {
        if (isMobileViewport()) {
          openMallSheet(mall);
        }
      });
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

  function renderActionNeed() {
    const actions = actionItems(filteredMalls().length ? filteredMalls() : malls);
    if (!actions.length) {
      alertStack.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No immediate action in current filter</div><p>When a mall moves into risk, waiting or high-priority follow-up, Action Need will surface it here.</p></div>';
      return;
    }

    alertStack.innerHTML = actions.map(({ mall, priority, issue, impact, ceoAction, due, status }) => {
      const tone = priority === "P0" ? "is-risk" : priority === "P1" ? "is-waiting" : "is-progress";
      return [
        `<a class="cc-alert-card ${tone}" href="${mall.linked_page}" data-mall-id="${mall.mall_id}">`,
        `<div class="cc-alert-head">`,
        `<div>`,
        `<div class="cc-alert-title">${priority} | ${mall.mall_name}</div>`,
        `<div class="cc-alert-body">${issue}</div>`,
        `</div>`,
        `<span class="cc-state ${stateClass(mall.overall_status)}">${status}</span>`,
        `</div>`,
        `<div class="cc-alert-grid">`,
        `<div class="cc-alert-item"><strong>Impact</strong><span>${impact}</span></div>`,
        `<div class="cc-alert-item"><strong>Owner</strong><span>${mall.owner}</span></div>`,
        `<div class="cc-alert-item"><strong>CEO Action</strong><span>${ceoAction}</span></div>`,
        `<div class="cc-alert-item"><strong>Due</strong><span>${due}</span></div>`,
        `</div>`,
        `</a>`
      ].join("");
    }).join("");

    attachMallClickHandlers(alertStack);
  }

  function renderCeoArrangements() {
    const actions = actionItems(malls);
    const todayItems = actions.slice(0, 4).map((item) => `${item.mall.mall_name}: ${item.ceoAction}`);
    const weekItems = [
      "Freeze mall tracker baseline and unresolved point splits.",
      "Review installation / cabling cost exposure and open VO risks.",
      "Confirm testing / submission format for all active malls.",
      "Review completed-mall closure criteria with PMO owners."
    ];
    const categories = [
      { title: "External Coordination", items: ["HDB / MA approval follow-up", "Univers PTW and site-access alignment", "Cloud BMS owner confirmation"] },
      { title: "Internal Decision", items: ["Freeze intrusion VA point list", "Approve manpower or subcontractor adjustment", "Confirm baseline tracker lock"] },
      { title: "Commercial / Contract", items: ["Review variation / add-on exposure", "Check procurement gaps for unresolved scope", "Confirm subcontractor scope split"] },
      { title: "Risk Escalation", items: ["PTW and access blockers", "Footfall split pending items", "Survey / sign-off delays on active malls"] }
    ];

    ceoArrangements.innerHTML = [
      '<div class="cc-ceo-grid">',
      `<article class="cc-ceo-card"><div class="cc-ceo-title">CEO Today</div><ol class="cc-ceo-list">${todayItems.map((item) => `<li>${item}</li>`).join("")}</ol></article>`,
      `<article class="cc-ceo-card"><div class="cc-ceo-title">CEO This Week</div><ol class="cc-ceo-list">${weekItems.map((item) => `<li>${item}</li>`).join("")}</ol></article>`,
      '</div>',
      '<div class="cc-ceo-grid">',
      categories.map((group) => `<article class="cc-ceo-card"><div class="cc-ceo-title">${group.title}</div><ul class="cc-ceo-list">${group.items.map((item) => `<li>${item}</li>`).join("")}</ul></article>`).join(""),
      '</div>'
    ].join("");
  }

  function pipelineStep(label, value) {
    return `<span class="cc-pipeline-step ${stateClass(value)}"><strong>${label}</strong><span>${stateSymbol(value)}</span></span>`;
  }

  function pipelineRowsForMall(mall) {
    const pointStatus = numericValue(mall.as_per_drawing_points) !== null ? "Done" : mall.site_survey_status;
    const ptwStatus = ["Submitting", "Installation", "Testing", "BMS Interface", "Completed"].includes(displayStage(mall)) ? "In Progress" : mall.submission_status;
    const vaStatus = numericValue(mall.va_function_points) ? mall.testing_status : "N/A";
    const footfallStatus = numericValue(mall.footfall_points) !== null ? mall.testing_status : "TBC";
    return [
      ["Survey", mall.site_survey_status],
      ["Point", pointStatus],
      ["PTW", ptwStatus],
      ["Install", mall.installation_status],
      ["Test", mall.testing_status],
      ["VA", vaStatus],
      ["Footfall", footfallStatus],
      ["BMS", mall.bms_interface_status],
      ["Submit", mall.submission_status],
      ["Done", isCompletedMall(mall) ? "Done" : "Not Started"]
    ];
  }

  function renderDeliveryPipeline() {
    const items = filteredMalls().filter((mall) => mall.priority === "High" || currentStageFilter(mall) !== "Not Started").slice(0, 6);
    if (!items.length) {
      deliveryPipeline.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No active pipeline row under current filter</div><p>Once a mall starts survey, installation, testing or BMS work, it will appear here.</p></div>';
      return;
    }

    deliveryPipeline.innerHTML = `<div class="cc-pipeline-list">${items.map((mall) => [
      `<article class="cc-pipeline-card">`,
      `<div class="cc-pipeline-title">${mall.mall_name}</div>`,
      `<div class="cc-pipeline-meta"><span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span><span>${displayStage(mall)}</span></div>`,
      `<div class="cc-pipeline-steps">${pipelineRowsForMall(mall).map(([label, value]) => pipelineStep(label, value)).join("")}</div>`,
      `<a class="cc-action-link" href="${mall.linked_page}" data-mall-id="${mall.mall_id}">Open mall detail</a>`,
      `</article>`
    ].join("")).join("")}</div>`;

    attachMallClickHandlers(deliveryPipeline);
  }

  function renderInstallationSummary() {
    const metrics = [
      ["Total CCTV Points", sumKnown(malls, "total_cctv_points"), "Baseline loaded from current mall register", "cc-mini-metric-accent"],
      ["Replacement Only", sumKnown(malls, "replacement_only_points"), "Pending split remains visible until point classification is frozen", "cc-mini-metric-warn"],
      ["Relocation", sumKnown(malls, "relocation_points"), "Relocation breakdown still pending", "cc-mini-metric-warn"],
      ["New Installation", sumKnown(malls, "new_installation_points"), "New-install split still unresolved", "cc-mini-metric-warn"],
      ["VA Function", sumKnown(malls, "va_function_points"), "VA function baseline already loaded", "cc-mini-metric-accent"],
      ["Footfall", sumKnown(malls, "footfall_points"), "Footfall split is still TBC in current export", "cc-mini-metric-warn"],
      ["As per Drawing", sumKnown(malls, "as_per_drawing_points"), "Drawing-vs-site split not frozen yet", "cc-mini-metric-warn"],
      ["MA Requested Addition", sumKnown(malls, "ma_requested_addition_points"), "Future VO sensitivity stays highlighted", "cc-mini-metric-risk"],
      ["TBC / Unconfirmed", sumKnown(malls, "tbc_points"), "Unknown points remain explicitly flagged", "cc-mini-metric-risk"]
    ];

    installationSummary.innerHTML = metrics.map(([label, value, note, tone]) => [
      `<a class="cc-mini-metric cc-mini-metric-linkable ${tone}" href="site-installation-tracker.html">`,
      `<div class="cc-mini-metric-label">${label}</div>`,
      `<div class="cc-mini-metric-value">${value === null ? "Pending Split" : formatNumber(value)}</div>`,
      `<div class="cc-mini-metric-note">${note}</div>`,
      `</a>`
    ].join("")).join("");
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

    stageBoardBody.innerHTML = items.map((mall) => [
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
    ].join("")).join("");
  }

  function renderVendorResponsibility() {
    const vendorGroups = [
      { name: "HDB / MA", matcher: (mall) => hasKeyword(mall.blocker, ["hdb", "ma", "approval", "sign-off"]), issue: "Approval / sign-off / site access" },
      { name: "Univers", matcher: (mall) => mall.owner_group === "Univers" || hasKeyword(mall.owner, ["univers"]), issue: "PTW / access / interface coordination" },
      { name: "CCTC", matcher: (mall) => mall.owner_group === "CCTC" || hasKeyword(mall.owner, ["cctc"]), issue: "Submission package / baseline freeze" },
      { name: "Xjera", matcher: (mall) => mall.owner_group === "Xjera" || hasKeyword(mall.owner, ["xjera"]), issue: "VA / footfall / survey readiness" },
      { name: "Subcontractor", matcher: (mall) => hasKeyword(mall.blocker, ["subcontractor", "manpower", "night work"]), issue: "Manpower / night work / site execution" },
      { name: "Cloud BMS", matcher: (mall) => currentStageFilter(mall) === "BMS Interface" || isBmsPending(mall), issue: "Event mapping / data owner confirmation" }
    ];

    vendorResponsibility.innerHTML = `<div class="cc-vendor-grid">${vendorGroups.map((group) => {
      const related = malls.filter(group.matcher);
      const atRisk = related.filter((mall) => ["At Risk", "Blocked"].includes(mall.overall_status)).length;
      const pending = related.filter((mall) => !isCompletedMall(mall)).length;
      return [
        `<article class="cc-vendor-card">`,
        `<div class="cc-vendor-title">${group.name}</div>`,
        `<div class="cc-vendor-meta">Responsible Malls: <strong>${formatNumber(related.length)}</strong></div>`,
        `<div class="cc-vendor-meta">At Risk: <strong>${formatNumber(atRisk)}</strong></div>`,
        `<div class="cc-vendor-meta">Pending Actions: <strong>${formatNumber(pending)}</strong></div>`,
        `<div class="cc-vendor-note">Main issues: ${group.issue}</div>`,
        `<div class="cc-vendor-meta">CEO Attention: <strong>${atRisk > 0 || pending > 0 ? "Yes" : "No"}</strong></div>`,
        `</article>`
      ].join("");
    }).join("")}</div>`;
  }

  function renderPriorityMalls() {
    const items = filteredMalls()
      .filter((mall) => isActionNeeded(mall) || currentStageFilter(mall) !== "Not Started")
      .sort((left, right) => {
        const riskDiff = (["At Risk", "Blocked"].includes(right.overall_status) ? 1 : 0) - (["At Risk", "Blocked"].includes(left.overall_status) ? 1 : 0);
        if (riskDiff !== 0) {
          return riskDiff;
        }
        const dueCompare = sortDateValue(left.target_date).localeCompare(sortDateValue(right.target_date));
        if (dueCompare !== 0) {
          return dueCompare;
        }
        return (numericValue(right.total_cctv_points) || 0) - (numericValue(left.total_cctv_points) || 0);
      })
      .slice(0, 8);

    if (!items.length) {
      priorityMalls.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No active priority mall under current filter</div><p>Priority malls appear here when high attention, waiting or at-risk conditions are present.</p></div>';
      return;
    }

    priorityMalls.innerHTML = items.map((mall) => [
      `<a class="cc-mall-card" href="${mall.linked_page}" data-mall-id="${mall.mall_id}">`,
      `<div class="cc-mall-card-head">`,
      `<div class="cc-mall-card-title">${mall.mall_name}</div>`,
      `<span class="cc-state ${stateClass(mall.overall_status)}">${mall.overall_status}</span>`,
      `</div>`,
      `<div class="cc-mall-card-meta">Stage: <strong>${displayStage(mall)}</strong></div>`,
      `<div class="cc-mall-card-metrics">CCTV: <strong>${formatNumber(mall.total_cctv_points)}</strong> | VA: <strong>${formatNumber(mall.va_function_points)}</strong> | Footfall: <strong>${textValue(mall.footfall_points, "Pending")}</strong></div>`,
      `<div class="cc-mall-card-meta">Owner: <strong>${mall.owner}</strong></div>`,
      `<div class="cc-mall-card-note">${textValue(mall.next_action, "Pending verification")}</div>`,
      `<div class="cc-mall-card-meta">Due: <strong>${shortDate(mall.target_date)}</strong></div>`,
      `</a>`
    ].join("")).join("");

    attachMallClickHandlers(priorityMalls);
  }

  function renderCompleted() {
    const items = malls.filter(isCompletedMall);
    if (!items.length) {
      completedMalls.innerHTML = [
        '<details class="cc-disclosure" open>',
        '<summary>Completed / Closed (0)</summary>',
        '<p>No mall is formally closed across installation, testing, submission, BMS and cost at this export.</p>',
        '</details>'
      ].join("");
      return;
    }

    completedMalls.innerHTML = [
      `<details class="cc-disclosure"><summary>Completed / Closed (${items.length})</summary>`,
      '<div class="table-responsive"><table class="cc-table">',
      '<thead><tr><th>Mall</th><th>Completed Date</th><th>CCTV Installed</th><th>VA Enabled</th><th>Footfall Enabled</th><th>Testing</th><th>Submission</th><th>Cloud BMS</th></tr></thead><tbody>',
      items.map((mall) => [
        '<tr>',
        `<td>${mall.mall_name}</td>`,
        `<td>${textValue(mall.completed_date, "TBC")}</td>`,
        `<td>${formatNumber(mall.total_cctv_points)}</td>`,
        `<td>${formatNumber(mall.va_function_points)}</td>`,
        `<td>${textValue(mall.footfall_points, "TBC")}</td>`,
        `<td>${textValue(mall.testing_status, "TBC")}</td>`,
        `<td>${textValue(mall.submission_status, "TBC")}</td>`,
        `<td>${textValue(mall.bms_interface_status, "TBC")}</td>`,
        '</tr>'
      ].join("")).join(""),
      '</tbody></table></div>',
      '</details>'
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
    const items = filteredMalls().filter((mall) => mall.blocker && mall.blocker !== "None formally logged in public export").slice(0, 8);
    if (!items.length) {
      blockersPanel.innerHTML = '<div class="cc-empty-state"><div class="cc-empty-title">No named blocker under current filter</div><p>Escalated blockers will appear here once logged in the current export.</p></div>';
      return;
    }

    blockersPanel.innerHTML = [
      '<div class="table-responsive"><table class="cc-table">',
      '<thead><tr><th>Blocker</th><th>Affected Mall</th><th>Impact Type</th><th>Impact</th><th>Owner</th><th>Next Control Step</th><th>Due Date</th><th>Status</th></tr></thead><tbody>',
      items.map((mall) => [
        '<tr>',
        `<td class="cc-wrap-cell">${mall.blocker}</td>`,
        `<td>${mall.mall_name}</td>`,
        `<td>${blockerImpactType(mall)}</td>`,
        `<td>${displayStage(mall)} / ${mall.overall_status}</td>`,
        `<td>${mall.owner}</td>`,
        `<td class="cc-wrap-cell">${mall.next_action}</td>`,
        `<td>${shortDate(mall.target_date)}</td>`,
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

    bmsSnapshot.innerHTML = cards.map(([label, value, note, tone]) => [
      `<a class="cc-mini-metric cc-mini-metric-linkable ${tone}" href="bms-interface.html">`,
      `<div class="cc-mini-metric-label">${label}</div>`,
      `<div class="cc-mini-metric-value">${value}</div>`,
      `<div class="cc-mini-metric-note">${note}</div>`,
      `</a>`
    ].join("")).join("");

    bmsEvents.innerHTML = [
      '<div class="cc-sublist-title">Supported BMS event payloads</div>',
      `<div class="cc-badge-list">${BMS_EVENT_TYPES.map((type) => `<span class="cc-state is-progress">${type}</span>`).join("")}</div>`
    ].join("");
  }

  function renderCostSnapshot() {
    const cards = [
      ["Replacement Only Points", sumKnown(malls, "replacement_only_points"), "Awaiting detailed point split", "cc-mini-metric-warn"],
      ["Relocation Points", sumKnown(malls, "relocation_points"), "Relocation count not frozen yet", "cc-mini-metric-warn"],
      ["New Installation Points", sumKnown(malls, "new_installation_points"), "New installation remains commercially sensitive", "cc-mini-metric-risk"],
      ["MA Requested Addition Points", sumKnown(malls, "ma_requested_addition_points"), "MA add-ons feed VO exposure", "cc-mini-metric-risk"],
      ["Unconfirmed / TBC Points", sumKnown(malls, "tbc_points"), "Unknown scope stays visible", "cc-mini-metric-risk"],
      ["Estimated VO Exposure", countWhere(malls, (mall) => mall.priority === "High" || isCostExposure(mall)), "High-attention malls need commercial freeze", "cc-mini-metric-risk"],
      ["Procurement Pending Items", countWhere(malls, (mall) => currentStageFilter(mall) !== "Completed"), "Pending mall split affects procurement planning", "cc-mini-metric-warn"],
      ["Subcontractor Pending Items", countWhere(malls, (mall) => !isDoneStatus(mall.installation_status)), "Installation closure not complete across most malls", "cc-mini-metric-warn"]
    ];

    costSnapshot.innerHTML = cards.map(([label, value, note, tone]) => [
      `<a class="cc-mini-metric cc-mini-metric-linkable ${tone}" href="cost-management.html">`,
      `<div class="cc-mini-metric-label">${label}</div>`,
      `<div class="cc-mini-metric-value">${value === null ? "Pending Split" : formatNumber(value)}</div>`,
      `<div class="cc-mini-metric-note">${note}</div>`,
      `</a>`
    ].join("")).join("");
  }

  function renderDataQualityLog() {
    const rows = [
      ["PDF Baseline", "Loaded"],
      ["Site Survey", "Partially Updated"],
      ["Mall Tracker", "Not Frozen"],
      ["Footfall Split", "Pending"],
      ["VA Function List", "Pending Confirmation"],
      ["Last Updated By", "CCTC / Xjera"],
      ["Last Updated", "04 May 2026"]
    ];
    dataQualityLog.innerHTML = `<div class="cc-data-grid">${rows.map(([label, value]) => `<div class="cc-data-row"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
  }

  function refreshContext(items) {
    const filters = [];
    if (state.stage !== "All") filters.push(`stage: ${state.stage}`);
    if (state.region !== "All") filters.push(`region: ${state.region}`);
    if (state.status !== "All") filters.push(`status: ${state.status}`);
    if (state.priority !== "All") filters.push(`priority: ${state.priority}`);
    if (state.owner !== "All") filters.push(`owner: ${state.owner}`);
    if (state.search) filters.push(`search: "${state.search}"`);
    filterContext.textContent = filters.length ? `Filter active: ${filters.join(" / ")} (${items.length} of ${malls.length} malls)` : "Showing all malls";
  }

  function refresh() {
    const items = filteredMalls();
    renderChips();
    renderMap(items);
    renderActionNeed();
    renderDeliveryPipeline();
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

    window.addEventListener("resize", () => {
      renderChips();
      if (!isMobileViewport()) {
        closeMallSheet();
      }
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
    markerLayer = config.enableClustering && typeof L.markerClusterGroup === "function" ? L.markerClusterGroup() : L.layerGroup();
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
      bindSheetControls();
      wireControls();
      renderHeroChips();
      renderDesktopKpis();
      renderMobileKpiSummary();
      renderCeoArrangements();
      renderInstallationSummary();
      renderVendorResponsibility();
      renderCompleted();
      renderBmsSnapshot();
      renderCostSnapshot();
      renderDataQualityLog();
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
