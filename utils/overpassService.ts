
import L from 'leaflet';

export interface RoadFetchOptions {
  includeFederal: boolean;
  includeRegional: boolean;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

/**
 * Получение точной границы города или региона по OSM ID (или массиву ID).
 * При передаче массива ID возвращает один объект Feature с MultiLineString геометрией.
 */
export async function fetchBoundaryByOsmId(osmId: number | number[], osmType: string): Promise<any | null> {
  const ids = Array.isArray(osmId) ? osmId : [osmId];
  
  // Формируем запрос для получения всех геометрических данных объекта
  const queryParts = ids.map(id => `${osmType}(${id});`).join('');
  
  const query = `
    [out:json][timeout:90];
    (
      ${queryParts}
    );
    out geom;
  `;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (!response.ok) continue;

      const data = await response.json();
      if (!data.elements || data.elements.length === 0) continue;

      const allLineSegments: any[] = [];
      let commonName = "";
      let commonTags = {};

      data.elements.forEach((el: any) => {
        const tags = el.tags || {};
        if (!commonName) commonName = tags.name || tags['name:ru'] || tags['official_name'] || "Граница";
        commonTags = { ...commonTags, ...tags };

        if (el.type === 'node') {
          // Игнорируем точечные данные для границ, если это не единственное, что есть
          if (data.elements.length === 1) {
             allLineSegments.push([[el.lon, el.lat]]);
          }
        } else if (el.type === 'way' && el.geometry) {
          allLineSegments.push(el.geometry.map((pt: any) => [pt.lon, pt.lat]));
        } else if (el.type === 'relation' && el.members) {
          el.members.forEach((m: any) => {
            // Для релейшена собираем все внешние пути (role: outer)
            if (m.type === 'way' && m.geometry && (m.role === 'outer' || !m.role)) {
              allLineSegments.push(m.geometry.map((pt: any) => [pt.lon, pt.lat]));
            }
          });
        }
      });

      if (allLineSegments.length === 0) return null;

      // Если в итоге получилась только точка
      if (data.elements[0].type === 'node' && allLineSegments[0].length === 1) {
        return {
          type: "Feature",
          properties: { name: commonName, ...commonTags },
          geometry: { type: "Point", coordinates: allLineSegments[0][0] }
        };
      }

      // Возвращаем как MultiLineString для точного отображения границ
      return {
        type: "Feature",
        properties: { 
          name: commonName, 
          id: `osm-${ids.join('-')}`, 
          ...commonTags 
        },
        geometry: {
          type: "MultiLineString",
          coordinates: allLineSegments
        }
      };
    } catch (err) {
      console.warn(`Boundary fetch failed for ${url}`, err);
    }
  }
  return null;
}

export async function fetchSettlementsForRegion(regionFeature: any): Promise<any> {
  const geoJsonLayer = L.geoJSON(regionFeature);
  const bounds = geoJsonLayer.getBounds();
  if (!bounds.isValid()) return { type: "FeatureCollection", features: [] };

  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();

  const query = `
    [out:json][timeout:150];
    (
      relation["place"~"city|town|village"](${south},${west},${north},${east});
      way["place"~"city|town|village"](${south},${west},${north},${east});
    );
    out geom;
  `;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (!data.elements) continue;

      const features: any[] = [];
      data.elements.forEach((el: any) => {
        const tags = el.tags || {};
        const name = tags.name || tags.official_name || "Граница";
        if (el.type === 'way' && el.geometry) {
          features.push({
            type: "Feature",
            properties: { name, ...tags },
            geometry: { type: "LineString", coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]) }
          });
        }
      });
      return { type: "FeatureCollection", features };
    } catch (err) {}
  }
  return { type: "FeatureCollection", features: [] };
}

export async function fetchRoadsForRegion(regionFeature: any, options: RoadFetchOptions): Promise<any> {
  if (!options.includeFederal && !options.includeRegional) return { type: "FeatureCollection", features: [] };
  const geoJsonLayer = L.geoJSON(regionFeature);
  const bounds = geoJsonLayer.getBounds();
  if (!bounds.isValid()) return { type: "FeatureCollection", features: [] };

  const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
  const highwayTypes = [];
  if (options.includeFederal) highwayTypes.push("motorway", "trunk");
  if (options.includeRegional) highwayTypes.push("primary", "secondary");
  const typesRegex = highwayTypes.join("|");

  const query = `
    [out:json][timeout:180];
    (way["highway"~"${typesRegex}"](${south},${west},${north},${east}););
    out geom;
  `;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (!response.ok) continue;
      const data = await response.json();
      const features = data.elements?.filter((el: any) => el.geometry).map((el: any) => {
        const tags = el.tags || {};
        const isFederal = (tags.highway || "").includes('motorway') || (tags.highway || "").includes('trunk');
        return {
          type: "Feature",
          properties: { ...tags, road_category: isFederal ? 'federal' : 'regional' },
          geometry: { type: "LineString", coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]) }
        };
      });
      return { type: "FeatureCollection", features: features || [] };
    } catch (err) {}
  }
  return { type: "FeatureCollection", features: [] };
}
