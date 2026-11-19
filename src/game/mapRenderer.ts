import { ArenaMap, TILE, biomeToDefaultFloor, createFloorGrid } from './maps';
import { FarmCropType, FloorStyle, Obstacle, PlatformStyle } from './types';

function drawFloorStyleTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  gx: number,
  gy: number,
  floorStyle: FloorStyle
) {
  switch (floorStyle) {
    case 'grass_ground':
      drawGrassGroundTile(ctx, tx, ty, gx, gy);
      return;
    case 'bamboo_moss':
      drawUniformTileMotif(ctx, tx, ty, '#33663D', BIOME_SPECKS.bamboo_outdoor);
      return;
    case 'desert_sand':
      drawUniformTileMotif(ctx, tx, ty, '#C99864', BIOME_SPECKS.desert_outdoor);
      return;
    case 'castle_stone':
      drawUniformTileMotif(ctx, tx, ty, '#A7B1BD', BIOME_SPECKS.castle_indoor);
      return;
    case 'warehouse_steel':
      drawUniformTileMotif(ctx, tx, ty, '#445061', BIOME_SPECKS.warehouse_indoor);
      return;
    case 'shrine_dirt':
    default:
      drawUniformTileMotif(ctx, tx, ty, '#BD8F5D', BIOME_SPECKS.shrine_outdoor);
      return;
  }
}

export interface BiomePalette {
  a: string;
  b: string;
  line: string;
  platA: string;
  platB: string;
  platTrim: string;
  stair: string;
  wall: string;
  wallBorder: string;
  crate: string;
  bush: [string, string, string];
  trunk: string;
}

export function getBiomePalette(biome: ArenaMap['biome']): BiomePalette {
  switch (biome) {
    case 'shrine_outdoor':
      return {
        a: '#BD8F5D',
        b: '#B38452',
        line: 'rgba(69, 26, 3, 0.24)',
        platA: '#A46F3B',
        platB: '#936030',
        platTrim: '#D6A15C',
        stair: '#6D4523',
        wall: '#78350F',
        wallBorder: '#451A03',
        crate: '#B88240',
        bush: ['#14532D', '#15803D', '#22C55E'],
        trunk: '#451A03',
      };
    case 'castle_indoor':
      return {
        a: '#A7B1BD',
        b: '#9BA5B2',
        line: 'rgba(15, 23, 42, 0.2)',
        platA: '#9E937C',
        platB: '#8E836E',
        platTrim: '#DDD3BA',
        stair: '#64748B',
        wall: '#8B7B65',
        wallBorder: '#292524',
        crate: '#B88240',
        bush: ['#064E3B', '#047857', '#10B981'],
        trunk: '#3E2723',
      };
    case 'desert_outdoor':
      return {
        a: '#C99864',
        b: '#BE8D59',
        line: 'rgba(120, 53, 15, 0.22)',
        platA: '#C7AE83',
        platB: '#B89E74',
        platTrim: '#EFE1BE',
        stair: '#8B6842',
        wall: '#8C7557',
        wallBorder: '#3B2B1B',
        crate: '#B88240',
        bush: ['#3F6212', '#65A30D', '#84CC16'],
        trunk: '#5C3A21',
      };
    case 'bamboo_outdoor':
      return {
        a: '#33663D',
        b: '#2A5733',
        line: 'rgba(20, 83, 45, 0.25)',
        platA: '#9D6D34',
        platB: '#8B5D30',
        platTrim: '#D9A76A',
        stair: '#5C3A21',
        wall: '#14532D',
        wallBorder: '#052E16',
        crate: '#B88240',
        bush: ['#14532D', '#16A34A', '#4ADE80'],
        trunk: '#365314',
      };
    case 'warehouse_indoor':
    default:
      return {
        a: '#445061',
        b: '#3A4554',
        line: 'rgba(15, 23, 42, 0.36)',
        platA: '#9A6938',
        platB: '#8B5D30',
        platTrim: '#F59E0B',
        stair: '#5C3A21',
        wall: '#5A6D57',
        wallBorder: '#1E293B',
        crate: '#B88240',
        bush: ['#166534', '#15803D', '#22C55E'],
        trunk: '#475569',
      };
  }
}

/**
 * 1×1 同紋理地板紋路點綴（對應 tile.png 粗顆粒沙石泥土畫風，全格一致且無格線邊框）
 */
const BIOME_SPECKS: Record<ArenaMap['biome'], readonly [number, number, number, number, string][]> = {
  shrine_outdoor: [
    [3, 5, 3, 2, '#9A6B3B'],
    [9, 3, 2, 2, '#D7AB78'],
    [15, 10, 4, 2, '#8B5D2E'],
    [22, 6, 3, 3, '#D5A774'],
    [31, 4, 3, 2, '#936434'],
    [40, 8, 4, 2, '#DFB684'],
    [6, 18, 4, 2, '#DFB684'],
    [13, 23, 3, 3, '#895B2C'],
    [25, 19, 3, 2, '#9F7040'],
    [34, 22, 4, 2, '#D4A572'],
    [42, 17, 3, 3, '#8B5D2E'],
    [5, 32, 3, 2, '#936434'],
    [16, 35, 4, 2, '#DFB684'],
    [27, 31, 3, 3, '#895B2C'],
    [36, 34, 3, 2, '#9E6F3F'],
    [11, 43, 3, 2, '#936434'],
    [23, 42, 4, 2, '#D8AB79'],
    [39, 43, 3, 2, '#86582A'],
  ],
  desert_outdoor: [
    [4, 6, 4, 2, '#A57544'],
    [12, 4, 3, 2, '#E2B886'],
    [20, 11, 3, 2, '#996A3A'],
    [29, 7, 4, 2, '#E5BD8C'],
    [39, 5, 3, 3, '#A27241'],
    [8, 19, 3, 2, '#E2B886'],
    [17, 22, 4, 2, '#9C6C3C'],
    [28, 18, 3, 2, '#DCB07E'],
    [37, 24, 4, 2, '#976838'],
    [6, 33, 4, 2, '#E3B987'],
    [19, 36, 3, 2, '#9F7040'],
    [31, 32, 4, 2, '#DFAF7B'],
    [41, 38, 3, 2, '#9A6B3B'],
    [12, 43, 4, 2, '#986939'],
    [26, 42, 3, 2, '#E6BF8E'],
  ],
  castle_indoor: [
    [4, 6, 3, 2, '#8E99A7'],
    [14, 4, 3, 2, '#BCC6D2'],
    [25, 9, 3, 2, '#8A95A3'],
    [37, 6, 3, 2, '#BFC9D5'],
    [8, 20, 3, 2, '#8C97A5'],
    [21, 24, 4, 2, '#B9C3CF'],
    [33, 19, 3, 2, '#8792A0'],
    [11, 34, 3, 2, '#BFC9D5'],
    [27, 36, 3, 2, '#8B96A4'],
    [40, 32, 3, 2, '#BCC6D2'],
    [17, 43, 3, 2, '#8893A1'],
    [34, 42, 3, 2, '#C0CAD6'],
  ],
  warehouse_indoor: [
    [5, 7, 3, 2, '#353F4E'],
    [16, 5, 3, 2, '#515E71'],
    [27, 10, 3, 2, '#323B49'],
    [38, 7, 3, 2, '#536074'],
    [10, 21, 3, 2, '#36404F'],
    [23, 25, 4, 2, '#4F5C6F'],
    [35, 20, 3, 2, '#343D4B'],
    [8, 34, 3, 2, '#525F73'],
    [25, 36, 3, 2, '#343D4B'],
    [39, 34, 3, 2, '#515E71'],
    [15, 43, 3, 2, '#323B49'],
    [32, 42, 3, 2, '#4E5B6E'],
  ],
  bamboo_outdoor: [
    [4, 6, 4, 2, '#244D2C'],
    [13, 4, 3, 2, '#43804F'],
    [22, 10, 4, 2, '#214729'],
    [33, 6, 3, 2, '#4E8F5B'],
    [8, 20, 3, 2, '#458351'],
    [19, 23, 4, 2, '#234B2B'],
    [31, 18, 3, 2, '#3E7A4A'],
    [40, 22, 4, 2, '#214729'],
    [7, 34, 3, 2, '#4D8E5A'],
    [21, 35, 4, 2, '#234B2B'],
    [35, 32, 3, 2, '#448150'],
    [14, 43, 3, 2, '#254F2E'],
    [29, 42, 4, 2, '#4A8956'],
  ],
};

function drawUniformTileMotif(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  baseColor: string,
  specks: readonly [number, number, number, number, string][]
) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(tx, ty, TILE, TILE);
  for (let i = 0; i < specks.length; i++) {
    const [ox, oy, w, h, col] = specks[i];
    ctx.fillStyle = col;
    ctx.fillRect(tx + ox, ty + oy, w, h);
  }
}

/**
 * 1×1 青綠草坪平地（供赤柱海島內陸草皮與沙灘過渡）
 */
function drawGrassGroundTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, gx: number, gy: number) {
  ctx.fillStyle = '#3F7D3B';
  ctx.fillRect(tx, ty, TILE, TILE);

  ctx.fillStyle = '#346B30';
  ctx.fillRect(tx + ((gx * 11 + gy * 5) % 18) + 4, ty + 6, 7, 4);
  ctx.fillRect(tx + ((gx * 7 + gy * 13) % 16) + 20, ty + 28, 8, 5);

  ctx.fillStyle = '#589C4E';
  const bx1 = tx + ((gx * 17 + gy * 3) % 24) + 6;
  const by1 = ty + ((gx * 5 + gy * 19) % 20) + 10;
  ctx.fillRect(bx1, by1, 2, 5);
  ctx.fillRect(bx1 + 4, by1 + 1, 2, 4);
  ctx.fillStyle = '#70B862';
  ctx.fillRect(bx1 + 16, by1 + 14, 2, 4);
  ctx.fillRect(bx1 + 19, by1 + 15, 2, 3);
}

/**
 * 1×1 鐵道路軌物件（支援水平、垂直、雙排並軌、90° 轉角與 T 形／十字分叉）
 */
function drawRailTrackObjectTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  gx: number,
  gy: number,
  selfAxis: 'horizontal' | 'vertical',
  nAxis: 'horizontal' | 'vertical' | null,
  sAxis: 'horizontal' | 'vertical' | null,
  wAxis: 'horizontal' | 'vertical' | null,
  eAxis: 'horizontal' | 'vertical' | null
) {
  const drawSteelH = (yPos: number) => {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(tx, yPos - 1, TILE, 6);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(tx, yPos, TILE, 4);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(tx, yPos + 0.5, TILE, 1.5);
  };
  const drawSteelV = (xPos: number) => {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(xPos - 1, ty, 6, TILE);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(xPos, ty, 4, TILE);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(xPos + 0.5, ty, 1.5, TILE);
  };

  // 1. 平行雙排水平鐵道（例如西部鐵道 2 格寬雙軌帶）
  if (
    selfAxis === 'horizontal' &&
    (nAxis === 'horizontal' || sAxis === 'horizontal') &&
    nAxis !== 'vertical' &&
    sAxis !== 'vertical'
  ) {
    const hasNorth = nAxis === 'horizontal';
    const hasSouth = sAxis === 'horizontal';
    ctx.fillStyle = '#6B6257';
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.fillStyle = '#524A40';
    ctx.fillRect(tx + ((gx * 13) % 14) + 3, ty + 6, 5, 3);
    ctx.fillRect(tx + ((gx * 19) % 16) + 18, ty + 22, 6, 3);
    if (!hasNorth) {
      ctx.fillStyle = '#443C33';
      ctx.fillRect(tx, ty, TILE, 4);
    }
    if (!hasSouth) {
      ctx.fillStyle = '#443C33';
      ctx.fillRect(tx, ty + TILE - 4, TILE, 4);
    }
    const tieTop = hasNorth ? ty : ty + 7;
    const tieBottom = hasSouth ? ty + TILE : ty + TILE - 7;
    for (let ox = 4; ox < TILE; ox += 16) {
      ctx.fillStyle = '#29170A';
      ctx.fillRect(tx + ox + 1, tieTop, 9, tieBottom - tieTop);
      ctx.fillStyle = '#5C381B';
      ctx.fillRect(tx + ox, tieTop, 8, tieBottom - tieTop);
    }
    if (!hasNorth && hasSouth) drawSteelH(ty + 14);
    else if (hasNorth && !hasSouth) drawSteelH(ty + TILE - 18);
    return;
  }

  // 2. 平行雙排垂直鐵道
  if (
    selfAxis === 'vertical' &&
    (wAxis === 'vertical' || eAxis === 'vertical') &&
    wAxis !== 'horizontal' &&
    eAxis !== 'horizontal'
  ) {
    const hasWest = wAxis === 'vertical';
    const hasEast = eAxis === 'vertical';
    ctx.fillStyle = '#6B6257';
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.fillStyle = '#524A40';
    ctx.fillRect(tx + 6, ty + ((gy * 13) % 14) + 3, 3, 5);
    ctx.fillRect(tx + 22, ty + ((gy * 19) % 16) + 18, 3, 6);
    if (!hasWest) {
      ctx.fillStyle = '#443C33';
      ctx.fillRect(tx, ty, 4, TILE);
    }
    if (!hasEast) {
      ctx.fillStyle = '#443C33';
      ctx.fillRect(tx + TILE - 4, ty, 4, TILE);
    }
    const tieLeft = hasWest ? tx : tx + 7;
    const tieRight = hasEast ? tx + TILE : tx + TILE - 7;
    for (let oy = 4; oy < TILE; oy += 16) {
      ctx.fillStyle = '#29170A';
      ctx.fillRect(tieLeft, ty + oy + 1, tieRight - tieLeft, 9);
      ctx.fillStyle = '#5C381B';
      ctx.fillRect(tieLeft, ty + oy, tieRight - tieLeft, 8);
    }
    if (!hasWest && hasEast) drawSteelV(tx + 14);
    else if (hasWest && !hasEast) drawSteelV(tx + TILE - 18);
    return;
  }

  // 3. 單格直軌／90° 轉角／T 形分叉／十字交會：計算四向連接埠 (N, S, W, E)
  let N = false;
  let S = false;
  let W = false;
  let E = false;

  if (selfAxis === 'horizontal') {
    N = nAxis === 'vertical';
    S = sAxis === 'vertical';
    if (N || S) {
      W = wAxis !== null;
      E = eAxis !== null;
      if (!W && !E) {
        W = true;
        E = true;
      }
    } else {
      W = true;
      E = true;
    }
  } else {
    W = wAxis === 'horizontal';
    E = eAxis === 'horizontal';
    if (W || E) {
      N = nAxis !== null;
      S = sAxis !== null;
      if (!N && !S) {
        N = true;
        S = true;
      }
    } else {
      N = true;
      S = true;
    }
  }

  // 碎石道碴（僅覆蓋有通向的臂段，轉角留空處透出底層地板）
  const armPad = 6;
  ctx.fillStyle = '#6B6257';
  ctx.fillRect(tx + armPad, ty + armPad, TILE - armPad * 2, TILE - armPad * 2);
  if (N) ctx.fillRect(tx + armPad, ty, TILE - armPad * 2, armPad + 2);
  if (S) ctx.fillRect(tx + armPad, ty + TILE - armPad - 2, TILE - armPad * 2, armPad + 2);
  if (W) ctx.fillRect(tx, ty + armPad, armPad + 2, TILE - armPad * 2);
  if (E) ctx.fillRect(tx + TILE - armPad - 2, ty + armPad, armPad + 2, TILE - armPad * 2);

  ctx.fillStyle = '#443C33';
  if (!N) ctx.fillRect(tx + armPad, ty + armPad, TILE - armPad * 2, 3);
  if (!S) ctx.fillRect(tx + armPad, ty + TILE - armPad - 3, TILE - armPad * 2, 3);
  if (!W) ctx.fillRect(tx + armPad, ty + armPad, 3, TILE - armPad * 2);
  if (!E) ctx.fillRect(tx + TILE - armPad - 3, ty + armPad, 3, TILE - armPad * 2);

  // 碎石顆粒點綴
  ctx.fillStyle = '#524A40';
  ctx.fillRect(tx + 12 + ((gx * 7) % 10), ty + 14 + ((gy * 5) % 8), 5, 3);
  ctx.fillRect(tx + 24, ty + 28, 5, 3);

  // 木質枕木
  const drawTieH = (ox: number) => {
    ctx.fillStyle = '#29170A';
    ctx.fillRect(tx + ox + 1, ty + 8, 8, TILE - 16);
    ctx.fillStyle = '#5C381B';
    ctx.fillRect(tx + ox, ty + 8, 7, TILE - 16);
  };
  const drawTieV = (oy: number) => {
    ctx.fillStyle = '#29170A';
    ctx.fillRect(tx + 8, ty + oy + 1, TILE - 16, 8);
    ctx.fillStyle = '#5C381B';
    ctx.fillRect(tx + 8, ty + oy, TILE - 16, 7);
  };
  if (W && E) {
    for (const ox of [4, 20, 36]) drawTieH(ox);
  } else {
    if (W) drawTieH(4);
    if (E) drawTieH(36);
  }
  if (N && S) {
    for (const oy of [4, 20, 36]) drawTieV(oy);
  } else {
    if (N) drawTieV(4);
    if (S) drawTieV(36);
  }

  // 中心交會木墊
  if ((N || S) && (W || E)) {
    ctx.fillStyle = '#5C381B';
    ctx.fillRect(tx + 11, ty + 11, TILE - 22, TILE - 22);
  }

  // 鋼軌圓弧轉向 helper（以角點為圓心、半徑 15 與 33，與直軌 tx+15/33 完全切線對齊）
  const drawCornerArcRails = (cx: number, cy: number, a0: number, a1: number) => {
    for (const rad of [15, 33]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad, a0, a1);
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 6.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, rad, a0, a1);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }
  };

  if (N && W) drawCornerArcRails(tx, ty, 0, Math.PI / 2);
  if (N && E) drawCornerArcRails(tx + TILE, ty, Math.PI / 2, Math.PI);
  if (S && W) drawCornerArcRails(tx, ty + TILE, -Math.PI / 2, 0);
  if (S && E) drawCornerArcRails(tx + TILE, ty + TILE, Math.PI, Math.PI * 1.5);

  if (W && E) {
    drawSteelH(ty + 13);
    drawSteelH(ty + TILE - 17);
  }
  if (N && S) {
    drawSteelV(tx + 13);
    drawSteelV(tx + TILE - 17);
  }
}

/**
 * 1×1 竹林實牆：支援指定方位 (north 2上1下 / south 1上2下 / east 1左2右 / west 2左1右)，或依格座標變化
 */
function drawBambooTile(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, direction } = obs;
  const gx = Math.round(x / TILE);
  const gy = Math.round(y / TILE);
  const dirMap: Record<'north' | 'south' | 'east' | 'west', number> = {
    north: 0,
    south: 1,
    east: 2,
    west: 3,
  };
  const layoutIdx = direction ? dirMap[direction] : (((gx * 3 + gy * 7) % 4) + 4) % 4;
  const j1 = direction ? 0 : (((gx * 5 + gy * 11) % 3) - 1) * 1.1;
  const j2 = direction ? 0 : (((gx * 11 + gy * 3) % 3) - 1) * 1.1;
  const j3 = direction ? 0 : (((gx * 7 + gy * 5) % 3) - 1) * 1.1;

  // 地表竹蔭草墊（配合竹群重心微移）
  const padOffsets: [number, number][] = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ];
  const [pxOff, pyOff] = padOffsets[layoutIdx];
  ctx.fillStyle = 'rgba(5, 46, 22, 0.42)';
  ctx.beginPath();
  ctx.ellipse(x + TILE * 0.5 + pxOff * 1.5, y + TILE * 0.54 + pyOff * 1.5, 20, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  let stalks: [number, number, number][];
  if (layoutIdx === 0) {
    // 2 上 1 下
    stalks = [
      [x + 14 + j1, y + 14 + j2 * 0.5, 6.7],
      [x + 34 + j2, y + 15 - j1 * 0.5, 6.4],
      [x + 24 + j3, y + 34 + j1 * 0.4, 7.1],
    ];
  } else if (layoutIdx === 1) {
    // 1 上 2 下
    stalks = [
      [x + 24 + j1, y + 13 + j3 * 0.4, 6.9],
      [x + 14 + j2, y + 33 + j1 * 0.5, 6.6],
      [x + 34 + j3, y + 32 - j2 * 0.5, 6.8],
    ];
  } else if (layoutIdx === 2) {
    // 1 左 2 右
    stalks = [
      [x + 13 + j1 * 0.5, y + 24 + j2, 7.0],
      [x + 33 + j2 * 0.5, y + 14 + j3, 6.5],
      [x + 34 + j3 * 0.5, y + 34 + j1, 6.7],
    ];
  } else {
    // 2 左 1 右
    stalks = [
      [x + 14 + j1 * 0.5, y + 14 + j2, 6.6],
      [x + 14 + j2 * 0.5, y + 34 + j3, 6.8],
      [x + 35 + j3 * 0.5, y + 24 + j1, 7.0],
    ];
  }

  // 先畫從各竹幹伸出的翠綠竹葉簇（旋轉角依竹群編號微調）
  for (let sIdx = 0; sIdx < stalks.length; sIdx++) {
    const [sx, sy] = stalks[sIdx];
    const baseRot = (layoutIdx * 0.55 + sIdx * 0.85) % (Math.PI * 2);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(baseRot);
    for (const [ang, len, col] of [
      [-2.35, 14.5, '#15803D'],
      [-0.68, 15.5, '#16A34A'],
      [0.65, 13.8, '#22C55E'],
      [2.25, 13.0, '#166534'],
    ] as const) {
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(len * 0.55, 0, len * 0.55, 3.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#052E16';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // 再畫 3 根立體圓竹柱＋竹節光環
  for (const [sx, sy, r] of stalks) {
    // 細長投影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(sx + 3, sy + 4, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // 竹柱短立面＋圓頂
    ctx.fillStyle = '#14532D';
    ctx.beginPath();
    ctx.arc(sx, sy + 2.5, r, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, 1, sx, sy, r);
    grad.addColorStop(0, '#BBF7D0');
    grad.addColorStop(0.45, '#22C55E');
    grad.addColorStop(1, '#14532D');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // 外框與內圈竹節心
    ctx.strokeStyle = '#052E16';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = '#14532D';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
}

/**
 * 靜止火車頭／貨運車廂（elev 2.0，支援橫向 4×2 與旋轉直向 2×4 攀爬與掩體）
 */
function drawTrainCar(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, w, h, colorVariant } = obs;
  const isLoco = colorVariant === 'loco';
  const isVertical = h > w;

  // 底部鋼輪軸陰影露出邊緣
  ctx.fillStyle = '#0F172A';
  if (isVertical) {
    ctx.fillRect(x - 2, y + 8, w + 4, h - 16);
  } else {
    ctx.fillRect(x + 8, y - 2, w - 16, h + 4);
  }

  if (isLoco) {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x, y, w, h);

    if (isVertical) {
      // 垂直火車頭（車頭朝北↑：前方排障器 + 縱向鍋爐 + 銅箍環 + 煙囪 + 南側駕駛室）
      const cabH = h * 0.34;
      ctx.fillStyle = '#7F1D1D';
      ctx.fillRect(x + 3, y + h - cabH, w - 6, cabH - 3);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x + 3, y + h - cabH, w - 6, cabH - 3);

      const boilerY = y + 12;
      const boilerH = h - cabH - 14;
      const grad = ctx.createLinearGradient(x + 8, 0, x + w - 8, 0);
      grad.addColorStop(0, '#334155');
      grad.addColorStop(0.45, '#64748B');
      grad.addColorStop(1, '#0F172A');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 10, boilerY, w - 20, boilerH);
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 10, boilerY, w - 20, boilerH);

      ctx.fillStyle = '#D97706';
      for (let ry = boilerY + 16; ry < boilerY + boilerH - 8; ry += 26) {
        ctx.fillRect(x + 10, ry, w - 20, 4);
      }

      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(x + w / 2, boilerY + 22, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 北側車頭前排障器鋼條
      ctx.fillStyle = '#D97706';
      ctx.fillRect(x + 12, y + 2, w - 24, 8);
    } else {
      // 水平火車頭（朝西排障器 + 黑鐵鍋爐 + 銅箍環 + 煙囪 + 駕駛室頂棚）
      const cabW = w * 0.34;
      ctx.fillStyle = '#7F1D1D';
      ctx.fillRect(x + w - cabW, y + 3, cabW - 3, h - 6);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x + w - cabW, y + 3, cabW - 3, h - 6);

      const boilerX = x + 12;
      const boilerW = w - cabW - 14;
      const grad = ctx.createLinearGradient(0, y + 8, 0, y + h - 8);
      grad.addColorStop(0, '#334155');
      grad.addColorStop(0.45, '#64748B');
      grad.addColorStop(1, '#0F172A');
      ctx.fillStyle = grad;
      ctx.fillRect(boilerX, y + 10, boilerW, h - 20);
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2;
      ctx.strokeRect(boilerX, y + 10, boilerW, h - 20);

      ctx.fillStyle = '#D97706';
      for (let rx = boilerX + 16; rx < boilerX + boilerW - 8; rx += 26) {
        ctx.fillRect(rx, y + 10, 4, h - 20);
      }

      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(boilerX + 22, y + h / 2, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#D97706';
      ctx.fillRect(x + 2, y + 12, 8, h - 24);
    }

    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    return;
  }

  // 木造／鐵皮貨運車廂
  const bodyColor = colorVariant || '#991B1B';
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x, y, w, h);

  if (isVertical) {
    // 上下兩端緩衝連掛鋼座
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 6, y, w - 12, 8);
    ctx.fillRect(x + 6, y + h - 8, w - 12, 8);

    // 車頂木板橫紋
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.lineWidth = 1.6;
    for (let py = y + 14; py < y + h - 10; py += 12) {
      ctx.beginPath();
      ctx.moveTo(x + 4, py);
      ctx.lineTo(x + w - 4, py);
      ctx.stroke();
    }

    // 車頂中央縱向走道木板 (Catwalk)
    ctx.fillStyle = '#D6A15C';
    ctx.fillRect(x + w / 2 - 9, y + 6, 18, h - 12);
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + w / 2 - 9, y + 6, 18, h - 12);
  } else {
    ctx.fillStyle = '#334155';
    ctx.fillRect(x, y + 6, 8, h - 12);
    ctx.fillRect(x + w - 8, y + 6, 8, h - 12);

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.lineWidth = 1.6;
    for (let px = x + 14; px < x + w - 10; px += 12) {
      ctx.beginPath();
      ctx.moveTo(px, y + 4);
      ctx.lineTo(px, y + h - 4);
      ctx.stroke();
    }

    ctx.fillStyle = '#D6A15C';
    ctx.fillRect(x + 6, y + h / 2 - 9, w - 12, 18);
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + 6, y + h / 2 - 9, w - 12, 18);
  }

  // 四角黃銅鉚釘與外鋼框
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x + 3, y + 3, 5, 5);
  ctx.fillRect(x + w - 8, y + 3, 5, 5);
  ctx.fillRect(x + 3, y + h - 8, 5, 5);
  ctx.fillRect(x + w - 8, y + h - 8, 5, 5);

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 1 格河道繪製：邊緣保持透明以自然呈現底層地板色彩，並以濕潤水岸陰影與亮波紋過渡
 */
function drawTransparentWaterTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  gx: number,
  gy: number,
  animTime: number,
  hasN: boolean,
  hasS: boolean,
  hasW: boolean,
  hasE: boolean,
  hasNW: boolean,
  hasNE: boolean,
  hasSW: boolean,
  hasSE: boolean
) {
  const M = 8; // 暴露岸邊留白寬度（透明，直接透出底下草地／沙地／石板色彩）
  const left = hasW ? 0 : M;
  const right = TILE - (hasE ? 0 : M);
  const top = hasN ? 0 : M;
  const bottom = TILE - (hasS ? 0 : M);
  const rw = right - left;
  const rh = bottom - top;
  const rTL = !hasN && !hasW ? 11 : 0;
  const rTR = !hasN && !hasE ? 11 : 0;
  const rBR = !hasS && !hasE ? 11 : 0;
  const rBL = !hasS && !hasW ? 11 : 0;

  const traceWaterPath = (pad: number) => {
    const x0 = tx + Math.max(0, left - pad);
    const y0 = ty + Math.max(0, top - pad);
    const x1 = tx + Math.min(TILE, right + pad);
    const y1 = ty + Math.min(TILE, bottom + pad);
    const rtl = rTL ? rTL + pad : 0;
    const rtr = rTR ? rTR + pad : 0;
    const rbr = rBR ? rBR + pad : 0;
    const rbl = rBL ? rBL + pad : 0;

    ctx.beginPath();
    ctx.moveTo(x0 + rtl, y0);
    ctx.lineTo(x1 - rtr, y0);
    if (rtr) ctx.quadraticCurveTo(x1, y0, x1, y0 + rtr);
    ctx.lineTo(x1, y1 - rbr);
    if (rbr) ctx.quadraticCurveTo(x1, y1, x1 - rbr, y1);
    ctx.lineTo(x0 + rbl, y1);
    if (rbl) ctx.quadraticCurveTo(x0, y1, x0, y1 - rbl);
    ctx.lineTo(x0, y0 + rtl);
    if (rtl) ctx.quadraticCurveTo(x0, y0, x0 + rtl, y0);
    ctx.closePath();
  };

  // 半透明濕潤岸邊暈染（會隨底下沙地／草地自然變深）
  if (!hasN || !hasS || !hasW || !hasE) {
    traceWaterPath(3.5);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fill();
  }

  // 主體水色（裁剪後繪製動態波紋）
  ctx.save();
  traceWaterPath(0);
  ctx.clip();

  ctx.fillStyle = '#5B8296';
  ctx.fillRect(tx, ty, TILE, TILE);
  ctx.fillStyle = '#4E7487';
  ctx.fillRect(tx + ((gx * 13 + gy * 7) % 18) + 4, ty + 8, 12, 6);
  ctx.fillStyle = '#6A92A6';
  ctx.fillRect(tx + ((gx * 9 + gy * 15) % 16) + 12, ty + 27, 14, 5);

  const drift = Math.sin(animTime * 1.6 + gx * 0.7 + gy * 0.4) * 1.6;
  ctx.strokeStyle = 'rgba(203, 228, 240, 0.36)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(tx + 8, ty + 17 + drift);
  ctx.quadraticCurveTo(tx + 24, ty + 14 + drift, tx + 40, ty + 17 + drift);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tx + 10, ty + 35 - drift);
  ctx.quadraticCurveTo(tx + 24, ty + 32 - drift, tx + 38, ty + 35 - drift);
  ctx.stroke();

  // 內岸邊淺白水花細線
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
  ctx.lineWidth = 2;
  traceWaterPath(0);
  ctx.stroke();

  // 內凹轉角岸地透出（當上下左右有水但對角是陸地時）
  const drawInnerLandCorner = (cx: number, cy: number) => {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  if (hasN && hasW && !hasNW) drawInnerLandCorner(tx, ty);
  if (hasN && hasE && !hasNE) drawInnerLandCorner(tx + TILE, ty);
  if (hasS && hasW && !hasSW) drawInnerLandCorner(tx, ty + TILE);
  if (hasS && hasE && !hasSE) drawInnerLandCorner(tx + TILE, ty + TILE);

  ctx.restore();
  void rw;
  void rh;
}

/**
 * 繪製 tile.png 風格木箱（1×1 小箱子 & 2×2 大箱子共用統一橡木框＋縱向木板＋單斜撐）
 */
function drawWoodCrate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isSmall: boolean) {
  const frame = isSmall ? 6 : 10;

  // 外木框底色
  ctx.fillStyle = '#C49047';
  ctx.fillRect(x, y, w, h);

  // 上左亮面 / 下右暗面斜角質感
  ctx.fillStyle = '#E1B56F';
  ctx.fillRect(x, y, w, 3);
  ctx.fillRect(x, y, 3, h);
  ctx.fillStyle = '#7C4F1E';
  ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillRect(x + w - 3, y, 3, h);

  // 內凹垂直木板區
  const ix = x + frame;
  const iy = y + frame;
  const iw = w - frame * 2;
  const ih = h - frame * 2;
  ctx.fillStyle = '#996026';
  ctx.fillRect(ix, iy, iw, ih);

  const plankCount = isSmall ? 4 : 6;
  const pw = iw / plankCount;
  for (let i = 0; i < plankCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#A66B2E' : '#8A521E';
    ctx.fillRect(ix + i * pw, iy, pw - 1, ih);
    ctx.fillStyle = '#54300E';
    ctx.fillRect(ix + (i + 1) * pw - 1, iy, 1.5, ih);
  }

  // 內框陰影
  ctx.strokeStyle = '#4B2A0C';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(ix, iy, iw, ih);

  // 單斜撐木條（\）
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  ctx.strokeStyle = '#4B2A0C';
  ctx.lineWidth = isSmall ? 7 : 12;
  ctx.beginPath();
  ctx.moveTo(ix - 4, iy - 4);
  ctx.lineTo(ix + iw + 4, iy + ih + 4);
  ctx.stroke();

  ctx.strokeStyle = '#C69249';
  ctx.lineWidth = isSmall ? 4.5 : 8.5;
  ctx.beginPath();
  ctx.moveTo(ix - 4, iy - 4);
  ctx.lineTo(ix + iw + 4, iy + ih + 4);
  ctx.stroke();

  ctx.strokeStyle = '#E5BD7B';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(ix - 2, iy - 5);
  ctx.lineTo(ix + iw + 5, iy + ih + 2);
  ctx.stroke();
  ctx.restore();

  // 最外圍實線框與四隅拼接線
  ctx.strokeStyle = '#291707';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 繪製 tile.png 第二行第 1 格（倒角石磚平台）與第 2 格（斜面木板高台）
 */
function drawPlatformTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  style: PlatformStyle,
  tier: number,
  openN: boolean,
  openS: boolean,
  openW: boolean,
  openE: boolean
) {
  if (style === 'shrine_floor' || style === 'wooden_plank') {
    // tile.png 第二行第 2 格：縱向木條地面 + 斜面金棕木邊框
    ctx.fillStyle = '#9D6D34';
    ctx.fillRect(tx, ty, TILE, TILE);
    for (let px = 0; px < TILE; px += 8) {
      ctx.fillStyle = px % 16 === 0 ? '#A9773C' : '#94632C';
      ctx.fillRect(tx + px, ty, 7, TILE);
      ctx.fillStyle = '#6D451B';
      ctx.fillRect(tx + px + 7, ty, 1, TILE);
    }
    const bevel = 10;
    if (openN) {
      ctx.fillStyle = '#7D5120';
      ctx.fillRect(tx, ty, TILE, bevel);
      ctx.fillStyle = '#4B2D0E';
      ctx.fillRect(tx, ty, TILE, 2.5);
    }
    if (openS) {
      ctx.fillStyle = '#875925';
      ctx.fillRect(tx, ty + TILE - bevel, TILE, bevel);
      ctx.fillStyle = '#3B220A';
      ctx.fillRect(tx, ty + TILE - 3, TILE, 3);
    }
    if (openW) {
      ctx.fillStyle = '#734A1C';
      ctx.fillRect(tx, ty, bevel, TILE);
      ctx.fillStyle = '#4B2D0E';
      ctx.fillRect(tx, ty, 2.5, TILE);
    }
    if (openE) {
      ctx.fillStyle = '#875925';
      ctx.fillRect(tx + TILE - bevel, ty, bevel, TILE);
      ctx.fillStyle = '#3B220A';
      ctx.fillRect(tx + TILE - 3, ty, 3, TILE);
    }
    return;
  }

  if (style === 'hill') {
    // tile.png 第二行第 3 格（土丘）：翠綠草地山坡＋有機深棕泥土丘緣
    const grassBase = tier >= 2.0 ? '#65A30D' : '#4D7C0F';
    const grassHighlight = tier >= 2.0 ? '#84CC16' : '#65A30D';
    ctx.fillStyle = grassBase;
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.fillStyle = grassHighlight;
    ctx.fillRect(tx + 8, ty + 9, 4, 2);
    ctx.fillRect(tx + 29, ty + 19, 3, 2);
    ctx.fillRect(tx + 15, ty + 36, 4, 2);
    ctx.fillStyle = '#365314';
    ctx.fillRect(tx + 35, ty + 31, 3, 2);

    // 外露土丘邊緣（有機高低泥塊）
    const drawDirtRim = (rx: number, ry: number, rw: number, rh: number, horizontal: boolean) => {
      ctx.fillStyle = '#5C3C22';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = '#3E2714';
      if (horizontal) {
        for (let sx = rx; sx < rx + rw; sx += 8) {
          ctx.fillRect(sx + 1, ry + 1, 5, rh - 2);
        }
        ctx.fillStyle = '#875E38';
        ctx.fillRect(rx, ry + (rh > 6 ? 1 : 0), rw, 2);
      } else {
        for (let sy = ry; sy < ry + rh; sy += 8) {
          ctx.fillRect(rx + 1, sy + 1, rw - 2, 5);
        }
        ctx.fillStyle = '#875E38';
        ctx.fillRect(rx + 1, ry, 2, rh);
      }
    };

    if (openN) drawDirtRim(tx, ty, TILE, 8, true);
    if (openS) drawDirtRim(tx, ty + TILE - 9, TILE, 9, true);
    if (openW) drawDirtRim(tx, ty, 8, TILE, false);
    if (openE) drawDirtRim(tx + TILE - 9, ty, 9, TILE, false);
    return;
  }

  // tile.png 第二行第 1 格：倒角淺棕石磚平台（castle_dais / pyramid / default）
  const baseStone = style === 'pyramid' ? (tier >= 3.0 ? '#D9C08B' : tier >= 2.0 ? '#C9AD79' : '#B89B67') : '#B2A894';
  const darkStone = style === 'pyramid' ? '#9C7E4C' : '#8A806D';
  const lightStone = style === 'pyramid' ? '#EAD6A6' : '#D5CCB8';

  ctx.fillStyle = baseStone;
  ctx.fillRect(tx, ty, TILE, TILE);

  // 內部交錯石磚縫隙
  ctx.strokeStyle = 'rgba(54, 42, 26, 0.36)';
  ctx.lineWidth = 1.2;
  for (let row = 0; row < 4; row++) {
    const sy = ty + row * 12;
    ctx.beginPath();
    ctx.moveTo(tx, sy);
    ctx.lineTo(tx + TILE, sy);
    ctx.stroke();
    const offset = (row % 2) * 12;
    for (let col = offset; col < TILE; col += 24) {
      ctx.beginPath();
      ctx.moveTo(tx + col, sy);
      ctx.lineTo(tx + col, sy + 12);
      ctx.stroke();
    }
  }

  // 外緣石塊倒角框
  if (openN) {
    ctx.fillStyle = lightStone;
    ctx.fillRect(tx, ty, TILE, 7);
    ctx.fillStyle = darkStone;
    ctx.fillRect(tx, ty, TILE, 2.5);
  }
  if (openS) {
    ctx.fillStyle = darkStone;
    ctx.fillRect(tx, ty + TILE - 8, TILE, 8);
    ctx.fillStyle = '#4A3F31';
    ctx.fillRect(tx, ty + TILE - 2.5, TILE, 2.5);
  }
  if (openW) {
    ctx.fillStyle = lightStone;
    ctx.fillRect(tx, ty, 7, TILE);
    ctx.fillStyle = darkStone;
    ctx.fillRect(tx, ty, 2.5, TILE);
  }
  if (openE) {
    ctx.fillStyle = darkStone;
    ctx.fillRect(tx + TILE - 8, ty, 8, TILE);
    ctx.fillStyle = '#4A3F31';
    ctx.fillRect(tx + TILE - 2.5, ty, 2.5, TILE);
  }
}

/**
 * 繪製 1×1 耕作農田地表物件（空田／紅蘿蔔／小麥／甘藍菜），疊加於所在地形層之上
 */
function drawFarmTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, crop: FarmCropType, gx: number, gy: number) {
  ctx.save();
  // 深棕翻耕田畦底色（保留外側 2px 透出底下地板或草坪）
  ctx.fillStyle = '#5C381B';
  ctx.fillRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
  ctx.strokeStyle = '#3B220E';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx + 2, ty + 2, TILE - 4, TILE - 4);

  // 3 條水平田壟溝紋
  for (let row = 0; row < 3; row++) {
    const ry = ty + 6 + row * 13;
    ctx.fillStyle = '#472912';
    ctx.fillRect(tx + 5, ry, TILE - 10, 7);
    ctx.fillStyle = '#704826';
    ctx.fillRect(tx + 5, ry + 7, TILE - 10, 3);
  }

  if (crop === 'carrot') {
    for (let row = 0; row < 3; row++) {
      const cy = ty + 11 + row * 13;
      for (let col = 0; col < 3; col++) {
        const cx = tx + 11 + col * 13;
        ctx.fillStyle = '#EA580C';
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#16A34A';
        ctx.fillRect(cx - 3.5, cy - 4, 7, 3);
        ctx.fillStyle = '#4ADE80';
        ctx.fillRect(cx - 2, cy - 6, 4, 3);
      }
    }
  } else if (crop === 'wheat') {
    for (let row = 0; row < 3; row++) {
      const cy = ty + 11 + row * 13;
      for (let ox = 8; ox <= 38; ox += 6) {
        const sway = ((gx + gy + ox) % 3) - 1;
        ctx.strokeStyle = '#A16207';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx + ox, cy + 4);
        ctx.lineTo(tx + ox + sway * 1.5, cy - 5);
        ctx.stroke();
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.ellipse(tx + ox + sway * 1.5, cy - 5, 2.2, 3.6, sway * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (crop === 'cabbage') {
    for (const [ox, oy] of [
      [14, 15],
      [34, 15],
      [14, 34],
      [34, 34],
    ] as const) {
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(tx + ox, ty + oy, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(tx + ox, ty + oy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#86EFAC';
      ctx.beginPath();
      ctx.arc(tx + ox - 1.2, ty + oy - 1.2, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 空田土塊質感點綴
    ctx.fillStyle = '#38200D';
    ctx.fillRect(tx + 10 + ((gx * 7) % 12), ty + 11, 4, 2);
    ctx.fillRect(tx + 26, ty + 25 + ((gy * 5) % 8), 5, 2);
    ctx.fillStyle = '#7C512B';
    ctx.fillRect(tx + 18, ty + 36, 4, 2);
  }
  ctx.restore();
}

/**
 * 繪製 1×1（+1.5）或 2×2（+2.0）天然多面岩石（黑石／棕石／白石），邊緣透明不壓死底層地面
 */
function drawBoulderObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, w, h, colorVariant } = obs;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w * 0.45;
  const ry = h * 0.43;

  const palettes: Record<string, { dark: string; mid: string; light: string; hi: string; stroke: string }> = {
    brown: { dark: '#4A2813', mid: '#784421', light: '#A16236', hi: '#C78A5B', stroke: '#271408' },
    white: { dark: '#94A3B8', mid: '#CBD5E1', light: '#E2E8F0', hi: '#F8FAFC', stroke: '#475569' },
    black: { dark: '#1E293B', mid: '#334155', light: '#475569', hi: '#94A3B8', stroke: '#090D16' },
  };
  const pal = palettes[colorVariant || 'black'] || palettes.black;

  const pts: [number, number][] = [
    [cx - rx * 0.62, cy - ry * 0.86],
    [cx + rx * 0.18, cy - ry * 0.96],
    [cx + rx * 0.86, cy - ry * 0.56],
    [cx + rx * 0.98, cy + ry * 0.18],
    [cx + rx * 0.66, cy + ry * 0.88],
    [cx - rx * 0.24, cy + ry * 0.95],
    [cx - rx * 0.88, cy + ry * 0.52],
    [cx - rx * 0.94, cy - ry * 0.22],
  ];

  // 不規則岩石投射陰影
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px + 4, py + 6);
    else ctx.lineTo(px + 4, py + 6);
  });
  ctx.closePath();
  ctx.fill();

  // 主石體輪廓
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = pal.mid;
  ctx.fill();
  ctx.save();
  ctx.clip();

  // 東南陰影坡面
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.1, cy - ry * 0.05);
  ctx.lineTo(cx + rx * 1.1, cy - ry * 0.4);
  ctx.lineTo(cx + rx * 1.1, cy + ry * 1.1);
  ctx.lineTo(cx - rx * 0.5, cy + ry * 1.1);
  ctx.closePath();
  ctx.fill();

  // 西北受光高面
  ctx.fillStyle = pal.light;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.1, cy - ry * 1.1);
  ctx.lineTo(cx + rx * 0.45, cy - ry * 1.1);
  ctx.lineTo(cx + rx * 0.05, cy - ry * 0.05);
  ctx.lineTo(cx - rx * 0.45, cy + ry * 0.2);
  ctx.closePath();
  ctx.fill();

  // 岩頂高光切面
  ctx.fillStyle = pal.hi;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.45, cy - ry * 0.55);
  ctx.lineTo(cx + rx * 0.15, cy - ry * 0.68);
  ctx.lineTo(cx - rx * 0.02, cy - ry * 0.18);
  ctx.lineTo(cx - rx * 0.42, cy - ry * 0.15);
  ctx.closePath();
  ctx.fill();

  // 天然岩石裂紋線
  ctx.strokeStyle = pal.stroke;
  ctx.lineWidth = w > TILE ? 1.8 : 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.45, cy - ry * 0.15);
  ctx.lineTo(cx + rx * 0.02, cy - ry * 0.08);
  ctx.lineTo(cx + rx * 0.42, cy + ry * 0.35);
  ctx.stroke();

  ctx.restore();

  ctx.strokeStyle = pal.stroke;
  ctx.lineWidth = w > TILE ? 2.6 : 2.1;
  ctx.stroke();
  ctx.restore();
}

/**
 * 繪製 1×1 自動連接防護欄杆（高度 1.0：阻擋步行通行，但平地 0.0 子彈與視線可越過，僅對泥坑 -1.0 起遮蔽作用）
 */
function drawRailingTile(ctx: CanvasRenderingContext2D, obs: Obstacle, railingKeys: Set<string>) {
  const gx = Math.round(obs.x / TILE);
  const gy = Math.round(obs.y / TILE);
  const { x, y, w, h } = obs;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const hasN = railingKeys.has(`${gx},${gy - 1}`);
  const hasS = railingKeys.has(`${gx},${gy + 1}`);
  const hasW = railingKeys.has(`${gx - 1},${gy}`);
  const hasE = railingKeys.has(`${gx + 1},${gy}`);
  const isolated = !hasN && !hasS && !hasW && !hasE;

  const drawHBar = (x1: number, x2: number) => {
    const bw = x2 - x1;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(x1, cy + 5, bw, 5);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x1, cy - 5, bw, 10);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(x1, cy - 3.5, bw, 7);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(x1, cy - 2.5, bw, 2.2);
  };

  const drawVBar = (y1: number, y2: number) => {
    const bh = y2 - y1;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(cx + 4, y1, 4, bh);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(cx - 5, y1, 10, bh);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(cx - 3.5, y1, 7, bh);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(cx - 2.5, y1, 2.2, bh);
  };

  const drawPost = (px: number, py: number) => {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(px - 6, py - 6, 12, 12);
    ctx.fillStyle = '#475569';
    ctx.fillRect(px - 4.5, py - 4.5, 9, 9);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(px - 3, py - 3, 4.5, 4.5);
  };

  if (isolated) {
    drawHBar(x + 5, x + w - 5);
    drawPost(x + 9, cy);
    drawPost(x + w - 9, cy);
    return;
  }

  if (hasW) drawHBar(x, cx);
  if (hasE) drawHBar(cx, x + w);
  if (hasN) drawVBar(y, cy);
  if (hasS) drawVBar(cy, y + h);
  drawPost(cx, cy);
}

/**
 * 繪製房屋物件（支援 5 種屋頂樣式與 4 向旋轉：3×2 / 2×3 雙坡屋頂＋兩側窗戶＋玄關）
 */
function drawTileHouse(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, w, h, direction, colorVariant } = obs;
  const isVertical = direction === 'east' || direction === 'west' || h > w;

  interface HouseTheme {
    eave: string;
    window: string;
    base: string;
    litSlope: string;
    darkSlope: string;
    tileLine: string;
    ridge: string;
    ridgeStroke: string;
    door: string;
    doorBorder: string;
    moss?: boolean;
    chimney?: boolean;
  }

  const themes: Record<string, HouseTheme> = {
    edo_wood: {
      eave: '#29150E',
      window: '#FDE047',
      base: '#7F1D1D',
      litSlope: '#991B1B',
      darkSlope: '#6B1414',
      tileLine: '#3B0A0A',
      ridge: '#1E293B',
      ridgeStroke: '#F59E0B',
      door: '#78350F',
      doorBorder: '#FDE68A',
    },
    royal_manor: {
      eave: '#CBD5E1',
      window: '#38BDF8',
      base: '#7C2D12',
      litSlope: '#9F1239',
      darkSlope: '#6D1029',
      tileLine: '#3B0714',
      ridge: '#FACC15',
      ridgeStroke: '#78350F',
      door: '#475569',
      doorBorder: '#FACC15',
    },
    desert_adobe: {
      eave: '#78350F',
      window: '#2DD4BF',
      base: '#B45309',
      litSlope: '#D97706',
      darkSlope: '#92400E',
      tileLine: '#451A03',
      ridge: '#FDE68A',
      ridgeStroke: '#78350F',
      door: '#5C381B',
      doorBorder: '#FBBF24',
    },
    brick_workshop: {
      eave: '#1E293B',
      window: '#FB923C',
      base: '#9A3412',
      litSlope: '#C2410C',
      darkSlope: '#7C2D12',
      tileLine: '#431407',
      ridge: '#64748B',
      ridgeStroke: '#0F172A',
      door: '#334155',
      doorBorder: '#F59E0B',
      chimney: true,
    },
    moss_stone: {
      eave: '#334155',
      window: '#38BDF8',
      base: '#9D7E54',
      litSlope: '#B09064',
      darkSlope: '#7E613B',
      tileLine: '#3E2B16',
      ridge: '#C9A46B',
      ridgeStroke: '#33200E',
      door: '#78350F',
      doorBorder: '#F59E0B',
      moss: true,
    },
  };
  const th = themes[colorVariant || 'moss_stone'] || themes.moss_stone;

  if (isVertical) {
    ctx.fillStyle = th.eave;
    ctx.fillRect(x + 6, y - 2, w - 12, 6);
    ctx.fillRect(x + 6, y + h - 4, w - 12, 6);
    ctx.fillStyle = th.window;
    ctx.fillRect(x + w * 0.34, y - 1, w * 0.32, 4);
    ctx.fillRect(x + w * 0.34, y + h - 3, w * 0.32, 4);

    ctx.fillStyle = th.base;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = th.litSlope;
    ctx.fillRect(x + 2, y + 2, w / 2 - 4, h - 4);
    ctx.fillStyle = th.darkSlope;
    ctx.fillRect(x + w / 2 + 2, y + 2, w / 2 - 4, h - 4);

    ctx.strokeStyle = th.tileLine;
    ctx.lineWidth = 1.6;
    const colW = 14;
    for (let rx = x + colW; rx < x + w; rx += colW) {
      ctx.beginPath();
      ctx.moveTo(rx, y + 3);
      ctx.lineTo(rx, y + h - 3);
      ctx.stroke();
      const colIdx = Math.floor((rx - x) / colW);
      const shift = (colIdx % 2) * 14;
      for (let ry = y + 12 + shift; ry < y + h - 6; ry += 26) {
        ctx.beginPath();
        ctx.moveTo(rx - colW, ry);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }
    }

    if (th.moss) {
      ctx.fillStyle = '#22C55E';
      for (const [ox, oy, rw, rh] of [
        [0.2, 0.22, 6, 10],
        [0.24, 0.65, 5, 11],
        [0.68, 0.35, 6, 10],
        [0.64, 0.75, 5, 9],
      ] as const) {
        ctx.fillRect(x + w * ox, y + h * oy, rw, rh);
      }
    }
    if (th.chimney) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + w * 0.68, y + h * 0.18, 14, 14);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(x + w * 0.68 + 3, y + h * 0.18 + 3, 8, 8);
    }

    ctx.fillStyle = th.ridge;
    ctx.fillRect(x + w / 2 - 4, y + 2, 8, h - 4);
    ctx.strokeStyle = th.ridgeStroke;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x + w / 2 - 4, y + 2, 8, h - 4);

    const doorX = direction === 'west' ? x - 3 : x + w - 5;
    ctx.fillStyle = th.door;
    ctx.fillRect(doorX, y + h * 0.38, 8, h * 0.24);
    ctx.strokeStyle = th.doorBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(doorX, y + h * 0.38, 8, h * 0.24);
  } else {
    ctx.fillStyle = th.eave;
    ctx.fillRect(x - 2, y + 6, 6, h - 12);
    ctx.fillRect(x + w - 4, y + 6, 6, h - 12);
    ctx.fillStyle = th.window;
    ctx.fillRect(x - 1, y + h * 0.34, 4, h * 0.32);
    ctx.fillRect(x + w - 3, y + h * 0.34, 4, h * 0.32);

    ctx.fillStyle = th.base;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = th.litSlope;
    ctx.fillRect(x + 2, y + 2, w - 4, h / 2 - 4);
    ctx.fillStyle = th.darkSlope;
    ctx.fillRect(x + 2, y + h / 2 + 2, w - 4, h / 2 - 4);

    ctx.strokeStyle = th.tileLine;
    ctx.lineWidth = 1.6;
    const rowH = 14;
    for (let ry = y + rowH; ry < y + h; ry += rowH) {
      ctx.beginPath();
      ctx.moveTo(x + 3, ry);
      ctx.lineTo(x + w - 3, ry);
      ctx.stroke();
      const rowIdx = Math.floor((ry - y) / rowH);
      const shift = (rowIdx % 2) * 14;
      for (let rx = x + 12 + shift; rx < x + w - 6; rx += 26) {
        ctx.beginPath();
        ctx.moveTo(rx, ry - rowH);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }
    }

    if (th.moss) {
      ctx.fillStyle = '#22C55E';
      for (const [ox, oy, rw, rh] of [
        [0.24, 0.22, 10, 5],
        [0.64, 0.28, 12, 6],
        [0.42, 0.72, 11, 5],
        [0.75, 0.65, 9, 5],
        [0.16, 0.68, 8, 4],
      ] as const) {
        ctx.fillRect(x + w * ox, y + h * oy, rw, rh);
      }
      ctx.fillStyle = '#15803D';
      ctx.fillRect(x + w * 0.66, y + h * 0.3, 8, 4);
      ctx.fillRect(x + w * 0.44, y + h * 0.74, 7, 3);
    }
    if (th.chimney) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + w * 0.76, y + h * 0.16, 14, 14);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(x + w * 0.76 + 3, y + h * 0.16 + 3, 8, 8);
    }

    ctx.fillStyle = th.ridge;
    ctx.fillRect(x + 2, y + h / 2 - 4, w - 4, 8);
    ctx.strokeStyle = th.ridgeStroke;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x + 2, y + h / 2 - 4, w - 4, 8);

    const doorY = direction === 'north' ? y - 3 : y + h - 5;
    ctx.fillStyle = th.door;
    ctx.fillRect(x + w * 0.38, doorY, w * 0.24, 8);
    ctx.strokeStyle = th.doorBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + w * 0.38, doorY, w * 0.24, 8);
  }

  ctx.strokeStyle = '#1C140D';
  ctx.lineWidth = 3.2;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 繪製 8 鄰接無縫併接石牆（棕褐石／苔綠石／朱紅磚／靛青石），支援內外轉角連貫光影與鄰近木箱自然打燈
 */
