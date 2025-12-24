
function kmlColorToHex(kmlColor: string): string {
  if (!kmlColor || kmlColor.length !== 8) return '';
  // KML colors are AABBGGRR (Alpha, Blue, Green, Red)
  const r = kmlColor.substring(6, 8);
  const g = kmlColor.substring(4, 6);
  const b = kmlColor.substring(2, 4);
  const hex = `#${r}${g}${b}`;
  // Avoid pure white as a fallback color for multicolor if it's the only color
  return hex.toLowerCase() === '#ffffff' ? '' : hex;
}

function getRandomColor() {
  const h = Math.floor(Math.random() * 360);
  const s = 70 + Math.random() * 30;
  const l = 50 + Math.random() * 20;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Convert HSL to Hex
function hslToHex(h: number, s: number, l: number) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function parseKml(kmlString: string): any {
  const parser = new DOMParser();
  const kml = parser.parseFromString(kmlString, "text/xml");
  
  const geoJson: any = {
    type: "FeatureCollection",
    features: []
  };

  const placemarks = kml.getElementsByTagName("Placemark");
  
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const name = pm.getElementsByTagName("name")[0]?.textContent || `Объект ${i + 1}`;
    
    let baseFeatureColor = '';
    const styleUrl = pm.getElementsByTagName("styleUrl")[0]?.textContent;
    if (styleUrl) {
      const styleId = styleUrl.replace('#', '');
      const styleElement = kml.getElementById(styleId);
      if (styleElement) {
        const colorTag = styleElement.getElementsByTagName("color")[0];
        if (colorTag) baseFeatureColor = kmlColorToHex(colorTag.textContent || '');
      }
    }
    
    if (!baseFeatureColor) {
      const inlineColor = pm.getElementsByTagName("color")[0]?.textContent;
      if (inlineColor) baseFeatureColor = kmlColorToHex(inlineColor);
    }

    const geometries = ['LineString', 'Polygon', 'Point'];
    for (const gType of geometries) {
      const elements = pm.getElementsByTagName(gType);
      for (let j = 0; j < elements.length; j++) {
        const coordsText = elements[j].getElementsByTagName("coordinates")[0]?.textContent || "";
        const coordinates = coordsText.trim().split(/\s+/).map(pair => {
          const parts = pair.split(',').map(Number);
          return [parts[0], parts[1]];
        });

        if (coordinates.length > 0) {
          // Если цвет не задан в KML, генерируем новый случайный цвет для КАЖДОГО сегмента/объекта
          // Это обеспечит максимальную разноцветность в режиме MultiColor
          const segmentColor = baseFeatureColor || hslToHex(Math.floor(Math.random() * 360), 80, 60);

          geoJson.features.push({
            type: "Feature",
            properties: { 
              name, 
              color: segmentColor 
            },
            geometry: {
              type: gType,
              coordinates: gType === 'Polygon' ? [coordinates] : (gType === 'Point' ? coordinates[0] : coordinates)
            }
          });
        }
      }
    }
  }

  return geoJson;
}
