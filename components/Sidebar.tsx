
import React, { useState, useEffect, useRef } from 'react';
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
  Grid,
  Route,
  X,
  Navigation,
  MapPin,
  Plus,
  RotateCcw,
  Moon,
  Save,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Building2,
  Loader2
} from 'lucide-react';
import { KmlLayerData, MapMode, ProjectData } from '../types';
import { parseKml } from '../utils/geoUtils';

interface SidebarProps {
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
  onSaveProject: () => void;
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
  onSaveProject,
  onLoadProject
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [regions, setRegions] = useState<any[]>([]);
  const [regionSearch, setRegionSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [isCitySearching, setIsCitySearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeout = useRef<any>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

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
      .catch(err => {
        setRegions(SPECIAL_REGIONS);
      });
  }, []);

  const handleCitySearch = (query: string) => {
    setCitySearch(query);
    setSearchError(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    if (query.trim().length < 2) { 
      setCityResults([]); 
      setIsCitySearching(false); 
      return; 
    }
    
    setIsCitySearching(true);
    searchTimeout.current = setTimeout(async () => {
      const fetchWithTimeout = (url: string, timeout = 5000) => {
        return Promise.race([
          fetch(url, { referrerPolicy: "no-referrer" }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
        ]) as Promise<Response>;
      };

      const fetchPhoton = async () => {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=ru`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`Photon status: ${response.status}`);
        const data = await response.json();
        const typeMap: Record<string, string> = { 'N': 'node', 'W': 'way', 'R': 'relation' };
        return (data.features || []).map((item: any) => {
          const p = item.properties;
          const label = [p.name, p.city, p.state, p.country].filter(Boolean).join(', ');
          return {
            display_name: label,
            name: p.name || label.split(',')[0],
            lat: item.geometry.coordinates[1],
            lon: item.geometry.coordinates[0],
            osm_id: p.osm_id,
            osm_type: typeMap[p.osm_type] || 'node'
          };
        });
      };

      const fetchNominatim = async () => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=8&addressdetails=1&accept-language=ru`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`Nominatim status: ${response.status}`);
        const data = await response.json();
        return data.map((item: any) => ({
          display_name: item.display_name,
          name: item.name || item.display_name.split(',')[0],
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          osm_id: parseInt(item.osm_id),
          osm_type: item.osm_type
        }));
      };

      try {
        let results = [];
        try {
          results = await fetchPhoton();
        } catch (e) {
          try {
            results = await fetchNominatim();
          } catch (e2) {
            throw new Error("Все геокодеры недоступны");
          }
        }
        setCityResults(results);
        if (results.length === 0) setSearchError("Ничего не найдено");
      } catch (finalError) {
        setSearchError("Ошибка сети. Проверьте соединение.");
        setCityResults([]);
      } finally {
        setIsCitySearching(false);
      }
    }, 500);
  };

  const selectCity = (city: any) => {
    onCitySelect({lat: city.lat, lon: city.lon, osmId: city.osm_id, osmType: city.osm_type}); 
    setCitySearch(''); 
    setCityResults([]); 
    setSearchError(null);
  };

  const handleCityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cityResults.length > 0) {
        selectCity(cityResults[0]);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const geoJson = parseKml(text);
      if (geoJson) onAddKml(file.name, geoJson);
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleProjectLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const project = JSON.parse(text) as ProjectData;
        onLoadProject(project);
      } catch (err) {
        alert("Ошибка при чтении файла проекта. Убедитесь, что это корректный JSON файл KML-МАСТЕР.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredRegions = regions.filter(r => 
    r.properties.name?.toLowerCase().includes(regionSearch.toLowerCase()) &&
    !selectedRegions.some(selected => (selected.properties.id || selected.properties.name) === (r.properties.id || r.properties.name))
  ).slice(0, 15);

  const triggerExport = () => window.dispatchEvent(new CustomEvent('trigger-export'));

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-80'} h-full bg-[#111] border-r border-[#222] flex flex-col z-[2000] shadow-2xl relative transition-all duration-300 ease-in-out`}>
      
      {/* Кнопка сворачивания */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 bg-[#222] text-gray-400 hover:text-white rounded-full p-1 border border-[#333] z-[2100] shadow-lg"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`p-6 border-b border-[#222] ${isCollapsed ? 'px-2 items-center' : ''} flex flex-col`}>
        {!isCollapsed ? (
          <>
            <h1 className="text-xl font-black tracking-tighter bg-gradient-to-br from-blue-400 to-indigo-600 bg-clip-text text-transparent leading-none">
              KML-МАСТЕР
            </h1>
            <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-[0.2em] font-bold">Карты без заморочек</p>
          </>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xs">KM</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 overflow-x-hidden">
        
        {/* ПРОЕКТ */}
        <section className={`space-y-3 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {!isCollapsed && (
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Save size={12} /> ПРОЕКТ
            </h2>
          )}
          <div className={isCollapsed ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"}>
            <button 
              onClick={onSaveProject}
              title="Сохранить проект"
              className={`flex items-center justify-center gap-2 p-3 bg-[#1a1a1a] border border-[#333] hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl transition-all group ${isCollapsed ? 'w-10 h-10 p-0' : ''}`}
            >
              <Save size={14} className="text-gray-400 group-hover:text-blue-400" />
              {!isCollapsed && <span className="text-[10px] font-bold text-gray-400 group-hover:text-blue-400 uppercase tracking-tight">Сохранить</span>}
            </button>
            <button 
              onClick={() => projectInputRef.current?.click()}
              title="Открыть проект"
              className={`flex items-center justify-center gap-2 p-3 bg-[#1a1a1a] border border-[#333] hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-xl transition-all group ${isCollapsed ? 'w-10 h-10 p-0' : ''}`}
            >
              <FolderOpen size={14} className="text-gray-400 group-hover:text-emerald-400" />
              {!isCollapsed && <span className="text-[10px] font-bold text-gray-400 group-hover:text-emerald-400 uppercase tracking-tight">Открыть</span>}
            </button>
            <input type="file" ref={projectInputRef} className="hidden" accept=".json" onChange={handleProjectLoad} />
          </div>
        </section>

        {/* ИМПОРТ KML */}
        <section className={`space-y-3 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {!isCollapsed && (
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <FileUp size={12} /> ИМПОРТ KML
            </h2>
          )}
          <label 
            title="Загрузить KML"
            className={`flex flex-col items-center justify-center border-2 border-dashed border-[#222] hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl transition-all cursor-pointer group ${isCollapsed ? 'w-10 h-10' : 'w-full h-20'}`}
          >
            <input type="file" accept=".kml" className="hidden" onChange={handleFileUpload} />
            <FileUp size={isCollapsed ? 16 : 20} className="text-gray-600 group-hover:text-blue-400" />
            {!isCollapsed && <span className="text-[11px] text-gray-500 group-hover:text-blue-400 font-medium mt-1">Загрузить KML</span>}
          </label>
          
          <button 
            onClick={() => onSetMultiColor(!useMultiColor)} 
            title="Разноцветные линии"
            className={`flex items-center justify-center p-2 bg-[#1a1a1a] rounded-lg border transition-all ${useMultiColor ? 'border-amber-500/50 bg-amber-500/5' : 'border-[#222]'} ${isCollapsed ? 'w-10 h-10' : 'w-full justify-between'}`}
          >
            <div className="flex items-center gap-2">
              <Palette size={14} className={useMultiColor ? 'text-amber-400' : 'text-gray-500'} />
              {!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Разноцветность</span>}
            </div>
            {!isCollapsed && (
              <div className={`w-8 h-4 rounded-full relative transition-colors ${useMultiColor ? 'bg-amber-500' : 'bg-[#333]'}`}>
                <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${useMultiColor ? '18px' : '2px'})` }} />
              </div>
            )}
          </button>
        </section>

        {/* ВЫБОР ОБЛАСТИ */}
        <section className={`space-y-3 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {isCollapsed ? (
            <button 
              onClick={() => setIsCollapsed(false)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all"
              title="Поиск областей"
            >
              <Search size={18} />
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={12} /> ОБЛАСТИ
                </h2>
                {selectedRegions.length > 0 && (
                  <button onClick={() => selectedRegions.forEach(r => onRemoveRegion(r.properties.id || r.properties.name))} className="text-[9px] text-red-500/60 hover:text-red-500 font-bold uppercase transition-colors flex items-center gap-1">
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>

              <div className="relative mb-2">
                <input 
                  type="text" 
                  placeholder="Поиск региона..."
                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg px-3 py-2 text-sm focus:outline-none pr-10 placeholder:text-gray-700"
                  value={regionSearch}
                  onChange={(e) => setRegionSearch(e.target.value)}
                />
                {!regionSearch && <Search className="absolute right-3 top-2.5 text-gray-700" size={14} />}
              </div>
            </>
          )}

          {!isCollapsed && (
            <button 
              onClick={() => onSetDimMap(!dimMap)} 
              title="Затемнить фон"
              className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border border-[#222] transition-all w-full"
            >
              <div className="flex items-center gap-2">
                <Moon size={14} className={dimMap ? 'text-blue-400' : 'text-gray-500'} />
                <span className="text-[11px] font-medium text-gray-400">Затемнить фон</span>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${dimMap ? 'bg-blue-500' : 'bg-[#333]'}`}>
                <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${dimMap ? '18px' : '2px'})` }} />
              </div>
            </button>
          )}

          {!isCollapsed && regionSearch.length > 0 && (
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
                  <button onClick={() => onRemoveRegion(region.properties.id || region.properties.name)} className="text-blue-400/50 hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {isCollapsed && selectedRegions.length > 0 && (
            <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-[10px] text-blue-400 font-black">
              {selectedRegions.length}
            </div>
          )}
        </section>

        {/* НАСЕЛЕННЫЕ ПУНКТЫ */}
        <section className={`space-y-3 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {isCollapsed ? (
            <button 
              onClick={() => setIsCollapsed(false)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all"
              title="Поиск городов"
            >
              <Building2 size={18} />
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Building2 size={12} /> НАСЕЛЕННЫЕ ПУНКТЫ
                </h2>
                {selectedCities.length > 0 && (
                  <button onClick={() => selectedCities.forEach(c => onRemoveCity(c.properties.id || c.properties.name))} className="text-[9px] text-red-500/60 hover:text-red-500 font-bold uppercase transition-colors flex items-center gap-1">
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>

              <div className="relative mb-2">
                <input 
                  type="text" 
                  placeholder="Поиск города..."
                  className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg px-3 py-2 text-sm focus:outline-none pr-10 placeholder:text-gray-700"
                  value={citySearch}
                  onChange={(e) => handleCitySearch(e.target.value)}
                  onKeyDown={handleCityKeyDown}
                />
                <div className="absolute right-3 top-2.5">
                  {isCitySearching ? (
                    <Loader2 className="animate-spin text-blue-500" size={14} />
                  ) : (
                    <Search className="text-gray-700" size={14} />
                  )}
                </div>
              </div>
            </>
          )}

          {!isCollapsed && (cityResults.length > 0 || searchError) && (
            <div className="max-h-48 overflow-y-auto bg-[#161616] border border-[#222] rounded-lg mb-3 shadow-xl custom-scrollbar">
              {searchError && <p className="p-3 text-[10px] text-gray-500 italic">{searchError}</p>}
              {cityResults.map((city, i) => (
                <button 
                  key={i} 
                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-emerald-600 hover:text-white border-b border-[#222] last:border-0 flex items-center justify-between group transition-colors"
                  onClick={() => selectCity(city)}
                >
                  <span className="truncate">{city.display_name}</span>
                  <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {!isCollapsed && (
            <div className="space-y-1">
              {selectedCities.map(city => (
                <div key={city.properties.id || city.properties.name} className="flex items-center justify-between p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg group">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <MapPin size={10} className="text-emerald-400 shrink-0" />
                    <span className="text-[11px] text-emerald-400 font-bold truncate">{city.properties.name}</span>
                  </div>
                  <button onClick={() => onRemoveCity(city.properties.id || city.properties.name)} className="text-emerald-400/50 hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {isCollapsed && selectedCities.length > 0 && (
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-[10px] text-emerald-400 font-black">
              {selectedCities.length}
            </div>
          )}
        </section>

        {/* СЛОИ И ВИД */}
        <section className={`space-y-4 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {!isCollapsed && (
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Settings size={12} /> СЛОИ
            </h2>
          )}
          
          <div className={`flex items-center p-2 bg-[#1a1a1a] rounded-lg border border-[#222] ${isCollapsed ? 'flex-col gap-2' : 'justify-between'}`}>
            {!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Карта</span>}
            <div className={`flex ${isCollapsed ? 'flex-col' : ''} gap-1`}>
              {[
                { mode: MapMode.STREETS, icon: <MapIcon size={12} />, title: 'Яндекс' },
                { mode: MapMode.GRAY_VECTOR, icon: <Grid size={12} />, title: 'Серый' },
                { mode: MapMode.NONE, icon: <EyeOff size={12} />, title: 'Пусто' }
              ].map(opt => (
                <button key={opt.mode} title={opt.title} onClick={() => onSetMapMode(opt.mode)} className={`p-1.5 rounded-md transition-all ${mapMode === opt.mode ? 'bg-blue-500 text-white shadow-md' : 'text-gray-500 hover:bg-[#222]'}`}>{opt.icon}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button 
              onClick={() => onSetShowRoads(!showRoads)} 
              title="Федеральные трассы"
              className={`flex items-center justify-center p-2 bg-[#1a1a1a] rounded-lg border transition-all ${showRoads ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-[#222]'} ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full justify-between'}`}
            >
              <div className="flex items-center gap-2">
                <Route size={14} className={showRoads ? 'text-indigo-400' : 'text-gray-500'} />
                {!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Фед. трассы</span>}
              </div>
              {!isCollapsed && (
                <div className={`w-8 h-4 rounded-full relative transition-colors ${showRoads ? 'bg-indigo-500' : 'bg-[#333]'}`}>
                  <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRoads ? '18px' : '2px'})` }} />
                </div>
              )}
            </button>
            <button 
              onClick={() => onSetShowRegionalRoads(!showRegionalRoads)} 
              title="Региональные трассы"
              className={`flex items-center justify-center p-2 bg-[#1a1a1a] rounded-lg border transition-all ${showRegionalRoads ? 'border-blue-500/50 bg-blue-500/5' : 'border-[#222]'} ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full justify-between'}`}
            >
              <div className="flex items-center gap-2">
                <Route size={14} className={showRegionalRoads ? 'text-blue-400' : 'text-gray-500'} />
                {!isCollapsed && <span className="text-[11px] font-medium text-gray-400">Регион. трассы</span>}
              </div>
              {!isCollapsed && (
                <div className={`w-8 h-4 rounded-full relative transition-colors ${showRegionalRoads ? 'bg-blue-500' : 'bg-[#333]'}`}>
                  <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRegionalRoads ? '18px' : '2px'})` }} />
                </div>
              )}
            </button>
          </div>
        </section>

        {/* СПИСОК KML */}
        {!isCollapsed && (
          <section>
            <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
              <Layers size={12} /> СПИСОК KML ({kmlLayers.length})
            </h2>
            <div className="space-y-1">
              {[...kmlLayers].reverse().map(layer => (
                <div key={layer.id} className="flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded-lg group transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                     <input type="color" title="Цвет слоя" value={layer.color} onChange={(e) => onUpdateKmlColor(layer.id, e.target.value)} className="w-5 h-5 rounded-md border border-[#333] bg-transparent cursor-pointer overflow-hidden" />
                     <span className="text-[11px] text-gray-400 truncate max-w-[140px] font-medium">{layer.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onToggleKml(layer.id)} className="p-1.5 text-gray-600 hover:text-blue-400" title={layer.visible ? 'Скрыть' : 'Показать'}>{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                    <button onClick={() => onRemoveKml(layer.id)} className="p-1.5 text-gray-600 hover:text-red-500" title="Удалить"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
              {kmlLayers.length === 0 && <p className="text-[10px] text-gray-700 italic text-center py-4">Пусто</p>}
            </div>
          </section>
        )}
      </div>

      <div className={`p-4 bg-[#0a0a0a] border-t border-[#222] ${isCollapsed ? 'p-2 items-center' : ''} flex`}>
        <button 
          onClick={triggerExport} 
          title="СКАЧАТЬ SVG"
          className={`bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl flex items-center justify-center transition-all shadow-xl active:scale-95 group ${isCollapsed ? 'w-10 h-10' : 'w-full py-3 gap-2 text-xs uppercase tracking-tighter'}`}
        >
          <Download size={isCollapsed ? 18 : 16} className="group-hover:translate-y-0.5 transition-transform" /> 
          {!isCollapsed && <span>СКАЧАТЬ SVG</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