function drawSteppedStoneWallTile(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  neighborSet: Set<string>,
  crateTileKeys: Set<string>,
  variant: 'tan' | 'green' | 'red' | 'blue'
) {
  const gx = Math.round(obs.x / TILE);
  const gy = Math.round(obs.y / TILE);
  const hasN = neighborSet.has(`${gx},${gy - 1}`);
  const hasS = neighborSet.has(`${gx},${gy + 1}`);
  const hasW = neighborSet.has(`${gx - 1},${gy}`);
  const hasE = neighborSet.has(`${gx + 1},${gy}`);
  const hasNW = neighborSet.has(`${gx - 1},${gy - 1}`);
  const hasNE = neighborSet.has(`${gx + 1},${gy - 1}`);
  const hasSW = neighborSet.has(`${gx - 1},${gy + 1}`);
  const hasSE = neighborSet.has(`${gx + 1},${gy + 1}`);

  const openN = !hasN;
  const openS = !hasS;
  const openW = !hasW;
  const openE = !hasE;

  const palettes = {
    green: { base: '#6D7F68', mid: '#566851', dark: '#364333', hi: '#A3B89C', litSide: '#8CA485', litEdge: '#C7DBBF' },
    tan: { base: '#82715D', mid: '#665745', dark: '#3E3327', hi: '#B5A38A', litSide: '#A6937A', litEdge: '#DECBA8' },
    red: { base: '#993B3B', mid: '#7C2929', dark: '#4A1515', hi: '#DC7878', litSide: '#B94E4E', litEdge: '#F2A3A3' },
    blue: { base: '#446685', mid: '#344F6A', dark: '#1C2E42', hi: '#85B0D6', litSide: '#5B84AA', litEdge: '#B5D4F0' },
  } as const;
  const { base, mid, dark, hi, litSide, litEdge } = palettes[variant];

  const B1 = 8;
  const B2 = 15;
  const x = obs.x;
  const y = obs.y;
  const w = obs.w;
  const h = obs.h;

  // 1. 外層石緣（連續貫穿所有轉角）
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);

  // 左上方自然斜射高光坡面（N / W 面亮，内凹 NW 轉角同享連貫淺色斜邊）
  ctx.fillStyle = litSide;
  if (openN) ctx.fillRect(x, y, w, B1);
  if (openW) ctx.fillRect(x, y, B1, h);
  if (hasN && hasW && !hasNW) ctx.fillRect(x, y, B1, B1);

  // 鄰近木箱的自然反光打燈：牆對著箱子的那一面自動提亮
  const crateN = openN && crateTileKeys.has(`${gx},${gy - 1}`);
  const crateS = openS && crateTileKeys.has(`${gx},${gy + 1}`);
  const crateW = openW && crateTileKeys.has(`${gx - 1},${gy}`);
  const crateE = openE && crateTileKeys.has(`${gx + 1},${gy}`);

  if (crateN) {
    ctx.fillStyle = litSide;
    ctx.fillRect(x, y, w, B1);
  }
  if (crateS) {
    ctx.fillStyle = litSide;
    ctx.fillRect(x, y + h - B1, w, B1);
  }
  if (crateW) {
    ctx.fillStyle = litSide;
    ctx.fillRect(x, y, B1, h);
  }
  if (crateE) {
    ctx.fillStyle = litSide;
    ctx.fillRect(x + w - B1, y, B1, h);
  }

  // 2. 中層階梯石面（距離任意非牆格 >= B1）
  const mL = openW ? B1 : 0;
  const mR = openE ? B1 : 0;
  const mT = openN ? B1 : 0;
  const mB = openS ? B1 : 0;
  ctx.fillStyle = mid;
  ctx.fillRect(x + mL, y + mT, w - mL - mR, h - mT - mB);

  // 處理內轉角（兩正交鄰格皆為牆、對角為空地時，退回外層淺色，避免出現深色突塊）
  if (hasN && hasW && !hasNW) {
    ctx.fillStyle = litSide;
    ctx.fillRect(x, y, B1, B1);
  }
  if (hasN && hasE && !hasNE) {
    ctx.fillStyle = crateTileKeys.has(`${gx + 1},${gy - 1}`) ? litSide : base;
    ctx.fillRect(x + w - B1, y, B1, B1);
  }
  if (hasS && hasW && !hasSW) {
    ctx.fillStyle = crateTileKeys.has(`${gx - 1},${gy + 1}`) ? litSide : base;
    ctx.fillRect(x, y + h - B1, B1, B1);
  }
  if (hasS && hasE && !hasSE) {
    ctx.fillStyle = crateTileKeys.has(`${gx + 1},${gy + 1}`) ? litSide : base;
    ctx.fillRect(x + w - B1, y + h - B1, B1, B1);
  }

  // 3. 內脊深色石心（距離任意非牆格 >= B2）
  const dL = openW ? B2 : 0;
  const dR = openE ? B2 : 0;
  const dT = openN ? B2 : 0;
  const dB = openS ? B2 : 0;
  if (w - dL - dR > 2 && h - dT - dB > 2) {
    ctx.fillStyle = dark;
    ctx.fillRect(x + dL, y + dT, w - dL - dR, h - dT - dB);
  }

  // 內轉角斜接中階與外階（讓 L / U 轉角兩側石梯連貫轉彎）
  if (hasN && hasW && !hasNW) {
    ctx.fillStyle = mid;
    ctx.fillRect(x, y, B2, B2);
    ctx.fillStyle = litSide;
    ctx.fillRect(x, y, B1, B1);
  }
  if (hasN && hasE && !hasNE) {
    ctx.fillStyle = mid;
    ctx.fillRect(x + w - B2, y, B2, B2);
    ctx.fillStyle = crateTileKeys.has(`${gx + 1},${gy - 1}`) ? litSide : base;
    ctx.fillRect(x + w - B1, y, B1, B1);
  }
  if (hasS && hasW && !hasSW) {
    ctx.fillStyle = mid;
    ctx.fillRect(x, y + h - B2, B2, B2);
    ctx.fillStyle = crateTileKeys.has(`${gx - 1},${gy + 1}`) ? litSide : base;
    ctx.fillRect(x, y + h - B1, B1, B1);
  }
  if (hasS && hasE && !hasSE) {
    ctx.fillStyle = mid;
    ctx.fillRect(x + w - B2, y + h - B2, B2, B2);
    ctx.fillStyle = crateTileKeys.has(`${gx + 1},${gy + 1}`) ? litSide : base;
    ctx.fillRect(x + w - B1, y + h - B1, B1, B1);
  }

  // 4. 牆面砌石接縫紋理
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.5);
  ctx.lineTo(x + w, y + h * 0.5);
  ctx.moveTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.5, y + h);
  ctx.stroke();

  // 5. 暴露緣高光與木箱反射亮線（只畫在與空地／箱子相鄰的外緣，連貫無接縫）
  ctx.fillStyle = hi;
  if (openN) ctx.fillRect(x, y, w, 3);
  if (openW) ctx.fillRect(x, y, 3, h);

  ctx.fillStyle = litEdge;
  if (crateN) ctx.fillRect(x, y, w, 3.5);
  if (crateS) ctx.fillRect(x, y + h - 3.5, w, 3.5);
  if (crateW) ctx.fillRect(x, y, 3.5, h);
  if (crateE) ctx.fillRect(x + w - 3.5, y, 3.5, h);

  ctx.fillStyle = '#1E1B18';
  if (openN) ctx.fillRect(x, y, w, 1.5);
  if (openS) ctx.fillRect(x, y + h - 1.8, w, 1.8);
  if (openW) ctx.fillRect(x, y, 1.5, h);
  if (openE) ctx.fillRect(x + w - 1.8, y, 1.8, h);
}

/**
 * 繪製精細的實戰地形層（可供遊戲主引擎與陣營選圖預覽共同使用）
 */
