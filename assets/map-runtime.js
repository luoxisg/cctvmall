(function () {
  const root = document.body;
  const mapNode = document.getElementById("mall-live-map");
  if (!root || !mapNode || typeof L === "undefined") {
    return;
  }
  if (window.getComputedStyle(mapNode).display === "none") {
    return;
  }

  const config = window.CC_MAP_CONFIG || {};
  const fallbackNode = document.querySelector(".cc-map-fallback");
  const tableRows = Array.from(document.querySelectorAll(".cc-stage-board tbody tr"));
  const rosterRows = Array.from(document.querySelectorAll(".cc-map-roster-row"));
  const mallCards = Array.from(document.querySelectorAll(".cc-mall-card[data-mall-name]"));
  const contextNode = document.querySelector(".cc-filter-context");
  const stageChips = Array.from(document.querySelectorAll(".cc-filter-chip[data-filter-type='stage']"));
  const ownerChips = Array.from(document.querySelectorAll(".cc-filter-chip[data-filter-type='owner']"));
  const sheetNode = document.querySelector(".cc-mall-sheet");
  const sheetContent = sheetNode ? sheetNode.querySelector(".cc-mall-sheet-content") : null;
  const sheetClose = sheetNode ? sheetNode.querySelector(".cc-mall-sheet-close") : null;
  const sheetBackdrop = document.querySelector(".cc-mall-sheet-backdrop");
  let activeStage = "All";
  let activeOwner = "All";
  let features = [];
  let map = null;
  let markerLayer = null;

  function isMobileViewport() {
    return window.innerWidth <= 768;
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

  function documentStatusBlock() {
    return [
      '<div class="cc-mall-sheet-docs">',
      '<div class="cc-mall-sheet-doc"><span>MOS</span><strong>Pending Verification</strong></div>',
      '<div class="cc-mall-sheet-doc"><span>RA</span><strong>Pending Verification</strong></div>',
      '<div class="cc-mall-sheet-doc"><span>WAH</span><strong>Pending Verification</strong></div>',
      '<div class="cc-mall-sheet-doc"><span>Worker List</span><strong>Pending Verification</strong></div>',
      '<div class="cc-mall-sheet-doc"><span>PTW</span><strong>Pending Verification</strong></div>',
      '</div>'
    ].join("");
  }

  function buildPopupHtml(props) {
    const lines = [
      `<div class="cc-map-popup-title">${props.mall_name}</div>`,
      `<div class="cc-map-popup-meta">${props.region} | ${props.current_stage} | ${props.owner_group}</div>`,
      `<div class="cc-map-popup-grid">`,
      `<div><strong>Total CCTV</strong><span>${props.total_cctv_points}</span></div>`,
      `<div><strong>VA Function</strong><span>${props.va_function_points}</span></div>`,
      `<div><strong>Footfall</strong><span>${props.footfall_points || "Pending Split"}</span></div>`,
      `<div><strong>Status</strong><span>${props.overall_status}</span></div>`,
      `<div><strong>Owner</strong><span>${props.delivery_lead}</span></div>`,
      `<div><strong>Coordinate</strong><span>${props.coordinate_verified ? "Verified" : "Unverified"}</span></div>`,
      `</div>`,
      `<div class="cc-map-popup-note"><strong>Next Action</strong><span>${props.next_action}</span></div>`,
      `<a class="cc-map-popup-link" href="${props.linked_page}">Open linked page</a>`
    ];
    return lines.join("");
  }

  function buildSheetHtml(props) {
    return [
      `<div class="cc-mall-sheet-header">`,
      `<div>`,
      `<div class="cc-mall-sheet-title">${props.mall_name}</div>`,
      `<div class="cc-mall-sheet-subtitle">${props.region} | ${props.current_stage} | ${props.owner_group}</div>`,
      `</div>`,
      `<span class="cc-state ${props.map_marker_class}">${props.overall_status}</span>`,
      `</div>`,
      `<div class="cc-mall-sheet-grid">`,
      `<div><span>Status</span><strong>${props.overall_status}</strong></div>`,
      `<div><span>Vendor Lead</span><strong>${props.vendor_lead}</strong></div>`,
      `<div><span>Delivery Lead</span><strong>${props.delivery_lead}</strong></div>`,
      `<div><span>Subcontractor</span><strong>${props.subcontractor}</strong></div>`,
      `<div><span>Total CCTV</span><strong>${props.total_cctv_points}</strong></div>`,
      `<div><span>Replace</span><strong>${props.replacement_only_points || "Pending Split"}</strong></div>`,
      `<div><span>Migration</span><strong>${props.relocation_points || "Pending Split"}</strong></div>`,
      `<div><span>New Install</span><strong>${props.new_installation_points || "Pending Split"}</strong></div>`,
      `<div><span>VA Function</span><strong>${props.va_function_points}</strong></div>`,
      `<div><span>Footfall</span><strong>${props.footfall_points || "Pending Split"}</strong></div>`,
      `<div><span>Drawing Count</span><strong>${props.as_per_drawing_points || "Pending Split"}</strong></div>`,
      `<div><span>MA Add-on</span><strong>${props.ma_requested_addition_points || "Pending Split"}</strong></div>`,
      `<div><span>Next Milestone</span><strong>${props.target_date || "TBC"}</strong></div>`,
      `<div><span>Coordinate</span><strong>${props.coordinate_verified ? "Verified" : "Unverified"}</strong></div>`,
      `</div>`,
      `<div class="cc-mall-sheet-note"><span>Current Blocker</span><strong>${props.blocker || "Pending Verification"}</strong></div>`,
      `<div class="cc-mall-sheet-note"><span>Required Action</span><strong>${props.next_action}</strong></div>`,
      `<div class="cc-mall-sheet-note"><span>Documents</span>${documentStatusBlock()}</div>`,
      `<a class="cc-primary-cta cc-primary-cta-inline" href="${props.linked_page}">Open linked page</a>`
    ].join("");
  }

  function closeMallSheet() {
    if (!sheetNode || !sheetBackdrop) {
      return;
    }
    sheetNode.hidden = true;
    sheetBackdrop.hidden = true;
    sheetNode.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-open");
    root.classList.remove("cc-sheet-open");
  }

  function openMallSheet(props) {
    if (!sheetNode || !sheetContent || !sheetBackdrop) {
      return;
    }
    sheetContent.innerHTML = buildSheetHtml(props);
    sheetNode.hidden = false;
    sheetBackdrop.hidden = false;
    sheetNode.classList.add("is-open");
    sheetBackdrop.classList.add("is-open");
    root.classList.add("cc-sheet-open");
  }

  function markerIcon(props) {
    const verifiedClass = props.coordinate_verified ? "" : " is-unverified";
    const markerSize =
      props.marker_size_class === "size-large" ? 24 :
      props.marker_size_class === "size-small" ? 14 :
      18;
    return L.divIcon({
      className: "cc-map-div-icon",
      html: `<span class="cc-map-marker ${props.map_marker_class} ${props.marker_shape_class} ${props.marker_size_class}${verifiedClass}"></span>`,
      iconSize: [markerSize, markerSize],
      iconAnchor: [Math.round(markerSize / 2), Math.round(markerSize / 2)],
      popupAnchor: [0, -8]
    });
  }

  function filterFeature(feature) {
    const props = feature.properties || {};
    const matchesStage = activeStage === "All" || props.map_filter_group === activeStage;
    const matchesOwner = activeOwner === "All" || props.owner_group === activeOwner;
    return matchesStage && matchesOwner;
  }

  function updateContext(activeCount) {
    if (!contextNode) {
      return;
    }
    if (activeStage === "All" && activeOwner === "All") {
      contextNode.textContent = "Showing all malls";
      return;
    }
    contextNode.textContent = `Filter active: ${activeStage} / ${activeOwner} (${activeCount} mall${activeCount === 1 ? "" : "s"})`;
  }

  function applyTableFilter() {
    const active = [];
    tableRows.forEach((row) => {
      const stage = row.dataset.filterGroup || "Not Started";
      const owner = row.dataset.ownerGroup || "PMO";
      const visible = (activeStage === "All" || stage === activeStage) && (activeOwner === "All" || owner === activeOwner);
      row.hidden = !visible;
      if (visible) {
        active.push(row.dataset.mallName || "");
      }
    });
    updateContext(active.length || features.filter(filterFeature).length);
  }

  function primeTableRows() {
    tableRows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      const mallCell = cells[0];
      const ownerCell = cells[21];
      const stageCell = cells[11];
      const statusCell = cells[19];
      if (!mallCell || !stageCell) {
        return;
      }
      const mallName = mallCell.textContent.trim();
      row.dataset.mallName = mallName;
      row.dataset.ownerGroup = ownerCell ? ownerCell.textContent.trim().includes("Univers") ? "Univers" :
        ownerCell.textContent.trim().includes("CCTC") ? "CCTC" :
        ownerCell.textContent.trim().includes("Xjera") ? "Xjera" :
        ownerCell.textContent.trim().includes("HDB") || ownerCell.textContent.trim().includes("MA") ? "HDB / MA" :
        "PMO" : "PMO";
      row.dataset.filterGroup = statusCell && /At Risk|Blocked/.test(statusCell.textContent) ? "At Risk" :
        stageCell.textContent.trim().includes("BMS") ? "Cloud BMS" :
        stageCell.textContent.trim().includes("Test") || stageCell.textContent.trim().includes("Submit") ? "Testing" :
        stageCell.textContent.trim().includes("Install") ? "Installing" :
        stageCell.textContent.trim().includes("Survey") ? "Action Needed" :
        "Not Started";
    });
  }

  function applyMarkerFilter() {
    if (!map || !markerLayer) {
      return;
    }
    const activeFeatures = features.filter(filterFeature);
    markerLayer.clearLayers();
    activeFeatures.forEach((feature) => {
      const props = feature.properties || {};
      const marker = L.marker(
        [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
        { icon: markerIcon(props) }
      ).bindPopup(buildPopupHtml(props));
      marker.on("click", () => {
        if (isMobileViewport()) {
          openMallSheet(props);
        }
      });
      markerLayer.addLayer(marker);
    });
    updateContext(activeFeatures.length);
  }

  function setActiveChip(chips, value) {
    chips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.filterValue === value);
    });
  }

  function wireChipHandlers() {
    stageChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        activeStage = chip.dataset.filterValue || "All";
        setActiveChip(stageChips, activeStage);
        applyMarkerFilter();
        applyTableFilter();
      });
    });
    ownerChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        activeOwner = chip.dataset.filterValue || "All";
        setActiveChip(ownerChips, activeOwner);
        applyMarkerFilter();
        applyTableFilter();
      });
    });
  }

  function findMallProps(mallName) {
    const feature = features.find((item) => item.properties && item.properties.mall_name === mallName);
    return feature ? feature.properties : null;
  }

  function wireSheetTriggers() {
    rosterRows.forEach((row) => {
      row.addEventListener("click", (event) => {
        if (!isMobileViewport()) {
          return;
        }
        const props = findMallProps(row.dataset.mallName);
        if (!props) {
          return;
        }
        event.preventDefault();
        openMallSheet(props);
      });
    });

    mallCards.forEach((card) => {
      card.addEventListener("click", (event) => {
        if (!isMobileViewport()) {
          return;
        }
        const props = findMallProps(card.dataset.mallName);
        if (!props) {
          return;
        }
        event.preventDefault();
        openMallSheet(props);
      });
    });

    if (sheetClose) {
      sheetClose.addEventListener("click", closeMallSheet);
    }
    if (sheetBackdrop) {
      sheetBackdrop.addEventListener("click", closeMallSheet);
    }
    window.addEventListener("resize", () => {
      if (!isMobileViewport()) {
        closeMallSheet();
      }
    });
  }

  async function loadGeoJson() {
    const response = await fetch(config.geojsonPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${config.geojsonPath}`);
    }
    return response.json();
  }

  async function initMap() {
    const geojson = await loadGeoJson();
    features = (geojson.features || []).filter(
      (feature) =>
        feature &&
        feature.geometry &&
        feature.geometry.type === "Point" &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length === 2 &&
        Number.isFinite(feature.geometry.coordinates[0]) &&
        Number.isFinite(feature.geometry.coordinates[1])
    );

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
    applyMarkerFilter();
    applyTableFilter();
    wireSheetTriggers();

    if (features.length) {
      const bounds = L.latLngBounds(
        features.map((feature) => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]])
      );
      map.fitBounds(bounds.pad(0.08));
    }
  }

  primeTableRows();
  wireChipHandlers();
  initMap().catch((error) => {
    console.warn("Live map failed, showing fallback.", error);
    showFallback("Static fallback shown because live map API is unavailable.");
  });
})();
