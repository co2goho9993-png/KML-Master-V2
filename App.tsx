
import React, { useState, useCallback, useEffect } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import { KmlLayerData, MapMode } from './types';
import { fetchBoundaryByOsmId } from './utils/overpassService';

const App: React.FC = () => {
  const [kmlLayers, setKmlLayers] = useState<KmlLayerData[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<any[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>(MapMode.STREETS);
  const [useMultiColor, setUseMultiColor] = useState(true);
  const [showRoads, setShowRoads] = useState(false);
  const [showRegionalRoads, setShowRegionalRoads] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mapTarget, setMapTarget] = useState<{lat: number, lon: number, bounds?: any, osmId?: number, osmType?: string} | null>(null);
  const [focusedCityBoundary, setFocusedCityBoundary] = useState<any>(null);

  const handleAddKml = useCallback((name: string, geoJson: any) => {
    const newLayer: KmlLayerData = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      geoJson,
      color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
      visible: true
    };
    setKmlLayers(prev => [...prev, newLayer]);
  }, []);

  const handleRemoveKml = useCallback((id: string) => {
    setKmlLayers(prev => prev.filter(l => l.id !== id));
  }, []);

  const handleToggleKml = useCallback((id: string) => {
    setKmlLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const handleUpdateKmlColor = useCallback((id: string, color: string) => {
    setKmlLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l));
  }, []);

  const handleSelectRegion = useCallback(async (region: any) => {
    if (!region) {
      setSelectedRegions([]);
      return;
    }

    let finalRegion = region;

    // Если у региона есть osmId и нет геометрии, подгружаем её
    if (region.properties.osmId && !region.geometry) {
      setIsLoading(true);
      try {
        const boundary = await fetchBoundaryByOsmId(region.properties.osmId, 'relation');
        if (boundary) {
          finalRegion = boundary;
        }
      } catch (err) {
        console.error("Error fetching special region boundary", err);
      } finally {
        setIsLoading(false);
      }
    }

    setSelectedRegions(prev => {
      const regionId = finalRegion.properties.id || finalRegion.properties.name;
      const exists = prev.find(r => (r.properties.id || r.properties.name) === regionId);
      if (exists) return prev;
      return [...prev, finalRegion];
    });
  }, []);

  const handleRemoveRegion = useCallback((regionId: string) => {
    setSelectedRegions(prev => prev.filter(r => (r.properties.id || r.properties.name) !== regionId));
  }, []);

  // Загрузка границ города при выборе из поиска
  useEffect(() => {
    if (mapTarget?.osmId && mapTarget?.osmType) {
      setIsLoading(true);
      setFocusedCityBoundary(null);
      fetchBoundaryByOsmId(mapTarget.osmId, mapTarget.osmType)
        .then(boundary => {
          if (boundary) setFocusedCityBoundary(boundary);
        })
        .finally(() => setIsLoading(false));
    } else {
      setFocusedCityBoundary(null);
    }
  }, [mapTarget]);

  return (
    <div className="flex h-screen w-full bg-black overflow-hidden">
      <Sidebar 
        kmlLayers={kmlLayers}
        onAddKml={handleAddKml}
        onRemoveKml={handleRemoveKml}
        onToggleKml={handleToggleKml}
        onUpdateKmlColor={handleUpdateKmlColor}
        selectedRegions={selectedRegions}
        onSelectRegion={handleSelectRegion}
        onRemoveRegion={handleRemoveRegion}
        mapMode={mapMode}
        onSetMapMode={setMapMode}
        useMultiColor={useMultiColor}
        onSetMultiColor={setUseMultiColor}
        showRoads={showRoads}
        onSetShowRoads={setShowRoads}
        showRegionalRoads={showRegionalRoads}
        onSetShowRegionalRoads={setShowRegionalRoads}
        isLoading={isLoading}
        onCitySelect={setMapTarget}
      />
      
      <main className="flex-1 relative">
        <MapView 
          kmlLayers={kmlLayers}
          selectedRegions={selectedRegions}
          mapMode={mapMode}
          useMultiColor={useMultiColor}
          showRoads={showRoads}
          showRegionalRoads={showRegionalRoads}
          showSettlements={false}
          onLoadingChange={setIsLoading}
          mapTarget={mapTarget}
          focusedCityBoundary={focusedCityBoundary}
        />
        
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white font-medium italic">Загрузка векторных данных OSM...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
