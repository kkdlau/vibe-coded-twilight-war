import { CHAR_BASE_RADIUS, clamp, getMoveCheckRadius, pointInRect, resolveCircleRect } from './geometry';
import {
  ArenaMap,
  MapBiome,
  TILE,
  biomeToDefaultFloor,
  compileIglooWalls,
  createFloorGrid,
  getIglooCellMask,
  makePushableIceBlock,
} from './maps';
import {
  AmmoSpawn,
  BridgeRect,
  BushProp,
  CardinalDir,
  FactionId,
  FarmCropType,
  FarmTileCell,
  FloorStyle,
  GridTile,
  IglooProp,
  Obstacle,
  ObstacleStyle,
  PlatformStyle,
  PushableIceBlock,
  RailTrackCell,
  StairRect,
  TerrainTileCell,
  TreeProp,
  WeaponSpawn,
} from './types';

export const CUSTOM_MAPS_STORAGE_KEY = 'twilight_wars_custom_maps_v1';

export interface CustomStairEntry {
  gx: number;
  gy: number;
  gw?: number;
  gh?: number;
  direction: 'north' | 'south' | 'east' | 'west';
  style?: PlatformStyle;
}

export interface CustomBridgeEntry {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  orientation: 'horizontal' | 'vertical';
  style?: 'wood' | 'stone';
}

export interface CustomObstacleEntry {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  elevation: number; // 物件自身高度（1.0 小箱／欄杆 / 1.5 大箱／小石 / 2.0 貨櫃火車／大岩 / 10 實牆），編譯時自動疊加所在地形高度
  kind: 'crate' | 'wall';
  style?: ObstacleStyle;
  colorVariant?: string;
  direction?: 'north' | 'south' | 'east' | 'west';
}

export interface CustomSpawnCoord {
  gx: number;
  gy: number;
}

export interface CustomWeaponSpawnEntry extends CustomSpawnCoord {
  kind: 'gun' | 'melee';
  weaponId: string;
}

export interface CustomIglooEntry {
  gx: number;
  gy: number;
  direction: CardinalDir;
}

export interface CustomPushableIceEntry {
  gx: number;
  gy: number;
}

export interface CustomMapData {
  id: string;
  name: string;
  biome: MapBiome;
  cols: number;
  rows: number;
  updatedAt: number;
  floorGrid?: FloorStyle[][];
  tileGrid: TerrainTileCell[][];
  stairs: CustomStairEntry[];
  waterTiles: GridTile[];
  floatingIceTiles?: GridTile[];
  bridges: CustomBridgeEntry[];
  stoneRoads: GridTile[];
  railTracks: RailTrackCell[];
  farmTiles?: FarmTileCell[];
  iceVents?: GridTile[];
  campfires?: GridTile[];
  igloos?: CustomIglooEntry[];
  pushableIceBlocks?: CustomPushableIceEntry[];
  obstacles: CustomObstacleEntry[];
  bushes: CustomSpawnCoord[];
  trees: (CustomSpawnCoord & { canopyRadius?: number; foliagePalette?: [string, string, string, string] })[];
  weaponSpawns: CustomWeaponSpawnEntry[];
  ammoSpawns: CustomSpawnCoord[];
  shieldSpawns: CustomSpawnCoord[];
  factionSpawns: Record<FactionId, CustomSpawnCoord[]>;
}

/**
 * 編譯期強制規格：每一種地板 (`FloorStyle`) 皆必須綁定對應的高地地形與攀爬階梯。
 * 日後新增任何地板型別時，TypeScript 將強制要求於此註冊其高地與階梯設定。
 */
export interface FloorTerrainBinding {
  floorStyle: FloorStyle;
  floorLabel: string;
  floorSublabel: string;
  previewBiome: MapBiome;
  terrainStyle: PlatformStyle;
  terrainLabel: string;
  terrainDesc: string;
  stairLabel: string;
  stairDesc: string;
}

export const FLOOR_TERRAIN_BINDINGS: Record<FloorStyle, FloorTerrainBinding> = {
  shrine_dirt: {
    floorStyle: 'shrine_dirt',
    floorLabel: '江戶泥土地板',
    floorSublabel: '古社砂礫黃土',
    previewBiome: 'shrine_outdoor',
    terrainStyle: 'shrine_dirt',
    terrainLabel: '江戶土台（疊加）',
    terrainDesc: '江戶古社夯土高台，支援逐層疊加（+1.0/層），搭配江戶土坡階梯無縫上下銜接。',
    stairLabel: '江戶土坡階梯',
    stairDesc: '專屬於「江戶土台」的平滑夯土坡道（所在層 +0.5），僅可貼合並指向同系高台攀登。',
  },
  bamboo_moss: {
    floorStyle: 'bamboo_moss',
    floorLabel: '嵐山林間苔土',
    floorSublabel: '深翠密林地坪',
    previewBiome: 'bamboo_outdoor',
    terrainStyle: 'bamboo_moss',
    terrainLabel: '嵐山苔台（疊加）',
    terrainDesc: '密林深翠苔蘚土台，支援逐層疊加（+1.0/層），僅可與嵐山苔階自然相接。',
    stairLabel: '嵐山苔階',
    stairDesc: '專屬於「嵐山苔台」的平滑苔土坡道（所在層 +0.5），貼合高台時自動融接苔緣。',
  },
  desert_sand: {
    floorStyle: 'desert_sand',
    floorLabel: '荒野沙海地板',
    floorSublabel: '金色乾旱細沙',
    previewBiome: 'desert_outdoor',
    terrainStyle: 'pyramid',
    terrainLabel: '切石高台（疊加）',
    terrainDesc: '遺跡砂岩切石平台，支援逐層疊加（1.0、2.0…）；跨格物件須置於等高格位。',
    stairLabel: '切石石階',
    stairDesc: '專屬於「切石高台」的砂岩石砌階梯（所在層 +0.5），銜接高台邊緣時自動消除多餘石縫。',
  },
  castle_stone: {
    floorStyle: 'castle_stone',
    floorLabel: '聖殿石磚地板',
    floorSublabel: '古堡淺灰磚石',
    previewBiome: 'castle_indoor',
    terrainStyle: 'castle_dais',
    terrainLabel: '聖殿石台（疊加）',
    terrainDesc: '歐式古堡青灰大理石高台，支援逐層疊加（+1.0/層），與聖殿石階無縫接軌。',
    stairLabel: '聖殿石階',
    stairDesc: '專屬於「聖殿石台」的大理石階梯（所在層 +0.5），僅可銜接聖殿石台。',
  },
  warehouse_steel: {
    floorStyle: 'warehouse_steel',
    floorLabel: '東港鋼板地板',
    floorSublabel: '深藍工業地坪',
    previewBiome: 'warehouse_indoor',
    terrainStyle: 'warehouse_steel',
    terrainLabel: '鋼構高台（疊加）',
    terrainDesc: '工業貨倉鉚接鋼板高台，支援逐層疊加（+1.0/層），邊緣附帶防滑黃框。',
    stairLabel: '鋼構斜階',
    stairDesc: '專屬於「鋼構高台」的防滑鐵板階梯（所在層 +0.5），僅可貼合鋼構高台登台。',
  },
  grass_ground: {
    floorStyle: 'grass_ground',
    floorLabel: '青綠草坪地板',
    floorSublabel: '鮮綠柔軟草地',
    previewBiome: 'shrine_outdoor',
    terrainStyle: 'hill',
    terrainLabel: '土丘高地（疊加）',
    terrainDesc: '青翠山丘高地，支援任意多層疊加（1.0、2.0…），並可承載水面、竹林或箱體。',
    stairLabel: '土坡階梯',
    stairDesc: '專屬於「土丘高地」的平滑自然土坡（所在層 +0.5），與草丘接觸面無縫融接。',
  },
  glacier_ice: {
    floorStyle: 'glacier_ice',
    floorLabel: '極地冰川地板',
    floorSublabel: '萬年玄冰雪原',
    previewBiome: 'glacier_outdoor',
    terrainStyle: 'glacier_ice',
    terrainLabel: '極地冰川高地（疊加）',
    terrainDesc: '晶瑩冰脊凍土高地，支援逐層疊加（+1.0/層），僅可搭配極地冰川階梯攀登。',
    stairLabel: '極地冰川階梯',
    stairDesc: '專屬於「極地冰川高地」的平滑冰雪斜坡（所在層 +0.5），貼合冰川高台自然融合。',
  },
};

