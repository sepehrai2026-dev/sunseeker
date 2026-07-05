function initTool(container) {
  const cities = [
    { name: 'New York', tz: 'America/New_York', flag: '🇺🇸' },
    { name: 'Los Angeles', tz: 'America/Los_Angeles', flag: '🇺🇸' },
    { name: 'London', tz: 'Europe/London', flag: '🇬🇧' },
    { name: 'Berlin', tz: 'Europe/Berlin', flag: '🇩🇪' },
    { name: 'Dubai', tz: 'Asia/Dubai', flag: '🇦🇪' },
    { name: 'Mumbai', tz: 'Asia/Kolkata', flag: '🇮🇳' },
    { name: 'Singapore', tz: 'Asia/Singapore', flag: '🇸🇬' },
    { name: 'Tokyo', tz: 'Asia/Tokyo', flag: '🇯🇵' },
    { name: 'Sydney', tz: 'Australia/Sydney', flag: '🇦🇺' },
    { name: 'São Paulo', tz: 'America/Sao_Paulo', flag: '🇧🇷' },
    { name: 'Toronto', tz: 'America/Toronto', flag: '🇨🇦' },
    { name: 'Paris', tz: 'Europe/Paris', flag: '🇫🇷' },
    { name: 'Amsterdam', tz: 'Europe/Amsterdam', flag: '🇳🇱' },
    { name: 'Lagos', tz: 'Africa/Lagos', flag: '🇳🇬' },
    { name: 'Nairobi', tz: 'Africa/Nairobi', flag: '🇰🇪' },
    { name: 'Bangkok', tz: 'Asia/Bangkok', flag: '🇹🇭' },
    { name: 'Seoul', tz: 'Asia/Seoul', flag: '🇰🇷' },
    { name: 'Jakarta', tz: 'Asia/Jakarta', flag: '🇮🇩' },
    { name: 'Mexico City', tz: 'America/Mexico_City', flag: '🇲🇽' },
    { name: 'Buenos Aires', tz: 'America/Argentina/Buenos_Aires', flag: '🇦🇷' }
  ];

  const options = cities.map(c => `<option value="${c.tz}">${c.flag} ${c.name}</option>`).join('');

  container.innerHTML = `
    <h3>Timezone overlap calculator</h3>
    <div class="tool-row">
      <div>
        <label for="city1">Location 1</label>
        <select id="city1">${options}</select>
      </div>
      <div>
        <label for="city2">Location 2</label>
        <select id="city2">${options}</select>
      </div>
    </div>
    <div style="margin-top:1rem">
      <label for="city3">Location 3 (optional)</label>
      <select id="city3"><option value="">— none —</option>${options}</select>
    </div>
    <button id="calc-btn">Calculate overlap</button>
    <div id="tz-result"></div>
  `;

  document.getElementById('city2').value = 'Europe/London';

  document.getElementById('calc-btn').addEventListener('click', () => {
    const selected = [
      document.getElementById('city1').value,
      document.getElementById('city2').value,
    ];
    const c3 = document.getElementById('city3').value;
    if (c3) selected.push(c3);

    const now = new Date();
    const offsets = selected.map(tz => {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false, timeZoneName: 'shortOffset' });
      const parts = fmt.formatToParts(now);
      const hourStr = parts.find(p => p.type === 'hour')?.value || '0';
      const utcPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
      const match = utcPart.match(/([+-]?\d+)/);
      const offsetHrs = match ? parseInt(match[1]) : 0;
      const city = cities.find(c => c.tz === tz);
      return { tz, name: city ? `${city.flag} ${city.name}` : tz, offset: offsetHrs };
    });

    const hours = [];
    for (let h = 0; h < 24; h++) {
      const localHours = offsets.map(o => ((h + o.offset) % 24 + 24) % 24);
      const allWorking = localHours.every(lh => lh >= 9 && lh < 17);
      hours.push({ utc: h, localHours, allWorking });
    }

    const overlap = hours.filter(h => h.allWorking);

    let html = '<div class="tool-result">';
    html += '<strong>Current times:</strong><br>';
    offsets.forEach(o => {
      const t = new Date().toLocaleTimeString('en-US', { timeZone: o.tz, hour: '2-digit', minute: '2-digit', hour12: true });
      html += `${o.name}: <strong>${t}</strong> (UTC${o.offset >= 0 ? '+' : ''}${o.offset})<br>`;
    });

    html += `<br><strong>Overlap (9am–5pm working hours):</strong><br>`;
    if (overlap.length === 0) {
      html += 'No overlapping working hours found. Consider async communication or adjusted schedules.';
    } else {
      html += `<strong style="color:var(--accent)">${overlap.length} hours</strong> of overlap<br><br>`;
      html += '<div style="display:flex;gap:2px;margin:0.5rem 0;flex-wrap:wrap">';
      for (let h = 0; h < 24; h++) {
        const isOverlap = hours[h].allWorking;
        const bg = isOverlap ? 'var(--accent)' : 'var(--border)';
        const color = isOverlap ? '#fff' : 'var(--text-muted)';
        const label = h.toString().padStart(2, '0');
        html += `<div style="width:28px;height:32px;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;border-radius:4px;font-weight:${isOverlap ? '600' : '400'}" title="UTC ${label}:00">${label}</div>`;
      }
      html += '</div>';
      html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">Hours shown in UTC. Highlighted = all locations within 9am–5pm.</div>';

      html += '<br>';
      offsets.forEach(o => {
        const start = overlap[0];
        const end = overlap[overlap.length - 1];
        const localStart = ((start.utc + o.offset) % 24 + 24) % 24;
        const localEnd = (((end.utc + 1) + o.offset) % 24 + 24) % 24;
        const fmt = h => `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'am' : 'pm'}`;
        html += `${o.name}: ${fmt(localStart)} – ${fmt(localEnd)}<br>`;
      });
    }

    html += '</div>';
    document.getElementById('tz-result').innerHTML = html;
  });
}
