
import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { Crosshair } from 'lucide-react';
import { KmlLayerData, MapMode } from '../types';
import { fetchRoadsForRegion } from '../utils/overpassService';
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
  projectLoadTime: number;
}

const MapResizeHandler: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
};

const MapAssets: React.FC<{ selectedRegions: any[], selectedCities: any[], dimMap: boolean }> = ({ selectedRegions, selectedCities, dimMap }) => {
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

      let pattern = defs.querySelector(`#${cityHatchId}`);
      if (pattern) pattern.remove();
      
      pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', cityHatchId);
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '8');
      pattern.setAttribute('height', '8');

      const hPathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hPathNode.setAttribute('d', 'M 0,8 L 8,0 M -2,2 L 2,-2 M 6,10 L 10,6');
      hPathNode.setAttribute('style', 'stroke:#C4A484; stroke-width:0.8; stroke-opacity:0.8'); 

      pattern.appendChild(hPathNode);
      defs.appendChild(pattern);

      let clipPath = defs.querySelector(`#${clipPathId}`);
      if (clipPath) clipPath.remove();
      
      clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clipPath.setAttribute('id', clipPathId);
      defs.appendChild(clipPath);

      let dimMask = defs.querySelector(`#${dimMaskId}`);
      if (dimMask) dimMask.remove();
      
      dimMask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
      dimMask.setAttribute('id', dimMaskId);
      defs.appendChild(dimMask);

      let dimRect = svg.querySelector(`#${dimRectId}`) as SVGElement;
      if (!dimRect) {
        dimRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dimRect.setAttribute('id', dimRectId);
        dimRect.setAttribute('fill', '#000000');
        dimRect.setAttribute('fill-opacity', '0.3');
        dimRect.setAttribute('mask', `url(#${dimMaskId})`);
        dimRect.setAttribute('style', 'pointer-events: none; transition: opacity 0.3s ease;');
        svg.prepend(dimRect);
      }

      const updateAssets = () => {
        if (!clipPath || !dimMask || !dimRect) return;
        clipPath.innerHTML = '';
        dimMask.innerHTML = '';

        dimRect.setAttribute('x', '-50000');
        dimRect.setAttribute('y', '-50000');
        dimRect.setAttribute('width', '100000');
        dimRect.setAttribute('height', '100000');
        dimRect.setAttribute('opacity', dimMap && (selectedRegions.length > 0 || selectedCities.length > 0) ? '1' : '0');

        const maskBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        maskBg.setAttribute('x', '-50000');
        maskBg.setAttribute('y', '-50000');
        maskBg.setAttribute('width', '100000');
        maskBg.setAttribute('height', '100000');
        maskBg.setAttribute('fill', 'white');
        dimMask.appendChild(maskBg);
        
        const allMaskItems = [...selectedRegions, ...selectedCities];
        
        allMaskItems.forEach(item => {
          const features = item.features || (item.type === "Feature" ? [item] : []);
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
        (roadsPane.style as any).webkitClipPath = `url(#${clipPathId})`;
      }
    });

    return () => {
      svgs.forEach(svg => {
        svg.querySelector(`#${cityHatchId}`)?.remove();
        svg.querySelector(`#${clipPathId}`)?.remove();
        svg.querySelector(`#${dimMaskId}`)?.remove();
        svg.querySelector(`#${dimRectId}`)?.remove();
      });
      const roadsPane = map.getPane('roads-pane');
      if (roadsPane) roadsPane.style.clipPath = '';
    };
  }, [map, selectedRegions, selectedCities, clipPathId, dimMaskId, dimRectId, dimMap]);

  return null;
};

