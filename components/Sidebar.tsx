
import React, { useEffect, useRef } from 'react';
import { 
  FileUp, 
  Map as MapIcon, 
  Layers, 
  Download, 
  Settings, 
  Search, 
  Trash2, 
  Eye, 
  EyeOff,
  Palette,
  Route,
  X,
  Navigation,
  MapPin,
  Plus,
  RotateCcw,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Save,
  FolderOpen
} from 'lucide-react';
import { KmlLayerData, MapMode, ProjectData } from '../types';
import { parseKml } from '../utils/geoUtils';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  kmlLayers: KmlLayerData[];
  onAddKml: (name: string, geoJson: any) => void;
  onRemoveKml: (id: string) => void;
  onToggleKml: (id: string) => void;
  onUpdateKmlColor: (id: string, color: string) => void;
  selectedRegions: any[];
  onSelectRegion: (region: any) => void;
  onRemoveRegion: (id: string) => void;
  selectedCities: any[];
  onRemoveCity: (id: string) => void;
  mapMode: MapMode;
  onSetMapMode: (mode: MapMode) => void;
  useMultiColor: boolean;
  onSetMultiColor: (val: boolean) => void;
  showRoads: boolean;
  onSetShowRoads: (val: boolean) => void;
  showRegionalRoads: boolean;
  onSetShowRegionalRoads: (val: boolean) => void;
  dimMap: boolean;
  onSetDimMap: (val: boolean) => void;
  isLoading: boolean;
  onCitySelect: (target: {lat: number, lon: number, bounds?: any, osmId?: number, osmType?: string} | null) => void;
  onLoadProject: (project: ProjectData) => void;
}

