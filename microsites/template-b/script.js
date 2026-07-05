document.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Accent color (runtime fallback; primary value is compiled into CSS)
  if (SITE_CONFIG.accentColor) {
    document.documentElement.style.setProperty('--accent', SITE_CONFIG.accentColor);
    document.documentElement.style.setProperty('--accent-dark', SITE_CONFIG.accentDark || SITE_CONFIG.accentColor);
  }

  // Rebuild feature lists: build injects features as a comma-joined string
  // (items are joined with "," while commas inside a feature are ", ").
  document.querySelectorAll('.index-card-points').forEach(ul => {
    if (ul.querySelector('li')) return;
    const raw = ul.textContent.trim();
    ul.textContent = '';
    if (!raw) { ul.remove(); return; }
    raw.split(/,(?=\S)/).forEach(part => {
      const li = document.createElement('li');
      li.textContent = part.trim();
      ul.appendChild(li);
    });
  });

  // Reading progress hairline
  const progress = document.getElementById('progress');
  if (progress) {
    let ticking = false;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      progress.style.transform = 'scaleX(' + ratio + ')';
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  // Nav hairline on scroll
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Table of contents scroll tracking
  const tocLinks = Array.from(document.querySelectorAll('.toc-link'));
  const sections = tocLinks
    .map(link => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    const setActive = id => {
      tocLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + id);
      });
    };
    const visible = new Map();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => visible.set(e.target.id, e.isIntersecting));
      const current = sections.find(s => visible.get(s.id));
      if (current) setActive(current.id);
    }, { rootMargin: '-15% 0px -55% 0px' });
    sections.forEach(s => spy.observe(s));
  }

  // Section reveal
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && !reducedMotion && 'IntersectionObserver' in window) {
    const revealer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          revealer.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
    revealEls.forEach(el => revealer.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // FAQ accordion
  const faqList = document.getElementById('faq-list');
  if (SITE_CONFIG.faqs && SITE_CONFIG.faqs.length && faqList) {
    SITE_CONFIG.faqs.forEach((faq, i) => {
      const item = document.createElement('div');
      item.className = 'faq-item';
      const qId = 'faq-q-' + i;
      const aId = 'faq-a-' + i;
      const btn = document.createElement('button');
      btn.className = 'faq-q';
      btn.id = qId;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', aId);
      const label = document.createElement('span');
      label.textContent = faq.q;
      const marker = document.createElement('span');
      marker.className = 'faq-marker';
      marker.setAttribute('aria-hidden', 'true');
      btn.appendChild(label);
      btn.appendChild(marker);
      const answer = document.createElement('div');
      answer.className = 'faq-a';
      answer.id = aId;
      answer.setAttribute('role', 'region');
      answer.setAttribute('aria-labelledby', qId);
      const p = document.createElement('p');
      p.textContent = faq.a;
      answer.appendChild(p);
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        answer.style.maxHeight = open ? '0px' : answer.scrollHeight + 'px';
      });
      item.appendChild(btn);
      item.appendChild(answer);
      faqList.appendChild(item);
    });
  }
});
