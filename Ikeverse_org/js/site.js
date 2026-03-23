// js/site.js
document.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement.dataset.siteInit === '1') return;
  document.documentElement.dataset.siteInit = '1';

  initNav();
  initModeToggle();
  initDownloadTracking();
});

function initNav() {
  const nav = document.querySelector('.quantum-nav');
  if (!nav) return;

  const navLinksContainer =
    document.getElementById('nav-links') || nav.querySelector('.nav-links-container');

  if (!navLinksContainer) return;

  // Use existing toggle if present; otherwise create one (some pages do not have it)
  let toggle =
    document.getElementById('mobile-menu-toggle') ||
    nav.querySelector('.mobile-menu-toggle') ||
    nav.querySelector('.nav-toggle');

  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.innerHTML = '<i class="fas fa-bars"></i>';
    nav.appendChild(toggle);
  }

  if (toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';

  // Ensure container has an id for aria-controls
  if (!navLinksContainer.id) navLinksContainer.id = 'nav-links';

  toggle.setAttribute('aria-controls', navLinksContainer.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Toggle navigation menu');

  const setOpen = (open) => {
    navLinksContainer.classList.toggle('active', open);
    toggle.classList.toggle('active', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);

    // icon swap (bars <-> times)
    const iconHtml = open
      ? '<i class="fas fa-times"></i>'
      : '<i class="fas fa-bars"></i>';
    toggle.innerHTML = iconHtml;
  };

  const isOpen = () => navLinksContainer.classList.contains('active');

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Close on nav link click
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (
      t.closest(`#${navLinksContainer.id}`) ||
      t.closest('#mobile-menu-toggle') ||
      t.closest('.nav-toggle') ||
      t.closest('.mobile-menu-toggle')
    ) {
      return;
    }

    setOpen(false);
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  // Portal hover (class-based, no inline style churn)
  const portal = document.getElementById('nav-portal') || nav.querySelector('.nav-portal');
  if (portal) {
    portal.addEventListener('mouseenter', () => portal.classList.add('portal-spinning'));
    portal.addEventListener('mouseleave', () => portal.classList.remove('portal-spinning'));
  }
}

function initModeToggle() {
  const options = document.querySelectorAll('.mode-option');
  if (!options.length) return;

  // Use <html data-mode="..."> as source of truth
  const root = document.documentElement;

  const saved = localStorage.getItem('ikeverse-mode');
  const initial = saved || root.dataset.mode || 'quantum';
  applyMode(initial);

  options.forEach((opt) => {
    opt.addEventListener('click', () => applyMode(opt.dataset.mode || 'quantum'));
  });

  function applyMode(mode) {
    root.dataset.mode = mode;
    document.body.dataset.mode = mode; // optional: keeps legacy CSS working
    localStorage.setItem('ikeverse-mode', mode);

    options.forEach((opt) => opt.classList.toggle('active', opt.dataset.mode === mode));
  }
}

function initDownloadTracking() {
  const btn = document.getElementById('download-whitepaper');
  if (!btn) return;

  if (btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', () => {
    console.log('[ikeverse] Download initiated');
  });
}