const SPECIAL_REGIONS = [
  { properties: { name: "Республика Крым (с Севастополем)", osmId: [3795586, 1574364], source: 'osm' }, geometry: null },
  { properties: { name: "Запорожская область", osmId: 71980, source: 'osm' }, geometry: null },
  { properties: { name: "Донецкая область", osmId: 71973, source: 'osm' }, geometry: null },
  { properties: { name: "Луганская область", osmId: 71971, source: 'osm' }, geometry: null },
  { properties: { name: "Херсонская область", osmId: 71022, source: 'osm' }, geometry: null },
  { properties: { name: "Севастополь (отдельно)", osmId: 1574364, source: 'osm' }, geometry: null }
];

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  kmlLayers,
  onAddKml,
  onRemoveKml,
  onToggleKml,
  onUpdateKmlColor,
  selectedRegions,
  onSelectRegion,
  onRemoveRegion,
  selectedCities,
  onRemoveCity,
  mapMode,
  onSetMapMode,
  useMultiColor,
  onSetMultiColor,
  showRoads,
  onSetShowRoads,
  showRegionalRoads,
  onSetShowRegionalRoads,
  dimMap,
  onSetDimMap,
  onCitySelect,
  onLoadProject,
}) => {
  const [regions, setRegions] = React.useState<any[]>([]);
  const [regionSearch, setRegionSearch] = React.useState('');
  const [citySearch, setCitySearch] = React.useState('');
  const [cityResults, setCityResults] = React.useState<any[]>([]);
  const [isCitySearching, setIsCitySearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const searchTimeout = useRef<any>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const regionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson')
      .then(res => res.json())
      .then(data => {
        const remoteRegions = data.features || [];
        const filteredRemote = remoteRegions.filter((rr: any) => {
          const name = rr.properties.name.toLowerCase();
          return !SPECIAL_REGIONS.some(sr => {
            const srName = sr.properties.name.toLowerCase();
            return name.includes(srName) || srName.includes(name);
          });
        });
        const allRegions = [...SPECIAL_REGIONS, ...filteredRemote].sort((a, b) => 
          a.properties.name.localeCompare(b.properties.name)
        );
        setRegions(allRegions);
      })
      .catch(() => setRegions(SPECIAL_REGIONS));
  }, []);

  const handleSaveProject = () => {
    const project: ProjectData = {
      version: "1.1",
      timestamp: Date.now(),
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
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kml_master_project_${new Date().toISOString().split('T')[0]}.kmlm`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const project = JSON.parse(content) as ProjectData;
        if (project.kmlLayers || project.selectedRegions) {
          onLoadProject(project);
        } else {
          throw new Error("Invalid format");
        }
      } catch (err) {
        console.error("Load project error:", err);
        alert("Ошибка: Некорректный формат файла проекта (.kmlm)");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const expandAndFocus = (type: 'city' | 'region') => {
    if (isCollapsed) onToggleCollapse();
    setTimeout(() => {
      if (type === 'city') cityInputRef.current?.focus();
      if (type === 'region') regionInputRef.current?.focus();
    }, 350);
  };

  const handleCitySearch = (query: string) => {
    setCitySearch(query);
    setSearchError(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.trim().length < 2) { setCityResults([]); setIsCitySearching(false); return; }
    
    setIsCitySearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=ru`;
        const response = await fetch(url);
        const data = await response.json();
        const results = (data.features || []).map((item: any) => ({
          display_name: [item.properties.name, item.properties.city, item.properties.state].filter(Boolean).join(', '),
          name: item.properties.name,
          lat: item.geometry.coordinates[1],
          lon: item.geometry.coordinates[0],
          osm_id: item.properties.osm_id,
          osm_type: item.properties.osm_type === 'R' ? 'relation' : item.properties.osm_type === 'W' ? 'way' : 'node'
        }));
        setCityResults(results);
      } catch {
        setSearchError("Ошибка поиска");
      } finally {
        setIsCitySearching(false);
      }
    }, 500);
  };

  const selectCity = (city: any) => {
    onCitySelect({lat: city.lat, lon: city.lon, osmId: city.osm_id, osmType: city.osm_type}); 
    setCitySearch(''); 
    setCityResults([]); 
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const geoJson = parseKml(text);
      if (geoJson) {
        onAddKml(file.name, geoJson);
        if (isCollapsed) onToggleCollapse(); 
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const filteredRegions = regions.filter(r => 
    r.properties.name?.toLowerCase().includes(regionSearch.toLowerCase()) &&
    !selectedRegions.some(selected => (selected.properties.id || selected.properties.name) === (r.properties.id || r.properties.name))
  ).slice(0, 15);

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-80'} h-full bg-[#111] border-r border-[#222] flex flex-col z-[2000] shadow-2xl relative transition-all duration-300 ease-in-out`}>
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-3 top-20 bg-[#222] border border-[#333] rounded-full p-1 text-gray-400 hover:text-white hover:bg-[#333] transition-all z-[2001]"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* HEADER */}
      <div 
        onClick={() => isCollapsed && onToggleCollapse()}
        className={`p-6 border-b border-[#222] cursor-pointer ${isCollapsed ? 'items-center px-0 flex flex-col justify-center' : ''}`}
      >
        {!isCollapsed ? (
          <>
            <h1 className="text-xl font-black tracking-tighter bg-gradient-to-br from-blue-400 to-indigo-600 bg-clip-text text-transparent leading-none">
              KML-МАСТЕР
            </h1>
            <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-[0.2em] font-bold">Карты без заморочек</p>
          </>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-black">K</span>
          </div>
        )}
      </div>

      {/* PROJECT ACTIONS - FIXED TOP TOOLBAR */}
      <div className={`p-4 bg-[#0d0d0d] border-b border-[#222] space-y-2 ${isCollapsed ? 'px-2 flex flex-col items-center' : ''}`}>
        {!isCollapsed && (
          <h2 className="text-[9px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-2 mb-1">
            <Save size={10} /> ФАЙЛ ПРОЕКТА
          </h2>
        )}
        <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'gap-2 w-full'}`}>
          <button 
            onClick={handleSaveProject} 
            className={`flex items-center justify-center gap-2 p-2.5 bg-[#1a1a1a] rounded-lg border border-[#222] text-blue-400 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/50 transition-all ${isCollapsed ? 'w-10 h-10' : 'flex-1'}`}
            title="Сохранить проект (.kmlm)"
          >
            <Save size={16} />
            {!isCollapsed && <span className="text-[11px] font-bold">Сохранить</span>}
          </button>
          <label 
            className={`flex items-center justify-center gap-2 p-2.5 bg-[#1a1a1a] rounded-lg border border-[#222] text-blue-400 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/50 transition-all cursor-pointer ${isCollapsed ? 'w-10 h-10' : 'flex-1'}`}
            title="Открыть проект (.kmlm)"
          >
            <input type="file" accept=".kmlm" className="hidden" onChange={handleLoadProjectFile} />
            <FolderOpen size={16} />
            {!isCollapsed && <span className="text-[11px] font-bold">Открыть</span>}
          </label>
        </div>
      </div>

      {/* SCROLLABLE AREA */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 ${isCollapsed ? 'px-2' : ''}`}>
        <section className="space-y-3">
          {!isCollapsed && (
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <FileUp size={12} /> ИМПОРТ KML
            </h2>
          )}
          
          {!isCollapsed ? (
            <>
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-[#222] hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl transition-all cursor-pointer group">
                <input type="file" accept=".kml" className="hidden" onChange={handleFileUpload} />
                <FileUp size={20} className="text-gray-600 group-hover:text-blue-400 mb-1" />
                <span className="text-[11px] text-gray-500 group-hover:text-blue-400 font-medium">Загрузить KML</span>
              </label>
              
              <button onClick={() => onSetMultiColor(!useMultiColor)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${useMultiColor ? 'border-amber-500/50 bg-amber-500/5' : 'border-[#222]'}`}>
                <div className="flex items-center gap-2">
                  <Palette size={14} className={useMultiColor ? 'text-amber-400' : 'text-gray-500'} />
                  <span className="text-[11px] font-medium text-gray-400">Разноцветность</span>
                </div>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${useMultiColor ? 'bg-amber-500' : 'bg-[#333]'}`}>
                  <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${useMultiColor ? '18px' : '2px'})` }} />
                </div>
              </button>
            </>
          ) : (
             <div className="flex flex-col gap-2 items-center">
                <label className="p-2 rounded-lg bg-[#1a1a1a] border border-[#222] text-gray-500 hover:text-blue-400 cursor-pointer" title="Загрузить KML">
                   <input type="file" accept=".kml" className="hidden" onChange={handleFileUpload} />
                   <FileUp size={18} />
                </label>
                <button 
                  onClick={() => onSetMultiColor(!useMultiColor)} 
                  className={`p-2 rounded-lg border transition-all ${useMultiColor ? 'border-amber-500/50 bg-amber-500/5 text-amber-400' : 'border-[#222] text-gray-500'}`} 
                  title="Разноцветность"
                >
                   <Palette size={18} />
                </button>
             </div>
          )}
        </section>

        <section>
          {!isCollapsed ? (
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Layers size={12} /> ВЫБОР ОБЛАСТИ
              </h2>
              {selectedRegions.length > 0 && (
                <button onClick={() => selectedRegions.forEach(r => onRemoveRegion(r.properties.id || r.properties.name))} className="text-[9px] text-red-500/60 hover:text-red-500 font-bold uppercase transition-colors flex items-center gap-1">
                  <RotateCcw size={10} /> Сброс
                </button>
              )}
            </div>
          ) : (
            <div onClick={() => expandAndFocus('region')} className="flex justify-center text-gray-600 mb-2 cursor-pointer hover:text-blue-400 transition-colors" title="Поиск региона">
              <Layers size={20} />
            </div>
          )}
          
          {!isCollapsed && (
            <div className="relative mb-2">
              <input 
                ref={regionInputRef}
                type="text" 
                placeholder="Поиск региона..."
                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg px-3 py-2 text-sm focus:outline-none pr-10"
                value={regionSearch}
                onChange={(e) => setRegionSearch(e.target.value)}
              />
              {regionSearch && (
                <button onClick={() => setRegionSearch('')} className="absolute right-3 top-2.5 text-gray-600"><X size={14} /></button>
              )}
              {!regionSearch && <Search className="absolute right-3 top-2.5 text-gray-600" size={14} />}
            </div>
          )}

          {!isCollapsed ? (
            <button onClick={() => onSetDimMap(!dimMap)} className={`w-full flex items-center justify-between p-2 mb-3 bg-[#1a1a1a] rounded-lg border transition-all ${dimMap ? 'border-blue-500/50 bg-blue-500/5' : 'border-[#222]'}`}>
              <div className="flex items-center gap-2">
                <Moon size={14} className={dimMap ? 'text-blue-400' : 'text-gray-500'} />
                <span className="text-[11px] font-medium text-gray-400">Затемнить фон</span>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${dimMap ? 'bg-blue-500' : 'bg-[#333]'}`}>
                <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${dimMap ? '18px' : '2px'})` }} />
              </div>
            </button>
          ) : (
             <div className="flex flex-col gap-2 items-center mb-3">
                <button 
                  onClick={() => onSetDimMap(!dimMap)} 
                  className={`p-2 rounded-lg border transition-all ${dimMap ? 'border-blue-500/50 bg-blue-500/5 text-blue-400' : 'border-[#222] text-gray-500'}`} 
                  title="Затемнить фон"
                >
                   <Moon size={18} />
                </button>
             </div>
          )}

          {regionSearch.length > 0 && !isCollapsed && (
            <div className="max-h-48 overflow-y-auto bg-[#161616] border border-[#222] rounded-lg mb-3 shadow-xl custom-scrollbar">
              {filteredRegions.map((region, i) => (
                <button 
                  key={i} 
                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-blue-600 hover:text-white border-b border-[#222] last:border-0 flex items-center justify-between group transition-colors"
                  onClick={() => { onSelectRegion(region); setRegionSearch(''); }}
                >
                  <span className="truncate">{region.properties.name}</span>
                  <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {!isCollapsed && (
            <div className="space-y-1">
              {selectedRegions.map(region => (
                <div key={region.properties.id || region.properties.name} className="flex items-center justify-between p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg group">
                  <span className="text-[11px] text-blue-400 font-bold truncate pr-2">{region.properties.name}</span>
                  <button onClick={() => onRemoveRegion(region.properties.id || region.properties.name)} className="text-blue-400/50 hover:text-red-400 transition-colors"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="relative">
          {!isCollapsed ? (
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <MapPin size={12} /> ПОИСК ГОРОДА
              </h2>
            </div>
          ) : (
            <div onClick={() => expandAndFocus('city')} className="flex justify-center text-gray-600 mb-2 cursor-pointer hover:text-blue-400 transition-colors" title="Поиск города">
              <MapPin size={20} />
            </div>
          )}
          
          {!isCollapsed && (
            <div className="relative">
              <input 
                ref={cityInputRef}
                type="text" 
                placeholder="Введите название..."
                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg px-3 py-2 text-sm focus:outline-none pr-10"
                value={citySearch}
                onChange={(e) => handleCitySearch(e.target.value)}
              />
              {cityResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1 bg-[#1a1a1a] border border-[#222] rounded-lg overflow-hidden shadow-2xl z-[5000] max-h-64 overflow-y-auto custom-scrollbar">
                  {cityResults.map((city, i) => (
                    <button key={i} className="w-full text-left px-3 py-3 text-[11px] hover:bg-blue-600 hover:text-white border-b border-[#222] last:border-0 flex items-start gap-3 transition-colors group" onClick={() => selectCity(city)}>
                      <Navigation size={14} className="mt-0.5 text-gray-600 group-hover:text-blue-200" /> 
                      <div className="flex flex-col min-w-0">
                        <span className="truncate leading-tight text-gray-300 group-hover:text-white font-bold">{city.name}</span>
                        <span className="truncate leading-tight text-[9px] text-gray-500 group-hover:text-blue-200 mt-0.5">{city.display_name.split(',').slice(1).join(',')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isCollapsed && (
            <div className="mt-2 space-y-1">
              {selectedCities.map(city => (
                <div key={city.properties.id || city.properties.name} className="flex items-center justify-between p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg group">
                  <span className="text-[11px] text-orange-400 font-bold truncate pr-2">{city.properties.name}</span>
                  <button onClick={() => onRemoveCity(city.properties.id || city.properties.name)} className="text-orange-400/50 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {!isCollapsed && (
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Settings size={12} /> СЛОИ И ВИД
            </h2>
          )}
          
          <div className={`flex ${isCollapsed ? 'flex-col items-center' : 'items-center justify-between'} p-2 bg-[#1a1a1a] rounded-lg border border-[#222]`}>
            {!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Вид</span>}
            <div className={`flex ${isCollapsed ? 'flex-col gap-2' : 'gap-1'}`}>
              {[
                { mode: MapMode.STREETS, icon: <MapIcon size={12} />, title: 'Яндекс' },
                { mode: MapMode.BRIGHT_V2, icon: <Sun size={12} />, title: 'Bright' },
                { mode: MapMode.DARK, icon: <Moon size={12} />, title: 'Dark' },
                { mode: MapMode.NONE, icon: <EyeOff size={12} />, title: 'Пусто' }
              ].map(opt => (
                <button key={opt.mode} title={opt.title} onClick={() => onSetMapMode(opt.mode)} className={`p-1.5 rounded-md transition-all ${mapMode === opt.mode ? 'bg-blue-500 text-white shadow-md' : 'text-gray-500 hover:bg-[#222]'}`}>{opt.icon}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button onClick={() => onSetShowRoads(!showRoads)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${isCollapsed ? 'justify-center' : ''} ${showRoads ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-[#222]'}`}>
              <div className="flex items-center gap-2"><Route size={14} className={showRoads ? 'text-indigo-400' : 'text-gray-500'} />{!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Фед. трассы</span>}</div>
              {!isCollapsed && <div className={`w-8 h-4 rounded-full relative transition-colors ${showRoads ? 'bg-indigo-500' : 'bg-[#333]'}`}><div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRoads ? '18px' : '2px'})` }} /></div>}
            </button>
            <button onClick={() => onSetShowRegionalRoads(!showRegionalRoads)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${isCollapsed ? 'justify-center' : ''} ${showRegionalRoads ? 'border-blue-500/50 bg-blue-500/5' : 'border-[#222]'}`}>
              <div className="flex items-center gap-2"><Route size={14} className={showRegionalRoads ? 'text-blue-400' : 'text-gray-500'} />{!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Регион. трассы</span>}</div>
              {!isCollapsed && <div className={`w-8 h-4 rounded-full relative transition-colors ${showRegionalRoads ? 'bg-blue-500' : 'bg-[#333]'}`}><div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRegionalRoads ? '18px' : '2px'})` }} /></div>}
            </button>
          </div>
        </section>

        {!isCollapsed && (
          <section>
            <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
              <Layers size={12} /> СПИСОК KML ({kmlLayers.length})
            </h2>
            <div className="space-y-1">
              {[...kmlLayers].reverse().map(layer => (
                <div key={layer.id} className="flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded-lg group transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <input type="color" value={layer.color} onChange={(e) => onUpdateKmlColor(layer.id, e.target.value)} className="w-5 h-5 rounded-md border border-[#333] bg-transparent cursor-pointer overflow-hidden" />
                    <span className="text-[11px] text-gray-400 truncate max-w-[140px] font-medium">{layer.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onToggleKml(layer.id)} className="p-1.5 text-gray-600 hover:text-blue-400">{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                    <button onClick={() => onRemoveKml(layer.id)} className="p-1.5 text-gray-600 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* FOOTER ACTION */}
      <div className={`p-4 bg-[#0a0a0a] border-t border-[#222] transition-all ${isCollapsed ? 'px-2' : ''}`}>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('trigger-export'))} 
          className={`w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl flex items-center justify-center transition-all shadow-xl active:scale-95 text-xs uppercase tracking-tighter group ${isCollapsed ? 'h-10' : 'py-3 gap-2'}`}
        >
          <Download size={16} /> 
          {!isCollapsed && <span>СКАЧАТЬ SVG</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
