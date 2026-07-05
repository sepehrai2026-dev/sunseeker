/* Template D runtime — nav state, capabilities band, FAQ, reveal animations */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Sticky nav scroll state */
  var nav = document.getElementById('nav');
  if (nav) {
    var scrolledState = null;
    var ticking = false;
    var updateNav = function () {
      var scrolled = window.scrollY > 24;
      if (scrolled !== scrolledState) {
        nav.classList.toggle('nav-scrolled', scrolled);
        scrolledState = scrolled;
      }
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(updateNav);
        ticking = true;
      }
    }, { passive: true });
    updateNav();
  }

  /* Capabilities band + service count, derived from the rendered index */
  var names = [];
  var nameEls = document.querySelectorAll('.card-name');
  for (var i = 0; i < nameEls.length; i++) {
    var t = nameEls[i].textContent.replace(/^\s+|\s+$/g, '');
    if (t) names.push(t);
  }
  var bandList = document.getElementById('band');
  if (bandList) {
    var bandWrap = bandList.closest ? bandList.closest('.band') : null;
    if (names.length) {
      names.forEach(function (n) {
        var li = document.createElement('li');
        li.textContent = n;
        bandList.appendChild(li);
      });
    } else if (bandWrap) {
      bandWrap.hidden = true;
    }
  }
  var countEl = document.getElementById('service-count');
  if (countEl && names.length) {
    countEl.textContent = (names.length < 10 ? '0' : '') + names.length;
  }

  /* FAQ accordion, rendered from SITE_CONFIG */
  var cfg = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG) || {};
  var faqs = cfg.faqs || [];
  var faqSection = document.getElementById('faq');
  var faqList = document.getElementById('faq-list');
  if (faqSection && faqList && faqs.length) {
    faqs.forEach(function (f) {
      if (!f || !f.q || !f.a) return;
      var item = document.createElement('details');
      item.className = 'faq-item';
      var summary = document.createElement('summary');
      var q = document.createElement('span');
      q.className = 'faq-q';
      q.textContent = f.q;
      var marker = document.createElement('span');
      marker.className = 'faq-marker';
      marker.setAttribute('aria-hidden', 'true');
      summary.appendChild(q);
      summary.appendChild(marker);
      var answer = document.createElement('div');
      answer.className = 'faq-a';
      var p = document.createElement('p');
      p.textContent = f.a;
      answer.appendChild(p);
      item.appendChild(summary);
      item.appendChild(answer);
      faqList.appendChild(item);
    });
    faqSection.hidden = false;
  }

  /* Slow reveal on scroll */
  var cards = document.querySelectorAll('.index .card');
  for (var c = 0; c < cards.length; c++) {
    cards[c].classList.add('reveal');
    if (!prefersReduced) {
      cards[c].style.transitionDelay = Math.min(c * 60, 360) + 'ms';
    }
  }
  var revealEls = document.querySelectorAll('.reveal');
  if (prefersReduced || !('IntersectionObserver' in window)) {
    for (var r = 0; r < revealEls.length; r++) {
      revealEls[r].classList.add('visible');
    }
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    for (var e = 0; e < revealEls.length; e++) {
      observer.observe(revealEls[e]);
    }
  }
})();
