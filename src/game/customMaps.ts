import { CHAR_BASE_RADIUS, clamp, getMoveCheckRadius, pointInRect, resolveCircleRect } from './geometry';
import { ArenaMap, MapBiome, TILE, biomeToDefaultFloor, createFloorGrid } from './maps';
import {
  AmmoSpawn,
  BridgeRect,
  BushProp,
  FactionId,
  FloorStyle,
  GridTile,
  Obstacle,
  ObstacleStyle,
  PlatformStyle,
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
}

export interface CustomObstacleEntry {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  elevation: number; // 物件自身高度（1.0 小箱 / 1.5 大箱 / 2.0 貨櫃火車 / 10 實牆），編譯時自動疊加所在地形高度
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
  bridges: CustomBridgeEntry[];
  stoneRoads: GridTile[];
  railTracks: RailTrackCell[];
  obstacles: CustomObstacleEntry[];
  bushes: CustomSpawnCoord[];
  trees: (CustomSpawnCoord & { canopyRadius?: number; foliagePalette?: [string, string, string, string] })[];
  weaponSpawns: CustomWeaponSpawnEntry[];
  ammoSpawns: CustomSpawnCoord[];
  shieldSpawns: CustomSpawnCoord[];
  factionSpawns: Record<FactionId, CustomSpawnCoord[]>;
}

export const FLOOR_STYLE_OPTIONS: {
  id: FloorStyle;
  label: string;
  sublabel: string;
  previewBiome: MapBiome;
}[] = [
  { id: 'shrine_dirt', label: '江戶泥土地板', sublabel: '古社砂礫黃土', previewBiome: 'shrine_outdoor' },
  { id: 'bamboo_moss', label: '嵐山林間苔土', sublabel: '深翠密林地坪', previewBiome: 'bamboo_outdoor' },
  { id: 'desert_sand', label: '荒野沙海地板', sublabel: '金色乾旱細沙', previewBiome: 'desert_outdoor' },
  { id: 'castle_stone', label: '聖殿石磚地板', sublabel: '古堡淺灰磚石', previewBiome: 'castle_indoor' },
  { id: 'warehouse_steel', label: '東港鋼板地板', sublabel: '深藍工業地坪', previewBiome: 'warehouse_indoor' },
  { id: 'grass_ground', label: '青綠草坪地板', sublabel: '鮮綠柔軟草地', previewBiome: 'shrine_outdoor' },
];

export const BIOME_OPTIONS: { id: MapBiome; label: string; environment: '野外' | '室內' }[] = [
  { id: 'shrine_outdoor', label: '江戶・古社泥土', environment: '野外' },
  { id: 'bamboo_outdoor', label: '嵐山・翠竹林土', environment: '野外' },
  { id: 'desert_outdoor', label: '荒野・沙海黃土', environment: '野外' },
  { id: 'castle_indoor', label: '聖殿・石磚地坪', environment: '室內' },
  { id: 'warehouse_indoor', label: '東港・鋼板地坪', environment: '室內' },
];

export function floorStyleToBiome(floor: FloorStyle): MapBiome {
  switch (floor) {
    case 'castle_stone':
      return 'castle_indoor';
    case 'desert_sand':
      return 'desert_outdoor';
    case 'warehouse_steel':
      return 'warehouse_indoor';
    case 'bamboo_moss':
      return 'bamboo_outdoor';
    case 'shrine_dirt':
    case 'grass_ground':
    default:
      return 'shrine_outdoor';
  }
}

export function getDefaultTreePalette(biome: MapBiome): [string, string, string, string] {
  switch (biome) {
    case 'castle_indoor':
      return ['#064E3B', '#047857', '#059669', '#34D399'];
    case 'desert_outdoor':
      return ['#14532D', '#3F6212', '#65A30D', '#84CC16'];
    case 'warehouse_indoor':
      return ['#1E293B', '#334155', '#475569', '#64748B'];
    case 'bamboo_outdoor':
      return ['#14532D', '#166534', '#16A34A', '#4ADE80'];
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

export function getIntrinsicObstacleHeight(
  kind: 'crate' | 'wall',
  style?: ObstacleStyle,
  fallbackElevation = 1.0
): number {
  if (kind === 'wall') return 10;
  if (style === 'small_crate') return 1.0;
  if (style === 'container' || style === 'train_car') return 2.0;
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
    bridges: [],
    stoneRoads: [],
    railTracks: [],
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
  cloned.stoneRoads = cloned.stoneRoads || [];
  cloned.railTracks = cloned.railTracks || [];
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
    bridges: data.bridges.filter((b) => inCell(b.gx, b.gy, b.gw, b.gh)),
    stoneRoads: (data.stoneRoads || []).filter((r) => inCell(r.gx, r.gy)),
    railTracks: (data.railTracks || []).filter((r) => inCell(r.gx, r.gy)),
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

  const obstacles: Obstacle[] = data.obstacles.map((o) => {
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
    bridges,
    stoneRoads,
    railTracks,
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
    bridges: map.bridges.map((b) => ({
      gx: Math.round(b.x / TILE),
      gy: Math.round(b.y / TILE),
      gw: Math.max(1, Math.round(b.w / TILE)),
      gh: Math.max(1, Math.round(b.h / TILE)),
      orientation: b.orientation,
    })),
    stoneRoads: map.stoneRoads.map((r) => ({ gx: r.gx, gy: r.gy })),
    railTracks: map.railTracks.map((r) => ({ gx: r.gx, gy: r.gy, orientation: r.orientation })),
    obstacles: map.obstacles.map((o) => {
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
  return best;
}

function isArenaGroundWalkable(arena: ArenaMap, x: number, y: number): boolean {
  if (arena.waterTileKeys.size === 0) return true;
  for (const b of arena.bridges) {
    if (pointInRect(x, y, b)) return true;
  }
  const gx = Math.floor(x / TILE);
  const gy = Math.floor(y / TILE);
  return !arena.waterTileKeys.has(`${gx},${gy}`);
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
    if (obs.kind === 'wall' && resolveCircleRect(x, y, checkR, obs).hit) return false;
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

export function loadCustomMaps(): CustomMapData[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY);
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
        stoneRoads: Array.isArray(item.stoneRoads) ? item.stoneRoads : [],
        railTracks: Array.isArray(item.railTracks) ? item.railTracks : [],
      }));
  } catch {
    return [];
  }
}

export function saveCustomMaps(maps: CustomMapData[]): void {
  try {
    localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(maps));
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
