
import L from 'leaflet';
import { KmlLayerData, MapMode } from '../types';

interface ExportOptions {
  kmlLayers: KmlLayerData[];
  selectedRegions: any[];
  roadData: any;
  settlementData?: any;
  useMultiColor: boolean;
  mapMode: MapMode;
  showRoads: boolean;
  showRegionalRoads: boolean;
  showSettlements: boolean;
  dimMap: boolean;
}

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile`));
    img.src = url;
  });
};

async function captureMapTilesHighRes(map: L.Map, options: ExportOptions): Promise<string | null> {
  const size = map.getSize();
  // Увеличиваем масштабный коэффициент до 8 для сверхвысокого разрешения (AI Ready)
  const scaleFactor = 8; 
  const width = Math.floor(size.x * scaleFactor);
  const height = Math.floor(size.y * scaleFactor);

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;

  // Динамический выбор цвета фона для экспорта
  finalCtx.fillStyle = options.mapMode === MapMode.DARK || options.mapMode === MapMode.NONE ? '#0a0a0a' : '#f4f1ed';
  finalCtx.fillRect(0, 0, width, height);

  // Увеличиваем зум на +2 для получения 4-кратной детализации исходных данных (2^2 = 4)
  const exportZoom = map.getZoom() + 2;
  const bounds = map.getBounds();
  
  let urlTemplate = "";
  if (options.mapMode === MapMode.STREETS) {
    urlTemplate = "https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&lang=ru_RU&scale=2";
  } else if (options.mapMode === MapMode.BRIGHT_V2) {
    // Voyager No Labels
    urlTemplate = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png";
  } else if (options.mapMode === MapMode.DARK) {
    // Dark No Labels
    urlTemplate = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
  } else {
    urlTemplate = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png";
  }

  const nwPx = map.project(bounds.getNorthWest(), exportZoom);
  const sePx = map.project(bounds.getSouthEast(), exportZoom);
  const tileSize = 256; 
  const totalWidthPx = sePx.x - nwPx.x;
  const totalHeightPx = sePx.y - nwPx.y;

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = width;
  tileCanvas.height = height;
  const tCtx = tileCanvas.getContext('2d')!;
  
  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'high';

  const tilePromises: Promise<any>[] = [];
  const startX = Math.floor(nwPx.x / tileSize);
  const endX = Math.floor(sePx.x / tileSize);
  const startY = Math.floor(nwPx.y / tileSize);
  const endY = Math.floor(sePx.y / tileSize);

  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      const sub = ['a', 'b', 'c'][Math.abs(x + y) % 3];
      const url = urlTemplate
        .replace('{s}', sub)
        .replace('{x}', x.toString())
        .replace('{y}', y.toString())
        .replace('{z}', exportZoom.toString())
        .replace('{r}', ''); // Handle retina placeholders if any

      tilePromises.push(loadImage(url).then(img => ({
        img,
        x: ((x * tileSize - nwPx.x) / totalWidthPx) * width,
        y: ((y * tileSize - nwPx.y) / totalHeightPx) * height,
        w: (tileSize / totalWidthPx) * width + 1.2, // Небольшой нахлест для устранения микро-швов
        h: (tileSize / totalHeightPx) * height + 1.2
      })).catch(() => null));
    }
  }

  const loadedTiles = await Promise.all(tilePromises);
  loadedTiles.forEach(tile => { 
    if (tile) {
      tCtx.drawImage(tile.img, tile.x, tile.y, tile.w, tile.h); 
    }
  });

  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(tileCanvas, 0, 0, width, height);

  // Используем максимальное качество JPEG (1.0) для сохранения идеальной четкости
  return finalCanvas.toDataURL('image/jpeg', 1.0);
}

export async function exportMapToHighResSvg(map: L.Map, options: ExportOptions) {
  const size = map.getSize();
  const bgDataUrl = options.mapMode !== MapMode.NONE ? await captureMapTilesHighRes(map, options) : null;

  const project = (coords: [number, number]): [number, number] => {
    const point = map.latLngToContainerPoint([coords[1], coords[0]]);
    return [point.x, point.y];
  };

  const coordsToPath = (coords: any[]) => coords.map(project).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');

  let maskPaths = "";
  let dimMaskHoles = "";
  options.selectedRegions.forEach((region: any) => {
    const features = region.features || (region.type === "Feature" ? [region] : []);
    features.forEach((f: any) => {
      const generatePaths = (coords: any[]) => {
        const pathData = coordsToPath(coords) + " Z";
        maskPaths += `<path d="${pathData}" />\n`;
        dimMaskHoles += `<path d="${pathData}" fill="black" />\n`;
      };

      if (f.geometry.type === "Polygon") {
        f.geometry.coordinates.forEach(generatePaths);
      } else if (f.geometry.type === "MultiPolygon") {
        f.geometry.coordinates.forEach((poly: any) => poly.forEach(generatePaths));
      }
    });
  });

  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${size.x}" height="${size.y}" viewBox="0 0 ${size.x} ${size.y}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <clipPath id="regionClip">
      ${maskPaths || `<rect x="0" y="0" width="${size.x}" height="${size.y}" />`}
    </clipPath>
    <mask id="dimMask">
      <rect x="0" y="0" width="100%" height="100%" fill="white" />
      ${dimMaskHoles}
    </mask>
    <pattern id="export-city-hatch" patternUnits="userSpaceOnUse" width="8" height="8">
      <path d="M 0,8 L 8,0 M -2,2 L 2,-2 M 6,10 L 10,6" stroke="#C4A484" stroke-width="0.8" />
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="${options.mapMode === MapMode.NONE || options.mapMode === MapMode.DARK ? '#0a0a0a' : '#f4f1ed'}" />`;

  if (bgDataUrl) {
    svg += `<image xlink:href="${bgDataUrl}" width="${size.x}" height="${size.y}" x="0" y="0" />\n`;
  }

  if (options.dimMap && options.selectedRegions.length > 0) {
    svg += `<rect width="100%" height="100%" fill="#000000" fill-opacity="0.3" mask="url(#dimMask)" />\n`;
  }

  const renderGeoJson = (geoJson: any, overrideColor: string | null, layerDefaultColor: string, width: number, opacity: number = 1, dash: string = "", isCity: boolean = false, isRegion: boolean = false): string => {
    if (!geoJson) return "";
    let paths = "";
    const features = geoJson.features || (geoJson.type === "Feature" ? [geoJson] : []);
    features.forEach((f: any) => {
      let color = isCity ? "#C4A484" : (overrideColor || f.properties?.color || layerDefaultColor || "#A855F7");
      let sw = width;
      let featOpacity = opacity;
      let fill = isCity ? "url(#export-city-hatch)" : "none";
      let fillOpacity = isCity ? "1" : "0.1";
      
      if (f.properties?.road_category === 'federal') {
        color = "#6d6e71";
        sw = 2.8;
        featOpacity = 1.0;
      } else if (f.properties?.road_category === 'regional') {
        color = "#939598";
        sw = 1.6;
        featOpacity = 1.0;
      }

      if (isCity) sw = 2.2;

      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";

      const getPath = (coords: any, isClosed: boolean) => {
        const d = coordsToPath(coords);
        return `<path d="${d}${isClosed ? ' Z' : ''}"${dashAttr} stroke="${color}" stroke-width="${sw}" fill="${isClosed ? fill : 'none'}" fill-opacity="${isClosed ? fillOpacity : '1'}" opacity="${featOpacity}" stroke-linecap="round" stroke-linejoin="round" />\n`;
      };

      const renderGeometry = (geom: any) => {
        if (isRegion) {
          const whiteColor = "#ffffff";
          const dashColor = "#b292c4";
          const whiteWidth = 2.2;
          const dashWidth = 1.4;
          
          const drawRegionPath = (ring: any) => {
            const d = coordsToPath(ring) + " Z";
            let p = `<path d="${d}" stroke="${whiteColor}" stroke-width="${whiteWidth}" stroke-linecap="round" stroke-linejoin="round" fill="${dashColor}" fill-opacity="0.03" />\n`;
            p += `<path d="${d}" stroke="${dashColor}" stroke-width="${dashWidth}" stroke-dasharray="4,4" stroke-linecap="round" stroke-linejoin="round" fill="none" />\n`;
            return p;
          };

          if (geom.type === "Polygon") {
            return geom.coordinates.map(drawRegionPath).join('');
          } else if (geom.type === "MultiPolygon") {
            return geom.coordinates.map((poly: any) => poly.map(drawRegionPath).join('')).join('');
          }
          return "";
        }

        if (geom.type === "LineString") {
          return getPath(geom.coordinates, false);
        } else if (geom.type === "Polygon") {
          return geom.coordinates.map((ring: any) => getPath(ring, true)).join('');
        } else if (geom.type === "MultiPolygon") {
          return geom.coordinates.map((poly: any) => poly.map((ring: any) => getPath(ring, true)).join('')).join('');
        } else if (geom.type === "MultiLineString") {
          return geom.coordinates.map((line: any) => getPath(line, false)).join('');
        } else if (geom.type === "Point") {
          const p = project(geom.coordinates);
          return `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}" stroke="#000" stroke-width="0.5" />\n`;
        }
        return "";
      };

      paths += renderGeometry(f.geometry);
    });
    return paths;
  };

  svg += `<g id="Regions">${options.selectedRegions.map(r => renderGeoJson(r, null, "", 1.4, 1, "", false, true)).join('')}</g>`;
  
  if (options.roadData) {
    svg += `<g id="Roads" clip-path="url(#regionClip)">${renderGeoJson(options.roadData, null, "", 1)}</g>`;
  }
  
  if (options.settlementData) {
    svg += `<g id="Cities" clip-path="url(#regionClip)">${renderGeoJson(options.settlementData, "#C4A484", "", 2.2, 1, "", true)}</g>`;
  }

  options.kmlLayers.filter(l => l.visible).forEach(l => {
    svg += `<g id="KML_${l.id}">${renderGeoJson(l.geoJson, options.useMultiColor ? null : l.color, l.color, 1.4)}</g>`;
  });

  svg += `</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kml_master_4x_highres_${Date.now()}.svg`;
  link.click();
}
