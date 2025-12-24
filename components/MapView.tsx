
import React, { useEffect, useRef, useState } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  GeoJSON, 
  useMap,
  ScaleControl
} from 'react-leaflet';
import L from 'leaflet';
import { KmlLayerData, MapMode } from '../types';
import { fetchRoadsForRegion, fetchSettlementsForRegion } from '../utils/overpassService';
import { exportMapToHighResSvg } from '../utils/exportUtils';

interface MapViewProps {
  kmlLayers: KmlLayerData[];
  selectedRegions: any[];
  mapMode: MapMode;
  useMultiColor: boolean;
  showRoads: boolean;
  showRegionalRoads: boolean;
  showSettlements: boolean;
  onLoadingChange: (loading: boolean) => void;
  mapTarget: {lat: number, lon: number, bounds?: any} | null;
  focusedCityBoundary: any;
}

const MapController: React.FC<{ 
  selectedRegions: any[]; 
  kmlLayers: KmlLayerData[];
  showRoads: boolean; 
  showRegionalRoads: boolean;
  showSettlements: boolean;
  mapTarget: {lat: number, lon: number, bounds?: any} | null;
  focusedCityBoundary: any;
  onRoadsFetched: (roads: any) => void;
  onSettlementsFetched: (settlements: any) => void;
  onLoadingChange: (loading: boolean) => void;
}> = ({ selectedRegions, kmlLayers, showRoads, showRegionalRoads, showSettlements, mapTarget, focusedCityBoundary, onRoadsFetched, onSettlementsFetched, onLoadingChange }) => {
  const map = useMap();
  const lastRegionsHash = useRef<string>("");
  const lastProcessedKmlId = useRef<string | null>(null);
  const fetchRoadsId = useRef(0);
  const fetchSettlementsId = useRef(0);

  // Центрирование при нахождении города
  useEffect(() => {
    if (focusedCityBoundary) {
      const geoLayer = L.geoJSON(focusedCityBoundary);
      map.fitBounds(geoLayer.getBounds(), { padding: [40, 40], maxZoom: 14 });
    } else if (mapTarget) {
      if (mapTarget.bounds) {
        map.fitBounds(mapTarget.bounds, { padding: [50, 50], maxZoom: 15 });
      } else {
        map.flyTo([mapTarget.lat, mapTarget.lon], 14);
      }
    }
  }, [mapTarget, focusedCityBoundary, map]);

  useEffect(() => {
    const currentHash = selectedRegions.map(r => r.properties.id || r.properties.name).sort().join("|");
    
    if (selectedRegions.length > 0) {
      if (currentHash !== lastRegionsHash.current) {
        const featureGroup = L.featureGroup(selectedRegions.map(r => L.geoJSON(r)));
        const bounds = featureGroup.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
        lastRegionsHash.current = currentHash;
      }

      const combinedFeature = { type: "FeatureCollection", features: selectedRegions };

      if (showRoads || showRegionalRoads) {
        onLoadingChange(true);
        const currentFetch = ++fetchRoadsId.current;
        fetchRoadsForRegion(combinedFeature, { includeFederal: showRoads, includeRegional: showRegionalRoads })
          .then(roads => { if (currentFetch === fetchRoadsId.current) onRoadsFetched(roads); })
          .catch(() => { if (currentFetch === fetchRoadsId.current) onRoadsFetched(null); })
          .finally(() => { if (currentFetch === fetchRoadsId.current) onLoadingChange(false); });
      } else {
        onRoadsFetched(null);
      }

      if (showSettlements && !focusedCityBoundary) {
        onLoadingChange(true);
        const currentFetch = ++fetchSettlementsId.current;
        fetchSettlementsForRegion(combinedFeature)
          .then(settlements => { if (currentFetch === fetchSettlementsId.current) onSettlementsFetched(settlements); })
          .catch(() => { if (currentFetch === fetchSettlementsId.current) onSettlementsFetched(null); })
          .finally(() => { if (currentFetch === fetchSettlementsId.current) onLoadingChange(false); });
      } else {
        onSettlementsFetched(null);
      }
    } else {
      lastRegionsHash.current = "";
      onRoadsFetched(null);
      onSettlementsFetched(null);
    }
  }, [selectedRegions, showRoads, showRegionalRoads, showSettlements, focusedCityBoundary, map, onRoadsFetched, onSettlementsFetched, onLoadingChange]);

  useEffect(() => {
    if (kmlLayers.length > 0) {
      const latestLayer = kmlLayers[kmlLayers.length - 1];
      if (latestLayer.id !== lastProcessedKmlId.current) {
        const geoJsonLayer = L.geoJSON(latestLayer.geoJson);
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        lastProcessedKmlId.current = latestLayer.id;
      }
    }
  }, [kmlLayers, map]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ 
  kmlLayers, 
  selectedRegions, 
  mapMode, 
  useMultiColor, 
  showRoads,
  showRegionalRoads,
  showSettlements,
  onLoadingChange,
  mapTarget,
  focusedCityBoundary
}) => {
  const [roadData, setRoadData] = useState<any>(null);
  const [settlementData, setSettlementData] = useState<any>(null);
  const mapRef = useRef<L.Map | null>(null);

  const YANDEX_MAP = "https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&lang=ru_RU&scale=2";
  const OSM_MAP = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

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
            settlementData: focusedCityBoundary || settlementData,
            useMultiColor,
            mapMode,
            showRoads,
            showRegionalRoads,
            showSettlements: !!(focusedCityBoundary || showSettlements),
            bearing: 0
          });
        } catch (e) {
          console.error("Export failed", e);
        } finally {
          onLoadingChange(false);
        }
      }, 1500);
    };

    window.addEventListener('trigger-export', handleExport);
    return () => window.removeEventListener('trigger-export', handleExport);
  }, [kmlLayers, selectedRegions, roadData, settlementData, focusedCityBoundary, useMultiColor, mapMode, showRoads, showRegionalRoads, showSettlements, onLoadingChange]);

  const getKmlStyle = (feature: any, layerId: string) => {
    const layer = kmlLayers.find(l => l.id === layerId);
    const baseColor = layer?.color || '#A855F7';
    return {
      color: useMultiColor ? (feature?.properties?.color || baseColor) : baseColor,
      weight: 2, 
      opacity: 1,
      fillOpacity: 0.2
    };
  };

  const kmlPointToLayer = (feature: any, latlng: L.LatLng) => {
    return L.circleMarker(latlng, {
      radius: 5,
      fillColor: "#ff0000",
      color: "#ffffff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 1,
      interactive: true
    });
  };

  const focusedCityStyle = {
    color: '#ff3d00',
    weight: 4,
    fillColor: '#ff3d00',
    fillOpacity: 0.15,
    interactive: false
  };

  const roadStyle = (feature: any) => {
    const isFederal = feature.properties.road_category === 'federal';
    return {
      color: isFederal ? '#555555' : '#888888', 
      weight: isFederal ? 3.5 : 1.8,
      opacity: isFederal ? 1.0 : 0.7,
      interactive: false
    };
  };

  const currentCrs = mapMode === MapMode.STREETS ? L.CRS.EPSG3395 : L.CRS.EPSG3857;

  return (
    <div className="h-full w-full bg-[#111]">
      <MapContainer 
        key={mapMode}
        center={[55.751244, 37.618423]} 
        zoom={5} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        crs={currentCrs} 
        ref={mapRef}
      >
        {mapMode === MapMode.STREETS && (
          <TileLayer url={YANDEX_MAP} attribution='&copy; Yandex' tileSize={256} zoomOffset={0} crossOrigin="anonymous" />
        )}
        {mapMode === MapMode.GRAY_VECTOR && (
          <TileLayer url={OSM_MAP} attribution='&copy; OSM' crossOrigin="anonymous" className="grayscale-vector-map" />
        )}

        {selectedRegions.map(region => (
          <GeoJSON key={`region-${region.properties.id || region.properties.name}`} data={region} style={{ color: '#3b82f6', weight: 2.5, dashArray: '8, 12', fillOpacity: 0.03 }} />
        ))}

        {roadData && roadData.features.length > 0 && (
          <GeoJSON key={`roads-${roadData.features.length}-${showRoads}-${showRegionalRoads}`} data={roadData} style={roadStyle} />
        )}

        {settlementData && !focusedCityBoundary && (
          <GeoJSON key="all-settlements" data={settlementData} style={{ color: '#ff9800', weight: 2, dashArray: '4, 6', fillOpacity: 0.05 }} />
        )}

        {focusedCityBoundary && (
          <GeoJSON key="focused-city" data={focusedCityBoundary} style={focusedCityStyle} />
        )}

        {kmlLayers.filter(l => l.visible).map(layer => (
          <GeoJSON 
            key={`kml-${layer.id}`} 
            data={layer.geoJson} 
            style={(feature) => getKmlStyle(feature, layer.id)} 
            pointToLayer={kmlPointToLayer}
          />
        ))}

        <MapController 
          selectedRegions={selectedRegions} 
          kmlLayers={kmlLayers}
          showRoads={showRoads}
          showRegionalRoads={showRegionalRoads}
          showSettlements={showSettlements}
          mapTarget={mapTarget}
          focusedCityBoundary={focusedCityBoundary}
          onRoadsFetched={setRoadData}
          onSettlementsFetched={setSettlementData}
          onLoadingChange={onLoadingChange}
        />
        <ScaleControl position="bottomright" />
      </MapContainer>
    </div>
  );
};

export default MapView;
