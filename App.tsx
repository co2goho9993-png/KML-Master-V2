
import React, { useState, useCallback, useEffect } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import { KmlLayerData, MapMode, ProjectData } from './types';
import { fetchBoundaryByOsmId } from './utils/overpassService';

const App: React.FC = () => {
  const [kmlLayers, setKmlLayers] = useState<KmlLayerData[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<any[]>([]);
  const [selectedCities, setSelectedCities] = useState<any[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>(MapMode.STREETS);
  const [useMultiColor, setUseMultiColor] = useState(true);
  const [showRoads, setShowRoads] = useState(false);
  const [showRegionalRoads, setShowRegionalRoads] = useState(false);
  const [dimMap, setDimMap] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mapTarget, setMapTarget] = useState<{lat: number, lon: number, bounds?: any, osmId?: number, osmType?: string} | null>(null);

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
    if (!region) return;

    let finalRegion = region;
    if (region.properties.osmId && !region.geometry) {
      setIsLoading(true);
      try {
        const boundary = await fetchBoundaryByOsmId(region.properties.osmId, 'relation');
        if (boundary) finalRegion = boundary;
      } catch (err) {
        console.error("Error fetching special region boundary", err);
      } finally {
        setIsLoading(false);
      }
    }

    setSelectedRegions(prev => {
      const regionId = finalRegion.properties.id || finalRegion.properties.name;
      if (prev.find(r => (r.properties.id || r.properties.name) === regionId)) return prev;
      return [...prev, finalRegion];
    });
  }, []);

  const handleRemoveRegion = useCallback((regionId: string) => {
    setSelectedRegions(prev => prev.filter(r => (r.properties.id || r.properties.name) !== regionId));
  }, []);

  const handleRemoveCity = useCallback((cityId: string) => {
    setSelectedCities(prev => prev.filter(c => (c.properties.id || c.properties.name) === cityId ? false : true));
  }, []);

  const handleCitySelect = useCallback(async (target: {lat: number, lon: number, bounds?: any, osmId?: number, osmType?: string} | null) => {
    if (!target) return;
    setMapTarget(target);
    setIsLoading(true);
    try {
      const boundary = await fetchBoundaryByOsmId(target.osmId!, target.osmType!);
      if (boundary) {
        setSelectedCities(prev => {
          const cityId = boundary.properties.id || boundary.properties.name;
          if (prev.find(c => (c.properties.id || c.properties.name) === cityId)) return prev;
          return [...prev, boundary];
        });
      }
    } catch (err) {
      console.error("Error fetching city boundary", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSaveProject = useCallback(() => {
    const projectData: ProjectData = {
      version: "1.1",
      kmlLayers,
      selectedRegions,
      selectedCities,
      settings: {
        mapMode,
        useMultiColor,
        showRoads,
        showRegionalRoads,
        dimMap
      }
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kml_project_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [kmlLayers, selectedRegions, selectedCities, mapMode, useMultiColor, showRoads, showRegionalRoads, dimMap]);

  const handleLoadProject = useCallback((project: ProjectData) => {
    if (project.kmlLayers) setKmlLayers(project.kmlLayers);
    if (project.selectedRegions) setSelectedRegions(project.selectedRegions);
    if (project.selectedCities) setSelectedCities(project.selectedCities);
    if (project.settings) {
      setMapMode(project.settings.mapMode);
      setUseMultiColor(project.settings.useMultiColor);
      setShowRoads(project.settings.showRoads);
      setShowRegionalRoads(project.settings.showRegionalRoads);
      setDimMap(project.settings.dimMap);
    }
  }, []);

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
        selectedCities={selectedCities}
        onRemoveCity={handleRemoveCity}
        mapMode={mapMode}
        onSetMapMode={setMapMode}
        useMultiColor={useMultiColor}
        onSetMultiColor={setUseMultiColor}
        showRoads={showRoads}
        onSetShowRoads={setShowRoads}
        showRegionalRoads={showRegionalRoads}
        onSetShowRegionalRoads={setShowRegionalRoads}
        dimMap={dimMap}
        onSetDimMap={setDimMap}
        isLoading={isLoading}
        onCitySelect={handleCitySelect}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />
      
      <main className="flex-1 relative">
        <MapView 
          kmlLayers={kmlLayers}
          selectedRegions={selectedRegions}
          selectedCities={selectedCities}
          mapMode={mapMode}
          useMultiColor={useMultiColor}
          showRoads={showRoads}
          showRegionalRoads={showRegionalRoads}
          showSettlements={false}
          onLoadingChange={setIsLoading}
          mapTarget={mapTarget}
          dimMap={dimMap}
        />
        
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-4 bg-[#111] p-8 rounded-3xl border border-[#222] shadow-2xl">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white font-bold tracking-tight">Обработка данных OSM...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