const ViewTracker: React.FC<{ onViewChange: (view: { center: [number, number], zoom: number }) => void }> = ({ onViewChange }) => {
  useMapEvents({
    moveend: (e) => {
      const map = e.target;
      const center = map.getCenter();
      onViewChange({
        center: [center.lat, center.lng],
        zoom: map.getZoom()
      });
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
  processedState: { regions: number, cities: number, target: any, lastProjectLoad: number };
  updateProcessedState: (key: string, value: any) => void;
  projectLoadTime: number;
}> = ({ selectedRegions, selectedCities, kmlLayers, showRoads, showRegionalRoads, mapTarget, onRoadsFetched, onLoadingChange, processedState, updateProcessedState, projectLoadTime }) => {
  const map = useMap();
  const roadAbortRef = useRef<AbortController | null>(null);
  const prevKmlCountRef = useRef(kmlLayers.length);

  // Логика автоматического Zoom to Extent при загрузке проекта
  useEffect(() => {
    if (projectLoadTime > processedState.lastProjectLoad) {
      const bounds = L.latLngBounds([]);
      let hasData = false;

      selectedRegions.forEach(r => {
        const layer = L.geoJSON(r);
        const b = layer.getBounds();
        if (b.isValid()) {
          bounds.extend(b);
          hasData = true;
        }
      });

      selectedCities.forEach(c => {
        const layer = L.geoJSON(c);
        const b = layer.getBounds();
        if (b.isValid()) {
          bounds.extend(b);
          hasData = true;
        }
      });

      kmlLayers.filter(l => l.visible).forEach(l => {
        const layer = L.geoJSON(l.geoJson);
        const b = layer.getBounds();
        if (b.isValid()) {
          bounds.extend(b);
          hasData = true;
        }
      });

      if (hasData && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], animate: true });
      }
      
      updateProcessedState('lastProjectLoad', projectLoadTime);
      updateProcessedState('regions', selectedRegions.length);
      updateProcessedState('cities', selectedCities.length);
    }
  }, [projectLoadTime, selectedRegions, selectedCities, kmlLayers, map, processedState.lastProjectLoad, updateProcessedState]);

  useEffect(() => {
    if (mapTarget && mapTarget !== processedState.target) {
      map.flyTo([mapTarget.lat, mapTarget.lon], 13, { duration: 1.5 });
      updateProcessedState('target', mapTarget);
    }
  }, [mapTarget, map, processedState.target, updateProcessedState]);

  useEffect(() => {
    if (projectLoadTime === processedState.lastProjectLoad && selectedRegions.length > processedState.regions) {
      const latest = selectedRegions[selectedRegions.length - 1];
      if (latest && latest.geometry) {
        const bounds = L.geoJSON(latest).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [2, 2], animate: true, maxZoom: 18 });
        }
      }
      updateProcessedState('regions', selectedRegions.length);
    }
  }, [selectedRegions, map, processedState.regions, projectLoadTime, processedState.lastProjectLoad, updateProcessedState]);

  useEffect(() => {
    if (projectLoadTime === processedState.lastProjectLoad && selectedCities.length > processedState.cities) {
      const latest = selectedCities[selectedCities.length - 1];
      if (latest && latest.geometry) {
        const bounds = L.geoJSON(latest).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [2, 2], animate: true, maxZoom: 18 });
        }
      }
      updateProcessedState('cities', selectedCities.length);
    }
  }, [selectedCities, map, processedState.cities, projectLoadTime, processedState.lastProjectLoad, updateProcessedState]);

  useEffect(() => {
    if (kmlLayers.length > prevKmlCountRef.current) {
      const latest = kmlLayers[kmlLayers.length - 1];
      if (latest && latest.geoJson) {
        try {
          const geoLayer = L.geoJSON(latest.geoJson);
          const bounds = geoLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [60, 60], animate: true });
          }
        } catch (err) {
          console.error("Error fitting bounds for KML:", err);
        }
      }
    }
    prevKmlCountRef.current = kmlLayers.length;
  }, [kmlLayers, map]);

  useEffect(() => {
    const allTargets = [...selectedRegions, ...selectedCities];
    
    if ((showRoads || showRegionalRoads) && allTargets.length > 0) {
      onLoadingChange(true);
      if (roadAbortRef.current) roadAbortRef.current.abort();
      roadAbortRef.current = new AbortController();

      fetchRoadsForRegion(allTargets, { 
        includeFederal: showRoads, 
        includeRegional: showRegionalRoads,
        signal: roadAbortRef.current.signal 
      })
        .then(data => {
          if (data && data.features && data.features.length > 0) {
            onRoadsFetched(data);
          } else {
            onRoadsFetched({ type: "FeatureCollection", features: [] });
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            onRoadsFetched({ type: "FeatureCollection", features: [] });
          }
        })
        .finally(() => {
          if (!roadAbortRef.current?.signal.aborted) {
            onLoadingChange(false);
          }
        });
    } else {
      if (roadAbortRef.current) roadAbortRef.current.abort();
      onRoadsFetched(null);
      onLoadingChange(false);
    }
    
    return () => roadAbortRef.current?.abort();
  }, [showRoads, showRegionalRoads, selectedRegions, selectedCities, onLoadingChange, onRoadsFetched]);

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
  dimMap,
  projectLoadTime
}) => {
  const [roadData, setRoadData] = useState<any>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  const [currentView, setCurrentView] = useState<{ center: [number, number], zoom: number }>({
    center: [55.751244, 37.618423],
    zoom: 5
  });

  const processedStateRef = useRef({
    regions: selectedRegions.length,
    cities: selectedCities.length,
    target: mapTarget,
    lastProjectLoad: projectLoadTime
  });

  const updateProcessedState = useCallback((key: string, value: any) => {
    (processedStateRef.current as any)[key] = value;
  }, []);

  const YANDEX_MAP = "https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&lang=ru_RU";
  const CARTODB_VOYAGER = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png";
  const CARTODB_DARK = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";

  useEffect(() => {
    const handleExport = () => {
      if (!mapRef.current) return;
      onLoadingChange(true);
      setTimeout(async () => {
        try {
          await exportMapToHighResSvg(mapRef.current!, {
            kmlLayers,
            selectedRegions,
            roadData,
            settlementData: selectedCities.length > 0 ? { type: "FeatureCollection", features: selectedCities } : null,
            useMultiColor,
            mapMode,
            showRoads,
            showRegionalRoads,
            showSettlements: selectedCities.length > 0,
            dimMap,
          });
        } catch (e) { console.error(e); } finally { onLoadingChange(false); }
      }, 1000);
    };
    window.addEventListener('trigger-export', handleExport);
    return () => window.removeEventListener('trigger-export', handleExport);
  }, [kmlLayers, selectedRegions, selectedCities, roadData, useMultiColor, mapMode, showRoads, showRegionalRoads, onLoadingChange, dimMap]);

  const roadStyle = (feature: any) => {
    const isFed = feature.properties.road_category === 'federal';
    return {
      color: isFed ? '#6d6e71' : '#939598',
      weight: isFed ? 3.5 : 1.4,
      opacity: 1.0,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    };
  };

  const roadKey = roadData 
    ? `roads-${roadData.features.length}-${selectedRegions.length}-${selectedCities.length}` 
    : 'no-roads';

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
        zoomSnap={1}
        zoomDelta={1}
        fadeAnimation={false}
      >
        <MapResizeHandler />
        <ViewTracker onViewChange={setCurrentView} />
        
        {mapMode === MapMode.STREETS && (
          <TileLayer 
            url={YANDEX_MAP} 
            tileSize={256} 
            keepBuffer={8}
          />
        )}
        {mapMode === MapMode.BRIGHT_V2 && (
          <TileLayer 
            url={CARTODB_VOYAGER} 
            tileSize={256} 
            keepBuffer={8} 
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
        )}
        {mapMode === MapMode.DARK && (
          <TileLayer 
            url={CARTODB_DARK} 
            tileSize={256} 
            keepBuffer={8} 
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
        )}

        {selectedRegions.map(region => (
          <React.Fragment key={`reg-group-${region.properties.id || region.properties.name}`}>
            <GeoJSON 
              data={region} 
              style={{ color: '#ffffff', weight: 2.2, fillOpacity: 0.03, interactive: false }} 
            />
            <GeoJSON 
              data={region} 
              style={{ color: '#b292c4', weight: 1.4, dashArray: '4, 4', fillOpacity: 0 }} 
            />
          </React.Fragment>
        ))}

        {selectedCities.map(city => (
          <GeoJSON 
            key={`city-${city.properties.id || city.properties.name}`} 
            data={city} 
            style={{ 
              color: '#C4A484', 
              weight: 2.2, 
              fillColor: 'url(#city-hatch-pattern)', 
              fillOpacity: 1 
            }} 
          />
        ))}
        
        <Pane name="roads-pane" style={{ zIndex: 450 }}>
          {roadData && roadData.features && (
            <GeoJSON 
              key={roadKey} 
              data={roadData} 
              style={roadStyle} 
            />
          )}
        </Pane>

        {kmlLayers.filter(l => l.visible).map(layer => (
          <GeoJSON 
            key={`kml-${layer.id}`} 
            data={layer.geoJson} 
            style={(f) => ({ 
              color: useMultiColor ? (f?.properties?.color || layer.color) : layer.color, 
              weight: 2.5, 
              fillOpacity: 0.3 
            })} 
            pointToLayer={(feature, latlng) => {
              const color = useMultiColor ? (feature.properties.color || layer.color) : layer.color;
              return L.circleMarker(latlng, {
                radius: 4,
                fillColor: color,
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
              });
            }}
          />
        ))}

        <MapController 
          selectedRegions={selectedRegions} 
          selectedCities={selectedCities}
          kmlLayers={kmlLayers}
          showRoads={showRoads}
          showRegionalRoads={showRegionalRoads}
          mapTarget={mapTarget}
          onRoadsFetched={setRoadData}
          onLoadingChange={onLoadingChange}
          processedState={processedStateRef.current}
          updateProcessedState={updateProcessedState}
          projectLoadTime={projectLoadTime}
        />
        <MapAssets selectedRegions={selectedRegions} selectedCities={selectedCities} dimMap={dimMap} />
        <ScaleControl position="bottomright" />
      </MapContainer>
    </div>
  );
};

export default MapView;
