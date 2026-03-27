/**
 * file: js/cosmic-weave.js
 *
 * What this version does:
 * - Lenses (Creation/Navigation/etc) now surface REAL connections from docs/cultures.json links
 *   - Lens highlight arcs are drawn globally (not only selected culture)
 *   - Guide panel shows featured connections (prioritizes ones involving selected culture)
 * - Layers draw colored thread overlays FROM the selected culture to relevant peers (Food/Water/etc)
 * - "Corridor Studio" removed; replaced with "Weave Paths"
 *   - Weave Paths are built from real links matching the current lens
 *   - Leg-by-leg explanations shown in the panel
 * - Clean toggling: turning layers off clears paths immediately (no stuck lines)
 * - Deselect: click background / press Esc / click selected node again
 * - Globe auto-rotation stops on node select (cancelAnimationFrame); resumes on deselect
 * - Mobile: larger touch targets, labels always visible on coarse-pointer devices,
 *   declutter skipped on mobile so names are readable on small screens
 */

(() => {
  const d3 = window.d3;
  const topojson = window.topojson;
  if (!d3 || !topojson) return;

  const CULTURES_URL = "docs/cultures.json";
  const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  // Cached once at load — coarse pointer = touch/mobile device
  const IS_COARSE = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const isCoarsePointer = () => IS_COARSE;

  const el = {
    container: document.getElementById("globe-container"),

    tabGlobe: document.getElementById("tabGlobe"),
    tabMap: document.getElementById("tabMap"),
    tabSplit: document.getElementById("tabSplit"),

    globeSvg: document.getElementById("globe"),
    mapDiv: document.getElementById("map"),

    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    resetView: document.getElementById("resetView"),
    toggleConnections: document.getElementById("toggleConnections"),
    toggleLabels: document.getElementById("toggleLabels"),

    btnLocate: document.getElementById("btnLocate"),
    btnResetMap: document.getElementById("btnResetMap"),
    toggleMapConnections: document.getElementById("toggleMapConnections"),

    tooltip: document.getElementById("tooltip"),

    toggleLayerLegend: document.getElementById("toggleLayerLegend"),
    layerLegend: document.getElementById("layerLegend"),

    // Details
    cultureSymbol: document.getElementById("culture-symbol"),
    cultureName: document.getElementById("culture-name"),
    cultureLocation: document.getElementById("culture-location"),
    cultureEra: document.getElementById("culture-era"),
    cultureDesc: document.getElementById("culture-desc"),
    cultureTags: document.getElementById("culture-tags"),
    cultureExtra: document.getElementById("culture-extra"),

    // Compare
    comparePanel: document.getElementById("comparePanel"),
    compareShared: document.getElementById("compareShared"),
    compareA: document.getElementById("compareA"),
    compareB: document.getElementById("compareB"),
    toggleCompare: document.getElementById("toggleCompare"),

    // Weave Paths
    weavePreset: document.getElementById("weavePreset"),
    weavePrev: document.getElementById("weavePrev"),
    weaveNext: document.getElementById("weaveNext"),
    weaveShuffle: document.getElementById("weaveShuffle"),
    weaveAuto: document.getElementById("weaveAuto"),
    weaveSummary: document.getElementById("weaveSummary"),
    weaveStops: document.getElementById("weaveStops"),
    weaveNotes: document.getElementById("weaveNotes"),

    // Suggested
    btnSuggestLinks: document.getElementById("btnSuggestLinks"),
    btnDownloadSuggestions: document.getElementById("btnDownloadSuggestions"),
    btnCopyLink: document.getElementById("btnCopyLink"),

    // Connections
    connections: document.getElementById("connections"),

    // Lenses + Layers
    lensButtons: Array.from(document.querySelectorAll(".cw-lens")),
    layerButtons: Array.from(document.querySelectorAll(".cw-layer-btn")),
  };

  if (!el.container || !el.globeSvg || !el.mapDiv) return;

  const STATE = {
    world: null,

    cultures: [],
    byId: new Map(),

    linksOfficial: [],
    linksSuggested: [],
    showSuggested: false,

    lensLinksCache: new Map(),

    mode: "globe",
    lens: "all",

    selectedId: null,
    hoverId: null,

    showConnections: true,
    showLabels: true,
    showMapConnections: true,

    compare: { enabled: false, a: null, b: null },

    layers: {
      paths: true,
      food: false,
      water: false,
      navigation: false,
      trade: false,
      stewardship: false,
      governance: false,
    },

    weave: {
      presets: new Map(),
      order: [],
      key: null,
      idx: 0,
      auto: false,
      timer: null,
    },

    paused: false,
    visitedIds: [],   // history trail — ordered list of visited culture IDs
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function uniq(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr || []) {
      const k = String(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("`", "&#096;");
  }

  function now() {
    return performance?.now?.() ?? Date.now();
  }

  function formatCoord(v, isLat) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    const dir = isLat ? (n >= 0 ? "N" : "S") : n >= 0 ? "E" : "W";
    return `${abs.toFixed(2)}°${dir}`;
  }

  function globeFacingOpacity(lon, lat) {
    const lambda = (lon + GLOBE.rotate[0]) * Math.PI / 180;
    const phi = lat * Math.PI / 180;
    const phi0 = (-GLOBE.rotate[1]) * Math.PI / 180;

    const dot =
      Math.sin(phi0) * Math.sin(phi) +
      Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);

    if (dot <= 0) return 0;
    return clamp(0.14 + Math.pow(dot, 1.15) * 0.86, 0, 1);
  }

  function textBlob(c) {
    return [
      c.name, c.location, c.region, c.era,
      ...(c.tags || []), ...(c.keyTerms || []), ...(c.highlights || []),
      ...(c.knowledgeSystems || []), ...(c.corePrinciples || []),
      ...(c.movement || []), ...(c.creationStories || []),
      ...(c.notableSitesOrTexts || []), ...(c.modernLegacy || []),
      ...(c.agricultureSystems || []),
    ].join(" ").toLowerCase();
  }

  function hasKeyword(c, keywords) {
    const t = textBlob(c);
    return keywords.some((k) => t.includes(k));
  }

  const AGRI_ENRICH = {
    kanaka_kumulipo: [
      "Ahupuaʻa (mauka→makai) watershed governance (mountain→reef)",
      "Loʻi kalo irrigation + seasonal protocols to prevent depletion",
      "Stewardship as infrastructure: rights tied to responsibility and cycles",
    ],
    taino: [
      "Conuco mound agriculture improving drainage and soil resilience",
      "Cassava (manioc) processing as staple technology",
      "Agro-ecological rotation supporting provisioning",
    ],
  };

  function getAgricultureSystems(c) {
    const base = Array.isArray(c.agricultureSystems) ? c.agricultureSystems : [];
    const enrich = AGRI_ENRICH[c.id] || [];
    const inferred = [];

    if (!base.length && !enrich.length) {
      const picks = []
        .concat(c.knowledgeSystems || [])
        .concat(c.highlights || [])
        .concat(c.corePrinciples || [])
        .filter((x) =>
          /agric|hortic|cassava|irrig|terrace|hydrology|water|soil|crop|farm/i.test(String(x)),
        );
      inferred.push(...picks.slice(0, 4).map(String));
    }

    return uniq([...enrich, ...base, ...inferred]).slice(0, 12);
  }

  // ---------- Signals (layers) ----------
  function hasFoodSignal(c) {
    if ((c.tags || []).includes("Agriculture")) return true;
    if (getAgricultureSystems(c).length) return true;
    return hasKeyword(c, ["agric", "hortic", "crop", "taro", "rice", "maize", "cassava", "manioc", "terrace", "soil"]);
  }

  function hasWaterSignal(c) {
    if ((c.tags || []).includes("Ecology") || (c.tags || []).includes("Stewardship")) return true;
    return hasKeyword(c, ["water", "river", "hydrology", "irrig", "flood", "watershed", "reef", "canal", "delta"]);
  }

  function hasNavigationSignal(c) {
    if ((c.tags || []).includes("Navigation") || (c.tags || []).includes("Seafaring")) return true;
    return hasKeyword(c, ["navigation", "seafaring", "voyag", "wayfind", "canoe", "star", "compass", "maritime"]);
  }

  function hasTradeSignal(c) {
    if ((c.tags || []).includes("Trade") || (c.tags || []).includes("Networks")) return true;
    return hasKeyword(c, ["trade", "exchange", "market", "caravan", "port", "strait", "route", "network"]);
  }

  function hasStewardshipSignal(c) {
    if ((c.tags || []).includes("Stewardship")) return true;
    return hasKeyword(c, ["steward", "sustain", "reciprocity", "conservation", "mālama", "caretaking"]);
  }

  function hasGovernanceSignal(c) {
    if ((c.tags || []).includes("Governance")) return true;
    return hasKeyword(c, ["law", "state", "administr", "council", "empire", "kingdom", "governance", "protocol"]);
  }

  const LAYER_THREAD_CONFIGS = [
    { key: "food", label: "Food / Agriculture", stroke: "rgba(0,255,128,.85)", dash: "", swatch: "linear-gradient(90deg, rgba(0,255,128,.75), rgba(255,215,0,.35))", desc: "Selected → cultures with food/land systems signals.", fn: hasFoodSignal },
    { key: "water", label: "Water / Hydrology", stroke: "rgba(0,247,255,.85)", dash: "7 5", swatch: "linear-gradient(90deg, rgba(0,247,255,.75), rgba(0,120,255,.35))", desc: "Selected → cultures with water/river/irrigation/watershed signals.", fn: hasWaterSignal },
    { key: "navigation", label: "Navigation", stroke: "rgba(157,0,255,.85)", dash: "12 7", swatch: "linear-gradient(90deg, rgba(157,0,255,.75), rgba(0,247,255,.35))", desc: "Selected → cultures with wayfinding/seafaring/navigation signals.", fn: hasNavigationSignal },
    { key: "trade", label: "Trade / Exchange", stroke: "rgba(255,215,0,.80)", dash: "2 7", swatch: "linear-gradient(90deg, rgba(255,215,0,.75), rgba(255,120,0,.35))", desc: "Selected → cultures with trade/exchange network signals.", fn: hasTradeSignal },
    { key: "stewardship", label: "Stewardship", stroke: "rgba(0,247,255,.55)", dash: "", swatch: "linear-gradient(90deg, rgba(0,247,255,.45), rgba(0,255,128,.35))", desc: "Selected → cultures emphasizing sustainability/reciprocity/caretaking.", fn: hasStewardshipSignal },
    { key: "governance", label: "Governance", stroke: "rgba(255,255,255,.35)", dash: "9 6", swatch: "linear-gradient(90deg, rgba(255,255,255,.35), rgba(0,247,255,.25))", desc: "Selected → cultures with law/council/state/admin protocol signals.", fn: hasGovernanceSignal },
  ];

  // ---------- Lens matching ----------
  const LENS_THEME_ALIASES = {
    "Creation": new Set(["Creation", "Cosmology", "Consciousness", "Origins", "Genealogy"]),
    "Navigation": new Set(["Navigation", "Seafaring", "Voyaging", "Wayfinding", "Maritime"]),
    "Martial Arts": new Set(["Martial Arts", "Warrior", "Budo", "Martial", "Combat"]),
    "Stewardship": new Set(["Stewardship", "Sustainability", "Land", "Water", "Ecology"]),
    "Ecology": new Set(["Ecology", "Environment", "Climate", "Water"]),
    "Governance": new Set(["Governance", "Law", "State", "Council", "Administration"]),
  };

  function lensLinkMatch(link, lens) {
    if (!link || !lens || lens === "all") return false;
    const allow = LENS_THEME_ALIASES[lens];
    if (!allow) return false;
    return (link.themes || []).some((t) => allow.has(String(t)));
  }

  function getLensLinks(lens) {
    if (!lens || lens === "all") return [];
    return STATE.lensLinksCache.get(lens) || [];
  }

  // ---------- Normalize ----------
  const REGION_COLORS = {
    Africa: "#ffd166",
    "Middle East": "#ff7b7b",
    Europe: "#8ecae6",
    Asia: "#b5e48c",
    Oceania: "#a78bfa",
    Americas: "#fca5a5",
    Other: "#9ca3af",
  };

  function nodeColor(c) {
    return REGION_COLORS[String(c.region || "Other")] || REGION_COLORS.Other;
  }

  function deriveKeyTerms(tags, corePrinciples, highlights) {
    const stop = new Set(["the","and","for","with","from","into","over","under","between","within","through","their","they","them","that","this","these","those","your","our","its","are","was","were","being","been","have","has","had","will","shall","may","might","can","could","should","true","truth","life","world","human","people","spirit","spirits","god","gods"]);
    const bag = [];
    const addWords = (s) => {
      String(s || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((w) => w.length >= 4 && !stop.has(w))
        .forEach((w) => bag.push(w));
    };
    (corePrinciples || []).forEach(addWords);
    (highlights || []).forEach(addWords);
    const freq = new Map();
    for (const w of bag) freq.set(w, (freq.get(w) || 0) + 1);
    const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w[0].toUpperCase() + w.slice(1));
    return uniq([...(tags || []).map(String), ...topWords]).slice(0, 12);
  }

  function normalizeCulture(c) {
    const id = String(c.id || "").trim() || `c_${Math.random().toString(16).slice(2)}`;
    const coords = Array.isArray(c.coords) ? c.coords : [0, 0];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    const coordsOk = Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;

    const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
    const tags = Array.isArray(c.tags) ? uniq(c.tags.map(String)) : [];
    const core = arr(c.corePrinciples);
    const hi = arr(c.highlights);

    return {
      id,
      name: String(c.name || "").trim() || "Unknown",
      symbol: String(c.symbol || "🌐"),
      lon, lat, coordsOk,
      region: String(c.region || "Other"),
      location: String(c.location || ""),
      era: String(c.era || ""),
      tags,
      keyTerms: deriveKeyTerms(tags, core, hi),
      desc: String(c.desc || ""),
      creationStories: arr(c.creationStories),
      corePrinciples: core,
      martialArts: arr(c.martialArts),
      highlights: hi,
      knowledgeSystems: arr(c.knowledgeSystems),
      notableSitesOrTexts: arr(c.notableSitesOrTexts),
      movement: arr(c.movement),
      modernLegacy: arr(c.modernLegacy),
      agricultureSystems: arr(c.agricultureSystems),
    };
  }

  function normalizeWorld(worldRaw) {
    const objects = worldRaw?.objects || {};
    const countriesObj = objects.countries || objects.country || Object.values(objects)[0] || null;

    let countries = { type: "FeatureCollection", features: [] };
    if (countriesObj) {
      try { countries = topojson.feature(worldRaw, countriesObj); } catch { /* noop */ }
    }

    let land = null;
    if (objects.land) {
      try { land = topojson.feature(worldRaw, objects.land); } catch { land = null; }
    }
    if (!land) land = { type: "Feature", geometry: { type: "Sphere" }, properties: {} };
    return { land, countries };
  }

  function normalizeLink(l) {
    if (!l || typeof l !== "object") return null;
    const a = STATE.byId.get(String(l.source || ""));
    const b = STATE.byId.get(String(l.target || ""));
    if (!a || !b) return null;
    return {
      source: a, target: b,
      label: String(l.label || ""),
      themes: Array.isArray(l.themes) ? l.themes.map(String) : [],
      description: String(l.description || ""),
      _kind: "official",
    };
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
  }

  async function loadAll() {
    const [worldRaw, culturesRaw] = await Promise.all([d3.json(WORLD_URL), fetchJson(CULTURES_URL)]);
    STATE.world = normalizeWorld(worldRaw);

    const cultures = (culturesRaw?.cultures || []).map(normalizeCulture).filter((c) => c.coordsOk);
    STATE.cultures = cultures;
    STATE.byId = new Map(cultures.map((c) => [c.id, c]));

    STATE.linksOfficial = (culturesRaw?.links || []).map((x) => normalizeLink(x)).filter(Boolean);

    rebuildLensCache();
    buildWeavePresets();
  }

  // ---------- Suggested links ----------
  function overlapScore(a, b) {
    const A = new Set([...(a.tags || []), ...(a.keyTerms || [])].map(String));
    const B = new Set([...(b.tags || []), ...(b.keyTerms || [])].map(String));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    const union = A.size + B.size - inter;
    return union ? inter / union : 0;
  }

  function sharedTerms(a, b) {
    const A = new Set([...(a.tags || []), ...(a.keyTerms || [])].map(String));
    const B = new Set([...(b.tags || []), ...(b.keyTerms || [])].map(String));
    const out = [];
    for (const t of A) if (B.has(t)) out.push(t);
    return out;
  }

  function buildSuggestedLinks() {
    const out = [];
    const cultures = STATE.cultures;
    const existing = new Set(STATE.linksOfficial.map((l) => `${l.source.id}__${l.target.id}`));

    for (let i = 0; i < cultures.length; i++) {
      for (let j = i + 1; j < cultures.length; j++) {
        const a = cultures[i];
        const b = cultures[j];
        const key = `${a.id}__${b.id}`;
        if (existing.has(key)) continue;

        const score = overlapScore(a, b);
        if (score < 0.34) continue;

        out.push({
          source: a, target: b,
          label: "Suggested similarity",
          themes: sharedTerms(a, b).slice(0, 8),
          description: `Auto-suggested via shared tags/terms (score ${score.toFixed(2)})`,
          _kind: "suggested",
        });
      }
    }
    return out.slice(0, 240);
  }

  function allLinks() {
    return STATE.showSuggested ? [...STATE.linksOfficial, ...STATE.linksSuggested] : [...STATE.linksOfficial];
  }

  function relatedLinksForCulture(id) {
    return allLinks().filter((l) => l.source.id === id || l.target.id === id);
  }

  // ---------- Lens cache ----------
  function rebuildLensCache() {
    STATE.lensLinksCache.clear();
    const lenses = Object.keys(LENS_THEME_ALIASES);
    for (const lens of lenses) {
      STATE.lensLinksCache.set(lens, STATE.linksOfficial.filter((l) => lensLinkMatch(l, lens)));
    }
  }

  // ---------- Tooltips ----------
  function showTooltip(event, c) {
    if (!el.tooltip) return;
    el.tooltip.style.display = "block";
    el.tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(c.symbol)} ${escapeHtml(c.name)}</div>
      <div class="tooltip-sub">${escapeHtml(c.location || "")}</div>
    `;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (!el.tooltip) return;
    const pad = 14;
    el.tooltip.style.transform = `translate(${event.clientX + pad}px, ${event.clientY + pad}px)`;
  }

  function hideTooltip() {
    if (!el.tooltip) return;
    el.tooltip.style.display = "none";
  }

  // ---------- Details ----------
  function cultureMatchesLens(c) {
    const lens = STATE.lens;
    if (!lens || lens === "all") return true;
    const set = new Set([...(c.tags || []), ...(c.keyTerms || [])].map(String));
    return set.has(lens);
  }

  function storyParagraphs(c) {
    const place = `${c.location || "Unknown place"}${c.region ? ` • ${c.region}` : ""}`;
    const era = c.era || "Unknown era";
    const coords = Number.isFinite(c.lat) && Number.isFinite(c.lon) ? `${formatCoord(c.lat, true)}, ${formatCoord(c.lon, false)}` : "Unknown coordinates";

    const origins = (c.creationStories || []).slice(0, 2);
    const principles = (c.corePrinciples || []).slice(0, 3);
    const movement = (c.movement || []).slice(0, 2);
    const knowledge = (c.knowledgeSystems || []).slice(0, 3);
    const legacy = (c.modernLegacy || []).slice(0, 2);
    const agri = getAgricultureSystems(c).slice(0, 3);

    const p = [];
    p.push(`In ${place}, across ${era}, ${c.name} is a living system—where meaning, survival, and legitimacy are produced by coordination. The landscape is not background; it is the first teacher. (${coords})`);

    if (origins.length) {
      p.push(`Origins begin the map: ${origins.join(" • ")}. These aren't "just myths"—they're compressed instructions for relationship, obligation, and what counts as real.`);
    } else {
      p.push(`The origin chapter is not yet recorded here. When added, it should explain how beings and duties emerge together (not only "what happened first").`);
    }

    if (agri.length) {
      p.push(`Food and sustainability are treated as technology: ${agri.join(" • ")}. The design goal isn't extraction—it's maintaining flow (water, labor, seasons, and rights) without collapsing the ecosystem.`);
    } else {
      p.push(`Food/land systems are not yet recorded. Add crops, water flow, labor organization, seasonal timing, and how stewardship is enforced.`);
    }

    if (principles.length) {
      p.push(`Stability comes from repeatable rules: ${principles.join(" • ")}. When performed as protocol, they become a kind of social physics—predictable enough to build a world on.`);
    }

    if (movement.length) {
      p.push(`Movement is infrastructure: ${movement.join(" • ")}. Routes store memory; exchange carries legitimacy; migrations redraw what belongs together.`);
    }

    if (knowledge.length) {
      p.push(`Knowledge is carried through practice: ${knowledge.join(" • ")}. You don't just learn it—you become the instrument that can reproduce it.`);
    }

    if (legacy.length) {
      p.push(`The story continues now: ${legacy.join(" • ")}. In modern conditions, continuity becomes engineering—rebuilding the channels where knowledge can flow again.`);
    }

    return p;
  }

  function renderStoryCard(c) {
    const paragraphs = storyParagraphs(c);
    return `
      <section class="culture-card culture-extra-card cw-story-card" data-expanded="false">
        <header class="culture-card-header">
          <h4 class="culture-card-title"><i class="fas fa-book-open" aria-hidden="true"></i> Story Mode — Narrative</h4>
        </header>

        <div class="cw-story-scroll cw-scroll" style="display:none" aria-label="Story mode scroll area">
          ${paragraphs.map((t) => `<p>${escapeHtml(t)}</p>`).join("")}
        </div>

        <button class="culture-card-more" type="button" data-action="toggle-story">
          <i class="fas fa-chevron-down"></i> Read story
        </button>
      </section>
    `;
  }

  function renderCultureCards(c) {
    const TOP = 6;
    const sections = [
      { key: "movement", title: "Travel, Migration & Exchange", icon: "fa-route" },
      { key: "agricultureSystems", title: "Agriculture & Land/Water Management", icon: "fa-seedling", special: "agri" },
      { key: "creationStories", title: "Creation Stories & Cosmology", icon: "fa-stars" },
      { key: "corePrinciples", title: "Core Principles", icon: "fa-scale-balanced" },
      { key: "knowledgeSystems", title: "Knowledge Systems", icon: "fa-brain" },
      { key: "notableSitesOrTexts", title: "Notable Sites / Texts", icon: "fa-landmark" },
      { key: "martialArts", title: "Martial Arts & Warrior Traditions", icon: "fa-hand-fist" },
      { key: "highlights", title: "Highlights", icon: "fa-bolt" },
      { key: "modernLegacy", title: "Modern Legacy", icon: "fa-tower-observation" },
    ];

    const storyCard = renderStoryCard(c);

    const cards = sections
      .map((s) => {
        const items =
          s.special === "agri"
            ? getAgricultureSystems(c)
            : Array.isArray(c[s.key])
              ? c[s.key]
              : [];
        if (!items.length) return "";

        const first = items.slice(0, TOP);
        const rest = items.slice(TOP);

        const liFirst = first.map((x) => `<li>${escapeHtml(String(x))}</li>`).join("");
        const liRest = rest.map((x) => `<li class="more">${escapeHtml(String(x))}</li>`).join("");

        const moreBtn = rest.length
          ? `<button class="culture-card-more" type="button" data-action="toggle-card" data-total="${items.length}">
               <i class="fas fa-chevron-down"></i> Show all (${items.length})
             </button>`
          : "";

        return `
          <section class="culture-card culture-extra-card" data-expanded="false">
            <header class="culture-card-header">
              <h4 class="culture-card-title"><i class="fas ${escapeAttr(s.icon)}" aria-hidden="true"></i> ${escapeHtml(s.title)}</h4>
            </header>
            <ul class="culture-card-list cw-scroll">${liFirst}${liRest}</ul>
            ${moreBtn}
          </section>
        `;
      })
      .filter(Boolean)
      .join("");

    return `<div class="culture-extra-grid">${storyCard}${cards || ""}</div>`;
  }

  function wireCultureCardToggles() {
    if (!el.cultureExtra) return;

    el.cultureExtra.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const storyBtn = target.closest('[data-action="toggle-story"]');
      if (storyBtn) {
        const card = storyBtn.closest(".cw-story-card");
        if (!card) return;
        const scroll = card.querySelector(".cw-story-scroll");
        const open = card.getAttribute("data-expanded") === "true";

        card.setAttribute("data-expanded", open ? "false" : "true");
        if (scroll) scroll.style.display = open ? "none" : "block";

        storyBtn.innerHTML = open
          ? `<i class="fas fa-chevron-down"></i> Read story`
          : `<i class="fas fa-chevron-up"></i> Close story`;
        return;
      }

      const btn = target.closest('[data-action="toggle-card"]');
      if (!btn) return;

      const card = btn.closest(".culture-card");
      if (!card) return;

      const expanded = card.getAttribute("data-expanded") === "true";
      card.setAttribute("data-expanded", expanded ? "false" : "true");

      const total = Number(btn.getAttribute("data-total") || "0");
      btn.innerHTML = expanded
        ? `<i class="fas fa-chevron-down"></i> Show all (${total})`
        : `<i class="fas fa-chevron-up"></i> Show less`;
    });
  }

  function similarityCardHtml({ otherId, otherName, otherSymbol, label, themes, description, kind }) {
    const chips = (themes || [])
      .slice(0, 8)
      .map((t) => `<span class="connection-chip">${escapeHtml(t)}</span>`)
      .join("");

    const suggestedCls = kind === "suggested" ? "suggested" : "";

    return `
      <div class="connection-card ${suggestedCls}" data-cid="${escapeAttr(otherId)}">
        <h4 class="connection-name">${escapeHtml(otherSymbol || "🔗")} ${escapeHtml(otherName)} ${kind === "suggested" ? '<span class="cw-muted">(Suggested)</span>' : ""}</h4>
        <p class="connection-desc">${escapeHtml(label || "Connection")} — ${escapeHtml(description || "")}</p>
        ${chips ? `<div class="connection-meta">${chips}</div>` : ""}
      </div>
    `;
  }

  function setDetailsDefault() {
    el.cultureSymbol && (el.cultureSymbol.textContent = "🌐");
    el.cultureName && (el.cultureName.textContent = "Select a Wisdom Tradition");
    el.cultureLocation && (el.cultureLocation.textContent = "");
    el.cultureEra && (el.cultureEra.textContent = "");
    el.cultureDesc && (el.cultureDesc.textContent = "Click a culture on the globe/map to explore details and connections.");
    el.cultureTags && (el.cultureTags.innerHTML = "");
    el.cultureExtra && (el.cultureExtra.innerHTML = "");
    el.connections && (el.connections.innerHTML = `<div class="connection-empty">Select a culture to see connections.</div>`);
  }

  function updateCultureInfo(c) {
    if (!c) return;

    el.cultureSymbol && (el.cultureSymbol.textContent = c.symbol || "🌐");
    el.cultureName && (el.cultureName.textContent = c.name || "");
    el.cultureLocation && (el.cultureLocation.textContent = `${c.location || ""}${c.region ? (c.location ? " • " : "") + c.region : ""}`);
    el.cultureEra && (el.cultureEra.textContent = `${c.era || ""}${Number.isFinite(c.lat) && Number.isFinite(c.lon) ? (c.era ? " • " : "") + `${formatCoord(c.lat, true)}, ${formatCoord(c.lon, false)}` : ""}`);
    el.cultureDesc && (el.cultureDesc.textContent = c.desc || "");

    if (el.cultureTags) {
      const lens = STATE.lens;
      el.cultureTags.innerHTML = (c.tags || [])
        .map((t) => {
          const hit = lens !== "all" && t === lens;
          return `<span class="culture-tag" style="${hit ? "border-color:rgba(255,215,0,.35);background:rgba(255,215,0,.10);" : ""}">${escapeHtml(t)}</span>`;
        })
        .join("");
    }

    if (el.cultureExtra) el.cultureExtra.innerHTML = renderCultureCards(c);

    if (el.connections) {
      const rel = relatedLinksForCulture(c.id);
      el.connections.innerHTML = rel.length
        ? rel
            .map((l) => {
              const other = l.source.id === c.id ? l.target : l.source;
              return similarityCardHtml({
                otherId: other.id,
                otherName: other.name,
                otherSymbol: other.symbol,
                label: l.label || "Connection",
                themes: l.themes || [],
                description: l.description || "",
                kind: l._kind || "official",
              });
            })
            .join("")
        : `<div class="connection-empty">No links yet (toggle Suggested to see auto-links).</div>`;

      el.connections.querySelectorAll(".connection-card[data-cid]").forEach((card) => {
        card.addEventListener("click", () => {
          const id = card.getAttribute("data-cid");
          if (id) selectCulture(id, true);
        });
      });
    }
  }

  // ---------- Guide panel ----------
  const LENS_EXPLAIN = {
    all: "All view: no single lens. Use a lens to highlight a meaning-network built from your real links.",
    "Creation": "Creation lens highlights origin/cosmology links (ex: Kumulipo ↔ Nun).",
    "Navigation": "Navigation lens highlights voyaging/wayfinding and exchange networks.",
    "Martial Arts": "Martial Arts lens highlights warrior codes, training lineages, and embodied knowledge.",
    "Stewardship": "Stewardship lens highlights reciprocity, sustainability, land–sea governance systems.",
    "Ecology": "Ecology lens highlights environment/water/seasonality and ecological constraints as knowledge.",
    "Governance": "Governance lens highlights councils, law, administration, legitimacy, and institutional memory.",
  };

  function renderGuide() {
    if (!el.layerLegend) return;

    const lens = STATE.lens || "all";
    const lensText = LENS_EXPLAIN[lens] || "";

    const activeLayers = LAYER_THREAD_CONFIGS.filter((cfg) => STATE.layers[cfg.key]);

    const layerRows = activeLayers.length
      ? `<h4>Active Layers</h4>
         <div class="cw-legend-grid">
           ${activeLayers
             .map((cfg) => {
               const dash = cfg.dash ? `stroke-dasharray:${cfg.dash};` : "";
               return `
                 <div class="cw-legend-item">
                   <div class="cw-legend-swatch" style="--swatch:${cfg.swatch}"></div>
                   <div class="cw-legend-text">
                     <strong>${escapeHtml(cfg.label)}</strong>
                     <div class="small">${escapeHtml(cfg.desc)}</div>
                     <div class="small" style="margin-top:4px">Line style:
                       <span style="display:inline-block;width:54px;height:0;border-top:3px solid ${cfg.stroke};${dash}"></span>
                     </div>
                   </div>
                 </div>
               `;
             })
             .join("")}
         </div>`
      : `<h4>Active Layers</h4><div class="cw-muted">Turn on Food/Water/etc to draw layer threads from the selected culture.</div>`;

    const pathsRow = STATE.layers.paths
      ? `<div class="cw-muted" style="margin-top:6px">Weave Path layer draws the current Weave Path (from the Weave Paths panel) on the globe/map.</div>`
      : `<div class="cw-muted" style="margin-top:6px">Weave Path layer is OFF.</div>`;

    const lensLinks = lens !== "all" ? getLensLinks(lens) : [];
    const selectedId = STATE.selectedId;

    const prioritized = lensLinks
      .slice()
      .sort((a, b) => {
        const aHit = selectedId && (a.source.id === selectedId || a.target.id === selectedId) ? 1 : 0;
        const bHit = selectedId && (b.source.id === selectedId || b.target.id === selectedId) ? 1 : 0;
        return bHit - aHit;
      })
      .slice(0, 6);

    const linksHtml =
      lens === "all"
        ? `<h4>Lens Connections</h4><div class="cw-muted">Pick a lens to highlight real links + show featured connections here.</div>`
        : `<h4>Lens Connections — ${escapeHtml(lens)}</h4>
           <div class="cw-muted">${escapeHtml(lensText)}</div>
           <div class="cw-legend-links">
             ${prioritized.length ? prioritized.map((l) => `
               <div class="cw-legend-link">
                 <div class="t">${escapeHtml(l.source.symbol)} ${escapeHtml(l.source.name)} ↔ ${escapeHtml(l.target.symbol)} ${escapeHtml(l.target.name)}</div>
                 <div class="d"><strong>${escapeHtml(l.label || "Link")}</strong> — ${escapeHtml(l.description || "")}</div>
               </div>
             `).join("") : `<div class="cw-muted">No links found for this lens (add more links in docs/cultures.json).</div>`}
           </div>`;

    el.layerLegend.innerHTML = `
      <h4>Guide</h4>
      <div class="cw-muted">
        <strong>Lenses</strong> highlight meaning-networks (real links).<br>
        <strong>Layers</strong> draw structure overlays (Weave Path + selected-to-peer threads).
      </div>
      ${linksHtml}
      ${layerRows}
      ${pathsRow}
    `;
  }

  function toggleGuide() {
    if (!el.layerLegend) return;
    const hidden = el.layerLegend.hasAttribute("hidden");
    if (hidden) el.layerLegend.removeAttribute("hidden");
    else el.layerLegend.setAttribute("hidden", "");
  }

  // ---------- Weave Paths ----------
  function buildLensGraph(lens) {
    const links = getLensLinks(lens);
    const adj = new Map();
    const deg = new Map();

    const add = (a, b, link) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push({ otherId: b, link });
      deg.set(a, (deg.get(a) || 0) + 1);
    };

    for (const l of links) {
      add(l.source.id, l.target.id, l);
      add(l.target.id, l.source.id, l);
    }

    return { adj, deg, links };
  }

  function pickStartNode(deg) {
    let best = null;
    let bestD = -1;
    for (const [id, d] of deg.entries()) {
      if (d > bestD) { bestD = d; best = id; }
    }
    return best;
  }

  function buildWalkPath(lens, maxStops = 10) {
    const { adj, deg } = buildLensGraph(lens);
    const start = pickStartNode(deg);
    if (!start) return [];

    const visited = new Set([start]);
    const out = [start];
    let cur = start;

    while (out.length < maxStops) {
      const options = (adj.get(cur) || []).filter((x) => !visited.has(x.otherId));
      if (!options.length) break;
      options.sort((a, b) => (deg.get(b.otherId) || 0) - (deg.get(a.otherId) || 0));
      const next = options[0].otherId;
      visited.add(next);
      out.push(next);
      cur = next;
    }

    return out.filter((id) => STATE.byId.has(id));
  }

  function buildWeavePresets() {
    const lenses = Object.keys(LENS_THEME_ALIASES);

    STATE.weave.presets.clear();
    STATE.weave.order = [];

    for (const lens of lenses) {
      const stops = buildWalkPath(lens, 10);
      if (stops.length < 2) continue;

      const key = `weave:${lens.toLowerCase().replace(/\s+/g, "_")}`;
      STATE.weave.presets.set(key, {
        key, name: `${lens} — Weave Path`, lens,
        desc: LENS_EXPLAIN[lens] || "", stops,
      });
      STATE.weave.order.push(key);
    }

    if (!STATE.weave.order.some((k) => (STATE.weave.presets.get(k)?.lens === "Creation"))) {
      const fallback = ["kanaka_kumulipo", "kemet", "vedic", "maya"].filter((id) => STATE.byId.has(id));
      if (fallback.length >= 2) {
        const key = "weave:creation_fallback";
        STATE.weave.presets.set(key, {
          key, name: "Creation — Weave Path", lens: "Creation",
          desc: LENS_EXPLAIN["Creation"] || "", stops: fallback,
        });
        STATE.weave.order.unshift(key);
      }
    }

    if (el.weavePreset) {
      el.weavePreset.innerHTML = STATE.weave.order
        .map((k) => {
          const p = STATE.weave.presets.get(k);
          return `<option value="${escapeAttr(k)}">${escapeHtml(p?.name || k)}</option>`;
        })
        .join("");
    }

    setWeavePreset(STATE.weave.order[0] || null, false);
  }

  function setWeavePreset(key, jumpToFirst) {
    if (!key) return;
    const p = STATE.weave.presets.get(key);
    if (!p) return;

    STATE.weave.key = key;
    STATE.weave.idx = 0;
    el.weavePreset && (el.weavePreset.value = key);

    renderWeavePanel();
    if (jumpToFirst) goWeaveIndex(0, true);

    scheduleGlobeRender();
    mapRender();
    renderGuide();
  }

  function getWeaveStops() {
    const p = STATE.weave.key ? STATE.weave.presets.get(STATE.weave.key) : null;
    if (!p) return [];
    return (p.stops || []).map((id) => STATE.byId.get(id)).filter(Boolean);
  }

  function findOfficialLink(aId, bId) {
    const all = allLinks();
    return all.find((l) => (l.source.id === aId && l.target.id === bId) || (l.source.id === bId && l.target.id === aId)) || null;
  }

  function renderWeavePanel() {
    const p = STATE.weave.key ? STATE.weave.presets.get(STATE.weave.key) : null;
    const stops = getWeaveStops();

    if (el.weaveSummary) {
      if (!p) el.weaveSummary.textContent = "Select a path to begin.";
      else el.weaveSummary.innerHTML = `<strong>${escapeHtml(p.name)}</strong> • ${escapeHtml(p.desc)} • <strong>${stops.length}</strong> stops`;
    }

    if (el.weaveStops) {
      el.weaveStops.innerHTML = stops
        .map((c, i) => `
          <li class="cw-path-item ${i === STATE.weave.idx ? "active" : ""}" data-idx="${i}">
            <div><strong>${escapeHtml(c.symbol)} ${escapeHtml(c.name)}</strong><div class="cw-muted">${escapeHtml(c.location || c.region || "")}</div></div>
            <div class="cw-muted">#${i + 1}</div>
          </li>
        `)
        .join("");

      el.weaveStops.querySelectorAll(".cw-path-item[data-idx]").forEach((li) => {
        li.addEventListener("click", () => {
          const idx = Number(li.getAttribute("data-idx"));
          if (Number.isFinite(idx)) goWeaveIndex(idx, true);
        });
      });
    }

    if (el.weaveNotes) {
      if (!p || stops.length < 2) {
        el.weaveNotes.innerHTML = `<h4><i class="fas fa-route"></i> Path Notes</h4><div class="cw-muted">Pick a path with at least 2 stops.</div>`;
      } else {
        const legs = [];
        for (let i = 0; i < stops.length - 1; i++) {
          const a = stops[i];
          const b = stops[i + 1];
          const link = findOfficialLink(a.id, b.id);
          const title = link?.label || "Link not yet documented";
          const desc = link?.description || "Add a link in docs/cultures.json so this leg has a real explanation.";
          legs.push(`
            <div class="cw-leg">
              <div class="t">${escapeHtml(a.symbol)} ${escapeHtml(a.name)} → ${escapeHtml(b.symbol)} ${escapeHtml(b.name)}</div>
              <div class="d"><strong>${escapeHtml(title)}</strong> — ${escapeHtml(desc)}</div>
            </div>
          `);
        }

        el.weaveNotes.innerHTML = `
          <h4><i class="fas fa-route"></i> Path Notes</h4>
          <div class="cw-muted">${escapeHtml(p.desc || "")}</div>
          ${legs.join("")}
        `;
      }
    }
  }

  function goWeaveIndex(idx, focus) {
    const stops = getWeaveStops();
    if (!stops.length) return;
    const i = clamp(idx, 0, stops.length - 1);
    STATE.weave.idx = i;
    renderWeavePanel();
    if (focus) selectCulture(stops[i].id, true);
  }

  function weavePrev() { goWeaveIndex(STATE.weave.idx - 1, true); }
  function weaveNext() { goWeaveIndex(STATE.weave.idx + 1, true); }

  function weaveShuffle() {
    if (!STATE.weave.order.length) return;
    const k = STATE.weave.order[Math.floor(Math.random() * STATE.weave.order.length)];
    setWeavePreset(k, true);
  }

  function setWeaveAuto(on) {
    STATE.weave.auto = on;
    if (el.weaveAuto) {
      el.weaveAuto.innerHTML = on ? `<i class="fas fa-pause"></i> Auto` : `<i class="fas fa-play"></i> Auto`;
      el.weaveAuto.classList.toggle("active", on);
    }

    if (STATE.weave.timer) { clearInterval(STATE.weave.timer); STATE.weave.timer = null; }

    if (on) {
      STATE.weave.timer = setInterval(() => {
        const stops = getWeaveStops();
        if (stops.length < 2) return;
        const next = (STATE.weave.idx + 1) % stops.length;
        goWeaveIndex(next, true);
      }, 3500);
    }
  }

  // ---------- Selection / clearing ----------
  function getSelectedCulture() {
    if (!STATE.selectedId) return null;
    return STATE.byId.get(STATE.selectedId) || null;
  }

  function setDeepLink(id) {
    try {
      const u = new URL(window.location.href);
      if (id) u.searchParams.set("c", id);
      else u.searchParams.delete("c");
      history.replaceState({}, "", u.toString());
    } catch {}
  }

  function copyDeepLink() {
    try {
      const u = new URL(window.location.href);
      if (STATE.selectedId) u.searchParams.set("c", STATE.selectedId);
      navigator.clipboard?.writeText(u.toString());
    } catch {}
  }

  function clearSelection() {
    STATE.selectedId = null;
    hideTooltip();
    setDetailsDefault();
    clearAllOverlayPaths();
    startGlobeTick(); // ← resume rotation
    zoomGlobeOut();   // ← animate back to base scale
    // Also reset map zoom out smoothly
    if (MAP.inited && MAP.svg && MAP.zoom) {
      MAP.svg.transition().duration(prefersReducedMotion ? 0 : 500).call(MAP.zoom.transform, d3.zoomIdentity);
      MAP.transform = d3.zoomIdentity;
    }
    scheduleGlobeRender();
    mapRender();
    renderGuide();
  }

  function selectCulture(id, pushHistory) {
    if (STATE.selectedId && id === STATE.selectedId) {
      setDeepLink(null);
      clearSelection();
      return;
    }

    const c = STATE.byId.get(id);
    if (!c) return;

    stopGlobeTick(); // ← halt rotation immediately, before anything else

    STATE.selectedId = c.id;

    // Track visit history (max 20, no duplicates adjacent)
    if (STATE.visitedIds[STATE.visitedIds.length - 1] !== c.id) {
      STATE.visitedIds.push(c.id);
      if (STATE.visitedIds.length > 20) STATE.visitedIds.shift();
    }
    updateCultureInfo(c);
    focusOnCulture(c);

    if (pushHistory) setDeepLink(c.id);

    scheduleGlobeRender();
    mapRender();
    renderGuide();
  }

  // ---------- Overlay path helpers ----------
  function clearAllOverlayPaths() {
    if (GLOBE.inited) {
      GLOBE.pathSel?.attr("d", "").attr("opacity", 0);
      GLOBE.lensSel?.attr("d", "").attr("opacity", 0);
      for (const cfg of LAYER_THREAD_CONFIGS) GLOBE.threadLayerByKey.get(cfg.key)?.selectAll("path.cw-thread-link").remove();
      GLOBE.pulseSel?.style("display", "none");
    }
    if (MAP.inited) {
      MAP.pathSel?.attr("d", "").attr("opacity", 0);
      MAP.lensSel?.attr("d", "").attr("opacity", 0);
      for (const cfg of LAYER_THREAD_CONFIGS) MAP.threadLayerByKey.get(cfg.key)?.selectAll("path.cw-thread-link").remove();
    }
  }

  // ---------- Focus (globe rotate + zoom in) ----------

  // Cancel any in-progress zoom animation
  function cancelZoomAnim() {
    if (GLOBE.zoomAnimRaf !== null) {
      cancelAnimationFrame(GLOBE.zoomAnimRaf);
      GLOBE.zoomAnimRaf = null;
    }
  }

  // Smooth easing
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function animateGlobeScale(fromScale, toScale, duration, onDone) {
    cancelZoomAnim();
    if (prefersReducedMotion || duration === 0) {
      GLOBE.scale = toScale;
      scheduleGlobeRender();
      onDone?.();
      return;
    }
    const t0 = now();
    const step = () => {
      const raw = clamp((now() - t0) / duration, 0, 1);
      const t = easeInOut(raw);
      GLOBE.scale = fromScale + (toScale - fromScale) * t;
      scheduleGlobeRender();
      if (raw < 1) {
        GLOBE.zoomAnimRaf = requestAnimationFrame(step);
      } else {
        GLOBE.zoomAnimRaf = null;
        GLOBE.scale = toScale;
        scheduleGlobeRender();
        onDone?.();
      }
    };
    GLOBE.zoomAnimRaf = requestAnimationFrame(step);
  }

  function focusOnCulture(c) {
    if (!c) return;

    ensureGlobeInit();

    // --- Globe: rotate + zoom in to ~2.2× base scale ---
    const startRotate = [...GLOBE.rotate];
    const endRotate = [-c.lon, -c.lat, 0];
    const startScale = GLOBE.scale;
    const targetScale = clamp(GLOBE.baseScale * 2.2, GLOBE.baseScale * 0.72, GLOBE.baseScale * 3.0);

    const dur = prefersReducedMotion ? 0 : 750;
    const t0 = now();

    cancelZoomAnim(); // cancel any previous zoom

    const step = () => {
      const raw = clamp((now() - t0) / (dur || 1), 0, 1);
      const t = easeInOut(raw);
      GLOBE.rotate[0] = startRotate[0] + (endRotate[0] - startRotate[0]) * t;
      GLOBE.rotate[1] = startRotate[1] + (endRotate[1] - startRotate[1]) * t;
      GLOBE.scale = startScale + (targetScale - startScale) * t;
      // Keep projection + sphere in sync (globeRender will also do this, but
      // doing it here avoids a one-frame lag on sphere radius)
      if (GLOBE.projection) {
        GLOBE.projection.translate([GLOBE.width / 2, GLOBE.height / 2]).scale(GLOBE.scale);
        GLOBE.layers.sphere?.attr("r", GLOBE.scale);
      }
      scheduleGlobeRender();
      if (raw < 1) {
        GLOBE.zoomAnimRaf = requestAnimationFrame(step);
      } else {
        GLOBE.zoomAnimRaf = null;
      }
    };
    GLOBE.zoomAnimRaf = requestAnimationFrame(step);

    // --- Map: zoom in tightly on the culture's location ---
    if (MAP.inited) {
      const p = MAP.projection([c.lon, c.lat]);
      if (p && MAP.svg && MAP.zoom) {
        // Use a zoom level that shows regional detail — 4× for most, 5× for
        // island/small-territory cultures so you can see the archipelago shape.
        const isIsland = hasKeyword(c, ["island", "archipelago", "pacific", "polynesia", "hawaii", "caribbean", "maui", "oahu"]);
        const k = isIsland ? 5 : 4;
        const tx = MAP.width / 2 - p[0] * k;
        const ty = MAP.height / 2 - p[1] * k;
        const tr = d3.zoomIdentity.translate(tx, ty).scale(k);
        MAP.svg.transition().duration(prefersReducedMotion ? 0 : 650).call(MAP.zoom.transform, tr);
      }
    }
  }

  // Zoom the globe back out to base scale (called from clearSelection)
  function zoomGlobeOut() {
    if (!GLOBE.inited) return;
    const fromScale = GLOBE.scale;
    const toScale = GLOBE.baseScale;
    if (Math.abs(fromScale - toScale) < 2) return; // already at base
    animateGlobeScale(fromScale, toScale, prefersReducedMotion ? 0 : 500, () => {
      // Make sure globeResize clamps are respected
      GLOBE.scale = clamp(GLOBE.scale, GLOBE.baseScale * 0.72, GLOBE.baseScale * 1.6);
      scheduleGlobeRender();
    });
  }

  // ---------- Drawing geometry ----------
  function arcPath(proj, a, b) {
    const pa = proj([a.lon, a.lat]);
    const pb = proj([b.lon, b.lat]);
    if (!pa || !pb) return "";

    const mx = (pa[0] + pb[0]) / 2;
    const my = (pa[1] + pb[1]) / 2;
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const dist = Math.hypot(dx, dy);
    const lift = clamp(dist * 0.25, 18, 120);
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
    const cx = mx + nx * lift;
    const cy = my + ny * lift;

    return `M${pa[0]},${pa[1]} Q${cx},${cy} ${pb[0]},${pb[1]}`;
  }

  function multiArcPath(proj, pairs) {
    return pairs.map(([a, b]) => arcPath(proj, a, b)).filter(Boolean).join(" ");
  }

  // ---------- Layer threads ----------
  const LAYER_THEME_MAP = {
    food: new Set(["Food", "Agriculture", "Exchange", "Stewardship"]),
    water: new Set(["Water", "Ecology", "Stewardship"]),
    navigation: new Set(["Navigation", "Seafaring", "Voyaging", "Maritime", "Exchange"]),
    trade: new Set(["Trade", "Exchange", "Networks"]),
    stewardship: new Set(["Stewardship", "Ecology", "Water", "Land"]),
    governance: new Set(["Governance", "Law", "Institutions", "Administration"]),
  };

  function layerLinkMatch(link, cfg) {
    const allow = LAYER_THEME_MAP[cfg.key];
    if (!allow) return false;
    return (link.themes || []).some((t) => allow.has(String(t)));
  }

  function buildLayerLinkData(cfg, limit = 10) {
    const sel = getSelectedCulture();
    if (!sel) return [];

    const peers = layerPeers(cfg, limit);
    return peers.map((peer) => {
      const official = allLinks().find((l) => {
        const samePair =
          (l.source.id === sel.id && l.target.id === peer.id) ||
          (l.source.id === peer.id && l.target.id === sel.id);
        return samePair && layerLinkMatch(l, cfg);
      });

      return {
        source: sel,
        target: peer,
        label: official?.label || `${cfg.label}: ${sel.name} ↔ ${peer.name}`,
        themes: official?.themes || [cfg.label],
        description:
          official?.story ||
          official?.description ||
          `${cfg.label} connection surfaced from the currently selected culture and matching layer signals.`,
        certainty: official?.certainty || "inferred"
      };
    });
  }

  function showLinkTooltip(event, link) {
    if (!el.tooltip) return;
    el.tooltip.style.display = "block";
    el.tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(link.source.symbol)} ${escapeHtml(link.source.name)} ↔ ${escapeHtml(link.target.symbol)} ${escapeHtml(link.target.name)}</div>
      <div class="tooltip-sub"><strong>${escapeHtml(link.label || "Connection")}</strong></div>
      <div class="tooltip-sub" style="margin-top:4px">${escapeHtml(link.description || "")}</div>
      ${(link.themes || []).length ? `<div class="tooltip-sub" style="margin-top:6px">Themes: ${escapeHtml(link.themes.join(" • "))}</div>` : ""}
      ${link.certainty ? `<div class="tooltip-sub" style="margin-top:4px">Certainty: ${escapeHtml(link.certainty)}</div>` : ""}
    `;
    moveTooltip(event);
  }

  function wireHoverablePathSelection(sel) {
    sel
      .attr("pointer-events", "stroke")
      .on("pointerenter", (event, d) => showLinkTooltip(event, d))
      .on("pointermove", (event) => moveTooltip(event))
      .on("pointerleave", () => hideTooltip())
      .on("click", (event, d) => {
        event.stopPropagation();
        selectCulture(d.target.id, true);
      });
  }

  function layerPeers(cfg, limit) {
    const sel = getSelectedCulture();
    if (!sel) return [];
    const peers = STATE.cultures.filter((c) => c.id !== sel.id && cfg.fn(c));
    peers.sort((a, b) => overlapScore(sel, b) - overlapScore(sel, a));
    return peers.slice(0, limit);
  }

  // ---------- Modes ----------
  function setMode(mode) {
    STATE.mode = mode;

    el.tabGlobe?.classList.toggle("active", mode === "globe");
    el.tabMap?.classList.toggle("active", mode === "map");
    el.tabSplit?.classList.toggle("active", mode === "split");

    el.container.classList.toggle("viz-mode-globe", mode === "globe");
    el.container.classList.toggle("viz-mode-map", mode === "map");
    el.container.classList.toggle("viz-mode-split", mode === "split");

    if (mode === "map" || mode === "split") ensureMapInit();

    resizeAll();
    scheduleGlobeRender();
    mapRender();
  }

  function setLens(lens) {
    STATE.lens = lens;

    el.lensButtons.forEach((b) => {
      const k = String(b.getAttribute("data-lens") || "all");
      b.classList.toggle("active", k === lens);
    });

    if (lens !== "all") {
      const targetKey = STATE.weave.order.find((k) => STATE.weave.presets.get(k)?.lens === lens);
      if (targetKey) setWeavePreset(targetKey, false);
    }

    scheduleGlobeRender();
    mapRender();
    const sel = getSelectedCulture();
    if (sel) updateCultureInfo(sel);
    renderGuide();
  }

  function syncLayerButtons() {
    el.layerButtons.forEach((b) => {
      const k = String(b.getAttribute("data-layer") || "");
      if (!k) return;
      if (k === "suggested") {
        b.classList.toggle("active", STATE.showSuggested);
        return;
      }
      b.classList.toggle("active", Boolean(STATE.layers[k]));
    });
  }

  function syncSuggestedButtons() {
    el.btnSuggestLinks?.classList.toggle("active", STATE.showSuggested);
    el.layerButtons
      ?.filter((b) => b.getAttribute("data-layer") === "suggested")
      .forEach((b) => b.classList.toggle("active", STATE.showSuggested));
  }

  // ==========================================================================
  // Globe — rotation control
  // stopGlobeTick sets autoRotate=false AND cancels the rAF.
  // tick() checks autoRotate as its FIRST action before rescheduling, so even
  // a stale callback that fires after cancelAnimationFrame exits without
  // restarting the loop.
  // ==========================================================================
  const GLOBE = {
    inited: false,
    svg: null,
    width: 0,
    height: 0,
    projection: null,
    path: null,
    rotate: [0, -20, 0],
    scale: 250,
    baseScale: 250,

    layers: {},
    nodesSel: null,
    labelsSel: null,

    pathSel: null,
    lensSel: null,
    threadLayerByKey: new Map(),

    linksSel: null,
    pulseSel: null,

    dragging: false,
    pointerId: null,
    last: null,

    autoRotate: false, // ← master flag; tick checks this FIRST
    tickRaf: null,
    zoomAnimRaf: null, // for zoom-in/out animation

    // New feature refs
    starCanvas: null,  // star field canvas element
    starCtx: null,
    stars: [],         // [{x,y,z,r,opacity}] in 3D unit-sphere coords
    starRaf: null,

    nightSel: null,    // day/night terminator overlay
    historyLayer: null,// visit history trail group
    glowLayer: null,   // region-colored glow ring group

    // Pinch-to-zoom state
    pointers: new Map(), // pointerId -> {x,y}
    pinchDist: null,     // last pinch distance
    raf: null,
    renderQueued: false,
  };

  function stopGlobeTick() {
    GLOBE.autoRotate = false;
    if (GLOBE.tickRaf !== null) {
      cancelAnimationFrame(GLOBE.tickRaf);
      GLOBE.tickRaf = null;
    }
  }

  function startGlobeTick() {
    if (GLOBE.autoRotate) return;     // already running
    if (prefersReducedMotion) return;
    if (STATE.selectedId) return;     // never start while a node is selected

    GLOBE.autoRotate = true;

    function tick() {
      // Exit WITHOUT rescheduling if stopped — handles the cancel race condition
      if (!GLOBE.autoRotate) {
        GLOBE.tickRaf = null;
        return;
      }
      if (!STATE.paused && !GLOBE.dragging &&
          (STATE.mode === "globe" || STATE.mode === "split")) {
        GLOBE.rotate[0] += 0.06;
        scheduleGlobeRender();
      }
      GLOBE.tickRaf = requestAnimationFrame(tick);
    }

    GLOBE.tickRaf = requestAnimationFrame(tick);
  }

  // ==========================================================================
  // Star field — canvas behind globe SVG, stars parallax with rotation
  // ==========================================================================
  function initStarField() {
    if (prefersReducedMotion) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;border-radius:14px;";
    // Insert before the SVG element
    el.globeSvg.parentElement?.insertBefore(canvas, el.globeSvg);
    el.globeSvg.style.position = "relative";
    el.globeSvg.style.zIndex = "1";

    GLOBE.starCanvas = canvas;
    GLOBE.starCtx = canvas.getContext("2d");

    // Generate stars as 3D unit-sphere points (for parallax)
    const N = IS_COARSE ? 180 : 320;
    GLOBE.stars = Array.from({ length: N }, () => {
      // Random point on unit sphere
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        r: Math.random() * 1.2 + 0.3,
        opacity: Math.random() * 0.55 + 0.25,
      };
    });

    drawStars();
  }

  function drawStars() {
    const canvas = GLOBE.starCanvas;
    const ctx = GLOBE.starCtx;
    if (!canvas || !ctx) return;

    // Size canvas to match SVG
    const w = GLOBE.width, h = GLOBE.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    // Rotation angles for parallax (use a fraction of globe rotation so stars
    // move subtly — not 1:1)
    const rx = (GLOBE.rotate[0] * Math.PI / 180) * 0.18;
    const ry = (GLOBE.rotate[1] * Math.PI / 180) * 0.18;
    const cosX = Math.cos(-ry), sinX = Math.sin(-ry);
    const cosY = Math.cos(rx), sinY = Math.sin(rx);

    const cx = w / 2, cy = h / 2;
    const spread = Math.min(w, h) * 0.62;

    for (const s of GLOBE.stars) {
      // Rotate 3D point
      let { x, y, z } = s;
      // Rotate around Y axis
      let x2 = x * cosY + z * sinY;
      const z2 = -x * sinY + z * cosY;
      x = x2;
      z = z2;
      // Rotate around X axis
      const y2 = y * cosX - z * sinX;
      const z3 = y * sinX + z * cosX;

      // Project to screen (simple orthographic)
      const sx = cx + x * spread;
      const sy = cy + y2 * spread;

      // Fade stars behind the globe (z3 < 0 means behind)
      const depthFade = z3 < -0.1 ? 0 : (z3 < 0.1 ? (z3 + 0.1) / 0.2 : 1);
      const op = s.opacity * depthFade;
      if (op < 0.04) continue;

      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${op.toFixed(2)})`;
      ctx.fill();
    }
  }

  // ==========================================================================
  // Day/night terminator
  // ==========================================================================
  function getSunPosition() {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    // Solar declination (degrees)
    const decl = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
    // Solar noon at 0° lon at UTC — approximate hour angle
    const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    const lon = -(utcHour - 12) * 15; // degrees west of noon
    return [lon, decl]; // [lon, lat] of sub-solar point
  }

  function renderNightOverlay() {
    if (!GLOBE.nightSel || !GLOBE.path) return;
    try {
      const [sunLon, sunLat] = getSunPosition();
      // Night side: great circle 90° from the anti-solar point
      const nightCircle = d3.geoCircle().center([sunLon + 180, -sunLat]).radius(90)();
      GLOBE.nightSel.attr("d", GLOBE.path(nightCircle)).attr("opacity", 1);
    } catch { GLOBE.nightSel.attr("opacity", 0); }
  }

  // ==========================================================================
  // Discover — random culture jump
  // ==========================================================================
  function discoverRandom() {
    const cultures = STATE.cultures;
    if (!cultures.length) return;
    const candidates = cultures.filter((c) => c.id !== STATE.selectedId);
    if (!candidates.length) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    selectCulture(pick.id, true);
  }

  function ensureGlobeInit() {
    if (GLOBE.inited) return;
    GLOBE.inited = true;

    GLOBE.svg = d3.select(el.globeSvg);
    globeResize();

    const defs = GLOBE.svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "oceanGradient").attr("cx", "35%").attr("cy", "30%").attr("r", "75%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#12304a");
    grad.append("stop").attr("offset", "55%").attr("stop-color", "#0b1b2e");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#050a12");

    const filt = defs.append("filter").attr("id", "sphereShadow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
    filt.append("feDropShadow").attr("dx", 0).attr("dy", 10).attr("stdDeviation", 10).attr("flood-color", "rgba(0,0,0,0.35)");

    // Clip night overlay to the sphere circle
    const clip = defs.append("clipPath").attr("id", "sphereClip");
    GLOBE._nightClipCircle = clip.append("circle")
      .attr("cx", GLOBE.width / 2).attr("cy", GLOBE.height / 2).attr("r", GLOBE.scale);

    GLOBE.projection = d3.geoOrthographic().clipAngle(90).translate([GLOBE.width / 2, GLOBE.height / 2]).scale(GLOBE.scale).rotate(GLOBE.rotate);
    GLOBE.path = d3.geoPath(GLOBE.projection);

    GLOBE.layers.sphere = GLOBE.svg.append("circle").attr("class", "sphere");

    // ── Star field canvas (behind everything, parallax with rotation) ──────
    initStarField();

    GLOBE.layers.land = GLOBE.svg.append("path").attr("class", "land").attr("pointer-events", "none");
    GLOBE.layers.countries = GLOBE.svg.append("g").attr("class", "countries");

    // ── Day/night hemisphere overlay ──────────────────────────────────────
    GLOBE.nightSel = GLOBE.svg.append("path")
      .attr("class", "cw-night-overlay")
      .attr("pointer-events", "none")
      .attr("fill", "rgba(5,10,25,0.38)")
      .attr("opacity", 0);

    GLOBE.layers.overlays = GLOBE.svg.append("g").attr("class", "cw-overlays");
    GLOBE.layers.links = GLOBE.svg.append("g").attr("class", "links");

    // ── Visit history trail ───────────────────────────────────────────────
    GLOBE.historyLayer = GLOBE.svg.append("g").attr("class", "cw-history-layer").attr("pointer-events", "none");

    GLOBE.layers.nodes = GLOBE.svg.append("g").attr("class", "nodes");
    GLOBE.layers.labels = GLOBE.svg.append("g").attr("class", "labels");

    // ── Region-colored glow ring (above everything) ───────────────────────
    GLOBE.glowLayer = GLOBE.svg.append("g").attr("class", "cw-glow-layer").attr("pointer-events", "none");

    GLOBE.svg.append("style").text(`
      .cw-weave-path{fill:none;stroke:rgba(255,215,0,.48);stroke-width:2.4;stroke-linecap:round;filter:drop-shadow(0 0 10px rgba(255,215,0,.12))}
      .cw-lens-arcs{fill:none;stroke:rgba(0,247,255,.22);stroke-width:2;stroke-linecap:round;stroke-dasharray:6 6;filter:drop-shadow(0 0 10px rgba(0,247,255,.06))}
      .cw-thread{fill:none;stroke-linecap:round;stroke-width:3;opacity:.85;filter:drop-shadow(0 0 10px rgba(0,0,0,.12))}
      .node-pulse{fill:none;stroke-width:2.2;animation:cw-pulse 2s ease-out infinite}
      @keyframes cw-pulse{0%{r:10;opacity:.9}70%{r:22;opacity:0}100%{r:10;opacity:0}}
      .cw-trail{transition:opacity .4s}
      .cw-night-overlay{clip-path:url(#sphereClip)}
    `);

    GLOBE.layers.land.datum(STATE.world.land);

    GLOBE.layers.countries
      .selectAll("path.country")
      .data(STATE.world.countries.features || [])
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("pointer-events", "none");

    GLOBE.lensSel = GLOBE.layers.overlays.append("path").attr("class", "cw-lens-arcs").attr("pointer-events", "none").attr("opacity", 0);
    GLOBE.pathSel = GLOBE.layers.overlays.append("path").attr("class", "cw-weave-path").attr("pointer-events", "none").attr("opacity", 0);

    for (const cfg of LAYER_THREAD_CONFIGS) {
      const g = GLOBE.layers.overlays
        .append("g")
        .attr("class", `cw-thread-layer cw-thread-layer--${cfg.key}`);
      GLOBE.threadLayerByKey.set(cfg.key, g);
    }

    updateGlobeLinksData();

    // Node radius: larger on mobile for easier tapping
    const nodeR = IS_COARSE ? 9 : 6;

    GLOBE.nodesSel = GLOBE.layers.nodes
      .selectAll("circle.node")
      .data(STATE.cultures, (d) => d.id)
      .enter()
      .append("circle")
      .attr("class", "node")
      .attr("r", nodeR)
      .attr("fill", (d) => nodeColor(d))
      .on("pointerenter", (event, d) => {
        if (isCoarsePointer()) return;
        STATE.hoverId = d.id;
        showTooltip(event, d);
        scheduleGlobeRender();
      })
      .on("pointermove", (event) => {
        if (isCoarsePointer()) return;
        moveTooltip(event);
      })
      .on("pointerleave", () => {
        if (isCoarsePointer()) return;
        STATE.hoverId = null;
        hideTooltip();
        scheduleGlobeRender();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        selectCulture(d.id, true);
      });

    GLOBE.pulseSel = GLOBE.glowLayer.append("circle")
      .attr("class", "node-pulse")
      .attr("r", IS_COARSE ? 14 : 10)
      .attr("fill", "none")
      .attr("stroke-width", "2.2")
      .style("display", "none");

    GLOBE.labelsSel = GLOBE.layers.labels
      .selectAll("text.node-label")
      .data(STATE.cultures, (d) => d.id)
      .enter()
      .append("text")
      .attr("class", "node-label")
      .attr("pointer-events", "auto")
      // Explicit SVG attributes — iOS Safari ignores CSS classes on SVG elements,
      // so everything needed to make text visible must be set here directly.
      .attr("fill", IS_COARSE ? "rgba(0,247,255,.95)" : "rgba(0,247,255,.88)")
      .attr("font-size", IS_COARSE ? "12" : "10")
      .attr("font-family", "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif")
      .attr("font-weight", IS_COARSE ? "600" : "400")
      .attr("stroke", "rgba(5,10,18,0.85)")
      .attr("stroke-width", IS_COARSE ? "3" : "2.5")
      .attr("stroke-linejoin", "round")
      .attr("paint-order", "stroke fill")
      .style("cursor", "pointer")
      .style("user-select", "none")
      .text((d) => d.name)
      .on("click", (event, d) => {
        event.stopPropagation();
        selectCulture(d.id, true);
      });

    // Click blank => clear selection
    el.globeSvg.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof Element && (t.closest("circle.node") || t.closest("text.node-label"))) return;
      setDeepLink(null);
      clearSelection();
    });

    el.globeSvg.addEventListener("pointerdown", onGlobePointerDown, { passive: true });
    el.globeSvg.addEventListener("pointermove", onGlobePointerMove, { passive: true });
    el.globeSvg.addEventListener("pointerup", onGlobePointerUp, { passive: true });
    el.globeSvg.addEventListener("pointercancel", onGlobePointerUp, { passive: true });
    el.globeSvg.addEventListener("lostpointercapture", onGlobePointerUp, { passive: true });

    startGlobeTick();
    scheduleGlobeRender();
  }

  function globeResize() {
    const rect = el.container.getBoundingClientRect();
    const stageH = Math.max(420, Math.min(640, Math.floor(window.innerHeight * 0.6)));

    GLOBE.width = Math.max(320, Math.floor(STATE.mode === "split" ? rect.width / 2 : rect.width));
    GLOBE.height = stageH;

    GLOBE.baseScale = Math.min(GLOBE.width, GLOBE.height) * 0.44;
    if (!Number.isFinite(GLOBE.scale) || GLOBE.scale <= 0) GLOBE.scale = GLOBE.baseScale;
    GLOBE.scale = clamp(GLOBE.scale, GLOBE.baseScale * 0.72, GLOBE.baseScale * 1.6);

    if (GLOBE.svg) {
      GLOBE.svg.attr("width", GLOBE.width).attr("height", GLOBE.height).attr("viewBox", `0 0 ${GLOBE.width} ${GLOBE.height}`).attr("preserveAspectRatio", "xMidYMid meet");
    }

    if (GLOBE.projection) {
      GLOBE.projection.translate([GLOBE.width / 2, GLOBE.height / 2]).scale(GLOBE.scale);
      GLOBE.layers.sphere.attr("cx", GLOBE.width / 2).attr("cy", GLOBE.height / 2).attr("r", GLOBE.scale);
    }

    // Resize star canvas to match
    if (GLOBE.starCanvas) {
      GLOBE.starCanvas.width = GLOBE.width;
      GLOBE.starCanvas.height = GLOBE.height;
      drawStars();
    }

    // Keep night overlay clip circle in sync
    if (GLOBE._nightClipCircle) {
      GLOBE._nightClipCircle
        .attr("cx", GLOBE.width / 2).attr("cy", GLOBE.height / 2).attr("r", GLOBE.scale);
    }
  }

  function onGlobePointerDown(e) {
    const t = e.target;
    if (t instanceof Element && (t.closest("circle.node") || t.closest("text.node-label"))) return;
    GLOBE.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.globeSvg.setPointerCapture?.(e.pointerId);

    if (GLOBE.pointers.size === 1) {
      // Single touch — standard drag
      GLOBE.dragging = true;
      GLOBE.pointerId = e.pointerId;
      GLOBE.last = { x: e.clientX, y: e.clientY };
    } else if (GLOBE.pointers.size === 2) {
      // Two-finger pinch begins — compute initial distance
      GLOBE.dragging = false;
      const pts = [...GLOBE.pointers.values()];
      GLOBE.pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  }

  function onGlobePointerMove(e) {
    if (!GLOBE.pointers.has(e.pointerId)) return;
    GLOBE.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (GLOBE.pointers.size === 2) {
      // Pinch — adjust zoom
      const pts = [...GLOBE.pointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (GLOBE.pinchDist !== null && dist > 0) {
        const factor = dist / GLOBE.pinchDist;
        GLOBE.scale = clamp(GLOBE.scale * factor, GLOBE.baseScale * 0.72, GLOBE.baseScale * 3.0);
        if (GLOBE.projection) GLOBE.projection.scale(GLOBE.scale);
        GLOBE.layers.sphere?.attr("r", GLOBE.scale);
      }
      GLOBE.pinchDist = dist;

      // Also rotate via midpoint delta
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (GLOBE.last) {
        GLOBE.rotate[0] += (mid.x - GLOBE.last.x) * 0.14;
        GLOBE.rotate[1] -= (mid.y - GLOBE.last.y) * 0.14;
        GLOBE.rotate[1] = clamp(GLOBE.rotate[1], -89, 89);
      }
      GLOBE.last = mid;
      scheduleGlobeRender();
      return;
    }

    if (!GLOBE.dragging || GLOBE.pointerId !== e.pointerId || !GLOBE.last) return;
    const dx = e.clientX - GLOBE.last.x;
    const dy = e.clientY - GLOBE.last.y;
    GLOBE.rotate[0] += dx * 0.18;
    GLOBE.rotate[1] -= dy * 0.18;
    GLOBE.rotate[1] = clamp(GLOBE.rotate[1], -89, 89);
    GLOBE.last = { x: e.clientX, y: e.clientY };
    scheduleGlobeRender();
  }

  function onGlobePointerUp(e) {
    GLOBE.pointers.delete(e.pointerId);
    if (GLOBE.pointers.size < 2) GLOBE.pinchDist = null;
    if (GLOBE.pointers.size === 0) {
      GLOBE.dragging = false;
      GLOBE.pointerId = null;
      GLOBE.last = null;
    } else if (GLOBE.pointers.size === 1) {
      // Back to single touch — re-init drag from remaining pointer
      const [id, pos] = [...GLOBE.pointers.entries()][0];
      GLOBE.dragging = true;
      GLOBE.pointerId = id;
      GLOBE.last = pos;
    }
  }

  function scheduleGlobeRender() {
    if (!GLOBE.inited) return;
    if (GLOBE.renderQueued) return;
    GLOBE.renderQueued = true;
    GLOBE.raf = requestAnimationFrame(() => {
      GLOBE.renderQueued = false;
      globeRender();
    });
  }

  function globeZoomBy(factor) {
    ensureGlobeInit();
    GLOBE.scale = clamp(GLOBE.scale * factor, GLOBE.baseScale * 0.72, GLOBE.baseScale * 1.6);
    globeResize();
    scheduleGlobeRender();
  }

  function geoVisible(lon, lat) {
    const p = GLOBE.projection([lon, lat]);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  }

  // Desktop-only label declutter — skip entirely on mobile so all names show
  function declutterLabels(selection, centerX, centerY) {
    if (IS_COARSE) return; // ← mobile: never hide labels

    const items = [];
    selection.each(function (d) {
      const node = this;
      const sel = d3.select(node);
      const op = Number(sel.attr("opacity") ?? "1");
      if (!Number.isFinite(op) || op <= 0) return;

      try {
        const bb = node.getBBox();
        const cx = bb.x + bb.width / 2;
        const cy = bb.y + bb.height / 2;
        const dist = Math.hypot(cx - centerX, cy - centerY);
        const pri = d.id === STATE.selectedId ? 1000 : d.id === STATE.hoverId ? 900 : 0;
        items.push({ node, bb, dist, pri });
      } catch {}
    });

    items.sort((a, b) => (b.pri - a.pri) || (a.dist - b.dist));

    const placed = [];
    const pad = 3;

    const overlap = (A, B) => !(A.x2 < B.x1 || A.x1 > B.x2 || A.y2 < B.y1 || A.y1 > B.y2);

    for (const it of items) {
      const bb = it.bb;
      const box = { x1: bb.x - pad, y1: bb.y - pad, x2: bb.x + bb.width + pad, y2: bb.y + bb.height + pad };
      const collides = placed.some((p) => overlap(box, p));
      if (collides && it.pri < 900) {
        d3.select(it.node).attr("opacity", 0).attr("pointer-events", "none");
      } else {
        placed.push(box);
        d3.select(it.node).attr("pointer-events", "auto");
      }
    }
  }

  function updateGlobeLinksData() {
    if (!GLOBE.inited) return;
    const data = allLinks();
    GLOBE.linksSel = GLOBE.layers.links
      .selectAll("path.connection-path")
      .data(data, (d) => `${d.source.id}__${d.target.id}__${d._kind}`)
      .join(
        (enter) => enter.append("path").attr("class", (d) => `connection-path ${d._kind === "suggested" ? "suggested" : ""}`).attr("pointer-events", "none"),
        (update) => update,
        (exit) => exit.remove(),
      );
  }

  function globeRender() {
    if (!GLOBE.projection || !GLOBE.path) return;

    GLOBE.projection.rotate(GLOBE.rotate).scale(GLOBE.scale);

    GLOBE.layers.sphere.attr("cx", GLOBE.width / 2).attr("cy", GLOBE.height / 2).attr("r", GLOBE.scale);
    GLOBE.layers.land.attr("d", GLOBE.path);
    GLOBE.layers.countries.selectAll("path.country").attr("d", GLOBE.path);

    // ── Star field parallax redraw ─────────────────────────────────────────
    drawStars();

    // ── Day/night overlay ─────────────────────────────────────────────────
    renderNightOverlay();

    const sel = getSelectedCulture();
    const lens = STATE.lens;
    const zoomRatio = GLOBE.scale / (GLOBE.baseScale || 1);

    // Lens highlight arcs
    if (lens !== "all") {
      const lensLinks = getLensLinks(lens).filter((l) => geoVisible(l.source.lon, l.source.lat) && geoVisible(l.target.lon, l.target.lat));
      const pairs = lensLinks.slice(0, 40).map((l) => [l.source, l.target]);
      const d = multiArcPath(GLOBE.projection, pairs);
      GLOBE.lensSel.attr("d", d).attr("opacity", pairs.length ? 1 : 0);
    } else {
      GLOBE.lensSel.attr("d", "").attr("opacity", 0);
    }

    // Weave Path overlay — with animated draw on path change
    if (STATE.layers.paths) {
      const stops = getWeaveStops().filter((c) => geoVisible(c.lon, c.lat));
      const pairs = [];
      for (let i = 0; i < stops.length - 1; i++) pairs.push([stops[i], stops[i + 1]]);
      const d = multiArcPath(GLOBE.projection, pairs);
      const prevD = GLOBE.pathSel.attr("d");
      GLOBE.pathSel.attr("d", d).attr("opacity", pairs.length ? 1 : 0);
      if (d && d !== prevD && !prefersReducedMotion) {
        try {
          const len = GLOBE.pathSel.node()?.getTotalLength?.() || 0;
          if (len > 0) {
            GLOBE.pathSel
              .attr("stroke-dasharray", len)
              .attr("stroke-dashoffset", len)
              .transition().duration(900).ease(d3.easeQuadOut)
              .attr("stroke-dashoffset", 0)
              .on("end", () => GLOBE.pathSel.attr("stroke-dasharray", null).attr("stroke-dashoffset", null));
          }
        } catch {}
      }
    } else {
      GLOBE.pathSel.attr("d", "").attr("opacity", 0);
    }

    // Layer threads — fade in on enter, fade out on exit
    for (const cfg of LAYER_THREAD_CONFIGS) {
      const layer = GLOBE.threadLayerByKey.get(cfg.key);
      if (!layer) continue;

      const on = Boolean(STATE.layers[cfg.key]);
      const data = on && sel && geoVisible(sel.lon, sel.lat)
        ? buildLayerLinkData(cfg, 10).filter((d) => geoVisible(d.target.lon, d.target.lat))
        : [];

      const merged = layer.selectAll("path.cw-thread-link")
        .data(data, (d) => `${cfg.key}__${d.source.id}__${d.target.id}`)
        .join(
          (enter) => enter.append("path")
            .attr("class", `cw-thread cw-thread-link cw-thread--${cfg.key}`)
            .attr("stroke", cfg.stroke).attr("stroke-dasharray", cfg.dash || null)
            .attr("opacity", 0).call((s) => s.transition().duration(400).attr("opacity", 0.85)),
          (update) => update,
          (exit) => exit.transition().duration(250).attr("opacity", 0).remove(),
        );

      merged.attr("d", (d) => arcPath(GLOBE.projection, d.source, d.target)).attr("opacity", 0.85);
      wireHoverablePathSelection(merged);
    }

    // ── Visit history trail ───────────────────────────────────────────────
    if (GLOBE.historyLayer) {
      const total = STATE.visitedIds.length;
      const histData = STATE.visitedIds
        .map((id, i) => ({ c: STATE.byId.get(id), age: i }))
        .filter(({ c }) => c && geoVisible(c.lon, c.lat) && c.id !== STATE.selectedId);

      GLOBE.historyLayer.selectAll("circle.cw-trail")
        .data(histData, ({ c }) => c.id)
        .join(
          (enter) => enter.append("circle").attr("class", "cw-trail").attr("pointer-events", "none"),
          (update) => update, (exit) => exit.remove(),
        )
        .attr("cx", ({ c }) => (GLOBE.projection([c.lon, c.lat]) || [NaN, NaN])[0])
        .attr("cy", ({ c }) => (GLOBE.projection([c.lon, c.lat]) || [NaN, NaN])[1])
        .attr("r", 3.5)
        .attr("fill", ({ c }) => nodeColor(c))
        .attr("opacity", ({ age }) => clamp(0.08 + (age / Math.max(total, 1)) * 0.38, 0.08, 0.45))
        .attr("stroke", "rgba(255,255,255,.18)").attr("stroke-width", "0.8");
    }

    // Nodes — cull back-hemisphere with visibility:hidden to skip paint
    GLOBE.nodesSel
      .attr("cx", (d) => (GLOBE.projection([d.lon, d.lat]) || [NaN, NaN])[0])
      .attr("cy", (d) => (GLOBE.projection([d.lon, d.lat]) || [NaN, NaN])[1])
      .attr("visibility", (d) => globeFacingOpacity(d.lon, d.lat) <= 0 ? "hidden" : null)
      .attr("opacity", (d) => {
        if (!geoVisible(d.lon, d.lat)) return 0;
        const face = globeFacingOpacity(d.lon, d.lat);
        if (lens !== "all" && !cultureMatchesLens(d) && d.id !== STATE.selectedId && d.id !== STATE.hoverId)
          return Math.max(0.16, face * 0.34);
        return face;
      })
      .classed("is-selected", (d) => d.id === STATE.selectedId);

    // Labels — LOD: show all when zoomed in ≥1.35×, size scales with zoom
    const allow = new Set();
    if (STATE.selectedId) allow.add(STATE.selectedId);
    if (STATE.hoverId) allow.add(STATE.hoverId);

    const lodShowAll = IS_COARSE || zoomRatio >= 1.35;
    const labelSize = IS_COARSE ? 12 : clamp(Math.round(10 * Math.min(zoomRatio, 2.0)), 10, 14);

    GLOBE.labelsSel
      .attr("x", (d) => (GLOBE.projection([d.lon, d.lat]) || [NaN, NaN])[0] + (IS_COARSE ? 11 : 9))
      .attr("y", (d) => (GLOBE.projection([d.lon, d.lat]) || [NaN, NaN])[1] + 4)
      .attr("font-size", labelSize)
      .attr("fill", (d) => {
        if (d.id === STATE.selectedId) return "rgba(255,215,0,.98)";
        if (d.id === STATE.hoverId)    return "rgba(255,255,255,.98)";
        return IS_COARSE ? "rgba(0,247,255,.95)" : "rgba(0,247,255,.88)";
      })
      .attr("font-weight", (d) => {
        if (d.id === STATE.selectedId) return IS_COARSE ? "700" : "600";
        return IS_COARSE ? "600" : "400";
      })
      .attr("visibility", (d) => globeFacingOpacity(d.lon, d.lat) <= 0 ? "hidden" : null)
      .attr("opacity", (d) => {
        if (!geoVisible(d.lon, d.lat)) return 0;
        const face = globeFacingOpacity(d.lon, d.lat);
        if (lodShowAll) {
          if (lens !== "all" && !cultureMatchesLens(d) && d.id !== STATE.selectedId && d.id !== STATE.hoverId)
            return Math.max(0.08, face * 0.3);
          return face;
        }
        if (!STATE.showLabels) return allow.has(d.id) ? Math.max(0.8, face) : 0;
        if (allow.has(d.id)) return Math.max(0.9, face);
        if (lens !== "all" && !cultureMatchesLens(d)) return Math.max(0.08, face * 0.26);
        return face;
      });

    if (STATE.showLabels || IS_COARSE) {
      declutterLabels(GLOBE.labelsSel, GLOBE.width / 2, GLOBE.height / 2);
    }

    // Connection lines
    const showLinks = STATE.showConnections && (STATE.mode === "globe" || STATE.mode === "split");
    GLOBE.linksSel
      .attr("d", (l) => arcPath(GLOBE.projection, l.source, l.target))
      .attr("opacity", (l) => {
        if (!showLinks) return 0;
        if (sel) {
          const hit = l.source.id === sel.id || l.target.id === sel.id;
          if (hit) return l._kind === "suggested" ? 0.45 : 0.95;
          return l._kind === "suggested" ? 0.02 : 0.06;
        }
        return l._kind === "suggested" ? 0.06 : 0.18;
      });

    // ── Region-colored glow ring ──────────────────────────────────────────
    if (sel && geoVisible(sel.lon, sel.lat)) {
      const p = GLOBE.projection([sel.lon, sel.lat]);
      const regionColor = nodeColor(sel);
      GLOBE.pulseSel
        .style("display", null)
        .attr("cx", p[0]).attr("cy", p[1])
        .attr("stroke", regionColor)
        .attr("filter", `drop-shadow(0 0 8px ${regionColor})`);
    } else {
      GLOBE.pulseSel.style("display", "none");
    }
  }

  // ---------- Map ----------
  const MAP = {
    inited: false,
    svg: null,
    root: null,
    width: 0,
    height: 0,
    projection: null,
    path: null,
    zoom: null,
    transform: d3.zoomIdentity,

    layers: {},
    nodesSel: null,
    labelsSel: null,

    pathSel: null,
    lensSel: null,
    threadLayerByKey: new Map(),

    linksSel: null,
  };

  function ensureMapInit() {
    if (MAP.inited) return;
    MAP.inited = true;

    MAP.svg = d3.select(el.mapDiv).append("svg").attr("aria-label", "2D world map");
    MAP.root = MAP.svg.append("g").attr("class", "map-root");

    MAP.layers.land = MAP.root.append("path").attr("class", "land");
    MAP.layers.countries = MAP.root.append("g").attr("class", "countries");
    MAP.layers.overlays = MAP.root.append("g").attr("class", "cw-overlays");
    MAP.layers.links = MAP.root.append("g").attr("class", "links");
    MAP.layers.nodes = MAP.root.append("g").attr("class", "nodes");
    MAP.layers.labels = MAP.root.append("g").attr("class", "labels");

    mapResize();

    MAP.projection = d3.geoMercator().translate([MAP.width / 2, MAP.height / 2]).scale(mapBaseScale());
    MAP.path = d3.geoPath(MAP.projection);

    MAP.svg.append("style").text(`
      .cw-weave-path{fill:none;stroke:rgba(255,215,0,.28);stroke-width:2.2;stroke-linecap:round;filter:drop-shadow(0 0 10px rgba(255,215,0,.10))}
      .cw-lens-arcs{fill:none;stroke:rgba(0,247,255,.16);stroke-width:2;stroke-linecap:round;stroke-dasharray:6 6;filter:drop-shadow(0 0 10px rgba(0,247,255,.05))}
      .cw-thread{fill:none;stroke-linecap:round;stroke-width:3;opacity:.75;filter:drop-shadow(0 0 10px rgba(0,0,0,.10))}
    `);

    MAP.layers.land.datum(STATE.world.land).attr("pointer-events", "none");
    MAP.layers.countries
      .selectAll("path.country")
      .data(STATE.world.countries.features || [])
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("pointer-events", "none");

    MAP.lensSel = MAP.layers.overlays.append("path").attr("class", "cw-lens-arcs").attr("pointer-events", "none").attr("opacity", 0);
    MAP.pathSel = MAP.layers.overlays.append("path").attr("class", "cw-weave-path").attr("pointer-events", "none").attr("opacity", 0);

    for (const cfg of LAYER_THREAD_CONFIGS) {
      const g = MAP.layers.overlays
        .append("g")
        .attr("class", `cw-thread-layer cw-thread-layer--${cfg.key}`);
      MAP.threadLayerByKey.set(cfg.key, g);
    }

    updateMapLinksData();

    // Larger tap targets on mobile
    const mapNodeR = IS_COARSE ? 8 : 5;

    MAP.nodesSel = MAP.layers.nodes
      .selectAll("circle.node")
      .data(STATE.cultures, (d) => d.id)
      .enter()
      .append("circle")
      .attr("class", "node")
      .attr("r", mapNodeR)
      .attr("fill", (d) => nodeColor(d))
      .on("click", (event, d) => {
        event.stopPropagation();
        selectCulture(d.id, true);
      });

    MAP.labelsSel = MAP.layers.labels
      .selectAll("text.node-label")
      .data(STATE.cultures, (d) => d.id)
      .enter()
      .append("text")
      .attr("class", "node-label")
      .attr("pointer-events", "auto")
      // Explicit SVG attributes — iOS Safari ignores CSS classes on SVG elements
      .attr("fill", IS_COARSE ? "rgba(0,247,255,.95)" : "rgba(0,247,255,.88)")
      .attr("font-size", IS_COARSE ? "12" : "10")
      .attr("font-family", "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif")
      .attr("font-weight", IS_COARSE ? "600" : "400")
      .attr("stroke", "rgba(5,10,18,0.85)")
      .attr("stroke-width", IS_COARSE ? "3" : "2.5")
      .attr("stroke-linejoin", "round")
      .attr("paint-order", "stroke fill")
      .style("cursor", "pointer")
      .style("user-select", "none")
      .text((d) => d.name)
      .on("click", (event, d) => {
        event.stopPropagation();
        selectCulture(d.id, true);
      });

    MAP.zoom = d3.zoom().scaleExtent([0.8, 8]).on("zoom", (event) => {
      MAP.transform = event.transform;
      MAP.root.attr("transform", MAP.transform);
    });

    MAP.svg.call(MAP.zoom);

    // Blank click => clear selection
    MAP.svg.on("click", () => {
      setDeepLink(null);
      clearSelection();
    });

    mapRender();
  }

  function updateMapLinksData() {
    if (!MAP.inited) return;
    const data = allLinks();
    MAP.linksSel = MAP.layers.links
      .selectAll("path.connection-path")
      .data(data, (d) => `${d.source.id}__${d.target.id}__${d._kind}`)
      .join(
        (enter) => enter.append("path").attr("class", (d) => `connection-path ${d._kind === "suggested" ? "suggested" : ""}`).attr("pointer-events", "none"),
        (update) => update,
        (exit) => exit.remove(),
      );
  }

  function mapResize() {
    const rect = el.container.getBoundingClientRect();
    const stageH = Math.max(420, Math.min(640, Math.floor(window.innerHeight * 0.6)));

    MAP.width = Math.max(320, Math.floor(STATE.mode === "split" ? rect.width / 2 : rect.width));
    MAP.height = stageH;

    if (MAP.svg) {
      MAP.svg.attr("width", MAP.width).attr("height", MAP.height).attr("viewBox", `0 0 ${MAP.width} ${MAP.height}`).attr("preserveAspectRatio", "xMidYMid meet");
    }

    if (MAP.projection) {
      MAP.projection.translate([MAP.width / 2, MAP.height / 2]).scale(mapBaseScale());
    }
  }

  function mapBaseScale() {
    return Math.max(120, Math.min(720, MAP.width * 0.19));
  }

  function resetMapView() {
    if (!MAP.inited) return;
    MAP.transform = d3.zoomIdentity;
    MAP.svg.transition().duration(450).call(MAP.zoom.transform, MAP.transform);
  }

  function mapArcPath(a, b) {
    const pa = MAP.projection([a.lon, a.lat]);
    const pb = MAP.projection([b.lon, b.lat]);
    if (!pa || !pb) return "";
    const mx = (pa[0] + pb[0]) / 2;
    const my = (pa[1] + pb[1]) / 2;
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const dist = Math.hypot(dx, dy);
    const lift = clamp(dist * 0.18, 10, 80);
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
    const cx = mx + nx * lift;
    const cy = my + ny * lift;
    return `M${pa[0]},${pa[1]} Q${cx},${cy} ${pb[0]},${pb[1]}`;
  }

  function mapMultiArc(pairs) {
    return pairs.map(([a, b]) => mapArcPath(a, b)).filter(Boolean).join(" ");
  }

  function mapRender() {
    if (!MAP.inited || !MAP.projection || !MAP.path) return;

    MAP.layers.land.attr("d", MAP.path);
    MAP.layers.countries.selectAll("path.country").attr("d", MAP.path);

    const sel = getSelectedCulture();
    const lens = STATE.lens;

    // Lens highlight arcs
    if (lens !== "all") {
      const lensLinks = getLensLinks(lens);
      const pairs = lensLinks.slice(0, 50).map((l) => [l.source, l.target]);
      MAP.lensSel.attr("d", mapMultiArc(pairs)).attr("opacity", pairs.length ? 1 : 0);
    } else {
      MAP.lensSel.attr("d", "").attr("opacity", 0);
    }

    // Weave Path overlay
    if (STATE.layers.paths) {
      const stops = getWeaveStops();
      const pairs = [];
      for (let i = 0; i < stops.length - 1; i++) pairs.push([stops[i], stops[i + 1]]);
      MAP.pathSel.attr("d", mapMultiArc(pairs)).attr("opacity", pairs.length ? 1 : 0);
    } else {
      MAP.pathSel.attr("d", "").attr("opacity", 0);
    }

    // Layer threads
    for (const cfg of LAYER_THREAD_CONFIGS) {
      const layer = MAP.threadLayerByKey.get(cfg.key);
      if (!layer) continue;

      const on = Boolean(STATE.layers[cfg.key]);
      const data = on && sel ? buildLayerLinkData(cfg, 10) : [];

      const paths = layer
        .selectAll("path.cw-thread-link")
        .data(data, (d) => `${cfg.key}__${d.source.id}__${d.target.id}`);

      const merged = paths.join(
        (enter) =>
          enter
            .append("path")
            .attr("class", `cw-thread cw-thread-link cw-thread--${cfg.key}`)
            .attr("stroke", cfg.stroke)
            .attr("stroke-dasharray", cfg.dash || null),
        (update) => update,
        (exit) => exit.remove(),
      );

      merged
        .attr("d", (d) => mapArcPath(d.source, d.target))
        .attr("opacity", 0.75);

      wireHoverablePathSelection(merged);
    }

    MAP.nodesSel
      .attr("cx", (d) => (MAP.projection([d.lon, d.lat]) || [NaN, NaN])[0])
      .attr("cy", (d) => (MAP.projection([d.lon, d.lat]) || [NaN, NaN])[1])
      .attr("opacity", (d) => {
        if (lens !== "all" && !cultureMatchesLens(d) && d.id !== STATE.selectedId && d.id !== STATE.hoverId) return 0.28;
        return 1;
      })
      .classed("is-selected", (d) => d.id === STATE.selectedId);

    const allow = new Set();
    if (STATE.selectedId) allow.add(STATE.selectedId);
    if (STATE.hoverId) allow.add(STATE.hoverId);

    MAP.labelsSel
      .attr("x", (d) => (MAP.projection([d.lon, d.lat]) || [NaN, NaN])[0] + (IS_COARSE ? 10 : 8))
      .attr("y", (d) => (MAP.projection([d.lon, d.lat]) || [NaN, NaN])[1] + 3)
      // Color: gold for selected, bright white for hovered, cyan for rest
      .attr("fill", (d) => {
        if (d.id === STATE.selectedId) return "rgba(255,215,0,.98)";
        if (d.id === STATE.hoverId)    return "rgba(255,255,255,.98)";
        return IS_COARSE ? "rgba(0,247,255,.95)" : "rgba(0,247,255,.88)";
      })
      .attr("font-weight", (d) => d.id === STATE.selectedId ? (IS_COARSE ? "700" : "600") : (IS_COARSE ? "600" : "400"))
      .attr("opacity", (d) => {
        // Mobile: always show labels
        if (IS_COARSE) {
          if (lens !== "all" && !cultureMatchesLens(d) && d.id !== STATE.selectedId) return 0.35;
          return 1;
        }
        // Desktop
        if (!STATE.showLabels) return allow.has(d.id) ? 1 : 0;
        if (lens !== "all" && !cultureMatchesLens(d) && !allow.has(d.id)) return 0.22;
        return 1;
      });

    // Base connections
    const showLinks = STATE.showMapConnections && (STATE.mode === "map" || STATE.mode === "split");
    MAP.linksSel
      .attr("d", (l) => mapArcPath(l.source, l.target))
      .attr("opacity", (l) => {
        if (!showLinks) return 0;
        if (sel) {
          const hit = l.source.id === sel.id || l.target.id === sel.id;
          if (hit) return l._kind === "suggested" ? 0.35 : 0.85;
          return l._kind === "suggested" ? 0.01 : 0.05;
        }
        return l._kind === "suggested" ? 0.04 : 0.18;
      });
  }

  // ---------- Wiring ----------
  function wireNavToggle() {
    const toggle = document.getElementById("mobile-menu-toggle");
    const links = document.getElementById("nav-links");
    if (!toggle || !links) return;

    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.innerHTML = open ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-bars"></i>';
    });

    links.querySelectorAll("a.nav-link").forEach((a) => {
      a.addEventListener("click", () => links.classList.remove("is-open"));
    });
  }

  function wireModeTabs() {
    el.tabGlobe?.addEventListener("click", () => setMode("globe"));
    el.tabMap?.addEventListener("click", () => setMode("map"));
    el.tabSplit?.addEventListener("click", () => setMode("split"));
  }

  function wireLenses() {
    el.lensButtons.forEach((b) => {
      b.addEventListener("click", () => setLens(String(b.getAttribute("data-lens") || "all")));
    });
  }

  function wireLayers() {
    el.layerButtons.forEach((b) => {
      b.addEventListener("click", () => {
        const k = String(b.getAttribute("data-layer") || "");
        if (!k) return;

        if (k === "suggested") {
          STATE.showSuggested = !STATE.showSuggested;
          if (STATE.showSuggested && !STATE.linksSuggested.length) STATE.linksSuggested = buildSuggestedLinks();
          syncSuggestedButtons();
          updateGlobeLinksData();
          updateMapLinksData();
          scheduleGlobeRender();
          mapRender();
          renderGuide();
          return;
        }

        STATE.layers[k] = !STATE.layers[k];
        syncLayerButtons();

        // immediate clear when off
        if (!STATE.layers[k]) {
          if (k === "paths") {
            if (GLOBE.inited) GLOBE.pathSel?.attr("d", "").attr("opacity", 0);
            if (MAP.inited) MAP.pathSel?.attr("d", "").attr("opacity", 0);
          } else {
            if (GLOBE.inited) GLOBE.threadLayerByKey.get(k)?.selectAll("path.cw-thread-link").remove();
            if (MAP.inited) MAP.threadLayerByKey.get(k)?.selectAll("path.cw-thread-link").remove();
          }
        }

        scheduleGlobeRender();
        mapRender();
        renderGuide();
      });
    });

    el.toggleLayerLegend?.addEventListener("click", () => toggleGuide());
  }

  function wireControls() {
    el.zoomIn?.addEventListener("click", () => globeZoomBy(1.12));
    el.zoomOut?.addEventListener("click", () => globeZoomBy(1 / 1.12));
    el.resetView?.addEventListener("click", () => {
      ensureGlobeInit();
      GLOBE.rotate = [0, -20, 0];
      GLOBE.scale = GLOBE.baseScale;
      globeResize();
      scheduleGlobeRender();
      if (MAP.inited) resetMapView();
    });

    el.toggleConnections?.addEventListener("click", () => {
      STATE.showConnections = !STATE.showConnections;
      el.toggleConnections?.classList.toggle("active", STATE.showConnections);
      scheduleGlobeRender();
    });

    el.toggleLabels?.addEventListener("click", () => {
      STATE.showLabels = !STATE.showLabels;
      el.toggleLabels?.classList.toggle("active", STATE.showLabels);
      scheduleGlobeRender();
      mapRender();
    });

    el.toggleMapConnections?.addEventListener("click", () => {
      STATE.showMapConnections = !STATE.showMapConnections;
      el.toggleMapConnections?.classList.toggle("active", STATE.showMapConnections);
      mapRender();
    });

    el.btnResetMap?.addEventListener("click", () => {
      ensureMapInit();
      resetMapView();
    });

    el.btnCopyLink?.addEventListener("click", () => copyDeepLink());

    el.btnSuggestLinks?.addEventListener("click", () => {
      STATE.showSuggested = !STATE.showSuggested;
      if (STATE.showSuggested && !STATE.linksSuggested.length) STATE.linksSuggested = buildSuggestedLinks();
      syncSuggestedButtons();
      updateGlobeLinksData();
      updateMapLinksData();
      scheduleGlobeRender();
      mapRender();
      renderGuide();
    });

    el.btnDownloadSuggestions?.addEventListener("click", () => {
      if (!STATE.linksSuggested.length) return;
      const blob = new Blob([JSON.stringify(STATE.linksSuggested, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "suggested-links.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // ESC clears selection
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        setDeepLink(null);
        clearSelection();
      }
    });

    // Discover button — inject into toolbar if not in HTML, then wire
    let btnDiscover = document.getElementById("btnDiscover");
    if (!btnDiscover) {
      btnDiscover = document.createElement("button");
      btnDiscover.id = "btnDiscover";
      btnDiscover.type = "button";
      btnDiscover.className = "globe-control";
      btnDiscover.title = "Discover a random culture";
      btnDiscover.innerHTML = '<i class="fas fa-dice"></i>';
      btnDiscover.style.cssText = "background:rgba(157,0,255,.12);border-color:rgba(157,0,255,.35);";
      // Insert next to resetView
      el.resetView?.insertAdjacentElement("afterend", btnDiscover);
    }
    btnDiscover.addEventListener("click", () => discoverRandom());
  }

  function wireWeavePaths() {
    el.weavePreset?.addEventListener("change", () => setWeavePreset(String(el.weavePreset.value || ""), false));
    el.weavePrev?.addEventListener("click", () => weavePrev());
    el.weaveNext?.addEventListener("click", () => weaveNext());
    el.weaveShuffle?.addEventListener("click", () => weaveShuffle());
    el.weaveAuto?.addEventListener("click", () => setWeaveAuto(!STATE.weave.auto));
  }

  // ---------- Resize ----------
  function resizeAll() {
    ensureGlobeInit();
    globeResize();
    scheduleGlobeRender();

    if (STATE.mode === "map" || STATE.mode === "split") {
      ensureMapInit();
      mapResize();
      mapRender();
    }
  }
  window.addEventListener("resize", () => resizeAll(), { passive: true });

  // ---------- Init ----------
  async function init() {
    await loadAll();

    ensureGlobeInit();
    ensureMapInit();

    wireNavToggle();
    wireModeTabs();
    wireLenses();
    wireLayers();
    wireControls();
    wireWeavePaths();
    wireCultureCardToggles();

    syncLayerButtons();
    syncSuggestedButtons();

    try {
      const u = new URL(window.location.href);
      const id = u.searchParams.get("c");
      if (id && STATE.byId.has(id)) selectCulture(id, false);
      else setDetailsDefault();
    } catch {
      setDetailsDefault();
    }

    // Default lens guide content
    renderGuide();

    // Default mode
    setMode("globe");
    resizeAll();
    renderWeavePanel();
  }

  init().catch((err) => console.error("[Cosmic Weave] init failed:", err));
})();