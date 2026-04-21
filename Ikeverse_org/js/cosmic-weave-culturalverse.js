/**
 * cosmic-weave-culturalverse.js
 * ─────────────────────────────────────────────────────────────
 * Addon script — drop this AFTER cosmic-weave.js in the HTML.
 * Adds:
 *   1. Culturalverse lesson panel in culture detail view
 *   2. Supabase lesson counts (live, from cv_lessons table)
 *   3. Lesson deep-link routing (globe node → lesson page)
 *   4. Tour CSS fixes via JS (no CSS file dependency)
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Supabase ────────────────────────────────────────────── */
  const SUPA_URL = 'https://fmrjdvsqdfyaqtzwbbqi.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtcmpkdnNxZGZ5YXF0endiYnFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTE2MzYsImV4cCI6MjA5MTE2NzYzNn0.UKyvX02bG4cNhb7U2TK96t8XFREHYYwHJIKbPK06nqs';

  /* Base URL for the Culturalverse lessons page */
  const CV_BASE = 'https://pikoverse.xyz/ikeverse/culturalverse-lessons.html';

  /* ── Which globe cultures map to Culturalverse ───────────── */
  const CV_CULTURES = {
    kanaka_kumulipo: {
      label:   'Kānaka Maoli',
      emoji:   '🌺',
      module:  'kanaka',
      color:   '#3cb371',
      lessons: [
        { id: 'km-kumulipo',    num: 'KM·01', title: 'The Kumulipo — Sacred Chant of Creation' },
        { id: 'km-wakea',       num: 'KM·02', title: 'Wākea & Papahānaumoku' },
        { id: 'km-starcompass', num: 'KM·03', title: 'The Star Compass' },
        { id: 'km-hokuleaa',    num: 'KM·04', title: 'Hōkūleʻa — The Voyaging Canoe' },
        { id: 'km-ahupuaa',     num: 'KM·05', title: 'The Ahupuaʻa' },
        { id: 'km-loikalo',     num: 'KM·06', title: 'Loʻi Kalo & Loko Iʻa' },
        { id: 'km-olelo',       num: 'KM·07', title: 'ʻŌlelo Hawaiʻi' },
        { id: 'km-hula',        num: 'KM·08', title: 'Hula — The Body as Sacred Text' },
        { id: 'km-laau',        num: 'KM·09', title: 'Laʻau Lapaʻau — Plant Medicine' },
      ]
    },
    kemet: {
      label:   'Kemet',
      emoji:   '☥',
      module:  'kemet',
      color:   '#f0c96a',
      lessons: [
        { id: 'ke-nun',           num: 'KE·01', title: 'Nun & the Primordial Waters' },
        { id: 'ke-ennead',        num: 'KE·02', title: 'The Heliopolitan Ennead' },
        { id: 'ke-ptah',          num: 'KE·03', title: 'Ptah & the Memphite Theology' },
        { id: 'ke-maat',          num: 'KE·04', title: 'Maʻat — Truth, Justice, Cosmic Balance' },
        { id: 'ke-maat-politics', num: 'KE·05', title: 'Maʻat as Political Philosophy' },
        { id: 'ke-medunetjer',    num: 'KE·06', title: 'Medu Netjer — Words of the Gods' },
        { id: 'ke-medicine',      num: 'KE·07', title: 'Kemetic Medicine — Imhotep & the Papyri' },
      ]
    },
    bridge: {
      label:   'The Bridge',
      emoji:   '🌐',
      module:  'bridge',
      color:   '#54d1ff',
      lessons: [
        { id: 'bridge-darkness',   num: 'BR·01', title: 'Both Begin in Primordial Darkness' },
        { id: 'bridge-pairs',      num: 'BR·02', title: 'Creation Through Paired Forces' },
        { id: 'bridge-aloha-maat', num: 'BR·03', title: 'Aloha and Maʻat — Cosmic Alignment' },
      ]
    }
  };

  /* ── Live lesson counts from Supabase ───────────────────── */
  const _liveCounts = {};

  async function loadLiveCounts () {
    try {
      const supa = window.piko_supa || (() => {
        if (typeof supabase !== 'undefined') {
          window.piko_supa = supabase.createClient(SUPA_URL, SUPA_KEY);
          return window.piko_supa;
        }
        return null;
      })();
      if (!supa) return;

      const { data } = await supa
        .from('cv_lessons')
        .select('id, module, status')
        .eq('status', 'live');

      if (!data?.length) return;

      ['kanaka', 'kemet', 'bridge'].forEach(mod => {
        _liveCounts[mod] = data.filter(r => r.module === mod).length;
      });
    } catch (e) {
      // Supabase unavailable — fall back to static counts
    }
  }

  /* ── Build the Culturalverse panel HTML ─────────────────── */
  function buildCVPanel (cultureId) {
    const cv = CV_CULTURES[cultureId];
    if (!cv) return '';

    const liveCount = _liveCounts[cv.module] ?? cv.lessons.length;
    const color     = cv.color;

    // Show up to 3 lesson previews
    const lessonItems = cv.lessons.slice(0, 3).map(l =>
      `<div class="cw-cv-lesson-item">
        <i class="fas fa-circle-dot"></i>
        <span style="font-family:'Space Mono',monospace;font-size:.68rem;
                     color:${color};opacity:.7;margin-right:4px;">${l.num}</span>
        <span>${escHtml(l.title)}</span>
      </div>`
    ).join('');

    const moreCount = cv.lessons.length - 3;
    const moreText  = moreCount > 0
      ? `<div style="font-size:.74rem;color:rgba(255,255,255,.35);
                    padding:4px 0 0;margin-top:2px;">
           + ${moreCount} more lessons
         </div>`
      : '';

    return `
      <section class="cw-culturalverse-panel" style="border-color:${color}33;">
        <div class="cw-cv-header">
          <div class="cw-cv-icon" style="background:${color}18;border-color:${color}33;">
            ${cv.emoji}
          </div>
          <div class="cw-cv-label" style="color:${color};">Culturalverse Lessons</div>
          <div class="cw-cv-badge" style="color:${color}88;background:${color}12;border-color:${color}22;">
            ${liveCount} live
          </div>
        </div>

        <div class="cw-cv-lessons">
          ${lessonItems}
          ${moreText}
        </div>

        <div class="cw-cv-actions">
          <a href="${CV_BASE}#${cv.lessons[0].id}"
             target="_blank" rel="noopener"
             class="cw-cv-btn"
             style="border-color:${color}55;background:${color}12;color:${color};">
            <i class="fas fa-scroll"></i> Open Lessons
          </a>
          <a href="${CV_BASE}"
             target="_blank" rel="noopener"
             class="cw-cv-btn cw-cv-btn--ghost"
             style="color:${color}88;">
            <i class="fas fa-globe"></i> All Cultures
          </a>
        </div>
      </section>`;
  }

  function escHtml (s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Patch renderDetailPanel ─────────────────────────────── */
  // Wait for the app to initialise, then wrap the original function
  function patchApp () {
    const app = window._cwApp;
    if (!app) return;

    // Store original selectCulture
    const _orig = app.selectCulture.bind(app);

    app.selectCulture = function (id, push) {
      _orig(id, push);

      // After the original renders the detail panel, inject our Culturalverse section
      requestAnimationFrame(() => {
        const extra = document.getElementById('culture-extra');
        if (!extra) return;

        const cvPanel = buildCVPanel(id);
        if (!cvPanel) return;

        // Remove any existing CV panel first
        extra.querySelectorAll('.cw-culturalverse-panel').forEach(el => el.remove());

        // Prepend before other extra sections
        extra.insertAdjacentHTML('afterbegin', cvPanel);
      });
    };
  }

  /* ── Add globe node click → lesson deep link ─────────────── */
  // Expose a global helper so the Culturalverse page can read the hash
  window.cwOpenLesson = function (lessonId) {
    window.open(`${CV_BASE}#${lessonId}`, '_blank', 'noopener');
  };

  /* ── Globe node double-tap → open lesson (mobile) ───────── */
  function addDoubleTapLesson () {
    const vp = document.getElementById('globe-viewport-3d');
    if (!vp) return;

    let lastTap = 0, lastId = null;

    vp.addEventListener('click', () => {
      const app = window._cwApp;
      if (!app?.selectedId) return;
      const id  = app.selectedId;
      const now = Date.now();

      if (id === lastId && now - lastTap < 380) {
        // Double tap — open Culturalverse if this culture has lessons
        const cv = CV_CULTURES[id];
        if (cv) window.open(`${CV_BASE}#${cv.lessons[0].id}`, '_blank', 'noopener');
        lastTap = 0;
        lastId  = null;
        return;
      }
      lastTap = now;
      lastId  = id;
    });
  }

  /* ── Footer stats — update lesson count ─────────────────── */
  function updateFooterStats () {
    const totalLessons = Object.values(CV_CULTURES)
      .reduce((sum, cv) => sum + cv.lessons.length, 0);

    // Find the "Learning Paths" stat and update it
    document.querySelectorAll('.ik-footer-stat').forEach(stat => {
      const label = stat.querySelector('.ik-footer-stat-l');
      const val   = stat.querySelector('.ik-footer-stat-n');
      if (!label || !val) return;
      if (label.textContent.trim() === 'Learning Paths') {
        val.textContent = totalLessons;
        label.textContent = 'Lessons Live';
      }
    });
  }

  /* ── Init ───────────────────────────────────────────────── */
  async function init () {
    // Load live lesson counts from Supabase in the background
    await loadLiveCounts();

    // Wait for CosmicWeave app to be ready
    let attempts = 0;
    const waitForApp = setInterval(() => {
      attempts++;
      if (window._cwApp || attempts > 40) {
        clearInterval(waitForApp);
        if (window._cwApp) {
          patchApp();
          addDoubleTapLesson();
          updateFooterStats();
          console.info('[CW+CV] Culturalverse integration active.');
        }
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();