export function renderMapBaseLayer(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  showSpawnAndPickupMarkers = false,
  animTime = 0
) {
  const pal = getBiomePalette(map.biome);

  // 1. 1×1 可混搭地板層（完全獨立於水域與高台，確保透明岸邊與降層後皆保留底層地板紋理）
  const fallbackFloor = biomeToDefaultFloor(map.biome);
  const railMap = new Map<string, 'horizontal' | 'vertical'>();
  for (const rt of map.railTracks || []) {
    railMap.set(`${rt.gx},${rt.gy}`, rt.orientation);
  }
  for (let gy = 0; gy < map.rows; gy++) {
    for (let gx = 0; gx < map.cols; gx++) {
      const tx = gx * TILE;
      const ty = gy * TILE;
      const cell = map.tileGrid[gy][gx];
      const cellFloor: FloorStyle =
        map.floorGrid?.[gy]?.[gx] ??
        (cell.elev === 0 && cell.style === 'grass_ground' ? 'grass_ground' : fallbackFloor);

      drawFloorStyleTile(ctx, tx, ty, gx, gy, cellFloor);

      if (cell.style === 'rail_track' && !railMap.has(`${gx},${gy}`)) {
        railMap.set(`${gx},${gy}`, 'horizontal');
      }

      if (map.id === 'industrial_warehouse' && gy === 10 && gx % 2 === 0) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.fillRect(tx + 6, ty + TILE / 2 - 2, TILE - 12, 4);
      } else if (map.id === 'european_castle' && gy >= 9 && gy <= 10 && gx >= 2 && gx <= map.cols - 3) {
        ctx.fillStyle = 'rgba(190, 18, 60, 0.32)';
        ctx.fillRect(tx, ty, TILE, TILE);
        if (gy === 9) {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.5)';
          ctx.fillRect(tx, ty, TILE, 4);
        }
        if (gy === 10) {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.5)';
          ctx.fillRect(tx, ty + TILE - 4, TILE, 4);
        }
      }
    }
  }

  // 分層疊加地表物件：石板參道、水域河道（邊緣透明）、跨河木橋、鐵道路軌（皆可置於平地或任何地形層之上）
  const cellElevAt = (gx: number, gy: number) => {
    if (gy < 0 || gy >= map.rows || gx < 0 || gx >= map.cols) return 0;
    return map.tileGrid[gy][gx].elev;
  };

  const drawTierSurfaceOverlays = (tier: number) => {
    // 參道石板
    for (const sr of map.stoneRoads || []) {
      if (Math.abs(cellElevAt(sr.gx, sr.gy) - tier) > 0.01) continue;
      const tx = sr.gx * TILE;
      const ty = sr.gy * TILE;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.24)';
      ctx.fillRect(tx + 5, ty + 5, TILE - 10, TILE - 10);
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(tx + 5, ty + 5, TILE - 10, TILE - 10);
    }

    // 逐格河道繪製：邊緣保持透明以透出底層地板或高台邊緣
    const isWaterOnTier = (gx: number, gy: number) => {
      if (gy < 0 || gy >= map.rows || gx < 0 || gx >= map.cols) return tier === 0;
      return map.waterTileKeys.has(`${gx},${gy}`) && Math.abs(cellElevAt(gx, gy) - tier) <= 0.01;
    };
    for (const wt of map.waterTiles) {
      if (Math.abs(cellElevAt(wt.gx, wt.gy) - tier) > 0.01) continue;
      const tx = wt.gx * TILE;
      const ty = wt.gy * TILE;
      drawTransparentWaterTile(
        ctx,
        tx,
        ty,
        wt.gx,
        wt.gy,
        animTime,
        isWaterOnTier(wt.gx, wt.gy - 1),
        isWaterOnTier(wt.gx, wt.gy + 1),
        isWaterOnTier(wt.gx - 1, wt.gy),
        isWaterOnTier(wt.gx + 1, wt.gy),
        isWaterOnTier(wt.gx - 1, wt.gy - 1),
        isWaterOnTier(wt.gx + 1, wt.gy - 1),
        isWaterOnTier(wt.gx - 1, wt.gy + 1),
        isWaterOnTier(wt.gx + 1, wt.gy + 1)
      );
    }

    // 跨河橋樑（木橋／石橋）
    for (const br of map.bridges) {
      const bgx = Math.floor(br.x / TILE);
      const bgy = Math.floor(br.y / TILE);
      if (Math.abs(cellElevAt(bgx, bgy) - tier) > 0.01) continue;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fillRect(br.x + 4, br.y + 8, br.w, br.h);

      if (br.style === 'stone') {
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(br.x, br.y, br.w, br.h);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.6;
        if (br.orientation === 'horizontal') {
          for (let bx = br.x + 16; bx < br.x + br.w; bx += 16) {
            ctx.beginPath();
            ctx.moveTo(bx, br.y + 5);
            ctx.lineTo(bx, br.y + br.h - 5);
            ctx.stroke();
          }
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(br.x, br.y, br.w, 6);
          ctx.fillRect(br.x, br.y + br.h - 6, br.w, 6);
        } else {
          for (let by = br.y + 16; by < br.y + br.h; by += 16) {
            ctx.beginPath();
            ctx.moveTo(br.x + 5, by);
            ctx.lineTo(br.x + br.w - 5, by);
            ctx.stroke();
          }
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(br.x, br.y, 6, br.h);
          ctx.fillRect(br.x + br.w - 6, br.y, 6, br.h);
        }
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(br.x, br.y, br.w, br.h);
      } else {
        ctx.fillStyle = '#A66E38';
        ctx.fillRect(br.x, br.y, br.w, br.h);
        ctx.strokeStyle = '#5C3A21';
        ctx.lineWidth = 2;
        if (br.orientation === 'horizontal') {
          for (let bx = br.x + 12; bx < br.x + br.w; bx += 12) {
            ctx.beginPath();
            ctx.moveTo(bx, br.y + 4);
            ctx.lineTo(bx, br.y + br.h - 4);
            ctx.stroke();
          }
          ctx.fillStyle = '#E0B475';
          ctx.fillRect(br.x, br.y, br.w, 6);
          ctx.fillRect(br.x, br.y + br.h - 6, br.w, 6);
        } else {
          for (let by = br.y + 12; by < br.y + br.h; by += 12) {
            ctx.beginPath();
            ctx.moveTo(br.x + 4, by);
            ctx.lineTo(br.x + br.w - 4, by);
            ctx.stroke();
          }
          ctx.fillStyle = '#E0B475';
          ctx.fillRect(br.x, br.y, 6, br.h);
          ctx.fillRect(br.x + br.w - 6, br.y, 6, br.h);
        }
        ctx.strokeStyle = '#3B2313';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(br.x, br.y, br.w, br.h);
      }
    }

    // 鐵道路軌物件（支援同層水平、垂直、轉角與分叉）
    const railAtSameTier = (gx: number, gy: number) => {
      if (gy < 0 || gy >= map.rows || gx < 0 || gx >= map.cols) return null;
      if (Math.abs(cellElevAt(gx, gy) - tier) > 0.01) return null;
      return railMap.get(`${gx},${gy}`) ?? null;
    };
    for (const [key, axis] of railMap.entries()) {
      const [gxStr, gyStr] = key.split(',');
      const gx = Number(gxStr);
      const gy = Number(gyStr);
      if (Math.abs(cellElevAt(gx, gy) - tier) > 0.01) continue;
      drawRailTrackObjectTile(
        ctx,
        gx * TILE,
        gy * TILE,
        gx,
        gy,
        axis,
        railAtSameTier(gx, gy - 1),
        railAtSameTier(gx, gy + 1),
        railAtSameTier(gx - 1, gy),
        railAtSameTier(gx + 1, gy)
      );
    }

    // 耕作農田地表物件（疊加於所在地形層之上）
    for (const ft of map.farmTiles || []) {
      if (Math.abs(cellElevAt(ft.gx, ft.gy) - tier) > 0.01) continue;
      drawFarmTile(ctx, ft.gx * TILE, ft.gy * TILE, ft.crop, ft.gx, ft.gy);
    }
  };

  drawTierSurfaceOverlays(0);

  // 1b. 負層下陷地形（泥坑窪地 -1.0, -2.0...：由淺到深繪製凹陷泥地＋崖緣陰影，並疊加該層物件）
  const negTierSet = new Set<number>();
  for (let gy = 0; gy < map.rows; gy++) {
    for (let gx = 0; gx < map.cols; gx++) {
      const e = map.tileGrid[gy][gx].elev;
      if (e <= -1.0) negTierSet.add(Math.round(e * 10) / 10);
    }
  }
  const negTiers = Array.from(negTierSet).sort((a, b) => b - a);
  for (const tier of negTiers) {
    const deepMud = tier <= -2.0;
    for (let gy = 0; gy < map.rows; gy++) {
      for (let gx = 0; gx < map.cols; gx++) {
        const cell = map.tileGrid[gy][gx];
        if (Math.abs(cell.elev - tier) > 0.01) continue;
        const tx = gx * TILE;
        const ty = gy * TILE;

        ctx.fillStyle = deepMud ? '#3D2816' : '#573B23';
        ctx.fillRect(tx, ty, TILE, TILE);
        ctx.fillStyle = deepMud ? '#2D1D0F' : '#452E1A';
        ctx.fillRect(tx + ((gx * 11 + gy * 7) % 16) + 5, ty + 8, 12, 7);
        ctx.fillRect(tx + ((gx * 7 + gy * 13) % 14) + 18, ty + 28, 10, 6);
        ctx.fillStyle = deepMud ? '#523720' : '#6F4E30';
        ctx.fillRect(tx + 12, ty + 20, 5, 3);
        ctx.fillRect(tx + 31, ty + 14, 4, 3);

        const wallN = cellElevAt(gx, gy - 1) > cell.elev + 0.01;
        const wallS = cellElevAt(gx, gy + 1) > cell.elev + 0.01;
        const wallW = cellElevAt(gx - 1, gy) > cell.elev + 0.01;
        const wallE = cellElevAt(gx + 1, gy) > cell.elev + 0.01;

        if (wallN) {
          ctx.fillStyle = '#2B1B0E';
          ctx.fillRect(tx, ty, TILE, 8);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
          ctx.fillRect(tx, ty + 8, TILE, 7);
        }
        if (wallW) {
          ctx.fillStyle = '#332112';
          ctx.fillRect(tx, ty, 6, TILE);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.fillRect(tx + 6, ty, 5, TILE);
        }
        if (wallS) {
          ctx.fillStyle = '#7A5736';
          ctx.fillRect(tx, ty + TILE - 5, TILE, 5);
          ctx.fillStyle = '#26170C';
          ctx.fillRect(tx, ty + TILE - 2, TILE, 2);
        }
        if (wallE) {
          ctx.fillStyle = '#6B4B2E';
          ctx.fillRect(tx + TILE - 5, ty, 5, TILE);
          ctx.fillStyle = '#26170C';
          ctx.fillRect(tx + TILE - 2, ty, 2, TILE);
        }
      }
    }
    drawTierSurfaceOverlays(tier);
  }

  // 2. 逐格多層高台繪製（支援任意高度 >= 1.0 依鄰格自動拼合邊緣，並依層疊加該層水面／橋樑／路軌／參道）
  const hasTier = (gx: number, gy: number, tier: number) => {
    if (gy < 0 || gy >= map.rows || gx < 0 || gx >= map.cols) return false;
    return map.tileGrid[gy][gx].elev >= tier;
  };

  const tierSet = new Set<number>();
  for (let gy = 0; gy < map.rows; gy++) {
    for (let gx = 0; gx < map.cols; gx++) {
      const e = map.tileGrid[gy][gx].elev;
      if (e >= 1.0) tierSet.add(Math.round(e * 10) / 10);
    }
  }
  const tiers = Array.from(tierSet).sort((a, b) => a - b);

  for (const tier of tiers) {
    const shadowDepth = 5 + tier * 4;
    ctx.fillStyle = 'rgba(9, 10, 13, 0.5)';
    for (let gy = 0; gy < map.rows; gy++) {
      for (let gx = 0; gx < map.cols; gx++) {
        if (!hasTier(gx, gy, tier)) continue;
        const tx = gx * TILE;
        const ty = gy * TILE;
        if (!hasTier(gx, gy + 1, tier)) {
          ctx.fillRect(tx - 2, ty + TILE, TILE + 4, shadowDepth);
        }
        if (!hasTier(gx + 1, gy, tier)) {
          ctx.fillRect(tx + TILE, ty + 2, 5, TILE - 2);
        }
      }
    }

    for (let gy = 0; gy < map.rows; gy++) {
      for (let gx = 0; gx < map.cols; gx++) {
        const cell = map.tileGrid[gy][gx];
        if (Math.abs(cell.elev - tier) > 0.01) continue;

        const tx = gx * TILE;
        const ty = gy * TILE;
        const openN = !hasTier(gx, gy - 1, tier);
        const openS = !hasTier(gx, gy + 1, tier);
        const openW = !hasTier(gx - 1, gy, tier);
        const openE = !hasTier(gx + 1, gy, tier);

        drawPlatformTile(ctx, tx, ty, cell.style, tier, openN, openS, openW, openE);
      }
    }

    drawTierSurfaceOverlays(tier);
  }

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, map.width, map.height);

  // 3. 梯級 (所在層 +0.5) — 平滑自然土坡、泥坑泥坡、切石石階、木板神社階梯與木條踏台
  const sortedStairs = [...map.stairs].sort((a, b) => a.elevation - b.elevation);
  for (const st of sortedStairs) {
    if (st.style === 'hill') {
      // 平滑自然土坡（無生硬階級橫線）：從高地翠綠草緣柔和漸層銜接泥土坡面與碎石點綴
      const dir = st.direction;
      const isHoriz = dir === 'east' || dir === 'west';

      const gx0 = isHoriz ? (dir === 'east' ? st.x + st.w : st.x) : st.x;
      const gy0 = isHoriz ? st.y : dir === 'south' ? st.y + st.h : st.y;
      const gx1 = isHoriz ? (dir === 'east' ? st.x : st.x + st.w) : st.x;
      const gy1 = isHoriz ? st.y : dir === 'south' ? st.y : st.y + st.h;

      const slopeGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      slopeGrad.addColorStop(0, st.elevation >= 1.5 ? '#65A30D' : '#4D7C0F');
      slopeGrad.addColorStop(0.28, '#7A6B22');
      slopeGrad.addColorStop(0.68, '#876037');
      slopeGrad.addColorStop(1, '#634323');
      ctx.fillStyle = slopeGrad;
      ctx.fillRect(st.x, st.y, st.w, st.h);

      // 兩側自然山坡土坎與草芽（無水平/垂直樓梯橫條）
      if (isHoriz) {
        ctx.fillStyle = '#4B3018';
        ctx.fillRect(st.x, st.y, st.w, 4);
        ctx.fillRect(st.x, st.y + st.h - 4, st.w, 4);
        ctx.fillStyle = '#365314';
        ctx.fillRect(st.x + 8, st.y + 1, 8, 2.5);
        ctx.fillRect(st.x + st.w - 16, st.y + st.h - 3.5, 9, 2.5);
      } else {
        ctx.fillStyle = '#4B3018';
        ctx.fillRect(st.x, st.y, 4, st.h);
        ctx.fillRect(st.x + st.w - 4, st.y, 4, st.h);
        ctx.fillStyle = '#365314';
        ctx.fillRect(st.x + 1, st.y + 8, 2.5, 8);
        ctx.fillRect(st.x + st.w - 3.5, st.y + st.h - 16, 2.5, 9);
      }

      // 柔和坡面小碎石與土色微粒
      ctx.fillStyle = 'rgba(214, 180, 130, 0.36)';
      ctx.fillRect(st.x + st.w * 0.25, st.y + st.h * 0.28, 3, 2);
      ctx.fillRect(st.x + st.w * 0.68, st.y + st.h * 0.62, 3, 2);
      ctx.fillStyle = 'rgba(62, 38, 18, 0.36)';
      ctx.fillRect(st.x + st.w * 0.48, st.y + st.h * 0.48, 3, 2);
      ctx.fillRect(st.x + st.w * 0.34, st.y + st.h * 0.72, 2.5, 2);
      continue;
    }

    if (st.style === 'mud_pit') {
      // 平滑泥坑斜坡（無木板階條，自然從低泥坑過渡至上坡泥面）
      const dir = st.direction;
      const isHoriz = dir === 'east' || dir === 'west';
      const gx0 = isHoriz ? (dir === 'east' ? st.x + st.w : st.x) : st.x;
      const gy0 = isHoriz ? st.y : dir === 'south' ? st.y + st.h : st.y;
      const gx1 = isHoriz ? (dir === 'east' ? st.x : st.x + st.w) : st.x;
      const gy1 = isHoriz ? st.y : dir === 'south' ? st.y : st.y + st.h;

      const mudGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      mudGrad.addColorStop(0, '#926840');
      mudGrad.addColorStop(0.5, '#6C4A2B');
      mudGrad.addColorStop(1, '#3D2715');
      ctx.fillStyle = mudGrad;
      ctx.fillRect(st.x, st.y, st.w, st.h);

      if (isHoriz) {
        ctx.fillStyle = '#2B1B0E';
        ctx.fillRect(st.x, st.y, st.w, 4);
        ctx.fillRect(st.x, st.y + st.h - 4, st.w, 4);
      } else {
        ctx.fillStyle = '#2B1B0E';
        ctx.fillRect(st.x, st.y, 4, st.h);
        ctx.fillRect(st.x + st.w - 4, st.y, 4, st.h);
      }
      ctx.fillStyle = 'rgba(205, 165, 118, 0.28)';
      ctx.fillRect(st.x + st.w * 0.3, st.y + st.h * 0.35, 3, 2);
      ctx.fillRect(st.x + st.w * 0.62, st.y + st.h * 0.65, 4, 2);
      continue;
    }

    // 切石石階 / 木板神社階梯 / 木條踏台階梯
    const isStoneStair = st.style === 'pyramid' || st.style === 'castle_dais';
    const isShrineWoodStair = st.style === 'shrine_floor' || st.style === 'wooden_plank';
    ctx.fillStyle = isStoneStair ? '#78716C' : isShrineWoodStair ? '#7D5120' : '#4E3119';
    ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.strokeStyle = isShrineWoodStair ? '#3B220A' : '#1E1107';
    ctx.lineWidth = 2;
    ctx.strokeRect(st.x, st.y, st.w, st.h);

    const stepHi = isStoneStair ? '#E7E5E4' : isShrineWoodStair ? '#DCA866' : '#D4A362';
    const stepBase = isStoneStair ? '#A8A29E' : isShrineWoodStair ? '#B27C3D' : '#B8874A';
    if (st.direction === 'east' || st.direction === 'west') {
      const steps = Math.max(3, Math.floor((st.w - 8) / 9));
      for (let i = 0; i < steps; i++) {
        const sx = st.x + 5 + i * 9;
        const t = st.direction === 'east' ? i / Math.max(1, steps - 1) : 1 - i / Math.max(1, steps - 1);
        ctx.fillStyle = isShrineWoodStair ? '#4B2D0E' : '#231409';
        ctx.fillRect(sx + 2, st.y + 4, 6, st.h - 8);
        ctx.fillStyle = t > 0.55 ? stepHi : stepBase;
        ctx.fillRect(sx, st.y + 3, 5, st.h - 7);
      }
      ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
      ctx.fillRect(st.direction === 'east' ? st.x + st.w - 4 : st.x + 1, st.y + 3, 3, st.h - 6);
    } else {
      const steps = Math.max(3, Math.floor((st.h - 8) / 9));
      for (let i = 0; i < steps; i++) {
        const sy = st.y + 5 + i * 9;
        const t = st.direction === 'south' ? i / Math.max(1, steps - 1) : 1 - i / Math.max(1, steps - 1);
        ctx.fillStyle = isShrineWoodStair ? '#4B2D0E' : '#231409';
        ctx.fillRect(st.x + 4, sy + 2, st.w - 8, 6);
        ctx.fillStyle = t > 0.55 ? stepHi : stepBase;
        ctx.fillRect(st.x + 3, sy, st.w - 7, 5);
      }
      ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
      ctx.fillRect(st.x + 3, st.direction === 'south' ? st.y + st.h - 4 : st.y + 1, st.w - 6, 3);
    }
  }

  // 4. 草叢 (1×1)
  for (const bush of map.bushes) {
    const cx = bush.x + bush.w / 2;
    const cy = bush.y + bush.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(2, 4, 20, 0, Math.PI * 2);
    ctx.fill();
    for (const cl of [
      { ox: 0, oy: 0, r: 18, c: pal.bush[0] },
      { ox: -7, oy: -5, r: 12, c: pal.bush[1] },
      { ox: 7, oy: 4, r: 11, c: pal.bush[2] },
      { ox: -3, oy: 7, r: 9, c: pal.bush[1] },
    ]) {
      ctx.beginPath();
      ctx.arc(cl.ox, cl.oy, cl.r, 0, Math.PI * 2);
      ctx.fillStyle = cl.c;
      ctx.fill();
    }
    ctx.restore();
  }

  // 5. 樹幹 (1×1)
  for (const tree of map.trees) {
    const tx = tree.x + tree.w / 2;
    const ty = tree.y + tree.h / 2;
    ctx.fillStyle = pal.trunk;
    ctx.beginPath();
    ctx.arc(tx, ty, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 預先建立接壤石牆、欄杆與木箱索引集合（無縫轉角＋木箱對面自然光影）
  const tanWallKeys = new Set<string>();
  const greenWallKeys = new Set<string>();
  const redWallKeys = new Set<string>();
  const blueWallKeys = new Set<string>();
  const railingKeys = new Set<string>();
  const crateTileKeys = new Set<string>();
  for (const obs of map.obstacles) {
    if (obs.style === 'stone_wall_tan') {
      tanWallKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
    } else if (obs.style === 'stone_wall_green') {
      greenWallKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
    } else if (obs.style === 'stone_wall_red') {
      redWallKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
    } else if (obs.style === 'stone_wall_blue') {
      blueWallKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
    } else if (obs.style === 'railing') {
      railingKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
    } else if (obs.kind === 'crate') {
      const gx0 = Math.round(obs.x / TILE);
      const gy0 = Math.round(obs.y / TILE);
      const gw = Math.max(1, Math.round(obs.w / TILE));
      const gh = Math.max(1, Math.round(obs.h / TILE));
      for (let cy = gy0; cy < gy0 + gh; cy++) {
        for (let cx = gx0; cx < gx0 + gw; cx++) {
          crateTileKeys.add(`${cx},${cy}`);
        }
      }
    }
  }

  // 6a. 統一預繪地面投影（先於所有障礙物繪製，避免牆體之間互相疊出奇怪內陰影；竹林／欄杆／石塊改以各自形狀細投影透出底層地形）
  const sortedObs = [...map.obstacles].sort((a, b) => a.elevation - b.elevation);
  for (const obs of sortedObs) {
    if (obs.style === 'bamboo' || obs.style === 'railing' || obs.style === 'rock_small' || obs.style === 'rock_large') {
      continue;
    }
    const shOff = obs.elevation >= 2.0 ? 9 : obs.elevation >= 1.5 ? 7 : 4;
    ctx.fillStyle = obs.elevation >= 2.0 ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.34)';
    ctx.fillRect(obs.x + shOff * 0.65, obs.y + shOff, obs.w, obs.h);
  }

  // 6b. 障礙物與箱體本體（依高度由低到高繪製：1.0小箱／欄杆 -> 1.5大箱／小石 -> 2.0貨櫃／車廂／大岩 -> 10牆柱／房屋／竹林）
  for (const obs of sortedObs) {
    if (obs.kind === 'crate') {
      if (obs.style === 'railing') {
        drawRailingTile(ctx, obs, railingKeys);
      } else if (obs.style === 'rock_small' || obs.style === 'rock_large') {
        drawBoulderObstacle(ctx, obs);
      } else if (obs.style === 'container') {
        const baseColor = obs.colorVariant || '#0284C7';
        ctx.fillStyle = baseColor;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        const isHorizontal = obs.w >= obs.h;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.lineWidth = 2.2;
        if (isHorizontal) {
          for (let sx = obs.x + 12; sx < obs.x + obs.w - 10; sx += 11) {
            ctx.beginPath();
            ctx.moveTo(sx, obs.y + 6);
            ctx.lineTo(sx, obs.y + obs.h - 6);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
          ctx.fillRect(obs.x + obs.w - 14, obs.y + 4, 10, obs.h - 8);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(obs.x + obs.w - 10, obs.y + 10, 3, obs.h - 20);
        } else {
          for (let sy = obs.y + 12; sy < obs.y + obs.h - 10; sy += 11) {
            ctx.beginPath();
            ctx.moveTo(obs.x + 6, sy);
            ctx.lineTo(obs.x + obs.w - 6, sy);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
          ctx.fillRect(obs.x + 4, obs.y + obs.h - 14, obs.w - 8, 10);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(obs.x + 10, obs.y + obs.h - 10, obs.w - 20, 3);
        }

        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(obs.x + 3, obs.y + 3, 7, 7);
        ctx.fillRect(obs.x + obs.w - 10, obs.y + 3, 7, 7);
        ctx.fillRect(obs.x + 3, obs.y + obs.h - 10, 7, 7);
        ctx.fillRect(obs.x + obs.w - 10, obs.y + obs.h - 10, 7, 7);
      } else if (obs.style === 'train_car') {
        drawTrainCar(ctx, obs);
      } else if (obs.style === 'small_crate') {
        drawWoodCrate(ctx, obs.x, obs.y, obs.w, obs.h, true);
      } else {
        drawWoodCrate(ctx, obs.x, obs.y, obs.w, obs.h, false);
      }
    } else if (obs.style === 'bamboo') {
      drawBambooTile(ctx, obs);
    } else if (obs.style === 'house') {
      drawTileHouse(ctx, obs);
    } else if (obs.style === 'stone_wall_tan') {
      drawSteppedStoneWallTile(ctx, obs, tanWallKeys, crateTileKeys, 'tan');
    } else if (obs.style === 'stone_wall_green') {
      drawSteppedStoneWallTile(ctx, obs, greenWallKeys, crateTileKeys, 'green');
    } else if (obs.style === 'stone_wall_red') {
      drawSteppedStoneWallTile(ctx, obs, redWallKeys, crateTileKeys, 'red');
    } else if (obs.style === 'stone_wall_blue') {
      drawSteppedStoneWallTile(ctx, obs, blueWallKeys, crateTileKeys, 'blue');
    } else if (obs.style === 'shrine_wall') {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.fillStyle = '#92400E';
      ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, obs.h - 8);

      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 1.6;
      for (let wx = obs.x + 11; wx < obs.x + obs.w - 4; wx += 9) {
        ctx.beginPath();
        ctx.moveTo(wx, obs.y + 5);
        ctx.lineTo(wx, obs.y + obs.h - 5);
        ctx.stroke();
      }

      ctx.fillStyle = '#B45309';
      ctx.fillRect(obs.x + 6, obs.y + obs.h / 2 - 4, obs.w - 12, 8);
      ctx.strokeStyle = '#FDE68A';
      ctx.lineWidth = 1;
      ctx.strokeRect(obs.x + 6, obs.y + obs.h / 2 - 4, obs.w - 12, 8);

      ctx.fillStyle = '#451A03';
      ctx.fillRect(obs.x + 2, obs.y + 2, 8, 8);
      ctx.fillRect(obs.x + obs.w - 10, obs.y + 2, 8, 8);
      ctx.fillRect(obs.x + 2, obs.y + obs.h - 10, 8, 8);
      ctx.fillRect(obs.x + obs.w - 10, obs.y + obs.h - 10, 8, 8);

      ctx.strokeStyle = '#290F02';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    } else if (obs.style === 'castle_pillar') {
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      const r = Math.min(obs.w, obs.h) * 0.4;

      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(obs.x + 3, obs.y + 3, obs.w - 6, obs.h - 6);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x + 3, obs.y + 3, obs.w - 6, obs.h - 6);

      ctx.strokeStyle = '#EAB308';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(obs.x + 6, obs.y + 6, obs.w - 12, obs.h - 12);

      const colGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
      colGrad.addColorStop(0, '#F8FAFC');
      colGrad.addColorStop(0.65, '#CBD5E1');
      colGrad.addColorStop(1, '#475569');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = colGrad;
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.34, cy);
      ctx.lineTo(cx + r * 0.34, cy);
      ctx.moveTo(cx, cy - r * 0.34);
      ctx.lineTo(cx, cy + r * 0.34);
      ctx.stroke();
    } else if (obs.style === 'obelisk') {
      ctx.fillStyle = '#B45309';
      ctx.fillRect(obs.x + 2, obs.y + 2, obs.w - 4, obs.h - 4);
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(obs.x + 2, obs.y + 2, obs.w - 4, obs.h - 4);
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, Math.min(obs.w, obs.h) * 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawSteppedStoneWallTile(ctx, obs, greenWallKeys, crateTileKeys, 'green');
    }
  }

  // 預覽圖只保留地圖地形與三大陣營出生點，不繪製武器/彈匣/盾牌圖示，且顏色與圖例完全對齊
  if (showSpawnAndPickupMarkers) {
    const spawnColors: Record<'royal' | 'shadow' | 'mercenary', string> = {
      royal: '#38BDF8',
      shadow: '#C026D3',
      mercenary: '#FBBF24',
    };
    (['royal', 'shadow', 'mercenary'] as const).forEach((fac) => {
      for (const sp of map.factionSpawns[fac]) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 17, 0, Math.PI * 2);
        ctx.fillStyle = spawnColors[fac];
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });
    renderMapCanopies(ctx, map);
  }
}

