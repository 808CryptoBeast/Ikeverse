// js/starwars.js — Optimized for mobile + iOS
document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const IS_MOBILE = window.innerWidth < 768;
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  initQuantumParticleField({ prefersReducedMotion });

  const crawlContainer = document.querySelector('.starwars-crawl');
  const crawlContent   = document.querySelector('.starwars-crawl-content');
  const introElement   = document.querySelector('.crawl-intro');
  const startCrawlBtn  = document.getElementById('startCrawl');

  if (!crawlContainer || !crawlContent || !introElement || !startCrawlBtn) return;

  const INTRO_ANIM  = 'introFade';
  const CRAWL_ANIM  = 'crawl';

  let isCrawlPlaying = false;
  let endingContainer = null;
  let starParticles   = [];
  let introEndHandler = null;
  let crawlEndHandler = null;

  // ── Use CSS custom property for crawl duration so iOS can read it ──
  const CRAWL_DURATION_S = IS_MOBILE ? 60 : 90; // shorter on mobile
  crawlContent.style.setProperty('--crawl-duration', CRAWL_DURATION_S + 's');

  initCrawl();

  function initCrawl() {
    crawlContainer.classList.remove('is-running');
    crawlContent.classList.remove('is-running');
    ensureStarKeyframes();
    createStarParticles();
    createCrawlControls();
    setupEventListeners();
    crawlContent.style.opacity = '0';
    crawlContent.style.animationPlayState = 'paused';
    introElement.style.display = 'none';
    startCrawlBtn.style.display = 'flex';
    startCrawlBtn.style.opacity = '1';
    updateButtonStates();
  }

  function ensureStarKeyframes() {
    if (document.getElementById('star-particle-keyframes')) return;
    const s = document.createElement('style');
    s.id = 'star-particle-keyframes';
    s.textContent = `
      @keyframes starParticleMove {
        0%   { transform: translate3d(calc(var(--sx)*1vw), calc(var(--sy)*1vh), 0); opacity: var(--op); }
        90%  { opacity: var(--op); }
        100% { transform: translate3d(calc(var(--ex)*1vw), calc(var(--ey)*1vh), 0); opacity: 0; }
      }
    `;
    document.head.appendChild(s);
  }

  function clearStarParticles() {
    starParticles.forEach(p => p.remove());
    starParticles = [];
  }

  function createStarParticles() {
    clearStarParticles();
    if (prefersReducedMotion) return;
    // Fewer particles on mobile for perf
    const count = IS_MOBILE ? 80 : 400;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'star-particle';
      const size = Math.random() * 2.5 + 0.8;
      const dur  = Math.random() * (IS_MOBILE ? 15 : 20) + 10;
      const del  = Math.random() * 20;
      const op   = Math.random() * 0.6 + 0.3;
      const sx   = Math.random() * 100;
      const sy   = Math.random() * 100 + 100;
      Object.assign(p.style, {
        left: '0', top: '0',
        width: size + 'px', height: size + 'px',
        animationName: 'starParticleMove',
        animationDuration: dur + 's',
        animationDelay: del + 's',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        animationPlayState: 'paused',
      });
      p.style.setProperty('--sx', sx);
      p.style.setProperty('--sy', sy);
      p.style.setProperty('--ex', sx + (Math.random() * 40 - 20));
      p.style.setProperty('--ey', -50);
      p.style.setProperty('--op', op);
      frag.appendChild(p);
      starParticles.push(p);
    }
    crawlContainer.appendChild(frag);
  }

  function createCrawlControls() {
    if (document.querySelector('.crawl-controls')) return;
    const div = document.createElement('div');
    div.className = 'crawl-controls';
    // Larger touch targets on mobile
    const btnSize = IS_MOBILE ? 'min-width:48px;min-height:48px;' : '';
    div.innerHTML = `
      <button class="crawl-control-btn" id="playCrawl"   style="display:none;${btnSize}" aria-label="Play">
        <i class="fas fa-play"></i>
      </button>
      <button class="crawl-control-btn" id="pauseCrawl"  style="display:none;${btnSize}" aria-label="Pause">
        <i class="fas fa-pause"></i>
      </button>
      <button class="crawl-control-btn" id="replayCrawl" style="${btnSize}" aria-label="Replay">
        <i class="fas fa-redo"></i>
      </button>
    `;
    document.body.appendChild(div);
  }

  function setupEventListeners() {
    // Use touchend on iOS for faster response (300ms tap delay fix)
    const clickEv = IS_IOS ? 'touchend' : 'click';

    startCrawlBtn.addEventListener(clickEv, (e) => {
      e.preventDefault();
      startCrawlBtn.style.opacity = '0';
      setTimeout(() => { startCrawlBtn.style.display = 'none'; showIntroSequence(); }, 200);
    });

    document.getElementById('playCrawl')?.addEventListener(clickEv,  (e) => { e.preventDefault(); startCrawl(); });
    document.getElementById('pauseCrawl')?.addEventListener(clickEv, (e) => { e.preventDefault(); pauseCrawl(); });
    document.getElementById('replayCrawl')?.addEventListener(clickEv,(e) => { e.preventDefault(); replayCrawl(); });

    document.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('.close-ending-btn')) {
        closeEndingSequence();
      }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(createStarParticles, 300);
    }, { passive: true });
  }

  function showIntroSequence() {
    if (prefersReducedMotion || IS_MOBILE) { startCrawl(); return; }
    introElement.style.display = 'block';
    introElement.style.opacity = '0';
    introElement.style.animation = 'none';
    void introElement.offsetHeight;
    introElement.style.animation = `${INTRO_ANIM} 3s ease-out forwards`;
    if (introEndHandler) introElement.removeEventListener('animationend', introEndHandler);
    introEndHandler = (e) => {
      if (e.animationName !== INTRO_ANIM) return;
      introElement.removeEventListener('animationend', introEndHandler);
      introEndHandler = null;
      startCrawl();
    };
    introElement.addEventListener('animationend', introEndHandler);
  }

  function startCrawl() {
    introElement.style.display = 'none';
    crawlContainer.classList.add('is-running');
    crawlContent.classList.remove('is-running');
    void crawlContent.offsetHeight;
    crawlContent.classList.add('is-running');
    crawlContent.style.opacity = '1';
    crawlContent.style.animationPlayState = 'running';
    // On iOS, use will-change for smoother animation
    if (IS_IOS) crawlContent.style.willChange = 'transform';
    starParticles.forEach(p => { p.style.animationPlayState = 'running'; });
    isCrawlPlaying = true;
    updateButtonStates();
    attachCrawlEndListener();
  }

  function attachCrawlEndListener() {
    if (crawlEndHandler) crawlContent.removeEventListener('animationend', crawlEndHandler);
    crawlEndHandler = (e) => {
      if (e.animationName !== CRAWL_ANIM) return;
      crawlContent.removeEventListener('animationend', crawlEndHandler);
      crawlEndHandler = null;
      fadeOutCrawl();
    };
    crawlContent.addEventListener('animationend', crawlEndHandler);
  }

  function fadeOutCrawl() {
    crawlContent.style.transition = 'opacity 1s ease-out';
    crawlContent.style.opacity = '0';
    setTimeout(showEndingSequence, 1000);
  }

  function showEndingSequence() {
    if (endingContainer) endingContainer.remove();
    endingContainer = document.createElement('div');
    endingContainer.className = 'crawl-ending-container';
    endingContainer.innerHTML = `
      <div class="crawl-ending-wrapper">
        <button class="close-ending-btn" aria-label="Close" style="min-width:44px;min-height:44px">
          <i class="fas fa-times"></i>
        </button>
        <div class="crawl-ending">
          <div class="cultural-symbols">
            <span>🌺</span><span>𓃭</span><span>⚛</span>
          </div>
          <div class="dual-language-block">
            <h2 class="ending-title">
              <div class="language-line">
                <span class="hawaiian">Ua hōʻea mai ka wā hou</span>
                <span class="english">The new era has arrived</span>
              </div>
            </h2>
            <div class="sacred-message">
              <div class="language-group">
                <p class="hawaiian">Hoʻohui ʻia ke ʻike kahiko o Kemet a me Hawaiʻi</p>
                <p class="english">Ancient wisdom of Kemet and Hawaii united</p>
              </div>
              <div class="language-group">
                <p class="quantum">⚛ The Quantum Ancestral Frequency ⚛</p>
                <p class="english">Where science and spirituality become one</p>
              </div>
            </div>
            <div class="proverb-block">
              <div class="language-group">
                <p class="hawaiian">I ka wā ma mua, ka wā ma hope</p>
                <p class="english">"The future is in the past" — Hawaiian proverb</p>
              </div>
            </div>
          </div>
          <button class="ending-cta">
            <div class="language-line">
              <span class="hawaiian">E komo i ka Pūnāwai ʻIke</span>
              <span class="english">Enter the Wellspring of Knowledge</span>
            </div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(endingContainer);
    setTimeout(() => {
      endingContainer.style.display = 'flex';
      setTimeout(() => { endingContainer.style.opacity = '1'; }, 50);
      endingContainer.querySelector('.ending-cta')?.addEventListener('click', () => {
        document.body.classList.add('platform-transition');
        setTimeout(() => { window.location.href = '/matrix'; }, 2000);
      });
    }, 100);
  }

  function closeEndingSequence() {
    if (!endingContainer) return;
    endingContainer.style.opacity = '0';
    setTimeout(() => { endingContainer?.remove(); endingContainer = null; }, 500);
  }

  function pauseCrawl() {
    crawlContent.style.animationPlayState = 'paused';
    starParticles.forEach(p => { p.style.animationPlayState = 'paused'; });
    isCrawlPlaying = false;
    updateButtonStates();
  }

  function replayCrawl() {
    closeEndingSequence();
    if (introEndHandler) { introElement.removeEventListener('animationend', introEndHandler); introEndHandler = null; }
    if (crawlEndHandler) { crawlContent.removeEventListener('animationend', crawlEndHandler);  crawlEndHandler = null; }
    crawlContainer.classList.remove('is-running');
    crawlContent.classList.remove('is-running');
    crawlContent.style.cssText = '';
    crawlContent.style.opacity = '0';
    crawlContent.style.animationPlayState = 'paused';
    createStarParticles();
    startCrawlBtn.style.display = 'flex';
    startCrawlBtn.style.opacity = '1';
    isCrawlPlaying = false;
    updateButtonStates();
  }

  function updateButtonStates() {
    const play  = document.getElementById('playCrawl');
    const pause = document.getElementById('pauseCrawl');
    if (!play || !pause) return;
    play.style.display  = isCrawlPlaying ? 'none' : 'flex';
    pause.style.display = isCrawlPlaying ? 'flex' : 'none';
  }

  // ─────────────────────────────────────────────
  // Quantum Particle Field
  // ─────────────────────────────────────────────
  function initQuantumParticleField({ prefersReducedMotion }) {
    const field = document.getElementById('particle-field');
    if (!field || prefersReducedMotion) return;
    ensureQuantumKeyframes();
    let lastMobile = window.innerWidth < 768;
    buildQuantumParticles(field, lastMobile);
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const mobile = window.innerWidth < 768;
        if (mobile === lastMobile) return;
        lastMobile = mobile;
        buildQuantumParticles(field, mobile);
      }, 300);
    }, { passive: true });
  }

  function ensureQuantumKeyframes() {
    if (document.getElementById('quantum-particle-keyframes')) return;
    const s = document.createElement('style');
    s.id = 'quantum-particle-keyframes';
    s.textContent = `
      @keyframes quantumParticleMove {
        0%   { transform: translate3d(calc(var(--sx)*1vw),calc(var(--sy)*1vh),0); opacity:var(--op,0.5); }
        90%  { opacity:var(--op,0.5); }
        100% { transform: translate3d(calc(var(--ex)*1vw),calc(var(--ey)*1vh),0); opacity:0; }
      }
    `;
    document.head.appendChild(s);
  }

  function buildQuantumParticles(field, mobile) {
    field.querySelectorAll('.quantum-particle').forEach(n => n.remove());
    const count = mobile ? 16 : 50;
    const frag  = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'quantum-particle';
      const size = Math.random() * 4 + 1;
      const dur  = Math.random() * 20 + 10;
      const op   = Math.random() * 0.5 + 0.3;
      const sx   = Math.random() * 100;
      const sy   = Math.random() * 100 + 100;
      Object.assign(p.style, {
        width: size + 'px', height: size + 'px',
        animationName: 'quantumParticleMove',
        animationDuration: dur + 's',
        animationDelay: (Math.random() * 20) + 's',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      });
      p.style.setProperty('--sx', sx);
      p.style.setProperty('--sy', sy);
      p.style.setProperty('--ex', sx + (Math.random() * 40 - 20));
      p.style.setProperty('--ey', -50);
      p.style.setProperty('--op', op);
      frag.appendChild(p);
    }
    field.appendChild(frag);
  }
});