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
    const canvas = globe.renderer.domElement;

    /* ══ 1. PIXEL RATIO CAP ════════════════════════════════
       3× on a modern phone = 9× the pixels of 1×.
       1.5× cuts GPU work ~44% with no visible quality loss. */
    globe.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const { clientWidth: w, clientHeight: h } = globe.container;
    globe.renderer.setSize(w, h);

    /* ══ 2. CANVAS TOUCH SETUP ═════════════════════════════ */
    canvas.style.touchAction      = 'none';
    canvas.style.userSelect       = 'none';
    canvas.style.webkitUserSelect = 'none';
    /* Prevent page wheel-scroll behind the globe */
    canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    /* Prevent page scroll on touch without blocking OrbitControls */
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length > 1) e.preventDefault(); // block pinch-scroll
    }, { passive: false });

    /* ══ 3. ORBIT CONTROLS TUNING ══════════════════════════
       Key values for mobile feel:
         rotateSpeed  — how fast the globe spins per pixel of swipe
         dampingFactor — how quickly it decelerates after lift (higher = stops faster)
         zoomSpeed    — pinch sensitivity
       Current problem: rotateSpeed 0.6 still feels too loose.
       We want the globe to feel "gripped" not "flung". */
    if (globe.controls && IS_COARSE) {
      globe.controls.autoRotateSpeed = 0.15;   // very gentle idle rotation
      globe.controls.rotateSpeed     = 0.38;   // ↓ from 0.6 — globe follows finger precisely, not lunges
      globe.controls.dampingFactor   = 0.10;   // ↑ from 0.06 — stops quickly, no spin-out
      globe.controls.zoomSpeed       = 0.45;   // ↓ pinch zoom much less jumpy
      globe.controls.enableDamping   = true;   // must be on for dampingFactor to apply
      globe.controls.minDistance     = 1.4;    // don't let pinch go inside globe
      globe.controls.maxDistance     = 6.0;    // don't zoom out too far on mobile
    }

    /* ══ 4. DRAG-THRESHOLD TAP DETECTION ══════════════════
       THE ROOT CAUSE OF "TOO SENSITIVE":
       cosmic-weave.js fires _doClick() on EVERY touchend, even
       after a drag. This means rotating the globe accidentally
       selects cultures constantly.

       Fix: intercept touchend on the canvas. Track how far the
       finger moved. Only let the click through if movement < 12px
       AND touch duration < 300ms (a deliberate tap).

       We replace the canvas touchend listener the original code
       added by cloning the canvas (removes old listeners) and
       re-adding only ours + delegating to OrbitControls manually.
       Simpler: we patch globe._doClick directly to check the flag. */

    let _touchStartX = 0;
    let _touchStartY = 0;
    let _touchStartT = 0;
    let _isDragging   = false;
    const DRAG_THRESHOLD = 12;  // px — movement under this = tap
    const TAP_MAX_MS     = 280; // ms — longer than this = intentional drag

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
      _touchStartT = Date.now();
      _isDragging  = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - _touchStartX;
      const dy = e.touches[0].clientY - _touchStartY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) _isDragging = true;
    }, { passive: true });

    /* Patch globe._doClick to respect the drag flag */
    const _origDoClick = globe._doClick.bind(globe);
    globe._doClick = function () {
      /* Suppress click if finger dragged or held too long */
      if (_isDragging) return;
      if (Date.now() - _touchStartT > TAP_MAX_MS) return;
      _origDoClick();
    };

    /* ══ 5. DOUBLE-TAP TO RESET ════════════════════════════
       Two quick taps (not on a node) → reset camera + resume rotation */
    if (IS_COARSE) {
      let _lastTap = 0;
      canvas.addEventListener('touchend', () => {
        const now = Date.now();
        const sinceLast = now - _lastTap;
        if (sinceLast < 260 && sinceLast > 40 && !_isDragging) {
          if (!app.selectedId) {
            globe.camera.position.set(0, 0, 2.8);
            globe.controls?.update();
            if (globe.controls) globe.controls.autoRotate = true;
          } else {
            /* Double-tap while culture selected → deselect */
            app.deselectAll?.();
          }
        }
        _lastTap = now;
      }, { passive: true });
    }

    /* ══ 6. NODE TAP TARGETS ═══════════════════════════════
       Scale node meshes up on touch devices so they're
       thumb-friendly without increasing visual size too much. */
    if (IS_COARSE) {
      globe.raycaster.params.Line   = { threshold: 0.06 };
      globe.raycaster.params.Points = { threshold: 0.06 };
      globe.nodeObjs.forEach(obj => {
        if (!obj._mobilePadded) {
          /* Scale up hitzone without making nodes look huge */
          obj.mesh.scale.setScalar(IS_SMALL() ? 1.7 : 1.4);
          obj._mobilePadded = true;
        }
      });
    }

    /* ══ 7. ORIENTATION CHANGE → RESIZE ═══════════════════ */
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        const { clientWidth: nw, clientHeight: nh } = globe.container;
        globe.camera.aspect = nw / nh;
        globe.camera.updateProjectionMatrix();
        globe.renderer.setSize(nw, nh);
        globe.labelRenderer?.setSize(nw, nh);
      }, 350);
    });

    /* ══ 8. REDUCE LABEL DENSITY ON MOBILE ════════════════
       On small screens, only show labels for the selected node
       and its immediate connections — not all front-facing nodes. */
    if (IS_COARSE) {
      /* Override the label opacity logic by reducing threshold */
      const _origAnimate = globe._animate?.bind(globe);
      if (_origAnimate) {
        globe._animate = function () {
          _origAnimate();
          /* After each frame, suppress labels except selected */
          globe.nodeObjs?.forEach(obj => {
            if (!obj.label?.element) return;
            const isSel = obj === globe.selected;
            const isConn = globe.selected && globe.arcObjs?.some(
              a => (a.sN === globe.selected && a.tN === obj) ||
                   (a.tN === globe.selected && a.sN === obj)
            );
            if (!isSel && !isConn) {
              obj.label.element.style.opacity = '0';
            }
          });
        };
      }
    }

    console.info('[CW+Mobile] Globe patches v2 applied —',
      `pixelRatio ${globe.renderer.getPixelRatio().toFixed(1)}×`,
      `| rotateSpeed ${globe.controls?.rotateSpeed ?? '?'}`,
      `| damping ${globe.controls?.dampingFactor ?? '?'}`
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