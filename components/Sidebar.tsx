
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
  Grid,
  Route,
  X,
  Navigation,
  MapPin,
  Plus,
  RotateCcw,
  Moon,
  Globe,
  Sun,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { KmlLayerData, MapMode } from '../types';
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
      .catch(err => {
        setRegions(SPECIAL_REGIONS);
      });
  }, []);

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

  const triggerExport = () => window.dispatchEvent(new CustomEvent('trigger-export'));

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-80'} h-full bg-[#111] border-r border-[#222] flex flex-col z-[2000] shadow-2xl relative transition-all duration-300 ease-in-out`}>
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-3 top-20 bg-[#222] border border-[#333] rounded-full p-1 text-gray-400 hover:text-white hover:bg-[#333] transition-all z-[2001]"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

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
                <span className="text-[11px] text-gray-500 group-hover:text-blue-400 font-medium">Загрузить файл</span>
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
            <div 
              onClick={() => expandAndFocus('region')}
              className="flex justify-center text-gray-600 mb-2 cursor-pointer hover:text-blue-400 transition-colors" 
              title="Поиск региона"
            >
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
                <button onClick={() => setRegionSearch('')} className="absolute right-3 top-2.5 text-gray-500">
                  <X size={14} />
                </button>
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
                {selectedRegions.length > 0 && (
                   <div className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                      {selectedRegions.length}
                   </div>
                )}
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
                  <button onClick={() => onRemoveRegion(region.properties.id || region.properties.name)} className="text-blue-400/50 hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
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
              {selectedCities.length > 0 && (
                <button onClick={() => selectedCities.forEach(c => onRemoveCity(c.properties.id || c.properties.name))} className="text-[9px] text-red-500/60 hover:text-red-500 font-bold uppercase transition-colors flex items-center gap-1">
                  <RotateCcw size={10} /> Сброс
                </button>
              )}
            </div>
          ) : (
            <div 
              onClick={() => expandAndFocus('city')}
              className="flex justify-center text-gray-600 mb-2 cursor-pointer hover:text-blue-400 transition-colors" 
              title="Поиск города"
            >
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
                onKeyDown={handleCityKeyDown}
              />
              {citySearch && (
                <button onClick={() => { setCitySearch(''); setCityResults([]); setSearchError(null); }} className="absolute right-3 top-2.5 text-gray-600 hover:text-white"><X size={14} /></button>
              )}
              
              {(isCitySearching || cityResults.length > 0 || searchError) && (
                <div className="absolute top-full left-0 w-full mt-1 bg-[#1a1a1a] border border-[#222] rounded-lg overflow-hidden shadow-2xl z-[5000] max-h-64 overflow-y-auto custom-scrollbar">
                  {isCitySearching && (
                    <div className="px-3 py-4 text-center">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <span className="text-[10px] text-gray-500">Поиск...</span>
                    </div>
                  )}
                  {searchError && !isCitySearching && (
                    <div className="px-3 py-4 text-center text-red-400 text-[11px] leading-relaxed">
                      {searchError}
                    </div>
                  )}
                  {!isCitySearching && cityResults.map((city, i) => (
                    <button 
                      key={i} 
                      className="w-full text-left px-3 py-3 text-[11px] hover:bg-blue-600 hover:text-white border-b border-[#222] last:border-0 flex items-start gap-3 transition-colors group" 
                      onClick={() => selectCity(city)}
                    >
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

          {!isCollapsed ? (
            <div className="mt-2 space-y-1">
              {selectedCities.map(city => (
                <div key={city.properties.id || city.properties.name} className="flex items-center justify-between p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg group">
                  <span className="text-[11px] text-orange-400 font-bold truncate pr-2">{city.properties.name}</span>
                  <button onClick={() => onRemoveCity(city.properties.id || city.properties.name)} className="text-orange-400/50 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-center">
               {selectedCities.length > 0 && (
                  <div className="w-5 h-5 bg-orange-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                     {selectedCities.length}
                  </div>
               )}
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

          {!isCollapsed ? (
            <div className="space-y-2">
              <button onClick={() => onSetShowRoads(!showRoads)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${showRoads ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-[#222]'}`}>
                <div className="flex items-center gap-2"><Route size={14} className={showRoads ? 'text-indigo-400' : 'text-gray-500'} /><span className="text-[11px] font-medium text-gray-400">Фед. трассы</span></div>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${showRoads ? 'bg-indigo-500' : 'bg-[#333]'}`}><div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRoads ? '18px' : '2px'})` }} /></div>
              </button>
              <button onClick={() => onSetShowRegionalRoads(!showRegionalRoads)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${showRegionalRoads ? 'border-blue-500/50 bg-blue-500/5' : 'border-[#222]'}`}>
                <div className="flex items-center gap-2"><Route size={14} className={showRegionalRoads ? 'text-blue-400' : 'text-gray-500'} /><span className="text-[11px] font-medium text-gray-400">Регион. трассы</span></div>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${showRegionalRoads ? 'bg-blue-500' : 'bg-[#333]'}`}><div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRegionalRoads ? '18px' : '2px'})` }} /></div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-center">
               <button onClick={() => onSetShowRoads(!showRoads)} className={`p-2 rounded-lg border transition-all ${showRoads ? 'border-indigo-500/50 bg-indigo-500/5 text-indigo-400' : 'border-[#222] text-gray-500'}`} title="Федеральные трассы">
                  <Route size={18} />
               </button>
               <button onClick={() => onSetShowRegionalRoads(!showRegionalRoads)} className={`p-2 rounded-lg border transition-all ${showRegionalRoads ? 'border-blue-500/50 bg-blue-500/5 text-blue-400' : 'border-[#222] text-gray-500'}`} title="Региональные трассы">
                  <Route size={18} />
               </button>
            </div>
          )}
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
                    <input type="color" title="Цвет слоя" value={layer.color} onChange={(e) => onUpdateKmlColor(layer.id, e.target.value)} className="w-5 h-5 rounded-md border border-[#333] bg-transparent cursor-pointer overflow-hidden" />
                    <span className="text-[11px] text-gray-400 truncate max-w-[140px] font-medium">{layer.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onToggleKml(layer.id)} className="p-1.5 text-gray-600 hover:text-blue-400" title={layer.visible ? 'Скрыть' : 'Показать'}>{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                    <button onClick={() => onRemoveKml(layer.id)} className="p-1.5 text-gray-600 hover:text-red-500" title="Удалить"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
              {kmlLayers.length === 0 && <p className="text-[10px] text-gray-600 italic text-center py-4">Нет файлов</p>}
            </div>
          </section>
        )}
      </div>

      <div className={`p-4 bg-[#0a0a0a] border-t border-[#222] transition-all ${isCollapsed ? 'px-2' : ''}`}>
        <button 
          onClick={triggerExport} 
          className={`w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl flex items-center justify-center transition-all shadow-xl active:scale-95 text-xs uppercase tracking-tighter group ${isCollapsed ? 'h-10' : 'py-3 gap-2'}`}
          title="СКАЧАТЬ SVG (AI READY)"
        >
          <Download size={16} className={`${!isCollapsed && 'group-hover:translate-y-0.5'} transition-transform`} /> 
          {!isCollapsed && <span>СКАЧАТЬ SVG</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
