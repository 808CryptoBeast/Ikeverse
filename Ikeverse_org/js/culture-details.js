/* =========================================================
   culture-details.js
   Loads ./docs/cultures.json + ./docs/culture-comparisons.json
   Renders desktop details panel + mobile bottom sheet
   Syncs with globe selection
   ========================================================= */

(() => {
  const BASE_DATA_URL = "./docs/cultures.json";
  const OVERLAY_DATA_URL = "./docs/culture-comparison.json";
  const MOBILE_BP = 900;

  const state = {
    cultures: [],
    cultureMap: new Map(),
    selectedId: null,
    loaded: false
  };

  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  function esc(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  async function loadJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return res.json();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function deriveShortLabel(culture) {
    const map = {
      kanaka_kumulipo: "KUMULIPO",
      kemet: "KEMET",
      maori: "MĀORI",
      samoa: "SĀMOA",
      taino: "TAÍNO",
      polynesia: "POLYNESIA",
      tonga: "TONGA",
      marquesas: "MARQUESAS"
    };

    if (map[culture.id]) return map[culture.id];
    return String(culture.name || culture.id || "")
      .split("(")[0]
      .replace(/—.*$/u, "")
      .trim()
      .toUpperCase();
  }

  function mergeCultures(baseData, overlayData) {
    const baseCultures = asArray(baseData?.cultures);
    const overlayCultures = asArray(overlayData?.cultures);
    const overlayMap = new Map(overlayCultures.map(item => [item.id, item]));

    return baseCultures.map(base => {
      const overlay = overlayMap.get(base.id) || {};
      return {
        ...base,
        ...overlay,
        namedConcepts: asArray(overlay.namedConcepts),
        comparativeParallels: asArray(overlay.comparativeParallels),
        readingLinks: asArray(overlay.readingLinks),
        shortLabel: overlay.shortLabel || deriveShortLabel(base),
        priorityLabel: overlay.priorityLabel ?? false,
        mobileSummary: overlay.mobileSummary || base.desc || ""
      };
    });
  }

  function getDetailsPanel() {
    let panel =
      document.querySelector("#cultureDetails") ||
      document.querySelector("#culturalDetails") ||
      document.querySelector(".culture-details-panel");

    if (panel) return panel;

    panel = document.createElement("aside");
    panel.id = "cultureDetails";
    panel.className = "culture-details-panel";
    panel.innerHTML = `
      <div class="culture-details-empty">
        <h3>Cultural Details</h3>
        <p>Select a culture from the globe or a card to explore its creation story, principles, named concepts, and comparative bridges.</p>
      </div>
    `;

    const target =
      document.querySelector(".nodes-section") ||
      document.querySelector(".galaxy-section") ||
      document.querySelector("main");

    if (target?.parentNode) {
      target.parentNode.insertBefore(panel, target.nextSibling);
    } else {
      document.body.appendChild(panel);
    }

    return panel;
  }

  function getMobilePanel() {
    let panel = document.querySelector(".culture-mobile-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.className = "culture-mobile-panel";
    panel.innerHTML = `
      <div class="culture-mobile-panel__grabber"></div>
      <div class="culture-mobile-panel__content"></div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function renderList(items, className = "") {
    const arr = asArray(items);
    if (!arr.length) return "";
    return `
      <ul class="${className}">
        ${arr.map(item => `<li>${esc(item)}</li>`).join("")}
      </ul>
    `;
  }

  function renderNamedConcepts(items) {
    const arr = asArray(items);
    if (!arr.length) return "";

    return `
      <section class="culture-section">
        <h4>Named Concepts</h4>
        <div class="culture-concepts-grid">
          ${arr.map(item => `
            <article class="culture-concept-card">
              <div class="culture-concept-card__head">
                <h5>${esc(item.name)}</h5>
                ${item.kind ? `<span class="culture-chip">${esc(item.kind)}</span>` : ""}
              </div>
              <p>${esc(item.desc)}</p>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderParallels(items) {
    const arr = asArray(items);
    if (!arr.length) return "";

    return `
      <section class="culture-section">
        <h4>Comparative Parallels</h4>
        <div class="culture-parallel-grid">
          ${arr.map(item => `
            <article class="culture-parallel-card">
              <div class="culture-parallel-card__head">
                <h5>${esc(item.concept)}</h5>
                <span class="culture-chip">${esc(item.cultureName)}</span>
              </div>
              <p>${esc(item.relation)}</p>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderReadingLinks(items) {
    const arr = asArray(items);
    if (!arr.length) return "";

    return `
      <section class="culture-section">
        <h4>Reading Links</h4>
        <div class="culture-links">
          ${arr.map(item => `
            <a class="culture-link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
              <strong>${esc(item.title)}</strong>
              ${item.kind ? `<span class="culture-chip">${esc(item.kind)}</span>` : ""}
              ${item.desc ? `<p>${esc(item.desc)}</p>` : ""}
            </a>
          `).join("")}
        </div>
      </section>
    `;
  }



  function renderSection(title, items) {
    const arr = asArray(items);
    if (!arr.length) return "";
    return `
      <section class="culture-section">
        <h4>${esc(title)}</h4>
        ${renderList(arr, "culture-bullet-list")}
      </section>
    `;
  }

  function renderKeyTerms(items) {
    const arr = asArray(items);
    if (!arr.length) return "";
    return `
      <section class="culture-section">
        <h4>Key Terms</h4>
        <div class="culture-chip-row">
          ${arr.map(item => `<span class="culture-chip">${esc(item)}</span>`).join("")}
        </div>
      </section>
    `;
  }
  function renderCulture(culture) {
    if (!culture) return;

    const panel = getDetailsPanel();
    const mobile = getMobilePanel();

    const html = `
      <div class="culture-details-panel__inner">
        <header class="culture-header">
          <div class="culture-header__symbol">${esc(culture.symbol || "✦")}</div>
          <div class="culture-header__meta">
            <h3>${esc(culture.name)}</h3>
            <p class="culture-subline">
              <span>${esc(culture.location || "")}</span>
              ${culture.era ? `<span>• ${esc(culture.era)}</span>` : ""}
            </p>
          </div>
        </header>

        <section class="culture-section">
          <h4>Overview</h4>
          <p>${esc(culture.desc || culture.mobileSummary || "")}</p>
        </section>

        ${renderKeyTerms(culture.keyTerms)}
        ${renderSection("Creation Stories", culture.creationStories)}
        ${renderSection("Core Principles", culture.corePrinciples)}
        ${renderSection("Agriculture & Food Systems", culture.agricultureSystems)}
        ${renderSection("Movement & Exchange", culture.movement)}
        ${renderSection("Martial Arts & Warrior Traditions", culture.martialArts)}
        ${renderSection("Highlights", culture.highlights)}
        ${renderSection("Knowledge Systems", culture.knowledgeSystems)}
        ${renderSection("Notable Sites / Texts", culture.notableSitesOrTexts)}
        ${renderSection("Modern Legacy", culture.modernLegacy)}
        ${renderSection("Recommended Readings", culture.recommendedReadings)}
        ${renderSection("Modern Connections", culture.modernConnections)}

        ${renderNamedConcepts(culture.namedConcepts)}
        ${renderParallels(culture.comparativeParallels)}
        ${renderReadingLinks(culture.readingLinks)}
        ${renderSection("Guiding Questions", culture.guidingQuestions)}
      </div>
    `;

    panel.innerHTML = html;
    mobile.querySelector(".culture-mobile-panel__content").innerHTML = html;

    if (isMobile()) {
      mobile.classList.add("is-open");
    }

    state.selectedId = culture.id;
    syncActiveTargets();
  }

  function getCultureById(id) {
    return state.cultureMap.get(id) || null;
  }

  function syncActiveTargets() {
    document.querySelectorAll("[data-culture]").forEach(el => {
      el.classList.toggle("is-active", el.dataset.culture === state.selectedId);
    });
  }

  function activateCulture(id, options = {}) {
    const { fromGlobe = false } = options;
    const culture = getCultureById(id);
    if (!culture) return;

    renderCulture(culture);

    if (!fromGlobe) {
      window.dispatchEvent(
        new CustomEvent("ikeverse:activate-culture", {
          detail: { id }
        })
      );
    }
  }

  function bindDocumentDelegation() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-culture]");
      if (!target) return;

      const id = target.dataset.culture;
      if (!id) return;

      if (
        target.classList.contains("culture-label") ||
        target.classList.contains("node-label") ||
        target.classList.contains("globe-label") ||
        target.classList.contains("node-card") ||
        target.classList.contains("culture-node")
      ) {
        event.preventDefault();
        activateCulture(id);
      }
    });
  }

  function bindMobileDismiss() {
    const panel = getMobilePanel();

    document.addEventListener("click", (event) => {
      if (!isMobile()) return;
      if (!panel.classList.contains("is-open")) return;

      const insidePanel = panel.contains(event.target);
      const cultureTarget = event.target.closest("[data-culture]");

      if (!insidePanel && !cultureTarget) {
        panel.classList.remove("is-open");
      }
    });
  }

  function hydrateStaticCards() {
    document.querySelectorAll(".node-card[data-culture]").forEach(card => {
      const culture = getCultureById(card.dataset.culture);
      if (!culture) return;

      const title = card.querySelector("h3");
      if (title) title.textContent = culture.shortLabel || deriveShortLabel(culture);

      const text = card.querySelector("p");
      if (text && !text.dataset.locked) {
        text.textContent = culture.mobileSummary || culture.desc || "";
      }
    });
  }

  async function initCultures() {
    if (state.loaded) return;

    try {
      const [baseData, overlayData] = await Promise.all([
        loadJSON(BASE_DATA_URL),
        loadJSON(OVERLAY_DATA_URL).catch(() => ({ cultures: [] }))
      ]);

      state.cultures = mergeCultures(baseData, overlayData);
      state.cultureMap = new Map(state.cultures.map(c => [c.id, c]));
      state.loaded = true;

      hydrateStaticCards();
      bindDocumentDelegation();
      bindMobileDismiss();

      const defaultId =
        state.cultureMap.has("kanaka_kumulipo")
          ? "kanaka_kumulipo"
          : state.cultures[0]?.id;

      if (defaultId) {
        activateCulture(defaultId, { fromGlobe: true });
      }

      window.dispatchEvent(
        new CustomEvent("ikeverse:cultures-ready", {
          detail: { cultures: state.cultures }
        })
      );
    } catch (error) {
      console.error("Failed to initialize culture details:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", initCultures);

  window.addEventListener("ikeverse:labels-ready", () => {
    syncActiveTargets();
  });

  window.IkeverseCultures = {
    init: initCultures,
    activateCulture,
    getCultureById,
    getAll: () => [...state.cultures]
  };
})();
