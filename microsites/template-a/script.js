(function () {
  var cfg = typeof SITE_CONFIG !== 'undefined' ? SITE_CONFIG : {};
  var root = document.documentElement;

  // Per-site accent (also set at build time in CSS; this keeps runtime parity)
  if (cfg.accentColor) root.style.setProperty('--accent', cfg.accentColor);
  if (cfg.accentLight) root.style.setProperty('--accent-light', cfg.accentLight);
  if (cfg.accentDark) root.style.setProperty('--accent-dark', cfg.accentDark);

  // Optional hero CTA override
  if (cfg.ctaText) {
    var ctaLabel = document.getElementById('hero-cta-label');
    if (ctaLabel) ctaLabel.textContent = cfg.ctaText;
  }

  // ---- Rebuild feature spec rows ----
  // The build flattens each item's features array into a single comma-joined
  // string. Reconstruct the list: the join separator is "," with no trailing
  // space, while human commas are ", " — and digit,digit-digit-digit runs are
  // thousands separators.
  function splitFeatures(str) {
    var parts = str.split(',');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!out.length) { out.push(p); continue; }
      var prev = out[out.length - 1];
      if (/^\s/.test(p) || (/\d$/.test(prev) && /^\d{3}(?!\d)/.test(p))) {
        out[out.length - 1] = prev + ',' + p;
      } else {
        out.push(p);
      }
    }
    var trimmed = [];
    for (var j = 0; j < out.length; j++) {
      var t = out[j].replace(/^\s+|\s+$/g, '');
      if (t) trimmed.push(t);
    }
    return trimmed;
  }

  var featureLists = document.querySelectorAll('.card-features');
  for (var f = 0; f < featureLists.length; f++) {
    var ul = featureLists[f];
    if (ul.querySelectorAll('li').length > 1) continue; // already a proper list
    var text = (ul.textContent || '').replace(/^\s+|\s+$/g, '');
    if (!text) continue;
    ul.innerHTML = '';
    var feats = splitFeatures(text);
    for (var k = 0; k < feats.length; k++) {
      var li = document.createElement('li');
      li.textContent = feats[k];
      ul.appendChild(li);
    }
  }

  // ---- Hero benchmark count ----
  var cards = document.querySelectorAll('.cards .card');
  var countEl = document.getElementById('hero-count');
  if (countEl && cards.length) {
    countEl.textContent = (cards.length < 10 ? '0' : '') + cards.length;
  }

  // ---- FAQ accordion ----
  var faqList = document.getElementById('faq-list');
  if (faqList && cfg.faqs && cfg.faqs.length) {
    for (var q = 0; q < cfg.faqs.length; q++) {
      (function (faq) {
        var item = document.createElement('div');
        item.className = 'faq-item';

        var btn = document.createElement('button');
        btn.className = 'faq-q';
        btn.type = 'button';
        btn.setAttribute('aria-expanded', 'false');
        var label = document.createElement('span');
        label.textContent = faq.q;
        var marker = document.createElement('span');
        marker.className = 'faq-marker';
        marker.setAttribute('aria-hidden', 'true');
        btn.appendChild(label);
        btn.appendChild(marker);

        var answer = document.createElement('div');
        answer.className = 'faq-a';
        var inner = document.createElement('div');
        inner.className = 'faq-a-inner';
        var p = document.createElement('p');
        p.innerHTML = faq.a;
        inner.appendChild(p);
        answer.appendChild(inner);

        btn.addEventListener('click', function () {
          var isOpen = btn.getAttribute('aria-expanded') === 'true';
          var openBtns = faqList.querySelectorAll('.faq-q[aria-expanded="true"]');
          for (var o = 0; o < openBtns.length; o++) {
            openBtns[o].setAttribute('aria-expanded', 'false');
            openBtns[o].parentNode.querySelector('.faq-a').classList.remove('open');
          }
          if (!isOpen) {
            btn.setAttribute('aria-expanded', 'true');
            answer.classList.add('open');
          }
        });

        item.appendChild(btn);
        item.appendChild(answer);
        faqList.appendChild(item);
      })(cfg.faqs[q]);
    }

    // FAQ structured data
    try {
      var ld = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: []
      };
      for (var m = 0; m < cfg.faqs.length; m++) {
        ld.mainEntity.push({
          '@type': 'Question',
          name: cfg.faqs[m].q,
          acceptedAnswer: { '@type': 'Answer', text: cfg.faqs[m].a }
        });
      }
      var ldScript = document.createElement('script');
      ldScript.type = 'application/ld+json';
      ldScript.text = JSON.stringify(ld).replace(/</g, '\\u003c');
      document.head.appendChild(ldScript);
    } catch (e) { /* non-critical */ }
  }

  // ---- Sticky nav state ----
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      if (window.scrollY > 8) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Scroll reveal (respects prefers-reduced-motion) ----
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('[data-reveal]');
  if (!reduceMotion && 'IntersectionObserver' in window && targets.length) {
    var cardIndex = 0;
    for (var t = 0; t < targets.length; t++) {
      targets[t].classList.add('reveal');
      if (targets[t].classList.contains('card')) {
        targets[t].style.transitionDelay = (cardIndex % 3) * 70 + 'ms';
        cardIndex++;
      }
    }
    var io = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (entries[e].isIntersecting) {
          entries[e].target.classList.add('in');
          io.unobserve(entries[e].target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    for (var v = 0; v < targets.length; v++) io.observe(targets[v]);
  }
})();
