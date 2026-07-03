let map;
let markers = [];
let patios = [];
let userLat = 37.7749;
let userLng = -122.4194;
let activeFilter = 'all';
let selectedPatio = null;
let selectedTime = null;
let searchDebounceTimer = null;
let isLoadingPlaces = false;
let loadGeneration = 0;

function init() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([userLat, userLng], 15);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  initTimeSlider();
  setupEventListeners();
  locateUser();
}

function getSelectedTime() {
  return selectedTime || new Date();
}

function isViewingFuture() {
  return selectedTime !== null;
}

// --- GEOLOCATION ---

function locateUser() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        map.setView([userLat, userLng], 15);
        loadPatiosForLocation(userLat, userLng);
      },
      () => loadPatiosForLocation(userLat, userLng),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else {
    loadPatiosForLocation(userLat, userLng);
  }
}

// --- PLACES LOADING ---

async function loadPatiosForLocation(lat, lng, zoomTo) {
  const gen = ++loadGeneration;
  isLoadingPlaces = true;
  userLat = lat;
  userLng = lng;

  if (zoomTo) {
    map.setView([lat, lng], 15);
  }

  document.getElementById('search-results').classList.add('hidden');
  showLoading(true);

  try {
    const radius = getRadiusFromZoom();
    const results = await Places.fetchPatiosNear(lat, lng, radius);

    if (gen !== loadGeneration) return;

    if (results.length === 0) {
      patios = [];
      document.getElementById('loading-text').textContent = 'No outdoor dining found here. Try another area.';
      setTimeout(() => showLoading(false), 2000);
    } else {
      patios = results;
      document.getElementById('loading-text').textContent = 'Analyzing building shadows...';

      try {
        await Places.fetchBuildingsForPatios(patios);
      } catch (e) {
        console.warn('Building data unavailable:', e);
      }

      if (gen !== loadGeneration) return;
      showLoading(false);
    }

    updateSunData();
    renderMarkers();
    renderPatioList();
    updateSunBanner();
  } catch (err) {
    if (gen !== loadGeneration) return;
    console.error('Failed to load places:', err);
    document.getElementById('loading-text').textContent = 'Failed to load places. Retrying...';
    setTimeout(() => showLoading(false), 3000);
  }

  isLoadingPlaces = false;
}

