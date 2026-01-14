
import L from 'leaflet';

export interface RoadFetchOptions {
  includeFederal: boolean;
  includeRegional: boolean;
  signal?: AbortSignal;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

// Глобальный кеш для дорог
const roadCache = new Map<string, any>();

/**
 * Вспомогательная функция для сшивки сегментов путей.
 */
function stitchWaysToRings(ways: any[][]): any[][] {
  if (ways.length === 0) return [];
  const segments = ways.map(w => [...w]);
  const rings: any[][] = [];
  while (segments.length > 0) {
    let currentRing = segments.shift()!;
    let added = true;
    while (added) {
      added = false;
      const start = currentRing[0];
      const end = currentRing[currentRing.length - 1];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const sSeg = seg[0];
        const eSeg = seg[seg.length - 1];
        const isSame = (p1: any, p2: any) => Math.abs(p1[0] - p2[0]) < 1e-7 && Math.abs(p1[1] - p2[1]) < 1e-7;
        if (isSame(end, sSeg)) {
          currentRing.push(...seg.slice(1));
          segments.splice(i, 1);
          added = true;
          break;
        } else if (isSame(end, eSeg)) {
          currentRing.push(...[...seg].reverse().slice(1));
          segments.splice(i, 1);
          added = true;
          break;
        } else if (isSame(start, eSeg)) {
          currentRing.unshift(...seg.slice(0, -1));
          segments.splice(i, 1);
          added = true;
          break;
        } else if (isSame(start, sSeg)) {
          currentRing.unshift(...[...seg].reverse().slice(0, -1));
          segments.splice(i, 1);
          added = true;
          break;
        }
      }
    }
    rings.push(currentRing);
  }
  return rings;
}

/**
 * Получение границы по OSM ID.
 */
export async function fetchBoundaryByOsmId(osmId: number | number[], osmType: string, externalSignal?: AbortSignal): Promise<any | null> {
  const ids = Array.isArray(osmId) ? osmId : [osmId];
  const runQuery = async (q: string) => {
    for (const url of OVERPASS_ENDPOINTS) {
      if (externalSignal?.aborted) return null;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(q)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: externalSignal || controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) return await response.json();
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError' && externalSignal?.aborted) return null;
      }
    }
    return null;
  };

  let query = `[out:json][timeout:90]; (`;
  ids.forEach(id => { query += `${osmType}(${id});`; });
  query += `); out geom qt;`;

  let data = await runQuery(query);
  if (!data || !data.elements || data.elements.length === 0) return null;

  const rawWays: any[][] = [];
  let commonName = "";
  let commonTags = {};
  data.elements.forEach((el: any) => {
    const tags = el.tags || {};
    if (!commonName) commonName = tags.name || tags['name:ru'] || tags['official_name'] || "Объект";
    commonTags = { ...commonTags, ...tags };
    if (el.type === 'way' && el.geometry) {
      rawWays.push(el.geometry.map((pt: any) => [pt.lon, pt.lat]));
    } else if (el.type === 'relation' && el.members) {
      el.members.forEach((m: any) => {
        if (m.type === 'way' && m.geometry && (m.role === 'outer' || !m.role)) {
          rawWays.push(m.geometry.map((pt: any) => [pt.lon, pt.lat]));
        }
      });
    }
  });

  if (rawWays.length === 0 && data.elements[0].type === 'node') {
    return {
      type: "Feature",
      properties: { name: commonName, ...commonTags, osmId: ids[0], osmType: 'node' },
      geometry: { type: "Point", coordinates: [data.elements[0].lon, data.elements[0].lat] }
    };
  }
  if (rawWays.length === 0) return null;
  const rings = stitchWaysToRings(rawWays);
  return {
    type: "Feature",
    properties: { name: commonName, id: `osm-${ids.join('-')}`, osmId: ids[0], osmType: data.elements[0].type, ...commonTags },
    geometry: { type: rings.length > 1 ? "MultiPolygon" : "Polygon", coordinates: rings.length > 1 ? rings.map(r => [r]) : [rings[0]] }
  };
}

