
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  GeoJSON, 
  useMap,
  ScaleControl,
  Pane,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import { KmlLayerData, MapMode } from '../types';
import { fetchRoadsForTargets } from '../utils/overpassService';
import { exportMapToHighResSvg } from '../utils/exportUtils';

interface MapViewProps {
  kmlLayers: KmlLayerData[];
  selectedRegions: any[];
  selectedCities: any[];
  mapMode: MapMode;
  useMultiColor: boolean;
  showRoads: boolean;
  showRegionalRoads: boolean;
  showSettlements: boolean;
  onLoadingChange: (loading: boolean) => void;
  mapTarget: {lat: number, lon: number, bounds?: any} | null;
  dimMap: boolean;
}

const ResizeHandler: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    resizeObserver.observe(container);
    const timer = setTimeout(() => map.invalidateSize(), 400);
    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [map]);
  return null;
};

const MapAssets: React.FC<{ selectedRegions: any[], dimMap: boolean }> = ({ selectedRegions, dimMap }) => {
  const map = useMap();
  const [clipPathId] = useState(`map-clip-${Math.random().toString(36).substr(2, 9)}`);
  const [dimMaskId] = useState(`dim-mask-${Math.random().toString(36).substr(2, 9)}`);
  const [dimRectId] = useState(`dim-rect-${Math.random().toString(36).substr(2, 9)}`);
  const cityHatchId = "city-hatch-pattern";

  useEffect(() => {
    const container = map.getContainer();
    const svgs = container.querySelectorAll('svg');
    if (svgs.length === 0) return;

    svgs.forEach(svg => {
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.prepend(defs);
      }

      // Паттерн штриховки для городов
      let pattern = defs.querySelector(`#${cityHatchId}`);
      if (!pattern) {
        pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', cityHatchId);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('width', '8');
        pattern.setAttribute('height', '8');
        pattern.setAttribute('patternTransform', 'rotate(45)');

        const hPathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hPathNode.setAttribute('d', 'M 0,0 L 0,8'); // Вертикальная линия в повернутом паттерне
        hPathNode.setAttribute('style', 'stroke:#C4A484; stroke-width:1.2; stroke-opacity:0.6'); 

        pattern.appendChild(hPathNode);
        defs.appendChild(pattern);
      }

      // ClipPath для обрезки дорог по регионам
      let clipPath = defs.querySelector(`#${clipPathId}`);
      if (!clipPath) {
        clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipPathId);
        defs.appendChild(clipPath);
      }

      // Маска затемнения
      let dimMask = defs.querySelector(`#${dimMaskId}`);
      if (!dimMask) {
        dimMask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
        dimMask.setAttribute('id', dimMaskId);
        defs.appendChild(dimMask);
      }

      // Прямоугольник затемнения
      let dimRect = svg.querySelector(`#${dimRectId}`) as SVGElement;
      if (!dimRect) {
        dimRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dimRect.setAttribute('id', dimRectId);
        dimRect.setAttribute('fill', '#000000');
        dimRect.setAttribute('fill-opacity', '0.25');
        dimRect.setAttribute('mask', `url(#${dimMaskId})`);
        dimRect.setAttribute('style', 'pointer-events: none;');
        svg.prepend(dimRect);
      }

      const updateAssets = () => {
        if (!clipPath || !dimMask || !dimRect) return;
        clipPath.innerHTML = '';
        dimMask.innerHTML = '';

        // Прямоугольник на весь вьюпорт
        dimRect.setAttribute('x', '-10000');
        dimRect.setAttribute('y', '-10000');
        dimRect.setAttribute('width', '20000');
        dimRect.setAttribute('height', '20000');
        dimRect.setAttribute('display', dimMap && selectedRegions.length > 0 ? 'block' : 'none');

        const maskBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        maskBg.setAttribute('x', '-10000');
        maskBg.setAttribute('y', '-10000');
        maskBg.setAttribute('width', '20000');
        maskBg.setAttribute('height', '20000');
        maskBg.setAttribute('fill', 'white');
        dimMask.appendChild(maskBg);
        
        selectedRegions.forEach(region => {
          const features = region.features || (region.type === "Feature" ? [region] : []);
          features.forEach((f: any) => {
            const createPathNodes = (coords: any[]) => {
              const points = coords.map((c: any) => map.latLngToLayerPoint([c[1], c[0]]));
              const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
              
              const cpNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              cpNode.setAttribute('d', d);
              clipPath?.appendChild(cpNode);

              const dmNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              dmNode.setAttribute('d', d);
              dmNode.setAttribute('fill', 'black');
              dimMask?.appendChild(dmNode);
            };

            if (f.geometry.type === "Polygon") {
              f.geometry.coordinates.forEach(createPathNodes);
            } else if (f.geometry.type === "MultiPolygon") {
              f.geometry.coordinates.forEach((poly: any) => poly.forEach(createPathNodes));
            }
          });
        });
      };

      map.on('viewreset move zoomend', updateAssets);
      updateAssets();

      const roadsPane = map.getPane('roads-pane');
      if (roadsPane) {
        roadsPane.style.clipPath = `url(#${clipPathId})`;
      }
    });

    return () => {
      svgs.forEach(svg => {
        svg.querySelector(`#${clipPathId}`)?.remove();
        svg.querySelector(`#${dimMaskId}`)?.remove();
        svg.querySelector(`#${dimRectId}`)?.remove();
      });
    };
  }, [map, selectedRegions, clipPathId, dimMaskId, dimRectId, dimMap]);

  return null;
};

