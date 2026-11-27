import type { ArenaMap } from './maps';
import {
  BridgeRect,
  BushProp,
  FactionId,
  FloorStyle,
  GridTile,
  Obstacle,
  PlatformStyle,
  SiegeBossKind,
  SiegeFactionId,
  SiegeLane,
  SiegeStructure,
  StairRect,
  TerrainTileCell,
  TreeProp,
} from './types';

export const SIEGE_MAP_ID = 'twilight_rift';
const TILE = 48;
const COLS = 54;
const ROWS = 54;

const tCenter = (gx: number, gy: number) => ({
  x: (gx + 0.5) * TILE,
  y: (gy + 0.5) * TILE,
});

const tRect = (gx: number, gy: number, gw: number, gh: number) => ({
  x: gx * TILE,
  y: gy * TILE,
  w: gw * TILE,
  h: gh * TILE,
});

export interface SiegeJungleCampSpec {
  id: string;
  x: number;
  y: number;
  side: SiegeFactionId;
  skinId: string;
  name: string;
  goldReward: number;
  xpReward: number;
}

export interface SiegeMapSpec {
  mapId: string;
  fountains: Record<SiegeFactionId, { x: number; y: number; radius: number }>;
  laneWaypoints: Record<SiegeLane, { x: number; y: number }[]>;
  bossSpawns: Record<SiegeBossKind, { x: number; y: number; radius: number }>;
  jungleCamps: SiegeJungleCampSpec[];
  createInitialStructures: () => SiegeStructure[];
}

function paintRect(
  grid: TerrainTileCell[][],
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  elev: number,
  style: PlatformStyle
) {
  for (let y = gy; y < gy + gh; y++) {
    if (y < 0 || y >= ROWS) continue;
    for (let x = gx; x < gx + gw; x++) {
      if (x < 0 || x >= COLS) continue;
      grid[y][x] = { elev, style };
    }
  }
}

function paintFloorRect(
  grid: FloorStyle[][],
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  style: FloorStyle
) {
  for (let y = gy; y < gy + gh; y++) {
    if (y < 0 || y >= ROWS) continue;
    for (let x = gx; x < gx + gw; x++) {
      if (x < 0 || x >= COLS) continue;
      grid[y][x] = style;
    }
  }
}

