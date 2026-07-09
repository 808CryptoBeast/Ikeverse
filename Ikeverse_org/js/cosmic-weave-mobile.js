/* file: js/cosmic-weave-mobile.js */
/**
 * cosmic-weave-mobile.js — mobile-only UI patch
 * Load after cosmic-weave.js
 *
 * Goals:
 * - Improve phones/tablets only
 * - Leave desktop behavior untouched
 * - Safer globe interaction on touch
 * - Scrollable mobile sheet with handle-only dismiss
 * - Better small-screen buttons / toolbar / search
 * - Star map toggle never clipped on mobile
 */

(function () {
  'use strict';

  const MOBILE_MAX_WIDTH = 1024;
  const COMPACT_MAX_WIDTH = 479;

  const mq = {
    touch: () =>
      (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
      (window.matchMedia?.('(hover: none)').matches ?? false),
    mobileWidth: () =>
      window.matchMedia?.(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches ?? (window.innerWidth <= MOBILE_MAX_WIDTH),
    compactWidth: () =>
      window.matchMedia?.(`(max-width: ${COMPACT_MAX_WIDTH}px)`).matches ?? (window.innerWidth <= COMPACT_MAX_WIDTH),
  };

  function isMobileUI() {
    return mq.touch() && mq.mobileWidth();
  }

  function waitForGlobe(cb) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const app = window._cwApp;
      if (app?.globe?.renderer && app?.globe?.controls) {
        clearInterval(timer);
        cb(app);
        return;
      }
      if (tries > 120) clearInterval(timer);
    }, 100);
  }

  function injectMobileCSS() {
    if (!isMobileUI()) return;
    if (document.getElementById('cw-mobile-only-styles')) return;

    const style = document.createElement('style');
    style.id = 'cw-mobile-only-styles';
    style.textContent = `
      @media (max-width: ${MOBILE_MAX_WIDTH}px) {
        #globe-viewport-3d {
          overflow: visible !important;
          position: relative;
          overscroll-behavior: none;
        }

        /* touch-action: none on canvas is already set unconditionally
           (no media query) in cosmic-weave.html, so it's not repeated here. */
        #globe-viewport-3d canvas,
        #map-viewport canvas,
        canvas {
          user-select: none;
          -webkit-user-select: none;
        }

        /* Node labels sit on top of the canvas and otherwise swallow the
           touchstart that begins a drag-to-rotate gesture. Tap-to-select
           already works via canvas raycasting (see cosmic-weave.js
           _doClick), so labels don't need their own touch target here. */
        .gx-node-label {
          pointer-events: none !important;
        }

        body {
          overscroll-behavior-y: none;
        }

        #cw-star-culture-toggle {
          position: fixed !important;
          left: 50% !important;
          bottom: max(20px, env(safe-area-inset-bottom, 20px)) !important;
          transform: translateX(-50%) !important;
          z-index: 99999 !important;
          pointer-events: auto !important;
        }

        .cw-mobile-sheet {
          display: flex !important;
          flex-direction: column !important;
          max-height: min(88vh, 88dvh) !important;
        }

        .cw-msh-header,
        .cw-msh-handle {
          flex-shrink: 0;
        }

        .cw-msh-handle {
          touch-action: none !important;
          cursor: grab;
          padding: 14px;
          text-align: center;
        }

        .cw-msh-handle:active {
          cursor: grabbing;
        }

        .cw-msh-body {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior: contain !important;
          touch-action: pan-y !important;
          padding-bottom: max(100px, env(safe-area-inset-bottom, 24px)) !important;
        }

        .cw-msh-actions {
          flex-shrink: 0;
          position: sticky;
          bottom: 0;
          display: flex;
          gap: 10px;
          background: rgba(4, 9, 20, 0.95);
          backdrop-filter: blur(12px);
          border-top: 1px solid rgba(0, 247, 255, 0.1);
          padding: 10px 16px;
          padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
        }

        .cw-ctrl,
        .cw-mode-tab,
        .cw-lens,
        .cw-layer-btn,
        .tl-btn,
        .cw-msh-close,
        .cw-msh-action,
        button,
        [role="button"] {
          min-width: 44px;
          min-height: 44px;
        }

        .cw-world-toolbar,
        .cw-toolbar {
          flex-wrap: wrap;
          gap: 6px;
          padding: 6px 8px;
        }

        .cw-controls-cluster {
          flex-wrap: wrap;
        }

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
          font-size: 16px !important;
        }

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

        .gx-node-label {
          font-size: 13px !important;
          padding: 3px 7px !important;
        }
      }

      @media (max-width: ${COMPACT_MAX_WIDTH}px) {
        .cw-ctrl span,
        .cw-mode-tab span,
        .cw-lens-label,
        .cw-sct-text {
          display: none !important;
        }

        .cw-ctrl,
        .cw-mode-tab {
          padding: 0 !important;
          display: flex !important;
          align-items: center;
          justify-content: center;
        }

        .cw-sct-pill {
          padding: 6px 8px !important;
        }
      }

      @media (max-width: 639px) {
        input[type="range"] {
          height: 28px;
        }
      }

      @media (max-height: 500px) and (max-width: 900px) {
        #cw-hsc-panel {
          height: 92vh !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function patchToolbar() {
    if (!isMobileUI()) return;

    const labels = {
      btnStarMap: 'Star Map',
      btnTour: 'Guided Tour',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      resetView: 'Reset View',
      toggleLabels: 'Toggle Labels',
      btnShare: 'Share',
      btnDiscover: 'Discover Random',
      btnResetMap: 'Reset Map',
    };

    Object.entries(labels).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
      if (!el.getAttribute('title')) el.setAttribute('title', label);
    });

    ['tlStart', 'tlEnd'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.height = '28px';
      el.style.cursor = 'pointer';
    });

    const search = document.getElementById('cw-search-input');
    if (search) search.style.fontSize = '16px';
  }

  function patchSearchObserver() {
    if (!isMobileUI()) return;

    const observer = new MutationObserver(() => {
      const search = document.getElementById('cw-search-input');
      if (search) search.style.fontSize = '16px';
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function rewireSheetActions(sheet) {
    const close = () => window._cwApp?._closeMobileSheet?.();

    sheet.querySelector('.cw-msh-close')?.addEventListener('click', close);
    sheet.querySelector('#cw-msh-close-btn')?.addEventListener('click', close);

    sheet.querySelector('#cw-msh-share')?.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: document.title,
            url: location.href,
          });
          return;
        }
      } catch (_) {
        // Fall back to clipboard below.
      }

      try {
        await navigator.clipboard?.writeText(location.href);
      } catch (_) {
        // Best effort.
      }
    });

    sheet.querySelector('#cw-msh-compare')?.addEventListener('click', () => {
      const app = window._cwApp;
      const culture = app?.byId?.get(app?.selectedId);
      if (culture) window._cwCompare?.toggle?.(culture);
    });
  }

  function patchSheet(sheet) {
    if (!isMobileUI() || !sheet || sheet.dataset.cwMobilePatched === '1') return;

    const fresh = sheet.cloneNode(true);
    fresh.dataset.cwMobilePatched = '1';
    sheet.parentNode?.replaceChild(fresh, sheet);

    const handle = fresh.querySelector('.cw-msh-handle');
    const body = fresh.querySelector('.cw-msh-body');

    if (body) {
      Object.assign(body.style, {
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      });
    }

    let startY = 0;
    let dragY = 0;
    let handleDragging = false;

    handle?.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      handleDragging = true;
      startY = e.touches[0].clientY;
      dragY = 0;
      fresh.style.transition = '';
    }, { passive: true });

    body?.addEventListener('touchstart', () => {
      handleDragging = false;
    }, { passive: true });

    fresh.addEventListener('touchmove', e => {
      if (!handleDragging || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      dragY = dy;
      if (dy > 0) {
        fresh.style.transform = `translateY(${Math.min(dy, 280)}px)`;
      }
    }, { passive: true });

    fresh.addEventListener('touchend', () => {
      if (!handleDragging) {
        dragY = 0;
        return;
      }

      handleDragging = false;

      if (dragY > 130) {
        window._cwApp?._closeMobileSheet?.();
      } else {
        fresh.style.transition = 'transform .25s ease';
        fresh.style.transform = '';
        setTimeout(() => {
          fresh.style.transition = '';
        }, 260);
      }

      dragY = 0;
    }, { passive: true });

    rewireSheetActions(fresh);
  }

  function watchForSheet() {
    if (!isMobileUI()) return;

    const existing = document.getElementById('cw-mobile-sheet');
    if (existing) patchSheet(existing);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.id === 'cw-mobile-sheet') {
            setTimeout(() => patchSheet(node), 40);
          } else {
            const nested = node.querySelector?.('#cw-mobile-sheet');
            if (nested) setTimeout(() => patchSheet(nested), 40);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function patchOverlayNode(overlay) {
    if (!isMobileUI() || !overlay || overlay.dataset.cwMobilePatched === '1') return;

    const fresh = overlay.cloneNode(true);
    fresh.dataset.cwMobilePatched = '1';
    overlay.parentNode?.replaceChild(fresh, overlay);

    let startX = 0;
    let startY = 0;

    fresh.addEventListener('click', () => {
      window._cwApp?._closeMobileSheet?.();
    });

    fresh.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    fresh.addEventListener('touchend', e => {
      if (e.changedTouches.length !== 1) return;
      const dx = Math.abs(e.changedTouches[0].clientX - startX);
      const dy = Math.abs(e.changedTouches[0].clientY - startY);
      if (dx < 10 && dy < 10) {
        window._cwApp?._closeMobileSheet?.();
      }
    }, { passive: true });
  }

  function watchForOverlay() {
    if (!isMobileUI()) return;

    const existing = document.getElementById('cw-mobile-sheet-overlay');
    if (existing) patchOverlayNode(existing);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.id === 'cw-mobile-sheet-overlay') {
            patchOverlayNode(node);
          } else {
            const nested = node.querySelector?.('#cw-mobile-sheet-overlay');
            if (nested) patchOverlayNode(nested);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function patchGlobe(app) {
    if (!isMobileUI()) return;

    const globe = app?.globe;
    const canvas = globe?.renderer?.domElement;
    if (!globe || !canvas) return;

    globe.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const resize = () => {
      const width = globe.container?.clientWidth;
      const height = globe.container?.clientHeight;
      if (!width || !height) return;

      globe.camera.aspect = width / height;
      globe.camera.updateProjectionMatrix();
      globe.renderer.setSize(width, height);
      globe.labelRenderer?.setSize?.(width, height);
    };

    resize();

    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';

    canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    if (globe.controls) {
      globe.controls.enableDamping = true;
      globe.controls.autoRotateSpeed = 0.15;
      globe.controls.rotateSpeed = 0.35;
      globe.controls.dampingFactor = 0.10;
      globe.controls.zoomSpeed = 0.40;
      globe.controls.minDistance = 1.4;
      globe.controls.maxDistance = 6.0;
    }

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let dragging = false;

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
      dragging = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.hypot(dx, dy) > 14) dragging = true;
    }, { passive: true });

    if (typeof globe._doClick === 'function' && !globe._cwMobileClickPatched) {
      const originalDoClick = globe._doClick.bind(globe);
      globe._doClick = function () {
        const elapsed = Date.now() - startTime;
        if (dragging || elapsed > 320) return;
        originalDoClick();
      };
      globe._cwMobileClickPatched = true;
    }

    if (globe.raycaster?.params) {
      globe.raycaster.params.Line = { threshold: 0.06 };
      globe.raycaster.params.Points = { threshold: 0.06 };
    }

    globe.nodeObjs?.forEach(nodeObj => {
      if (nodeObj?._cwMobilePadded) return;
      nodeObj.mesh?.scale?.setScalar(mq.compactWidth() ? 1.7 : 1.45);
      nodeObj._cwMobilePadded = true;
    });

    let lastTap = 0;
    canvas.addEventListener('touchend', () => {
      const now = Date.now();
      const gap = now - lastTap;

      if (gap < 260 && gap > 40 && !dragging) {
        if (!app.selectedId) {
          globe.camera.position.set(0, 0, 2.8);
          globe.controls?.update?.();
          if (globe.controls) globe.controls.autoRotate = true;
        } else {
          app.deselectAll?.();
        }
      }

      lastTap = now;
    }, { passive: true });

    if (typeof globe._animate === 'function' && !globe._cwMobileLabelsPatched) {
      const originalAnimate = globe._animate.bind(globe);
      globe._animate = function () {
        originalAnimate();

        const selected = globe.selected;
        globe.nodeObjs?.forEach(nodeObj => {
          const el = nodeObj?.label?.element;
          if (!el) return;
          if (nodeObj === selected) return;

          const connected = selected && globe.arcObjs?.some(arc =>
            (arc.sN === selected && arc.tN === nodeObj) ||
            (arc.tN === selected && arc.sN === nodeObj)
          );

          if (!connected) el.style.opacity = '0';
        });
      };
      globe._cwMobileLabelsPatched = true;
    }

    window.addEventListener('orientationchange', () => {
      setTimeout(resize, 300);
    });

    window.addEventListener('resize', () => {
      if (!isMobileUI()) return;
      resize();
    });

    console.info('[CW Mobile Only] touch UI patch active');
  }

  function init() {
    if (!isMobileUI()) return;

    injectMobileCSS();
    patchToolbar();
    patchSearchObserver();
    watchForSheet();
    watchForOverlay();

    waitForGlobe(app => {
      if (!isMobileUI()) return;
      patchGlobe(app);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();