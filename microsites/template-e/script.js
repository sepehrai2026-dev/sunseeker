(function () {
  var CFG = typeof SITE_CONFIG !== 'undefined' ? SITE_CONFIG : {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : { r: 255, g: 255, b: 255 };
  }

  /* ---------- Starfield hero backdrop ---------- */
  (function () {
    var canvas = document.getElementById('hero-field');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var accent = hexToRgb(CFG.accentColor);
    var accentLight = hexToRgb(CFG.accentLight || CFG.accentColor);
    var stars = [];
    var w = 0, h = 0, dpr = 1;
    var running = false;
    var rafId = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduceMotion) draw(0);
    }

    function seed() {
      var count = Math.min(220, Math.round((w * h) / 6500));
      stars = [];
      for (var i = 0; i < count; i++) {
        var tinted = Math.random() < 0.22;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.4 + 0.3,
          vx: -(Math.random() * 0.06 + 0.015),
          vy: Math.random() * 0.03 + 0.005,
          base: Math.random() * 0.55 + 0.25,
          phase: Math.random() * Math.PI * 2,
          twinkle: Math.random() * 0.9 + 0.4,
          c: tinted ? (Math.random() < 0.5 ? accent : accentLight) : { r: 235, g: 235, b: 235 }
        });
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = s.base;
        if (!reduceMotion) {
          a = s.base * (0.65 + 0.35 * Math.sin(s.phase + t * 0.001 * s.twinkle));
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < -2) { s.x = w + 2; s.y = Math.random() * h; }
          if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + s.c.r + ',' + s.c.g + ',' + s.c.b + ',' + a.toFixed(3) + ')';
        ctx.fill();
      }
    }

    function loop(t) {
      draw(t);
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

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    resize();
    if (reduceMotion) draw(0);
    else start();
  })();

  /* ---------- FAQ (rendered from config, plain text, no fake anything) ---------- */
  (function () {
    var section = document.getElementById('faq');
    var list = document.getElementById('faq-list');
    var faqs = CFG.faqs || [];
    if (!section || !list) return;
    if (!faqs.length) { section.remove(); return; }
    section.hidden = false;
    faqs.forEach(function (f, i) {
      var d = document.createElement('details');
      d.className = 'faq-item';
      var s = document.createElement('summary');
      var num = document.createElement('span');
      num.className = 'faq-num';
      num.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
      var q = document.createElement('span');
      q.className = 'faq-q';
      q.textContent = f.q;
      var mark = document.createElement('span');
      mark.className = 'faq-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '+';
      s.appendChild(num);
      s.appendChild(q);
      s.appendChild(mark);
      var a = document.createElement('p');
      a.className = 'faq-a';
      a.textContent = f.a;
      d.appendChild(s);
      d.appendChild(a);
      list.appendChild(d);
    });
  })();

  /* ---------- Nav scroll state ---------- */
  (function () {
    var nav = document.getElementById('nav');
    if (!nav) return;
    var ticking = false;
    function update() {
      nav.classList.toggle('scrolled', window.scrollY > 24);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  })();

  /* ---------- Scroll-linked reveals ---------- */
  (function () {
    var targets = document.querySelectorAll('.row-card, .section-head, .about-content, .subscribe-inner, .faq-list');
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    targets.forEach(function (el) { el.classList.add('reveal'); });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { observer.observe(el); });
  })();
})();