function getRadiusFromZoom() {
  const zoom = map.getZoom();
  if (zoom >= 17) return 500;
  if (zoom >= 15) return 1200;
  if (zoom >= 13) return 3000;
  return 5000;
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    document.getElementById('loading-text').textContent = 'Finding sunny patios...';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// --- SUN CALCULATIONS ---

function updateSunData() {
  const time = getSelectedTime();
  for (let i = 0; i < patios.length; i++) {
    patios[i].sunData = calculateSunExposure(patios[i], time, userLat, userLng);
  }
}

function updateSunBanner() {
  const time = getSelectedTime();
  const times = SunCalc.getTimes(time, userLat, userLng);
  const sunPos = SunCalc.getPosition(time, userLat, userLng);

  const sunnyCount = patios.filter(p => p.sunData && p.sunData.currentlySunny).length;

  const statusEl = document.getElementById('sun-status-text');
  const iconEl = document.getElementById('sun-icon-banner');
  const bannerEl = document.getElementById('sun-banner-content');

  bannerEl.classList.remove('future', 'night');

  const future = isViewingFuture();
  const timeLabel = future ? ' at ' + formatTime(time) : '';

  if (sunPos.altitude <= 0) {
    iconEl.textContent = '🌙';
    const nextRise = times.sunrise > time ? times.sunrise : SunCalc.getTimes(new Date(time.getTime() + 86400000), userLat, userLng).sunrise;
    statusEl.textContent = `Sun is down${timeLabel} · Rises ${formatTime(nextRise)}`;
    bannerEl.classList.add('night');
  } else {
    const sunset = times.sunset;
    const remaining = Math.max(0, (sunset - time) / 60000);
    const totalMins = Math.round(remaining);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    const altDeg = sunPos.altitude * 180 / Math.PI;
    iconEl.textContent = altDeg > 20 ? '☀️' : '🌤️';

    if (future) {
      bannerEl.classList.add('future');
      statusEl.textContent = `${sunnyCount} patios sunny${timeLabel} · ${hrs}h ${mins}m until sunset`;
    } else {
      statusEl.textContent = `${sunnyCount} patios in sun · ${hrs}h ${mins}m until sunset`;
    }
  }

  document.getElementById('time-context').textContent = future
    ? 'at ' + formatTime(time) + ' ' + formatShortDate(time)
    : 'now';
}

// --- SEARCH ---

function setupSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const query = input.value.trim();

    if (query.length < 3) {
      results.classList.add('hidden');
      results.innerHTML = '';
      return;
    }

    results.classList.remove('hidden');
    results.innerHTML = '<div class="search-loading">Searching...</div>';

    searchDebounceTimer = setTimeout(async () => {
      try {
        const items = await Places.searchAddress(query);
        if (items.length === 0) {
          results.innerHTML = '<div class="search-loading">No results found</div>';
          return;
        }
        results.innerHTML = items.map((item, i) => `
          <div class="search-result-item" data-index="${i}">
            <div class="search-result-icon">${item.icon}</div>
            <div class="search-result-text">
              <div class="search-result-name">${escapeHtml(item.name)}</div>
              <div class="search-result-address">${escapeHtml(item.address)}</div>
            </div>
          </div>
        `).join('');

        results.querySelectorAll('.search-result-item').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.index);
            const place = items[idx];
            input.value = place.name;
            results.classList.add('hidden');
            loadPatiosForLocation(place.lat, place.lng, true);
          });
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
          });
        });
      } catch (err) {
        results.innerHTML = '<div class="search-loading">Search failed. Try again.</div>';
      }
    }, 350);
  });

  input.addEventListener('focus', () => {
    if (results.innerHTML && input.value.trim().length >= 3) {
      results.classList.remove('hidden');
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#search-bar')) {
      results.classList.add('hidden');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- TIME SLIDER ---

function initTimeSlider() {
  const slider = document.getElementById('time-slider');
  const now = new Date();

  buildTimeLabels(now);
  updateTimeDisplay(now);

  let sliderDebounce = null;
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    if (val === 0) {
      selectedTime = null;
      document.getElementById('time-now-btn').classList.add('active');
      document.getElementById('time-reset-btn').classList.add('hidden');
    } else {
      const minutesAhead = val * 15;
      selectedTime = new Date(now.getTime() + minutesAhead * 60000);
      document.getElementById('time-now-btn').classList.remove('active');
      document.getElementById('time-reset-btn').classList.remove('hidden');
    }

    updateTimeDisplay(getSelectedTime());
    updateSliderProgress(val);

    clearTimeout(sliderDebounce);
    sliderDebounce = setTimeout(() => {
      updateSunData();
      renderMarkers();
      renderPatioList();
      updateSunBanner();
      if (selectedPatio) showDetail(selectedPatio);
    }, 150);
  });

  document.getElementById('time-now-btn').addEventListener('click', resetTimeSlider);
  document.getElementById('time-reset-btn').addEventListener('click', resetTimeSlider);
}

function resetTimeSlider() {
  selectedTime = null;
  document.getElementById('time-slider').value = 0;
  document.getElementById('time-now-btn').classList.add('active');
  document.getElementById('time-reset-btn').classList.add('hidden');
  updateTimeDisplay(new Date());
  updateSliderProgress(0);
  updateSunData();
  renderMarkers();
  renderPatioList();
  updateSunBanner();
  if (selectedPatio) showDetail(selectedPatio);
}

function updateSliderProgress(val) {
  const pct = (val / 288) * 100;
  document.getElementById('time-slider-progress').style.width = pct + '%';
}

function updateTimeDisplay(date) {
  document.getElementById('time-display-date').textContent = formatShortDate(date);
  document.getElementById('time-display-time').textContent = formatTime(date);
}

function buildTimeLabels(startDate) {
  const labelsEl = document.getElementById('time-labels');
  const ticksEl = document.getElementById('time-ticks');

  const labels = [];
  const ticks = [];

  for (let i = 0; i <= 288; i++) {
    const t = new Date(startDate.getTime() + i * 15 * 60000);
    const h = t.getHours();
    const m = t.getMinutes();

    if (h === 0 && m === 0) {
      ticks.push(`<div class="time-tick day-start" style="left:${(i/288)*100}%"></div>`);
    } else if (m === 0 && h % 6 === 0) {
      ticks.push(`<div class="time-tick" style="left:${(i/288)*100}%"></div>`);
    }
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  labels.push(`<span class="time-label day-label">Now</span>`);

  for (let d = 1; d <= 3; d++) {
    const dayDate = new Date(startDate.getTime() + d * 86400000);
    labels.push(`<span class="time-label day-label">${dayNames[dayDate.getDay()]}</span>`);
  }

  labelsEl.innerHTML = labels.join('');
  ticksEl.innerHTML = ticks.join('');
}

// --- MARKERS ---

function renderMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  patios.forEach(patio => {
    if (!patio.sunData) return;
    if (!filterPatio(patio)) return;

    const status = getPatioStatus(patio);
    const icon = L.divIcon({
      className: 'patio-marker',
      html: `
        <div class="marker-dot ${status.class}">
          ${patio.emoji}
          ${status.class === 'sunny' ? '<div class="marker-sun-badge">☀</div>' : ''}
        </div>
        <div class="marker-label">${status.shortLabel}</div>
      `,
      iconSize: [36, 56],
      iconAnchor: [18, 28]
    });

    const marker = L.marker([patio.lat, patio.lng], { icon })
      .addTo(map)
      .on('click', () => showDetail(patio));

    markers.push(marker);
  });
}

function getPatioStatus(patio) {
  const sun = patio.sunData;
  if (!sun) return { class: 'shade', shortLabel: 'No data' };

  if (sun.currentlySunny) {
    const mins = Math.round(sun.remainingMinutes);
    if (mins > 60) {
      const h = Math.floor(mins / 60);
      return { class: 'sunny', shortLabel: `${h}h+ sun` };
    }
    return { class: mins > 30 ? 'sunny' : 'partial', shortLabel: `${mins}m sun` };
  }

  if (sun.nextSunIn !== null && sun.nextSunIn < 120) {
    const mins = Math.round(sun.nextSunIn);
    return { class: 'soon', shortLabel: `Sun in ${mins}m` };
  }

  return { class: 'shade', shortLabel: 'Shade' };
}

function filterPatio(patio) {
  if (activeFilter === 'all') return true;
  const status = getPatioStatus(patio);
  if (activeFilter === 'sunny') return status.class === 'sunny';
  if (activeFilter === 'soon') return status.class === 'soon' || status.class === 'partial';
  if (activeFilter === 'shade') return status.class === 'shade';
  return true;
}

// --- PATIO LIST ---

function renderPatioList() {
  const list = document.getElementById('patio-list');
  const filtered = patios.filter(filterPatio);

  const sunnyCount = patios.filter(p => p.sunData && p.sunData.currentlySunny).length;
  document.getElementById('patio-count').textContent = patios.length;
  document.getElementById('sunny-count').textContent = sunnyCount;

  if (filtered.length === 0 && patios.length > 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#5f6368;">No patios match this filter. Try "All".</div>';
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#5f6368;">Search for a location to find patios.</div>';
    return;
  }

  list.innerHTML = filtered.map(patio => {
    const status = getPatioStatus(patio);
    const sun = patio.sunData;
    let sunTimeText = '';
    let sunLabelText = '';

    if (sun.currentlySunny) {
      const mins = Math.round(sun.remainingMinutes);
      if (mins > 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        sunTimeText = `${h}h ${m}m`;
      } else {
        sunTimeText = `${mins}m`;
      }
      sunLabelText = 'sun left';
    } else if (sun.nextSunIn !== null) {
      const mins = Math.round(sun.nextSunIn);
      if (mins > 60) {
        const h = Math.floor(mins / 60);
        sunTimeText = `${h}h+`;
      } else {
        sunTimeText = `${mins}m`;
      }
      sunLabelText = 'until sun';
    } else {
      sunTimeText = '—';
      sunLabelText = 'shade';
    }

    const distText = patio.distance < 1000
      ? `${Math.round(patio.distance)}m`
      : `${(patio.distance / 1000).toFixed(1)}km`;

    return `
      <div class="patio-card" data-id="${patio.id}">
        <div class="patio-card-icon ${status.class}">${patio.emoji}</div>
        <div class="patio-card-info">
          <div class="patio-card-name">${escapeHtml(patio.name)}</div>
          <div class="patio-card-meta">
            <span>⭐ ${patio.rating}</span>
            <span>·</span>
            <span>${escapeHtml(patio.type)}</span>
            <span>·</span>
            <span>${distText}</span>
            ${patio.outdoorSeating ? '<span>· 🪑 Patio</span>' : ''}
          </div>
          ${patio.address ? `<div class="patio-card-address">${escapeHtml(patio.address)}</div>` : ''}
        </div>
        <div class="patio-card-sun">
          <div class="sun-time-left ${status.class}">${sunTimeText}</div>
          <div class="sun-label">${sunLabelText}</div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.patio-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const patio = patios.find(p => p.id === id);
      if (patio) showDetail(patio);
    });
  });
}

// --- DETAIL PANEL ---

function showDetail(patio) {
  selectedPatio = patio;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');

  const time = getSelectedTime();
  const sun = patio.sunData;
  const status = getPatioStatus(patio);
  const forecast = getForecast(patio, userLat, userLng);
  const future = isViewingFuture();

  let sunStatusText = '';
  let sunBigText = '';
  let shadeClass = '';

  if (sun.currentlySunny) {
    const mins = Math.round(sun.remainingMinutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    sunBigText = h > 0 ? `${h}h ${m}m` : `${m} min`;
    sunStatusText = future
      ? `of sun remaining at ${formatTime(time)}`
      : `of sunshine remaining · Shade at ${formatTime(sun.sunEndsAt)}`;
  } else if (sun.nextSunIn !== null) {
    const mins = Math.round(sun.nextSunIn);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    sunBigText = h > 0 ? `${h}h ${m}m` : `${m} min`;
    sunStatusText = future
      ? `until sun at ${formatTime(time)}`
      : `until sun arrives · Sun at ${formatTime(sun.sunStartsAt)}`;
    shadeClass = ' shade';
  } else {
    sunBigText = 'No sun';
    sunStatusText = future
      ? `expected at ${formatTime(time)} on ${formatShortDate(time)}`
      : 'This patio is in shade for the rest of the day';
    shadeClass = ' shade';
  }

  if (future && sun.currentlySunny) shadeClass = ' future';

  const totalH = Math.floor(sun.totalSunMinutes / 60);
  const totalM = sun.totalSunMinutes % 60;

  const gmapsUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${patio.lat},${patio.lng}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${patio.lat},${patio.lng}`;

  content.innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero-icon">${patio.emoji}</div>
      <h2>${escapeHtml(patio.name)}</h2>
      <div class="detail-hero-type">${escapeHtml(patio.type)} · ⭐ ${patio.rating} · ${patio.seats} seats</div>
      ${patio.address ? `<div class="detail-hero-address">📍 ${escapeHtml(patio.address)}</div>` : ''}
    </div>

    <div class="detail-sun-status${shadeClass}">
      <div class="detail-sun-big">${sunBigText}</div>
      <div class="detail-sun-desc">${sunStatusText}</div>
    </div>

    <div class="detail-info-row">
      <span class="detail-info-icon">🏗️</span>
      <span>${sun.buildingCount > 0 ? `Shadow analysis from <strong>${sun.buildingCount} nearby buildings</strong>` : 'No building data — showing unobstructed sun'}</span>
    </div>
    <div class="detail-info-row">
      <span class="detail-info-icon">☀️</span>
      <span>${totalH}h ${totalM}m of total sun today</span>
    </div>
    <div class="detail-info-row">
      <span class="detail-info-icon">🌅</span>
      <span>Sunrise ${formatTime(sun.sunrise)} · Sunset ${formatTime(sun.sunset)}</span>
    </div>
    ${patio.outdoorSeating ? `
    <div class="detail-info-row">
      <span class="detail-info-icon">🪑</span>
      <span>Confirmed outdoor seating</span>
    </div>` : `
    <div class="detail-info-row">
      <span class="detail-info-icon">🪑</span>
      <span>Outdoor seating likely (unconfirmed)</span>
    </div>`}

    <div class="sun-timeline">
      <h3>Sun Timeline — ${future ? formatShortDate(time) : 'Today'}</h3>
      ${renderTimeline(patio, time)}
    </div>

    <div class="forecast-section">
      <h3>3-Day Sun Forecast</h3>
      ${forecast.map(day => {
        const pct = Math.min(100, (day.totalSunHours / 14) * 100);
        const level = day.totalSunHours > 5 ? 'high' : day.totalSunHours > 2 ? 'medium' : 'low';
        return `
          <div class="forecast-day">
            <div class="forecast-day-name">${day.fullDay}</div>
            <div class="forecast-bar-wrap">
              <div class="forecast-bar-fill ${level}" style="width: ${pct}%"></div>
            </div>
            <div class="forecast-hours">${day.totalSunHours}h</div>
            <div class="forecast-cloud">${day.cloudCover > 30 ? '☁️' : '☀️'}</div>
          </div>
        `;
      }).join('')}
    </div>

    <button class="directions-btn" onclick="window.open('${directionsUrl}', '_blank')">
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="white" d="M21.71 11.29l-9-9a.996.996 0 0 0-1.41 0l-9 9a.996.996 0 0 0 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 0 0 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>
      Get Directions
    </button>
    <a class="gmaps-link" href="${gmapsUrl}" target="_blank" rel="noopener">
      View on Google Maps
    </a>
  `;

  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
}

function renderTimeline(patio, viewTime) {
  const sun = patio.sunData;
  if (!sun.segments.length && !sun.sunrise) {
    return '<div style="text-align:center;color:#9aa0a6;padding:12px;">No sun data</div>';
  }

  const dayStart = new Date(sun.sunrise);
  dayStart.setMinutes(dayStart.getMinutes() - 30);
  const dayEnd = new Date(sun.sunset);
  dayEnd.setMinutes(dayEnd.getMinutes() + 30);
  const totalMs = dayEnd - dayStart;

  if (totalMs <= 0) {
    return '<div style="text-align:center;color:#9aa0a6;padding:12px;">Sun does not rise</div>';
  }

  let segmentsHtml = '';
  let currentSegStart = null;
  let currentType = null;

  sun.segments.forEach((seg, i) => {
    if (currentType !== seg.type) {
      if (currentSegStart !== null) {
        const left = ((currentSegStart - dayStart) / totalMs * 100);
        const width = ((seg.time - currentSegStart) / totalMs * 100);
        segmentsHtml += `<div class="timeline-sun-segment ${currentType === 'full' ? 'full-sun' : 'partial-sun'}" style="left:${left}%;width:${width}%"></div>`;
      }
      currentSegStart = seg.time;
      currentType = seg.type;
    }

    if (i === sun.segments.length - 1) {
      const endTime = new Date(seg.time.getTime() + 15 * 60000);
      const left = ((currentSegStart - dayStart) / totalMs * 100);
      const width = ((endTime - currentSegStart) / totalMs * 100);
      segmentsHtml += `<div class="timeline-sun-segment ${currentType === 'full' ? 'full-sun' : 'partial-sun'}" style="left:${left}%;width:${width}%"></div>`;
    }
  });

  const now = new Date();
  let nowMarker = '';
  const sameDay = now.toDateString() === viewTime.toDateString();
  if (sameDay && now >= dayStart && now <= dayEnd) {
    const nowPct = ((now - dayStart) / totalMs * 100);
    nowMarker = `
      <div class="timeline-now-marker" style="left:${nowPct}%">
        <div class="timeline-now-label">Now</div>
      </div>
    `;
  }

  let selectedMarker = '';
  if (isViewingFuture() && viewTime >= dayStart && viewTime <= dayEnd) {
    const selPct = ((viewTime - dayStart) / totalMs * 100);
    selectedMarker = `
      <div class="timeline-selected-marker" style="left:${selPct}%">
        <div class="timeline-selected-label">${formatTime(viewTime)}</div>
      </div>
    `;
  }

  return `
    <div class="timeline-bar-container">
      ${segmentsHtml}
      ${nowMarker}
      ${selectedMarker}
    </div>
    <div class="timeline-labels">
      <span>${formatTime(sun.sunrise)}</span>
      <span>12:00 PM</span>
      <span>${formatTime(sun.sunset)}</span>
    </div>
  `;
}

// --- EVENT LISTENERS ---

function setupEventListeners() {
  setupSearch();

  const sheet = document.getElementById('bottom-sheet');
  const handle = document.getElementById('sheet-handle');

  function setSheetState(state) {
    sheet.classList.remove('collapsed', 'expanded', 'fully-collapsed');
    sheet.classList.add(state);
  }

  handle.addEventListener('click', () => {
    if (sheet.classList.contains('fully-collapsed')) {
      setSheetState('collapsed');
    } else if (sheet.classList.contains('collapsed')) {
      setSheetState('expanded');
    } else {
      setSheetState('collapsed');
    }
  });

  document.getElementById('sheet-header').addEventListener('click', () => {
    if (!sheet.classList.contains('fully-collapsed')) {
      setSheetState('fully-collapsed');
    }
  });

  let touchStartY = 0;
  handle.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  });
  handle.addEventListener('touchend', e => {
    const diff = e.changedTouches[0].clientY - touchStartY;
    if (diff < -50) {
      sheet.classList.remove('collapsed');
      sheet.classList.add('expanded');
    } else if (diff > 50) {
      sheet.classList.remove('expanded');
      sheet.classList.add('collapsed');
    }
  });

  document.getElementById('detail-close').addEventListener('click', () => {
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('visible');
    setTimeout(() => {
      panel.classList.add('hidden');
      selectedPatio = null;
    }, 300);
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderMarkers();
      renderPatioList();
    });
  });

  document.getElementById('locate-btn').addEventListener('click', locateUser);

  let moveDebounce = null;
  map.on('moveend', () => {
    clearTimeout(moveDebounce);
    moveDebounce = setTimeout(() => {
      if (isLoadingPlaces) return;
      const center = map.getCenter();
      const dist = map.distance([userLat, userLng], [center.lat, center.lng]);
      if (dist > 800) {
        loadPatiosForLocation(center.lat, center.lng, false);
      }
    }, 1000);
  });

  setInterval(() => {
    if (!isViewingFuture()) {
      updateSunData();
      renderMarkers();
      renderPatioList();
      updateSunBanner();
    }
  }, 60000);
}

// --- UTILS ---

function formatTime(date) {
  if (!date || isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatShortDate(date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

document.addEventListener('DOMContentLoaded', init);
