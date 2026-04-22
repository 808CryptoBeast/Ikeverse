/**
 * cosmic-weave-mobile.js  — v3 (bug-fix + sensitivity overhaul)
 * ─────────────────────────────────────────────────────────────
 * Load order:
 *   <script src="js/cosmic-weave.js"></script>
 *   <script src="js/cosmic-weave-mobile.js"></script>   ← this file
 *   <script src="js/cosmic-weave-culturalverse.js"></script>
 *   <script src="js/cosmic-weave-starmap.js"></script>
 *   <script src="js/cosmic-weave-optimize.js"></script>
 *
 * Fixes in this version:
 *   - Globe viewport: overflow:visible so star map toggle is never clipped
 *   - Star map toggle: position:fixed so it's always above the viewport
 *   - Mobile sheet: only the handle drags to close — body scrolls freely
 *   - Drag thresholds raised — rotating globe never fires accidental selects
 *   - Details panel: forced visible on desktop after any culture select
 *   - Overlay close: only fires on pure tap, not on swipe over the overlay
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const IS_COARSE = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const IS_MOBILE = () => window.innerWidth < 640;
  const IS_SMALL  = () => window.innerWidth < 400;

  /* ── Wait for _cwApp.globe to be fully initialised ── */
  function waitForGlobe(cb) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const app = window._cwApp;
      if (app?.globe?.renderer && app?.globe?.controls) {
        clearInterval(t);
        cb(app);
      }
      if (tries > 100) clearInterval(t);
    }, 100);
  }

  /* ══════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════ */
  function injectMobileCSS() {
    if (document.getElementById('cw-mobile-patch-styles')) return;
    const s = document.createElement('style');
    s.id = 'cw-mobile-patch-styles';
    s.textContent = `
      /* Safe-area insets */
      #globe-viewport-3d, #map-viewport {
        height: 100dvh;
        max-height: 100dvh;
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      /* FIX: overflow:visible so star map toggle & overlays are never clipped.
         Previously overflow:hidden was clipping the absolute-positioned toggle. */
      #globe-viewport-3d {
        overflow: visible;
        overscroll-behavior: none;
        position: relative;
      }
      #globe-viewport-3d canvas {
        display: block;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      body { overscroll-behavior-y: none; }

      /* FIX: star map culture tradition toggle — fixed positioning
         so overflow:hidden on any parent can never clip it */
      #cw-star-culture-toggle {
        position: fixed !important;
        bottom: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 99999 !important;
        pointer-events: all !important;
      }

      /* FIX: mobile sheet — flex layout so body and header are independent.
         Body gets its own scroll area; handle is the only drag target. */
      .cw-mobile-sheet {
        display: flex !important;
        flex-direction: column !important;
        max-height: 88vh !important;
      }
      .cw-msh-header { flex-shrink: 0; }
      .cw-msh-handle {
        touch-action: none;   /* handle drags the sheet */
        cursor: grab;
        flex-shrink: 0;
        padding: 14px;
        text-align: center;
      }
      .cw-msh-handle:active { cursor: grabbing; }
      /* Body scrolls independently — touch-action:pan-y lets finger scroll freely */
      .cw-msh-body {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior: contain !important;
        touch-action: pan-y !important;
        padding-bottom: 100px !important;
      }
      .cw-msh-actions {
        flex-shrink: 0;
        position: sticky;
        bottom: 0;
        background: rgba(4,9,20,.95);
        backdrop-filter: blur(12px);
        border-top: 1px solid rgba(0,247,255,.1);
        padding: 10px 16px;
        padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
        display: flex;
        gap: 10px;
      }

      /* Bigger tap targets */
      .cw-ctrl, .cw-mode-tab, .cw-lens, .cw-layer-btn, .tl-btn {
        min-width: 44px;
        min-height: 44px;
      }

      /* Icon-only toolbar below 480px */
      @media (max-width: 479px) {
        .cw-ctrl span, .cw-mode-tab span, .cw-lens-label { display: none !important; }
        .cw-ctrl, .cw-mode-tab {
          padding: 0 !important;
          display: flex !important;
          align-items: center;
          justify-content: center;
        }
      }

      /* Timeline sliders */
      @media (max-width: 639px) {
        .cw-world-toolbar, .cw-toolbar { flex-wrap: wrap; gap: 4px; padding: 6px 8px; }
        input[type="range"] { height: 28px; }
      }

      /* Prevent system pull-to-refresh on canvas */
      canvas { touch-action: none; user-select: none; -webkit-user-select: none; }

      /* Star panel taller on landscape phones */
      @media (max-height: 500px) and (max-width: 900px) {
        #cw-hsc-panel { height: 92vh !important; }
      }

      /* Compare panel: full-screen on mobile */
      @media (max-width: 639px) {
        .cw-compare-panel {
          left: 0 !important; right: 0 !important;
          width: 100% !important; max-width: 100% !important;
          bottom: 0 !important; top: auto !important;
          border-radius: 20px 20px 0 0 !important;
          max-height: 90vh !important; overflow-y: auto !important;
        }
      }

      /* Node labels */
      @media (max-width: 639px) {
        .gx-node-label { font-size: 13px !important; padding: 3px 7px !important; }
      }

      /* Star culture toggle: icon-only on small screens */
      @media (max-width: 479px) {
        .cw-sct-text { display: none !important; }
        .cw-sct-pill { padding: 6px 8px !important; }
      }

      /* Search results full-width on mobile */
      @media (max-width: 639px) {
        .cw-search-results {
          position: fixed !important;
          top: 60px !important; left: 8px !important; right: 8px !important;
          width: auto !important; max-height: 60vh !important;
          overflow-y: auto !important; z-index: 50000 !important;
        }
        .cw-search-input { font-size: 16px !important; }
      }

      /* Details panel always visible on desktop — never hidden by panel swipe */
      @media (min-width: 640px) {
        .cw-panel--details { display: block !important; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     FIX: MOBILE SHEET SCROLL
     Problem: the original code sets touchstart on the handle
     to capture startY, then listens for touchmove on the WHOLE
     sheet. If the user scrolls the content body, that touchmove
     drives dragY and can dismiss the sheet.

     Solution: clone the sheet (removes all old passive listeners),
     then re-add with a boolean that ensures only handle-initiated
     touches drive the drag-to-close animation.
  ══════════════════════════════════════════════════════════ */
  function fixSheetScrolling(sheet) {
    if (!sheet || sheet._cwScrollFixed) return;
    sheet._cwScrollFixed = true;

    /* Clone removes all existing event listeners */
    const fresh = sheet.cloneNode(true);
    fresh._cwScrollFixed = true;
    sheet.parentNode.replaceChild(fresh, sheet);

    const freshHandle = fresh.querySelector('.cw-msh-handle');
    const freshBody   = fresh.querySelector('.cw-msh-body');

    /* Ensure body is scrollable */
    if (freshBody) {
      Object.assign(freshBody.style, {
        overflowY:               'auto',
        webkitOverflowScrolling: 'touch',
        overscrollBehavior:      'contain',
        touchAction:             'pan-y',
      });
    }

    /* Touch state */
    let dragY = 0, startY = 0, isDraggingHandle = false;

    /* Drag only starts from the handle */
    freshHandle?.addEventListener('touchstart', e => {
      isDraggingHandle = true;
      startY = e.touches[0].clientY;
      dragY  = 0;
      fresh.style.transition = '';
    }, { passive: true });

    /* Body touch cancels handle drag */
    freshBody?.addEventListener('touchstart', () => {
      isDraggingHandle = false;
    }, { passive: true });

    /* Sheet touchmove: only animate when handle-drag is active */
    fresh.addEventListener('touchmove', e => {
      if (!isDraggingHandle) return;
      const dy = e.touches[0].clientY - startY;
      dragY = dy;
      if (dy > 0) fresh.style.transform = `translateY(${Math.min(dy, 260)}px)`;
    }, { passive: true });

    /* Sheet touchend: dismiss at 130px, otherwise snap back */
    fresh.addEventListener('touchend', () => {
      if (!isDraggingHandle) { dragY = 0; return; }
      isDraggingHandle = false;
      if (dragY > 130) {
        window._cwApp?._closeMobileSheet?.();
      } else {
        fresh.style.transition = 'transform .25s ease';
        fresh.style.transform  = '';
        setTimeout(() => { fresh.style.transition = ''; }, 260);
      }
      dragY = 0;
    }, { passive: true });

    /* Re-wire buttons (cloneNode strips listeners) */
    const close = () => window._cwApp?._closeMobileSheet?.();
    fresh.querySelector('.cw-msh-close')?.addEventListener('click',     close);
    fresh.querySelector('#cw-msh-close-btn')?.addEventListener('click', close);
    fresh.querySelector('#cw-msh-share')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(location.href).catch(() => {});
    });
    fresh.querySelector('#cw-msh-compare')?.addEventListener('click', () => {
      const app = window._cwApp;
      const c   = app?.byId?.get(app?.selectedId);
      if (c) window._cwCompare?.toggle(c);
    });
  }

  function watchForSheet() {
    const existing = document.getElementById('cw-mobile-sheet');
    if (existing) { fixSheetScrolling(existing); return; }
    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.id === 'cw-mobile-sheet') {
            /* Brief delay so _buildMobileSheet finishes wiring events first */
            setTimeout(() => fixSheetScrolling(node), 50);
            obs.disconnect();
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true });
  }

  /* ══════════════════════════════════════════════════════════
     FIX: OVERLAY — only close on pure tap, not swipe
  ══════════════════════════════════════════════════════════ */
  function watchForOverlay() {
    const patch = node => {
      let ox = 0, oy = 0;
      node.addEventListener('touchstart', e => {
        ox = e.touches[0].clientX;
        oy = e.touches[0].clientY;
      }, { passive: true });
      node.addEventListener('touchend', e => {
        const dx = Math.abs(e.changedTouches[0].clientX - ox);
        const dy = Math.abs(e.changedTouches[0].clientY - oy);
        if (dx < 10 && dy < 10) window._cwApp?._closeMobileSheet?.();
      }, { passive: true });
    };

    const existing = document.getElementById('cw-mobile-sheet-overlay');
    if (existing) { patch(existing); return; }
    const obs = new MutationObserver(mutations => {
      for (const m of mutations) for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.id === 'cw-mobile-sheet-overlay') {
          patch(node); obs.disconnect(); return;
        }
      }
    });
    obs.observe(document.body, { childList: true });
  }

  /* ══════════════════════════════════════════════════════════
     GLOBE PATCHES
  ══════════════════════════════════════════════════════════ */
  function patchGlobe(app) {
    const globe  = app.globe;
    const canvas = globe.renderer.domElement;

    /* 1. Pixel ratio cap */
    globe.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const { clientWidth: w, clientHeight: h } = globe.container;
    globe.renderer.setSize(w, h);

    /* 2. Canvas touch */
    canvas.style.touchAction      = 'none';
    canvas.style.userSelect       = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    /* 3. OrbitControls — grippier feel, no spin-out */
    if (globe.controls && IS_COARSE) {
      globe.controls.autoRotateSpeed = 0.15;
      globe.controls.rotateSpeed     = 0.35;
      globe.controls.dampingFactor   = 0.10;
      globe.controls.zoomSpeed       = 0.40;
      globe.controls.enableDamping   = true;
      globe.controls.minDistance     = 1.4;
      globe.controls.maxDistance     = 6.0;
    }

    /* 4. Drag-threshold tap detection
       Rotating the globe fires touchend. Without this patch, every
       globe rotation accidentally selects a culture.
       Rule: only register as a tap if movement < 12px AND < 280ms. */
    let _sx = 0, _sy = 0, _st = 0, _isDragging = false;

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      _sx = e.touches[0].clientX;
      _sy = e.touches[0].clientY;
      _st = Date.now();
      _isDragging = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) return;
      if (Math.hypot(e.touches[0].clientX - _sx, e.touches[0].clientY - _sy) > 12) {
        _isDragging = true;
      }
    }, { passive: true });

    /* Patch _doClick to gate on drag state */
    const _origDoClick = globe._doClick.bind(globe);
    globe._doClick = function () {
      if (_isDragging || Date.now() - _st > 280) return;
      _origDoClick();
    };

    /* 5. Double-tap: reset / deselect */
    if (IS_COARSE) {
      let _lastTap = 0;
      canvas.addEventListener('touchend', () => {
        const now = Date.now(), since = now - _lastTap;
        if (since < 260 && since > 40 && !_isDragging) {
          if (!app.selectedId) {
            globe.camera.position.set(0, 0, 2.8);
            globe.controls?.update();
            if (globe.controls) globe.controls.autoRotate = true;
          } else {
            app.deselectAll?.();
          }
        }
        _lastTap = now;
      }, { passive: true });
    }

    /* 6. Node tap targets */
    if (IS_COARSE) {
      globe.raycaster.params.Line   = { threshold: 0.06 };
      globe.raycaster.params.Points = { threshold: 0.06 };
      globe.nodeObjs.forEach(obj => {
        if (!obj._mobilePadded) {
          obj.mesh.scale.setScalar(IS_SMALL() ? 1.7 : 1.4);
          obj._mobilePadded = true;
        }
      });
    }

    /* 7. Orientation-change resize */
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        const { clientWidth: nw, clientHeight: nh } = globe.container;
        globe.camera.aspect = nw / nh;
        globe.camera.updateProjectionMatrix();
        globe.renderer.setSize(nw, nh);
        globe.labelRenderer?.setSize(nw, nh);
      }, 350);
    });

    /* 8. Label density on mobile */
    if (IS_COARSE) {
      const _origAnimate = globe._animate?.bind(globe);
      if (_origAnimate) {
        globe._animate = function () {
          _origAnimate();
          const sel = globe.selected;
          globe.nodeObjs?.forEach(obj => {
            if (!obj.label?.element) return;
            if (obj === sel) return;
            const isConn = sel && globe.arcObjs?.some(
              a => (a.sN === sel && a.tN === obj) || (a.tN === sel && a.sN === obj)
            );
            if (!isConn) obj.label.element.style.opacity = '0';
          });
        };
      }
    }

    console.info(
      '[CW+Mobile v3]',
      `dpr=${globe.renderer.getPixelRatio().toFixed(1)}`,
      `rotateSpeed=${globe.controls?.rotateSpeed ?? '?'}`,
      `damping=${globe.controls?.dampingFactor ?? '?'}`
    );
  }

  /* ══════════════════════════════════════════════════════════
     FIX: DETAILS PANEL — ensure it shows after node click
     Wraps selectCulture with a safety-net that forces the
     details panel visible and re-populates if it failed.
  ══════════════════════════════════════════════════════════ */
  function patchDetailsPanel(app) {
    const _orig = app.selectCulture?.bind(app);
    if (!_orig) return;

    app.selectCulture = function (id, push) {
      const result = _orig(id, push);

      /* On desktop: ensure the details panel isn't hidden by panel swipe */
      if (!IS_COARSE) {
        const detPanel = document.querySelector('.cw-panel--details');
        if (detPanel) detPanel.style.display = '';
      }

      /* Safety net: if culture-name wasn't populated, try again */
      setTimeout(() => {
        const c = this.byId?.get(id);
        if (!c || id !== this.selectedId) return;
        const nameEl = document.getElementById('culture-name');
        if (!nameEl) return;
        const empty = !nameEl.textContent || nameEl.textContent === 'Select a Wisdom Tradition';
        if (empty) {
          /* Re-run population — renderDetailPanel is in the global scope of the IIFE */
          try {
            const fn = window._cwApp?.globe?.renderer && window.renderDetailPanel;
            if (typeof fn === 'function') fn(c, nameEl);
          } catch (_) { /* best effort */ }
        }
      }, 200);

      return result;
    };
  }

  /* ══════════════════════════════════════════════════════════
     TOOLBAR + SEARCH
  ══════════════════════════════════════════════════════════ */
  function patchToolbar() {
    if (!IS_COARSE) return;
    const LABELS = {
      btnStarMap: 'Star Map', btnTour: 'Guided Tour',
      zoomIn: 'Zoom In', zoomOut: 'Zoom Out', resetView: 'Reset View',
      toggleLabels: 'Toggle Labels', btnShare: 'Share',
      btnDiscover: 'Discover Random', btnResetMap: 'Reset Map',
    };
    Object.entries(LABELS).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
    });
    ['tlStart', 'tlEnd'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.height = '28px'; el.style.cursor = 'pointer'; }
    });
  }

  function patchSearchInput() {
    if (!IS_COARSE) return;
    const obs = new MutationObserver(() => {
      const inp = document.getElementById('cw-search-input');
      if (inp) { inp.style.fontSize = '16px'; obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const inp = document.getElementById('cw-search-input');
    if (inp) inp.style.fontSize = '16px';
  }

  /* ══════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════ */
  function init() {
    injectMobileCSS();
    patchToolbar();
    patchSearchInput();

    if (IS_COARSE) {
      watchForSheet();
      watchForOverlay();
    }

    waitForGlobe(app => {
      patchGlobe(app);
      patchDetailsPanel(app);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();