export function createSiegeRiftMap(): ArenaMap {
  const tileGrid: TerrainTileCell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ elev: 0, style: 'grass_ground' as PlatformStyle }))
  );
  const floorGrid: FloorStyle[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => 'grass_ground' as FloorStyle)
  );

  // 皇家高地基地（左下：gx 1..11, gy 42..52）與 天影高地基地（右上：gx 42..52, gy 1..11）
  paintFloorRect(floorGrid, 0, 41, 13, 13, 'castle_stone');
  paintFloorRect(floorGrid, 41, 0, 13, 13, 'warehouse_steel');
  paintRect(tileGrid, 1, 42, 11, 11, 1.0, 'castle_dais');
  paintRect(tileGrid, 42, 1, 11, 11, 1.0, 'castle_dais');

  // 兩處 Boss 競技場地坪（上河道巴龍坑 16..20、下河道先鋒坑 33..37）
  paintFloorRect(floorGrid, 16, 16, 5, 5, 'castle_stone');
  paintFloorRect(floorGrid, 33, 33, 5, 5, 'desert_sand');

  // 四座野區 2.5D 高台狙擊坡（對角鏡像 (x,y) <-> (y,x)）
  paintRect(tileGrid, 12, 25, 3, 4, 1.0, 'hill');
  paintRect(tileGrid, 25, 12, 4, 3, 1.0, 'hill');
  paintRect(tileGrid, 25, 39, 4, 3, 1.0, 'hill');
  paintRect(tileGrid, 39, 25, 3, 4, 1.0, 'hill');

  const stairs: StairRect[] = [
    // 皇家基地三路階梯出口
    { ...tRect(4, 41, 3, 1), elevation: 0.5, direction: 'north', style: 'castle_dais' },
    { ...tRect(9, 41, 3, 1), elevation: 0.5, direction: 'north', style: 'castle_dais' },
    { ...tRect(12, 42, 1, 3), elevation: 0.5, direction: 'east', style: 'castle_dais' },
    { ...tRect(12, 47, 1, 3), elevation: 0.5, direction: 'east', style: 'castle_dais' },
    // 天影基地三路階梯出口（精準鏡像）
    { ...tRect(41, 4, 1, 3), elevation: 0.5, direction: 'west', style: 'castle_dais' },
    { ...tRect(41, 9, 1, 3), elevation: 0.5, direction: 'west', style: 'castle_dais' },
    { ...tRect(42, 12, 3, 1), elevation: 0.5, direction: 'south', style: 'castle_dais' },
    { ...tRect(47, 12, 3, 1), elevation: 0.5, direction: 'south', style: 'castle_dais' },
    // 野區高台階梯
    { ...tRect(12, 29, 2, 1), elevation: 0.5, direction: 'north', style: 'hill' },
    { ...tRect(15, 26, 1, 2), elevation: 0.5, direction: 'east', style: 'hill' },
    { ...tRect(29, 12, 1, 2), elevation: 0.5, direction: 'west', style: 'hill' },
    { ...tRect(26, 15, 2, 1), elevation: 0.5, direction: 'south', style: 'hill' },
    { ...tRect(29, 39, 1, 2), elevation: 0.5, direction: 'west', style: 'hill' },
    { ...tRect(26, 38, 2, 1), elevation: 0.5, direction: 'north', style: 'hill' },
    { ...tRect(39, 29, 2, 1), elevation: 0.5, direction: 'north', style: 'hill' },
    { ...tRect(38, 26, 1, 2), elevation: 0.5, direction: 'west', style: 'hill' },
  ];

  // 三路石板主幹道
  const stoneRoads: GridTile[] = [];
  const roadSet = new Set<string>();
  const addRoad = (gx: number, gy: number) => {
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;
    const key = `${gx},${gy}`;
    if (roadSet.has(key)) return;
    roadSet.add(key);
    stoneRoads.push({ gx, gy });
  };

  // 上路 (Top): gx 4..6 (gy 4..40) + 轉角 + gy 4..6 (gx 4..40)
  for (let gy = 4; gy <= 40; gy++) {
    for (let gx = 4; gx <= 6; gx++) addRoad(gx, gy);
  }
  for (let gx = 4; gx <= 40; gx++) {
    for (let gy = 4; gy <= 6; gy++) addRoad(gx, gy);
  }
  // 下路 (Bot): gx 13..49 (gy 47..49) + 轉角 + gy 13..49 (gx 47..49)
  for (let gx = 13; gx <= 49; gx++) {
    for (let gy = 47; gy <= 49; gy++) addRoad(gx, gy);
  }
  for (let gy = 13; gy <= 49; gy++) {
    for (let gx = 47; gx <= 49; gx++) addRoad(gx, gy);
  }
  // 中路 (Mid): 沿 x + y = 54 對角帶狀主道
  for (let gx = 12; gx <= 41; gx++) {
    const cy = 53 - gx;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        addRoad(gx + ox, cy + oy);
      }
    }
  }

  // 對角河道 (沿 x ≈ y，避開上路轉角、下路轉角與兩座 Boss 坑場地)
  const waterTiles: GridTile[] = [];
  const waterTileKeys = new Set<string>();
  const isInPit = (gx: number, gy: number) =>
    (gx >= 15 && gx <= 21 && gy >= 15 && gy <= 21) ||
    (gx >= 32 && gx <= 38 && gy >= 32 && gy <= 38);

  for (let k = 10; k <= 43; k++) {
    for (let d = -1; d <= 1; d++) {
      const gx = k;
      const gy = k + d;
      if (gx < 10 || gx > 43 || gy < 10 || gy > 43) continue;
      if (isInPit(gx, gy)) continue;
      const key = `${gx},${gy}`;
      if (!waterTileKeys.has(key)) {
        waterTileKeys.add(key);
        waterTiles.push({ gx, gy });
      }
    }
  }

  // 跨河橋樑（上河口、巴龍與中路之間、中路主橋、中路與先鋒之間、下河口）
  const bridges: BridgeRect[] = [
    { ...tRect(11, 10, 3, 4), orientation: 'horizontal', style: 'wood' },
    { ...tRect(21, 21, 3, 3), orientation: 'horizontal', style: 'wood' },
    { ...tRect(25, 25, 4, 4), orientation: 'horizontal', style: 'stone' },
    { ...tRect(30, 30, 3, 3), orientation: 'horizontal', style: 'wood' },
    { ...tRect(40, 40, 3, 4), orientation: 'horizontal', style: 'wood' },
  ];

  // 外圍石牆邊界裝飾與基地側翼牆（保留寬闊通道不卡兵）
  const obstacles: Obstacle[] = [
    // 上路／下路側翼防繞掩體箱（偏離中軸線，絕不擋小兵）
    { ...tRect(8, 22, 1, 1), elevation: 1.0, kind: 'crate', style: 'small_crate' },
    { ...tRect(22, 8, 1, 1), elevation: 1.0, kind: 'crate', style: 'small_crate' },
    { ...tRect(45, 31, 1, 1), elevation: 1.0, kind: 'crate', style: 'small_crate' },
    { ...tRect(31, 45, 1, 1), elevation: 1.0, kind: 'crate', style: 'small_crate' },
    // 中路兩側微掩體
    { ...tRect(22, 29, 1, 1), elevation: 1.0, kind: 'crate', style: 'small_crate' },
    { ...tRect(29, 22, 1, 1), elevation: 1.0, kind: 'crate', style: 'small_crate' },
    // Boss 坑後方實牆（打造經典背靠壁壘的搶 Boss 地形）
    { ...tRect(14, 15, 1, 3), elevation: 10, kind: 'wall', style: 'stone_wall_blue' },
    { ...tRect(15, 14, 3, 1), elevation: 10, kind: 'wall', style: 'stone_wall_blue' },
    { ...tRect(39, 36, 1, 3), elevation: 10, kind: 'wall', style: 'stone_wall_tan' },
    { ...tRect(36, 39, 3, 1), elevation: 10, kind: 'wall', style: 'stone_wall_tan' },
    // 兩翼野區邊牆（區隔野區與線上）
    { ...tRect(10, 34, 2, 1), elevation: 10, kind: 'wall', style: 'castle_pillar' },
    { ...tRect(34, 10, 1, 2), elevation: 10, kind: 'wall', style: 'castle_pillar' },
    { ...tRect(19, 43, 1, 2), elevation: 10, kind: 'wall', style: 'castle_pillar' },
    { ...tRect(43, 19, 2, 1), elevation: 10, kind: 'wall', style: 'castle_pillar' },
  ];

  // 戰術伏擊草叢（河道兩側、三路草叢與野區入口）
  const bushes: BushProp[] = [
    { ...tRect(3, 14, 1, 2) },
    { ...tRect(14, 3, 2, 1) },
    { ...tRect(3, 28, 1, 2) },
    { ...tRect(28, 3, 2, 1) },
    { ...tRect(23, 29, 1, 1) },
    { ...tRect(29, 23, 1, 1) },
    { ...tRect(21, 17, 1, 2) },
    { ...tRect(17, 21, 2, 1) },
    { ...tRect(32, 35, 1, 2) },
    { ...tRect(35, 32, 2, 1) },
    { ...tRect(25, 46, 2, 1) },
    { ...tRect(46, 25, 1, 2) },
    { ...tRect(39, 46, 2, 1) },
    { ...tRect(46, 39, 1, 2) },
  ];

  // 林區樹木點綴（遠離兵線與出生點）
  const pine: [string, string, string, string] = ['#14532D', '#166534', '#15803D', '#22C55E'];
  const trees: TreeProp[] = [
    { ...tRect(1, 1, 1, 1), canopyRadius: 42, foliagePalette: pine },
    { ...tRect(1, 52, 1, 1), canopyRadius: 42, foliagePalette: pine },
    { ...tRect(52, 1, 1, 1), canopyRadius: 42, foliagePalette: pine },
    { ...tRect(52, 52, 1, 1), canopyRadius: 42, foliagePalette: pine },
    { ...tRect(10, 19, 1, 1), canopyRadius: 40, foliagePalette: pine },
    { ...tRect(19, 10, 1, 1), canopyRadius: 40, foliagePalette: pine },
    { ...tRect(34, 43, 1, 1), canopyRadius: 40, foliagePalette: pine },
    { ...tRect(43, 34, 1, 1), canopyRadius: 40, foliagePalette: pine },
    { ...tRect(16, 31, 1, 1), canopyRadius: 38, foliagePalette: pine },
    { ...tRect(31, 16, 1, 1), canopyRadius: 38, foliagePalette: pine },
    { ...tRect(22, 37, 1, 1), canopyRadius: 38, foliagePalette: pine },
    { ...tRect(37, 22, 1, 1), canopyRadius: 38, foliagePalette: pine },
  ];

  const factionSpawns: Record<FactionId, { x: number; y: number }[]> = {
    royal: [
      tCenter(2, 49),
      tCenter(4, 49),
      tCenter(3, 51),
      tCenter(5, 50),
      tCenter(2, 47),
    ],
    shadow: [
      tCenter(51, 4),
      tCenter(49, 4),
      tCenter(50, 2),
      tCenter(48, 3),
      tCenter(51, 6),
    ],
    mercenary: [
      tCenter(18, 18),
      tCenter(35, 35),
      tCenter(16, 36),
      tCenter(36, 16),
    ],
  };

  return {
    id: SIEGE_MAP_ID,
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    biome: 'shrine_outdoor',
    name: '光暈裂谷・三路城堡攻防戰',
    floorGrid,
    tileGrid,
    stairs,
    waterTiles,
    waterTileKeys,
    bridges,
    stoneRoads,
    railTracks: [],
    obstacles,
    bushes,
    trees,
    weaponSpawns: [],
    ammoSpawns: [],
    shieldSpawns: [],
    factionSpawns,
  };
}

