
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
  bearing: number;
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
  const scaleFactor = 4; 
  const width = Math.floor(size.x * scaleFactor);
  const height = Math.floor(size.y * scaleFactor);

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;

  const exportZoom = map.getZoom() + 2;
  const bounds = map.getBounds();
  
  let urlTemplate = options.mapMode === MapMode.STREETS 
    ? "https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&lang=ru_RU&scale=2"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const nwPx = map.project(bounds.getNorthWest(), exportZoom);
  const sePx = map.project(bounds.getSouthEast(), exportZoom);
  const tileSize = 256;
  const totalWidthPx = sePx.x - nwPx.x;
  const totalHeightPx = sePx.y - nwPx.y;

  const tilePromises: Promise<any>[] = [];
  for (let x = Math.floor(nwPx.x / tileSize); x <= Math.floor(sePx.x / tileSize); x++) {
    for (let y = Math.floor(nwPx.y / tileSize); y <= Math.floor(sePx.y / tileSize); y++) {
      const url = urlTemplate.replace('{x}', x.toString()).replace('{y}', y.toString()).replace('{z}', exportZoom.toString()).replace('{s}', 'a');
      tilePromises.push(loadImage(url).then(img => ({
        img,
        x: ((x * tileSize - nwPx.x) / totalWidthPx) * width,
        y: ((y * tileSize - nwPx.y) / totalHeightPx) * height,
        w: (tileSize / totalWidthPx) * width,
        h: (tileSize / totalHeightPx) * height
      })).catch(() => null));
    }
  }

  const loadedTiles = await Promise.all(tilePromises);
  loadedTiles.forEach(tile => { if (tile) finalCtx.drawImage(tile.img, tile.x, tile.y, tile.w + 1, tile.h + 1); });

  if (options.mapMode === MapMode.GRAY_VECTOR) {
    finalCtx.globalCompositeOperation = 'difference';
    finalCtx.fillStyle = 'white';
    finalCtx.fillRect(0, 0, width, height);
    finalCtx.globalCompositeOperation = 'source-over';
  }

  return finalCanvas.toDataURL('image/jpeg', 0.85);
}

export async function exportMapToHighResSvg(map: L.Map, options: ExportOptions) {
  const size = map.getSize();
  const bgDataUrl = options.mapMode !== MapMode.NONE ? await captureMapTilesHighRes(map, options) : null;
  const POINT_RED = "#ff0000";

  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${size.x}" height="${size.y}" viewBox="0 0 ${size.x} ${size.y}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="100%" height="100%" fill="${options.mapMode === MapMode.NONE ? '#0a0a0a' : '#ffffff'}" />`;

  if (bgDataUrl) svg += `<image xlink:href="${bgDataUrl}" width="${size.x}" height="${size.y}" x="0" y="0" />\n`;

  const project = (coords: [number, number]): [number, number] => {
    const point = map.latLngToContainerPoint([coords[1], coords[0]]);
    return [point.x, point.y];
  };

  const renderGeoJson = (geoJson: any, overrideColor: string | null, width: number, opacity: number = 1, isKml: boolean = false): string => {
    if (!geoJson) return "";
    let paths = "";
    const features = geoJson.features || (geoJson.type === "Feature" ? [geoJson] : []);
    
    features.forEach((f: any) => {
      const color = overrideColor || f.properties?.color || "#A855F7";
      const coordsToPath = (coords: any[]) => coords.map(project).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');

      if (f.geometry.type === "Point") {
        const p = project(f.geometry.coordinates);
        const finalPointColor = isKml ? POINT_RED : color;
        paths += `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="4.5" fill="${finalPointColor}" stroke="#ffffff" stroke-width="1.2" opacity="${opacity}" />\n`;
      } else if (f.geometry.type === "LineString") {
        paths += `<path d="${coordsToPath(f.geometry.coordinates)}" stroke="${color}" stroke-width="${width}" fill="none" opacity="${opacity}" />\n`;
      } else if (f.geometry.type === "Polygon") {
        f.geometry.coordinates.forEach((ring: any) => {
          paths += `<path d="${coordsToPath(ring)} Z" stroke="${color}" stroke-width="${width}" fill="${color}" fill-opacity="0.1" opacity="${opacity}" />\n`;
        });
      } else if (f.geometry.type === "MultiLineString") {
        f.geometry.coordinates.forEach((line: any) => {
          paths += `<path d="${coordsToPath(line)}" stroke="${color}" stroke-width="${width}" fill="none" opacity="${opacity}" />\n`;
        });
      }
    });
    return paths;
  };

  svg += `<g id="Regions">${options.selectedRegions.map(r => renderGeoJson(r, "#3b82f6", 1.5)).join('')}</g>`;
  if (options.roadData) svg += `<g id="Roads">${renderGeoJson(options.roadData, null, 1)}</g>`;
  if (options.showSettlements && options.settlementData) svg += `<g id="Settlements">${renderGeoJson(options.settlementData, "#ff3d00", 1.5)}</g>`;

  options.kmlLayers.filter(l => l.visible).forEach(l => {
    svg += `<g id="KML_${l.id}">${renderGeoJson(l.geoJson, options.useMultiColor ? null : l.color, 1, 1, true)}</g>`;
  });

  svg += `</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kml_master_${Date.now()}.svg`;
  link.click();
}
