import { ArenaMap, TILE } from './maps';
import { Obstacle, PlatformStyle } from './types';

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
 * 1×1 鐵道路軌地磚（碎石道碴＋枕木＋雙鋼軌，支援 2 格寬標準鐵道拼合）
 */
function drawRailTrackTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  gx: number,
  hasTrackNorth: boolean,
  hasTrackSouth: boolean
) {
  // 道碴碎石床
  ctx.fillStyle = '#6B6257';
  ctx.fillRect(tx, ty, TILE, TILE);
  ctx.fillStyle = '#524A40';
  ctx.fillRect(tx + ((gx * 13) % 14) + 3, ty + 6, 5, 3);
  ctx.fillRect(tx + ((gx * 19) % 16) + 18, ty + 22, 6, 3);
  ctx.fillStyle = '#8A7F72';
  ctx.fillRect(tx + ((gx * 7) % 12) + 8, ty + 35, 4, 3);

  // 外側路基護緣
  if (!hasTrackNorth) {
    ctx.fillStyle = '#443C33';
    ctx.fillRect(tx, ty, TILE, 4);
  }
  if (!hasTrackSouth) {
    ctx.fillStyle = '#443C33';
    ctx.fillRect(tx, ty + TILE - 4, TILE, 4);
  }

  // 深棕木質枕木（每格 3 根枕木，跨兩行時無縫銜接）
  const tieTop = hasTrackNorth ? ty : ty + 7;
  const tieBottom = hasTrackSouth ? ty + TILE : ty + TILE - 7;
  for (let ox = 4; ox < TILE; ox += 16) {
    ctx.fillStyle = '#29170A';
    ctx.fillRect(tx + ox + 1, tieTop, 9, tieBottom - tieTop);
    ctx.fillStyle = '#5C381B';
    ctx.fillRect(tx + ox, tieTop, 8, tieBottom - tieTop);
  }

  // 雙條光澤鋼軌
  const drawSteelRail = (ry: number) => {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(tx, ry - 1, TILE, 6);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(tx, ry, TILE, 4);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(tx, ry + 0.5, TILE, 1.5);
  };

  if (!hasTrackNorth && hasTrackSouth) {
    drawSteelRail(ty + 14);
  } else if (hasTrackNorth && !hasTrackSouth) {
    drawSteelRail(ty + TILE - 18);
  } else if (!hasTrackNorth && !hasTrackSouth) {
    drawSteelRail(ty + 11);
    drawSteelRail(ty + TILE - 15);
  }
}

/**
 * 1×1 竹林實牆：依格座標變化 4 種 3 株布局（2上1下／1上2下／1左2右／2左1右）與竹葉簇
 */
function drawBambooTile(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y } = obs;
  const gx = Math.round(x / TILE);
  const gy = Math.round(y / TILE);
  const layoutIdx = (((gx * 3 + gy * 7) % 4) + 4) % 4;
  const j1 = (((gx * 5 + gy * 11) % 3) - 1) * 1.1;
  const j2 = (((gx * 11 + gy * 3) % 3) - 1) * 1.1;
  const j3 = (((gx * 7 + gy * 5) % 3) - 1) * 1.1;

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
 * 靜止火車頭／貨運車廂（elev 2.0，支援西方荒野鐵道鎮攀爬與掩體）
 */
