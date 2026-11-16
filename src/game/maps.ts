import {
  AmmoSpawn,
  BridgeRect,
  BushProp,
  FactionId,
  GridTile,
  MapId,
  Obstacle,
  ObstacleStyle,
  PlatformStyle,
  StairRect,
  TerrainTileCell,
  TreeProp,
  WeaponSpawn,
} from './types';

export const TILE = 48;

const tRect = (gx: number, gy: number, gw: number, gh: number) => ({
  x: gx * TILE,
  y: gy * TILE,
  w: gw * TILE,
  h: gh * TILE,
});

const tCenter = (gx: number, gy: number) => ({
  x: (gx + 0.5) * TILE,
  y: (gy + 0.5) * TILE,
});

function createTerrainGrid(cols: number, rows: number): TerrainTileCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ elev: 0, style: 'default' as PlatformStyle }))
  );
}

function paintTerrainRect(
  grid: TerrainTileCell[][],
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  elev: number,
  style: PlatformStyle
) {
  for (let y = gy; y < gy + gh; y++) {
    if (y < 0 || y >= grid.length) continue;
    for (let x = gx; x < gx + gw; x++) {
      if (x < 0 || x >= grid[0].length) continue;
      if (elev >= grid[y][x].elev) {
        grid[y][x] = { elev, style };
      }
    }
  }
}

function paintTerrainRows(
  grid: TerrainTileCell[][],
  gyStart: number,
  rowSpans: [number, number][],
  elev: number,
  style: PlatformStyle
) {
  rowSpans.forEach(([xStart, xEnd], idx) => {
    const y = gyStart + idx;
    if (y < 0 || y >= grid.length) return;
    for (let x = xStart; x <= xEnd; x++) {
      if (x < 0 || x >= grid[0].length) continue;
      if (elev >= grid[y][x].elev) {
        grid[y][x] = { elev, style };
      }
    }
  });
}

function createTileWallLine(
  gxStart: number,
  gyStart: number,
  gxEnd: number,
  gyEnd: number,
  style: ObstacleStyle
): Obstacle[] {
  const result: Obstacle[] = [];
  for (let gy = gyStart; gy <= gyEnd; gy++) {
    for (let gx = gxStart; gx <= gxEnd; gx++) {
      result.push({
        ...tRect(gx, gy, 1, 1),
        blocksBullets: true,
        elevation: 3.0,
        kind: 'wall',
        style,
      });
    }
  }
  return result;
}

export type MapBiome = 'shrine_outdoor' | 'castle_indoor' | 'desert_outdoor' | 'warehouse_indoor' | 'bamboo_outdoor';

export interface ArenaMap {
  id: MapId;
  cols: number;
  rows: number;
  width: number;
  height: number;
  biome: MapBiome;
  name: string;
  tileGrid: TerrainTileCell[][];
  stairs: StairRect[];
  waterTiles: GridTile[];
  waterTileKeys: Set<string>;
  bridges: BridgeRect[];
  obstacles: Obstacle[];
  bushes: BushProp[];
  trees: TreeProp[];
  weaponSpawns: WeaponSpawn[];
  ammoSpawns: AmmoSpawn[];
  shieldSpawns: AmmoSpawn[];
  factionSpawns: Record<FactionId, { x: number; y: number }[]>;
}

/**
 * 1. 日本・江戶古社林間（野外）
 * - 一格一格鋪設的江戶杉木板塀包圍中央神社，僅保留上下兩座石階出入口
 * - 左右兩側各有一座連貫、非規則輪廓、彼此不對稱的兩層翠綠小山（0 -> 0.5 -> 1 -> 1.5 -> 2）
 * - 無任何箱子掩體，搭配 14 棵茂密楓杉銀杏林木
 */