export interface StandaloneTerrainSpec {
  id: 'shrine_floor' | 'mud_pit';
  terrainStyle: PlatformStyle;
  terrainLabel: string;
  heightLabel: string;
  terrainDesc: string;
  stairLabel: string;
  stairDesc: string;
}

export const STANDALONE_TERRAIN_SPECS: StandaloneTerrainSpec[] = [
  {
    id: 'shrine_floor',
    terrainStyle: 'shrine_floor',
    terrainLabel: '木板神社高台（疊加）',
    heightLabel: '每層 +1.0',
    terrainDesc: '斜面木板架高神社迴廊，支援多層疊加（+1.0/層），須搭配木板神社階梯。',
    stairLabel: '木板神社階梯',
    stairDesc: '專屬於「木板神社高台」的朱木階梯（所在層 +0.5），貼合木台時自動無縫接軌。',
  },
  {
    id: 'mud_pit',
    terrainStyle: 'mud_pit',
    terrainLabel: '泥坑窪地（下挖）',
    heightLabel: '每層 -1.0',
    terrainDesc: '向下凹陷的泥濘坑地，支援逐層深挖（-1.0、-2.0…）；平地子彈越過泥坑不受低窪阻擋。',
    stairLabel: '泥坡階梯',
    stairDesc: '專屬於「泥坑窪地」的坑內平滑泥坡（所在層 +0.5），須置於泥坑格位內並朝向上層出口。',
  },
];

export const FLOOR_STYLE_OPTIONS: {
  id: FloorStyle;
  label: string;
  sublabel: string;
  previewBiome: MapBiome;
}[] = (Object.values(FLOOR_TERRAIN_BINDINGS) as FloorTerrainBinding[]).map((b) => ({
  id: b.floorStyle,
  label: b.floorLabel,
  sublabel: b.floorSublabel,
  previewBiome: b.previewBiome,
}));

export const BIOME_OPTIONS: { id: MapBiome; label: string; environment: '野外' | '室內' }[] = [
  { id: 'shrine_outdoor', label: '江戶・古社泥土', environment: '野外' },
  { id: 'bamboo_outdoor', label: '嵐山・翠竹林土', environment: '野外' },
  { id: 'desert_outdoor', label: '荒野・沙海黃土', environment: '野外' },
  { id: 'castle_indoor', label: '聖殿・石磚地坪', environment: '室內' },
  { id: 'warehouse_indoor', label: '東港・鋼板地坪', environment: '室內' },
  { id: 'glacier_outdoor', label: '極地・裂隙冰川', environment: '野外' },
];

export function floorStyleToBiome(floor: FloorStyle): MapBiome {
  return FLOOR_TERRAIN_BINDINGS[floor]?.previewBiome ?? 'shrine_outdoor';
}

export interface TreeFoliagePreset {
  id: string;
  label: string;
  palette: [string, string, string, string];
}

export const TREE_FOLIAGE_PRESETS: TreeFoliagePreset[] = [
  { id: 'evergreen', label: '翠綠常青', palette: ['#14532D', '#166534', '#15803D', '#22C55E'] },
  { id: 'sakura', label: '櫻花粉嫩', palette: ['#831843', '#BE185D', '#F472B6', '#FBCFE8'] },
  { id: 'maple', label: '秋楓赤紅', palette: ['#7F1D1D', '#991B1B', '#DC2626', '#F97316'] },
  { id: 'ginkgo', label: '金黃銀杏', palette: ['#713F12', '#A16207', '#CA8A04', '#FACC15'] },
  { id: 'bamboo_jade', label: '嵐山翡翠', palette: ['#064E3B', '#047857', '#059669', '#34D399'] },
  { id: 'snow_pine', label: '蒼雪冷杉', palette: ['#0F4C5C', '#1E607A', '#3891A6', '#BAE6FD'] },
];

export const ROCK_COLOR_OPTIONS: { id: 'black' | 'brown' | 'white'; label: string; swatch: string }[] = [
  { id: 'black', label: '黑石', swatch: '#334155' },
  { id: 'brown', label: '棕石', swatch: '#78350F' },
  { id: 'white', label: '白石', swatch: '#CBD5E1' },
];

export const HOUSE_STYLE_OPTIONS: { id: string; label: string; swatch: string }[] = [
  { id: 'moss_stone', label: '青苔石瓦屋', swatch: '#52525B' },
  { id: 'edo_wood', label: '和風朱簷屋', swatch: '#991B1B' },
  { id: 'royal_manor', label: '歐式紅頂屋', swatch: '#7C2D12' },
  { id: 'desert_adobe', label: '荒野土坯屋', swatch: '#B45309' },
  { id: 'brick_workshop', label: '紅磚工坊屋', swatch: '#9A3412' },
];