function drawTrainCar(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, w, h, colorVariant } = obs;
  const isLoco = colorVariant === 'loco';

  // 底部鋼輪軸陰影露出邊緣
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x + 8, y - 2, w - 16, h + 4);

  if (isLoco) {
    // 西部蒸汽火車頭（朝西排障器 + 黑鐵鍋爐 + 銅箍環 + 煙囪 + 駕駛室頂棚）
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x, y, w, h);

    // 駕駛室後半部（深紅木頂棚）
    const cabW = w * 0.34;
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(x + w - cabW, y + 3, cabW - 3, h - 6);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x + w - cabW, y + 3, cabW - 3, h - 6);

    // 前部圓筒蒸汽鍋爐
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

    // 黃銅鍋爐箍環
    ctx.fillStyle = '#D97706';
    for (let rx = boilerX + 16; rx < boilerX + boilerW - 8; rx += 26) {
      ctx.fillRect(rx, y + 10, 4, h - 20);
    }

    // 大煙囪環
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(boilerX + 22, y + h / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 西側車頭前排障器鋼條
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x + 2, y + 12, 8, h - 24);
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    return;
  }

  // 木造／鐵皮貨運車廂
  const bodyColor = colorVariant || '#991B1B';
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x, y, w, h);

  // 兩端緩衝連掛鋼座
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y + 6, 8, h - 12);
  ctx.fillRect(x + w - 8, y + 6, 8, h - 12);

  // 車頂橫向木板紋
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
  ctx.lineWidth = 1.6;
  for (let px = x + 14; px < x + w - 10; px += 12) {
    ctx.beginPath();
    ctx.moveTo(px, y + 4);
    ctx.lineTo(px, y + h - 4);
    ctx.stroke();
  }

  // 車頂中央縱向走道木板 (Catwalk)
  ctx.fillStyle = '#D6A15C';
  ctx.fillRect(x + 6, y + h / 2 - 9, w - 12, 18);
  ctx.strokeStyle = '#451A03';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x + 6, y + h / 2 - 9, w - 12, 18);

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
 * 1 格河道中央靜水美術（對應 tile.png 第一行第 1 格：冷灰藍河水 + 有機深褐泥岸）
 */
function drawRiverCenterTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  gx: number,
  gy: number,
  animTime: number
) {
  ctx.fillStyle = '#5B8296';
  ctx.fillRect(tx, ty, TILE, TILE);

  // 細微柔和深淺水斑紋
  ctx.fillStyle = '#4E7487';
  ctx.fillRect(tx + ((gx * 13 + gy * 7) % 18) + 4, ty + 8, 12, 6);
  ctx.fillStyle = '#6A92A6';
  ctx.fillRect(tx + ((gx * 9 + gy * 15) % 16) + 12, ty + 27, 14, 5);

  const drift = Math.sin(animTime * 1.6 + gx * 0.7 + gy * 0.4) * 1.6;
  ctx.strokeStyle = 'rgba(203, 228, 240, 0.34)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(tx + 8, ty + 17 + drift);
  ctx.quadraticCurveTo(tx + 24, ty + 14 + drift, tx + 40, ty + 17 + drift);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tx + 10, ty + 35 - drift);
  ctx.quadraticCurveTo(tx + 24, ty + 32 - drift, tx + 38, ty + 35 - drift);
  ctx.stroke();
}

function drawMudBankStrip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical: boolean) {
  // 有機參差泥岸邊緣（外淺土 -> 深泥土 -> 濕泥邊）
  ctx.fillStyle = '#8C6239';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#4A2E18';
  if (vertical) {
    ctx.fillRect(x + (w > 10 ? 2 : 1), y, Math.max(4, w - 4), h);
    for (let oy = 2; oy < h - 4; oy += 8) {
      ctx.fillStyle = '#331E0E';
      ctx.fillRect(x + 1, y + oy, w - 2, 4);
      ctx.fillStyle = '#C9A87C';
      ctx.fillRect(x + ((oy * 3) % 3), y + oy + 3, 2, 3);
    }
  } else {
    ctx.fillRect(x, y + (h > 10 ? 2 : 1), w, Math.max(4, h - 4));
    for (let ox = 2; ox < w - 4; ox += 8) {
      ctx.fillStyle = '#331E0E';
      ctx.fillRect(x + ox, y + 1, 4, h - 2);
      ctx.fillStyle = '#C9A87C';
      ctx.fillRect(x + ox + 3, y + ((ox * 3) % 3), 3, 2);
    }
  }
}

function drawRiverEdgeN(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  drawMudBankStrip(ctx, tx, ty, TILE, 10, false);
  ctx.fillStyle = 'rgba(191, 219, 234, 0.35)';
  ctx.fillRect(tx, ty + 10, TILE, 3);
}

function drawRiverEdgeS(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  drawMudBankStrip(ctx, tx, ty + TILE - 10, TILE, 10, false);
  ctx.fillStyle = 'rgba(191, 219, 234, 0.35)';
  ctx.fillRect(tx, ty + TILE - 13, TILE, 3);
}

function drawRiverEdgeW(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  drawMudBankStrip(ctx, tx, ty, 10, TILE, true);
  ctx.fillStyle = 'rgba(191, 219, 234, 0.35)';
  ctx.fillRect(tx + 10, ty, 3, TILE);
}

