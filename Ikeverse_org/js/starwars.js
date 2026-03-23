// js/starwars.js
document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  // Always init quantum particles (even on pages without the crawl)
  initQuantumParticleField({ prefersReducedMotion });

  // Init crawl only if elements exist
  const crawlContainer = document.querySelector('.starwars-crawl');
  const crawlContent = document.querySelector('.starwars-crawl-content');
  const introElement = document.querySelector('.crawl-intro');
  const startCrawlBtn = document.getElementById('startCrawl');

  if (!crawlContainer || !crawlContent || !introElement || !startCrawlBtn) return;

  const INTRO_ANIMATION_NAME = 'introFade';
  const CRAWL_ANIMATION_NAME = 'crawl';

  let isCrawlPlaying = false;
  let endingContainer = null;

  /** @type {HTMLDivElement[]} */
  let starParticles = [];

  /** @type {(e: AnimationEvent) => void | null} */
  let introEndHandler = null;

  /** @type {(e: AnimationEvent) => void | null} */
  let crawlEndHandler = null;

  initCrawl();

  function initCrawl() {
    crawlContainer.classList.remove('is-running');
    crawlContent.classList.remove('is-running');

    ensureStarParticleKeyframes();
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

  function ensureStarParticleKeyframes() {
    const styleId = 'star-particle-keyframes';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes starParticleMove {
        0%   { transform: translate3d(calc(var(--sx) * 1vw), calc(var(--sy) * 1vh), 0); }
        100% { transform: translate3d(calc(var(--ex) * 1vw), calc(var(--ey) * 1vh), 0); }
      }
    `;
    document.head.appendChild(style);
  }

  function clearStarParticles() {
    for (const p of starParticles) p.remove();
    starParticles = [];
  }

  function createStarParticles() {
    clearStarParticles();
    if (prefersReducedMotion) return;

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      // Big mobile perf win: use CSS starfield (::before/::after) instead of hundreds of DOM nodes
      return;
    }

    const particleCount = 400;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'star-particle';

      const size = Math.random() * 3 + 1;
      const duration = Math.random() * 20 + 10;
      const delay = Math.random() * 20;
      const opacity = Math.random() * 0.7 + 0.3;

      const startX = Math.random() * 100;
      const startY = Math.random() * 100 + 100;
      const endX = startX + (Math.random() * 40 - 20);
      const endY = -50;

      particle.style.left = '0';
      particle.style.top = '0';
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.opacity = `${opacity}`;

      particle.style.animationName = 'starParticleMove';
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationTimingFunction = 'linear';
      particle.style.animationIterationCount = 'infinite';
      particle.style.animationPlayState = 'paused';

      particle.style.setProperty('--sx', `${startX}`);
      particle.style.setProperty('--sy', `${startY}`);
      particle.style.setProperty('--ex', `${endX}`);
      particle.style.setProperty('--ey', `${endY}`);

      frag.appendChild(particle);
      starParticles.push(particle);
    }

    crawlContainer.appendChild(frag);
  }

  function createCrawlControls() {
    if (document.querySelector('.crawl-controls')) return;

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'crawl-controls';
    controlsDiv.innerHTML = `
      <button class="crawl-control-btn" id="playCrawl" style="display:none" aria-label="Play crawl">
        <i class="fas fa-play"></i>
      </button>
      <button class="crawl-control-btn" id="pauseCrawl" style="display:none" aria-label="Pause crawl">
        <i class="fas fa-pause"></i>
      </button>
      <button class="crawl-control-btn" id="replayCrawl" aria-label="Replay crawl">
        <i class="fas fa-redo"></i>
      </button>
    `;
    document.body.appendChild(controlsDiv);
  }

  function setupEventListeners() {
    startCrawlBtn.addEventListener('click', () => {
      startCrawlBtn.style.opacity = '0';
      window.setTimeout(() => {
        startCrawlBtn.style.display = 'none';
        showIntroSequence();
      }, 200);
    });

    document.getElementById('playCrawl')?.addEventListener('click', startCrawl);
    document.getElementById('pauseCrawl')?.addEventListener('click', pauseCrawl);
    document.getElementById('replayCrawl')?.addEventListener('click', replayCrawl);

    document.addEventListener('click', (e) => {
      if ((e.target instanceof Element) && e.target.closest('.close-ending-btn')) {
        closeEndingSequence();
      }
    });

    window.addEventListener('resize', debounce(createStarParticles, 250));
  }

  function showIntroSequence() {
    if (prefersReducedMotion) {
      startCrawl();
      return;
    }

    introElement.style.display = 'block';
    introElement.style.opacity = '0';

    introElement.style.animation = 'none';
    void introElement.offsetHeight;
    introElement.style.animation = `${INTRO_ANIMATION_NAME} 3s ease-out forwards`;

    if (introEndHandler) introElement.removeEventListener('animationend', introEndHandler);

    introEndHandler = (e) => {
      if (e.animationName !== INTRO_ANIMATION_NAME) return;
      introElement.removeEventListener('animationend', introEndHandler);
      introEndHandler = null;

      // ✅ crawl-title + particles start right after intro ends
      startCrawl();
    };

    introElement.addEventListener('animationend', introEndHandler);
  }

  function startCrawl() {
    introElement.style.display = 'none';

    // ✅ starts CSS starfield + reveals particles right now
    crawlContainer.classList.add('is-running');

    // ✅ triggers title/text fade-ins right now
    crawlContent.classList.remove('is-running');
    void crawlContent.offsetHeight;
    crawlContent.classList.add('is-running');

    crawlContent.style.opacity = '1';
    crawlContent.style.animationPlayState = 'running';

    for (const p of starParticles) p.style.animationPlayState = 'running';

    isCrawlPlaying = true;
    updateButtonStates();
    attachCrawlEndListener();
  }

  function attachCrawlEndListener() {
    if (crawlEndHandler) crawlContent.removeEventListener('animationend', crawlEndHandler);

    crawlEndHandler = (e) => {
      if (e.animationName !== CRAWL_ANIMATION_NAME) return;
      crawlContent.removeEventListener('animationend', crawlEndHandler);
      crawlEndHandler = null;
      fadeOutCrawl();
    };

    crawlContent.addEventListener('animationend', crawlEndHandler);
  }

  function fadeOutCrawl() {
    crawlContent.style.transition = 'opacity 1s ease-out';
    crawlContent.style.opacity = '0';
    window.setTimeout(showEndingSequence, 1000);
  }

  function showEndingSequence() {
    if (endingContainer) endingContainer.remove();

    endingContainer = document.createElement('div');
    endingContainer.className = 'crawl-ending-container';
    endingContainer.innerHTML = `
      <div class="crawl-ending-wrapper">
        <button class="close-ending-btn" aria-label="Close ending sequence">
          <i class="fas fa-times"></i>
        </button>
        <div class="crawl-ending">
          <div class="cultural-symbols">
            <span class="hawaiian-symbol">🌺</span>
            <span class="kemet-symbol">𓃭</span>
            <span class="quantum-symbol">⚛</span>
          </div>

          <div class="dual-language-block">
            <h2 class="ending-title">
              <div class="language-line">
                <span class="hawaiian">Ua hōʻea mai ka wā hou</span>
                <span class="english">The new era has arrived</span>
              </div>
              <div class="language-line">
                <span class="kemet">𓄿𓏏𓉐𓃭𓏤𓊪𓏏𓇯</span>
                <span class="english">(The great awakening)</span>
              </div>
            </h2>

            <div class="sacred-message">
              <div class="language-group">
                <p class="hawaiian">Hoʻohui ʻia ke ʻike kahiko o Kemet a me Hawaiʻi</p>
                <p class="english">Ancient wisdom of Kemet and Hawaii united</p>
              </div>

              <div class="language-group">
                <p class="kemet">𓆓𓂧𓅓𓏏𓊖𓈖𓏏𓏭𓄿𓈖𓇌𓏏𓇯</p>
                <p class="english">(Sacred knowledge flows eternally)</p>
              </div>

              <div class="language-group">
                <p class="quantum">⚛ The Quantum Ancestral Frequency ⚛</p>
                <p class="english">Where science and spirituality become one</p>
              </div>
            </div>

            <div class="proverb-block">
              <div class="language-group">
                <p class="hawaiian">I ka wā ma mua, ka wā ma hope</p>
                <p class="english">"The future is in the past" - Hawaiian proverb</p>
              </div>

              <div class="language-group">
                <p class="kemet">𓂀𓏤𓈖𓏏𓍹𓇯𓍺𓈖𓏏𓄿𓏏𓂋𓏤𓊪𓏏𓇯</p>
                <p class="english">"Know the past to see tomorrow" - Kemet teaching</p>
              </div>
            </div>
          </div>

          <button class="ending-cta">
            <div class="language-line">
              <span class="hawaiian">E komo i ka Pūnāwai ʻIke</span>
              <span class="english">Enter the Wellspring of Knowledge</span>
            </div>
            <div class="language-line">
              <span class="kemet">𓃭𓂋𓈖𓏏𓊪𓏏𓇯</span>
              <span class="english">(Begin the journey)</span>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(endingContainer);

    window.setTimeout(() => {
      endingContainer.style.display = 'flex';
      window.setTimeout(() => {
        endingContainer.style.opacity = '1';
      }, 50);

      endingContainer.scrollTop = 0;

      endingContainer.querySelector('.ending-cta')?.addEventListener('click', () => {
        document.body.classList.add('platform-transition');
        window.setTimeout(() => {
          window.location.href = '/matrix';
        }, 2000);
      });
    }, 100);
  }

  function closeEndingSequence() {
    if (!endingContainer) return;

    endingContainer.style.opacity = '0';
    window.setTimeout(() => {
      endingContainer?.remove();
      endingContainer = null;

      const replayBtn = document.getElementById('replayCrawl');
      if (replayBtn) {
        replayBtn.style.display = 'flex';
        replayBtn.style.opacity = '1';
      }
    }, 500);
  }

  function pauseCrawl() {
    crawlContent.style.animationPlayState = 'paused';
    for (const p of starParticles) p.style.animationPlayState = 'paused';

    isCrawlPlaying = false;
    updateButtonStates();
  }

  function replayCrawl() {
    if (endingContainer) {
      endingContainer.style.opacity = '0';
      window.setTimeout(() => {
        endingContainer?.remove();
        endingContainer = null;
      }, 300);
    }

    if (introEndHandler) {
      introElement.removeEventListener('animationend', introEndHandler);
      introEndHandler = null;
    }
    if (crawlEndHandler) {
      crawlContent.removeEventListener('animationend', crawlEndHandler);
      crawlEndHandler = null;
    }

    crawlContainer.classList.remove('is-running');
    crawlContent.classList.remove('is-running');

    crawlContent.style.transition = '';
    crawlContent.style.animation = 'none';
    void crawlContent.offsetHeight;
    crawlContent.style.animation = '';
    crawlContent.style.animationPlayState = 'paused';
    crawlContent.style.opacity = '0';

    createStarParticles();

    startCrawlBtn.style.display = 'flex';
    startCrawlBtn.style.opacity = '1';

    isCrawlPlaying = false;
    updateButtonStates();
  }

  function updateButtonStates() {
    const playBtn = document.getElementById('playCrawl');
    const pauseBtn = document.getElementById('pauseCrawl');
    if (!playBtn || !pauseBtn) return;

    playBtn.style.display = isCrawlPlaying ? 'none' : 'flex';
    pauseBtn.style.display = isCrawlPlaying ? 'flex' : 'none';
  }

  function debounce(fn, waitMs) {
    let t = 0;
    return (...args) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => fn(...args), waitMs);
    };
  }

  // ----------------------------
  // Quantum Particle Field (optimized)
  // ----------------------------
  function initQuantumParticleField({ prefersReducedMotion }) {
    const particleField = document.getElementById('particle-field');
    if (!particleField || prefersReducedMotion) return;

    ensureQuantumParticleKeyframes();

    let lastIsMobile = window.innerWidth < 768;
    buildQuantumParticles(particleField, lastIsMobile);

    window.addEventListener(
      'resize',
      debounce(() => {
        const isMobile = window.innerWidth < 768;
        if (isMobile === lastIsMobile) return;
        lastIsMobile = isMobile;
        buildQuantumParticles(particleField, isMobile);
      }, 250)
    );
  }

  function ensureQuantumParticleKeyframes() {
    const styleId = 'quantum-particle-keyframes';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes quantumParticleMove {
        0%   { transform: translate3d(calc(var(--sx) * 1vw), calc(var(--sy) * 1vh), 0); }
        100% { transform: translate3d(calc(var(--ex) * 1vw), calc(var(--ey) * 1vh), 0); }
      }
    `;
    document.head.appendChild(style);
  }

  function buildQuantumParticles(particleField, isMobile) {
    particleField.querySelectorAll('.quantum-particle').forEach((n) => n.remove());

    const particleCount = isMobile ? 12 : 50;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'quantum-particle';

      const size = Math.random() * 4 + 1;
      const duration = Math.random() * 20 + 10;
      const delay = Math.random() * 20;
      const opacity = Math.random() * 0.5 + 0.3;

      const startX = Math.random() * 100;
      const startY = Math.random() * 100 + 100;
      const endX = startX + (Math.random() * 40 - 20);
      const endY = -50;

      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.opacity = `${opacity}`;

      particle.style.setProperty('--sx', `${startX}`);
      particle.style.setProperty('--sy', `${startY}`);
      particle.style.setProperty('--ex', `${endX}`);
      particle.style.setProperty('--ey', `${endY}`);

      particle.style.animationName = 'quantumParticleMove';
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationTimingFunction = 'linear';
      particle.style.animationIterationCount = 'infinite';

      frag.appendChild(particle);
    }

    particleField.appendChild(frag);
  }
});