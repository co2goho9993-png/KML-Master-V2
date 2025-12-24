
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
  AlertCircle
} from 'lucide-react';
import { KmlLayerData, MapMode } from '../types';
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
  mapMode: MapMode;
  onSetMapMode: (mode: MapMode) => void;
  useMultiColor: boolean;
  onSetMultiColor: (val: boolean) => void;
  showRoads: boolean;
  onSetShowRoads: (val: boolean) => void;
  showRegionalRoads: boolean;
  onSetShowRegionalRoads: (val: boolean) => void;
  isLoading: boolean;
  onCitySelect: (target: {lat: number, lon: number, bounds?: any, osmId?: number | number[], osmType?: string} | null) => void;
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
  mapMode,
  onSetMapMode,
  useMultiColor,
  onSetMultiColor,
  showRoads,
  onSetShowRoads,
  showRegionalRoads,
  onSetShowRegionalRoads,
  onCitySelect
}) => {
  const [regions, setRegions] = useState<any[]>([]);
  const [regionSearch, setRegionSearch] = useState('');
  
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [isCitySearching, setIsCitySearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const searchTimeout = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        setRegions([...SPECIAL_REGIONS, ...filteredRemote]);
      })
      .catch(err => {
        console.error("Failed to load regions", err);
        setRegions(SPECIAL_REGIONS);
      });
      
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handleCitySearch = (query: string) => {
    setCitySearch(query);
    setSearchError(null);
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (query.trim().length < 2) {
      setCityResults([]);
      setIsCitySearching(false);
      return;
    }

    setIsCitySearching(true);
    searchTimeout.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&accept-language=ru`;
        const response = await fetch(url, { signal: controller.signal });
        
        if (!response.ok) throw new Error("Ошибка сервиса поиска");
        
        const data = await response.json();
        
        const results = data.map((item: any) => ({
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          osm_id: parseInt(item.osm_id),
          osm_type: item.osm_type
        }));

        setCityResults(results);
        if (results.length === 0) setSearchError("Город не найден");
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        setSearchError("Ошибка при поиске. Попробуйте позже.");
        setCityResults([]);
      } finally {
        if (abortControllerRef.current === controller) {
          setIsCitySearching(false);
          abortControllerRef.current = null;
        }
      }
    }, 600); 
  };

  const handleCityClick = (city: any) => {
    onCitySelect({
      lat: city.lat,
      lon: city.lon,
      osmId: city.osm_id,
      osmType: city.osm_type
    });
    setCitySearch('');
    setCityResults([]);
    setSearchError(null);
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

  const filteredRegions = regions.filter(r => 
    r.properties.name?.toLowerCase().includes(regionSearch.toLowerCase()) &&
    !selectedRegions.some(selected => (selected.properties.id || selected.properties.name) === (r.properties.id || r.properties.name))
  ).slice(0, 10);

  const triggerExport = () => window.dispatchEvent(new CustomEvent('trigger-export'));

  return (
    <div className="w-80 h-full bg-[#111] border-r border-[#222] flex flex-col z-[2000] shadow-2xl">
      <div className="p-6 border-b border-[#222]">
        <h1 className="text-xl font-black tracking-tighter bg-gradient-to-br from-blue-400 to-indigo-600 bg-clip-text text-transparent leading-none">
          KML-МАСТЕР
        </h1>
        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-[0.2em] font-bold">Карты без заморочек</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {/* Блок ИМПОРТ KML */}
        <section>
          <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
            <FileUp size={12} /> ИМПОРТ KML
          </h2>
          <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-[#222] hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl transition-all cursor-pointer group mb-3">
            <input type="file" accept=".kml" className="hidden" onChange={handleFileUpload} />
            <FileUp size={20} className="text-gray-600 group-hover:text-blue-400 mb-1" />
            <span className="text-[11px] text-gray-500 group-hover:text-blue-400 font-medium">Загрузить файл</span>
          </label>
          
          <button 
            onClick={() => onSetMultiColor(!useMultiColor)} 
            className={`w-full flex items-center justify-between p-2.5 bg-[#1a1a1a] rounded-lg border transition-all ${useMultiColor ? 'border-blue-500/50 bg-blue-500/10' : 'border-[#222]'}`}
          >
            <div className="flex items-center gap-2">
              <Palette size={14} className={useMultiColor ? 'text-blue-400' : 'text-gray-500'} />
              <span className="text-[11px] font-medium text-gray-400">Цвета объектов (KML)</span>
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${useMultiColor ? 'bg-blue-500' : 'bg-[#333]'}`}>
               <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${useMultiColor ? 'translate-x-4.5' : 'translate-x-0.5'}`} style={{ transform: `translateX(${useMultiColor ? '18px' : '2px'})` }} />
            </div>
          </button>
        </section>

        {/* Блок ПОИСК ГОРОДА */}
        <section>
          <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
            <MapPin size={12} /> ПОИСК ГОРОДА
          </h2>
          <div className="relative">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Введите название города..."
                className={`w-full bg-[#1a1a1a] border ${searchError ? 'border-red-500/50' : 'border-[#222]'} rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all duration-300 pr-10`}
                value={citySearch}
                onChange={(e) => handleCitySearch(e.target.value)}
              />
              {citySearch && (
                <button onClick={() => { setCitySearch(''); setCityResults([]); setSearchError(null); }} className="absolute right-3 top-2.5 text-gray-500 hover:text-white"><X size={14} /></button>
              )}
            </div>
            
            {isCitySearching && <div className="flex items-center gap-2 mt-2 px-1"><div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /><span className="text-[10px] text-gray-500">Поиск в OSM...</span></div>}

            {searchError && (
              <div className="flex items-start gap-2 mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded-lg text-[10px] text-red-400">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <div className="flex-1"><p className="font-bold uppercase text-[8px] mb-0.5">Внимание</p><p>{searchError}</p></div>
              </div>
            )}

            {cityResults.length > 0 && !isCitySearching && (
              <div className="absolute w-full mt-1 bg-[#1a1a1a] border border-[#222] rounded-lg overflow-hidden shadow-2xl z-[3000] animate-in fade-in slide-in-from-top-2">
                {cityResults.map((city, i) => (
                  <button key={i} className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-600 hover:text-white transition-colors border-b border-[#222] last:border-0 flex items-start gap-2 group" onClick={() => handleCityClick(city)}>
                    <Navigation size={12} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100" />
                    <span className="truncate leading-tight">{city.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Блок ВЫБОР РЕГИОНА */}
        <section>
          <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
            <Search size={12} /> ВЫБОР РЕГИОНА
          </h2>
          <input 
            type="text" 
            placeholder="Крым, Запорожская..."
            className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={regionSearch}
            onChange={(e) => setRegionSearch(e.target.value)}
          />
          {regionSearch.length > 0 && filteredRegions.length > 0 && (
            <div className="mt-1 bg-[#1a1a1a] border border-[#222] rounded-lg overflow-hidden shadow-xl z-50 relative">
              {filteredRegions.map((r, i) => (
                <button key={i} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-500 hover:text-white border-b border-[#222] last:border-0" onClick={() => { onSelectRegion(r); setRegionSearch(''); }}>{r.properties.name}</button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Settings size={12} /> СЛОИ И ВИД
          </h2>
          
          <div className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border border-[#222]">
            <span className="text-[11px] font-medium text-gray-400">Тип карты</span>
            <div className="flex gap-1">
              {[
                { mode: MapMode.STREETS, icon: <MapIcon size={12} />, title: 'Цвет' },
                { mode: MapMode.GRAY_VECTOR, icon: <Grid size={12} />, title: 'Вектор' },
                { mode: MapMode.NONE, icon: <EyeOff size={12} />, title: 'Пусто' }
              ].map(opt => (
                <button key={opt.mode} title={opt.title} onClick={() => onSetMapMode(opt.mode)} className={`p-1.5 rounded-md transition-all ${mapMode === opt.mode ? 'bg-blue-500 text-white shadow-md' : 'text-gray-500 hover:bg-[#222]'}`}>{opt.icon}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button onClick={() => onSetShowRoads(!showRoads)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${showRoads ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-[#222]'}`}>
              <div className="flex items-center gap-2"><Route size={14} className={showRoads ? 'text-indigo-400' : 'text-gray-500'} /><span className="text-[11px] font-medium text-gray-400">Фед. трассы</span></div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${showRoads ? 'bg-indigo-500' : 'bg-[#333]'}`}><div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRoads ? '18px' : '2px'})` }} /></div>
            </button>

            <button onClick={() => onSetShowRegionalRoads(!showRegionalRoads)} className={`w-full flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border transition-all ${showRegionalRoads ? 'border-indigo-400/30 bg-indigo-400/5' : 'border-[#222]'}`}>
              <div className="flex items-center gap-2"><Layers size={14} className={showRegionalRoads ? 'text-indigo-300' : 'text-gray-500'} /><span className="text-[11px] font-medium text-gray-400">Рег. трассы</span></div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${showRegionalRoads ? 'bg-indigo-400' : 'bg-[#333]'}`}><div className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200" style={{ transform: `translateX(${showRegionalRoads ? '18px' : '2px'})` }} /></div>
            </button>
          </div>
        </section>

        {selectedRegions.length > 0 && (
          <section>
            <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
              <Layers size={12} /> ВЫБРАННЫЕ ОБЛАСТИ
            </h2>
            <div className="space-y-1">
              {selectedRegions.map(region => (
                <div key={region.properties.id || region.properties.name} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border border-[#222]">
                  <span className="text-[11px] text-gray-400 truncate max-w-[180px]">{region.properties.name}</span>
                  <button onClick={() => onRemoveRegion(region.properties.id || region.properties.name)} className="text-gray-500 hover:text-red-500 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-[10px] font-black text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2">
            <Layers size={12} /> СПИСОК KML ({kmlLayers.length})
          </h2>
          <div className="space-y-1">
            {kmlLayers.map(layer => (
              <div key={layer.id} className="flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors group">
                <div className="flex items-center gap-3 overflow-hidden">
                   <div className="relative">
                     <input 
                       type="color" 
                       value={layer.color} 
                       onChange={(e) => onUpdateKmlColor(layer.id, e.target.value)}
                       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                       title="Выбрать цвет слоя"
                     />
                     <div className="w-4 h-4 rounded-sm border border-[#333]" style={{ backgroundColor: layer.color }} />
                   </div>
                   <span className="text-[11px] text-gray-400 truncate max-w-[140px]">{layer.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onToggleKml(layer.id)} className="p-1 text-gray-600 hover:text-blue-400">{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                  <button onClick={() => onRemoveKml(layer.id)} className="p-1 text-gray-600 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="p-4 bg-[#0a0a0a] border-t border-[#222]">
        <button onClick={triggerExport} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 text-xs uppercase tracking-tighter">
          <Download size={16} /> СКАЧАТЬ SVG (600 DPI)
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