function drawRiverEdgeE(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  drawMudBankStrip(ctx, tx + TILE - 10, ty, 10, TILE, true);
  ctx.fillStyle = 'rgba(191, 219, 234, 0.35)';
  ctx.fillRect(tx + TILE - 13, ty, 3, TILE);
}

function drawRiverCorner(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  corner: 'NW' | 'NE' | 'SW' | 'SE',
  inner: boolean
) {
  const r = inner ? 11 : 18;
  const cx = corner.includes('W') ? tx : tx + TILE;
  const cy = corner.includes('N') ? ty : ty + TILE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tx, ty, TILE, TILE);
  ctx.clip();
  ctx.fillStyle = '#4A2E18';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8C6239';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
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
 * 繪製 tile.png 風格房屋（俯視斜屋頂石磚＋青苔蔓藤＋屋脊橫樑＋兩側藍窗）
 */
function drawTileHouse(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, w, h } = obs;

  // 兩側屋簷與藍色窗戶
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 2, y + 6, 6, h - 12);
  ctx.fillRect(x + w - 4, y + 6, 6, h - 12);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(x - 1, y + h * 0.34, 4, h * 0.32);
  ctx.fillRect(x + w - 3, y + h * 0.34, 4, h * 0.32);

  // 主體石磚斜屋頂
  ctx.fillStyle = '#9D7E54';
  ctx.fillRect(x, y, w, h);

  // 上斜坡較亮、下斜坡略暗（營造雙坡屋頂立體感）
  ctx.fillStyle = '#B09064';
  ctx.fillRect(x + 2, y + 2, w - 4, h / 2 - 4);
  ctx.fillStyle = '#7E613B';
  ctx.fillRect(x + 2, y + h / 2 + 2, w - 4, h / 2 - 4);

  // 交錯屋頂石磚線
  ctx.strokeStyle = '#3E2B16';
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

  // 青苔綠植點綴
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

  // 中央屋脊木樑
  ctx.fillStyle = '#C9A46B';
  ctx.fillRect(x + 2, y + h / 2 - 4, w - 4, 8);
  ctx.strokeStyle = '#33200E';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(x + 2, y + h / 2 - 4, w - 4, 8);

  // 外圍厚木簷框
  ctx.strokeStyle = '#1C140D';
  ctx.lineWidth = 3.2;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 繪製 tile.png 第二行第 4–7 格：8 鄰接無縫併接石牆（棕褐石／苔綠石），支援內外轉角連貫光影與鄰近木箱自然打燈
 */