/**
 * Получение дорог для выбранных целей.
 */
export async function fetchRoadsForTargets(targets: any[], options: RoadFetchOptions): Promise<any> {
  if (targets.length === 0 || (!options.includeFederal && !options.includeRegional)) {
    return { type: "FeatureCollection", features: [] };
  }
  
  const targetKeys = targets.map(t => t.properties.osmId || t.properties.name).sort().join('|');
  const cacheKey = `${targetKeys}-F:${options.includeFederal}-R:${options.includeRegional}`;
  if (roadCache.has(cacheKey)) return roadCache.get(cacheKey);

  const fedRefRegex = '^[MРAМРАMRA]-.*';
  const areaQueries: string[] = [];

  targets.forEach((target) => {
    const osmId = target.properties.osmId;
    const name = target.properties.name;
    const osmType = target.properties.osmType || 'relation';
    
    if (osmId) {
      const ids = Array.isArray(osmId) ? osmId : [osmId];
      ids.forEach(id => {
        const areaId = (osmType === 'way' ? 2400000000 : 3600000000) + id;
        areaQueries.push(`area(${areaId})`);
      });
    } 
    else if (name) {
      // Ищем административную границу по имени (для GeoJSON регионов)
      areaQueries.push(`area["name"="${name}"]["boundary"="administrative"]`);
    }
  });

  if (areaQueries.length === 0) return { type: "FeatureCollection", features: [] };

  // Оптимизированный запрос: сначала собираем все зоны в одну переменную, 
  // потом ищем дороги сразу по всей суммарной территории.
  const query = `
    [out:json][timeout:180];
    (
      ${areaQueries.join(';\n      ')};
    )->.search_areas;
    (
      ${options.includeFederal ? `
      way["highway"~"^(motorway|trunk)$"](area.search_areas);
      way["ref"~"${fedRefRegex}"](area.search_areas);
      relation["route"="road"]["ref"~"${fedRefRegex}"](area.search_areas);` : ''}
      ${options.includeRegional ? `
      way["highway"~"^(primary|secondary|tertiary)$"]["ref"](area.search_areas);` : ''}
    );
    out geom qt;
  `;

  for (const url of OVERPASS_ENDPOINTS) {
    if (options.signal?.aborted) return { type: "FeatureCollection", features: [] };
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: options.signal
      });
      if (!response.ok) continue;
      const data = await response.json();
      const uniqueFeaturesMap = new Map();
      
      if (!data.elements) continue;

      data.elements.forEach((el: any) => {
        const tags = el.tags || {};
        const ref = tags.ref || "";
        const h = tags.highway || "";
        const isFederal = /^[MРAМРАMRA]-/.test(ref) || h === 'motorway' || h === 'trunk';
        const category = isFederal ? 'federal' : 'regional';

        const processWay = (wayId: any, geometry: any) => {
          if (!geometry) return;
          const featId = wayId || JSON.stringify(geometry[0]);
          if (!uniqueFeaturesMap.has(featId)) {
            uniqueFeaturesMap.set(featId, {
              type: "Feature",
              properties: { name: tags.name || ref || "Трасса", ref, road_category: category, osm_id: el.id },
              geometry: { type: "LineString", coordinates: geometry.map((pt: any) => [pt.lon, pt.lat]) }
            });
          }
        };

        if (el.type === 'way') {
          processWay(el.id, el.geometry);
        } else if (el.type === 'relation' && el.members) {
          el.members.forEach((m: any) => {
            if (m.type === 'way' && m.geometry) processWay(m.ref || m.id, m.geometry);
          });
        }
      });

      const result = { type: "FeatureCollection", features: Array.from(uniqueFeaturesMap.values()) };
      roadCache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') return { type: "FeatureCollection", features: [] };
    }
  }
  return { type: "FeatureCollection", features: [] };
}
