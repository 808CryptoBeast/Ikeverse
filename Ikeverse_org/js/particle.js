// js/roadmap.js
document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const isMobile = window.innerWidth < 768;

  // If GSAP isn't present, just skip animations (no crash)
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (!hasGsap || prefersReducedMotion) {
    initVideo({ enableScrub: false });
    return;
  }

  window.gsap.registerPlugin(window.ScrollTrigger);

  initProgressBars();
  animatePhases();
  animateMarkers();
  animateHeaderGlyphs();
  animatePortalRings();
  initVideo({ enableScrub: !isMobile });
  animateTimelineAxisGlow();

  function initProgressBars() {
    document.querySelectorAll('.progress-bar').forEach((bar) => {
      // Use existing width (inline style) or data-progress
      const styleWidth = bar.style.width?.trim();
      const dataWidth = bar.getAttribute('data-progress')?.trim();
      const targetWidth = dataWidth || styleWidth || '70%';

      bar.setAttribute('data-progress', targetWidth);
      bar.style.width = styleWidth || targetWidth;

      const progressText = bar.parentElement?.querySelector('.progress-text');
      if (progressText) progressText.textContent = '';
    });

    window.gsap.utils.toArray('.progress-bar').forEach((bar, i) => {
      window.ScrollTrigger.create({
        trigger: bar.parentElement,
        start: 'top 80%',
        onEnter: () => {
          const targetWidth = bar.getAttribute('data-progress') || '70%';
          window.gsap.fromTo(
            bar,
            { width: '0%' },
            {
              width: targetWidth,
              duration: 1.2,
              ease: 'power2.out',
              delay: i * 0.06,
            }
          );
        },
      });
    });
  }

  function animatePhases() {
    window.gsap.utils.toArray('.phase').forEach((phase, i) => {
      const startX = i % 2 === 0 ? 100 : -100;
      window.gsap.from(phase, {
        scrollTrigger: {
          trigger: phase,
          start: 'top 75%',
          toggleActions: 'play none none none',
        },
        opacity: 0,
        x: startX,
        y: 30,
        duration: 0.8,
        delay: i * 0.12,
        ease: 'back.out(1.2)',
      });
    });
  }

  function animateMarkers() {
    window.gsap.utils.toArray('.phase-marker').forEach((marker, i) => {
      const core = marker.querySelector('.marker-core');
      const aura = marker.querySelector('.marker-aura');

      window.gsap.from(marker, {
        scrollTrigger: {
          trigger: marker,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        scale: 0,
        duration: 0.6,
        delay: i * 0.08,
        ease: 'elastic.out(1, 0.5)',
      });

      if (core) {
        window.gsap.to(core, {
          scale: 1.2,
          duration: 2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      }

      if (aura) {
        window.gsap.to(aura, {
          scale: 1.8,
          opacity: 0,
          duration: 2.5,
          repeat: -1,
          ease: 'none',
        });
      }
    });
  }

  function animateHeaderGlyphs() {
    window.gsap.utils.toArray('.header-glyphs span').forEach((glyph, i) => {
      const duration = 3 + Math.random() * 2;
      const distance = 15 + Math.random() * 10;
      const rotation = 5 + Math.random() * 10;

      window.gsap.to(glyph, {
        y: distance,
        rotation,
        duration,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: i * 0.5,
      });
    });
  }

  function animatePortalRings() {
    window.gsap.utils.toArray('.portal-ring').forEach((ring, i) => {
      window.gsap.to(ring, {
        rotation: 360,
        duration: 8 + i * 4,
        repeat: -1,
        ease: 'none',
      });
    });
  }

  function initVideo({ enableScrub }) {
    const video = document.getElementById('roadmap-video');
    if (!video) return;

    video.playbackRate = 0.5;
    video.muted = true;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        video.setAttribute('controls', 'controls');
      });
    }

    if (!enableScrub || typeof window.ScrollTrigger === 'undefined') return;

    let pending = false;
    let lastProgress = 0;

    window.ScrollTrigger.create({
      onUpdate: (self) => {
        lastProgress = self.progress;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          const scrubSeconds = 10;
          video.currentTime = lastProgress * scrubSeconds;
        });
      },
    });
  }

  function animateTimelineAxisGlow() {
    const axis = document.querySelector('.timeline-axis');
    if (!axis) return;

    let pending = false;
    let lastProgress = 0;

    window.ScrollTrigger.create({
      onUpdate: (self) => {
        lastProgress = self.progress;
        if (pending) return;
        pending = true;

        requestAnimationFrame(() => {
          pending = false;
          window.gsap.to(axis, {
            boxShadow: `0 0 ${10 + lastProgress * 20}px rgba(0, 247, 255, ${0.3 + lastProgress * 0.4})`,
            duration: 0.25,
            overwrite: true,
          });
        });
      },
    });
  }
});