/* Set accent colors from config */
if (SITE_CONFIG.accentColor) {
  document.documentElement.style.setProperty('--site-accent', SITE_CONFIG.accentColor);
  document.documentElement.style.setProperty('--site-accent-light', SITE_CONFIG.accentLight);
  document.documentElement.style.setProperty('--site-accent-dark', SITE_CONFIG.accentDark);
}

/* Hero generative field — flowing particle lattice tinted by the site accent.
   Slow and subtle; renders a single static frame under prefers-reduced-motion,
   pauses when the tab is hidden or the hero scrolls out of view. */
(function () {
  var canvas = document.getElementById('hero-field');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : { r: 200, g: 200, b: 200 };
  }
  var accent = hexToRgb(SITE_CONFIG.accentColor);

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, particles = [], t = 0, rafId = null, running = false;

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    paintBase();
  }

  function seed() {
    var count = Math.min(240, Math.floor((W * H) / 9000));
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        life: 60 + Math.random() * 240,
        bright: Math.random() < 0.12
      });
    }
  }

  function paintBase() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
  }

  /* Layered sinusoidal flow field — organic drift without a noise library */
  function fieldAngle(x, y, time) {
    var s = 0.0016;
    return (
      Math.sin(x * s * 1.4 + time * 0.00022) +
      Math.cos(y * s * 1.1 - time * 0.00017) +
      Math.sin((x + y) * s * 0.6 + time * 0.00011)
    ) * 1.35;
  }

  function step(now) {
    t = now || t + 16;
    /* translucent wipe leaves slow-fading trails */
    ctx.fillStyle = 'rgba(10,10,10,0.045)';
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = fieldAngle(p.x, p.y, t);
      var nx = p.x + Math.cos(a) * 0.55;
      var ny = p.y + Math.sin(a) * 0.55;

      var alpha = p.bright ? 0.5 : 0.16;
      ctx.strokeStyle = p.bright
        ? 'rgba(' + accent.r + ',' + accent.g + ',' + accent.b + ',' + alpha + ')'
        : 'rgba(' + Math.floor((accent.r + 160) / 2) + ',' + Math.floor((accent.g + 160) / 2) + ',' + Math.floor((accent.b + 160) / 2) + ',' + alpha + ')';
      ctx.lineWidth = p.bright ? 1.1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      p.x = nx;
      p.y = ny;
      p.life -= 1;
      if (p.life <= 0 || p.x < -8 || p.x > W + 8 || p.y < -8 || p.y > H + 8) {
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.life = 60 + Math.random() * 240;
      }
    }
  }

  function loop(now) {
    step(now);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  resize();

  if (reduceMotion) {
    /* Static frame: pre-run the simulation once, no animation */
    for (var k = 0; k < 420; k++) step(k * 16);
  } else {
    start();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { start(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { start(); } else { stop(); }
        });
      }, { threshold: 0 }).observe(canvas);
    }
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
})();

/* Numbered feature rows — pads 01, 02… when site.json provides no number */
(function() {
  var cards = document.querySelectorAll('.feature-card');
  cards.forEach(function(card, i) {
    var numEl = card.querySelector('.feature-num');
    if (numEl && (!numEl.textContent.trim() || numEl.textContent.trim() === '{{item.number}}')) {
      numEl.textContent = String(i + 1).padStart(2, '0');
    }
  });
})();

/* FAQ ledger rendered from config; section stays hidden when empty */
(function () {
  var faqs = SITE_CONFIG.faqs || [];
  var section = document.getElementById('faq');
  var list = document.getElementById('faq-list');
  if (!section || !list || !faqs.length) return;

  faqs.forEach(function (faq, i) {
    var item = document.createElement('details');
    item.className = 'faq-item';
    var summary = document.createElement('summary');
    var num = document.createElement('span');
    num.className = 'faq-q-num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = String(i + 1).padStart(2, '0');
    var q = document.createElement('span');
    q.className = 'faq-q';
    q.textContent = faq.q;
    var toggle = document.createElement('span');
    toggle.className = 'faq-toggle';
    toggle.setAttribute('aria-hidden', 'true');
    summary.appendChild(num);
    summary.appendChild(q);
    summary.appendChild(toggle);
    var answer = document.createElement('div');
    answer.className = 'faq-a';
    answer.textContent = faq.a;
    item.appendChild(summary);
    item.appendChild(answer);
    list.appendChild(item);
  });
  section.hidden = false;
})();

/* Reveal on scroll */
(function() {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.feature-card, .section-head, .vision-content, .contact-inner, .faq-item');
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  targets.forEach(function(el) { el.classList.add('reveal'); });
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  targets.forEach(function(el) { observer.observe(el); });
})();
