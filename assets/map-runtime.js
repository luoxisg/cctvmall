(function () {
  const root = document.body;
  const mapNode = document.getElementById("mall-live-map");
  if (!root || !mapNode || typeof L === "undefined") {
    return;
  }

  const config = window.CC_MAP_CONFIG || {};
  const fallbackNode = document.querySelector(".cc-map-fallback");
  const tableRows = Array.from(document.querySelectorAll(".cc-stage-board tbody tr"));
  const contextNode = document.querySelector(".cc-filter-context");
  const stageChips = Array.from(document.querySelectorAll(".cc-filter-chip[data-filter-type='stage']"));
  const regionChips = Array.from(document.querySelectorAll(".cc-filter-chip[data-filter-type='region']"));
  let activeStage = "All";
  let activeRegion = "All";
  let features = [];
  let map = null;
  let markerLayer = null;

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

  function buildPopupHtml(props) {
    const lines = [
      `<div class="cc-map-popup-title">${props.mall_name}</div>`,
      `<div class="cc-map-popup-meta">${props.region} | ${props.current_stage}</div>`,
      `<div class="cc-map-popup-grid">`,
      `<div><strong>Total CCTV</strong><span>${props.total_cctv_points}</span></div>`,
      `<div><strong>VA Function</strong><span>${props.va_function_points}</span></div>`,
      `<div><strong>Footfall</strong><span>${props.footfall_points || "TBC"}</span></div>`,
      `<div><strong>Replacement Only</strong><span>${props.replacement_only_points || "TBC"}</span></div>`,
      `<div><strong>Relocation</strong><span>${props.relocation_points || "TBC"}</span></div>`,
      `<div><strong>New Installation</strong><span>${props.new_installation_points || "TBC"}</span></div>`,
      `<div><strong>As per Drawing</strong><span>${props.as_per_drawing_points || "TBC"}</span></div>`,
      `<div><strong>MA Requested Addition</strong><span>${props.ma_requested_addition_points || "TBC"}</span></div>`,
      `<div><strong>BMS Interface</strong><span>${props.bms_interface_status}</span></div>`,
      `<div><strong>Status</strong><span>${props.overall_status}</span></div>`,
      `<div><strong>Owner</strong><span>${props.owner}</span></div>`,
      `<div><strong>Coordinate</strong><span>${props.coordinate_verified ? "Verified" : "Unverified"}</span></div>`,
      `</div>`,
      `<div class="cc-map-popup-note"><strong>Next Action</strong><span>${props.next_action}</span></div>`,
      `<a class="cc-map-popup-link" href="${props.linked_page}">Open linked page</a>`
    ];
    return lines.join("");
  }

  function markerIcon(stageClass, verified) {
    const extraClass = verified ? "" : " is-unverified";
    return L.divIcon({
      className: "cc-map-div-icon",
      html: `<span class="cc-map-marker ${stageClass}${extraClass}"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -8]
    });
  }

  function applyTableFilter() {
    const active = [];
    tableRows.forEach((row) => {
      const stage = row.dataset.stageBucket || "Not Started";
      const region = row.dataset.region || "Unknown";
      const matchesStage = activeStage === "All" || stage === activeStage;
      const matchesRegion = activeRegion === "All" || region === activeRegion;
      const visible = matchesStage && matchesRegion;
      row.hidden = !visible;
      if (visible) {
        active.push(row.dataset.mallName || "");
      }
    });
    if (contextNode) {
      contextNode.textContent =
        activeStage === "All" && activeRegion === "All"
          ? "Showing all malls"
          : `Filter active: ${activeStage} / ${activeRegion} (${active.length} mall${active.length === 1 ? "" : "s"})`;
    }
  }

  function primeTableRows() {
    tableRows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      const mallCell = cells[0];
      const regionCell = cells[1];
      const stageCell = cells[11];
      if (!mallCell || !regionCell || !stageCell) {
        return;
      }
      row.dataset.mallName = mallCell.textContent.trim();
      row.dataset.region = regionCell.textContent.trim();
      row.dataset.stageBucket = stageCell.textContent.trim();
    });
  }

  function applyMarkerFilter() {
    if (!map || !markerLayer) {
      return;
    }
    markerLayer.clearLayers();
    features
      .filter((feature) => {
        const props = feature.properties || {};
        const matchesStage = activeStage === "All" || props.stage_bucket === activeStage;
        const matchesRegion = activeRegion === "All" || props.region === activeRegion;
        return matchesStage && matchesRegion;
      })
      .forEach((feature) => {
        const props = feature.properties || {};
        const marker = L.marker(
          [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
          { icon: markerIcon(props.map_marker_class, Boolean(props.coordinate_verified)) }
        ).bindPopup(buildPopupHtml(props));
        markerLayer.addLayer(marker);
      });
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
    regionChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        activeRegion = chip.dataset.filterValue || "All";
        setActiveChip(regionChips, activeRegion);
        applyMarkerFilter();
        applyTableFilter();
      });
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