function createTokyoShrineMap(): ArenaMap {
  const cols = 30;
  const rows = 22;
  const autumnMaple: [string, string, string, string] = ['#7F1D1D', '#991B1B', '#DC2626', '#F97316'];
  const cedarPine: [string, string, string, string] = ['#14532D', '#166534', '#15803D', '#22C55E'];
  const goldenGinkgo: [string, string, string, string] = ['#713F12', '#A16207', '#CA8A04', '#FACC15'];

  const tileGrid = createTerrainGrid(cols, rows);

  // 中央神社台基 (1.0)
  paintTerrainRect(tileGrid, 11, 7, 8, 8, 1.0, 'shrine_floor');

  // 左側不對稱二層小山（非規則階梯山丘輪廓，1.0 -> 2.0）
  paintTerrainRows(
    tileGrid,
    4,
    [
      [3, 6], // gy=4
      [2, 7], // gy=5
      [2, 7], // gy=6
      [2, 7], // gy=7
      [1, 7], // gy=8
      [1, 7], // gy=9
      [2, 7], // gy=10
      [2, 7], // gy=11
      [2, 6], // gy=12
      [3, 6], // gy=13
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    6,
    [
      [4, 5], // gy=6
      [3, 6], // gy=7
      [3, 6], // gy=8
      [3, 6], // gy=9
      [3, 5], // gy=10
      [4, 5], // gy=11
    ],
    2.0,
    'hill'
  );

  // 右側不對稱二層小山（連成一整座自然彎折山丘，絕無分割接縫！1.0 -> 2.0）
  paintTerrainRows(
    tileGrid,
    5,
    [
      [24, 26], // gy=5
      [23, 27], // gy=6
      [23, 27], // gy=7
      [22, 27], // gy=8
      [22, 28], // gy=9
      [22, 28], // gy=10
      [22, 28], // gy=11
      [22, 27], // gy=12
      [22, 27], // gy=13
      [22, 27], // gy=14
      [22, 26], // gy=15
      [23, 26], // gy=16
      [23, 25], // gy=17
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    9,
    [
      [24, 26], // gy=9
      [23, 26], // gy=10
      [23, 26], // gy=11
      [24, 26], // gy=12
      [24, 26], // gy=13
      [24, 25], // gy=14
    ],
    2.0,
    'hill'
  );

  const shrineWalls: Obstacle[] = [
    ...createTileWallLine(10, 6, 10, 15, 'shrine_wall'),
    ...createTileWallLine(19, 6, 19, 15, 'shrine_wall'),
    ...createTileWallLine(11, 6, 13, 6, 'shrine_wall'),
    ...createTileWallLine(16, 6, 18, 6, 'shrine_wall'),
    ...createTileWallLine(11, 15, 13, 15, 'shrine_wall'),
    ...createTileWallLine(16, 15, 18, 15, 'shrine_wall'),
  ];

  return {
    id: 'tokyo_shrine',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'shrine_outdoor',
    name: '江戶・古社林間',
    tileGrid,
    stairs: [
      // 中央神社僅保留上下兩座階梯
      { ...tRect(14, 6, 2, 1), elevation: 0.5, direction: 'south', style: 'shrine_floor' },
      { ...tRect(14, 15, 2, 1), elevation: 0.5, direction: 'north', style: 'shrine_floor' },
      // 左側小山兩段天然山道土坡 (0 -> 0.5 -> 1 -> 1.5 -> 2，保留平台緩衝不緊貼)
      { ...tRect(4, 14, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(8, 9, 1, 1), elevation: 0.5, direction: 'west', style: 'hill' },
      { ...tRect(4, 5, 1, 1), elevation: 1.5, direction: 'south', style: 'hill' },
      { ...tRect(5, 12, 1, 1), elevation: 1.5, direction: 'north', style: 'hill' },
      // 右側小山兩段天然山道土坡 (0 -> 0.5 -> 1 -> 1.5 -> 2)
      { ...tRect(25, 4, 1, 1), elevation: 0.5, direction: 'south', style: 'hill' },
      { ...tRect(21, 12, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(25, 8, 1, 1), elevation: 1.5, direction: 'south', style: 'hill' },
      { ...tRect(24, 15, 1, 1), elevation: 1.5, direction: 'north', style: 'hill' },
    ],
    waterTiles: [],
    waterTileKeys: new Set<string>(),
    bridges: [],
    obstacles: shrineWalls,
    bushes: [
      { ...tRect(9, 5, 1, 1) },
      { ...tRect(9, 14, 1, 1) },
      { ...tRect(20, 7, 1, 1) },
      { ...tRect(20, 16, 1, 1) },
      { ...tRect(13, 4, 1, 1) },
      { ...tRect(16, 17, 1, 1) },
    ],
    trees: [
      { ...tRect(1, 3, 1, 1), canopyRadius: 46, foliagePalette: autumnMaple },
      { ...tRect(8, 2, 1, 1), canopyRadius: 46, foliagePalette: cedarPine },
      { ...tRect(1, 15, 1, 1), canopyRadius: 48, foliagePalette: goldenGinkgo },
      { ...tRect(7, 18, 1, 1), canopyRadius: 46, foliagePalette: autumnMaple },
      { ...tRect(12, 3, 1, 1), canopyRadius: 44, foliagePalette: cedarPine },
      { ...tRect(17, 3, 1, 1), canopyRadius: 44, foliagePalette: autumnMaple },
      { ...tRect(21, 2, 1, 1), canopyRadius: 46, foliagePalette: cedarPine },
      { ...tRect(28, 3, 1, 1), canopyRadius: 48, foliagePalette: autumnMaple },
      { ...tRect(28, 17, 1, 1), canopyRadius: 48, foliagePalette: cedarPine },
      { ...tRect(21, 19, 1, 1), canopyRadius: 46, foliagePalette: goldenGinkgo },
      { ...tRect(12, 18, 1, 1), canopyRadius: 44, foliagePalette: cedarPine },
      { ...tRect(18, 18, 1, 1), canopyRadius: 44, foliagePalette: autumnMaple },
      { ...tRect(0, 12, 1, 1), canopyRadius: 44, foliagePalette: cedarPine },
      { ...tRect(29, 13, 1, 1), canopyRadius: 44, foliagePalette: autumnMaple },
    ],
    weaponSpawns: [
      { ...tCenter(15, 11), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(4, 8), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(25, 11), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(14, 4), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(15, 17), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(20, 15), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(9, 6), kind: 'gun', weaponId: 'rifle' },
    ],
    ammoSpawns: [
      { ...tCenter(15, 9), respawnTimer: 0, active: true },
      { ...tCenter(4, 16), respawnTimer: 0, active: true },
      { ...tCenter(26, 3), respawnTimer: 0, active: true },
      { ...tCenter(15, 19), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(15, 13), respawnTimer: 0, active: true },
      { ...tCenter(4, 10), respawnTimer: 0, active: true },
      { ...tCenter(25, 13), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(2, 19), tCenter(4, 19)],
      shadow: [tCenter(27, 2), tCenter(25, 2)],
      mercenary: [tCenter(1, 1), tCenter(15, 1), tCenter(14, 20), tCenter(28, 20)],
    },
  };
}

/**
 * 2. 歐洲・中世紀古堡大廳（室內）
 * - 八角切角聖壇高台 + 一格一格雕紋鎏金聖殿石柱
 */
function createEuropeanCastleMap(): ArenaMap {
  const cols = 30;
  const rows = 20;
  const indoorHedge: [string, string, string, string] = ['#064E3B', '#047857', '#059669', '#34D399'];

  const tileGrid = createTerrainGrid(cols, rows);
  // 中央八角切角王座台階 (1.0)
  paintTerrainRows(
    tileGrid,
    7,
    [
      [12, 17], // gy=7
      [11, 18], // gy=8
      [11, 18], // gy=9
      [11, 18], // gy=10
      [11, 18], // gy=11
      [12, 17], // gy=12
    ],
    1.0,
    'castle_dais'
  );
  // 左右側翼階梯高台 (1.0)
  paintTerrainRows(
    tileGrid,
    7,
    [
      [3, 5],
      [3, 6],
      [3, 6],
      [3, 6],
      [3, 6],
      [3, 5],
    ],
    1.0,
    'castle_dais'
  );
  paintTerrainRows(
    tileGrid,
    7,
    [
      [24, 26],
      [23, 26],
      [23, 26],
      [23, 26],
      [23, 26],
      [24, 26],
    ],
    1.0,
    'castle_dais'
  );

  const pillarCoords = [
    [7, 2], [8, 2], [7, 3], [8, 3],
    [21, 2], [22, 2], [21, 3], [22, 3],
    [7, 16], [8, 16], [7, 17], [8, 17],
    [21, 16], [22, 16], [21, 17], [22, 17],
    [12, 3], [17, 3], [12, 16], [17, 16],
  ];
  const pillars: Obstacle[] = pillarCoords.map(([gx, gy]) => ({
    ...tRect(gx, gy, 1, 1),
    blocksBullets: true,
    elevation: 3.0,
    kind: 'wall',
    style: 'castle_pillar',
  }));

  return {
    id: 'european_castle',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'castle_indoor',
    name: '聖殿・中世紀古堡大廳',
    tileGrid,
    stairs: [
      { ...tRect(10, 9, 1, 2), elevation: 0.5, direction: 'east', style: 'castle_dais' },
      { ...tRect(19, 9, 1, 2), elevation: 0.5, direction: 'west', style: 'castle_dais' },
      { ...tRect(7, 9, 1, 2), elevation: 0.5, direction: 'west', style: 'castle_dais' },
      { ...tRect(22, 9, 1, 2), elevation: 0.5, direction: 'east', style: 'castle_dais' },
    ],
    waterTiles: [],
    waterTileKeys: new Set<string>(),
    bridges: [],
    obstacles: [
      { ...tRect(12, 5, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      { ...tRect(16, 13, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      { ...tRect(4, 14, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      { ...tRect(24, 4, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      ...pillars,
    ],
    bushes: [
      { ...tRect(14, 2, 1, 1) },
      { ...tRect(15, 2, 1, 1) },
      { ...tRect(14, 17, 1, 1) },
      { ...tRect(15, 17, 1, 1) },
    ],
    trees: [
      { ...tRect(2, 2, 1, 1), canopyRadius: 40, foliagePalette: indoorHedge },
      { ...tRect(27, 2, 1, 1), canopyRadius: 40, foliagePalette: indoorHedge },
      { ...tRect(2, 17, 1, 1), canopyRadius: 40, foliagePalette: indoorHedge },
      { ...tRect(27, 17, 1, 1), canopyRadius: 40, foliagePalette: indoorHedge },
    ],
    weaponSpawns: [
      { ...tCenter(15, 10), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(5, 10), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(25, 10), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(15, 4), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(15, 15), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(12, 10), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(17, 10), kind: 'melee', weaponId: 'claw' },
    ],
    ammoSpawns: [
      { ...tCenter(9, 10), respawnTimer: 0, active: true },
      { ...tCenter(20, 10), respawnTimer: 0, active: true },
      { ...tCenter(14, 3), respawnTimer: 0, active: true },
      { ...tCenter(15, 16), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(15, 9), respawnTimer: 0, active: true },
      { ...tCenter(4, 9), respawnTimer: 0, active: true },
      { ...tCenter(25, 9), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(1, 9), tCenter(1, 11)],
      shadow: [tCenter(28, 9), tCenter(28, 11)],
      mercenary: [tCenter(10, 1), tCenter(19, 1), tCenter(10, 18), tCenter(19, 18)],
    },
  };
}

/**
 * 3. 古埃及・沙海神廟與三層金字塔（非對稱野外）
 * - 逐格鋪設彎曲尼羅河道（1 格河心 + 8 向沙岸接壤美術），雙橋連通東岸
 * - 西側 3 層階梯金字塔（1 -> 2 -> 3 層）+ 東岸 L 形神殿廢墟台基
 */
function createDesertRuinsMap(): ArenaMap {
  const cols = 32;
  const rows = 22;
  const palmTree: [string, string, string, string] = ['#14532D', '#3F6212', '#65A30D', '#84CC16'];

  const tileGrid = createTerrainGrid(cols, rows);
  // 三層階梯金字塔（1.0 -> 2.0 -> 3.0）
  paintTerrainRect(tileGrid, 3, 5, 12, 12, 1.0, 'pyramid');
  paintTerrainRect(tileGrid, 5, 7, 8, 8, 2.0, 'pyramid');
  paintTerrainRect(tileGrid, 7, 9, 4, 4, 3.0, 'pyramid');
  // 東岸 L 形不規則神殿遺跡高台 (1.0)
  paintTerrainRows(
    tileGrid,
    2,
    [
      [26, 29], // gy=2
      [26, 29], // gy=3
      [26, 30], // gy=4
      [26, 30], // gy=5
      [26, 29], // gy=6
    ],
    1.0,
    'pyramid'
  );

  const riverRows: [number, number][] = [
    [19, 21],
    [19, 21],
    [19, 22],
    [19, 22],
    [19, 22],
    [19, 22],
    [20, 23],
    [20, 23],
    [20, 23],
    [21, 24],
    [21, 24],
    [21, 24],
    [21, 24],
    [21, 23],
    [21, 23],
    [20, 23],
    [20, 22],
    [20, 22],
    [19, 22],
    [19, 22],
    [19, 22],
    [19, 21],
  ];
  const waterTiles: GridTile[] = [];
  const waterTileKeys = new Set<string>();
  riverRows.forEach(([xStart, xEnd], gy) => {
    for (let gx = xStart; gx <= xEnd; gx++) {
      waterTiles.push({ gx, gy });
      waterTileKeys.add(`${gx},${gy}`);
    }
  });

  const obeliskWalls: Obstacle[] = [
    ...createTileWallLine(17, 6, 17, 8, 'stone_wall_tan'),
    ...createTileWallLine(27, 12, 28, 13, 'stone_wall_tan'),
  ];

  return {
    id: 'desert_ruins',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'desert_outdoor',
    name: '阿努比斯・沙海神廟遺跡',
    tileGrid,
    stairs: [
      { ...tRect(2, 10, 1, 2), elevation: 0.5, direction: 'east', style: 'pyramid' },
      { ...tRect(8, 17, 2, 1), elevation: 0.5, direction: 'north', style: 'pyramid' },
      { ...tRect(15, 10, 1, 2), elevation: 0.5, direction: 'west', style: 'pyramid' },
      { ...tRect(4, 10, 1, 2), elevation: 1.5, direction: 'east', style: 'pyramid' },
      { ...tRect(13, 10, 1, 2), elevation: 1.5, direction: 'west', style: 'pyramid' },
      { ...tRect(8, 8, 2, 1), elevation: 2.5, direction: 'south', style: 'pyramid' },
      { ...tRect(8, 13, 2, 1), elevation: 2.5, direction: 'north', style: 'pyramid' },
      { ...tRect(27, 7, 2, 1), elevation: 0.5, direction: 'north', style: 'pyramid' },
    ],
    waterTiles,
    waterTileKeys,
    bridges: [
      { ...tRect(18, 4, 6, 2), orientation: 'horizontal' },
      { ...tRect(19, 15, 6, 2), orientation: 'horizontal' },
    ],
    obstacles: [
      { ...tRect(4, 19, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      { ...tRect(17, 14, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      { ...tRect(28, 9, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate' },
      { ...tRect(26, 17, 3, 2), blocksBullets: true, elevation: 3.0, kind: 'wall', style: 'house' },
      ...obeliskWalls,
    ],
    bushes: [
      { ...tRect(17, 2, 1, 1) },
      { ...tRect(18, 2, 1, 1) },
      { ...tRect(26, 11, 1, 1) },
    ],
    trees: [
      { ...tRect(1, 6, 1, 1), canopyRadius: 46, foliagePalette: palmTree },
      { ...tRect(17, 19, 1, 1), canopyRadius: 48, foliagePalette: palmTree },
      { ...tRect(25, 8, 1, 1), canopyRadius: 44, foliagePalette: palmTree },
      { ...tRect(29, 15, 1, 1), canopyRadius: 48, foliagePalette: palmTree },
      { ...tRect(5, 2, 1, 1), canopyRadius: 44, foliagePalette: palmTree },
    ],
    weaponSpawns: [
      { ...tCenter(9, 11), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(8, 10), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(28, 4), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(21, 5), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(22, 16), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(6, 11), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(14, 6), kind: 'melee', weaponId: 'claw' },
    ],
    ammoSpawns: [
      { ...tCenter(4, 6), respawnTimer: 0, active: true },
      { ...tCenter(13, 15), respawnTimer: 0, active: true },
      { ...tCenter(27, 5), respawnTimer: 0, active: true },
      { ...tCenter(17, 18), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(9, 10), respawnTimer: 0, active: true },
      { ...tCenter(28, 5), respawnTimer: 0, active: true },
      { ...tCenter(15, 17), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(1, 8), tCenter(1, 10)],
      shadow: [tCenter(30, 11), tCenter(30, 13)],
      mercenary: [tCenter(10, 2), tCenter(14, 19), tCenter(27, 10), tCenter(17, 12)],
    },
  };
}

/**
 * 4. 現代・東港鋼鐵貨櫃場（不對稱室內／港區倉庫）
 */
function createIndustrialWarehouseMap(): ArenaMap {
  const cols = 28;
  const rows = 20;
  const indoorPlanter: [string, string, string, string] = ['#1E293B', '#334155', '#475569', '#64748B'];

  return {
    id: 'industrial_warehouse',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'warehouse_indoor',
    name: '東港・鋼鐵貨櫃機庫',
    tileGrid: createTerrainGrid(cols, rows),
    stairs: [
      { ...tRect(4, 4, 1, 1), elevation: 0.5, direction: 'east' },
      { ...tRect(13, 15, 1, 1), elevation: 0.5, direction: 'west' },
      { ...tRect(22, 13, 1, 1), elevation: 0.5, direction: 'west' },
    ],
    waterTiles: [],
    waterTileKeys: new Set<string>(),
    bridges: [],
    obstacles: [
      // 攀爬鏈 A（1×1 階梯 -> 1×1 小箱 -> 2×2 大箱 -> 2.0 貨櫃）
      { ...tRect(5, 4, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
      { ...tRect(6, 4, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate', style: 'default' },
      { ...tRect(8, 3, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#0284C7' },
      { ...tRect(12, 2, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#D97706' },

      // 攀爬鏈 B（1×1 階梯 -> 1×1 小箱 -> 2×2 大箱 -> 2.0 貨櫃）
      { ...tRect(12, 15, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
      { ...tRect(10, 14, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate', style: 'default' },
      { ...tRect(8, 12, 2, 4), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#B91C1C' },
      { ...tRect(9, 10, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#047857' },

      // 攀爬鏈 C（1×1 階梯 -> 1×1 小箱 -> 2×2 大箱 -> 2.0 貨櫃）
      { ...tRect(21, 13, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
      { ...tRect(20, 11, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate', style: 'default' },
      { ...tRect(19, 7, 2, 4), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#0284C7' },
      { ...tRect(21, 7, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#B91C1C' },

      // 額外港區 2 格高貨櫃（形成窄巷）
      { ...tRect(3, 1, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#475569' },
      { ...tRect(2, 11, 2, 4), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#D97706' },
      { ...tRect(15, 6, 2, 4), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#475569' },
      { ...tRect(19, 2, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#047857' },
      { ...tRect(24, 12, 2, 4), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#0284C7' },
      { ...tRect(3, 17, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#B91C1C' },

      // 散落 1×1 小箱體與大箱掩體
      { ...tRect(5, 8, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
      { ...tRect(16, 16, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate', style: 'default' },
      { ...tRect(24, 4, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },

      ...createTileWallLine(14, 12, 14, 12, 'stone_wall_green'),
      ...createTileWallLine(25, 10, 25, 10, 'stone_wall_green'),
    ],
    bushes: [],
    trees: [
      { ...tRect(1, 9, 1, 1), canopyRadius: 34, foliagePalette: indoorPlanter },
      { ...tRect(26, 2, 1, 1), canopyRadius: 34, foliagePalette: indoorPlanter },
    ],
    weaponSpawns: [
      { ...tCenter(13, 2), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(11, 10), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(22, 7), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(13, 8), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(6, 9), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(18, 15), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(5, 13), kind: 'gun', weaponId: 'rifle' },
    ],
    ammoSpawns: [
      { ...tCenter(5, 10), respawnTimer: 0, active: true },
      { ...tCenter(23, 10), respawnTimer: 0, active: true },
      { ...tCenter(9, 4), respawnTimer: 0, active: true },
      { ...tCenter(14, 18), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(10, 3), respawnTimer: 0, active: true },
      { ...tCenter(17, 11), respawnTimer: 0, active: true },
      { ...tCenter(16, 12), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(1, 5), tCenter(1, 7)],
      shadow: [tCenter(26, 16), tCenter(26, 18)],
      mercenary: [tCenter(1, 1), tCenter(17, 1), tCenter(10, 18), tCenter(26, 10)],
    },
  };
}

/**
 * 5. 荒野・西部鐵道鎮（沙地車站、鐵軌、靜止火車車廂、兩房磚牆單位、L/U牆改小箱自然採光口）
 */
function createWesternRailwayMap(): ArenaMap {
  const cols = 32;
  const rows = 22;
  const desertScrub: [string, string, string, string] = ['#3F6212', '#4D7C0F', '#65A30D', '#A3E635'];

  const tileGrid = createTerrainGrid(cols, rows);
  // 橫貫西部沙鎮的鐵道路軌帶 (gy = 10..11, elev = 0)
  paintTerrainRect(tileGrid, 0, 10, cols, 2, 0, 'rail_track');

  const obstacles: Obstacle[] = [
    // 靜止列車車廂與蒸汽火車頭 (2.0) — 留有平交道通行缺口
    { ...tRect(3, 10, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'train_car', colorVariant: '#991B1B' },
    { ...tRect(8, 10, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'train_car', colorVariant: '#92400E' },
    { ...tRect(18, 10, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'train_car', colorVariant: 'loco' },
    { ...tRect(23, 10, 4, 2), blocksBullets: true, elevation: 2.0, kind: 'crate', style: 'train_car', colorVariant: '#3F6212' },

    // 西北「兩房單位」石牆站房（雙室隔間＋出入口門道＋面向鐵道小箱射擊窗）
    ...createTileWallLine(4, 3, 4, 7, 'stone_wall_tan'),   // 西外牆
    ...createTileWallLine(12, 3, 12, 7, 'stone_wall_tan'), // 東外牆
    ...createTileWallLine(6, 3, 10, 3, 'stone_wall_tan'),  // 北屋頂牆（5,3 與 11,3 為北門道）
    ...createTileWallLine(8, 4, 8, 4, 'stone_wall_tan'),   // 兩房中隔牆北段（8,5 為連通門）
    ...createTileWallLine(8, 6, 8, 7, 'stone_wall_tan'),   // 兩房中隔牆南段
    ...createTileWallLine(7, 7, 7, 7, 'stone_wall_tan'),   // 南面牆體（5,7 與 11,7 為南門道）
    ...createTileWallLine(9, 7, 9, 7, 'stone_wall_tan'),
    { ...tRect(6, 7, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
    { ...tRect(10, 7, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },

    // 北中三邊Ｕ形碉堡（內嵌 1×1 小箱貼合北牆，牆對小箱面自動自然打燈）
    ...createTileWallLine(15, 3, 19, 3, 'stone_wall_tan'),
    ...createTileWallLine(15, 4, 15, 5, 'stone_wall_tan'),
    ...createTileWallLine(19, 4, 19, 5, 'stone_wall_tan'),
    { ...tRect(17, 4, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },

    // 東北Ｌ形石牆（其中一側牆改為小箱＋旁邊站長小屋）
    ...createTileWallLine(21, 4, 23, 4, 'stone_wall_tan'),
    ...createTileWallLine(21, 5, 21, 5, 'stone_wall_tan'),
    { ...tRect(21, 6, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
    { ...tRect(26, 3, 3, 2), blocksBullets: true, elevation: 3.0, kind: 'wall', style: 'house' },

    // 西南Ｌ形石牆（東端改為一格小箱掩體，牆對箱子面明亮）
    ...createTileWallLine(5, 15, 5, 18, 'stone_wall_tan'),
    ...createTileWallLine(6, 18, 6, 18, 'stone_wall_tan'),
    { ...tRect(7, 18, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },

    // 南中複合石牆掩體陣（兩段短Ｌ牆以一格小箱銜接成射擊口）
    ...createTileWallLine(13, 16, 13, 18, 'stone_wall_tan'),
    ...createTileWallLine(14, 18, 14, 18, 'stone_wall_tan'),
    { ...tRect(15, 18, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },
    ...createTileWallLine(16, 18, 17, 18, 'stone_wall_tan'),
    ...createTileWallLine(17, 16, 17, 17, 'stone_wall_tan'),

    // 東南Ｔ／Ｌ組合石牆（南翼改小箱）
    ...createTileWallLine(23, 15, 26, 15, 'stone_wall_tan'),
    ...createTileWallLine(25, 16, 25, 16, 'stone_wall_tan'),
    { ...tRect(25, 17, 1, 1), blocksBullets: false, elevation: 1.0, kind: 'crate', style: 'small_crate' },

    // 站場大貨箱掩體 (1.5)
    { ...tRect(10, 14, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate', style: 'default' },
    { ...tRect(20, 14, 2, 2), blocksBullets: true, elevation: 1.5, kind: 'crate', style: 'default' },
  ];

  return {
    id: 'western_railway',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'desert_outdoor',
    name: '荒野・西部鐵道鎮',
    tileGrid,
    stairs: [],
    waterTiles: [],
    waterTileKeys: new Set<string>(),
    bridges: [],
    obstacles,
    bushes: [
      { ...tRect(3, 8, 1, 1) },
      { ...tRect(28, 13, 1, 1) },
      { ...tRect(12, 13, 1, 1) },
      { ...tRect(22, 8, 1, 1) },
    ],
    trees: [
      { ...tRect(1, 15, 1, 1), canopyRadius: 44, foliagePalette: desertScrub },
      { ...tRect(29, 7, 1, 1), canopyRadius: 44, foliagePalette: desertScrub },
      { ...tRect(13, 2, 1, 1), canopyRadius: 42, foliagePalette: desertScrub },
      { ...tRect(20, 19, 1, 1), canopyRadius: 42, foliagePalette: desertScrub },
    ],
    weaponSpawns: [
      { ...tCenter(15, 10), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(15, 11), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(6, 5), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(24, 17), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(17, 5), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(15, 16), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(22, 6), kind: 'melee', weaponId: 'claw' },
    ],
    ammoSpawns: [
      { ...tCenter(14, 8), respawnTimer: 0, active: true },
      { ...tCenter(15, 14), respawnTimer: 0, active: true },
      { ...tCenter(7, 14), respawnTimer: 0, active: true },
      { ...tCenter(25, 8), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(10, 5), respawnTimer: 0, active: true },
      { ...tCenter(13, 11), respawnTimer: 0, active: true },
      { ...tCenter(26, 17), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(1, 5), tCenter(1, 7)],
      shadow: [tCenter(30, 14), tCenter(30, 16)],
      mercenary: [tCenter(1, 19), tCenter(15, 1), tCenter(29, 1), tCenter(16, 20)],
    },
  };
}

/**
 * 6. 嵐山・青翠竹林（純地形不規則多層山地：外圍不規則山丘環繞＋中央凹凸山脊谷道＋零箱子零水域零房屋＋密集竹林實牆）
 */
function createBambooFortressMap(): ArenaMap {
  const cols = 32;
  const rows = 24;
  const bambooCanopy: [string, string, string, string] = ['#14532D', '#166534', '#16A34A', '#4ADE80'];

  const tileGrid = createTerrainGrid(cols, rows);

  // 1. 不規則外圍環山 (elev 1.0，東西各有山谷缺口、南北亦有崎嶇坡口)
  // 北緣山脈 (gy = 0..2)
  paintTerrainRows(
    tileGrid,
    0,
    [
      [0, 13], [0, 12], [0, 11], [1, 9],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    0,
    [
      [18, 31], [19, 31], [20, 31], [22, 30],
    ],
    1.0,
    'hill'
  );
  // 南緣山脈 (gy = 20..23)
  paintTerrainRows(
    tileGrid,
    20,
    [
      [1, 8], [0, 10], [0, 12], [0, 13],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    20,
    [
      [22, 30], [20, 31], [19, 31], [18, 31],
    ],
    1.0,
    'hill'
  );
  // 西緣南北翼山嶺 (保留 gy=10..13 西谷通道)
  paintTerrainRows(
    tileGrid,
    3,
    [
      [0, 3], [0, 3], [0, 4], [0, 4], [0, 3], [0, 2],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    14,
    [
      [0, 2], [0, 3], [0, 4], [0, 4], [0, 3], [0, 3],
    ],
    1.0,
    'hill'
  );
  // 東緣南北翼山嶺 (保留 gy=10..13 東谷通道)
  paintTerrainRows(
    tileGrid,
    3,
    [
      [28, 31], [28, 31], [27, 31], [27, 31], [28, 31], [29, 31],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    14,
    [
      [29, 31], [28, 31], [27, 31], [27, 31], [28, 31], [28, 31],
    ],
    1.0,
    'hill'
  );

  // 外圍四角二層山峰 (2.0)
  paintTerrainRect(tileGrid, 1, 1, 3, 2, 2.0, 'hill');
  paintTerrainRect(tileGrid, 28, 1, 3, 2, 2.0, 'hill');
  paintTerrainRect(tileGrid, 1, 21, 3, 2, 2.0, 'hill');
  paintTerrainRect(tileGrid, 28, 21, 3, 2, 2.0, 'hill');

  // 2. 中央凹凸起伏山丘群（純靠高低起伏與山腰凹口構成立體攻防）
  // 西中彎月高丘 (1.0 -> 2.0)
  paintTerrainRows(
    tileGrid,
    5,
    [
      [7, 11],
      [6, 12],
      [6, 11],
      [6, 10],
      [6, 10],
      [6, 11],
      [7, 12],
      [8, 12],
      [8, 11],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    7,
    [
      [7, 9],
      [7, 8],
      [7, 8],
      [7, 9],
    ],
    2.0,
    'hill'
  );

  // 中央啞鈴型鞍部山脊 (1.0 貫穿南北 + 雙峰 2.0)
  paintTerrainRows(
    tileGrid,
    6,
    [
      [15, 17],
      [14, 18],
      [14, 18],
      [15, 17],
      [15, 17],
      [15, 17],
      [14, 18],
      [14, 18],
      [15, 17],
      [15, 16],
    ],
    1.0,
    'hill'
  );
  paintTerrainRect(tileGrid, 15, 7, 2, 2, 2.0, 'hill');
  paintTerrainRect(tileGrid, 15, 12, 2, 2, 2.0, 'hill');

  // 東中鋸齒階丘 (1.0 -> 2.0)
  paintTerrainRows(
    tileGrid,
    6,
    [
      [21, 24],
      [20, 24],
      [20, 25],
      [21, 25],
      [21, 25],
      [20, 25],
      [20, 24],
      [21, 24],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    8,
    [
      [22, 24],
      [22, 23],
      [22, 24],
    ],
    2.0,
    'hill'
  );

  // 谷道零星小土丘 (1.0) 製造高低落差掩體
  paintTerrainRows(tileGrid, 16, [[11, 13], [10, 12]], 1.0, 'hill');
  paintTerrainRows(tileGrid, 4, [[19, 21], [20, 22]], 1.0, 'hill');

  // 每格三株的密集竹林實牆（只放置於平滑山谷與開闊山脊旁，絕不阻擋階梯口）
  const bambooCoords: [number, number][] = [
    [13, 3], [14, 3], [14, 4],
    [17, 3], [18, 3],
    [5, 4], [5, 5],
    [25, 4], [25, 5],
    [4, 9], [4, 14],
    [12, 9], [12, 10], [13, 10],
    [19, 9], [19, 10],
    [13, 14], [13, 15],
    [19, 14], [19, 15],
    [26, 9], [26, 14],
    [6, 17], [7, 17], [7, 18],
    [15, 18], [16, 18], [17, 18],
    [23, 17], [24, 17], [24, 18],
    [10, 19], [11, 19],
    [20, 19], [21, 19],
    [14, 21], [17, 21],
  ];
  const bambooWalls: Obstacle[] = bambooCoords.map(([gx, gy]) => ({
    ...tRect(gx, gy, 1, 1),
    blocksBullets: true,
    elevation: 3.0,
    kind: 'wall',
    style: 'bamboo',
  }));

  return {
    id: 'bamboo_fortress',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'bamboo_outdoor',
    name: '嵐山・青翠竹林',
    tileGrid,
    stairs: [
      // 外圍環山天然 1×1 土坡（0 <-> 1.0，沿谷口與山緣開道）
      { ...tRect(2, 9, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(2, 13, 1, 1), elevation: 0.5, direction: 'south', style: 'hill' },
      { ...tRect(11, 3, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(19, 2, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(29, 9, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(29, 13, 1, 1), elevation: 0.5, direction: 'south', style: 'hill' },
      { ...tRect(13, 22, 1, 1), elevation: 0.5, direction: 'west', style: 'hill' },
      { ...tRect(19, 21, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },

      // 外圍四角高峰 1×1 土坡（1.0 <-> 2.0）
      { ...tRect(4, 2, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },
      { ...tRect(27, 2, 1, 1), elevation: 1.5, direction: 'east', style: 'hill' },
      { ...tRect(4, 21, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },
      { ...tRect(27, 21, 1, 1), elevation: 1.5, direction: 'east', style: 'hill' },

      // 西中彎月高丘土坡（0.5 與 1.5 間隔平坦山腰，絕不相鄰）
      { ...tRect(5, 6, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(9, 14, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(10, 7, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },
      { ...tRect(10, 10, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },

      // 中央鞍部山脊土坡（0.5 位於山腰、1.5 位於南北兩端，保留寬裕平地緩衝）
      { ...tRect(14, 11, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(18, 11, 1, 1), elevation: 0.5, direction: 'west', style: 'hill' },
      { ...tRect(15, 6, 1, 1), elevation: 1.5, direction: 'south', style: 'hill' },
      { ...tRect(17, 13, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },

      // 東中鋸齒階丘土坡（0.5 與 1.5 錯開至不同方位，避免緊鄰）
      { ...tRect(20, 6, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(26, 11, 1, 1), elevation: 0.5, direction: 'west', style: 'hill' },
      { ...tRect(23, 14, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(23, 7, 1, 1), elevation: 1.5, direction: 'south', style: 'hill' },
      { ...tRect(22, 11, 1, 1), elevation: 1.5, direction: 'north', style: 'hill' },

      // 谷道小土丘坡道（0 <-> 1.0）
      { ...tRect(9, 17, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(22, 4, 1, 1), elevation: 0.5, direction: 'west', style: 'hill' },
    ],
    waterTiles: [],
    waterTileKeys: new Set<string>(),
    bridges: [],
    obstacles: [...bambooWalls],
    bushes: [
      { ...tRect(8, 3, 1, 1) },
      { ...tRect(11, 7, 1, 1) },
      { ...tRect(16, 16, 1, 1) },
      { ...tRect(22, 12, 1, 1) },
      { ...tRect(26, 7, 1, 1) },
      { ...tRect(15, 19, 1, 1) },
    ],
    trees: [
      { ...tRect(6, 15, 1, 1), canopyRadius: 42, foliagePalette: bambooCanopy },
      { ...tRect(13, 5, 1, 1), canopyRadius: 42, foliagePalette: bambooCanopy },
      { ...tRect(26, 16, 1, 1), canopyRadius: 42, foliagePalette: bambooCanopy },
      { ...tRect(18, 17, 1, 1), canopyRadius: 40, foliagePalette: bambooCanopy },
      { ...tRect(10, 4, 1, 1), canopyRadius: 40, foliagePalette: bambooCanopy },
      { ...tRect(22, 19, 1, 1), canopyRadius: 42, foliagePalette: bambooCanopy },
    ],
    weaponSpawns: [
      { ...tCenter(8, 8), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(16, 10), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(23, 9), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(11, 17), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(20, 5), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(16, 6), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(16, 15), kind: 'melee', weaponId: 'claw' },
    ],
    ammoSpawns: [
      { ...tCenter(8, 11), respawnTimer: 0, active: true },
      { ...tCenter(15, 10), respawnTimer: 0, active: true },
      { ...tCenter(23, 12), respawnTimer: 0, active: true },
      { ...tCenter(16, 20), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(15, 7), respawnTimer: 0, active: true },
      { ...tCenter(7, 10), respawnTimer: 0, active: true },
      { ...tCenter(23, 8), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(1, 11), tCenter(2, 12)],
      shadow: [tCenter(30, 11), tCenter(29, 12)],
      mercenary: [tCenter(15, 1), tCenter(16, 22), tCenter(9, 19), tCenter(23, 4)],
    },
  };
}

/**
 * 7. 赤柱・碧湖雙環海島（34×44 上下修長大地圖：不規則有機島型＋不規則內湖與湖心細島＋南側曲流缺口與雙木橋＋零箱子＋多樹木＋不規則山地）
 */
function createStanleyIslandMap(): ArenaMap {
  const cols = 34;
  const rows = 44;
  const coastalPalm: [string, string, string, string] = ['#14532D', '#15803D', '#16A34A', '#4ADE80'];

  const tileGrid = createTerrainGrid(cols, rows);
  const waterTiles: GridTile[] = [];
  const waterTileKeys = new Set<string>();

  // 有機不規則外島輪廓 (gy = 4..39)
  const outerRowBounds: Record<number, [number, number]> = {
    4: [12, 20],
    5: [9, 23],
    6: [7, 25],
    7: [6, 27],
    8: [5, 28],
    9: [4, 29],
    10: [4, 29],
    11: [3, 29],
    12: [3, 28],
    13: [3, 28],
    14: [4, 29],
    15: [4, 29],
    16: [4, 30],
    17: [3, 30],
    18: [3, 30],
    19: [3, 29],
    20: [3, 29],
    21: [3, 28],
    22: [4, 28],
    23: [4, 29],
    24: [4, 29],
    25: [4, 30],
    26: [3, 30],
    27: [3, 30],
    28: [3, 29],
    29: [4, 29],
    30: [4, 29],
    31: [4, 28],
    32: [5, 28],
    33: [5, 28],
    34: [5, 28],
    35: [6, 27],
    36: [6, 27],
    37: [7, 26],
    38: [9, 24],
    39: [11, 22],
  };

  // 有機不規則內湖輪廓 (gy = 14..29)
  const innerLakeBounds: Record<number, [number, number]> = {
    14: [14, 19],
    15: [12, 21],
    16: [11, 22],
    17: [10, 23],
    18: [10, 23],
    19: [10, 23],
    20: [10, 24],
    21: [10, 24],
    22: [10, 23],
    23: [10, 23],
    24: [11, 23],
    25: [11, 22],
    26: [12, 22],
    27: [13, 21],
    28: [14, 20],
    29: [15, 19],
  };

  // 有機湖心細島 (gy = 19..24)
  const isletBounds: Record<number, [number, number]> = {
    19: [16, 18],
    20: [15, 19],
    21: [15, 19],
    22: [15, 19],
    23: [15, 18],
    24: [16, 17],
  };

  // 南側自然曲流海蝕缺口（貫通內湖至外海 gy = 30..43）
  const breachBounds: Record<number, [number, number]> = {
    30: [15, 18],
    31: [15, 18],
    32: [15, 18],
    33: [16, 18],
    34: [16, 18],
    35: [16, 18],
    36: [15, 18],
    37: [15, 17],
    38: [15, 17],
    39: [15, 18],
  };

  const isIsletTile = (gx: number, gy: number) => {
    const b = isletBounds[gy];
    return Boolean(b && gx >= b[0] && gx <= b[1]);
  };
  const isInnerLakeTile = (gx: number, gy: number) => {
    const b = innerLakeBounds[gy];
    return Boolean(b && gx >= b[0] && gx <= b[1] && !isIsletTile(gx, gy));
  };
  const isBreachChannel = (gx: number, gy: number) => {
    const b = breachBounds[gy];
    if (b && gx >= b[0] && gx <= b[1]) return true;
    return gy >= 40 && gx >= 14 && gx <= 19;
  };
  const isOuterIslandLand = (gx: number, gy: number) => {
    const b = outerRowBounds[gy];
    return Boolean(b && gx >= b[0] && gx <= b[1]);
  };

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const land = (isOuterIslandLand(gx, gy) && !isInnerLakeTile(gx, gy) && !isBreachChannel(gx, gy)) || isIsletTile(gx, gy);
      if (!land) {
        waterTiles.push({ gx, gy });
        waterTileKeys.add(`${gx},${gy}`);
      }
    }
  }

  // 內陸青翠草地＋外環金色沙灘（湖心細島中央亦為青草）
  for (let gy = 6; gy <= 37; gy++) {
    for (let gx = 5; gx <= 28; gx++) {
      if (waterTileKeys.has(`${gx},${gy}`)) continue;
      if (isIsletTile(gx, gy)) {
        if (gx >= 16 && gx <= 18 && gy >= 20 && gy <= 22) {
          tileGrid[gy][gx] = { elev: 0, style: 'grass_ground' };
        }
        continue;
      }
      const touchesSeaSoon =
        waterTileKeys.has(`${gx - 2},${gy}`) ||
        waterTileKeys.has(`${gx + 2},${gy}`) ||
        waterTileKeys.has(`${gx},${gy - 2}`) ||
        waterTileKeys.has(`${gx},${gy + 2}`);
      if (!touchesSeaSoon) {
        tileGrid[gy][gx] = { elev: 0, style: 'grass_ground' };
      }
    }
  }

  // 不規則海島山丘（非矩形多邊形階坡）
  // 1. 北岬起伏雙層山丘 (1.0 -> 2.0)
  paintTerrainRows(
    tileGrid,
    7,
    [
      [11, 15],
      [10, 17],
      [9, 18],
      [9, 17],
      [10, 16],
      [11, 14],
    ],
    1.0,
    'hill'
  );
  paintTerrainRows(
    tileGrid,
    9,
    [
      [12, 14],
      [11, 13],
    ],
    2.0,
    'hill'
  );

  // 2. 西岸不規則山脊 (1.0 -> 2.0)
  paintTerrainRows(
    tileGrid,
    16,
    [
      [5, 7],
      [4, 8],
      [4, 8],
      [5, 8],
      [5, 7],
      [5, 7],
      [5, 8],
      [6, 8],
    ],
    1.0,
    'hill'
  );
  paintTerrainRect(tileGrid, 5, 18, 2, 2, 2.0, 'hill');

  // 3. 東岸岩崖不規則高丘 (1.0 -> 2.0)
  paintTerrainRows(
    tileGrid,
    14,
    [
      [25, 27],
      [24, 28],
      [24, 28],
      [25, 28],
      [25, 27],
      [25, 27],
      [24, 27],
      [24, 26],
    ],
    1.0,
    'hill'
  );
  paintTerrainRect(tileGrid, 26, 16, 2, 2, 2.0, 'hill');

  // 4. 東南岬角緩坡丘 (1.0)
  paintTerrainRows(
    tileGrid,
    30,
    [
      [22, 25],
      [21, 26],
      [21, 25],
      [22, 25],
    ],
    1.0,
    'hill'
  );

  const obstacles: Obstacle[] = [
    // 東岸石砌海岸防哨小屋 (3.0) — 全地圖零木箱！
    { ...tRect(24, 26, 3, 2), blocksBullets: true, elevation: 3.0, kind: 'wall', style: 'house' },

    // 北岸面湖Ｌ形與短石牆掩體
    ...createTileWallLine(16, 12, 19, 12, 'stone_wall_tan'),
    ...createTileWallLine(16, 13, 16, 13, 'stone_wall_tan'),

    // 西南灘頭石牆掩體
    ...createTileWallLine(9, 28, 9, 30, 'stone_wall_tan'),
    ...createTileWallLine(10, 30, 11, 30, 'stone_wall_tan'),

    // 東北灣防禦石牆
    ...createTileWallLine(22, 9, 24, 9, 'stone_wall_tan'),
    ...createTileWallLine(22, 10, 22, 11, 'stone_wall_tan'),

    // 湖心細島護石矮牆
    ...createTileWallLine(17, 20, 18, 20, 'stone_wall_tan'),
  ];

  return {
    id: 'stanley_island',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome: 'desert_outdoor',
    name: '赤柱・碧湖雙環海島',
    tileGrid,
    stairs: [
      // 北岬山丘 1×1 土坡
      { ...tRect(8, 9, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(15, 12, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(14, 10, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },
      // 西岸山脊 1×1 土坡
      { ...tRect(6, 15, 1, 1), elevation: 0.5, direction: 'south', style: 'hill' },
      { ...tRect(9, 19, 1, 1), elevation: 0.5, direction: 'west', style: 'hill' },
      { ...tRect(7, 18, 1, 1), elevation: 1.5, direction: 'west', style: 'hill' },
      // 東岸高丘 1×1 土坡
      { ...tRect(24, 14, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
      { ...tRect(25, 22, 1, 1), elevation: 0.5, direction: 'north', style: 'hill' },
      { ...tRect(25, 17, 1, 1), elevation: 1.5, direction: 'east', style: 'hill' },
      // 東南緩坡 1×1 土坡
      { ...tRect(20, 31, 1, 1), elevation: 0.5, direction: 'east', style: 'hill' },
    ],
    waterTiles,
    waterTileKeys,
    bridges: [
      // 橋樑 1：外環大島西岸通往湖心細島
      { ...tRect(9, 21, 7, 2), orientation: 'horizontal' },
      // 橋樑 2：跨越大島南側曲流缺口，連通東西兩岸
      { ...tRect(14, 34, 6, 2), orientation: 'horizontal' },
    ],
    obstacles,
    bushes: [
      { ...tRect(16, 22, 1, 1) },
      { ...tRect(12, 14, 1, 1) },
      { ...tRect(21, 13, 1, 1) },
      { ...tRect(13, 33, 1, 1) },
      { ...tRect(20, 36, 1, 1) },
    ],
    trees: [
      { ...tRect(8, 7, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(19, 6, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(25, 7, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(5, 11, 1, 1), canopyRadius: 46, foliagePalette: coastalPalm },
      { ...tRect(27, 12, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(8, 15, 1, 1), canopyRadius: 42, foliagePalette: coastalPalm },
      { ...tRect(21, 15, 1, 1), canopyRadius: 42, foliagePalette: coastalPalm },
      { ...tRect(5, 25, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(8, 25, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(28, 23, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(23, 24, 1, 1), canopyRadius: 42, foliagePalette: coastalPalm },
      { ...tRect(6, 29, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(27, 29, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(11, 36, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(8, 36, 1, 1), canopyRadius: 42, foliagePalette: coastalPalm },
      { ...tRect(23, 36, 1, 1), canopyRadius: 44, foliagePalette: coastalPalm },
      { ...tRect(18, 23, 1, 1), canopyRadius: 40, foliagePalette: coastalPalm },
      { ...tRect(14, 38, 1, 1), canopyRadius: 42, foliagePalette: coastalPalm },
    ],
    weaponSpawns: [
      { ...tCenter(16, 21), kind: 'gun', weaponId: 'sniper' },
      { ...tCenter(6, 19), kind: 'melee', weaponId: 'greatsword' },
      { ...tCenter(26, 17), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(17, 35), kind: 'gun', weaponId: 'shotgun' },
      { ...tCenter(13, 10), kind: 'melee', weaponId: 'claw' },
      { ...tCenter(12, 22), kind: 'gun', weaponId: 'rifle' },
      { ...tCenter(23, 32), kind: 'melee', weaponId: 'claw' },
    ],
    ammoSpawns: [
      { ...tCenter(12, 10), respawnTimer: 0, active: true },
      { ...tCenter(24, 23), respawnTimer: 0, active: true },
      { ...tCenter(17, 22), respawnTimer: 0, active: true },
      { ...tCenter(11, 32), respawnTimer: 0, active: true },
    ],
    shieldSpawns: [
      { ...tCenter(17, 21), respawnTimer: 0, active: true },
      { ...tCenter(6, 18), respawnTimer: 0, active: true },
      { ...tCenter(26, 19), respawnTimer: 0, active: true },
    ],
    factionSpawns: {
      royal: [tCenter(6, 33), tCenter(8, 34)],
      shadow: [tCenter(26, 9), tCenter(27, 11)],
      mercenary: [tCenter(15, 6), tCenter(27, 25), tCenter(9, 27), tCenter(21, 37)],
    },
  };
}

export function createArenaMap(mapId: MapId): ArenaMap {
  switch (mapId) {
    case 'european_castle':
      return createEuropeanCastleMap();
    case 'desert_ruins':
      return createDesertRuinsMap();
    case 'industrial_warehouse':
      return createIndustrialWarehouseMap();
    case 'western_railway':
      return createWesternRailwayMap();
    case 'bamboo_fortress':
      return createBambooFortressMap();
    case 'stanley_island':
      return createStanleyIslandMap();
    case 'tokyo_shrine':
    default:
      return createTokyoShrineMap();
  }
}