export const FARM_CROP_OPTIONS: { id: FarmCropType; label: string; swatch: string }[] = [
  { id: 'empty', label: '空田（耕土）', swatch: '#78350F' },
  { id: 'carrot', label: '紅蘿蔔田', swatch: '#EA580C' },
  { id: 'wheat', label: '小麥金穗田', swatch: '#EAB308' },
  { id: 'cabbage', label: '甘藍菜田', swatch: '#22C55E' },
];

export function getDefaultTreePalette(biome: MapBiome): [string, string, string, string] {
  switch (biome) {
    case 'castle_indoor':
      return ['#064E3B', '#047857', '#059669', '#34D399'];
    case 'desert_outdoor':
      return ['#14532D', '#3F6212', '#65A30D', '#84CC16'];
    case 'bamboo_outdoor':
      return ['#14532D', '#166534', '#16A34A', '#4ADE80'];
    case 'warehouse_indoor':
    case 'shrine_outdoor':
    default:
      return ['#14532D', '#166534', '#15803D', '#22C55E'];
  }
}

export function createCustomMapId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 檢查指定多格矩形覆蓋範圍內的底層地形高度是否完全一致（所有 >1×1 物件必須嚴格遵守）
 */
export function hasUniformCellElevation(
  tileGrid: TerrainTileCell[][],
  gx: number,
  gy: number,
  gw: number,
  gh: number
): boolean {
  const rows = tileGrid.length;
  const cols = tileGrid[0]?.length ?? 0;
  if (gx < 0 || gy < 0 || gx + gw > cols || gy + gh > rows) return false;
  const firstElev = tileGrid[gy][gx].elev;
  for (let y = gy; y < gy + gh; y++) {
    for (let x = gx; x < gx + gw; x++) {
      if (Math.abs(tileGrid[y][x].elev - firstElev) > 0.001) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 檢查冰屋（5×5 外框內精確 3/5/5/5/3 共 21 格）之所有實際佔用格是否皆在圖內且地形高度完全一致
 */
export function hasUniformIglooElevation(
  tileGrid: TerrainTileCell[][],
  gx: number,
  gy: number,
  direction: CardinalDir
): boolean {
  const rows = tileGrid.length;
  const cols = tileGrid[0]?.length ?? 0;
  const { occupied } = getIglooCellMask(gx, gy, direction);
  if (occupied.length === 0) return false;
  let firstElev: number | null = null;
  for (const cell of occupied) {
    if (cell.gx < 0 || cell.gx >= cols || cell.gy < 0 || cell.gy >= rows) return false;
    const elev = tileGrid[cell.gy][cell.gx].elev;
    if (firstElev === null) {
      firstElev = elev;
    } else if (Math.abs(elev - firstElev) > 0.001) {
      return false;
    }
  }
  return true;
}

export function normalizeTerrainStyle(style?: PlatformStyle): PlatformStyle | null {
  if (!style || style === 'default' || style === 'grass_ground' || style === 'rail_track') return null;
  if (style === 'wooden_plank') return 'shrine_floor';
  return style;
}

const STAIR_DIR_DELTA: Record<'north' | 'south' | 'east' | 'west', [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/**
 * 嚴格檢驗地形階梯是否放置並指向「同一系地形」：
 * - 正向地形階梯（土坡、切石、神社木板、冰川等）：必須從 curElev (0 或同系 >=1) 指向 curElev + 1.0 且樣式完全相同的相鄰高台
 * - 泥坑階梯 ('mud_pit')：必須位於負層泥坑格位 (curElev <= -1.0, mud_pit) 並指向 curElev + 1.0 的出口（0.0 平地或上層泥坑）
 * - 物件層的「木條階梯踏台 ('default')」則不受地形樣式鎖定
 */
export function canPlaceTerrainStairAt(
  tileGrid: TerrainTileCell[][],
  gx: number,
  gy: number,
  stairStyle: PlatformStyle | undefined,
  direction: 'north' | 'south' | 'east' | 'west'
): boolean {
  const rows = tileGrid.length;
  const cols = tileGrid[0]?.length ?? 0;
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
  const normStair = normalizeTerrainStyle(stairStyle);
  if (!normStair) return true;

  const [dx, dy] = STAIR_DIR_DELTA[direction];
  const nx = gx + dx;
  const ny = gy + dy;
  if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false;

  const cur = tileGrid[gy][gx];
  const curStyle = normalizeTerrainStyle(cur.style);
  const target = tileGrid[ny][nx];
  const targetStyle = normalizeTerrainStyle(target.style);

  if (normStair === 'mud_pit') {
    return (
      cur.elev <= -1.0 &&
      curStyle === 'mud_pit' &&
      Math.abs(target.elev - (cur.elev + 1.0)) <= 0.01 &&
      (Math.abs(target.elev) <= 0.01 || targetStyle === 'mud_pit')
    );
  }

  return (
    cur.elev >= 0 &&
    (cur.elev < 1.0 || curStyle === normStair) &&
    Math.abs(target.elev - (cur.elev + 1.0)) <= 0.01 &&
    targetStyle === normStair
  );
}

/**
 * 嘗試以偏好的方向優先，尋找與該格相接之同系高台／泥坑方向（找不到則回傳 null）
 */
export function findMatchingStairDirection(
  tileGrid: TerrainTileCell[][],
  gx: number,
  gy: number,
  stairStyle: PlatformStyle | undefined,
  preferredDir: 'north' | 'south' | 'east' | 'west'
): 'north' | 'south' | 'east' | 'west' | null {
  const order: ('north' | 'south' | 'east' | 'west')[] = [
    preferredDir,
    'north',
    'east',
    'south',
    'west',
  ];
  for (const dir of order) {
    if (canPlaceTerrainStairAt(tileGrid, gx, gy, stairStyle, dir)) {
      return dir;
    }
  }
  return null;
}

export function getIntrinsicObstacleHeight(
  kind: 'crate' | 'wall',
  style?: ObstacleStyle,
  fallbackElevation = 1.0
): number {
  if (kind === 'wall') return 10;
  if (style === 'small_crate' || style === 'railing') return 1.0;
  if (style === 'rock_small') return 1.5;
  if (style === 'container' || style === 'train_car' || style === 'rock_large') return 2.0;
  if (style === 'default') return 1.5;
  return fallbackElevation;
}

export function resolveNormalizedFloorGrid(data: {
  cols: number;
  rows: number;
  biome: MapBiome;
  floorGrid?: FloorStyle[][];
  tileGrid: TerrainTileCell[][];
}): FloorStyle[][] {
  const defaultFloor = biomeToDefaultFloor(data.biome);
  return Array.from({ length: data.rows }, (_, gy) =>
    Array.from({ length: data.cols }, (__, gx) => {
      const explicit = data.floorGrid?.[gy]?.[gx];
      if (explicit) return explicit;
      if (data.tileGrid[gy]?.[gx]?.style === 'grass_ground') return 'grass_ground';
      return defaultFloor;
    })
  );
}

export function createBlankCustomMap(
  name = '未命名自訂戰場',
  biome: MapBiome = 'shrine_outdoor',
  cols = 30,
  rows = 22
): CustomMapData {
  const safeCols = clamp(Math.round(cols), 12, 60);
  const safeRows = clamp(Math.round(rows), 12, 60);
  const floorGrid = createFloorGrid(safeCols, safeRows, biomeToDefaultFloor(biome));
  const tileGrid: TerrainTileCell[][] = Array.from({ length: safeRows }, () =>
    Array.from({ length: safeCols }, () => ({ elev: 0, style: 'default' as PlatformStyle }))
  );

  return {
    id: createCustomMapId(),
    name,
    biome,
    cols: safeCols,
    rows: safeRows,
    updatedAt: Date.now(),
    floorGrid,
    tileGrid,
    stairs: [],
    waterTiles: [],
    floatingIceTiles: [],
    bridges: [],
    stoneRoads: [],
    railTracks: [],
    farmTiles: [],
    iceVents: [],
    campfires: [],
    igloos: [],
    pushableIceBlocks: [],
    obstacles: [],
    bushes: [],
    trees: [],
    weaponSpawns: [],
    ammoSpawns: [],
    shieldSpawns: [],
    factionSpawns: {
      royal: [],
      shadow: [],
      mercenary: [],
    },
  };
}

export function cloneCustomMap(data: CustomMapData): CustomMapData {
  const cloned = JSON.parse(JSON.stringify(data)) as CustomMapData;
  cloned.floatingIceTiles = cloned.floatingIceTiles || [];
  cloned.stoneRoads = cloned.stoneRoads || [];
  cloned.railTracks = cloned.railTracks || [];
  cloned.farmTiles = cloned.farmTiles || [];
  cloned.iceVents = cloned.iceVents || [];
  cloned.campfires = cloned.campfires || [];
  cloned.igloos = cloned.igloos || [];
  cloned.pushableIceBlocks = cloned.pushableIceBlocks || [];
  cloned.floorGrid = resolveNormalizedFloorGrid(cloned);
  return cloned;
}

export function resizeCustomMap(data: CustomMapData, nextCols: number, nextRows: number): CustomMapData {
  const safeCols = clamp(Math.round(nextCols), 12, 60);
  const safeRows = clamp(Math.round(nextRows), 12, 60);
  const prevFloors = resolveNormalizedFloorGrid(data);
  const fallbackFloor = biomeToDefaultFloor(data.biome);

  const floorGrid: FloorStyle[][] = Array.from({ length: safeRows }, (_, gy) =>
    Array.from({ length: safeCols }, (__, gx) => prevFloors[gy]?.[gx] ?? fallbackFloor)
  );

  const tileGrid: TerrainTileCell[][] = Array.from({ length: safeRows }, (_, gy) =>
    Array.from({ length: safeCols }, (__, gx) => {
      const prev = data.tileGrid[gy]?.[gx];
      return prev ? { elev: prev.elev, style: prev.style } : { elev: 0, style: 'default' as PlatformStyle };
    })
  );

  const inCell = (gx: number, gy: number, gw = 1, gh = 1) =>
    gx >= 0 && gy >= 0 && gx + gw <= safeCols && gy + gh <= safeRows;

  return {
    ...data,
    cols: safeCols,
    rows: safeRows,
    updatedAt: Date.now(),
    floorGrid,
    tileGrid,
    stairs: data.stairs.filter((s) => inCell(s.gx, s.gy, s.gw ?? 1, s.gh ?? 1)),
    waterTiles: data.waterTiles.filter((w) => inCell(w.gx, w.gy)),
    floatingIceTiles: (data.floatingIceTiles || []).filter((f) => inCell(f.gx, f.gy)),
    bridges: data.bridges.filter((b) => inCell(b.gx, b.gy, b.gw, b.gh)),
    stoneRoads: (data.stoneRoads || []).filter((r) => inCell(r.gx, r.gy)),
    railTracks: (data.railTracks || []).filter((r) => inCell(r.gx, r.gy)),
    farmTiles: (data.farmTiles || []).filter((f) => inCell(f.gx, f.gy)),
    iceVents: (data.iceVents || []).filter((iv) => inCell(iv.gx, iv.gy)),
    campfires: (data.campfires || []).filter((cf) => inCell(cf.gx, cf.gy)),
    igloos: (data.igloos || []).filter((ig) => inCell(ig.gx, ig.gy, 5, 5)),
    pushableIceBlocks: (data.pushableIceBlocks || []).filter((pb) => inCell(pb.gx, pb.gy, 2, 2)),
    obstacles: data.obstacles.filter((o) => inCell(o.gx, o.gy, o.gw, o.gh)),
    bushes: data.bushes.filter((b) => inCell(b.gx, b.gy)),
    trees: data.trees.filter((t) => inCell(t.gx, t.gy)),
    weaponSpawns: data.weaponSpawns.filter((w) => inCell(w.gx, w.gy)),
    ammoSpawns: data.ammoSpawns.filter((a) => inCell(a.gx, a.gy)),
    shieldSpawns: data.shieldSpawns.filter((s) => inCell(s.gx, s.gy)),
    factionSpawns: {
      royal: data.factionSpawns.royal.filter((sp) => inCell(sp.gx, sp.gy)),
      shadow: data.factionSpawns.shadow.filter((sp) => inCell(sp.gx, sp.gy)),
      mercenary: data.factionSpawns.mercenary.filter((sp) => inCell(sp.gx, sp.gy)),
    },
  };
}

/**
 * 將 CustomMapData 編譯為實戰引擎可執行的 ArenaMap：
 * - 地板層 (`floorGrid`) 支援任意單格／矩陣混搭，完全獨立於地形高台、水域與物件
 * - 所有階梯高度一律動態計算為「所在底層地形高度 +0.5」
 * - 所有物件皆疊加於所在地形之上（例：+1.0 高台上的 +1.0 小箱 = 2.0 總高）
 * - 實心牆體、房屋、竹林、樹幹皆確保高度 >= 10，完全遵循純高度物理規則
 */
export function buildArenaMapFromCustom(data: CustomMapData): ArenaMap {
  const { cols, rows } = data;
  const legacyRailTracks: RailTrackCell[] = [];
  const floorGrid = resolveNormalizedFloorGrid(data);
  const tileGrid: TerrainTileCell[][] = Array.from({ length: rows }, (_, gy) =>
    Array.from({ length: cols }, (__, gx) => {
      const cell = data.tileGrid[gy]?.[gx];
      if (!cell) return { elev: 0, style: 'default' };
      if (cell.style === 'rail_track') {
        legacyRailTracks.push({ gx, gy, orientation: 'horizontal' });
        return { elev: cell.elev, style: 'default' };
      }
      if (cell.style === 'grass_ground' && cell.elev === 0) {
        return { elev: 0, style: 'default' };
      }
      return { elev: cell.elev, style: cell.style };
    })
  );

  const stairs: StairRect[] = data.stairs.map((st) => {
    const baseElev = tileGrid[clamp(st.gy, 0, rows - 1)]?.[clamp(st.gx, 0, cols - 1)]?.elev ?? 0;
    const computedElev = Math.round((baseElev + 0.5) * 10) / 10;
    return {
      x: st.gx * TILE,
      y: st.gy * TILE,
      w: (st.gw ?? 1) * TILE,
      h: (st.gh ?? 1) * TILE,
      elevation: computedElev,
      direction: st.direction,
      style: st.style,
    };
  });

  const waterTiles: GridTile[] = [];
  const waterTileKeys = new Set<string>();
  for (const wt of data.waterTiles) {
    if (wt.gx < 0 || wt.gx >= cols || wt.gy < 0 || wt.gy >= rows) continue;
    const key = `${wt.gx},${wt.gy}`;
    if (waterTileKeys.has(key)) continue;
    waterTileKeys.add(key);
    waterTiles.push({ gx: wt.gx, gy: wt.gy });
  }

  const bridges: BridgeRect[] = data.bridges.map((b) => ({
    x: b.gx * TILE,
    y: b.gy * TILE,
    w: b.gw * TILE,
    h: b.gh * TILE,
    orientation: b.orientation,
    style: b.style ?? 'wood',
  }));

  const stoneRoads: GridTile[] = (data.stoneRoads || []).filter(
    (r) => r.gx >= 0 && r.gx < cols && r.gy >= 0 && r.gy < rows
  );

  const railMap = new Map<string, RailTrackCell>();
  for (const rt of [...legacyRailTracks, ...(data.railTracks || [])]) {
    if (rt.gx >= 0 && rt.gx < cols && rt.gy >= 0 && rt.gy < rows) {
      railMap.set(`${rt.gx},${rt.gy}`, { gx: rt.gx, gy: rt.gy, orientation: rt.orientation });
    }
  }
  const railTracks = Array.from(railMap.values());

  const farmMap = new Map<string, FarmTileCell>();
  for (const ft of data.farmTiles || []) {
    if (ft.gx >= 0 && ft.gx < cols && ft.gy >= 0 && ft.gy < rows) {
      farmMap.set(`${ft.gx},${ft.gy}`, { gx: ft.gx, gy: ft.gy, crop: ft.crop });
    }
  }
  const farmTiles = Array.from(farmMap.values());

  const iceVentMap = new Map<string, GridTile>();
  for (const iv of data.iceVents || []) {
    if (iv.gx >= 0 && iv.gx < cols && iv.gy >= 0 && iv.gy < rows) {
      iceVentMap.set(`${iv.gx},${iv.gy}`, { gx: iv.gx, gy: iv.gy });
    }
  }
  const iceVents = Array.from(iceVentMap.values());

  const floatingIceTiles: GridTile[] = [];
  const floatingIceTileKeys = new Set<string>();
  for (const fi of data.floatingIceTiles || []) {
    if (fi.gx < 0 || fi.gx >= cols || fi.gy < 0 || fi.gy >= rows) continue;
    const key = `${fi.gx},${fi.gy}`;
    if (!waterTileKeys.has(key) || floatingIceTileKeys.has(key)) continue;
    floatingIceTileKeys.add(key);
    floatingIceTiles.push({ gx: fi.gx, gy: fi.gy });
  }

  const campfireMap = new Map<string, GridTile>();
  for (const cf of data.campfires || []) {
    if (cf.gx >= 0 && cf.gx < cols && cf.gy >= 0 && cf.gy < rows) {
      campfireMap.set(`${cf.gx},${cf.gy}`, { gx: cf.gx, gy: cf.gy });
    }
  }
  const campfires = Array.from(campfireMap.values());

  const igloos: IglooProp[] = (data.igloos || [])
    .filter((ig) => ig.gx >= 0 && ig.gy >= 0 && ig.gx + 5 <= cols && ig.gy + 5 <= rows)
    .map((ig) => {
      const { entrance } = getIglooCellMask(ig.gx, ig.gy, ig.direction);
      const baseElev = tileGrid[clamp(entrance.gy, 0, rows - 1)]?.[clamp(entrance.gx, 0, cols - 1)]?.elev ?? 0;
      return {
        x: ig.gx * TILE,
        y: ig.gy * TILE,
        w: 5 * TILE,
        h: 5 * TILE,
        direction: ig.direction,
        elevation: baseElev,
      };
    });

  const pushableIceBlocks: PushableIceBlock[] = (data.pushableIceBlocks || [])
    .filter((pb) => pb.gx >= 0 && pb.gy >= 0 && pb.gx + 2 <= cols && pb.gy + 2 <= rows)
    .map((pb, idx) => {
      const baseElev = tileGrid[clamp(pb.gy, 0, rows - 1)]?.[clamp(pb.gx, 0, cols - 1)]?.elev ?? 0;
      return makePushableIceBlock(`custom_push_${idx}_${pb.gx}_${pb.gy}`, pb.gx, pb.gy, baseElev);
    });

  const obstacles: Obstacle[] = data.obstacles
    .filter((o) => o.style !== 'igloo_wall')
    .map((o) => {
      const baseElev = tileGrid[clamp(o.gy, 0, rows - 1)]?.[clamp(o.gx, 0, cols - 1)]?.elev ?? 0;
      const intrinsic = getIntrinsicObstacleHeight(o.kind, o.style, o.elevation);
      const totalElev =
        o.kind === 'wall'
          ? Math.max(10, Math.round((baseElev + 10) * 10) / 10)
          : Math.round((baseElev + intrinsic) * 10) / 10;
      return {
        x: o.gx * TILE,
        y: o.gy * TILE,
        w: o.gw * TILE,
        h: o.gh * TILE,
        elevation: totalElev,
        kind: o.kind,
        style: o.style,
        colorVariant: o.colorVariant,
        direction: o.direction,
      };
    });
  for (const ig of igloos) {
    obstacles.push(...compileIglooWalls(ig));
  }

  const bushes: BushProp[] = data.bushes.map((b) => ({
    x: b.gx * TILE,
    y: b.gy * TILE,
    w: TILE,
    h: TILE,
  }));

  const defaultPalette = getDefaultTreePalette(data.biome);
  const trees: TreeProp[] = data.trees.map((t) => ({
    x: t.gx * TILE,
    y: t.gy * TILE,
    w: TILE,
    h: TILE,
    canopyRadius: t.canopyRadius ?? 44,
    foliagePalette: t.foliagePalette ?? defaultPalette,
  }));

  const weaponSpawns: WeaponSpawn[] = data.weaponSpawns.map((w) => ({
    x: (w.gx + 0.5) * TILE,
    y: (w.gy + 0.5) * TILE,
    kind: w.kind,
    weaponId: w.weaponId,
  }));

  const ammoSpawns: AmmoSpawn[] = data.ammoSpawns.map((a) => ({
    x: (a.gx + 0.5) * TILE,
    y: (a.gy + 0.5) * TILE,
    respawnTimer: 0,
    active: true,
  }));

  const shieldSpawns: AmmoSpawn[] = data.shieldSpawns.map((s) => ({
    x: (s.gx + 0.5) * TILE,
    y: (s.gy + 0.5) * TILE,
    respawnTimer: 0,
    active: true,
  }));

  const mapSpawn = (sp: CustomSpawnCoord) => ({
    x: (sp.gx + 0.5) * TILE,
    y: (sp.gy + 0.5) * TILE,
  });

  return {
    id: data.id,
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: data.biome,
    name: data.name.trim() || '未命名自訂戰場',
    floorGrid,
    tileGrid,
    stairs,
    waterTiles,
    waterTileKeys,
    floatingIceTiles,
    floatingIceTileKeys,
    bridges,
    stoneRoads,
    railTracks,
    farmTiles,
    iceVents,
    campfires,
    igloos,
    pushableIceBlocks,
    obstacles,
    bushes,
    trees,
    weaponSpawns,
    ammoSpawns,
    shieldSpawns,
    factionSpawns: {
      royal: data.factionSpawns.royal.map(mapSpawn),
      shadow: data.factionSpawns.shadow.map(mapSpawn),
      mercenary: data.factionSpawns.mercenary.map(mapSpawn),
    },
  };
}

/**
 * 將內建 ArenaMap 反向轉為可編輯 CustomMapData（支援「從現有戰場複製再編輯」）
 */
export function arenaMapToCustomData(map: ArenaMap, customName?: string): CustomMapData {
  const floorGrid = resolveNormalizedFloorGrid({
    cols: map.cols,
    rows: map.rows,
    biome: map.biome,
    floorGrid: map.floorGrid,
    tileGrid: map.tileGrid,
  });
  return {
    id: createCustomMapId(),
    name: customName ?? `${map.name} · 改編`,
    biome: map.biome,
    cols: map.cols,
    rows: map.rows,
    updatedAt: Date.now(),
    floorGrid,
    tileGrid: map.tileGrid.map((row) =>
      row.map((c) => ({ elev: c.elev, style: c.style === 'grass_ground' ? 'default' : c.style }))
    ),
    stairs: map.stairs.map((s) => ({
      gx: Math.round(s.x / TILE),
      gy: Math.round(s.y / TILE),
      gw: Math.max(1, Math.round(s.w / TILE)),
      gh: Math.max(1, Math.round(s.h / TILE)),
      direction: s.direction,
      style: s.style,
    })),
    waterTiles: map.waterTiles.map((w) => ({ gx: w.gx, gy: w.gy })),
    floatingIceTiles: (map.floatingIceTiles || []).map((f) => ({ gx: f.gx, gy: f.gy })),
    bridges: map.bridges.map((b) => ({
      gx: Math.round(b.x / TILE),
      gy: Math.round(b.y / TILE),
      gw: Math.max(1, Math.round(b.w / TILE)),
      gh: Math.max(1, Math.round(b.h / TILE)),
      orientation: b.orientation,
      style: b.style ?? 'wood',
    })),
    stoneRoads: map.stoneRoads.map((r) => ({ gx: r.gx, gy: r.gy })),
    railTracks: map.railTracks.map((r) => ({ gx: r.gx, gy: r.gy, orientation: r.orientation })),
    farmTiles: (map.farmTiles || []).map((f) => ({ gx: f.gx, gy: f.gy, crop: f.crop })),
    iceVents: (map.iceVents || []).map((iv) => ({ gx: iv.gx, gy: iv.gy })),
    campfires: (map.campfires || []).map((cf) => ({ gx: cf.gx, gy: cf.gy })),
    igloos: (map.igloos || []).map((ig) => ({
      gx: Math.round(ig.x / TILE),
      gy: Math.round(ig.y / TILE),
      direction: ig.direction,
    })),
    pushableIceBlocks: (map.pushableIceBlocks || []).map((pb) => ({
      gx: Math.round(pb.x / TILE),
      gy: Math.round(pb.y / TILE),
    })),
    obstacles: map.obstacles
      .filter((o) => o.style !== 'igloo_wall')
      .map((o) => {
        const gx = Math.round(o.x / TILE);
        const gy = Math.round(o.y / TILE);
        const baseElev = map.tileGrid[clamp(gy, 0, map.rows - 1)]?.[clamp(gx, 0, map.cols - 1)]?.elev ?? 0;
        return {
          gx,
          gy,
          gw: Math.max(1, Math.round(o.w / TILE)),
          gh: Math.max(1, Math.round(o.h / TILE)),
          elevation:
            o.kind === 'wall'
              ? 10
              : getIntrinsicObstacleHeight(o.kind, o.style, Math.max(0.5, o.elevation - baseElev)),
          kind: o.kind,
          style: o.style,
          colorVariant: o.colorVariant,
          direction: o.direction,
        };
      }),
    bushes: map.bushes.map((b) => ({
      gx: Math.round(b.x / TILE),
      gy: Math.round(b.y / TILE),
    })),
    trees: map.trees.map((t) => ({
      gx: Math.round(t.x / TILE),
      gy: Math.round(t.y / TILE),
      canopyRadius: t.canopyRadius,
      foliagePalette: t.foliagePalette ? ([...t.foliagePalette] as [string, string, string, string]) : undefined,
    })),
    weaponSpawns: map.weaponSpawns.map((w) => ({
      gx: Math.floor(w.x / TILE),
      gy: Math.floor(w.y / TILE),
      kind: w.kind,
      weaponId: w.weaponId,
    })),
    ammoSpawns: map.ammoSpawns.map((a) => ({
      gx: Math.floor(a.x / TILE),
      gy: Math.floor(a.y / TILE),
    })),
    shieldSpawns: map.shieldSpawns.map((s) => ({
      gx: Math.floor(s.x / TILE),
      gy: Math.floor(s.y / TILE),
    })),
    factionSpawns: {
      royal: map.factionSpawns.royal.map((sp) => ({
        gx: Math.floor(sp.x / TILE),
        gy: Math.floor(sp.y / TILE),
      })),
      shadow: map.factionSpawns.shadow.map((sp) => ({
        gx: Math.floor(sp.x / TILE),
        gy: Math.floor(sp.y / TILE),
      })),
      mercenary: map.factionSpawns.mercenary.map((sp) => ({
        gx: Math.floor(sp.x / TILE),
        gy: Math.floor(sp.y / TILE),
      })),
    },
  };
}

export interface CustomMapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  standableCount: number;
  reachableCount: number;
}

function getArenaWalkableElevation(arena: ArenaMap, x: number, y: number): number {
  const gx = clamp(Math.floor(x / TILE), 0, arena.cols - 1);
  const gy = clamp(Math.floor(y / TILE), 0, arena.rows - 1);
  let best = arena.tileGrid[gy][gx].elev;
  for (const st of arena.stairs) {
    if (pointInRect(x, y, st) && st.elevation > best) best = st.elevation;
  }
  for (const obs of arena.obstacles) {
    if (pointInRect(x, y, obs) && obs.elevation > best) best = obs.elevation;
  }
  for (const blk of arena.pushableIceBlocks || []) {
    if (pointInRect(x, y, blk) && blk.elevation > best) best = blk.elevation;
  }
  return best;
}

function isArenaGroundWalkable(arena: ArenaMap, x: number, y: number): boolean {
  if (arena.waterTileKeys.size === 0) return true;
  for (const b of arena.bridges) {
    if (pointInRect(x, y, b)) return true;
  }
  const gx = Math.floor(x / TILE);
  const gy = Math.floor(y / TILE);
  const key = `${gx},${gy}`;
  if (!arena.waterTileKeys.has(key)) return true;
  if (arena.floatingIceTileKeys?.has(key)) return true;
  return Boolean(arena.floatingIceTiles?.some((f) => f.gx === gx && f.gy === gy));
}

function canStandAtPoint(arena: ArenaMap, x: number, y: number, curElev: number): boolean {
  const checkR = getMoveCheckRadius(CHAR_BASE_RADIUS);
  if (x < checkR || x > arena.width - checkR || y < checkR || y > arena.height - checkR) return false;
  if (!isArenaGroundWalkable(arena, x, y)) return false;
  if (Math.abs(getArenaWalkableElevation(arena, x, y) - curElev) > 0.5) return false;

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = x + Math.cos(a) * checkR;
    const sy = y + Math.sin(a) * checkR;
    if (!isArenaGroundWalkable(arena, sx, sy)) return false;
    if (Math.abs(getArenaWalkableElevation(arena, sx, sy) - curElev) > 0.5) return false;
  }
  for (const obs of arena.obstacles) {
    if ((obs.kind === 'wall' || obs.style === 'railing') && resolveCircleRect(x, y, checkR, obs).hit) {
      return false;
    }
  }
  for (const tree of arena.trees) {
    if (resolveCircleRect(x, y, checkR, tree).hit) return false;
  }
  return true;
}

/**
 * 檢查自訂地圖合法性：
 * 1. 三陣營皆至少有 1 個出生點（建議 皇 2+、影 2+、三 4+）
 * 2. 所有大於 1×1 的物件／橋樑／階梯所佔格位底層地形高度必須完全一致
 * 3. 所有出生點皆可安全站立（非水域、非實牆或樹幹）
 * 4. 以與遊戲完全相同的 |Δh| ≤ 0.5 ＋ 橋樑規則進行全圖 BFS 連通性驗證
 */
export function validateCustomMap(data: CustomMapData): CustomMapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.name.trim()) {
    errors.push('請輸入地圖名稱');
  }
  if (data.factionSpawns.royal.length === 0) errors.push('至少需要 1 個「皇家騎士團」出生點');
  if (data.factionSpawns.shadow.length === 0) errors.push('至少需要 1 個「天影十字軍」出生點');
  if (data.factionSpawns.mercenary.length === 0) errors.push('至少需要 1 個「第三勢力」出生點');

  for (const obs of data.obstacles) {
    if ((obs.gw > 1 || obs.gh > 1) && !hasUniformCellElevation(data.tileGrid, obs.gx, obs.gy, obs.gw, obs.gh)) {
      errors.push(`多格物件 (${obs.gx}, ${obs.gy}) ${obs.gw}×${obs.gh} 所跨各格的地形高度不一致`);
      break;
    }
  }
  for (const br of data.bridges) {
    if ((br.gw > 1 || br.gh > 1) && !hasUniformCellElevation(data.tileGrid, br.gx, br.gy, br.gw, br.gh)) {
      errors.push(`木橋 (${br.gx}, ${br.gy}) ${br.gw}×${br.gh} 所跨各格的地形高度不一致`);
      break;
    }
  }
  const waterSet = new Set(data.waterTiles.map((w) => `${w.gx},${w.gy}`));
  for (const fi of data.floatingIceTiles || []) {
    if (!waterSet.has(`${fi.gx},${fi.gy}`)) {
      errors.push(`浮冰 (${fi.gx}, ${fi.gy}) 只能放置於水域格位之上`);
      break;
    }
  }
  for (const ig of data.igloos || []) {
    if (!hasUniformIglooElevation(data.tileGrid, ig.gx, ig.gy, ig.direction)) {
      errors.push(`冰屋 (${ig.gx}, ${ig.gy}) 所佔 3/5/5/5/3 各格地形高度不一致或超出邊界`);
      break;
    }
  }
  for (const pb of data.pushableIceBlocks || []) {
    if (!hasUniformCellElevation(data.tileGrid, pb.gx, pb.gy, 2, 2)) {
      errors.push(`可推動冰塊 (${pb.gx}, ${pb.gy}) 2×2 所跨各格的地形高度不一致`);
      break;
    }
  }
  for (const st of data.stairs) {
    if (!normalizeTerrainStyle(st.style)) continue;
    const gw = st.gw ?? 1;
    const gh = st.gh ?? 1;
    let stairValid = true;
    for (let sy = st.gy; sy < st.gy + gh && stairValid; sy++) {
      for (let sx = st.gx; sx < st.gx + gw; sx++) {
        if (!canPlaceTerrainStairAt(data.tileGrid, sx, sy, st.style, st.direction)) {
          stairValid = false;
          break;
        }
      }
    }
    if (!stairValid) {
      errors.push(`階梯 (${st.gx}, ${st.gy}) 必須貼合並指向對應樣式之高台／泥坑上層`);
      break;
    }
  }

  if (data.factionSpawns.royal.length > 0 && data.factionSpawns.royal.length < 2) {
    warnings.push('建議皇家騎士團設置至少 2 個相鄰出生點');
  }
  if (data.factionSpawns.shadow.length > 0 && data.factionSpawns.shadow.length < 2) {
    warnings.push('建議天影十字軍設置至少 2 個相鄰出生點');
  }
  if (data.factionSpawns.mercenary.length > 0 && data.factionSpawns.mercenary.length < 4) {
    warnings.push('建議第三勢力設置至少 4 個分散出生點');
  }

  const arena = buildArenaMapFromCustom(data);
  const { cols, rows } = arena;
  const standable = new Set<number>();
  const elevByIdx = new Map<number, number>();

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = (gx + 0.5) * TILE;
      const cy = (gy + 0.5) * TILE;
      const elev = getArenaWalkableElevation(arena, cx, cy);
      if (canStandAtPoint(arena, cx, cy, elev)) {
        const idx = gy * cols + gx;
        standable.add(idx);
        elevByIdx.set(idx, elev);
      }
    }
  }

  const allFactionSpawns: { facLabel: string; gx: number; gy: number }[] = [
    ...data.factionSpawns.royal.map((s) => ({ facLabel: '皇家', gx: s.gx, gy: s.gy })),
    ...data.factionSpawns.shadow.map((s) => ({ facLabel: '天影', gx: s.gx, gy: s.gy })),
    ...data.factionSpawns.mercenary.map((s) => ({ facLabel: '第三', gx: s.gx, gy: s.gy })),
  ];

  for (const sp of allFactionSpawns) {
    const idx = sp.gy * cols + sp.gx;
    if (!standable.has(idx)) {
      errors.push(`${sp.facLabel}出生點 (${sp.gx}, ${sp.gy}) 位於不可站立位置（水域／牆壁／懸崖邊緣）`);
    }
  }

  const firstStandableSpawn = allFactionSpawns.find((sp) => standable.has(sp.gy * cols + sp.gx));
  const reachable = new Set<number>();
  if (firstStandableSpawn) {
    const startIdx = firstStandableSpawn.gy * cols + firstStandableSpawn.gx;
    const queue = [startIdx];
    reachable.add(startIdx);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head];
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      const elevA = elevByIdx.get(idx)!;
      for (const [ox, oy] of dirs) {
        const ngx = gx + ox;
        const ngy = gy + oy;
        if (ngx < 0 || ngx >= cols || ngy < 0 || ngy >= rows) continue;
        const nIdx = ngy * cols + ngx;
        if (reachable.has(nIdx) || !standable.has(nIdx)) continue;
        const elevB = elevByIdx.get(nIdx)!;
        if (Math.abs(elevA - elevB) > 0.5) continue;

        const midX = (gx + ox * 0.5 + 0.5) * TILE;
        const midY = (gy + oy * 0.5 + 0.5) * TILE;
        const midElev = getArenaWalkableElevation(arena, midX, midY);
        if (
          Math.abs(midElev - elevA) <= 0.5 &&
          Math.abs(midElev - elevB) <= 0.5 &&
          canStandAtPoint(arena, midX, midY, midElev)
        ) {
          reachable.add(nIdx);
          queue.push(nIdx);
        }
      }
    }

    for (const sp of allFactionSpawns) {
      const idx = sp.gy * cols + sp.gx;
      if (standable.has(idx) && !reachable.has(idx)) {
        errors.push(`${sp.facLabel}出生點 (${sp.gx}, ${sp.gy}) 無法與其他陣營連通（請確認橋樑或 +0.5 階梯是否銜接）`);
      }
    }

    for (const ws of data.weaponSpawns) {
      const idx = ws.gy * cols + ws.gx;
      if (!standable.has(idx) || !reachable.has(idx)) {
        warnings.push(`武器點 (${ws.gx}, ${ws.gy}) 目前無法步行抵達`);
      }
    }
    for (const as of data.ammoSpawns) {
      const idx = as.gy * cols + as.gx;
      if (!standable.has(idx) || !reachable.has(idx)) {
        warnings.push(`彈藥箱 (${as.gx}, ${as.gy}) 目前無法步行抵達`);
      }
    }
    for (const ss of data.shieldSpawns) {
      const idx = ss.gy * cols + ss.gx;
      if (!standable.has(idx) || !reachable.has(idx)) {
        warnings.push(`防彈盾牌 (${ss.gx}, ${ss.gy}) 目前無法步行抵達`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    standableCount: standable.size,
    reachableCount: reachable.size,
  };
}

function getLocalStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | undefined {
  return (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } })
    .localStorage;
}

