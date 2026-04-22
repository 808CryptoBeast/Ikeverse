/**
 * cosmic-weave-mobile.js
 * ─────────────────────────────────────────────────────────────
 * Mobile patch layer — applies after cosmic-weave.js initialises.
 * Add AFTER cosmic-weave.js and BEFORE cosmic-weave-culturalverse.js:
 *
 *   <script src="js/cosmic-weave.js"></script>
 *   <script src="js/cosmic-weave-mobile.js"></script>  ← this file
 *   <script src="js/cosmic-weave-culturalverse.js"></script>
 *   <script src="js/cosmic-weave-starmap.js"></script>
 *
 * Patches applied:
 *  1. Pixel ratio capped at 1.5× (halves GPU load on high-DPI phones)
 *  2. touch-action: none on canvas (globe drag no longer fights iOS scroll)
 *  3. OrbitControls: slower auto-rotate + higher damping on mobile
 *  4. Raycaster threshold boosted on coarse-pointer devices
 *  5. Viewport height fixed to dvh (prevents iPhone Safari bottom-bar cutoff)
 *  6. Globe container: overscroll-behavior: none (no bounce behind globe)
 *  7. Node tap targets enlarged via Raycaster.params on mobile
 *  8. Auto-resize on orientation change
 *  9. Prevent passive-event warning on OrbitControls touch listeners
 * 10. Mobile toolbar: icon-only mode below 480px, bigger tap areas
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const IS_COARSE = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const IS_MOBILE = () => window.innerWidth < 640;
  const IS_SMALL  = () => window.innerWidth < 400;

  /* ── Wait for _cwApp.globe to be fully initialised ── */
  function waitForGlobe (cb) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const app = window._cwApp;
      if (app?.globe?.renderer && app?.globe?.controls) {
        clearInterval(t);
        cb(app);
      }
      if (tries > 80) clearInterval(t); // give up after ~8s
    }, 100);
  }

  /* ══════════════════════════════════════════════════════════
     CSS INJECTED ONCE
  ══════════════════════════════════════════════════════════ */
  function injectMobileCSS () {
    if (document.getElementById('cw-mobile-patch-styles')) return;
    const s = document.createElement('style');
    s.id = 'cw-mobile-patch-styles';
    s.textContent = `
      /* ── Fix globe height on iOS Safari (100dvh ≠ 100vh) ── */
      #globe-viewport-3d,
      #map-viewport {
        height: 100dvh;
        max-height: 100dvh;
      }

      /* ── Prevent bounce scroll behind globe ── */
      #globe-viewport-3d {
        overscroll-behavior: none;
        -webkit-overflow-scrolling: auto;
        overflow: hidden;
      }
      body {
        overscroll-behavior-y: none;
      }

      /* ── Bigger tap targets for ALL globe control buttons ── */
      .cw-ctrl, .cw-mode-tab, .cw-lens,
      .cw-layer-btn, .tl-btn {
        min-width: 44px;
        min-height: 44px;
      }

      /* ── Mobile toolbar: icon-only below 480px ── */
      @media (max-width: 479px) {
        .cw-ctrl span,
        .cw-mode-tab span,
        .cw-lens-label {
          display: none !important;
        }
        /* Keep icons visible and centered */
        .cw-ctrl,
        .cw-mode-tab {
          padding: 0 !important;
          display: flex !important;
          align-items: center;
          justify-content: center;
        }
      }

      /* ── Mobile: toolbar wraps to 2 rows without overflowing ── */
      @media (max-width: 639px) {
        .cw-world-toolbar,
        .cw-toolbar {
          flex-wrap: wrap;
          gap: 4px;
          padding: 6px 8px;
        }

        /* Timeline sliders easier to drag ── */
        input[type="range"] {
          height: 28px;
        }
      }

      /* ── Prevent the canvas from triggering system pull-to-refresh ── */
      canvas {
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      /* ── Star panel: taller on landscape phones ── */
      @media (max-height: 500px) and (max-width: 900px) {
        #cw-hsc-panel {
          height: 92vh !important;
        }
        #cw-iwa-modal,
        #cw-compass-info-modal {
          max-height: 96vh !important;
        }
      }

      /* ── Culture compare panel: full screen on mobile ── */
      @media (max-width: 639px) {
        .cw-compare-panel {
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          bottom: 0 !important;
          top: auto !important;
          border-radius: 20px 20px 0 0 !important;
          max-height: 90vh !important;
          overflow-y: auto !important;
        }
      }

      /* ── Node CSS2D labels: bigger on mobile ── */
      @media (max-width: 639px) {
        .gx-node-label {
          font-size: 13px !important;
          padding: 3px 7px !important;
        }
      }

      /* ── Star culture toggle: hide text labels on small screens ── */
      @media (max-width: 479px) {
        .cw-sct-text {
          display: none !important;
        }
        #cw-star-culture-toggle > div {
          padding: 6px 8px !important;
          gap: 6px !important;
        }
        .cw-sct-pill {
          padding: 6px 8px !important;
        }
      }

      /* ── Search results: full width on mobile ── */
      @media (max-width: 639px) {
        .cw-search-results {
          position: fixed !important;
          top: 60px !important;
          left: 8px !important;
          right: 8px !important;
          width: auto !important;
          max-height: 60vh !important;
          overflow-y: auto !important;
          z-index: 50000 !important;
        }
        .cw-search-input {
          font-size: 16px !important; /* prevents iOS zoom-on-focus */
        }
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     GLOBE PATCHES (applied once app is ready)
  ══════════════════════════════════════════════════════════ */
  function patchGlobe (app) {
    const globe = app.globe;

    /* ── 1. Pixel ratio cap ── */
    globe.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    /* Re-size so the cap takes effect immediately */
    const { clientWidth: w, clientHeight: h } = globe.container;
    globe.renderer.setSize(w, h);

    /* ── 2. Canvas touch-action ── */
    const canvas = globe.renderer.domElement;
    canvas.style.touchAction  = 'none';
    canvas.style.userSelect   = 'none';
    canvas.style.webkitUserSelect = 'none';

    /* ── 3. OrbitControls mobile tuning ── */
    if (globe.controls) {
      if (IS_COARSE) {
        globe.controls.autoRotateSpeed = 0.18;   // was 0.35 — gentler on phone
        globe.controls.dampingFactor   = 0.06;   // was 0.04 — snappier stop
        globe.controls.rotateSpeed     = 0.6;    // was default 1.0 — easier control
        globe.controls.zoomSpeed       = 0.7;    // was 1.0
      }
      /* Pinch-zoom should not scroll the page underneath */
      canvas.addEventListener('wheel', e => { e.preventDefault(); }, { passive: false });
    }

    /* ── 4. Raycaster: larger tolerance on touch devices ── */
    if (IS_COARSE) {
      globe.raycaster.params.Line    = { threshold: 0.08 };
      globe.raycaster.params.Points  = { threshold: 0.08 };
      /* Also increase all node sphere sizes for easier tapping */
      globe.nodeObjs.forEach(obj => {
        const mat = obj.mesh.geometry;
        /* Scale the mesh up on coarse devices — hit area matches visual */
        if (!obj._mobilePadded) {
          obj.mesh.scale.setScalar(IS_SMALL() ? 1.9 : 1.55);
          obj._mobilePadded = true;
        }
      });
    }

    /* ── 5. Orientation change → resize ── */
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        const { clientWidth: nw, clientHeight: nh } = globe.container;
        globe.camera.aspect = nw / nh;
        globe.camera.updateProjectionMatrix();
        globe.renderer.setSize(nw, nh);
        globe.labelRenderer?.setSize(nw, nh);
      }, 300); // give browser time to finish rotation
    });

    /* ── 6. Double-tap to reset view on mobile ── */
    if (IS_COARSE) {
      let lastTap = 0;
      canvas.addEventListener('touchend', () => {
        const now = Date.now();
        if (now - lastTap < 280) {
          /* Double-tap: if nothing selected, reset camera */
          if (!app.selectedId && globe.controls) {
            globe.controls.reset?.();
            globe.camera.position.set(0, 0, 2.8);
            globe.controls.autoRotate = true;
          }
        }
        lastTap = now;
      }, { passive: true });
    }

    /* ── 7. Prevent passive violation from OrbitControls ── */
    /* OrbitControls adds its own touchstart/touchmove on the canvas.
       We can't easily change it, but we can stop the console warning
       by ensuring the canvas element does not have conflicting listeners. */
    canvas.addEventListener('touchstart', e => {
      /* allow OrbitControls to handle, just prevent page scroll */
    }, { passive: false });

    console.info('[CW+Mobile] Globe patches applied —',
      `pixelRatio: ${globe.renderer.getPixelRatio().toFixed(1)}×`,
      IS_COARSE ? '| coarse-pointer mode' : ''
    );
  }

  /* ══════════════════════════════════════════════════════════
     TOOLBAR MOBILE IMPROVEMENTS
     Applied independently of globe init (DOM may be ready sooner)
  ══════════════════════════════════════════════════════════ */
  function patchToolbar () {
    if (!IS_COARSE) return;

    /* Add aria-labels to icon-only buttons so screen readers still work */
    const LABELS = {
      btnStarMap:    'Star Map',
      btnTour:       'Guided Tour',
      zoomIn:        'Zoom In',
      zoomOut:       'Zoom Out',
      resetView:     'Reset View',
      toggleLabels:  'Toggle Labels',
      btnShare:      'Share',
      btnDiscover:   'Discover Random Culture',
      btnResetMap:   'Reset Map',
    };
    Object.entries(LABELS).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el && !el.getAttribute('aria-label')) {
        el.setAttribute('aria-label', label);
      }
    });

    /* Make timeline sliders easier to use on mobile */
    ['tlStart', 'tlEnd'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.height = '28px';
      el.style.cursor = 'pointer';
    });
  }

  /* ══════════════════════════════════════════════════════════
     SEARCH INPUT: prevent iOS auto-zoom
     iOS zooms in when input font-size < 16px
  ══════════════════════════════════════════════════════════ */
  function patchSearchInput () {
    if (!IS_COARSE) return;
    /* Observer watches for the search input being injected by _buildSearch() */
    const obs = new MutationObserver(() => {
      const input = document.getElementById('cw-search-input');
      if (input && input.style.fontSize !== '16px') {
        input.style.fontSize = '16px';
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    /* Also try immediately */
    const input = document.getElementById('cw-search-input');
    if (input) input.style.fontSize = '16px';
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init () {
    injectMobileCSS();
    patchToolbar();
    patchSearchInput();
    waitForGlobe(patchGlobe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();