const LEAF_OFFSETS: readonly [number, number, number, number][] = [
  [-0.55, -0.35, 0.34, 0],
  [0.48, -0.42, 0.36, 0],
  [-0.45, 0.44, 0.36, 0],
  [0.52, 0.38, 0.33, 0],
  [0, -0.62, 0.32, 1],
  [-0.64, 0.04, 0.31, 1],
  [0.64, -0.02, 0.3, 1],
  [0.06, 0.58, 0.32, 1],
  [-0.24, -0.26, 0.3, 2],
  [0.24, -0.18, 0.28, 2],
  [-0.18, 0.22, 0.29, 2],
  [0.26, 0.24, 0.27, 2],
  [-0.1, -0.36, 0.2, 3],
  [0.22, -0.04, 0.19, 3],
  [-0.26, 0.08, 0.18, 3],
  [0.04, 0.2, 0.18, 3],
];

export function renderMapCanopies(
  ctx: CanvasRenderingContext2D,
  map: ArenaMap,
  playerPos?: { x: number; y: number; radius: number }
) {
  for (const tree of map.trees) {
    const tx = tree.x + tree.w / 2;
    const ty = tree.y + tree.h / 2;
    const playerUnder = playerPos
      ? Math.hypot(playerPos.x - tx, playerPos.y - ty) < tree.canopyRadius + playerPos.radius
      : false;
    const pal = tree.foliagePalette || ['#14532D', '#166534', '#15803D', '#4ADE80'];
    const cr = tree.canopyRadius;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.globalAlpha = playerUnder ? 0.56 : 0.96;

    // 樹冠投影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.arc(5, 7, cr * 0.95, 0, Math.PI * 2);
    ctx.fill();

    // 底層濃密陰影葉叢
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.arc(0, 0, cr * 0.88, 0, Math.PI * 2);
    ctx.fill();

    // 逐簇葉片細節（對應 tile.png 茂密叢葉質感）
    for (let i = 0; i < LEAF_OFFSETS.length; i++) {
      const [ox, oy, radFrac, colorIdx] = LEAF_OFFSETS[i];
      ctx.beginPath();
      ctx.arc(ox * cr, oy * cr, radFrac * cr, 0, Math.PI * 2);
      ctx.fillStyle = pal[colorIdx];
      ctx.fill();
    }

    // 零星高光葉尖點綴
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    for (const [lx, ly] of [
      [-0.32, -0.34],
      [0.14, -0.44],
      [-0.08, 0.04],
      [0.34, 0.14],
      [-0.42, 0.2],
    ] as const) {
      ctx.fillRect(lx * cr, ly * cr, 4, 3);
    }

    ctx.restore();
  }
}

export type HelpCatalogVisualId =
  | 'floor_shrine_dirt'
  | 'floor_bamboo_moss'
  | 'floor_desert_sand'
  | 'floor_castle_stone'
  | 'floor_warehouse_steel'
  | 'terrain_flat'
  | 'terrain_grass'
  | 'terrain_river'
  | 'terrain_hill'
  | 'terrain_hill_stair'
  | 'terrain_platform'
  | 'terrain_platform_stair'
  | 'terrain_plank'
  | 'terrain_plank_stair'
  | 'terrain_mud'
  | 'terrain_mud_stair'
  | 'object_bridge'
  | 'object_stone_bridge'
  | 'object_stone_road'
  | 'object_rail'
  | 'object_railing'
  | 'object_farm'
  | 'object_stair_crate'
  | 'object_small_crate'
  | 'object_big_crate'
  | 'object_rock_small'
  | 'object_rock_large'
  | 'object_container'
  | 'object_train_car'
  | 'object_stone_wall'
  | 'object_stone_wall_green'
  | 'object_stone_wall_red'
  | 'object_stone_wall_blue'
  | 'object_shrine_wall'
  | 'object_castle_pillar'
  | 'object_house'
  | 'object_bamboo'
  | 'object_bush'
  | 'object_tree';

