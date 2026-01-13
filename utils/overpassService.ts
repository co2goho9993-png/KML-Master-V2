
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

/**
 * Вспомогательная функция для сшивки разрозненных сегментов путей в замкнутые контуры.
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
 * Получение точной границы города или региона по OSM ID.
 */
export async function fetchBoundaryByOsmId(osmId: number | number[], osmType: string, externalSignal?: AbortSignal): Promise<any | null> {
  const ids = Array.isArray(osmId) ? osmId : [osmId];
  
  const runQuery = async (q: string) => {
    for (const url of OVERPASS_ENDPOINTS) {
      if (externalSignal?.aborted) return null;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

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
  ids.forEach(id => {
    query += `${osmType}(${id});`;
  });
  query += `); out geom qt;`;

  let data = await runQuery(query);

  if (data && data.elements.length > 0 && data.elements[0].type === 'node') {
    const node = data.elements[0];
    const boundaryQuery = `[out:json][timeout:90];
      is_in(${node.lat},${node.lon})->.a;
      relation(area.a)["boundary"="administrative"]["admin_level"~"^[4568]$"];
      out geom qt;`;
    const boundaryData = await runQuery(boundaryQuery);
    if (boundaryData && boundaryData.elements.length > 0) {
      const sorted = boundaryData.elements.sort((a: any, b: any) => {
          const lvA = parseInt(a.tags?.admin_level || "10");
          const lvB = parseInt(b.tags?.admin_level || "10");
          return lvB - lvA;
      });
      data = { elements: [sorted[0]] };
    }
  }

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
    properties: { 
        name: commonName, 
        id: `osm-${ids.join('-')}`, 
        osmId: ids[0], 
        osmType: data.elements[0].type,
        ...commonTags 
    },
    geometry: { 
      type: rings.length > 1 ? "MultiPolygon" : "Polygon", 
      coordinates: rings.length > 1 ? rings.map(r => [r]) : [rings[0]]
    }
  };
}

/**
 * Получение дорог СТРОГО внутри границ региона.
 * Оптимизировано: загружаются только дороги с ref (маркировкой), что отсекает улицы.
 * Добавлен модификатор 'qt' для ускорения обработки на сервере Overpass.
 */
export async function fetchRoadsForRegion(regionFeature: any, options: RoadFetchOptions): Promise<any> {
  if (!options.includeFederal && !options.includeRegional) return { type: "FeatureCollection", features: [] };
  if (options.signal?.aborted) return { type: "FeatureCollection", features: [] };
  
  const osmId = regionFeature.properties.osmId;
  const osmType = regionFeature.properties.osmType || 'relation';
  const name = regionFeature.properties.name;
  
  let areaSearch = '';
  if (osmId) {
    const baseId = Array.isArray(osmId) ? osmId[0] : osmId;
    const areaId = (osmType === 'way' ? 2400000000 : 3600000000) + baseId;
    areaSearch = `area(${areaId})`;
  } else if (name) {
    areaSearch = `area["name"~"${name}"]["admin_level"~"^[45]$"]`;
  }

  if (!areaSearch) return { type: "FeatureCollection", features: [] };

  // Фильтры:
  // motorway/trunk - федеральные
  // primary/secondary/tertiary - региональные только при наличии ref
  const fedRefRegex = '^[MРAМРА]-.*'; 
  const regRefRegex = '^[0-9].*'; 

  let roadFilter = '';
  if (options.includeFederal && options.includeRegional) {
    roadFilter = `(
      way["highway"~"^(motorway|trunk)$"](area.searchArea);
      way["highway"~"^(primary|secondary|tertiary)$"]["ref"](area.searchArea);
    );`;
  } else if (options.includeFederal) {
    roadFilter = `(
      way["highway"~"^(motorway|trunk)$"](area.searchArea);
      way["highway"~"^(primary|secondary)$"]["ref"~"${fedRefRegex}"](area.searchArea);
    );`;
  } else if (options.includeRegional) {
    roadFilter = `way["highway"~"^(primary|secondary|tertiary)$"]["ref"~"${regRefRegex}"](area.searchArea);`;
  }

  const query = `
    [out:json][timeout:120];
    (${areaSearch};)->.searchArea;
    (
      ${roadFilter}
    );
    out geom qt;
  `;

  for (const url of OVERPASS_ENDPOINTS) {
    if (options.signal?.aborted) return { type: "FeatureCollection", features: [] };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: options.signal || controller.signal
      });
      
      clearTimeout(timeoutId);
      if (!response.ok) continue;

      const data = await response.json();
      const features = data.elements?.filter((el: any) => el.geometry).map((el: any) => {
        const tags = el.tags || {};
        const ref = tags.ref || "";
        const h = tags.highway || "";
        
        const isFederal = /^[MРAМРА]-/.test(ref) || h === 'motorway' || h === 'trunk';
        
        return {
          type: "Feature",
          properties: { 
            ...tags, 
            name: tags.name || ref || "Трасса",
            road_category: isFederal ? 'federal' : 'regional' 
          },
          geometry: { 
            type: "LineString", 
            coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]) 
          }
        };
      });

      return { type: "FeatureCollection", features: features || [] };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' && options.signal?.aborted) return { type: "FeatureCollection", features: [] };
    }
  }
  return { type: "FeatureCollection", features: [] };
}
