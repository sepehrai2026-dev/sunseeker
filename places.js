const Places = (function () {

  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  async function searchAddress(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.map(item => ({
      displayName: item.display_name,
      name: item.name || item.display_name.split(',')[0],
      address: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
      icon: getAddressIcon(item.type, item.class)
    }));
  }

  function getAddressIcon(type, cls) {
    if (cls === 'amenity') return '📍';
    if (type === 'city' || type === 'town') return '🏙️';
    if (type === 'suburb' || type === 'neighbourhood') return '🏘️';
    if (type === 'road' || type === 'street') return '🛤️';
    if (type === 'village') return '🏡';
    return '📍';
  }

  async function fetchPatiosNear(lat, lng, radiusMeters) {
    radiusMeters = radiusMeters || 1500;

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"restaurant|cafe|bar|pub|biergarten"]["outdoor_seating"="yes"](around:${radiusMeters},${lat},${lng});
        node["amenity"~"restaurant|cafe|bar|pub"]["cuisine"](around:${radiusMeters},${lat},${lng});
        node["amenity"="biergarten"](around:${radiusMeters},${lat},${lng});
        node["leisure"="beer_garden"](around:${radiusMeters},${lat},${lng});
        way["amenity"~"restaurant|cafe|bar|pub|biergarten"]["outdoor_seating"="yes"](around:${radiusMeters},${lat},${lng});
        way["amenity"~"restaurant|cafe|bar|pub"]["cuisine"](around:${radiusMeters},${lat},${lng});
      );
      out center body 60;
    `;

    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!resp.ok) throw new Error('Overpass API request failed');
    const data = await resp.json();

    const seen = new Set();
    const places = [];

    for (const el of data.elements) {
      const elLat = el.lat || (el.center && el.center.lat);
      const elLng = el.lon || (el.center && el.center.lon);
      if (!elLat || !elLng) continue;

      const tags = el.tags || {};
      const name = tags.name;
      if (!name) continue;

      const key = name + '|' + elLat.toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);

      const amenity = tags.amenity || tags.leisure || '';
      const cuisine = tags.cuisine || '';
      const outdoorSeating = tags.outdoor_seating === 'yes' || amenity === 'biergarten' || tags.leisure === 'beer_garden';

      const addr = buildAddress(tags);
      const typeLabel = getTypeLabel(amenity, cuisine);
      const emoji = getPlaceEmoji(amenity, cuisine);

      const dlat = elLat - lat;
      const dlng = elLng - lng;
      const distance = Math.sqrt(dlat * dlat + dlng * dlng) * 111000;

      places.push({
        id: el.id,
        name: name,
        type: typeLabel,
        emoji: emoji,
        lat: elLat,
        lng: elLng,
        address: addr,
        cuisine: cuisine,
        outdoorSeating: outdoorSeating,
        distance: distance,
        rating: (3.8 + pseudoRandom(el.id * 3) * 1.2).toFixed(1),
        seats: 8 + Math.floor(pseudoRandom(el.id * 11) * 35),
        osmId: el.id,
        nearbyBuildings: null,
        sunData: null
      });
    }

    places.sort((a, b) => {
      if (a.outdoorSeating && !b.outdoorSeating) return -1;
      if (!a.outdoorSeating && b.outdoorSeating) return 1;
      return a.distance - b.distance;
    });

    return places.slice(0, 40);
  }

  async function fetchBuildingsNear(lat, lng, radiusMeters) {
    radiusMeters = radiusMeters || 200;

    const query = `
      [out:json][timeout:20];
      (
        way["building"](around:${radiusMeters},${lat},${lng});
      );
      out body geom;
    `;

    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!resp.ok) return [];
    const data = await resp.json();

    const buildings = [];
    for (const el of data.elements) {
      if (el.type !== 'way' || !el.geometry) continue;

      const tags = el.tags || {};
      const height = parseBuildingHeight(tags);
      const polygon = el.geometry.map(p => [p.lat, p.lon]);

      if (polygon.length < 3) continue;

      buildings.push({
        id: el.id,
        height: height,
        polygon: polygon
      });
    }

    return buildings;
  }

  function parseBuildingHeight(tags) {
    if (tags.height) {
      const h = parseFloat(tags.height);
      if (!isNaN(h)) return h;
    }
    if (tags['building:levels']) {
      const levels = parseInt(tags['building:levels']);
      if (!isNaN(levels)) return levels * 3.5;
    }
    const type = tags.building;
    if (type === 'house' || type === 'residential') return 8;
    if (type === 'apartments') return 15;
    if (type === 'commercial' || type === 'office') return 18;
    if (type === 'industrial' || type === 'warehouse') return 10;
    if (type === 'church' || type === 'cathedral') return 20;
    if (type === 'garage' || type === 'garages') return 3;
    if (type === 'shed' || type === 'roof') return 3;
    return 10;
  }

  async function fetchBuildingsForPatios(patios) {
    if (patios.length === 0) return;

    const minLat = Math.min(...patios.map(p => p.lat)) - 0.001;
    const maxLat = Math.max(...patios.map(p => p.lat)) + 0.001;
    const minLng = Math.min(...patios.map(p => p.lng)) - 0.0015;
    const maxLng = Math.max(...patios.map(p => p.lng)) + 0.0015;

    const query = `
      [out:json][timeout:20];
      (
        way["building"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out body geom 500;
    `;

    let data;
    try {
      const resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (!resp.ok) return;
      data = await resp.json();
    } catch (e) {
      console.warn('Building fetch failed:', e);
      return;
    }

    const cosLat = Math.cos(patios[0].lat * Math.PI / 180);
    const allBuildings = [];
    for (const el of data.elements) {
      if (el.type !== 'way' || !el.geometry) continue;
      const tags = el.tags || {};
      const height = parseBuildingHeight(tags);
      if (height < 3) continue;

      const polygon = el.geometry.map(p => [p.lat, p.lon]);
      if (polygon.length < 3) continue;

      const clat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
      const clng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;

      allBuildings.push({ id: el.id, height, polygon, clat, clng });
    }

    for (const patio of patios) {
      const scored = [];
      for (const b of allBuildings) {
        const dLat = (b.clat - patio.lat) * 111000;
        const dLng = (b.clng - patio.lng) * 111000 * cosLat;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist < 120) {
          scored.push({ b, dist });
        }
      }
      scored.sort((a, b) => a.dist - b.dist);
      patio.nearbyBuildings = scored.slice(0, 12).map(s => s.b);
    }

    return allBuildings;
  }

  function buildAddress(tags) {
    const parts = [];
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    if (parts.length === 0 && tags['addr:full']) return tags['addr:full'];
    return parts.join(' ') || '';
  }

  function getTypeLabel(amenity, cuisine) {
    const cuisineMap = {
      'italian': 'Italian Restaurant', 'pizza': 'Pizzeria',
      'mexican': 'Mexican Restaurant', 'japanese': 'Japanese Restaurant',
      'sushi': 'Sushi Restaurant', 'chinese': 'Chinese Restaurant',
      'thai': 'Thai Restaurant', 'indian': 'Indian Restaurant',
      'french': 'French Restaurant', 'american': 'American Restaurant',
      'burger': 'Burger Joint', 'seafood': 'Seafood Restaurant',
      'mediterranean': 'Mediterranean', 'greek': 'Greek Restaurant',
      'vietnamese': 'Vietnamese Restaurant', 'korean': 'Korean Restaurant',
      'spanish': 'Spanish Restaurant', 'turkish': 'Turkish Restaurant',
      'coffee_shop': 'Coffee Shop',
    };
    if (cuisine) {
      const first = cuisine.split(';')[0].trim().toLowerCase();
      if (cuisineMap[first]) return cuisineMap[first];
    }
    const amenityMap = {
      'restaurant': 'Restaurant', 'cafe': 'Café', 'bar': 'Bar',
      'pub': 'Pub', 'biergarten': 'Beer Garden', 'beer_garden': 'Beer Garden',
    };
    return amenityMap[amenity] || 'Restaurant';
  }

  function getPlaceEmoji(amenity, cuisine) {
    if (amenity === 'cafe') return '☕';
    if (amenity === 'bar') return '🍹';
    if (amenity === 'pub') return '🍺';
    if (amenity === 'biergarten' || amenity === 'beer_garden') return '🍺';
    if (cuisine) {
      const c = cuisine.split(';')[0].trim().toLowerCase();
      const map = {
        'italian': '🍕', 'pizza': '🍕', 'mexican': '🌮', 'japanese': '🍣',
        'sushi': '🍣', 'chinese': '🥡', 'thai': '🍜', 'indian': '🍛',
        'french': '🥐', 'burger': '🍔', 'seafood': '🦐', 'greek': '🥙',
        'vietnamese': '🍜', 'korean': '🍜', 'american': '🍔',
        'coffee_shop': '☕', 'ice_cream': '🍦', 'kebab': '🥙',
      };
      if (map[c]) return map[c];
    }
    return '🍽️';
  }

  function pseudoRandom(seed) {
    let s = Math.abs(Math.floor(seed)) || 1;
    s = (s * 16807 + 0) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  }

  return { searchAddress, fetchPatiosNear, fetchBuildingsNear, fetchBuildingsForPatios };
})();


// ============================================================
// Shadow ray-casting engine
// ============================================================

const ShadowEngine = (function () {
  const DEG2RAD = Math.PI / 180;
  const METERS_PER_DEG_LAT = 111320;

  function metersPerDegLng(lat) {
    return 111320 * Math.cos(lat * DEG2RAD);
  }

  function toLocalMeters(lat, lng, refLat, refLng) {
    return [
      (lng - refLng) * metersPerDegLng(refLat),
      (lat - refLat) * METERS_PER_DEG_LAT
    ];
  }

  function isPointInShadow(patioLat, patioLng, sunAltDeg, sunAzDeg, buildings) {
    if (sunAltDeg <= 0) return true;
    if (!buildings || buildings.length === 0) return false;

    const sunAltRad = sunAltDeg * DEG2RAD;
    const sunAzRad = sunAzDeg * DEG2RAD;

    // Direction FROM sun TO ground (where the shadow falls)
    // azimuth: 0=N, 90=E, 180=S, 270=W (geographic)
    // shadow direction is opposite to sun direction
    const shadowDirX = -Math.sin(sunAzRad); // east component
    const shadowDirY = -Math.cos(sunAzRad); // north component

    for (const building of buildings) {
      if (isBlockedByBuilding(
        patioLat, patioLng,
        sunAltRad, shadowDirX, shadowDirY,
        building
      )) {
        return true;
      }
    }

    return false;
  }

  function isBlockedByBuilding(patioLat, patioLng, sunAltRad, shadowDirX, shadowDirY, building) {
    const height = building.height;
    if (height <= 0) return false;

    const shadowLen = height / Math.tan(sunAltRad);
    if (shadowLen <= 0 || shadowLen > 250) return false;

    const mPerDegLng = metersPerDegLng(patioLat);

    const cX = (building.clng - patioLng) * mPerDegLng;
    const cY = (building.clat - patioLat) * METERS_PER_DEG_LAT;
    const centroidDist = Math.sqrt(cX * cX + cY * cY);
    if (centroidDist > shadowLen + 50) return false;

    // Check the patio is on the shadow side of the building
    const dotShadow = cX * (-shadowDirX) + cY * (-shadowDirY);
    if (dotShadow < -20) return false;

    const poly = building.polygon;
    const localPoly = poly.map(([lat, lng]) => [
      (lng - patioLng) * mPerDegLng,
      (lat - patioLat) * METERS_PER_DEG_LAT
    ]);

    if (pointInPolygon(0, 0, localPoly)) return false;

    for (let i = 0; i < localPoly.length - 1; i++) {
      const [ax, ay] = localPoly[i];
      const [bx, by] = localPoly[i + 1];

      const sax = ax + shadowDirX * shadowLen;
      const say = ay + shadowDirY * shadowLen;
      const sbx = bx + shadowDirX * shadowLen;
      const sby = by + shadowDirY * shadowLen;

      if (pointInQuad(0, 0, ax, ay, bx, by, sbx, sby, sax, say)) {
        return true;
      }
    }

    return false;
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInQuad(px, py, x1, y1, x2, y2, x3, y3, x4, y4) {
    // Check point in quadrilateral using cross products
    return (
      crossSign(x1, y1, x2, y2, px, py) >= 0 &&
      crossSign(x2, y2, x3, y3, px, py) >= 0 &&
      crossSign(x3, y3, x4, y4, px, py) >= 0 &&
      crossSign(x4, y4, x1, y1, px, py) >= 0
    ) || (
      crossSign(x1, y1, x2, y2, px, py) <= 0 &&
      crossSign(x2, y2, x3, y3, px, py) <= 0 &&
      crossSign(x3, y3, x4, y4, px, py) <= 0 &&
      crossSign(x4, y4, x1, y1, px, py) <= 0
    );
  }

  function crossSign(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  }

  return { isPointInShadow };
})();


// ============================================================
// Sun exposure calculator using real shadow casting
// ============================================================

function calculateSunExposure(patio, date, lat, lng) {
  const times = SunCalc.getTimes(date, lat, lng);
  const sunrise = times.sunrise;
  const sunset = times.sunset;
  const now = date;

  const sunSegments = [];
  let totalSunMinutes = 0;
  let currentlySunny = false;
  let sunEndsAt = null;
  let sunStartsAt = null;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const buildings = patio.nearbyBuildings;
  const hasBuildings = buildings && buildings.length > 0;
  const step = hasBuildings ? 30 : 15;

  for (let m = 0; m < 24 * 60; m += step) {
    const checkTime = new Date(dayStart);
    checkTime.setMinutes(m);

    if (checkTime < sunrise || checkTime > sunset) continue;

    const sunPos = SunCalc.getPosition(checkTime, lat, lng);
    const altDeg = sunPos.altitude * (180 / Math.PI);
    // SunCalc azimuth: 0 = south, positive = west. Convert to geographic: 0 = north, 90 = east
    const azRad = sunPos.azimuth; // radians, 0=south, + = west
    const azDegGeo = (azRad * 180 / Math.PI + 180 + 360) % 360; // geographic: 0=N

    if (altDeg <= 0) continue;

    let inSun;
    if (hasBuildings) {
      inSun = !ShadowEngine.isPointInShadow(patio.lat, patio.lng, altDeg, azDegGeo, buildings);
    } else {
      // No building data: assume sunny when sun is above horizon
      inSun = altDeg > 5;
    }

    if (inSun) {
      totalSunMinutes += step;
      sunSegments.push({
        time: new Date(checkTime),
        score: altDeg > 30 ? 1.0 : altDeg / 30,
        type: altDeg > 20 ? 'full' : 'partial'
      });

      if (checkTime <= now && new Date(checkTime.getTime() + step * 60000) > now) {
        currentlySunny = true;
      }

      if (checkTime > now && !sunEndsAt) {
        if (!currentlySunny && !sunStartsAt) {
          sunStartsAt = new Date(checkTime);
        }
      }
    } else {
      if (currentlySunny && checkTime > now && !sunEndsAt) {
        sunEndsAt = new Date(checkTime);
      }
    }
  }

  if (currentlySunny && !sunEndsAt) {
    sunEndsAt = sunset;
  }

  const remainingMinutes = sunEndsAt && currentlySunny
    ? Math.max(0, (sunEndsAt.getTime() - now.getTime()) / 60000)
    : 0;

  let nextSunIn = null;
  if (!currentlySunny && sunStartsAt) {
    nextSunIn = Math.max(0, (sunStartsAt.getTime() - now.getTime()) / 60000);
  }

  return {
    currentlySunny,
    remainingMinutes,
    totalSunMinutes,
    sunEndsAt,
    sunStartsAt,
    nextSunIn,
    segments: sunSegments,
    sunrise,
    sunset,
    buildingCount: hasBuildings ? buildings.length : 0
  };
}

function getForecast(patio, baseLat, baseLng) {
  const forecast = [];
  const today = new Date();

  for (let d = 0; d < 3; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d + 1);
    date.setHours(12, 0, 0, 0);

    const exposure = calculateSunExposure(patio, date, baseLat, baseLng);
    const totalHours = exposure.totalSunMinutes / 60;

    const seeded = ((patio.id * 7 + d * 13 + 42) % 100) / 100;
    const cloudCover = Math.floor(seeded * 60);
    const adjustedHours = totalHours * (1 - cloudCover / 100 * 0.7);

    forecast.push({
      date,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      fullDay: date.toLocaleDateString('en-US', { weekday: 'long' }),
      totalSunHours: Math.round(adjustedHours * 10) / 10,
      maxPossibleHours: totalHours,
      cloudCover
    });
  }

  return forecast;
}
