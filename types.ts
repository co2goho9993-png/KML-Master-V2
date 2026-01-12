
export interface RegionFeature {
  type: "Feature";
  properties: {
    name: string;
    id: string;
    [key: string]: any;
  };
  geometry: any;
}

export interface KmlLayerData {
  id: string;
  name: string;
  geoJson: any;
  color: string;
  visible: boolean;
}

export enum MapMode {
  STREETS = 'streets',
  BRIGHT_V2 = 'bright_v2',
  DARK = 'dark',
  NONE = 'none'
}

export interface ProjectData {
  version: string;
  timestamp: number;
  kmlLayers: KmlLayerData[];
  selectedRegions: any[];
  selectedCities: any[];
  settings: {
    mapMode: MapMode;
    useMultiColor: boolean;
    showRoads: boolean;
    showRegionalRoads: boolean;
    dimMap: boolean;
  };
}