function drawSteppedStoneWallTile(
  ctx: CanvasRenderingContext2D,
  obs: Obstacle,
  neighborSet: Set<string>,
  crateTileKeys: Set<string>,
  variant: 'tan' | 'green'
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

  const base = variant === 'green' ? '#6D7F68' : '#82715D';
  const mid = variant === 'green' ? '#566851' : '#665745';
  const dark = variant === 'green' ? '#364333' : '#3E3327';
  const hi = variant === 'green' ? '#A3B89C' : '#B5A38A';
  const litSide = variant === 'green' ? '#8CA485' : '#A6937A';
  const litEdge = variant === 'green' ? '#C7DBBF' : '#DECBA8';

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

  // 1. 1×1 同紋理地板（全格一致基準圖案＋細微像素點綴，支援 grass_ground 與 rail_track）
  const groundSpecks = BIOME_SPECKS[map.biome];
  for (let gy = 0; gy < map.rows; gy++) {
    for (let gx = 0; gx < map.cols; gx++) {
      const tx = gx * TILE;
      const ty = gy * TILE;
      const cell = map.tileGrid[gy][gx];
      if (cell.elev === 0 && cell.style === 'grass_ground') {
        drawGrassGroundTile(ctx, tx, ty, gx, gy);
      } else if (cell.elev === 0 && cell.style === 'rail_track') {
        const hasTrackNorth = gy > 0 && map.tileGrid[gy - 1][gx].style === 'rail_track';
        const hasTrackSouth = gy < map.rows - 1 && map.tileGrid[gy + 1][gx].style === 'rail_track';
        drawRailTrackTile(ctx, tx, ty, gx, hasTrackNorth, hasTrackSouth);
      } else {
        drawUniformTileMotif(ctx, tx, ty, pal.a, groundSpecks);
      }

      if (map.biome === 'warehouse_indoor') {
        if (gy === 10 && gx % 2 === 0) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.fillRect(tx + 6, ty + TILE / 2 - 2, TILE - 12, 4);
        }
      } else if (map.biome === 'shrine_outdoor') {
        if (gx >= 14 && gx <= 15) {
          ctx.fillStyle = 'rgba(226, 232, 240, 0.16)';
          ctx.fillRect(tx + 6, ty + 6, TILE - 12, TILE - 12);
        }
      } else if (map.biome === 'castle_indoor') {
        if (gy >= 9 && gy <= 10 && gx >= 2 && gx <= map.cols - 3) {
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
  }

  // 1.5 逐格河道繪製：1 種河道中央格 + 8 種泥岸接壤邊緣／轉角格
  const isWater = (gx: number, gy: number) => {
    if (gy < 0 || gy >= map.rows) return true;
    return map.waterTileKeys.has(`${gx},${gy}`);
  };
  for (const wt of map.waterTiles) {
    const tx = wt.gx * TILE;
    const ty = wt.gy * TILE;
    drawRiverCenterTile(ctx, tx, ty, wt.gx, wt.gy, animTime);

    const hasN = isWater(wt.gx, wt.gy - 1);
    const hasS = isWater(wt.gx, wt.gy + 1);
    const hasW = isWater(wt.gx - 1, wt.gy);
    const hasE = isWater(wt.gx + 1, wt.gy);

    if (!hasN) drawRiverEdgeN(ctx, tx, ty);
    if (!hasS) drawRiverEdgeS(ctx, tx, ty);
    if (!hasW) drawRiverEdgeW(ctx, tx, ty);
    if (!hasE) drawRiverEdgeE(ctx, tx, ty);

    if (!hasN && !hasW) drawRiverCorner(ctx, tx, ty, 'NW', false);
    else if (hasN && hasW && !isWater(wt.gx - 1, wt.gy - 1)) drawRiverCorner(ctx, tx, ty, 'NW', true);

    if (!hasN && !hasE) drawRiverCorner(ctx, tx, ty, 'NE', false);
    else if (hasN && hasE && !isWater(wt.gx + 1, wt.gy - 1)) drawRiverCorner(ctx, tx, ty, 'NE', true);

    if (!hasS && !hasW) drawRiverCorner(ctx, tx, ty, 'SW', false);
    else if (hasS && hasW && !isWater(wt.gx - 1, wt.gy + 1)) drawRiverCorner(ctx, tx, ty, 'SW', true);

    if (!hasS && !hasE) drawRiverCorner(ctx, tx, ty, 'SE', false);
    else if (hasS && hasE && !isWater(wt.gx + 1, wt.gy + 1)) drawRiverCorner(ctx, tx, ty, 'SE', true);
  }

  // 跨河橋樑
  for (const br of map.bridges) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(br.x + 4, br.y + 8, br.w, br.h);

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

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, map.width, map.height);

  // 2. 逐格多層高台繪製（1.0 / 2.0 / 3.0 依鄰格自動拼合邊緣，絕無內部接縫）
  const hasTier = (gx: number, gy: number, tier: number) => {
    if (gy < 0 || gy >= map.rows || gx < 0 || gx >= map.cols) return false;
    return map.tileGrid[gy][gx].elev >= tier;
  };

  for (const tier of [1.0, 2.0, 3.0]) {
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
  }

  // 3. 梯級 (0.5 / 1.5 / 2.5) — 對應 tile.png 有階段的小箱子（深棕木條階梯與天然石板階梯）
  const sortedStairs = [...map.stairs].sort((a, b) => a.elevation - b.elevation);
  for (const st of sortedStairs) {
    if (st.style === 'hill') {
      // 自然土坡坡道：高地方向接壤翠綠草緣、坡面為夯實黃褐泥土與嵌入式土石踏坎，無生硬方框
      const dir = st.direction;
      const isHoriz = dir === 'east' || dir === 'west';
      const isUpperFirst = dir === 'north' || dir === 'west'; // uphill is top (north) or left (west)

      const gx0 = isHoriz ? (dir === 'east' ? st.x + st.w : st.x) : st.x;
      const gy0 = isHoriz ? st.y : dir === 'south' ? st.y + st.h : st.y;
      const gx1 = isHoriz ? (dir === 'east' ? st.x : st.x + st.w) : st.x;
      const gy1 = isHoriz ? st.y : dir === 'south' ? st.y : st.y + st.h;

      const slopeGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      slopeGrad.addColorStop(0, st.elevation >= 1.5 ? '#709E1C' : '#58821B');
      slopeGrad.addColorStop(0.18, '#8E663A');
      slopeGrad.addColorStop(0.65, '#78522B');
      slopeGrad.addColorStop(1, '#5D3E1F');
      ctx.fillStyle = slopeGrad;
      ctx.fillRect(st.x, st.y, st.w, st.h);

      // 兩側被開鑿出的山坡泥土護坎＋青草點綴（讓土坡自然嵌入山丘緣）
      if (isHoriz) {
        ctx.fillStyle = '#4B3018';
        ctx.fillRect(st.x, st.y, st.w, 5);
        ctx.fillRect(st.x, st.y + st.h - 5, st.w, 5);
        ctx.fillStyle = '#365314';
        ctx.fillRect(st.x + 6, st.y + 1, 7, 3);
        ctx.fillRect(st.x + st.w - 14, st.y + st.h - 4, 8, 3);
      } else {
        ctx.fillStyle = '#4B3018';
        ctx.fillRect(st.x, st.y, 5, st.h);
        ctx.fillRect(st.x + st.w - 5, st.y, 5, st.h);
        ctx.fillStyle = '#365314';
        ctx.fillRect(st.x + 1, st.y + 7, 3, 7);
        ctx.fillRect(st.x + st.w - 4, st.y + st.h - 15, 3, 8);
      }

      // 高低端柔和過渡線（上坡頂端微帶草泥邊、下坡底端微帶土陰影）
      if (dir === 'north') {
        ctx.fillStyle = st.elevation >= 1.5 ? 'rgba(132, 204, 22, 0.35)' : 'rgba(101, 163, 13, 0.35)';
        ctx.fillRect(st.x + 5, st.y, st.w - 10, 5);
        ctx.fillStyle = 'rgba(30, 18, 8, 0.35)';
        ctx.fillRect(st.x + 5, st.y + st.h - 4, st.w - 10, 4);
      } else if (dir === 'south') {
        ctx.fillStyle = st.elevation >= 1.5 ? 'rgba(132, 204, 22, 0.35)' : 'rgba(101, 163, 13, 0.35)';
        ctx.fillRect(st.x + 5, st.y + st.h - 5, st.w - 10, 5);
        ctx.fillStyle = 'rgba(30, 18, 8, 0.35)';
        ctx.fillRect(st.x + 5, st.y, st.w - 10, 4);
      } else if (dir === 'west') {
        ctx.fillStyle = st.elevation >= 1.5 ? 'rgba(132, 204, 22, 0.35)' : 'rgba(101, 163, 13, 0.35)';
        ctx.fillRect(st.x, st.y + 5, 5, st.h - 10);
        ctx.fillStyle = 'rgba(30, 18, 8, 0.35)';
        ctx.fillRect(st.x + st.w - 4, st.y + 5, 4, st.h - 10);
      } else {
        ctx.fillStyle = st.elevation >= 1.5 ? 'rgba(132, 204, 22, 0.35)' : 'rgba(101, 163, 13, 0.35)';
        ctx.fillRect(st.x + st.w - 5, st.y + 5, 5, st.h - 10);
        ctx.fillStyle = 'rgba(30, 18, 8, 0.35)';
        ctx.fillRect(st.x, st.y + 5, 4, st.h - 10);
      }

      // 4 條天然土坡緩階紋理（上坡側較亮、下坡側暗影，寬度隨方向微收呈現斜坡感）
      const ridgeCount = 4;
      const ridgeHi = st.elevation >= 1.5 ? '#C49F6E' : '#B18452';
      const ridgeMid = st.elevation >= 1.5 ? '#9B7B54' : '#855E37';
      const ridgeDark = '#3E2612';
      for (let i = 0; i < ridgeCount; i++) {
        const frac = (i + 0.5) / ridgeCount; // 0 -> top/left, 1 -> bottom/right
        const pad = 6 + (i % 2) * 1.5;
        if (isHoriz) {
          const rx = st.x + 5 + frac * (st.w - 10);
          const shadowOff = isUpperFirst ? 2 : -2;
          ctx.fillStyle = ridgeDark;
          ctx.fillRect(rx + shadowOff, st.y + pad, 3.2, st.h - pad * 2);
          ctx.fillStyle = ridgeMid;
          ctx.fillRect(rx - 1.5, st.y + pad, 4, st.h - pad * 2);
          ctx.fillStyle = ridgeHi;
          ctx.fillRect(rx - (isUpperFirst ? 1.5 : 0), st.y + pad + 1, 1.8, st.h - pad * 2 - 2);
        } else {
          const ry = st.y + 5 + frac * (st.h - 10);
          const shadowOff = isUpperFirst ? 2 : -2;
          ctx.fillStyle = ridgeDark;
          ctx.fillRect(st.x + pad, ry + shadowOff, st.w - pad * 2, 3.2);
          ctx.fillStyle = ridgeMid;
          ctx.fillRect(st.x + pad, ry - 1.5, st.w - pad * 2, 4);
          ctx.fillStyle = ridgeHi;
          ctx.fillRect(st.x + pad + 1, ry - (isUpperFirst ? 1.5 : 0), st.w - pad * 2 - 2, 1.8);
        }
      }

      // 坡面碎石子點綴
      ctx.fillStyle = '#A8947A';
      ctx.fillRect(st.x + 11, st.y + 13, 3, 2);
      ctx.fillRect(st.x + st.w - 15, st.y + st.h - 16, 3, 2);
      ctx.fillStyle = '#54381E';
      ctx.fillRect(st.x + st.w * 0.52, st.y + st.h * 0.48, 3, 2);
      continue;
    }

    // tile.png 有階梯的小箱子階梯風格：深木底座 + 陰影立體踏板木條
    ctx.fillStyle = '#4E3119';
    ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.strokeStyle = '#1E1107';
    ctx.lineWidth = 2;
    ctx.strokeRect(st.x, st.y, st.w, st.h);

    if (st.direction === 'east' || st.direction === 'west') {
      for (let sx = st.x + 5; sx < st.x + st.w - 3; sx += 9) {
        ctx.fillStyle = '#231409';
        ctx.fillRect(sx + 2, st.y + 4, 6, st.h - 8);
        ctx.fillStyle = '#B8874A';
        ctx.fillRect(sx, st.y + 3, 5, st.h - 7);
      }
    } else {
      for (let sy = st.y + 5; sy < st.y + st.h - 3; sy += 9) {
        ctx.fillStyle = '#231409';
        ctx.fillRect(st.x + 4, sy + 2, st.w - 8, 6);
        ctx.fillStyle = '#B8874A';
        ctx.fillRect(st.x + 3, sy, st.w - 7, 5);
      }
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

  // 預先建立接壤石牆與木箱索引集合（無縫轉角＋木箱對面自然光影）
  const tanWallKeys = new Set<string>();
  const greenWallKeys = new Set<string>();
  const crateTileKeys = new Set<string>();
  for (const obs of map.obstacles) {
    if (obs.style === 'stone_wall_tan') {
      tanWallKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
    } else if (obs.style === 'stone_wall_green') {
      greenWallKeys.add(`${Math.round(obs.x / TILE)},${Math.round(obs.y / TILE)}`);
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

  // 6a. 統一預繪地面投影（先於所有障礙物繪製，避免牆體之間互相疊出奇怪內陰影）
  const sortedObs = [...map.obstacles].sort((a, b) => a.elevation - b.elevation);
  for (const obs of sortedObs) {
    const shOff = obs.elevation >= 2.0 ? 9 : obs.elevation >= 1.5 ? 7 : 4;
    ctx.fillStyle = obs.elevation >= 2.0 ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.34)';
    ctx.fillRect(obs.x + shOff * 0.65, obs.y + shOff, obs.w, obs.h);
  }

  // 6b. 障礙物與箱體本體（依高度由低到高繪製：1.0小箱 -> 1.5大箱 -> 2.0貨櫃 -> 3.0牆柱／房屋）
  for (const obs of sortedObs) {
    if (obs.kind === 'crate') {
      if (obs.style === 'container') {
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
