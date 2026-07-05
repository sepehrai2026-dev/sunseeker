document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Set accent colors from config
  if (SITE_CONFIG.accentColor) {
    document.documentElement.style.setProperty('--site-accent', SITE_CONFIG.accentColor);
    document.documentElement.style.setProperty('--site-accent-light', SITE_CONFIG.accentLight || SITE_CONFIG.accentColor);
    document.documentElement.style.setProperty('--site-accent-dark', SITE_CONFIG.accentDark || SITE_CONFIG.accentColor);
  }

  // Optional CTA text override
  const ctaBtn = document.getElementById('hero-cta-btn');
  if (ctaBtn && SITE_CONFIG.ctaText) {
    ctaBtn.textContent = SITE_CONFIG.ctaText;
  }

  // FAQ accordion
  const faqList = document.getElementById('faq-list');
  if (faqList && SITE_CONFIG.faqs) {
    SITE_CONFIG.faqs.forEach((faq, i) => {
      const item = document.createElement('div');
      item.className = 'faq-item';
      item.innerHTML = `
        <button class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}">${faq.q}</button>
        <div class="faq-a" id="faq-a-${i}"><p>${faq.a}</p></div>
      `;
      const btn = item.querySelector('.faq-q');
      const answer = item.querySelector('.faq-a');
      btn.addEventListener('click', () => {
        const open = btn.classList.toggle('open');
        answer.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
      faqList.appendChild(item);
    });
  }

  // Nav scroll state
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  // Live UTC clock readout
  const clock = document.getElementById('hero-clock');
  if (clock) {
    const tick = () => {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      clock.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  });

  // IntersectionObserver reveals
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  }

  // Init tool if available
  if (typeof initTool === 'function') {
    initTool(document.getElementById('tool-container'));
  }
});
