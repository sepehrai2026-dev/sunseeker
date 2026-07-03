const SunCalc = (function () {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const DAY_MS = 1000 * 60 * 60 * 24;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const E = RAD * 23.4397;

  function toJulian(date) { return date.valueOf() / DAY_MS - 0.5 + J1970; }
  function fromJulian(j) { return new Date((j + 0.5 - J1970) * DAY_MS); }
  function toDays(date) { return toJulian(date) - J2000; }

  function rightAscension(l, b) { return Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l)); }
  function declination(l, b) { return Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l)); }
  function azimuth(H, phi, dec) { return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); }
  function altitude(H, phi, dec) { return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)); }
  function siderealTime(d, lw) { return RAD * (280.16 + 360.9856235 * d) - lw; }

  function solarMeanAnomaly(d) { return RAD * (357.5291 + 0.98560028 * d); }
  function eclipticLongitude(M) {
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = RAD * 102.9372;
    return M + C + P + Math.PI;
  }
  function sunCoords(d) {
    const M = solarMeanAnomaly(d);
    const L = eclipticLongitude(M);
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }

  function getPosition(date, lat, lng) {
    const lw = RAD * -lng;
    const phi = RAD * lat;
    const d = toDays(date);
    const c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    return {
      azimuth: azimuth(H, phi, c.dec) + Math.PI,
      altitude: altitude(H, phi, c.dec)
    };
  }

  function julianCycle(d, lw) { return Math.round(d - 0.0009 - lw / (2 * Math.PI)); }
  function approxTransit(Ht, lw, n) { return 0.0009 + (Ht + lw) / (2 * Math.PI) + n; }
  function solarTransitJ(ds, M, L) { return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L); }
  function hourAngle(h, phi, d) {
    const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d));
    if (cosH > 1) return 0;
    if (cosH < -1) return Math.PI;
    return Math.acos(cosH);
  }

  function getSetJ(h, lw, phi, dec, n, M, L) {
    const w = hourAngle(h, phi, dec);
    const a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
  }

  function getTimes(date, lat, lng) {
    const lw = RAD * -lng;
    const phi = RAD * lat;
    const d = toDays(date);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L, 0);
    const Jnoon = solarTransitJ(ds, M, L);

    const h0 = RAD * -0.833;
    const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);

    const hGolden = RAD * 6;
    const JsetGolden = getSetJ(hGolden, lw, phi, dec, n, M, L);
    const JriseGolden = Jnoon - (JsetGolden - Jnoon);

    return {
      sunrise: fromJulian(Jrise),
      sunset: fromJulian(Jset),
      solarNoon: fromJulian(Jnoon),
      goldenHourStart: fromJulian(JsetGolden),
      goldenHourEnd: fromJulian(Jset),
      dawn: fromJulian(Jrise),
      dusk: fromJulian(Jset)
    };
  }

  function getSunHoursForDay(date, lat, lng) {
    const times = getTimes(date, lat, lng);
    const sunrise = times.sunrise;
    const sunset = times.sunset;
    const totalMs = sunset.getTime() - sunrise.getTime();
    return Math.max(0, totalMs / (1000 * 60 * 60));
  }

  return { getPosition, getTimes, getSunHoursForDay };
})();