export function loadCustomMaps(): CustomMapData[] {
  try {
    const raw = getLocalStorage()?.getItem(CUSTOM_MAPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CustomMapData =>
          Boolean(item && typeof item.id === 'string' && Array.isArray(item.tileGrid) && item.cols > 0 && item.rows > 0)
      )
      .map((item) => ({
        ...item,
        floorGrid: resolveNormalizedFloorGrid(item),
        floatingIceTiles: Array.isArray(item.floatingIceTiles) ? item.floatingIceTiles : [],
        stoneRoads: Array.isArray(item.stoneRoads) ? item.stoneRoads : [],
        railTracks: Array.isArray(item.railTracks) ? item.railTracks : [],
        farmTiles: Array.isArray(item.farmTiles) ? item.farmTiles : [],
        iceVents: Array.isArray(item.iceVents) ? item.iceVents : [],
        campfires: Array.isArray(item.campfires) ? item.campfires : [],
        igloos: Array.isArray(item.igloos) ? item.igloos : [],
        pushableIceBlocks: Array.isArray(item.pushableIceBlocks) ? item.pushableIceBlocks : [],
      }));
  } catch {
    return [];
  }
}

export function saveCustomMaps(maps: CustomMapData[]): void {
  try {
    getLocalStorage()?.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(maps));
  } catch {
    // ignore storage quota errors
  }
}

export function upsertCustomMap(maps: CustomMapData[], entry: CustomMapData): CustomMapData[] {
  const updated: CustomMapData = { ...entry, updatedAt: Date.now() };
  const idx = maps.findIndex((m) => m.id === updated.id);
  const next = idx >= 0 ? maps.map((m, i) => (i === idx ? updated : m)) : [updated, ...maps];
  saveCustomMaps(next);
  return next;
}

export function deleteCustomMap(maps: CustomMapData[], id: string): CustomMapData[] {
  const next = maps.filter((m) => m.id !== id);
  saveCustomMaps(next);
  return next;
}