function createMiniArenaMap(
  cols: number,
  rows: number,
  biome: ArenaMap['biome']
): ArenaMap {
  const tileGrid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ elev: 0, style: 'default' as PlatformStyle }))
  );
  return {
    id: 'tokyo_shrine',
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    biome,
    name: 'preview',
    floorGrid: createFloorGrid(cols, rows, biomeToDefaultFloor(biome)),
    tileGrid,
    stairs: [],
    waterTiles: [],
    waterTileKeys: new Set<string>(),
    bridges: [],
    stoneRoads: [],
    railTracks: [],
    farmTiles: [],
    obstacles: [],
    bushes: [],
    trees: [],
    weaponSpawns: [],
    ammoSpawns: [],
    shieldSpawns: [],
    factionSpawns: { royal: [], shadow: [], mercenary: [] },
  };
}

/**
 * 供 Help 百科「地形／物件 Debug 圖鑑」與編輯器工具欄使用的實戰同源 Canvas 預覽繪製器：
 * 直接呼叫主渲染管線（地板層 -> 負層／高台層 -> 物件層 -> 樹冠層），確保圖鑑與實戰畫面完全一致。
 */
export function renderHelpPreview(
  ctx: CanvasRenderingContext2D,
  visualId: HelpCatalogVisualId,
  width: number,
  height: number
) {
  let map: ArenaMap;
  let drawCanopy = false;

  switch (visualId) {
    case 'floor_shrine_dirt': {
      map = createMiniArenaMap(3, 2, 'shrine_outdoor');
      break;
    }
    case 'floor_bamboo_moss': {
      map = createMiniArenaMap(3, 2, 'bamboo_outdoor');
      break;
    }
    case 'floor_desert_sand':
    case 'terrain_flat': {
      map = createMiniArenaMap(3, 2, 'desert_outdoor');
      break;
    }
    case 'floor_castle_stone': {
      map = createMiniArenaMap(3, 2, 'castle_indoor');
      break;
    }
    case 'floor_warehouse_steel': {
      map = createMiniArenaMap(3, 2, 'warehouse_indoor');
      break;
    }
    case 'terrain_grass': {
      map = createMiniArenaMap(3, 2, 'shrine_outdoor');
      map.floorGrid = createFloorGrid(3, 2, 'grass_ground');
      break;
    }
    case 'terrain_river': {
      map = createMiniArenaMap(4, 3, 'desert_outdoor');
      for (let gy = 0; gy < 3; gy++) {
        map.floorGrid![gy][0] = 'grass_ground';
        map.floorGrid![gy][1] = 'grass_ground';
        for (let gx = 1; gx <= 2; gx++) {
          map.waterTiles.push({ gx, gy });
          map.waterTileKeys.add(`${gx},${gy}`);
        }
      }
      break;
    }
    case 'terrain_hill': {
      // 3×3 的 1.0 土丘高地，正中間 1 格為 2.0 層
      map = createMiniArenaMap(5, 5, 'bamboo_outdoor');
      for (let gy = 1; gy <= 3; gy++) {
        for (let gx = 1; gx <= 3; gx++) map.tileGrid[gy][gx] = { elev: 1.0, style: 'hill' };
      }
      map.tileGrid[2][2] = { elev: 2.0, style: 'hill' };
      break;
    }
    case 'terrain_hill_stair': {
      // 2×1：左格階梯，右格高台
      map = createMiniArenaMap(2, 1, 'bamboo_outdoor');
      map.tileGrid[0][1] = { elev: 1.0, style: 'hill' };
      map.stairs.push({ x: 0, y: 0, w: TILE, h: TILE, elevation: 0.5, direction: 'east', style: 'hill' });
      break;
    }
    case 'terrain_platform': {
      // 3×3 的 1.0 切石高台，正中間 1 格為 2.0 層
      map = createMiniArenaMap(5, 5, 'desert_outdoor');
      for (let gy = 1; gy <= 3; gy++) {
        for (let gx = 1; gx <= 3; gx++) map.tileGrid[gy][gx] = { elev: 1.0, style: 'pyramid' };
      }
      map.tileGrid[2][2] = { elev: 2.0, style: 'pyramid' };
      break;
    }
    case 'terrain_platform_stair': {
      // 2×1：左格切石階，右格切石高台
      map = createMiniArenaMap(2, 1, 'desert_outdoor');
      map.tileGrid[0][1] = { elev: 1.0, style: 'pyramid' };
      map.stairs.push({ x: 0, y: 0, w: TILE, h: TILE, elevation: 0.5, direction: 'east', style: 'pyramid' });
      break;
    }
    case 'terrain_plank': {
      // 3×3 的 1.0 木板神社高台，正中間 1 格為 2.0 層
      map = createMiniArenaMap(5, 5, 'shrine_outdoor');
      for (let gy = 1; gy <= 3; gy++) {
        for (let gx = 1; gx <= 3; gx++) map.tileGrid[gy][gx] = { elev: 1.0, style: 'shrine_floor' };
      }
      map.tileGrid[2][2] = { elev: 2.0, style: 'shrine_floor' };
      break;
    }
    case 'terrain_plank_stair': {
      // 2×1：左格木板神社階梯，右格木板神社高台
      map = createMiniArenaMap(2, 1, 'shrine_outdoor');
      map.tileGrid[0][1] = { elev: 1.0, style: 'shrine_floor' };
      map.stairs.push({ x: 0, y: 0, w: TILE, h: TILE, elevation: 0.5, direction: 'east', style: 'shrine_floor' });
      break;
    }
    case 'terrain_mud': {
      // 3×3 的 -1.0 泥坑窪地，正中間 1 格為 -2.0 深泥坑
      map = createMiniArenaMap(5, 5, 'shrine_outdoor');
      for (let gy = 1; gy <= 3; gy++) {
        for (let gx = 1; gx <= 3; gx++) map.tileGrid[gy][gx] = { elev: -1.0, style: 'mud_pit' };
      }
      map.tileGrid[2][2] = { elev: -2.0, style: 'mud_pit' };
      break;
    }
    case 'terrain_mud_stair': {
      // 2×1：左格位於泥坑內的 -0.5 泥坡階梯，右格為 0.0 平地岸邊
      map = createMiniArenaMap(2, 1, 'shrine_outdoor');
      map.tileGrid[0][0] = { elev: -1.0, style: 'mud_pit' };
      map.stairs.push({ x: 0, y: 0, w: TILE, h: TILE, elevation: -0.5, direction: 'east', style: 'mud_pit' });
      break;
    }
    case 'object_bridge': {
      map = createMiniArenaMap(5, 3, 'desert_outdoor');
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 1; gx <= 3; gx++) {
          map.waterTiles.push({ gx, gy });
          map.waterTileKeys.add(`${gx},${gy}`);
        }
      }
      map.bridges.push({ x: 1 * TILE, y: 1 * TILE, w: 3 * TILE, h: 1 * TILE, orientation: 'horizontal', style: 'wood' });
      break;
    }
    case 'object_stone_bridge': {
      map = createMiniArenaMap(5, 3, 'castle_indoor');
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 1; gx <= 3; gx++) {
          map.waterTiles.push({ gx, gy });
          map.waterTileKeys.add(`${gx},${gy}`);
        }
      }
      map.bridges.push({ x: 1 * TILE, y: 1 * TILE, w: 3 * TILE, h: 1 * TILE, orientation: 'horizontal', style: 'stone' });
      break;
    }
    case 'object_stone_road': {
      map = createMiniArenaMap(4, 3, 'shrine_outdoor');
      for (let gy = 0; gy < 3; gy++) {
        map.floorGrid![gy][0] = 'grass_ground';
        map.floorGrid![gy][3] = 'grass_ground';
        map.stoneRoads.push({ gx: 1, gy }, { gx: 2, gy });
      }
      break;
    }
    case 'object_rail': {
      map = createMiniArenaMap(4, 3, 'desert_outdoor');
      map.railTracks.push(
        { gx: 0, gy: 1, orientation: 'horizontal' },
        { gx: 1, gy: 1, orientation: 'horizontal' },
        { gx: 2, gy: 0, orientation: 'vertical' },
        { gx: 2, gy: 1, orientation: 'vertical' },
        { gx: 2, gy: 2, orientation: 'vertical' }
      );
      break;
    }
    case 'object_railing': {
      map = createMiniArenaMap(4, 2, 'castle_indoor');
      map.obstacles.push(
        { x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 1.0, kind: 'crate', style: 'railing' },
        { x: 2 * TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 1.0, kind: 'crate', style: 'railing' }
      );
      break;
    }
    case 'object_farm': {
      map = createMiniArenaMap(4, 2, 'shrine_outdoor');
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 4; gx++) map.floorGrid![gy][gx] = 'grass_ground';
      }
      map.farmTiles = [
        { gx: 0, gy: 0, crop: 'empty' },
        { gx: 1, gy: 0, crop: 'carrot' },
        { gx: 2, gy: 0, crop: 'wheat' },
        { gx: 3, gy: 0, crop: 'cabbage' },
        { gx: 1, gy: 1, crop: 'carrot' },
        { gx: 2, gy: 1, crop: 'wheat' },
      ];
      break;
    }
    case 'object_stair_crate': {
      map = createMiniArenaMap(3, 2, 'warehouse_indoor');
      map.stairs.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 0.5, direction: 'east' });
      break;
    }
    case 'object_small_crate': {
      map = createMiniArenaMap(3, 2, 'warehouse_indoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 1.0, kind: 'crate', style: 'small_crate' });
      break;
    }
    case 'object_big_crate': {
      map = createMiniArenaMap(4, 3, 'warehouse_indoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: 2 * TILE, h: 2 * TILE, elevation: 1.5, kind: 'crate', style: 'default' });
      break;
    }
    case 'object_rock_small': {
      map = createMiniArenaMap(3, 2, 'bamboo_outdoor');
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 3; gx++) map.floorGrid![gy][gx] = 'grass_ground';
      }
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 1.5, kind: 'crate', style: 'rock_small', colorVariant: 'black' });
      break;
    }
    case 'object_rock_large': {
      map = createMiniArenaMap(4, 3, 'desert_outdoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: 2 * TILE, h: 2 * TILE, elevation: 2.0, kind: 'crate', style: 'rock_large', colorVariant: 'brown' });
      break;
    }
    case 'object_container': {
      map = createMiniArenaMap(6, 3, 'warehouse_indoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: 4 * TILE, h: 2 * TILE, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#0284C7' });
      break;
    }
    case 'object_train_car': {
      map = createMiniArenaMap(6, 3, 'desert_outdoor');
      for (let gx = 0; gx < 6; gx++) {
        map.railTracks.push({ gx, gy: 0, orientation: 'horizontal' }, { gx, gy: 1, orientation: 'horizontal' });
      }
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: 4 * TILE, h: 2 * TILE, elevation: 2.0, kind: 'crate', style: 'train_car', colorVariant: 'loco' });
      break;
    }
    case 'object_stone_wall': {
      map = createMiniArenaMap(4, 3, 'desert_outdoor');
      map.obstacles.push(
        { x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_tan' },
        { x: 2 * TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_tan' },
        { x: TILE, y: 1.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_tan' }
      );
      break;
    }
    case 'object_stone_wall_green': {
      map = createMiniArenaMap(4, 3, 'shrine_outdoor');
      map.obstacles.push(
        { x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_green' },
        { x: 2 * TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_green' },
        { x: TILE, y: 1.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_green' }
      );
      break;
    }
    case 'object_stone_wall_red': {
      map = createMiniArenaMap(4, 3, 'shrine_outdoor');
      map.obstacles.push(
        { x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_red' },
        { x: 2 * TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_red' },
        { x: TILE, y: 1.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_red' }
      );
      break;
    }
    case 'object_stone_wall_blue': {
      map = createMiniArenaMap(4, 3, 'castle_indoor');
      map.obstacles.push(
        { x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_blue' },
        { x: 2 * TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_blue' },
        { x: TILE, y: 1.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'stone_wall_blue' }
      );
      break;
    }
    case 'object_shrine_wall': {
      map = createMiniArenaMap(3, 2, 'shrine_outdoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'shrine_wall' });
      break;
    }
    case 'object_castle_pillar': {
      map = createMiniArenaMap(3, 2, 'castle_indoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'castle_pillar' });
      break;
    }
    case 'object_house': {
      map = createMiniArenaMap(5, 3, 'desert_outdoor');
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: 3 * TILE, h: 2 * TILE, elevation: 10, kind: 'wall', style: 'house', direction: 'south', colorVariant: 'moss_stone' });
      break;
    }
    case 'object_bamboo': {
      // 僅保留草坪地板＋竹林透出底層地形預覽
      map = createMiniArenaMap(3, 2, 'bamboo_outdoor');
      for (let gy = 0; gy < 2; gy++) {
        for (let gx = 0; gx < 3; gx++) map.floorGrid![gy][gx] = 'grass_ground';
      }
      map.obstacles.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE, elevation: 10, kind: 'wall', style: 'bamboo', direction: 'north' });
      break;
    }
    case 'object_bush': {
      map = createMiniArenaMap(3, 2, 'shrine_outdoor');
      map.bushes.push({ x: TILE, y: 0.5 * TILE, w: TILE, h: TILE });
      break;
    }
    case 'object_tree': {
      map = createMiniArenaMap(3, 3, 'shrine_outdoor');
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 3; gx++) map.floorGrid![gy][gx] = 'grass_ground';
      }
      map.trees.push({
        x: TILE,
        y: TILE,
        w: TILE,
        h: TILE,
        canopyRadius: 42,
        foliagePalette: ['#14532D', '#166534', '#15803D', '#4ADE80'],
      });
      drawCanopy = true;
      break;
    }
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#090D16';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / map.width, height / map.height);
  const offsetX = (width - map.width * scale) / 2;
  const offsetY = (height - map.height * scale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  renderMapBaseLayer(ctx, map, false, 0.8);
  if (drawCanopy) {
    renderMapCanopies(ctx, map);
  }
  ctx.restore();
}

