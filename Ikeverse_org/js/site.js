// js/site.js — Ikeverse site animations + interactions (optimized)
(function() {
  'use strict';

  const IS_MOBILE    = window.innerWidth < 768;
  const IS_IOS       = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  document.addEventListener('DOMContentLoaded', function() {
    initParticleField();
    initAccordion();
    initSmoothScroll();
    initScrollAnimations();
  });

  /* ─────────────────────────────────────────────────────────────
     PARTICLE FIELD
  ───────────────────────────────────────────────────────────── */
  function initParticleField() {
    const field = document.getElementById('particle-field');
    if (!field) return;
    if (REDUCED_MOTION) return;

    // Fewer particles on mobile for perf
    const count = IS_MOBILE ? 20 : 50;
    const frag  = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'quantum-particle';

      const size = Math.random() * 4 + 1;
      const dur  = Math.random() * 20 + 10;
      const del  = Math.random() * 20;
      const op   = Math.random() * 0.5 + 0.3;
      const left = Math.random() * 100;
      const top  = Math.random() * 100;

      // Use CSS custom properties for animation — avoids inline animation conflicts
      p.style.cssText = [
        'width:'  + size + 'px',
        'height:' + size + 'px',
        'left:'   + left + '%',
        'top:'    + top  + '%',
        'opacity:' + op,
        'animation-duration:'  + dur + 's',
        'animation-delay:' + del + 's',
        // GPU-accelerated — hint the compositor
        'will-change: transform, opacity',
        'transform: translateZ(0)',
      ].join(';');

      frag.appendChild(p);
    }

    field.appendChild(frag);

    // Pause particles when tab is hidden (saves battery)
    document.addEventListener('visibilitychange', function() {
      const state = document.hidden ? 'paused' : 'running';
      field.querySelectorAll('.quantum-particle').forEach(function(p) {
        p.style.animationPlayState = state;
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     ACCORDION
  ───────────────────────────────────────────────────────────── */
  function initAccordion() {
    const headers = document.querySelectorAll('.accordion-header');
    if (!headers.length) return;

    headers.forEach(function(header) {
      // Use touchend on iOS for instant response (avoids 300ms delay)
      const ev = IS_IOS ? 'touchend' : 'click';

      header.addEventListener(ev, function(e) {
        if (IS_IOS) e.preventDefault();

        const item     = header.parentElement;
        const isActive = item.classList.contains('active');
        const content  = item.querySelector('.accordion-content');

        // Close all — animate height to 0
        document.querySelectorAll('.accordion-item').forEach(function(el) {
          if (el === item) return;
          const c = el.querySelector('.accordion-content');
          if (c) {
            c.style.maxHeight = c.scrollHeight + 'px'; // force reflow with current height
            requestAnimationFrame(function() { c.style.maxHeight = '0'; });
          }
          el.classList.remove('active');
        });

        // Toggle current
        if (!isActive) {
          item.classList.add('active');
          if (content) {
            content.style.maxHeight = content.scrollHeight + 'px';
            // Remove fixed height after transition so dynamic content works
            content.addEventListener('transitionend', function onEnd() {
              content.removeEventListener('transitionend', onEnd);
              if (item.classList.contains('active')) {
                content.style.maxHeight = 'none';
              }
            });
          }
        } else {
          item.classList.remove('active');
          if (content) {
            content.style.maxHeight = content.scrollHeight + 'px';
            requestAnimationFrame(function() { content.style.maxHeight = '0'; });
          }
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     SMOOTH SCROLL — anchor links
     iOS polyfill: scrollTo({behavior:'smooth'}) is unreliable on older iOS
  ───────────────────────────────────────────────────────────── */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
      anchor.addEventListener('click', function(e) {
        const targetId = anchor.getAttribute('href');
        if (!targetId || targetId === '#') return;

        const target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();

        const headerOffset = 100;
        const targetY = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;

        if (IS_IOS && !CSS.supports('scroll-behavior', 'smooth')) {
          // Manual smooth scroll for older iOS
          smoothScrollTo(targetY, 600);
        } else {
          window.scrollTo({ top: targetY, behavior: 'smooth' });
        }
      });
    });
  }

  function smoothScrollTo(targetY, durationMs) {
    const startY = window.pageYOffset;
    const diff   = targetY - startY;
    let start    = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease in-out cubic
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      window.scrollTo(0, startY + diff * ease);

      if (elapsed < durationMs) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /* ─────────────────────────────────────────────────────────────
     SCROLL ANIMATIONS — fade/slide elements into view
  ───────────────────────────────────────────────────────────── */
  function initScrollAnimations() {
    if (REDUCED_MOTION) return;

    const targets = document.querySelectorAll('[data-animate], .node-card, .hero-content');
    if (!targets.length) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 });

      targets.forEach(function(el) {
        el.classList.add('animate-ready');
        observer.observe(el);
      });
    } else {
      // Fallback: show all immediately
      targets.forEach(function(el) { el.classList.add('is-visible'); });
    }
  }

})();