const ViewTracker: React.FC<{ onViewChange: (view: { center: [number, number], zoom: number }) => void }> = ({ onViewChange }) => {
  useMapEvents({
    moveend: (e) => {
      const map = e.target;
      const center = map.getCenter();
      onViewChange({ center: [center.lat, center.lng], zoom: map.getZoom() });
    }
  });
  return null;
};

const MapController: React.FC<{ 
  selectedRegions: any[]; 
  selectedCities: any[];
  kmlLayers: KmlLayerData[];
  showRoads: boolean; 
  showRegionalRoads: boolean;
  mapTarget: {lat: number, lon: number, bounds?: any} | null;
  onRoadsFetched: (roads: any) => void;
  onLoadingChange: (loading: boolean) => void;
  processedState: { regions: number, cities: number, target: any };
  updateProcessedState: (key: string, value: any) => void;
  currentZoom: number;
}> = ({ selectedRegions, selectedCities, kmlLayers, showRoads, showRegionalRoads, mapTarget, onRoadsFetched, onLoadingChange, processedState, updateProcessedState, currentZoom }) => {
  const map = useMap();
  const roadAbortRef = useRef<AbortController | null>(null);
  const prevKmlCountRef = useRef(kmlLayers.length);

  useEffect(() => {
    if (mapTarget && mapTarget !== processedState.target) {
      if (mapTarget.bounds) {
        map.fitBounds(mapTarget.bounds, { padding: [10, 10], animate: true });
      } else {
        map.flyTo([mapTarget.lat, mapTarget.lon], 13, { duration: 1.5 });
      }
      updateProcessedState('target', mapTarget);
    }
  }, [mapTarget, map, processedState.target, updateProcessedState]);

  useEffect(() => {
    if (selectedRegions.length > processedState.regions) {
      const latest = selectedRegions[selectedRegions.length - 1];
      if (latest && latest.geometry) {
        const bounds = L.geoJSON(latest).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [10, 10], animate: true });
      }
      updateProcessedState('regions', selectedRegions.length);
    }
  }, [selectedRegions, map, processedState.regions, updateProcessedState]);

  useEffect(() => {
    if (selectedCities.length > processedState.cities) {
      const latest = selectedCities[selectedCities.length - 1];
      if (latest && latest.geometry && latest.geometry.type !== 'Point') {
        const bounds = L.geoJSON(latest).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], animate: true, maxZoom: 14 });
        }
      }
      updateProcessedState('cities', selectedCities.length);
    }
  }, [selectedCities, map, processedState.cities, updateProcessedState]);

  useEffect(() => {
    if (kmlLayers.length > prevKmlCountRef.current) {
      const latest = kmlLayers[kmlLayers.length - 1];
      if (latest && latest.geoJson) {
        try {
          const bounds = L.geoJSON(latest.geoJson).getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], animate: true });
        } catch (err) {}
      }
    }
    prevKmlCountRef.current = kmlLayers.length;
  }, [kmlLayers, map]);

  useEffect(() => {
    const targets = [...selectedRegions, ...selectedCities];
    const actualRegionalRoads = showRegionalRoads && currentZoom >= 8;
    if ((showRoads || actualRegionalRoads) && targets.length > 0) {
      onLoadingChange(true);
      if (roadAbortRef.current) roadAbortRef.current.abort();
      roadAbortRef.current = new AbortController();
      fetchRoadsForTargets(targets, { 
        includeFederal: showRoads, 
        includeRegional: actualRegionalRoads,
        signal: roadAbortRef.current.signal 
      }).then(data => {
        onRoadsFetched(data);
        onLoadingChange(false);
      }).catch(err => {
        if (err.name !== 'AbortError') onLoadingChange(false);
      });
    } else {
      if (roadAbortRef.current) roadAbortRef.current.abort();
      onRoadsFetched(null);
      onLoadingChange(false);
    }
    return () => roadAbortRef.current?.abort();
  }, [showRoads, showRegionalRoads, selectedRegions, selectedCities, onLoadingChange, onRoadsFetched, currentZoom]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ 
  kmlLayers, 
  selectedRegions, 
  selectedCities,
  mapMode, 
  useMultiColor, 
  showRoads,
  showRegionalRoads,
  onLoadingChange,
  mapTarget,
  dimMap
}) => {
  const [roadData, setRoadData] = useState<any>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [currentView, setCurrentView] = useState<{ center: [number, number], zoom: number }>({
    center: [55.751244, 37.618423], zoom: 5
  });

  const processedStateRef = useRef({
    regions: selectedRegions.length, cities: selectedCities.length, target: mapTarget
  });

  const updateProcessedState = useCallback((key: string, value: any) => {
    (processedStateRef.current as any)[key] = value;
  }, []);

  useEffect(() => {
    const handleExport = () => {
      if (!mapRef.current) return;
      onLoadingChange(true);
      setTimeout(async () => {
        try {
          await exportMapToHighResSvg(mapRef.current!, {
            kmlLayers, selectedRegions, roadData,
            settlementData: selectedCities.length > 0 ? { type: "FeatureCollection", features: selectedCities } : null,
            useMultiColor, mapMode, showRoads, showRegionalRoads, showSettlements: selectedCities.length > 0, dimMap
          });
        } catch (e) {} finally { onLoadingChange(false); }
      }, 500);
    };
    window.addEventListener('trigger-export', handleExport);
    return () => window.removeEventListener('trigger-export', handleExport);
  }, [kmlLayers, selectedRegions, selectedCities, roadData, useMultiColor, mapMode, showRoads, showRegionalRoads, onLoadingChange, dimMap]);

  return (
    <div className="h-full w-full bg-[#111]">
      <MapContainer 
        key={mapMode}
        center={currentView.center} 
        zoom={currentView.zoom} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        crs={mapMode === MapMode.STREETS ? L.CRS.EPSG3395 : L.CRS.EPSG3857} 
        ref={mapRef}
        preferCanvas={false}
      >
        <ResizeHandler />
        <ViewTracker onViewChange={setCurrentView} />
        
        {mapMode === MapMode.STREETS && (
          <TileLayer 
            url="https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&lang=ru_RU" 
            tileSize={256} 
            keepBuffer={8}
          />
        )}
        {mapMode === MapMode.GRAY_VECTOR && (
          <TileLayer 
            url="https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&lang=ru_RU" 
            className="grayscale-vector-map" 
            tileSize={256} 
            keepBuffer={8}
          />
        )}

        <Pane name="regions-pane" style={{ zIndex: 300 }}>
          {selectedRegions.map(region => (
            <React.Fragment key={`reg-${region.properties.id || region.properties.name}`}>
              <GeoJSON data={region} style={{ color: '#ffffff', weight: 2.2, fillOpacity: 0.05, interactive: false }} />
              <GeoJSON data={region} style={{ color: '#b292c4', weight: 1.4, dashArray: '4, 4', fillOpacity: 0 }} />
            </React.Fragment>
          ))}
        </Pane>

        <Pane name="roads-pane" style={{ zIndex: 350 }}>
          {roadData && (
            <GeoJSON 
              data={roadData} 
              style={(feature: any) => ({
                color: feature.properties.road_category === 'federal' ? '#6d6e71' : '#939598',
                weight: feature.properties.road_category === 'federal' ? 3.5 : 1.4,
                opacity: 1
              })} 
            />
          )}
        </Pane>

        <Pane name="cities-pane" style={{ zIndex: 400 }}>
          {selectedCities.map(city => (
            <GeoJSON 
              key={`city-${city.properties.id || city.properties.name}`} 
              data={city} 
              style={(feature: any) => ({
                color: '#C4A484',
                weight: 2.2,
                fillColor: feature.geometry.type === 'Point' ? 'transparent' : 'url(#city-hatch-pattern)',
                fillOpacity: 0.8
              })} 
              pointToLayer={(feature, latlng) => L.circleMarker(latlng, { radius: 5, fillColor: '#C4A484', color: '#fff', weight: 1, fillOpacity: 1 })}
            />
          ))}
        </Pane>

        <Pane name="kml-pane" style={{ zIndex: 500 }}>
          {kmlLayers.filter(l => l.visible).map(layer => (
            <GeoJSON 
              key={`kml-${layer.id}`} 
              data={layer.geoJson} 
              style={(f) => ({ 
                color: useMultiColor ? (f?.properties?.color || layer.color) : layer.color, 
                weight: 2.2, fillOpacity: 0.3 
              })}
              pointToLayer={(feature, latlng) => {
                const color = useMultiColor ? (feature.properties?.color || layer.color) : layer.color;
                return L.circleMarker(latlng, {
                  radius: 4,
                  fillColor: color,
                  color: "#ffffff",
                  weight: 1,
                  fillOpacity: 1
                });
              }}
            />
          ))}
        </Pane>

        <MapController 
          selectedRegions={selectedRegions} selectedCities={selectedCities} kmlLayers={kmlLayers}
          showRoads={showRoads} showRegionalRoads={showRegionalRoads} mapTarget={mapTarget}
          onRoadsFetched={setRoadData} onLoadingChange={onLoadingChange}
          processedState={processedStateRef.current} updateProcessedState={updateProcessedState}
          currentZoom={currentView.zoom}
        />
        <MapAssets selectedRegions={selectedRegions} dimMap={dimMap} />
        <ScaleControl position="bottomright" />
      </MapContainer>
    </div>
  );
};

export default MapView;