export function createSiegeMapSpec(): SiegeMapSpec {
  const createStructure = (
    id: string,
    faction: SiegeFactionId,
    kind: SiegeStructure['kind'],
    gx: number,
    gy: number,
    lane?: SiegeLane
  ): SiegeStructure => {
    const isCastle = kind === 'castle';
    const isInner = kind === 'inner_tower';
    const maxHp = isCastle ? 4000 : isInner ? 1600 : 1200;
    return {
      id,
      faction,
      kind,
      lane,
      x: gx * TILE,
      y: gy * TILE,
      radius: isCastle ? 40 : isInner ? 24 : 22,
      elevation: isCastle ? 1.0 : 0.0,
      hp: maxHp,
      maxHp,
      range: isCastle ? 290 : isInner ? 275 : 260,
      damage: isCastle ? 30 : isInner ? 25 : 21,
      fireInterval: isCastle ? 0.9 : isInner ? 0.95 : 1.05,
      fireCooldown: 0.4,
      aggroTargetId: null,
      aggroLockTimer: 0,
      invulnerable: isCastle,
      backdoorProtected: false,
      hitFlash: 0,
      alive: true,
    };
  };

  return {
    mapId: SIEGE_MAP_ID,
    fountains: {
      royal: { x: 3.5 * TILE, y: 50.5 * TILE, radius: 3.2 * TILE },
      shadow: { x: 50.5 * TILE, y: 3.5 * TILE, radius: 3.2 * TILE },
    },
    laneWaypoints: {
      top: [
        tCenter(5, 42),
        tCenter(5, 32),
        tCenter(5, 15),
        tCenter(5, 5),
        tCenter(15, 5),
        tCenter(32, 5),
        tCenter(42, 5),
      ],
      mid: [
        tCenter(11, 42),
        tCenter(17, 36),
        tCenter(23, 30),
        tCenter(27, 27),
        tCenter(30, 23),
        tCenter(36, 17),
        tCenter(42, 11),
      ],
      bot: [
        tCenter(12, 48),
        tCenter(22, 48),
        tCenter(38, 48),
        tCenter(48, 48),
        tCenter(48, 38),
        tCenter(48, 22),
        tCenter(48, 12),
      ],
    },
    bossSpawns: {
      baron: { ...tCenter(18, 18), radius: 36 },
      vanguard: { ...tCenter(35, 35), radius: 32 },
    },
    jungleCamps: [
      {
        id: 'jungle_royal_west',
        ...tCenter(12, 34),
        side: 'royal',
        skinId: 'merc_default',
        name: '荒野傭兵哨兵',
        goldReward: 45,
        xpReward: 55,
      },
      {
        id: 'jungle_royal_south',
        ...tCenter(23, 41),
        side: 'royal',
        skinId: 'merc_jack',
        name: '荒漠槍手守衛',
        goldReward: 45,
        xpReward: 55,
      },
      {
        id: 'jungle_shadow_north',
        ...tCenter(34, 12),
        side: 'shadow',
        skinId: 'merc_default',
        name: '荒野傭兵哨兵',
        goldReward: 45,
        xpReward: 55,
      },
      {
        id: 'jungle_shadow_east',
        ...tCenter(41, 23),
        side: 'shadow',
        skinId: 'merc_jack',
        name: '荒漠槍手守衛',
        goldReward: 45,
        xpReward: 55,
      },
    ],
    createInitialStructures: () => [
      // Royal (Bottom-Left)
      createStructure('royal_castle', 'royal', 'castle', 6.5, 47.5),
      createStructure('royal_top_inner', 'royal', 'inner_tower', 5.5, 36.5, 'top'),
      createStructure('royal_top_outer', 'royal', 'outer_tower', 5.5, 19.5, 'top'),
      createStructure('royal_mid_inner', 'royal', 'inner_tower', 14.5, 39.5, 'mid'),
      createStructure('royal_mid_outer', 'royal', 'outer_tower', 20.5, 33.5, 'mid'),
      createStructure('royal_bot_inner', 'royal', 'inner_tower', 17.5, 48.5, 'bot'),
      createStructure('royal_bot_outer', 'royal', 'outer_tower', 34.5, 48.5, 'bot'),
      // Shadow (Top-Right)
      createStructure('shadow_castle', 'shadow', 'castle', 47.5, 6.5),
      createStructure('shadow_top_inner', 'shadow', 'inner_tower', 36.5, 5.5, 'top'),
      createStructure('shadow_top_outer', 'shadow', 'outer_tower', 19.5, 5.5, 'top'),
      createStructure('shadow_mid_inner', 'shadow', 'inner_tower', 39.5, 14.5, 'mid'),
      createStructure('shadow_mid_outer', 'shadow', 'outer_tower', 33.5, 20.5, 'mid'),
      createStructure('shadow_bot_inner', 'shadow', 'inner_tower', 48.5, 17.5, 'bot'),
      createStructure('shadow_bot_outer', 'shadow', 'outer_tower', 48.5, 34.5, 'bot'),
    ],
  };
}
