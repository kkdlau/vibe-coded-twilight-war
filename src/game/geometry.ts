import { TILE } from './maps';
import { FactionId } from './types';

let uidCounter = 1;

export function uid(prefix: string): string {
  return `${prefix}_${uidCounter++}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const EIGHT_WAY_VECTORS: readonly { angle: number; dx: number; dy: number }[] = [
  { angle: 0, dx: 1, dy: 0 },
  { angle: Math.PI * 0.25, dx: Math.SQRT1_2, dy: Math.SQRT1_2 },
  { angle: Math.PI * 0.5, dx: 0, dy: 1 },
  { angle: Math.PI * 0.75, dx: -Math.SQRT1_2, dy: Math.SQRT1_2 },
  { angle: Math.PI, dx: -1, dy: 0 },
  { angle: Math.PI * 1.25, dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 },
  { angle: Math.PI * 1.5, dx: 0, dy: -1 },
  { angle: Math.PI * 1.75, dx: Math.SQRT1_2, dy: -Math.SQRT1_2 },
];

export function snapToEightDirections(angle: number): { angle: number; dx: number; dy: number } {
  const step = Math.PI / 4;
  const idx = ((Math.round(angle / step) % 8) + 8) % 8;
  return EIGHT_WAY_VECTORS[idx];
}

export function pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function resolveCircleRect(
  cx: number,
  cy: number,
  radius: number,
  rect: { x: number; y: number; w: number; h: number }
): { x: number; y: number; hit: boolean } {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return { x: cx, y: cy, hit: false };
  const d = Math.sqrt(d2);
  if (d === 0) {
    return { x: cx, y: rect.y - radius, hit: true };
  }
  const overlap = radius - d;
  return {
    x: cx + (dx / d) * overlap,
    y: cy + (dy / d) * overlap,
    hit: true,
  };
}

export function segmentCircleHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number
): { hit: boolean; t: number; perpDist: number; hitX: number; hitY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const d = dist(x1, y1, cx, cy);
    return { hit: d <= radius, t: 0, perpDist: d, hitX: x1, hitY: y1 };
  }
  const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lenSq, 0, 1);
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const perpDist = dist(px, py, cx, cy);
  return {
    hit: perpDist <= radius,
    t,
    perpDist,
    hitX: px,
    hitY: py,
  };
}

export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: { x: number; y: number; w: number; h: number },
  eps = 1e-6
): { hit: boolean; t: number; hitX: number; hitY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) < 1e-9) {
    if (x1 < rect.x - eps || x1 > rect.x + rect.w + eps) {
      return { hit: false, t: 1, hitX: x2, hitY: y2 };
    }
  } else {
    const inv = 1 / dx;
    let t1 = (rect.x - eps - x1) * inv;
    let t2 = (rect.x + rect.w + eps - x1) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return { hit: false, t: 1, hitX: x2, hitY: y2 };
  }

  if (Math.abs(dy) < 1e-9) {
    if (y1 < rect.y - eps || y1 > rect.y + rect.h + eps) {
      return { hit: false, t: 1, hitX: x2, hitY: y2 };
    }
  } else {
    const inv = 1 / dy;
    let t1 = (rect.y - eps - y1) * inv;
    let t2 = (rect.y + rect.h + eps - y1) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return { hit: false, t: 1, hitX: x2, hitY: y2 };
  }

  const t = clamp(tmin, 0, 1);
  return {
    hit: true,
    t,
    hitX: x1 + dx * t,
    hitY: y1 + dy * t,
  };
}

/**
 * 光暈戰記陣營敵對規則：
 * - 第三勢力 (mercenary)：以「所有人（包含其他第三勢力）」為敵人
 * - 皇家騎士團 / 天影十字軍：僅與同陣營為友軍，以所有非自己陣營者（包含第三勢力）為敵人
 */
export function areHostile(
  facA: FactionId,
  idA: string,
  facB: FactionId,
  idB: string
): boolean {
  if (idA === idB) return false;
  if (facA === 'mercenary' || facB === 'mercenary') return true;
  return facA !== facB;
}

// 角色標準直徑 = 1 格 (半徑 = 0.5 * TILE)，移動碰撞與 0.1 格地形保留邊界支援 1×N 隧道暢通
export const CHAR_BASE_RADIUS = TILE / 2;
export const ELEV_PADDING = TILE * 0.1;

export function getMoveCheckRadius(hitRadius: number): number {
  return Math.min(TILE * 0.44, hitRadius * 0.68 + ELEV_PADDING);
}
