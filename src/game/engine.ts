import { sfx, type FootstepSurface } from '../audio/sfx';
import { FACTIONS, FACTION_CHARACTERS, GUNS, MELEES, getReputationQiMultiplier, getWeaponSwapDuration } from './data';
import { renderMapBaseLayer, renderMapCanopies } from './mapRenderer';
import { ArenaMap, TILE, createArenaMap } from './maps';
import {
  AI_COMBAT,
  AI_PATROL,
  GUN_AIM,
  GUNFIRE_ANIMATION_SECONDS,
  PLAYER_MOVEMENT,
  RESPAWN_DELAY_SECONDS,
  RELOAD_CUES,
  getGunSpread,
} from './tuning';
import {
  BeamTracer,
  CharacterSkin,
  EnemyArchetype,
  EnemyEntity,
  EquippedWeapon,
  FactionId,
  FloatingText,
  GridTile,
  GunDef,
  GunKind,
  HudSnapshot,
  MapId,
  MeleeKind,
  Particle,
  PickupItem,
  PlayerState,
  Projectile,
  SlashEffect,
  WeaponHand,
  WeaponSlot,
} from './types';

const DEFAULT_PISTOL = GUNS.find((gun) => gun.kind === 'pistol') || GUNS[0];
const DEFAULT_KNIFE = MELEES.find((melee) => melee.kind === 'knife') || MELEES[0];

function equipGun(def: GunDef): Extract<EquippedWeapon, { type: 'gun' }> {
  return { type: 'gun', def, ammoInMag: def.magSize, reloadTimer: 0 };
}

function defaultWeaponForHand(hand: WeaponHand): EquippedWeapon {
  return hand === 0 ? equipGun(DEFAULT_PISTOL) : { type: 'melee', def: DEFAULT_KNIFE, durability: 0 };
}

let uidCounter = 1;
const uid = (prefix: string) => `${prefix}_${uidCounter++}`;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

function angleDiff(a: number, b: number) {
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

function pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function resolveCircleRect(
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

function segmentCircleHit(
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

/**
 * 光暈戰記陣營敵對規則：
 * - 第三勢力 (mercenary)：以「所有人（包含其他第三勢力）」為敵人
 * - 皇家騎士團 / 天影十字軍：僅與同陣營為友軍，以所有非自己陣營者（包含第三勢力）為敵人
 */
function areHostile(
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
const CHAR_BASE_RADIUS = TILE / 2;
const ELEV_PADDING = TILE * 0.1;

function getMoveCheckRadius(hitRadius: number): number {
  return Math.min(TILE * 0.44, hitRadius * 0.68 + ELEV_PADDING);
}

export class TwilightEngine {
  public mode = 'frontier' as const;
  public mapId: MapId;
  public status: HudSnapshot['status'] = 'PLAYING';
  public map: ArenaMap;
  public player: PlayerState;
  public enemies: EnemyEntity[] = [];
  public projectiles: Projectile[] = [];
  public beams: BeamTracer[] = [];
  public slashes: SlashEffect[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public pickups: PickupItem[] = [];

  public bannerText = '';
  public bannerTimer = 0;
  public activeSkillBanner = '';
  public activeSkillBannerTimer = 0;
  public factionScores: Record<FactionId, number> = { royal: 0, shadow: 0, mercenary: 0 };

  // 合計 10 名士兵配置（含玩家 1 人 + 9 名電腦士兵），場上同陣營最多 2 人
  private deploymentQueue: Record<FactionId, number> = { royal: 0, shadow: 0, mercenary: 0 };
  private spawnStaggerTimer = 0;
  private enemyMagState = new Map<string, { ammo: number; reloadTimer: number; reloadDur: number }>();

  private keys = new Set<string>();
  private mouseScreen = { x: 640, y: 360 };
  private mouseDown = false;
  private chargeSessionAllowed = false;
  private crosshairBloom = 0;
  private viewport = { width: 1280, height: 720 };
  private respawnTimer = 0;
  private distanceSinceStep = 0;
  private camera = { x: 0, y: 0, shake: 0, zoom: 1.3 };
  private time = 0;
  private hudEmitTimer = 0;
  private navStandable = new Set<number>();
  private navAdj = new Map<number, number[]>();
  private onHudUpdate: (snap: HudSnapshot) => void;
  private onReputationChange?: (reps: Record<FactionId, number>) => void;

  constructor(
    faction: FactionId,
    characterSkin: CharacterSkin,
    mapId: MapId,
    initialReputations: Record<FactionId, number>,
    onHudUpdate: (snap: HudSnapshot) => void,
    onReputationChange?: (reps: Record<FactionId, number>) => void
  ) {
    this.mapId = mapId;
    this.onHudUpdate = onHudUpdate;
    this.onReputationChange = onReputationChange;

    this.map = createArenaMap(mapId);
    const fac = FACTIONS[faction];
    const startGun = GUNS.find((g) => g.id === fac.startGunId) || GUNS[0];
    const startMelee = MELEES.find((m) => m.id === fac.startMeleeId) || MELEES[0];
    const spawnPt = this.map.factionSpawns[faction][0];

    const normalizedReps: Record<FactionId, number> = {
      royal: Math.floor(Number.isFinite(initialReputations.royal) ? initialReputations.royal : 0),
      shadow: Math.floor(Number.isFinite(initialReputations.shadow) ? initialReputations.shadow : 0),
      mercenary: Math.floor(Number.isFinite(initialReputations.mercenary) ? initialReputations.mercenary : 0),
    };

    this.player = {
      x: spawnPt.x,
      y: spawnPt.y,
      vx: 0,
      vy: 0,
      baseRadius: CHAR_BASE_RADIUS,
      radius: CHAR_BASE_RADIUS,
      sizeScale: 1,
      angle: 0,
      walkPhase: 0,
      moveIntensity: 0,
      elevation: 0,
      hp: 150,
      maxHp: 150,
      maxShield: 100,
      qi: 100,
      maxQi: 100,
      lives: 3,
      maxLives: 3,
      reputation: normalizedReps[faction],
      reputations: normalizedReps,
      score: 0,
      totalDamage: 0,
      kills: 0,
      maxCombo: 0,
      comboCount: 0,
      comboTimer: 0,
      faction,
      characterSkin,
      activeHand: 0,
      weapons: [equipGun(startGun), { type: 'melee', def: startMelee, durability: 0 }],
      reserveAmmo: 30,
      maxReserveAmmo: 45,
      swapTimer: 0,
      swapDuration: 0,
      gunfireTimer: 0,
      attackAnimTimer: 0,
      attackAnimDuration: 0,
      attackAnimKind: null,
      attackCooldown: 0,
      lastAttackAt: -10,
      delayCancelReady: false,
      comboEmpowerTimer: 0,
      chargingMelee: false,
      chargeReady: false,
      royalShieldTimer: 0,
      eagleEyeTimer: 0,
      shadowCloneTimer: 0,
      vampireTimer: 0,
      shrinkTimer: 0,
      giantTimer: 0,
      invulnTimer: 1.5,
      onHighGround: false,
      dmgMultiplier: 1,
      critChance: faction === 'shadow' ? 0.14 : 0.08,
      speedBonus: faction === 'shadow' ? 0.1 : 0,
      lifesteal: 0,
      armor: faction === 'royal' ? 0.08 : 0,
      qiRegenBonus: 0,
      delayCancelBonus: 0.25,
    };
    this.player.elevation = this.getWalkableElevation(this.player.x, this.player.y);
    this.player.onHighGround = this.player.elevation >= 1.0;

    const initCam = this.clampCameraToMap(this.player.x, this.player.y, 1280, 720);
    this.camera.x = initCam.x;
    this.camera.y = initCam.y;

    // 三大陣營各自擁有 10 名士兵總兵力（合計 30 人），同陣營場上最多 2 人
    this.deploymentQueue = {
      royal: 10,
      shadow: 10,
      mercenary: 10,
    };
    this.deploymentQueue[faction] = 9; // 玩家已佔用己方陣營第 1 席

    this.buildNavigationGraph();
    this.spawnMapWeapons();
    this.spawnMapAmmoPickups();
    this.spawnMapShieldPickups();
    this.refillFieldUpToCap();

    const winObjective =
      faction === 'mercenary'
        ? '第三勢力勝利條件：擊敗場上與後備全數敵我角色！'
        : `${fac.name}勝利條件：清除全數非己方勢力敵軍！`;
    this.showBanner(`${this.map.name} · 各陣營 10 兵編制（同陣營上限 2 人） · ${winObjective}`, 4.5);
    this.emitHud();
  }

  private tileIndex(gx: number, gy: number): number {
    return gy * this.map.cols + gx;
  }

  private hasTreeTrunkNear(x: number, y: number, padRadius: number): boolean {
    for (const tree of this.map.trees) {
      const trunkX = tree.x + tree.w / 2;
      const trunkY = tree.y + tree.h / 2;
      if (dist(x, y, trunkX, trunkY) < 12 + padRadius) return true;
    }
    return false;
  }

  private buildNavigationGraph() {
    const { cols, rows } = this.map;
    const padR = getMoveCheckRadius(CHAR_BASE_RADIUS);
    const elevByTile = new Map<number, number>();
    this.navStandable.clear();
    this.navAdj.clear();

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx = (gx + 0.5) * TILE;
        const cy = (gy + 0.5) * TILE;
        const elev = this.getWalkableElevation(cx, cy);
        if (this.canStandWithPadding(cx, cy, elev, CHAR_BASE_RADIUS) && !this.hasTreeTrunkNear(cx, cy, padR)) {
          const idx = this.tileIndex(gx, gy);
          this.navStandable.add(idx);
          elevByTile.set(idx, elev);
        }
      }
    }

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const idx of this.navStandable) {
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      const elevA = elevByTile.get(idx)!;
      const neighbors: number[] = [];

      for (const [ox, oy] of dirs) {
        const ngx = gx + ox;
        const ngy = gy + oy;
        if (ngx < 0 || ngx >= cols || ngy < 0 || ngy >= rows) continue;
        const nIdx = this.tileIndex(ngx, ngy);
        if (!this.navStandable.has(nIdx)) continue;
        const elevB = elevByTile.get(nIdx)!;
        if (Math.abs(elevA - elevB) > 0.5) continue;

        const midX = (gx + ox * 0.5 + 0.5) * TILE;
        const midY = (gy + oy * 0.5 + 0.5) * TILE;
        const midElev = this.getWalkableElevation(midX, midY);
        if (
          Math.abs(midElev - elevA) <= 0.5 &&
          Math.abs(midElev - elevB) <= 0.5 &&
          this.canStandWithPadding(midX, midY, midElev, CHAR_BASE_RADIUS) &&
          !this.hasTreeTrunkNear(midX, midY, padR)
        ) {
          neighbors.push(nIdx);
        }
      }
      this.navAdj.set(idx, neighbors);
    }
  }

  private findNearestStandableTile(gx: number, gy: number): number | null {
    const clampedX = clamp(gx, 0, this.map.cols - 1);
    const clampedY = clamp(gy, 0, this.map.rows - 1);
    const direct = this.tileIndex(clampedX, clampedY);
    if (this.navStandable.has(direct)) return direct;

    let bestIdx: number | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const nx = clampedX + ox;
          const ny = clampedY + oy;
          if (nx < 0 || nx >= this.map.cols || ny < 0 || ny >= this.map.rows) continue;
          const idx = this.tileIndex(nx, ny);
          if (this.navStandable.has(idx)) {
            const d = Math.abs(ox) + Math.abs(oy);
            if (d < bestD) {
              bestD = d;
              bestIdx = idx;
            }
          }
        }
      }
      if (bestIdx !== null) return bestIdx;
    }
    return null;
  }

  /**
   * A* 尋路演算法（遵循 |Δh| <= 0.5 高度差、階梯、跨河橋樑與 1×N 隧道）
   */
  public findPathAStar(startX: number, startY: number, goalX: number, goalY: number): GridTile[] {
    const { cols } = this.map;
    const startIdx = this.findNearestStandableTile(Math.floor(startX / TILE), Math.floor(startY / TILE));
    const goalIdx = this.findNearestStandableTile(Math.floor(goalX / TILE), Math.floor(goalY / TILE));
    if (startIdx === null || goalIdx === null) return [];

    const goalGx = goalIdx % cols;
    const goalGy = Math.floor(goalIdx / cols);
    if (startIdx === goalIdx) return [{ gx: goalGx, gy: goalGy }];

    const openSet = new Set<number>([startIdx]);
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>([[startIdx, 0]]);
    const fScore = new Map<number, number>([
      [startIdx, Math.abs((startIdx % cols) - goalGx) + Math.abs(Math.floor(startIdx / cols) - goalGy)],
    ]);

    while (openSet.size > 0) {
      let current = -1;
      let bestF = Infinity;
      for (const idx of openSet) {
        const f = fScore.get(idx) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          current = idx;
        }
      }
      if (current === -1) break;

      if (current === goalIdx) {
        const path: GridTile[] = [];
        let trace: number | undefined = current;
        while (trace !== undefined) {
          path.push({ gx: trace % cols, gy: Math.floor(trace / cols) });
          trace = cameFrom.get(trace);
        }
        path.reverse();
        return path;
      }

      openSet.delete(current);
      const curG = gScore.get(current) ?? Infinity;
      const curGx = current % cols;
      const curGy = Math.floor(current / cols);
      const curElev = this.getWalkableElevation((curGx + 0.5) * TILE, (curGy + 0.5) * TILE);

      for (const nxt of this.navAdj.get(current) || []) {
        const ngx = nxt % cols;
        const ngy = Math.floor(nxt / cols);
        const nxtElev = this.getWalkableElevation((ngx + 0.5) * TILE, (ngy + 0.5) * TILE);
        const stepCost = 1 + (Math.abs(nxtElev - curElev) > 0.01 ? 0.08 : 0);
        const tentativeG = curG + stepCost;
        if (tentativeG < (gScore.get(nxt) ?? Infinity)) {
          cameFrom.set(nxt, current);
          gScore.set(nxt, tentativeG);
          const h = Math.abs(ngx - goalGx) + Math.abs(ngy - goalGy);
          fScore.set(nxt, tentativeG + h);
          openSet.add(nxt);
        }
      }
    }
    return [];
  }

  private getActiveFactionCount(fac: FactionId): number {
    let count = this.player.faction === fac && this.player.hp > 0 ? 1 : 0;
    for (const e of this.enemies) {
      if (e.faction === fac) count += 1;
    }
    return count;
  }

  private pickBestDispersedSpawn(fac: FactionId): { x: number; y: number } {
    const spawns = this.map.factionSpawns[fac];
    const activePositions: { x: number; y: number }[] = [];
    if (this.player.hp > 0) {
      activePositions.push({ x: this.player.x, y: this.player.y });
    }
    for (const e of this.enemies) {
      activePositions.push({ x: e.x, y: e.y });
    }
    if (activePositions.length === 0) {
      return spawns[Math.floor(Math.random() * spawns.length)];
    }
    let bestSp = spawns[0];
    let bestMinDist = -1;
    for (const sp of spawns) {
      let minD = Infinity;
      for (const pos of activePositions) {
        const d = dist(sp.x, sp.y, pos.x, pos.y);
        if (d < minD) minD = d;
      }
      if (minD > bestMinDist) {
        bestMinDist = minD;
        bestSp = sp;
      }
    }
    return bestSp;
  }

  private refillFieldUpToCap() {
    const factions: FactionId[] = ['royal', 'shadow', 'mercenary'];
    for (const fac of factions) {
      const reservedSlot = this.status === 'RESPAWNING' && this.player.faction === fac ? 1 : 0;
      while (this.deploymentQueue[fac] > 0 && this.getActiveFactionCount(fac) + reservedSlot < 2) {
        this.deploymentQueue[fac] -= 1;
        const sp = this.pickBestDispersedSpawn(fac);
        const isAlly = fac !== 'mercenary' && fac === this.player.faction;
        const arch = this.pickRandomArchetype();
        this.enemies.push(this.createEnemy(arch, fac, isAlly, sp.x + (Math.random() - 0.5) * 14, sp.y + (Math.random() - 0.5) * 14));
      }
    }
  }

  private checkVictoryCondition() {
    if (this.status !== 'PLAYING') return;
    const p = this.player;
    if (p.faction === 'mercenary') {
      const queuedLeft =
        this.deploymentQueue.royal + this.deploymentQueue.shadow + this.deploymentQueue.mercenary;
      if (this.enemies.length === 0 && queuedLeft === 0) {
        this.status = 'VICTORY';
        sfx.levelUp();
        this.clearInputs();
        this.emitHud();
      }
    } else {
      const others = (['royal', 'shadow', 'mercenary'] as FactionId[]).filter((f) => f !== p.faction);
      const activeHostiles = this.enemies.filter((e) => e.faction !== p.faction).length;
      const queuedHostiles = this.deploymentQueue[others[0]] + this.deploymentQueue[others[1]];
      if (activeHostiles === 0 && queuedHostiles === 0) {
        this.status = 'VICTORY';
        sfx.levelUp();
        this.clearInputs();
        this.emitHud();
      }
    }
  }

  public getWalkableElevation(x: number, y: number): number {
    const gx = clamp(Math.floor(x / TILE), 0, this.map.cols - 1);
    const gy = clamp(Math.floor(y / TILE), 0, this.map.rows - 1);
    let best = this.map.tileGrid[gy][gx].elev;
    for (const st of this.map.stairs) {
      if (pointInRect(x, y, st) && st.elevation > best) best = st.elevation;
    }
    for (const obs of this.map.obstacles) {
      if (pointInRect(x, y, obs) && obs.elevation > best) best = obs.elevation;
    }
    return best;
  }

  private isGroundWalkable(x: number, y: number): boolean {
    if (this.map.waterTileKeys.size === 0) return true;
    for (const b of this.map.bridges) {
      if (pointInRect(x, y, b)) return true;
    }
    const gx = Math.floor(x / TILE);
    const gy = Math.floor(y / TILE);
    return !this.map.waterTileKeys.has(`${gx},${gy}`);
  }

  private findSafeTeleportSpot(
    targetX: number,
    targetY: number,
    approachAngle: number,
    offsetDist: number,
    radius: number,
    fallbackX: number,
    fallbackY: number
  ): { x: number; y: number } {
    const pad = radius + ELEV_PADDING;
    const isSpotValid = (cx: number, cy: number): boolean => {
      if (cx < pad || cx > this.map.width - pad || cy < pad || cy > this.map.height - pad) return false;
      if (!this.isGroundWalkable(cx, cy)) return false;
      for (const obs of this.map.obstacles) {
        if (
          obs.kind === 'wall' &&
          cx >= obs.x - pad &&
          cx <= obs.x + obs.w + pad &&
          cy >= obs.y - pad &&
          cy <= obs.y + obs.h + pad
        ) {
          return false;
        }
      }
      return true;
    };

    const candidateAngles = [
      approachAngle + Math.PI,
      approachAngle + Math.PI * 0.75,
      approachAngle - Math.PI * 0.75,
      approachAngle + Math.PI * 0.5,
      approachAngle - Math.PI * 0.5,
      approachAngle,
    ];
    for (const a of candidateAngles) {
      const cx = clamp(targetX + Math.cos(a) * offsetDist, pad, this.map.width - pad);
      const cy = clamp(targetY + Math.sin(a) * offsetDist, pad, this.map.height - pad);
      if (isSpotValid(cx, cy)) return { x: cx, y: cy };
    }
    if (isSpotValid(targetX, targetY)) return { x: targetX, y: targetY };
    return { x: fallbackX, y: fallbackY };
  }

  private getHeightAtPoint(x: number, y: number): {
    totalHeight: number;
    terrainHeight: number;
    isWall: boolean;
    isCrate: boolean;
  } {
    for (const obs of this.map.obstacles) {
      if (pointInRect(x, y, obs)) {
        return {
          totalHeight: obs.elevation,
          terrainHeight: obs.kind === 'crate' ? 0 : obs.elevation,
          isWall: obs.kind === 'wall',
          isCrate: obs.kind === 'crate',
        };
      }
    }
    const terrain = this.getWalkableElevation(x, y);
    return { totalHeight: terrain, terrainHeight: terrain, isWall: false, isCrate: false };
  }

  private clampCameraToMap(camX: number, camY: number, canvasWidth: number, canvasHeight: number) {
    const zoom = Math.max(0.5, this.camera.zoom);
    const halfW = canvasWidth / (2 * zoom);
    const halfH = canvasHeight / (2 * zoom);
    const x =
      halfW * 2 >= this.map.width
        ? this.map.width / 2
        : clamp(camX, halfW, this.map.width - halfW);
    const y =
      halfH * 2 >= this.map.height
        ? this.map.height / 2
        : clamp(camY, halfH, this.map.height - halfH);
    return { x, y };
  }

  /**
   * 移動檢查：
   * - 角色直徑 = 1 格 (radius = 0.5 格)
   * - 無法跨越的地形高度差 (|Δh| > 0.5) 或河道水域保留 0.1 格 padding
   */
  private countElevationViolations(x: number, y: number, curElev: number, hitRadius: number): number {
    const checkR = getMoveCheckRadius(hitRadius);
    let violations = 0;
    if (x < checkR || x > this.map.width - checkR || y < checkR || y > this.map.height - checkR) {
      violations += 4;
    }
    if (!this.isGroundWalkable(x, y)) violations += 4;
    const centerElev = this.getWalkableElevation(x, y);
    if (Math.abs(centerElev - curElev) > 0.5) violations += 4;

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = x + Math.cos(a) * checkR;
      const sy = y + Math.sin(a) * checkR;
      if (!this.isGroundWalkable(sx, sy)) {
        violations += 1;
      } else {
        const se = this.getWalkableElevation(sx, sy);
        if (Math.abs(se - curElev) > 0.5) violations += 1;
      }
    }
    for (const obs of this.map.obstacles) {
      if (obs.kind === 'wall') {
        const res = resolveCircleRect(x, y, checkR, obs);
        if (res.hit) violations += 2;
      }
    }
    return violations;
  }

  private canStandWithPadding(x: number, y: number, curElev: number, hitRadius: number): boolean {
    return this.countElevationViolations(x, y, curElev, hitRadius) === 0;
  }

  private moveCharacterWithElevation(
    curX: number,
    curY: number,
    curElev: number,
    dx: number,
    dy: number,
    hitRadius: number
  ): { x: number; y: number; elevation: number } {
    const padRadius = getMoveCheckRadius(hitRadius);
    const curViolations = this.countElevationViolations(curX, curY, curElev, hitRadius);

    let nx = curX + dx;
    let ny = curY;
    const xViolations = this.countElevationViolations(nx, ny, curElev, hitRadius);
    if (xViolations > 0 && (curViolations === 0 || xViolations > curViolations || Math.abs(this.getWalkableElevation(nx, ny) - curElev) > 0.5)) {
      nx = curX;
      // 1×N 隧道／狹道入口自動對齊輔助（水平撞角時微調 Y 軸對齊格心）
      if (Math.abs(dx) > 0.01 && Math.abs(dy) <= Math.abs(dx) * 0.25) {
        const centerY = (Math.floor(curY / TILE) + 0.5) * TILE;
        const diffY = centerY - curY;
        if (Math.abs(diffY) > 0.4 && Math.abs(diffY) <= TILE * 0.48) {
          if (this.countElevationViolations(curX + dx, centerY, curElev, hitRadius) === 0) {
            const stepY = Math.sign(diffY) * Math.min(Math.abs(diffY), Math.abs(dx) * 1.15);
            const nudgedY = curY + stepY;
            if (this.countElevationViolations(curX, nudgedY, curElev, hitRadius) === 0) {
              ny = nudgedY;
              if (this.countElevationViolations(curX + dx, ny, curElev, hitRadius) === 0) {
                nx = curX + dx;
              }
            }
          }
        }
      }
    }

    const elevBeforeY = this.getWalkableElevation(nx, ny);
    const desiredY = ny + dy;
    const yBaseViolations = this.countElevationViolations(nx, ny, elevBeforeY, hitRadius);
    const yViolations = this.countElevationViolations(nx, desiredY, elevBeforeY, hitRadius);
    if (yViolations > 0 && (yBaseViolations === 0 || yViolations > yBaseViolations || Math.abs(this.getWalkableElevation(nx, desiredY) - elevBeforeY) > 0.5)) {
      // 1×N 隧道／狹道入口自動對齊輔助（垂直撞角時微調 X 軸對齊格心）
      if (Math.abs(dy) > 0.01 && Math.abs(dx) <= Math.abs(dy) * 0.25 && nx === curX) {
        const centerX = (Math.floor(curX / TILE) + 0.5) * TILE;
        const diffX = centerX - curX;
        if (Math.abs(diffX) > 0.4 && Math.abs(diffX) <= TILE * 0.48) {
          if (this.countElevationViolations(centerX, curY + dy, curElev, hitRadius) === 0) {
            const stepX = Math.sign(diffX) * Math.min(Math.abs(diffX), Math.abs(dy) * 1.15);
            const nudgedX = curX + stepX;
            if (this.countElevationViolations(nudgedX, curY, curElev, hitRadius) === 0) {
              nx = nudgedX;
              if (this.countElevationViolations(nx, curY + dy, curElev, hitRadius) === 0) {
                ny = curY + dy;
              }
            }
          }
        }
      }
    } else {
      ny = desiredY;
    }

    // 不可跨越石牆與樹幹同樣保留通道間距
    for (const obs of this.map.obstacles) {
      if (obs.kind === 'wall') {
        const res = resolveCircleRect(nx, ny, padRadius, obs);
        nx = res.x;
        ny = res.y;
      }
    }

    for (const tree of this.map.trees) {
      const trunkX = tree.x + tree.w / 2;
      const trunkY = tree.y + tree.h / 2;
      const d = dist(nx, ny, trunkX, trunkY);
      const minD = 12 + padRadius;
      if (d < minD && d > 0.001) {
        nx = trunkX + ((nx - trunkX) / d) * minD;
        ny = trunkY + ((ny - trunkY) / d) * minD;
      }
    }

    nx = clamp(nx, padRadius, this.map.width - padRadius);
    ny = clamp(ny, padRadius, this.map.height - padRadius);

    const finalElev = this.getWalkableElevation(nx, ny);
    if (Math.abs(finalElev - curElev) > 0.5) {
      return { x: curX, y: curY, elevation: curElev };
    }
    return { x: nx, y: ny, elevation: finalElev };
  }

  /**
   * 視線檢查 (LoS)：視野半徑 ~8 格，若隔實心牆或中間遮蔽物高於雙方 > 1 格則看不到；
   * 站在高台上的敵人仍可被看見，再由 canRangedHitTarget 判斷高低差能否射中！
   */
  private hasLineOfSight(
    ax: number,
    ay: number,
    aElev: number,
    bx: number,
    by: number,
    bElev: number,
    maxRange: number
  ): boolean {
    const totalD = dist(ax, ay, bx, by);
    const targetInBush = this.map.bushes.some((b) => pointInRect(bx, by, b));
    const effectiveRange = targetInBush ? Math.min(maxRange, 4 * TILE) : maxRange;
    if (totalD > effectiveRange) return false;

    const topSeenElev = Math.max(aElev, bElev);
    const steps = Math.max(2, Math.ceil(totalD / 14));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const h = this.getHeightAtPoint(px, py);
      if (h.isWall) return false;
      if (h.totalHeight > topSeenElev + 1.0) return false;
    }
    return true;
  }

  /**
   * 檢查目前站位與高低差下，遠程子彈是否確實射得到目標（而非被 > 1 格高低差或箱體擋住）
   */
  private canRangedHitTarget(
    ax: number,
    ay: number,
    aElev: number,
    bx: number,
    by: number,
    bElev: number
  ): boolean {
    if (bElev - aElev >= 2.0) return false;
    const totalD = dist(ax, ay, bx, by);
    if (totalD <= 18) return true;
    const seg = this.traceBulletSegment(ax, ay, Math.atan2(by - ay, bx - ax), totalD, aElev, false);
    const reachedDist = dist(ax, ay, seg.x2, seg.y2);
    return reachedDist >= totalD - 20;
  }

  /**
   * 子彈射線高度阻擋物理：
   * - 可由高處往低處射
   * - 高度差 1.5 格（如大箱子）：子彈會穿透至距離邊緣 0.5 格（格心）處再消失，站太外側仍會中彈
   * - 高度差 >= 2.0 格（如貨櫃、2層山、實牆）：子彈在邊緣即停止（0 穿透）
   */
  private traceBulletSegment(
    x1: number,
    y1: number,
    angle: number,
    maxDist: number,
    startElev: number,
    emitBurst = true
  ): { x1: number; y1: number; x2: number; y2: number } {
    const stepSize = 4;
    let curX = x1;
    let curY = y1;
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    let minTraversedElev = startElev;
    let leftStartCrate = startElev < 1.0;
    let remaining = maxDist;
    let penetratingHalfTile = false;
    let penetrationLeft = TILE * 0.49;

    while (remaining > 0) {
      const prevX = curX;
      const prevY = curY;
      const step = Math.min(stepSize, remaining);
      curX += vx * step;
      curY += vy * step;
      remaining -= step;

      if (curX < 0 || curX > this.map.width || curY < 0 || curY > this.map.height) {
        return {
          x1,
          y1,
          x2: clamp(curX, 0, this.map.width),
          y2: clamp(curY, 0, this.map.height),
        };
      }

      const h = this.getHeightAtPoint(curX, curY);
      if (!h.isCrate && !penetratingHalfTile) {
        leftStartCrate = true;
        minTraversedElev = Math.min(minTraversedElev, h.terrainHeight);
      }

      const heightDiff = h.totalHeight - minTraversedElev;
      const crateBlocks =
        h.isCrate && leftStartCrate && h.totalHeight > startElev && heightDiff > 1.0;
      const cliffBlocks =
        !h.isCrate && h.totalHeight > startElev && heightDiff > 1.0;

      if (h.isWall || (h.totalHeight > startElev && heightDiff >= 2.0)) {
        if (emitBurst) this.spawnBurst(prevX, prevY, '#E2E8F0', 4);
        return { x1, y1, x2: prevX, y2: prevY };
      }

      if (penetratingHalfTile) {
        if (!crateBlocks && !cliffBlocks) {
          // Exited the narrow 1.5 ridge cleanly
          penetratingHalfTile = false;
          continue;
        }
        penetrationLeft -= step;
        if (penetrationLeft <= 0) {
          if (emitBurst) this.spawnBurst(curX, curY, '#E2E8F0', 4);
          return { x1, y1, x2: curX, y2: curY };
        }
      } else if (crateBlocks || cliffBlocks) {
        // 高度差 > 1.0 且 < 2.0（例如 1.5 格大箱）：深入邊緣約 0.5 格後才停下
        penetratingHalfTile = true;
        penetrationLeft -= step;
        if (penetrationLeft <= 0) {
          if (emitBurst) this.spawnBurst(curX, curY, '#E2E8F0', 4);
          return { x1, y1, x2: curX, y2: curY };
        }
      }
    }

    return { x1, y1, x2: curX, y2: curY };
  }

  private spawnMapWeapons() {
    for (const ws of this.map.weaponSpawns) {
      if (ws.kind === 'gun') {
        const gunDef = GUNS.find((g) => g.id === ws.weaponId);
        if (gunDef) {
          this.pickups.push({
            id: uid('mapgun'),
            x: ws.x,
            y: ws.y,
            kind: 'gun',
            label: gunDef.name,
            color: gunDef.color,
            gunDef,
            bobPhase: Math.random() * 6,
          });
        }
      } else {
        const meleeDef = MELEES.find((m) => m.id === ws.weaponId);
        if (meleeDef) {
          this.pickups.push({
            id: uid('mapmelee'),
            x: ws.x,
            y: ws.y,
            kind: 'melee',
            label: meleeDef.name,
            color: meleeDef.color,
            meleeDef,
            bobPhase: Math.random() * 6,
          });
        }
      }
    }
  }

  private spawnMapAmmoPickups() {
    this.map.ammoSpawns.forEach((as, idx) => {
      as.active = true;
      as.respawnTimer = 0;
      this.pickups.push({
        id: uid('ammo_pad'),
        x: as.x,
        y: as.y,
        kind: 'ammo',
        label: '彈藥箱 (+30發)',
        color: '#60A5FA',
        amount: 30,
        bobPhase: Math.random() * 6,
        ammoSpawnIndex: idx,
      });
    });
  }

  private spawnMapShieldPickups() {
    const shieldDef = MELEES.find((m) => m.kind === 'shield');
    if (!shieldDef) return;
    this.map.shieldSpawns.forEach((ss) => {
      ss.active = true;
      ss.respawnTimer = 0;
      this.pickups.push({
        id: uid('mapshield'),
        x: ss.x,
        y: ss.y,
        kind: 'melee',
        label: shieldDef.name,
        color: shieldDef.color,
        meleeDef: shieldDef,
        durability: 100,
        bobPhase: 0,
      });
    });
  }

  public showBanner(text: string, duration = 2.8) {
    this.bannerText = text;
    this.bannerTimer = duration;
  }

  public setKey(code: string, pressed: boolean) {
    if (pressed) {
      if (!this.keys.has(code)) {
        this.keys.add(code);
        this.handleKeyDownOnce(code);
      }
    } else {
      this.keys.delete(code);
    }
  }

  public clearInputs() {
    this.keys.clear();
    this.mouseDown = false;
    this.cancelMeleeCharge();
  }

  private cancelMeleeCharge() {
    this.player.chargingMelee = false;
    this.player.chargeReady = false;
    this.chargeSessionAllowed = false;
    sfx.setMeleeCharge(null);
  }

  public setMousePos(x: number, y: number) {
    const moveDist = dist(this.mouseScreen.x, this.mouseScreen.y, x, y);
    this.mouseScreen.x = x;
    this.mouseScreen.y = y;

    const weapon = this.player.weapons[this.player.activeHand];
    if (this.status === 'PLAYING' && weapon.type === 'gun') {
      const gun = weapon.def;
      this.crosshairBloom = Math.min(gun.maxCrosshair - gun.baseCrosshair, this.crosshairBloom + Math.min(8, moveDist * 0.22));
      const { x, y } = this.getWorldPointer();
      this.player.angle = Math.atan2(y - this.player.y, x - this.player.x);
    }
  }

  public setMouseDown(down: boolean) {
    if (this.status !== 'PLAYING') {
      this.mouseDown = false;
      return;
    }
    const weapon = this.player.weapons[this.player.activeHand];
    if (down && !this.mouseDown) {
      this.mouseDown = true;
      if (weapon.type === 'melee') {
        this.player.chargingMelee = true;
        this.chargeSessionAllowed = this.player.qi >= this.player.maxQi - 0.5;
        this.player.chargeReady = false;
        if (this.chargeSessionAllowed) sfx.setMeleeCharge(0);
      } else {
        if (this.player.swapTimer <= 0 && weapon.ammoInMag <= 0 && weapon.reloadTimer === 0) {
          this.startReload();
        } else {
          this.tryAttack();
        }
      }
    } else if (!down && this.mouseDown) {
      this.mouseDown = false;
      if (weapon.type === 'melee' && this.player.chargingMelee) {
        this.releaseMeleeAttack();
      }
      this.cancelMeleeCharge();
    }
  }

  private handleKeyDownOnce(code: string) {
    if (code === 'KeyP') {
      if (this.status === 'PLAYING') {
        this.status = 'PAUSED';
        this.clearInputs();
        this.emitHud();
      } else if (this.status === 'PAUSED') {
        this.status = 'PLAYING';
        this.emitHud();
      }
      return;
    }

    if (this.status !== 'PLAYING') return;

    if (code === 'Escape') {
      this.dropActiveWeapon();
    } else if (code === 'Digit1') {
      this.equipHand(0);
    } else if (code === 'Digit2') {
      this.equipHand(1);
    } else if (code === 'KeyQ') {
      this.switchWeapon();
    } else if (code === 'KeyR') {
      this.startReload();
    } else if (code === 'Space') {
      this.tryPickup();
    }
  }

  public equipHand(hand: WeaponHand) {
    if (this.player.activeHand !== hand) this.switchWeapon();
  }

  private dropWeapon(weapon: EquippedWeapon, x: number, y: number): boolean {
    if (weapon.def.kind === 'pistol' || weapon.def.kind === 'knife') return false;
    if (weapon.def.kind === 'shield' && weapon.type === 'melee' && weapon.durability <= 0) return false;

    this.pickups.push({
      id: uid(weapon.type === 'gun' ? 'dropgun' : 'dropmelee'),
      x,
      y,
      kind: weapon.type,
      label: weapon.def.name,
      color: weapon.def.color,
      ...(weapon.type === 'gun'
        ? { gunDef: weapon.def }
        : { meleeDef: weapon.def, durability: weapon.def.kind === 'shield' ? Math.round(weapon.durability) : undefined }),
      bobPhase: 0,
    });
    return true;
  }

  public dropActiveWeapon() {
    const p = this.player;
    const weapon = p.weapons[p.activeHand];
    if (weapon.def.kind === 'pistol' || weapon.def.kind === 'knife') {
      this.spawnText(p.x, p.y - 36, `預設${weapon.def.name}無法放下`, '#94A3B8', 0.9);
      return;
    }

    this.dropWeapon(weapon, p.x, p.y);
    const fallback = defaultWeaponForHand(p.activeHand);
    p.weapons[p.activeHand] = fallback;
    this.cancelMeleeCharge();
    p.swapDuration = getWeaponSwapDuration(fallback.def.kind);
    p.swapTimer = p.swapDuration;
    this.resetGunFeedback();
    sfx.switchWeapon(false);
    this.spawnText(p.x, p.y - 38, `放下 ${weapon.def.name} · 換回${fallback.def.name}`, '#FBBF24', 1.05);
    this.emitHud();
  }

  private resetGunFeedback() {
    this.crosshairBloom = 0;
    this.player.gunfireTimer = 0;
  }

  private getWorldPointer() {
    return {
      x: (this.mouseScreen.x - this.viewport.width / 2) / this.camera.zoom + this.camera.x,
      y: (this.mouseScreen.y - this.viewport.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  private getPlayerGunSpread(gun: GunDef) {
    const p = this.player;
    const pointer = this.getWorldPointer();
    return getGunSpread(
      gun.kind,
      gun.baseCrosshair + this.crosshairBloom,
      dist(p.x, p.y, pointer.x, pointer.y),
      p.eagleEyeTimer > 0 ? 0.45 : 1
    );
  }

  public switchWeapon() {
    const p = this.player;
    this.cancelMeleeCharge();
    p.activeHand = p.activeHand === 0 ? 1 : 0;
    this.resetGunFeedback();
    const weapon = p.weapons[p.activeHand];
    const baseSwapDur = getWeaponSwapDuration(weapon.def.kind);
    const sinceAttack = this.time - p.lastAttackAt;
    if (p.delayCancelReady && sinceAttack <= 0.34 && sinceAttack >= 0.02) {
      p.attackCooldown = 0;
      p.delayCancelReady = false;
      p.comboEmpowerTimer = 1.6;
      p.swapDuration = baseSwapDur * 0.45;
      p.swapTimer = p.swapDuration;
      sfx.switchWeapon(true);
      this.spawnText(p.x, p.y - 36, 'Q 取消硬直 · 連攜增傷!', '#FBBF24', 1.15);
    } else {
      p.swapDuration = baseSwapDur;
      p.swapTimer = baseSwapDur;
      p.attackCooldown = Math.max(p.attackCooldown, baseSwapDur);
      sfx.switchWeapon(false);
    }
    this.emitHud();
  }

  public startReload() {
    const p = this.player;
    const active = p.weapons[p.activeHand];
    const weapon = active.type === 'gun' ? active : p.weapons[p.activeHand === 0 ? 1 : 0];
    if (weapon.type !== 'gun' || weapon.reloadTimer > 0) return;
    if (weapon.ammoInMag >= weapon.def.magSize) {
      this.spawnText(p.x, p.y - 36, '彈匣已滿', '#94A3B8', 0.9);
      return;
    }
    if (p.reserveAmmo <= 0) {
      this.spawnText(p.x, p.y - 36, '備彈已空！請按 Space 拾取地圖彈藥箱', '#F87171', 1.0);
      return;
    }
    weapon.reloadTimer = weapon.def.reloadTime;
    sfx.reload(weapon.def.kind, 'start');
    this.spawnText(p.x, p.y - 36, '裝填彈藥中...', '#FBBF24', 0.95);
    this.emitHud();
  }

  public tryPickup() {
    const p = this.player;
    let bestIdx = -1;
    let bestD = 70;
    for (let i = 0; i < this.pickups.length; i++) {
      const d = dist(p.x, p.y, this.pickups[i].x, this.pickups[i].y);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) return;

    const item = this.pickups[bestIdx];
    if (
      item.kind === 'ammo' &&
      p.reserveAmmo >= p.maxReserveAmmo &&
      p.weapons.every((weapon) => weapon.type !== 'gun' || weapon.ammoInMag >= weapon.def.magSize)
    ) {
      this.spawnText(p.x, p.y - 36, '彈藥已達上限 (45 發)', '#94A3B8', 0.95);
      return;
    }

    this.pickups.splice(bestIdx, 1);
    sfx.pickup();

    if (item.kind === 'ammo') {
      const added = item.amount || 30;
      p.reserveAmmo = Math.min(p.maxReserveAmmo, p.reserveAmmo + added);
      this.spawnText(p.x, p.y - 36, `+${added} 備彈 (目前 ${p.reserveAmmo}/45)`, '#60A5FA', 1.05);
      if (item.ammoSpawnIndex !== undefined) {
        const pad = this.map.ammoSpawns[item.ammoSpawnIndex];
        if (pad) {
          pad.active = false;
          pad.respawnTimer = 10.0;
        }
      }
    } else {
      let weapon: EquippedWeapon;
      if (item.kind === 'gun' && item.gunDef) {
        weapon = equipGun(item.gunDef);
      } else if (item.kind === 'melee' && item.meleeDef) {
        weapon = {
          type: 'melee',
          def: item.meleeDef,
          durability: item.meleeDef.kind === 'shield' ? clamp(item.durability ?? p.maxShield, 1, p.maxShield) : 0,
        };
      } else {
        return;
      }

      this.dropWeapon(p.weapons[p.activeHand], item.x, item.y);
      p.weapons[p.activeHand] = weapon;
      this.cancelMeleeCharge();
      this.resetGunFeedback();
      const label = weapon.type === 'melee' && weapon.def.kind === 'shield'
        ? `${weapon.def.name} (${Math.round(weapon.durability)}/100)`
        : weapon.def.name;
      this.spawnText(p.x, p.y - 38, `拾取 ${label}`, weapon.def.color, 1.15);
    }
    this.emitHud();
  }

  private getMoveVector() {
    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    return { x: mx, y: my };
  }

  /**
   * 玩家槍械射擊：極速直線彈道，碰到第一個角色或地形即停止（不穿透多人）
   */
  private tryAttack() {
    const p = this.player;
    if (p.attackCooldown > 0 || p.swapTimer > 0) return;

    const weapon = p.weapons[p.activeHand];
    if (weapon.type === 'gun') {
      if (weapon.reloadTimer > 0 || weapon.ammoInMag <= 0) return;

      if (p.royalShieldTimer > 0) {
        p.royalShieldTimer = 0;
        this.spawnText(p.x, p.y - 40, '遠程開火 · 聖光護盾破裂!', '#38BDF8', 1.1);
      }

      const gun = weapon.def;
      const pelletsToFire = gun.kind === 'shotgun' ? Math.max(1, Math.min(gun.pellets, weapon.ammoInMag)) : gun.pellets;
      const ammoCost = gun.kind === 'shotgun' ? pelletsToFire : 1;
      p.attackCooldown = 1 / gun.fireRate;
      p.gunfireTimer = GUNFIRE_ANIMATION_SECONDS;
      p.lastAttackAt = this.time;
      p.delayCancelReady = true;
      weapon.ammoInMag = Math.max(0, weapon.ammoInMag - ammoCost);

      const highGroundMult = p.onHighGround ? 1.15 : 1.0;
      const comboMult = p.comboEmpowerTimer > 0 ? 1 + p.delayCancelBonus : 1.0;
      if (p.comboEmpowerTimer > 0) p.comboEmpowerTimer = 0;

      const muzzleX = p.x + Math.cos(p.angle) * (p.radius + 4);
      const muzzleY = p.y + Math.sin(p.angle) * (p.radius + 4);
      const spreadRad = this.getPlayerGunSpread(gun);
      const infiniteRange = Math.hypot(this.map.width, this.map.height) + TILE * 2;

      for (let i = 0; i < pelletsToFire; i++) {
        const spreadOffset = (Math.random() - 0.5) * spreadRad;
        const a = p.angle + spreadOffset;
        const seg = this.traceBulletSegment(muzzleX, muzzleY, a, infiniteRange, p.elevation);

        let segEndX = seg.x2;
        let segEndY = seg.y2;

        // 槍械子彈碰人即止，不可一子彈攻擊兩人！
        const candidates: { enemy: EnemyEntity; t: number; perpDist: number; hitX: number; hitY: number }[] = [];
        for (const e of this.enemies) {
          if (e.elevation - p.elevation >= 2.0) continue;
          const res = segmentCircleHit(seg.x1, seg.y1, seg.x2, seg.y2, e.x, e.y, e.radius);
          if (res.hit) {
            candidates.push({ enemy: e, ...res });
          }
        }
        candidates.sort((c1, c2) => c1.t - c2.t);

        if (candidates.length > 0) {
          const hitInfo = candidates[0];
          const centerAccuracy = clamp(1 - hitInfo.perpDist / hitInfo.enemy.radius, 0, 1);
          const accuracyFactor = 0.28 + 0.72 * centerAccuracy;
          const maxShotDmg = gun.damage * p.dmgMultiplier * highGroundMult * comboMult;
          const actualDmg = Math.max(1, Math.round(maxShotDmg * accuracyFactor));

          this.damageEnemy(
            hitInfo.enemy,
            actualDmg,
            false,
            Math.cos(a) * 100,
            Math.sin(a) * 100,
            centerAccuracy >= 0.8,
            false,
            'player',
            p.faction,
            p.x,
            p.y
          );

          segEndX = hitInfo.hitX;
          segEndY = hitInfo.hitY;
        }

        this.beams.push({
          x1: seg.x1,
          y1: seg.y1,
          x2: segEndX,
          y2: segEndY,
          color: gun.color,
          life: gun.kind === 'sniper' ? 0.15 : 0.09,
          maxLife: gun.kind === 'sniper' ? 0.15 : 0.09,
          width: gun.kind === 'sniper' ? 3.0 : gun.kind === 'shotgun' ? 1.8 : 2.1,
        });
      }

      this.crosshairBloom = Math.min(gun.maxCrosshair - gun.baseCrosshair, this.crosshairBloom + gun.bloomPerShot);

      this.camera.shake = Math.min(8, this.camera.shake + (gun.kind === 'shotgun' || gun.kind === 'sniper' ? 4.5 : 1.4));
      sfx.gunshot(gun.kind);
      this.spawnBurst(muzzleX, muzzleY, gun.color, gun.kind === 'shotgun' ? 7 : 3);
    }
  }

  private releaseMeleeAttack() {
    const p = this.player;
    if (p.attackCooldown > 0 || p.swapTimer > 0) return;

    const weapon = p.weapons[p.activeHand];
    if (weapon.type !== 'melee') return;
    const melee = weapon.def;
    const comboMult = p.comboEmpowerTimer > 0 ? 1 + p.delayCancelBonus : 1.0;

    if (p.chargeReady) {
      p.chargeReady = false;
      p.attackCooldown = 0.25;
      p.lastAttackAt = this.time;
      p.delayCancelReady = true;
      p.attackAnimDuration = melee.kind === 'greatsword' ? 0.26 : 0.16;
      p.attackAnimTimer = p.attackAnimDuration;
      p.attackAnimKind = melee.kind;
      if (p.comboEmpowerTimer > 0) p.comboEmpowerTimer = 0;
      sfx.ultimate();
      this.camera.shake = 8;
      this.executePlayerFactionMeleeSkill(weapon, comboMult);
      return;
    }

    p.attackCooldown = 1 / melee.swingRate;
    p.lastAttackAt = this.time;
    p.delayCancelReady = true;
    p.attackAnimDuration = melee.kind === 'greatsword' ? 0.24 : 0.16;
    p.attackAnimTimer = p.attackAnimDuration;
    p.attackAnimKind = melee.kind;
    if (p.comboEmpowerTimer > 0) p.comboEmpowerTimer = 0;

    sfx.slash(melee.kind === 'greatsword');
    const giantMult = p.giantTimer > 0 ? 1.3 : 1.0;
    const dmg = Math.round(melee.damage * p.dmgMultiplier * comboMult * giantMult);
    const style = melee.kind === 'knife' || melee.kind === 'shield' ? 'thrust' : melee.kind === 'claw' ? 'claw' : 'sweep';
    this.slashes.push({
      x: p.x,
      y: p.y,
      angle: p.angle,
      arc: melee.arc,
      reach: melee.reach * p.sizeScale,
      color: melee.color,
      life: melee.kind === 'greatsword' ? 0.24 : 0.16,
      maxLife: melee.kind === 'greatsword' ? 0.24 : 0.16,
      isUltimate: false,
      style,
    });

    this.applyPlayerMeleeHitbox(
      p.x,
      p.y,
      p.elevation,
      p.angle,
      melee.arc,
      melee.reach * p.sizeScale,
      dmg,
      melee.kind === 'shield'
    );
  }

  private executePlayerFactionMeleeSkill(weapon: Extract<EquippedWeapon, { type: 'melee' }>, comboMult: number) {
    const p = this.player;
    const fac = p.faction;
    const mk = weapon.def.kind;
    const facColor = FACTIONS[fac].accentHex;
    const skillName = FACTIONS[fac].meleeSkills[mk].name;

    this.activeSkillBanner = `${FACTIONS[fac].name} · ${skillName}`;
    this.activeSkillBannerTimer = 2.5;

    if (mk === 'shield') {
      weapon.durability = p.maxShield;
      this.spawnText(p.x, p.y - 44, `${skillName}! (盾牌滿 100)`, '#38BDF8', 1.3);
      this.slashes.push({
        x: p.x,
        y: p.y,
        angle: p.angle,
        arc: Math.PI * 1.4,
        reach: 120,
        color: '#38BDF8',
        life: 0.26,
        maxLife: 0.26,
        isUltimate: true,
        style: 'sweep',
      });
      for (const e of [...this.enemies]) {
        if (!areHostile(p.faction, 'player', e.faction, e.id)) continue;
        if (Math.abs(p.elevation - e.elevation) > 1.0) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d <= 125 + e.radius) {
          const pushAng = Math.atan2(e.y - p.y, e.x - p.x);
          this.damageEnemy(
            e,
            Math.round(14 * p.dmgMultiplier * comboMult),
            true,
            Math.cos(pushAng) * 1050,
            Math.sin(pushAng) * 1050,
            false,
            true,
            'player',
            p.faction,
            p.x,
            p.y
          );
          e.stunTimer = Math.max(e.stunTimer, 0.45);
        }
      }
      this.emitHud();
      return;
    }

    this.spawnText(p.x, p.y - 44, `${skillName}!`, facColor, 1.3);

    if (fac === 'royal') {
      if (mk === 'knife') {
        p.royalShieldTimer = 6.5;
      } else if (mk === 'claw') {
        const hostiles = this.enemies.filter((e) => areHostile(p.faction, 'player', e.faction, e.id));
        if (hostiles.length > 0) {
          hostiles.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
          const target = hostiles[0];
          const approachAng = Math.atan2(target.y - p.y, target.x - p.x);
          const safeSpot = this.findSafeTeleportSpot(
            target.x,
            target.y,
            approachAng,
            p.radius + target.radius + 6,
            p.radius,
            p.x,
            p.y
          );
          this.spawnBurst(p.x, p.y, '#38BDF8', 12);
          p.x = safeSpot.x;
          p.y = safeSpot.y;
          p.elevation = this.getWalkableElevation(p.x, p.y);
          p.onHighGround = p.elevation >= 1.0;
          p.invulnTimer = Math.max(p.invulnTimer, 0.35);
        }
        this.slashes.push({
          x: p.x,
          y: p.y,
          angle: 0,
          arc: Math.PI * 2,
          reach: 220,
          color: '#FFFFFF',
          life: 0.25,
          maxLife: 0.25,
          isUltimate: true,
          style: 'sweep',
        });
        for (const e of this.enemies) {
          if (!areHostile(p.faction, 'player', e.faction, e.id)) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d <= 260) {
            const blindSec = clamp(1.0 - (d / 260) * 0.5, 0.5, 1.0);
            e.blindTimer = Math.max(e.blindTimer, blindSec);
            this.spawnText(e.x, e.y - 34, `致盲 ${blindSec.toFixed(1)}s`, '#FEF08A', 1.05);
          }
        }
      } else {
        const spreadAngles = [-0.34, -0.17, 0, 0.17, 0.34];
        for (const off of spreadAngles) {
          const a = p.angle + off;
          this.projectiles.push({
            id: uid('lightorb'),
            x: p.x + Math.cos(a) * 26,
            y: p.y + Math.sin(a) * 26,
            prevX: p.x,
            prevY: p.y,
            vx: Math.cos(a) * 560,
            vy: Math.sin(a) * 560,
            radius: 13,
            damage: Math.round(30 * p.dmgMultiplier * comboMult),
            startElevation: p.elevation,
            minTraversedElevation: p.elevation,
            ownerId: 'player',
            ownerFaction: p.faction,
            fromPlayer: true,
            isAlly: true,
            noFriendlyFire: false,
            color: '#FACC15',
            life: 1.25,
            maxLife: 1.25,
            pierce: 99,
            isLightOrb: true,
            hitIds: new Set(),
          });
        }
      }
      this.emitHud();
      return;
    }

    if (fac === 'shadow') {
      if (mk === 'knife') {
        p.eagleEyeTimer = 8.0;
      } else if (mk === 'claw') {
        p.shadowCloneTimer = 6.5;
      } else {
        const dir = snapToEightDirections(p.angle);
        this.slashes.push({
          x: p.x,
          y: p.y,
          angle: dir.angle,
          arc: Math.PI * 0.9,
          reach: weapon.def.reach + 20,
          color: '#4338CA',
          life: 0.25,
          maxLife: 0.25,
          isUltimate: true,
          style: 'sweep',
        });
        const startX = p.x + dir.dx * 28;
        const startY = p.y + dir.dy * 28;
        const headDmg = Math.round(20 * p.dmgMultiplier * comboMult);
        const bodyDmg = Math.round(15 * p.dmgMultiplier * comboMult);
        this.projectiles.push({
          id: uid('blackdragon'),
          x: startX,
          y: startY,
          prevX: p.x,
          prevY: p.y,
          vx: dir.dx * 340,
          vy: dir.dy * 340,
          radius: 22,
          damage: headDmg,
          headDamage: headDmg,
          bodyDamage: bodyDmg,
          startElevation: p.elevation,
          minTraversedElevation: p.elevation,
          ownerId: 'player',
          ownerFaction: p.faction,
          fromPlayer: true,
          isAlly: true,
          noFriendlyFire: true,
          color: '#312E81',
          life: 3.5,
          maxLife: 3.5,
          pierce: 99,
          isWave: true,
          isBlackDragon: true,
          segments: [{ x: startX, y: startY }],
          bouncesLeft: 5,
          distanceTraveled: 0,
          maxDistance: 1050,
          targetHitCooldowns: {},
          hitIds: new Set(),
        });
      }
      this.emitHud();
      return;
    }

    if (mk === 'knife') {
      p.vampireTimer = 7.5;
    } else if (mk === 'claw') {
      p.giantTimer = 0;
      p.shrinkTimer = 7.5;
    } else {
      p.shrinkTimer = 0;
      p.giantTimer = 7.5;
    }
    this.emitHud();
  }

  private applyPlayerMeleeHitbox(
    ox: number,
    oy: number,
    attackerElev: number,
    aimAngle: number,
    arc: number,
    reach: number,
    damage: number,
    isShieldPush = false
  ) {
    const knockPower = isShieldPush ? 920 : 200;
    for (const enemy of [...this.enemies]) {
      if (Math.abs(attackerElev - enemy.elevation) > 1.0) continue;
      const d = dist(ox, oy, enemy.x, enemy.y);
      if (d <= reach + enemy.radius) {
        const ang = Math.atan2(enemy.y - oy, enemy.x - ox);
        if (Math.abs(angleDiff(aimAngle, ang)) <= arc * 0.62) {
          this.damageEnemy(
            enemy,
            damage,
            true,
            Math.cos(ang) * knockPower,
            Math.sin(ang) * knockPower,
            false,
            false,
            'player',
            this.player.faction,
            ox,
            oy
          );
          if (isShieldPush && this.enemies.includes(enemy)) {
            enemy.stunTimer = Math.max(enemy.stunTimer, 0.35);
            this.spawnText(enemy.x, enemy.y - 36, '盾擊推開!', '#38BDF8', 0.95);
          }
        }
      }
    }
  }

  private isFrontalShieldBlock(defX: number, defY: number, defAngle: number, origX: number, origY: number): boolean {
    const incomingAngle = Math.atan2(origY - defY, origX - defX);
    return Math.abs(angleDiff(defAngle, incomingAngle)) <= Math.PI * 0.38;
  }

  private damageEnemy(
    enemy: EnemyEntity,
    baseDmg: number,
    isMelee: boolean,
    knockX: number,
    knockY: number,
    bullseye: boolean,
    noFriendlyFire: boolean,
    attackerId: string,
    attackerFaction: FactionId,
    hitOriginX?: number,
    hitOriginY?: number
  ) {
    const p = this.player;
    const isPlayerAttacker = attackerId === 'player';
    const isHostile = areHostile(attackerFaction, attackerId, enemy.faction, enemy.id);

    if (!isHostile) {
      if (noFriendlyFire) return;
      const ffDmg = Math.max(1, Math.round(baseDmg * 0.5));
      enemy.hp -= ffDmg;
      enemy.hitFlash = 0.12;
      if (enemy.hp <= 0) {
        if (isPlayerAttacker) {
          p.reputations[p.faction] -= 1;
          p.reputation = p.reputations[p.faction];
          this.onReputationChange?.({ ...p.reputations });
          this.spawnText(enemy.x, enemy.y - 32, '誤傷擊殺友軍! -1 聲望', '#F87171', 1.15);
        }
        this.removeEnemy(enemy, false);
      } else {
        this.spawnText(enemy.x, enemy.y - 24, `誤傷友軍 -${ffDmg}`, '#FCA5A5', 1.0);
      }
      return;
    }

    // 敵人技能防禦判定：皇家護盾、天影影分身 MISS（近戰命中立即破除影分身）、第三變大減傷 / 變細近傷增加
    if (enemy.royalShieldTimer > 0 && !isMelee) {
      this.spawnText(enemy.x, enemy.y - 24, '護盾免疫!', '#38BDF8', 0.95);
      return;
    }
    if (enemy.shadowCloneTimer > 0) {
      if (isMelee) {
        enemy.shadowCloneTimer = 0;
        this.spawnText(enemy.x, enemy.y - 38, '近戰破除影分身!', '#FB7185', 1.05);
      } else if (Math.random() < 2 / 3) {
        this.spawnText(enemy.x, enemy.y - 24, 'MISS', '#FB7185', 1.05);
        return;
      }
    }

    let dmg = baseDmg;
    if (enemy.royalShieldTimer > 0 && isMelee) dmg *= 0.8;
    if (enemy.shrinkTimer > 0 && isMelee) dmg *= 1.35;
    if (enemy.giantTimer > 0) dmg *= 0.9;

    const isCrit = isPlayerAttacker && Math.random() < p.critChance;
    let finalDmg = Math.max(1, Math.round(dmg * (isCrit ? 1.5 : 1)));

    // 手持戰術防彈盾：只擋來自正面的攻擊（側面／背面無法格擋）
    const enemyHoldingShield =
      enemy.activeSlot === 'melee' && enemy.meleeKind === 'shield' && enemy.shieldDurability > 0;
    if (enemyHoldingShield) {
      const originPos =
        hitOriginX !== undefined && hitOriginY !== undefined
          ? { x: hitOriginX, y: hitOriginY }
          : isPlayerAttacker
            ? { x: p.x, y: p.y }
            : (() => {
                const ae = this.enemies.find((x) => x.id === attackerId);
                return ae ? { x: ae.x, y: ae.y } : null;
              })();
      const frontalBlocked = originPos
        ? this.isFrontalShieldBlock(enemy.x, enemy.y, enemy.angle, originPos.x, originPos.y)
        : true;
      if (frontalBlocked) {
        if (!isMelee) {
          const absorbed = Math.min(enemy.shieldDurability, finalDmg);
          enemy.shieldDurability = Math.max(0, enemy.shieldDurability - absorbed);
          finalDmg -= absorbed;
          this.spawnText(
            enemy.x,
            enemy.y - 30,
            enemy.shieldDurability === 0 ? '敵盾碎裂!' : `盾擋 -${absorbed}`,
            enemy.shieldDurability === 0 ? '#F59E0B' : '#38BDF8',
            0.9
          );
        } else {
          const halfDmg = Math.max(1, Math.round(finalDmg * 0.5));
          const blockedAmt = Math.max(1, finalDmg - halfDmg);
          enemy.shieldDurability = Math.max(0, enemy.shieldDurability - blockedAmt);
          finalDmg = halfDmg;
          this.spawnText(
            enemy.x,
            enemy.y - 30,
            enemy.shieldDurability === 0 ? '敵盾碎裂!' : `盾格減半`,
            enemy.shieldDurability === 0 ? '#F59E0B' : '#38BDF8',
            0.9
          );
        }
        if (enemy.shieldDurability <= 0) {
          enemy.meleeKind = 'knife';
          enemy.chargingSkillTimer = 0;
          enemy.shieldDurability = 0;
        }
      }
    }

    if (finalDmg > 0) {
      enemy.hp -= finalDmg;
      enemy.hitFlash = 0.12;
    }

    const pushed = this.moveCharacterWithElevation(
      enemy.x,
      enemy.y,
      enemy.elevation,
      knockX * 0.05,
      knockY * 0.05,
      enemy.radius
    );
    enemy.x = pushed.x;
    enemy.y = pushed.y;
    enemy.elevation = pushed.elevation;

    const attackerEntity = isPlayerAttacker ? null : this.enemies.find((ae) => ae.id === attackerId);
    const attackerPos = isPlayerAttacker && p.hp > 0
      ? { x: p.x, y: p.y }
      : attackerEntity
        ? { x: attackerEntity.x, y: attackerEntity.y }
        : null;

    if (attackerPos) {
      const shouldSwitchAggro =
        !enemy.focusedTargetId ||
        (enemy.focusedTargetId !== attackerId && (!enemy.hasLosToTarget || Math.random() < 0.6));
      if (shouldSwitchAggro) {
        enemy.focusedTargetId = attackerId;
        enemy.aggroLockTimer = 5.0;
        enemy.lastSeenTargetPos = { x: attackerPos.x, y: attackerPos.y };
        enemy.alertTimer = 7.0;
        enemy.pathTimer = 0;
      } else if (enemy.focusedTargetId === attackerId) {
        enemy.lastSeenTargetPos = { x: attackerPos.x, y: attackerPos.y };
        enemy.alertTimer = Math.max(enemy.alertTimer, 6.5);
      }
    }

    if (isPlayerAttacker) {
      p.totalDamage += finalDmg;
      p.score += finalDmg;

      if (p.hp > 0 && p.vampireTimer > 0 && finalDmg > 0) {
        const healRatio = isMelee ? 0.5 : 1 / 3;
        const heal = Math.max(1, Math.round(finalDmg * healRatio));
        p.hp = Math.min(p.maxHp, p.hp + heal);
      }

      sfx.hit(isCrit || bullseye);
    } else if (attackerEntity && attackerEntity.vampireTimer > 0 && finalDmg > 0) {
      const heal = Math.max(1, Math.round(finalDmg * (isMelee ? 0.5 : 1 / 3)));
      attackerEntity.hp = Math.min(attackerEntity.maxHp, attackerEntity.hp + heal);
    }

    this.spawnBurst(enemy.x, enemy.y, finalDmg === 0 ? '#38BDF8' : isCrit || bullseye ? '#FBBF24' : '#F87171', isCrit ? 9 : 5);
    if (finalDmg > 0) {
      this.spawnText(
        enemy.x + (Math.random() - 0.5) * 16,
        enemy.y - 24,
        bullseye ? `${finalDmg} 核心` : isCrit ? `${finalDmg}!` : `${finalDmg}`,
        bullseye || isCrit ? '#FBBF24' : '#F8FAFC',
        bullseye || isCrit ? 1.15 : 0.95
      );
    }

    if (enemy.hp <= 0) {
      this.removeEnemy(enemy, isPlayerAttacker);
    }
  }

  private removeEnemy(enemy: EnemyEntity, killedByPlayer: boolean) {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);
    this.enemyMagState.delete(enemy.id);
    this.spawnBurst(enemy.x, enemy.y, enemy.color, 14);
    sfx.soldierDown(this.nearbySoundVolume(enemy.x, enemy.y) * 0.75);

    if (killedByPlayer) {
      const p = this.player;
      p.kills += 1;
      p.comboCount += 1;
      p.comboTimer = 4.0;
      p.maxCombo = Math.max(p.maxCombo, p.comboCount);

      p.reputations[p.faction] += 1;
      if (enemy.faction === 'royal' || enemy.faction === 'shadow') {
        p.reputations[enemy.faction] -= 1;
      }
      p.reputation = p.reputations[p.faction];
      this.onReputationChange?.({ ...p.reputations });

      const facShort: Record<FactionId, string> = {
        royal: '皇家',
        shadow: '天影',
        mercenary: '第三',
      };
      const repToast =
        enemy.faction === 'royal' || enemy.faction === 'shadow'
          ? `+1 ${facShort[p.faction]} · -1 ${facShort[enemy.faction]}`
          : `+1 ${facShort[p.faction]}聲望`;
      this.spawnText(enemy.x, enemy.y - 42, repToast, '#38BDF8', 1.05);

      p.score += 120 + p.comboCount * 15;
      this.factionScores[p.faction] += 25;
    }

    // 場上武器數量固定：只有非預設武器（非小槍／非小刀）會在持有者陣亡時掉回地面，防彈盾保留剩餘耐久
    let dropOffset = 0;
    if (enemy.gunKind !== 'pistol') {
      const gDef = GUNS.find((g) => g.kind === enemy.gunKind);
      if (gDef) {
        this.pickups.push({
          id: uid('dropgun'),
          x: enemy.x,
          y: enemy.y,
          kind: 'gun',
          label: gDef.name,
          color: gDef.color,
          gunDef: gDef,
          bobPhase: 0,
        });
        dropOffset = 18;
      }
    }
    if (enemy.meleeKind !== 'knife' && (enemy.meleeKind !== 'shield' || enemy.shieldDurability > 0)) {
      const mDef = MELEES.find((m) => m.kind === enemy.meleeKind);
      if (mDef) {
        this.pickups.push({
          id: uid('dropmelee'),
          x: clamp(enemy.x + dropOffset, TILE * 0.5, this.map.width - TILE * 0.5),
          y: enemy.y,
          kind: 'melee',
          label: mDef.name,
          color: mDef.color,
          meleeDef: mDef,
          durability: enemy.meleeKind === 'shield' ? Math.round(enemy.shieldDurability) : undefined,
          bobPhase: 0,
        });
      }
    }

    this.checkVictoryCondition();
    this.emitHud();
  }

  private damagePlayer(
    rawDmg: number,
    isMeleeAttack: boolean,
    attackerId?: string,
    hitOriginX?: number,
    hitOriginY?: number
  ) {
    const p = this.player;
    if (p.hp <= 0 || p.invulnTimer > 0) return;

    if (p.royalShieldTimer > 0 && !isMeleeAttack) {
      this.spawnText(p.x, p.y - 38, '護盾免疫!', '#38BDF8', 1.0);
      return;
    }

    if (p.shadowCloneTimer > 0) {
      if (isMeleeAttack) {
        p.shadowCloneTimer = 0;
        this.spawnText(p.x, p.y - 44, '近戰破除影分身!', '#FB7185', 1.15);
      } else if (Math.random() < 2 / 3) {
        this.spawnText(p.x, p.y - 38, 'MISS', '#FB7185', 1.15);
        return;
      }
    }

    let dmg = rawDmg * (1 - p.armor);
    if (p.royalShieldTimer > 0 && isMeleeAttack) dmg *= 0.8;
    if (p.shrinkTimer > 0 && isMeleeAttack) dmg *= 1.35;
    if (p.giantTimer > 0) dmg *= 0.9;

    let finalDmg = Math.max(2, Math.round(dmg));

    // 手持盾牌且攻擊來自正面時才能格擋
    const weapon = p.weapons[p.activeHand];
    if (weapon.type === 'melee' && weapon.def.kind === 'shield' && weapon.durability > 0) {
      const originPos =
        hitOriginX !== undefined && hitOriginY !== undefined
          ? { x: hitOriginX, y: hitOriginY }
          : attackerId
            ? (() => {
                const ae = this.enemies.find((e) => e.id === attackerId);
                return ae ? { x: ae.x, y: ae.y } : null;
              })()
            : null;
      const frontalBlocked = originPos
        ? this.isFrontalShieldBlock(p.x, p.y, p.angle, originPos.x, originPos.y)
        : true;
      if (frontalBlocked) {
        if (!isMeleeAttack) {
          const absorbed = Math.min(weapon.durability, finalDmg);
          weapon.durability = Math.max(0, weapon.durability - absorbed);
          finalDmg -= absorbed;
          if (absorbed > 0) {
            this.spawnText(
              p.x,
              p.y - 36,
              weapon.durability === 0 ? '護盾碎裂!' : `盾擋 -${absorbed}`,
              weapon.durability === 0 ? '#F59E0B' : '#38BDF8',
              0.95
            );
          }
        } else {
          const halfDmg = Math.max(1, Math.round(finalDmg * 0.5));
          const blockedAmt = Math.max(1, finalDmg - halfDmg);
          weapon.durability = Math.max(0, weapon.durability - blockedAmt);
          finalDmg = halfDmg;
          this.spawnText(
            p.x,
            p.y - 36,
            weapon.durability === 0 ? '護盾碎裂!' : `盾格減半`,
            weapon.durability === 0 ? '#F59E0B' : '#38BDF8',
            0.95
          );
        }
        if (weapon.durability <= 0) {
          p.weapons[p.activeHand] = { type: 'melee', def: DEFAULT_KNIFE, durability: 0 };
          this.cancelMeleeCharge();
        }
      }
    }

    if (finalDmg > 0) {
      p.hp -= finalDmg;
      this.spawnText(p.x, p.y - 34, `-${finalDmg}`, '#F43F5E', 1.05);
      if (attackerId) {
        const ae = this.enemies.find((e) => e.id === attackerId);
        if (ae && ae.vampireTimer > 0) {
          ae.hp = Math.min(ae.maxHp, ae.hp + Math.max(1, Math.round(finalDmg * (isMeleeAttack ? 0.5 : 1 / 3))));
        }
      }
    }

    p.invulnTimer = finalDmg > 0 ? 0.2 : 0.08;
    this.camera.shake = Math.min(12, this.camera.shake + (finalDmg > 0 ? 5.5 : 2.0));
    if (p.hp <= 0) {
      this.handlePlayerDeath();
    } else {
      sfx.playerHurt();
      this.emitHud();
    }
  }

  private handlePlayerDeath() {
    const p = this.player;
    p.hp = 0;
    p.lives -= 1;
    this.clearInputs();
    sfx.playerDown();

    const droppedFirst = this.dropWeapon(p.weapons[0], p.x, p.y);
    const secondX = droppedFirst ? clamp(p.x + 18, TILE * 0.5, this.map.width - TILE * 0.5) : p.x;
    this.dropWeapon(p.weapons[1], secondX, p.y);

    if (p.lives > 0) {
      this.status = 'RESPAWNING';
      this.respawnTimer = RESPAWN_DELAY_SECONDS;
      this.spawnBurst(p.x, p.y, FACTIONS[p.faction].accentHex, 16);
    } else {
      this.status = 'GAME_OVER';
    }
    this.emitHud();
  }

  private respawnPlayer() {
    const p = this.player;
    this.status = 'PLAYING';
    this.clearInputs();
    sfx.playerRespawn();
    if (this.deploymentQueue[p.faction] > 0) this.deploymentQueue[p.faction] -= 1;
    for (const enemy of this.enemies) {
      if (enemy.visibleTargetId !== 'player') continue;
      enemy.visibleTargetId = null;
      enemy.chargingSkillTimer = 0;
    }
    const spawnPt = this.map.factionSpawns[p.faction][0];
    p.x = spawnPt.x;
    p.y = spawnPt.y;
    p.vx = 0;
    p.vy = 0;
    p.elevation = this.getWalkableElevation(p.x, p.y);
    p.onHighGround = p.elevation >= 1.0;
    p.weapons = [defaultWeaponForHand(0), defaultWeaponForHand(1)];
    p.activeHand = 0;
    p.swapTimer = 0;
    p.swapDuration = 0;
    p.attackAnimTimer = 0;
    p.attackAnimDuration = 0;
    p.attackAnimKind = null;
    p.attackCooldown = 0;
    p.royalShieldTimer = 0;
    p.eagleEyeTimer = 0;
    p.shadowCloneTimer = 0;
    p.vampireTimer = 0;
    p.shrinkTimer = 0;
    p.giantTimer = 0;
    p.sizeScale = 1;
    p.radius = p.baseRadius;
    p.hp = p.maxHp;
    p.qi = p.maxQi;
    p.reserveAmmo = 30;
    this.resetGunFeedback();
    this.distanceSinceStep = 0;
    p.moveIntensity = 0;
    p.delayCancelReady = false;
    p.comboEmpowerTimer = 0;
    p.invulnTimer = 2.4;

    const respawnCam = this.clampCameraToMap(p.x, p.y, this.viewport.width, this.viewport.height);
    this.camera.x = respawnCam.x;
    this.camera.y = respawnCam.y;
    this.spawnBurst(p.x, p.y, '#FFFFFF', 14);
    this.showBanner(`出生點復活！變回小槍／小刀 · 剩餘生命：${p.lives} 條`, 2.5);
    this.emitHud();
  }

  private pickRandomArchetype(): EnemyArchetype {
    const r = Math.random();
    if (r > 0.78) return 'heavy';
    if (r > 0.58) return 'phantom';
    if (r > 0.38) return 'sniper';
    if (r > 0.18) return 'rusher';
    return 'trooper';
  }

  /**
   * 電腦士兵標準化：全部固定 100 血，外觀與名稱直接從所屬陣營角色池選取，
   * 出身一律配備「制式小槍 + 戰術小刀」，後續可透過尋路主動拾取地圖上的武器並依戰況邏輯切換武器！
   */
  private createEnemy(
    arch: EnemyArchetype,
    faction: FactionId,
    isAllyFlag: boolean,
    x: number,
    y: number
  ): EnemyEntity {
    const facColor = FACTIONS[faction].accentHex;
    const roster = FACTION_CHARACTERS[faction];
    const usedIds = new Set<string>(
      this.enemies.filter((oe) => oe.faction === faction).map((oe) => oe.characterSkin.id)
    );
    if (this.player.faction === faction) {
      usedIds.add(this.player.characterSkin.id);
    }
    const availableSkins = roster.filter((c) => !usedIds.has(c.id));
    const pool = availableSkins.length > 0 ? availableSkins : roster;
    const pickedSkin = pool[Math.floor(Math.random() * pool.length)];

    const speedPresets: Record<EnemyArchetype, number> = {
      trooper: 148,
      rusher: 162,
      sniper: 142,
      phantom: 158,
      heavy: 140,
    };

    const baseSpeed = speedPresets[arch];
    const startGunDef = GUNS.find((g) => g.kind === 'pistol') || GUNS[0];
    const entityId = uid('enemy');
    this.enemyMagState.set(entityId, {
      ammo: startGunDef.magSize,
      reloadTimer: 0,
      reloadDur: startGunDef.reloadTime,
    });
    const trulyAlly = isAllyFlag && faction !== 'mercenary' && faction === this.player.faction;
    const elev = this.getWalkableElevation(x, y);
    return {
      id: entityId,
      name: pickedSkin.name,
      archetype: arch,
      faction,
      isAlly: trulyAlly,
      activeSlot: 'gun',
      gunKind: 'pistol',
      meleeKind: 'knife',
      x,
      y,
      vx: 0,
      vy: 0,
      baseRadius: CHAR_BASE_RADIUS,
      radius: CHAR_BASE_RADIUS,
      sizeScale: 1,
      angle: 0,
      walkPhase: 0,
      moveIntensity: 0,
      elevation: elev,
      hp: 100, // 所有電腦角色皆為 100 血
      maxHp: 100,
      shieldDurability: 0,
      speed: baseSpeed,
      damage: startGunDef.damage,
      attackCooldown: 0.7 + Math.random() * 0.5,
      skillCooldown: 3.5 + Math.random() * 3.0,
      chargingSkillTimer: 0,
      aiTimer: Math.random() * 2,
      lastSeenTargetPos: null,
      alertTimer: 0,
      hasLosToTarget: false,
      visibleTargetId: null,
      reactionTimer: 0,
      focusedTargetId: null,
      aggroLockTimer: 0,
      pathTiles: [],
      pathTimer: 0,
      patrolAnchor: { x, y },
      patrolTarget: null,
      patrolTimer: 0,
      royalShieldTimer: 0,
      eagleEyeTimer: 0,
      shadowCloneTimer: 0,
      vampireTimer: 0,
      shrinkTimer: 0,
      giantTimer: 0,
      blindTimer: 0,
      stunTimer: 0,
      hitFlash: 0,
      gunfireTimer: 0,
      attackAnimTimer: 0,
      attackAnimDuration: 0,
      attackAnimKind: null,
      onHighGround: elev >= 1.0,
      color: facColor,
      characterSkin: pickedSkin,
    };
  }

  private getLightestWeaponSlot(gunKind: GunKind, meleeKind: MeleeKind): WeaponSlot {
    const gunDef = GUNS.find((g) => g.kind === gunKind) || GUNS[0];
    const meleeDef = MELEES.find((m) => m.kind === meleeKind) || MELEES[0];
    return meleeDef.moveSpeedMult >= gunDef.moveSpeedMult ? 'melee' : 'gun';
  }

  private isPickupEligibleForEnemy(e: EnemyEntity, pk: PickupItem): boolean {
    if (pk.kind === 'gun' && pk.gunDef) {
      return e.gunKind === 'pistol' && pk.gunDef.kind !== 'pistol';
    }
    if (pk.kind === 'melee' && pk.meleeDef) {
      return e.meleeKind === 'knife' && pk.meleeDef.kind !== 'knife';
    }
    return false;
  }

  private findNearestEligibleWeaponPickup(e: EnemyEntity): PickupItem | null {
    if (e.gunKind !== 'pistol' && e.meleeKind !== 'knife') return null;
    let best: PickupItem | null = null;
    let bestD = Infinity;
    for (const pk of this.pickups) {
      if (!this.isPickupEligibleForEnemy(e, pk)) continue;
      const d = dist(e.x, e.y, pk.x, pk.y);
      if (d < bestD) {
        bestD = d;
        best = pk;
      }
    }
    return best;
  }

  private enemyTryPickupWeapon(e: EnemyEntity) {
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (!this.isPickupEligibleForEnemy(e, pk)) continue;
      if (dist(e.x, e.y, pk.x, pk.y) <= e.radius + 16) {
        this.pickups.splice(i, 1);
        if (pk.kind === 'gun' && pk.gunDef) {
          if (e.gunKind !== 'pistol' && e.gunKind !== pk.gunDef.kind) {
            const oldDef = GUNS.find((g) => g.kind === e.gunKind);
            if (oldDef) {
              this.pickups.push({
                id: uid('dropgun'),
                x: pk.x,
                y: pk.y,
                kind: 'gun',
                label: oldDef.name,
                color: oldDef.color,
                gunDef: oldDef,
                bobPhase: 0,
              });
            }
          }
          e.gunKind = pk.gunDef.kind;
          e.damage = pk.gunDef.damage;
          this.enemyMagState.set(e.id, {
            ammo: pk.gunDef.magSize,
            reloadTimer: 0,
            reloadDur: pk.gunDef.reloadTime,
          });
        } else if (pk.kind === 'melee' && pk.meleeDef) {
          if (
            e.meleeKind !== 'knife' &&
            (e.meleeKind !== pk.meleeDef.kind || e.meleeKind === 'shield') &&
            (e.meleeKind !== 'shield' || e.shieldDurability > 0)
          ) {
            const oldDef = MELEES.find((m) => m.kind === e.meleeKind);
            if (oldDef) {
              this.pickups.push({
                id: uid('dropmelee'),
                x: pk.x,
                y: pk.y,
                kind: 'melee',
                label: oldDef.name,
                color: oldDef.color,
                meleeDef: oldDef,
                durability: e.meleeKind === 'shield' ? Math.round(e.shieldDurability) : undefined,
                bobPhase: 0,
              });
            }
          }
          e.meleeKind = pk.meleeDef.kind;
          e.shieldDurability = pk.meleeDef.kind === 'shield' ? clamp(pk.durability ?? 100, 1, 100) : 0;
        }
        e.pathTiles = [];
        e.pathTimer = 0;
        break;
      }
    }
  }

  private spawnBurst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 2 + Math.random() * 3.5,
        color,
        life: 0.25 + Math.random() * 0.25,
        maxLife: 0.5,
      });
    }
  }

  private spawnText(x: number, y: number, text: string, color: string, scale = 1) {
    this.floatingTexts.push({
      x,
      y,
      vy: -38,
      text,
      color,
      life: 0.85,
      maxLife: 0.85,
      scale,
    });
  }

  private isBattleActive() {
    return this.status === 'PLAYING' || this.status === 'RESPAWNING';
  }

  private updateReloads(dt: number) {
    const p = this.player;
    for (const weapon of p.weapons) {
      if (weapon.type !== 'gun' || weapon.reloadTimer <= 0) continue;
      const previousProgress = 1 - weapon.reloadTimer / weapon.def.reloadTime;
      weapon.reloadTimer = Math.max(0, weapon.reloadTimer - dt);
      const progress = 1 - weapon.reloadTimer / weapon.def.reloadTime;
      for (const cue of RELOAD_CUES) {
        if (previousProgress < cue.progress && progress >= cue.progress) {
          sfx.reload(weapon.def.kind, cue.phase);
        }
      }
      if (weapon.reloadTimer > 0) continue;

      const needed = Math.min(weapon.def.magSize - weapon.ammoInMag, p.reserveAmmo);
      weapon.ammoInMag += needed;
      p.reserveAmmo -= needed;
      sfx.reload(weapon.def.kind, 'ready');
      this.emitHud();
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.gunfireTimer = Math.max(0, p.gunfireTimer - dt);
    p.swapTimer = Math.max(0, p.swapTimer - dt);
    p.attackAnimTimer = Math.max(0, p.attackAnimTimer - dt);
    if (p.attackAnimTimer === 0) p.attackAnimKind = null;
    p.royalShieldTimer = Math.max(0, p.royalShieldTimer - dt);
    p.eagleEyeTimer = Math.max(0, p.eagleEyeTimer - dt);
    p.shadowCloneTimer = Math.max(0, p.shadowCloneTimer - dt);
    p.vampireTimer = Math.max(0, p.vampireTimer - dt);
    p.shrinkTimer = Math.max(0, p.shrinkTimer - dt);
    p.giantTimer = Math.max(0, p.giantTimer - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.comboEmpowerTimer = Math.max(0, p.comboEmpowerTimer - dt);
    if (p.comboTimer > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) p.comboCount = 0;
    }

    p.sizeScale = p.shrinkTimer > 0 ? 0.62 : p.giantTimer > 0 ? 1.32 : 1.0;
    p.radius = p.baseRadius * p.sizeScale;

    // 視窗縮放：固定維持上下約 15 格、左右約 19 格（鷹眼不縮小視野，改以鏡頭隨游標前移偵察）
    const baseZoom = (this.viewport.width / (19 * TILE) + this.viewport.height / (15 * TILE)) / 2;
    const targetZoom = baseZoom;
    this.camera.zoom += (targetZoom - this.camera.zoom) * Math.min(1, dt * 6);

    // 聲望越高，集氣與回氣速度越快（依當前出戰陣營之獨立聲望計算）
    const activeRep = p.reputations[p.faction];
    p.reputation = activeRep;
    const repSpeedMult = getReputationQiMultiplier(activeRep);
    if (p.chargingMelee && this.chargeSessionAllowed) {
      if (p.qi > 0) {
        p.qi = Math.max(0, p.qi - 115 * repSpeedMult * dt);
        if (p.qi === 0) {
          p.chargeReady = true;
          sfx.setMeleeCharge(null);
          sfx.meleeReady();
        } else {
          sfx.setMeleeCharge(1 - p.qi / p.maxQi);
        }
      } else {
        p.chargeReady = true;
      }
    } else {
      p.qi = Math.min(p.maxQi, p.qi + (24 + p.qiRegenBonus) * repSpeedMult * dt);
    }

    const weapon = p.weapons[p.activeHand];
    this.crosshairBloom = Math.max(0, this.crosshairBloom - GUN_AIM.bloomRecovery * dt);

    this.updateReloads(dt);

    const mv = this.getMoveVector();
    const weaponSpeedMult = weapon.def.moveSpeedMult;
    const baseSpeed = PLAYER_MOVEMENT.speed * (1 + p.speedBonus) * weaponSpeedMult;
    const prevPlayerX = p.x;
    const prevPlayerY = p.y;
    const moved = this.moveCharacterWithElevation(
      p.x,
      p.y,
      p.elevation,
      mv.x * baseSpeed * dt,
      mv.y * baseSpeed * dt,
      p.radius
    );
    p.x = moved.x;
    p.y = moved.y;
    p.elevation = moved.elevation;
    p.onHighGround = p.elevation >= 1.0;

    const { x: worldMouseX, y: worldMouseY } = this.getWorldPointer();
    p.angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
    const playerMovedDist = dist(prevPlayerX, prevPlayerY, p.x, p.y);
    if (playerMovedDist > 0.12) {
      this.distanceSinceStep += playerMovedDist;
      if (this.distanceSinceStep >= PLAYER_MOVEMENT.stepDistance) {
        this.distanceSinceStep %= PLAYER_MOVEMENT.stepDistance;
        sfx.footstep(this.getFootstepSurface(p.x, p.y));
      }
      p.walkPhase += playerMovedDist * 0.085;
      p.moveIntensity = Math.min(1, p.moveIntensity + dt * 10);
    } else {
      p.moveIntensity = Math.max(0, p.moveIntensity - dt * 10);
    }

    if (this.mouseDown && weapon.type === 'gun' && weapon.ammoInMag > 0) {
      this.tryAttack();
    }
  }

  public update(dt: number, canvasWidth: number, canvasHeight: number) {
    this.viewport.width = canvasWidth;
    this.viewport.height = canvasHeight;
    if (!this.isBattleActive()) return;

    const respawningAtFrameStart = this.status === 'RESPAWNING';
    this.time += dt;
    if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    if (this.activeSkillBannerTimer > 0) this.activeSkillBannerTimer = Math.max(0, this.activeSkillBannerTimer - dt);
    if (this.camera.shake > 0) this.camera.shake = Math.max(0, this.camera.shake - dt * 26);

    if (!respawningAtFrameStart) this.updatePlayer(dt);

    this.map.ammoSpawns.forEach((as, idx) => {
      if (!as.active) {
        as.respawnTimer -= dt;
        if (as.respawnTimer <= 0) {
          as.active = true;
          as.respawnTimer = 0;
          this.pickups.push({
            id: uid('ammo_pad'),
            x: as.x,
            y: as.y,
            kind: 'ammo',
            label: '彈藥箱 (+30發)',
            color: '#60A5FA',
            amount: 30,
            bobPhase: 0,
            ammoSpawnIndex: idx,
          });
        }
      }
    });

    // 定期遞補陣亡的各陣營 10 人編制兵力（同陣營場上最多 2 人）
    this.spawnStaggerTimer += dt;
    if (this.spawnStaggerTimer >= 0.65) {
      this.spawnStaggerTimer = 0;
      this.refillFieldUpToCap();
    }

    this.updateEnemies(dt);
    if (!this.isBattleActive()) return;
    this.updateProjectiles(dt);
    if (!this.isBattleActive()) return;
    this.checkVictoryCondition();

    this.beams = this.beams.filter((b) => {
      b.life -= dt;
      return b.life > 0;
    });
    this.slashes = this.slashes.filter((s) => {
      s.life -= dt;
      return s.life > 0;
    });
    this.particles = this.particles.filter((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
      return pt.life > 0;
    });
    this.floatingTexts = this.floatingTexts.filter((ft) => {
      ft.y += ft.vy * dt;
      ft.life -= dt;
      return ft.life > 0;
    });

    for (const pk of this.pickups) {
      pk.bobPhase += dt * 4;
    }

    if (respawningAtFrameStart) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      if (this.respawnTimer === 0) this.respawnPlayer();
    } else if (this.status === 'PLAYING') {
      this.updateCamera(dt);
    }

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.06) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }
  }

  private updateCamera(dt: number) {
    const { width: canvasWidth, height: canvasHeight } = this.viewport;
    const p = this.player;
    let lookDist = 40;
    if (p.eagleEyeTimer > 0) {
      const { x: worldMouseX, y: worldMouseY } = this.getWorldPointer();
      const cursorWorldDist = dist(p.x, p.y, worldMouseX, worldMouseY);
      lookDist = clamp(cursorWorldDist * 0.48, 40, 260);
    }
    const lookX = Math.cos(p.angle) * lookDist;
    const lookY = Math.sin(p.angle) * lookDist;
    const targetCam = this.clampCameraToMap(p.x + lookX, p.y + lookY, canvasWidth, canvasHeight);
    if (this.time <= dt * 1.5) {
      this.camera.x = targetCam.x;
      this.camera.y = targetCam.y;
    } else {
      this.camera.x += (targetCam.x - this.camera.x) * Math.min(1, dt * 8);
      this.camera.y += (targetCam.y - this.camera.y) * Math.min(1, dt * 8);
    }
    const clampedCam = this.clampCameraToMap(this.camera.x, this.camera.y, canvasWidth, canvasHeight);
    this.camera.x = clampedCam.x;
    this.camera.y = clampedCam.y;
  }

  private nearbySoundVolume(x: number, y: number) {
    return Math.max(0, 1 - dist(x, y, this.player.x, this.player.y) / 500);
  }

  private getFootstepSurface(x: number, y: number): FootstepSurface {
    const tile = this.map.tileGrid[Math.floor(y / TILE)]?.[Math.floor(x / TILE)];
    if (tile?.style === 'wooden_plank' || this.map.bridges.some((bridge) => pointInRect(x, y, bridge))) return 'wood';
    if (tile?.style === 'grass_ground' || tile?.style === 'hill') return 'soft';
    if (tile?.style && tile.style !== 'default') return 'hard';
    return this.map.biome.endsWith('_outdoor') ? 'soft' : 'hard';
  }

  /**
   * 電腦士兵直線槍線射擊（即時顯示直線，碰到第一個角色或地形停止，絕不穿透多人）
   */
  private fireEnemyGunHitscan(e: EnemyEntity, aimAngle: number) {
    e.gunfireTimer = GUNFIRE_ANIMATION_SECONDS;
    sfx.gunshot(e.gunKind, this.nearbySoundVolume(e.x, e.y) * 0.45);
    if (e.royalShieldTimer > 0) {
      e.royalShieldTimer = 0; // 自己用遠程攻擊也會破盾！
      this.spawnText(e.x, e.y - 26, '遠程開火破盾', '#38BDF8', 0.9);
    }

    const muzzleX = e.x + Math.cos(aimAngle) * (e.radius + 4);
    const muzzleY = e.y + Math.sin(aimAngle) * (e.radius + 4);
    const pellets = e.gunKind === 'shotgun' ? 5 : 1;
    const spreadBase = e.eagleEyeTimer > 0 ? 0.025 : e.gunKind === 'sniper' ? 0.03 : 0.09;
    const maxRange = Math.hypot(this.map.width, this.map.height) + TILE * 2;
    const p = this.player;

    for (let i = 0; i < pellets; i++) {
      const a = aimAngle + (Math.random() - 0.5) * (spreadBase + (pellets > 1 ? 0.14 : 0));
      const seg = this.traceBulletSegment(muzzleX, muzzleY, a, maxRange, e.elevation);

      let segEndX = seg.x2;
      let segEndY = seg.y2;

      type Candidate =
        | { kind: 'player'; t: number; perpDist: number; hitX: number; hitY: number }
        | { kind: 'enemy'; enemy: EnemyEntity; t: number; perpDist: number; hitX: number; hitY: number };

      const candidates: Candidate[] = [];

      if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player') && p.elevation - e.elevation < 2.0) {
        const res = segmentCircleHit(seg.x1, seg.y1, seg.x2, seg.y2, p.x, p.y, p.radius);
        if (res.hit) {
          candidates.push({ kind: 'player', ...res });
        }
      }

      for (const other of this.enemies) {
        if (other.id === e.id) continue;
        if (!areHostile(e.faction, e.id, other.faction, other.id)) continue;
        if (other.elevation - e.elevation >= 2.0) continue;
        const res = segmentCircleHit(seg.x1, seg.y1, seg.x2, seg.y2, other.x, other.y, other.radius);
        if (res.hit) {
          candidates.push({ kind: 'enemy', enemy: other, ...res });
        }
      }

      candidates.sort((c1, c2) => c1.t - c2.t);
      if (candidates.length > 0) {
        const firstHit = candidates[0];
        segEndX = firstHit.hitX;
        segEndY = firstHit.hitY;

        const gunDef = GUNS.find((g) => g.kind === e.gunKind) || GUNS[0];
        const targetRadius = firstHit.kind === 'player' ? p.radius : firstHit.enemy.radius;
        const centerAccuracy = clamp(1 - firstHit.perpDist / targetRadius, 0, 1);
        const scaledDmg = Math.max(3, Math.round(gunDef.damage * (0.4 + 0.6 * centerAccuracy)));

        if (firstHit.kind === 'player') {
          this.damagePlayer(scaledDmg, false, e.id, e.x, e.y);
        } else {
          this.damageEnemy(
            firstHit.enemy,
            scaledDmg,
            false,
            Math.cos(a) * 80,
            Math.sin(a) * 80,
            centerAccuracy >= 0.8,
            false,
            e.id,
            e.faction,
            e.x,
            e.y
          );
        }
      }

      this.beams.push({
        x1: seg.x1,
        y1: seg.y1,
        x2: segEndX,
        y2: segEndY,
        color: e.color,
        life: e.gunKind === 'sniper' ? 0.14 : 0.085,
        maxLife: e.gunKind === 'sniper' ? 0.14 : 0.085,
        width: e.gunKind === 'sniper' ? 2.6 : 1.9,
      });
    }
  }

  /**
   * 電腦士兵施放陣營 × 近戰武器技能
   */
  private executeEnemyFactionSkill(e: EnemyEntity, aimAngle: number) {
    const fac = e.faction;
    const mk = e.meleeKind;
    const skillName = FACTIONS[fac].meleeSkills[mk].name;
    this.spawnText(e.x, e.y - 34, skillName, e.color, 1.05);

    if (mk === 'shield') {
      e.shieldDurability = 100;
      this.spawnBurst(e.x, e.y, '#38BDF8', 16);
      this.slashes.push({
        x: e.x,
        y: e.y,
        angle: aimAngle,
        arc: Math.PI * 2,
        reach: 130,
        color: '#38BDF8',
        life: 0.25,
        maxLife: 0.25,
        isUltimate: true,
        style: 'sweep',
      });
      const p = this.player;
      if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player') && dist(e.x, e.y, p.x, p.y) <= 130) {
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        const pushed = this.moveCharacterWithElevation(p.x, p.y, p.elevation, Math.cos(ang) * 44, Math.sin(ang) * 44, p.radius);
        p.x = pushed.x;
        p.y = pushed.y;
        p.elevation = pushed.elevation;
        this.damagePlayer(12, true, e.id, e.x, e.y);
      }
      for (const other of [...this.enemies]) {
        if (other.id === e.id) continue;
        if (!areHostile(e.faction, e.id, other.faction, other.id)) continue;
        if (dist(e.x, e.y, other.x, other.y) <= 130) {
          const ang = Math.atan2(other.y - e.y, other.x - e.x);
          this.damageEnemy(other, 14, true, Math.cos(ang) * 720, Math.sin(ang) * 720, false, true, e.id, e.faction, e.x, e.y);
          other.stunTimer = Math.max(other.stunTimer, 0.4);
        }
      }
      return;
    }

    if (fac === 'royal') {
      if (mk === 'knife') {
        e.royalShieldTimer = 5.5;
      } else if (mk === 'claw') {
        // 瞬移靠近敵人並閃光致盲
        const p = this.player;
        const targets: { x: number; y: number; r: number }[] = [];
        if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player')) {
          targets.push({ x: p.x, y: p.y, r: p.radius });
        }
        for (const other of this.enemies) {
          if (areHostile(e.faction, e.id, other.faction, other.id)) {
            targets.push({ x: other.x, y: other.y, r: other.radius });
          }
        }
        if (targets.length > 0) {
          targets.sort((a, b) => dist(e.x, e.y, a.x, a.y) - dist(e.x, e.y, b.x, b.y));
          const t = targets[0];
          const ang = Math.atan2(t.y - e.y, t.x - e.x);
          const safeSpot = this.findSafeTeleportSpot(
            t.x,
            t.y,
            ang,
            e.radius + t.r + 8,
            e.radius,
            e.x,
            e.y
          );
          e.x = safeSpot.x;
          e.y = safeSpot.y;
          e.elevation = this.getWalkableElevation(e.x, e.y);
        }
        this.slashes.push({
          x: e.x,
          y: e.y,
          angle: 0,
          arc: Math.PI * 2,
          reach: 160,
          color: '#FFFFFF',
          life: 0.22,
          maxLife: 0.22,
          isUltimate: true,
          style: 'sweep',
        });
        for (const other of this.enemies) {
          if (areHostile(e.faction, e.id, other.faction, other.id) && dist(e.x, e.y, other.x, other.y) <= 200) {
            other.blindTimer = Math.max(other.blindTimer, 0.7);
          }
        }
      } else {
        // 皇家大刀 5 發黃色光彈（會傷友軍）
        for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) {
          const a = aimAngle + off;
          this.projectiles.push({
            id: uid('elorb'),
            x: e.x + Math.cos(a) * 22,
            y: e.y + Math.sin(a) * 22,
            prevX: e.x,
            prevY: e.y,
            vx: Math.cos(a) * 520,
            vy: Math.sin(a) * 520,
            radius: 12,
            damage: 24,
            startElevation: e.elevation,
            minTraversedElevation: e.elevation,
            ownerId: e.id,
            ownerFaction: e.faction,
            fromPlayer: false,
            isAlly: e.isAlly,
            noFriendlyFire: false,
            color: '#FACC15',
            life: 1.15,
            maxLife: 1.15,
            pierce: 99,
            isLightOrb: true,
            hitIds: new Set(),
          });
        }
      }
      return;
    }

    if (fac === 'shadow') {
      if (mk === 'knife') {
        e.eagleEyeTimer = 6.5;
      } else if (mk === 'claw') {
        e.shadowCloneTimer = 5.5;
      } else {
        const dir = snapToEightDirections(aimAngle);
        const startX = e.x + dir.dx * 24;
        const startY = e.y + dir.dy * 24;
        this.projectiles.push({
          id: uid('edragon'),
          x: startX,
          y: startY,
          prevX: e.x,
          prevY: e.y,
          vx: dir.dx * 320,
          vy: dir.dy * 320,
          radius: 20,
          damage: 20,
          headDamage: 20,
          bodyDamage: 15,
          startElevation: e.elevation,
          minTraversedElevation: e.elevation,
          ownerId: e.id,
          ownerFaction: e.faction,
          fromPlayer: false,
          isAlly: e.isAlly,
          noFriendlyFire: true,
          color: '#312E81',
          life: 3.2,
          maxLife: 3.2,
          pierce: 99,
          isWave: true,
          isBlackDragon: true,
          segments: [{ x: startX, y: startY }],
          bouncesLeft: 5,
          distanceTraveled: 0,
          maxDistance: 950,
          targetHitCooldowns: {},
          hitIds: new Set(),
        });
      }
      return;
    }

    if (mk === 'knife') {
      e.vampireTimer = 6.5;
    } else if (mk === 'claw') {
      e.giantTimer = 0;
      e.shrinkTimer = 6.5;
    } else {
      e.shrinkTimer = 0;
      e.giantTimer = 6.5;
    }
  }

  private choosePatrolTarget(enemy: EnemyEntity): { x: number; y: number } | null {
    const start = this.findNearestStandableTile(Math.floor(enemy.x / TILE), Math.floor(enemy.y / TILE));
    if (start === null) return null;
    const { cols } = this.map;
    const queue = [{ tile: start, steps: 0 }];
    const visited = new Set([start]);
    const candidates: { x: number; y: number }[] = [];
    for (let i = 0; i < queue.length; i++) {
      const { tile, steps } = queue[i];
      const x = (tile % cols + 0.5) * TILE;
      const y = (Math.floor(tile / cols) + 0.5) * TILE;
      if (
        steps > 0 && dist(enemy.x, enemy.y, x, y) >= TILE * 0.75 &&
        dist(enemy.patrolAnchor.x, enemy.patrolAnchor.y, x, y) <= AI_PATROL.radius
      ) {
        candidates.push({ x, y });
      }
      if (steps === AI_PATROL.searchSteps) continue;
      for (const next of this.navAdj.get(tile) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push({ tile: next, steps: steps + 1 });
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }

  private getPatrolGoal(enemy: EnemyEntity, dt: number) {
    enemy.patrolTimer -= dt;
    const arrived = enemy.patrolTarget &&
      dist(enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y) < AI_PATROL.arrivalDistance;
    if (enemy.patrolTimer <= 0 || arrived) {
      if (dist(enemy.x, enemy.y, enemy.patrolAnchor.x, enemy.patrolAnchor.y) > AI_PATROL.radius) {
        enemy.patrolAnchor = { x: enemy.x, y: enemy.y };
      }
      enemy.patrolTarget = this.choosePatrolTarget(enemy);
      enemy.patrolTimer = enemy.patrolTarget ? AI_PATROL.legSeconds : AI_PATROL.retrySeconds;
      enemy.pathTimer = 0;
    }
    return enemy.patrolTarget;
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of [...this.enemies]) {
      if (!this.isBattleActive()) return;
      if (e.hp <= 0) continue;
      const combat = AI_COMBAT[e.archetype];
      e.gunfireTimer = Math.max(0, e.gunfireTimer - dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.attackAnimTimer = Math.max(0, e.attackAnimTimer - dt);
      if (e.attackAnimTimer === 0) e.attackAnimKind = null;
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.skillCooldown = Math.max(0, e.skillCooldown - dt);
      e.royalShieldTimer = Math.max(0, e.royalShieldTimer - dt);
      e.eagleEyeTimer = Math.max(0, e.eagleEyeTimer - dt);
      e.shadowCloneTimer = Math.max(0, e.shadowCloneTimer - dt);
      e.vampireTimer = Math.max(0, e.vampireTimer - dt);
      e.shrinkTimer = Math.max(0, e.shrinkTimer - dt);
      e.giantTimer = Math.max(0, e.giantTimer - dt);
      e.aiTimer += dt;
      e.alertTimer = Math.max(0, e.alertTimer - dt);
      e.aggroLockTimer = Math.max(0, e.aggroLockTimer - dt);
      e.pathTimer = Math.max(0, e.pathTimer - dt);

      const mag = this.enemyMagState.get(e.id);
      if (mag && mag.reloadTimer > 0) {
        mag.reloadTimer -= dt;
        if (mag.reloadTimer <= 0) {
          mag.reloadTimer = 0;
          const gunDef = GUNS.find((g) => g.kind === e.gunKind) || GUNS[0];
          mag.ammo = gunDef.magSize;
        }
      }

      e.sizeScale = e.shrinkTimer > 0 ? 0.62 : e.giantTimer > 0 ? 1.32 : 1.0;
      e.radius = e.baseRadius * e.sizeScale;

      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
        e.visibleTargetId = null;
        e.chargingSkillTimer = 0;
        continue;
      }

      if (e.blindTimer > 0) {
        e.blindTimer = Math.max(0, e.blindTimer - dt);
        e.angle += dt * 7;
        e.hasLosToTarget = false;
        e.visibleTargetId = null;
        e.chargingSkillTimer = 0;
        continue;
      }

      // 敵人基礎視野半徑調整為 8 格（鷹眼／狙擊手半徑 9.5 格）
      const sightRange = (e.eagleEyeTimer > 0 || e.gunKind === 'sniper' ? 9.5 : 8.0) * TILE;

      // 確認當前追擊對象是否仍存活且敵對
      if (e.focusedTargetId) {
        if (e.focusedTargetId === 'player') {
          if (p.hp <= 0 || !areHostile(e.faction, e.id, p.faction, 'player')) {
            e.focusedTargetId = null;
            e.lastSeenTargetPos = null;
            e.alertTimer = 0;
            e.pathTiles = [];
          }
        } else {
          const ft = this.enemies.find((oe) => oe.id === e.focusedTargetId);
          if (!ft || !areHostile(e.faction, e.id, ft.faction, ft.id)) {
            e.focusedTargetId = null;
            e.pathTiles = [];
          }
        }
      }

      type VisibleCandidate = {
        id: string;
        isPlayer: boolean;
        entity: EnemyEntity | null;
        x: number;
        y: number;
        elev: number;
        d: number;
      };
      const visibleHostiles: VisibleCandidate[] = [];

      if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player')) {
        if (this.hasLineOfSight(e.x, e.y, e.elevation, p.x, p.y, p.elevation, sightRange)) {
          visibleHostiles.push({
            id: 'player',
            isPlayer: true,
            entity: null,
            x: p.x,
            y: p.y,
            elev: p.elevation,
            d: dist(e.x, e.y, p.x, p.y),
          });
        }
      }

      for (const other of this.enemies) {
        if (!areHostile(e.faction, e.id, other.faction, other.id)) continue;
        if (this.hasLineOfSight(e.x, e.y, e.elevation, other.x, other.y, other.elevation, sightRange)) {
          visibleHostiles.push({
            id: other.id,
            isPlayer: false,
            entity: other,
            x: other.x,
            y: other.y,
            elev: other.elevation,
            d: dist(e.x, e.y, other.x, other.y),
          });
        }
      }

      visibleHostiles.sort((a, b) => a.d - b.d);

      let chosenVisible: VisibleCandidate | null = null;
      if (visibleHostiles.length > 0) {
        const focusedVis = e.focusedTargetId
          ? visibleHostiles.find((v) => v.id === e.focusedTargetId) || null
          : null;
        if (focusedVis && (e.aggroLockTimer > 0 || visibleHostiles[0].d >= focusedVis.d * 0.65)) {
          chosenVisible = focusedVis;
        } else {
          chosenVisible = visibleHostiles[0];
          e.focusedTargetId = chosenVisible.id;
          e.aggroLockTimer = 3.0;
        }
      }

      const bestLosDist = chosenVisible ? chosenVisible.d : Infinity;
      const losTargetPos = chosenVisible
        ? { x: chosenVisible.x, y: chosenVisible.y, elev: chosenVisible.elev }
        : null;
      const targetIsPlayer = Boolean(chosenVisible?.isPlayer);
      const targetEntity = chosenVisible?.entity || null;

      e.hasLosToTarget = Boolean(losTargetPos);
      const visibleTargetId = chosenVisible?.id ?? null;
      if (e.visibleTargetId !== visibleTargetId) {
        e.visibleTargetId = visibleTargetId;
        e.reactionTimer = visibleTargetId ? combat.reactionSeconds : 0;
        e.chargingSkillTimer = 0;
      } else {
        e.reactionTimer = Math.max(0, e.reactionTimer - dt);
      }
      const readyToAttack = Boolean(visibleTargetId) && e.reactionTimer === 0;

      if (losTargetPos) {
        e.lastSeenTargetPos = { x: losTargetPos.x, y: losTargetPos.y };
        e.alertTimer = 6.5;
      }

      const canHitRanged = losTargetPos
        ? this.canRangedHitTarget(e.x, e.y, e.elevation, losTargetPos.x, losTargetPos.y, losTargetPos.elev)
        : false;
      const isCloseMeleeRange = Boolean(
        losTargetPos && bestLosDist <= 74 && Math.abs(e.elevation - losTargetPos.elev) <= 1.0
      );
      const lightestSlot = this.getLightestWeaponSlot(e.gunKind, e.meleeKind);

      // 武器切換邏輯：
      // - 貼身近戰距離且高度可及 -> 切近武
      // - 持盾敵人於裝彈或中近距受傷推進時，主動切出盾牌進行正面防禦
      // - 有一定距離且槍彈可射中目標 -> 切遠程槍械射擊
      // - 因高低差或地形阻擋攻擊不到目標／無視線追擊／趕路撿武 -> 切換最輕武器加速追擊！
      const enemyHasShield = e.meleeKind === 'shield' && e.shieldDurability > 0;
      const shouldRaiseShield =
        enemyHasShield &&
        Boolean(losTargetPos) &&
        ((mag && mag.reloadTimer > 0) || (bestLosDist <= 155 && e.hp < 55));
      if (isCloseMeleeRange || shouldRaiseShield) {
        e.activeSlot = 'melee';
      } else if (losTargetPos && canHitRanged) {
        e.activeSlot = 'gun';
      } else {
        e.activeSlot = lightestSlot;
      }

      // 必須手持近戰武器才能集氣和施放技能
      if (e.activeSlot === 'gun') e.chargingSkillTimer = 0;
      if (e.chargingSkillTimer > 0) {
        e.chargingSkillTimer -= dt;
        if (e.chargingSkillTimer <= 0) {
          e.chargingSkillTimer = 0;
          e.skillCooldown = 7.5 + Math.random() * 3.5;
          const castAng = losTargetPos
            ? Math.atan2(losTargetPos.y - e.y, losTargetPos.x - e.x)
            : e.angle;
          this.executeEnemyFactionSkill(e, castAng);
        }
        continue;
      }

      if (
        e.activeSlot === 'melee' &&
        e.skillCooldown <= 0 &&
        (readyToAttack || (!losTargetPos && e.meleeKind === 'shield' && e.shieldDurability <= 45))
      ) {
        e.chargingSkillTimer = 0.65;
        continue;
      }

      let desiredX = e.x;
      let desiredY = e.y;
      let moveFactor = 0;
      let astarGoal: { x: number; y: number } | null = null;
      let patrolling = false;
      if (!losTargetPos && e.lastSeenTargetPos && dist(e.x, e.y, e.lastSeenTargetPos.x, e.lastSeenTargetPos.y) < 24) {
        e.patrolAnchor = { x: e.x, y: e.y };
        e.patrolTimer = 0;
        e.lastSeenTargetPos = null;
      }
      const desiredPickup = this.findNearestEligibleWeaponPickup(e);

      if (losTargetPos) {
        const aimAngle = Math.atan2(losTargetPos.y - e.y, losTargetPos.x - e.x);
        e.angle = aimAngle;

        const desiredRange =
          !canHitRanged
            ? 44
            : e.meleeKind === 'claw' || e.meleeKind === 'greatsword'
              ? 135
              : e.gunKind === 'sniper'
                ? AI_COMBAT.sniper.preferredRange
                : combat.preferredRange;

        const hasElevGap = Math.abs(e.elevation - losTargetPos.elev) > 0.5;
        if (!canHitRanged || bestLosDist > desiredRange + 24 || hasElevGap) {
          astarGoal = { x: losTargetPos.x, y: losTargetPos.y };
          desiredX = losTargetPos.x;
          desiredY = losTargetPos.y;
          moveFactor = 1.0;
        } else if (bestLosDist < desiredRange - 55) {
          desiredX = e.x - Math.cos(aimAngle) * 120;
          desiredY = e.y - Math.sin(aimAngle) * 120;
          moveFactor = 0.65;
        } else {
          const strafe = aimAngle + (Math.sin(e.aiTimer * 2.1) > 0 ? Math.PI / 2 : -Math.PI / 2);
          desiredX = e.x + Math.cos(strafe) * 80;
          desiredY = e.y + Math.sin(strafe) * 80;
          moveFactor = 0.5;
        }
      } else if (e.lastSeenTargetPos && (e.alertTimer > 0 || e.aggroLockTimer > 0)) {
        astarGoal = e.lastSeenTargetPos;
        desiredX = astarGoal.x;
        desiredY = astarGoal.y;
        e.angle = Math.atan2(desiredY - e.y, desiredX - e.x);
        moveFactor = 1.05;
      } else if (desiredPickup) {
        // 主動利用 A* 尋路前往地圖武器位置拾取升級裝備
        astarGoal = { x: desiredPickup.x, y: desiredPickup.y };
        desiredX = desiredPickup.x;
        desiredY = desiredPickup.y;
        e.angle = Math.atan2(desiredY - e.y, desiredX - e.x);
        moveFactor = 0.95;
      } else if (e.isAlly && p.hp > 0 && dist(e.x, e.y, p.x, p.y) > 130) {
        astarGoal = { x: p.x, y: p.y };
        desiredX = p.x;
        desiredY = p.y;
        e.angle = Math.atan2(desiredY - e.y, desiredX - e.x);
        moveFactor = 0.85;
      } else {
        const patrolGoal = this.getPatrolGoal(e, dt);
        if (patrolGoal) {
          patrolling = true;
          astarGoal = patrolGoal;
          desiredX = patrolGoal.x;
          desiredY = patrolGoal.y;
          moveFactor = AI_PATROL.speedMultiplier;
        }
      }

      // 使用 A* 路徑導航跨越高低差、階梯與橋樑
      if (moveFactor > 0 && astarGoal) {
        if (e.pathTimer <= 0 || e.pathTiles.length === 0) {
          e.pathTiles = this.findPathAStar(e.x, e.y, astarGoal.x, astarGoal.y);
          e.pathTimer = 0.35;
        }
        while (e.pathTiles.length > 1) {
          const wp = e.pathTiles[0];
          const wpX = (wp.gx + 0.5) * TILE;
          const wpY = (wp.gy + 0.5) * TILE;
          if (dist(e.x, e.y, wpX, wpY) < 16) {
            e.pathTiles.shift();
          } else {
            break;
          }
        }
        if (e.pathTiles.length > 0) {
          const curTileGx = Math.floor(e.x / TILE);
          const curTileGy = Math.floor(e.y / TILE);
          if (e.pathTiles.length > 1 && e.pathTiles[0].gx === curTileGx && e.pathTiles[0].gy === curTileGy) {
            e.pathTiles.shift();
          }
          const nextWp = e.pathTiles[0];
          desiredX = (nextWp.gx + 0.5) * TILE;
          desiredY = (nextWp.gy + 0.5) * TILE;
          if (!losTargetPos && !patrolling) {
            e.angle = Math.atan2(desiredY - e.y, desiredX - e.x);
          }
        }
      }

      if (patrolling) {
        const forward = Math.atan2(desiredY - e.y, desiredX - e.x);
        const scanAngle = forward + Math.sin(e.aiTimer * 2.6) * 0.42;
        const turn = AI_PATROL.turnSpeed * dt;
        e.angle += clamp(angleDiff(e.angle, scanAngle), -turn, turn);
      }

      const prevEX = e.x;
      const prevEY = e.y;
      if (moveFactor > 0) {
        const heldGunDef = GUNS.find((g) => g.kind === e.gunKind) || GUNS[0];
        const heldMeleeDef = MELEES.find((m) => m.kind === e.meleeKind) || MELEES[0];
        const weaponSpeedMult = e.activeSlot === 'melee' ? heldMeleeDef.moveSpeedMult : heldGunDef.moveSpeedMult;
        const moveAng = Math.atan2(desiredY - e.y, desiredX - e.x);
        const stepDist = e.speed * weaponSpeedMult * moveFactor * dt;
        const moved = this.moveCharacterWithElevation(
          e.x,
          e.y,
          e.elevation,
          Math.cos(moveAng) * stepDist,
          Math.sin(moveAng) * stepDist,
          e.radius
        );
        if (dist(e.x, e.y, moved.x, moved.y) < stepDist * 0.25) {
          const alt1 = this.moveCharacterWithElevation(
            e.x,
            e.y,
            e.elevation,
            Math.cos(moveAng + 1.1) * stepDist,
            Math.sin(moveAng + 1.1) * stepDist,
            e.radius
          );
          const alt2 = this.moveCharacterWithElevation(
            e.x,
            e.y,
            e.elevation,
            Math.cos(moveAng - 1.1) * stepDist,
            Math.sin(moveAng - 1.1) * stepDist,
            e.radius
          );
          const pick = dist(e.x, e.y, alt1.x, alt1.y) >= dist(e.x, e.y, alt2.x, alt2.y) ? alt1 : alt2;
          e.x = pick.x;
          e.y = pick.y;
          e.elevation = pick.elevation;
        } else {
          e.x = moved.x;
          e.y = moved.y;
          e.elevation = moved.elevation;
        }
        e.onHighGround = e.elevation >= 1.0;
      }

      const enemyMovedDist = dist(prevEX, prevEY, e.x, e.y);
      if (enemyMovedDist > 0.12) {
        const stepPhase = PLAYER_MOVEMENT.stepDistance * 0.085;
        const previousStep = Math.floor(e.walkPhase / stepPhase);
        e.walkPhase += enemyMovedDist * 0.085;
        if (Math.floor(e.walkPhase / stepPhase) > previousStep) {
          sfx.footstep(this.getFootstepSurface(e.x, e.y), this.nearbySoundVolume(e.x, e.y) * 0.30);
        }
        e.moveIntensity = Math.min(1, e.moveIntensity + dt * 10);
      } else {
        e.moveIntensity = Math.max(0, e.moveIntensity - dt * 10);
      }

      // 路過或抵達地面武器點時自動拾取
      this.enemyTryPickupWeapon(e);

      if (readyToAttack && losTargetPos && e.attackCooldown <= 0 && (targetIsPlayer || targetEntity)) {
        const aimAngle = Math.atan2(losTargetPos.y - e.y, losTargetPos.x - e.x);
        const heldMeleeDef = MELEES.find((m) => m.kind === e.meleeKind) || MELEES[0];
        if (e.activeSlot === 'melee' && isCloseMeleeRange) {
          e.attackCooldown = 1 / heldMeleeDef.swingRate;
          const animDur = e.meleeKind === 'greatsword' ? 0.24 : 0.16;
          e.attackAnimDuration = animDur;
          e.attackAnimTimer = animDur;
          e.attackAnimKind = e.meleeKind;
          const giantMult = e.giantTimer > 0 ? 1.3 : 1.0;
          const meleeDmg = Math.round(heldMeleeDef.damage * giantMult);
          this.slashes.push({
            x: e.x,
            y: e.y,
            angle: aimAngle,
            arc: heldMeleeDef.arc,
            reach: heldMeleeDef.reach,
            color: e.color,
            life: e.meleeKind === 'greatsword' ? 0.24 : 0.16,
            maxLife: e.meleeKind === 'greatsword' ? 0.24 : 0.16,
            isUltimate: false,
            style: e.meleeKind === 'greatsword' ? 'sweep' : e.meleeKind === 'claw' ? 'claw' : 'thrust',
          });
          if (targetIsPlayer) {
            if (e.meleeKind === 'shield') {
              const pushed = this.moveCharacterWithElevation(
                p.x,
                p.y,
                p.elevation,
                Math.cos(aimAngle) * 36,
                Math.sin(aimAngle) * 36,
                p.radius
              );
              p.x = pushed.x;
              p.y = pushed.y;
              p.elevation = pushed.elevation;
            }
            this.damagePlayer(meleeDmg, true, e.id, e.x, e.y);
          } else if (targetEntity) {
            const knockPower = e.meleeKind === 'shield' ? 750 : 140;
            this.damageEnemy(
              targetEntity,
              meleeDmg,
              true,
              Math.cos(aimAngle) * knockPower,
              Math.sin(aimAngle) * knockPower,
              false,
              false,
              e.id,
              e.faction,
              e.x,
              e.y
            );
            if (e.meleeKind === 'shield' && targetEntity.hp > 0) {
              targetEntity.stunTimer = Math.max(targetEntity.stunTimer, 0.3);
            }
          }
        } else if (e.activeSlot === 'gun' && canHitRanged && (!mag || mag.reloadTimer <= 0)) {
          e.attackCooldown = e.gunKind === 'sniper' ? 1.8 : e.gunKind === 'shotgun' ? 1.35 : e.gunKind === 'rifle' ? 0.48 : 0.85;
          this.fireEnemyGunHitscan(e, aimAngle);
          if (mag) {
            mag.ammo = Math.max(0, mag.ammo - (e.gunKind === 'shotgun' ? 5 : 1));
            if (mag.ammo <= 0) {
              mag.reloadTimer = mag.reloadDur;
            }
          }
        }
      }
    }
  }

  private isBlackDragonBlockedAt(x: number, y: number, startElev: number): boolean {
    if (x < 10 || x > this.map.width - 10 || y < 10 || y > this.map.height - 10) return true;
    const h = this.getHeightAtPoint(x, y);
    if (h.isWall) return true;
    if (h.totalHeight > startElev && h.totalHeight - startElev >= 1.0) return true;
    return false;
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    const nextProjectiles: Projectile[] = [];

    for (const proj of this.projectiles) {
      proj.life -= dt;
      if (proj.life <= 0) continue;

      if (proj.isBlackDragon) {
        const cooldowns = proj.targetHitCooldowns || (proj.targetHitCooldowns = {});
        for (const key of Object.keys(cooldowns)) {
          cooldowns[key] -= dt;
          if (cooldowns[key] <= 0) delete cooldowns[key];
        }
        const segs = proj.segments || (proj.segments = [{ x: proj.x, y: proj.y }]);
        const subSteps = 4;
        const subDt = dt / subSteps;
        let destroyed = false;

        for (let s = 0; s < subSteps; s++) {
          const prevX = proj.x;
          const prevY = proj.y;
          let bounced = false;

          const nextX = proj.x + proj.vx * subDt;
          if (this.isBlackDragonBlockedAt(nextX, proj.y, proj.startElevation)) {
            proj.vx = -proj.vx;
            bounced = true;
          } else {
            proj.x = nextX;
          }

          const nextY = proj.y + proj.vy * subDt;
          if (this.isBlackDragonBlockedAt(proj.x, nextY, proj.startElevation)) {
            proj.vy = -proj.vy;
            bounced = true;
          } else {
            proj.y = nextY;
          }

          if (bounced) {
            proj.bouncesLeft = (proj.bouncesLeft ?? 1) - 1;
            this.spawnBurst(proj.x, proj.y, '#4338CA', 5);
            if ((proj.bouncesLeft ?? 0) <= 0) {
              destroyed = true;
              break;
            }
          }

          proj.distanceTraveled = (proj.distanceTraveled ?? 0) + dist(prevX, prevY, proj.x, proj.y);
          if (proj.distanceTraveled >= (proj.maxDistance ?? 1050)) {
            destroyed = true;
            break;
          }

          if (dist(proj.x, proj.y, segs[0].x, segs[0].y) >= 12) {
            segs.unshift({ x: proj.x, y: proj.y });
            if (segs.length > 18) segs.pop();
          }

          // 龍頭傷 20、龍身傷 15（絕不傷隊友）
          if (p.hp > 0 && proj.ownerId !== 'player' && areHostile(proj.ownerFaction, proj.ownerId, p.faction, 'player')) {
            if (!cooldowns['player']) {
              let hitDmg = 0;
              let hitOriginX = proj.x;
              let hitOriginY = proj.y;
              if (dist(proj.x, proj.y, p.x, p.y) <= p.radius + 18) {
                hitDmg = proj.headDamage ?? 20;
                hitOriginX = prevX;
                hitOriginY = prevY;
              } else {
                for (let k = 1; k < segs.length; k++) {
                  if (dist(segs[k].x, segs[k].y, p.x, p.y) <= p.radius + 13) {
                    hitDmg = proj.bodyDamage ?? 15;
                    hitOriginX = segs[k].x;
                    hitOriginY = segs[k].y;
                    break;
                  }
                }
              }
              if (hitDmg > 0) {
                cooldowns['player'] = 0.25;
                this.damagePlayer(hitDmg, true, proj.ownerId, hitOriginX, hitOriginY);
              }
            }
          }

          for (const e of [...this.enemies]) {
            if (e.id === proj.ownerId || cooldowns[e.id]) continue;
            if (!areHostile(proj.ownerFaction, proj.ownerId, e.faction, e.id)) continue;
            let hitDmg = 0;
            let hitOriginX = proj.x;
            let hitOriginY = proj.y;
            if (dist(proj.x, proj.y, e.x, e.y) <= e.radius + 18) {
              hitDmg = proj.headDamage ?? 20;
              hitOriginX = prevX;
              hitOriginY = prevY;
            } else {
              for (let k = 1; k < segs.length; k++) {
                if (dist(segs[k].x, segs[k].y, e.x, e.y) <= e.radius + 13) {
                  hitDmg = proj.bodyDamage ?? 15;
                  hitOriginX = segs[k].x;
                  hitOriginY = segs[k].y;
                  break;
                }
              }
            }
            if (hitDmg > 0) {
              cooldowns[e.id] = 0.25;
              this.damageEnemy(
                e,
                hitDmg,
                true,
                proj.vx * 0.05,
                proj.vy * 0.05,
                false,
                true,
                proj.ownerId,
                proj.ownerFaction,
                hitOriginX,
                hitOriginY
              );
            }
          }
        }

        if (!destroyed) nextProjectiles.push(proj);
        continue;
      }

      proj.prevX = proj.x;
      proj.prevY = proj.y;

      const subSteps = 2;
      let destroyed = false;

      for (let s = 0; s < subSteps; s++) {
        const subDt = dt / subSteps;
        proj.x += proj.vx * subDt;
        proj.y += proj.vy * subDt;

        if (proj.x < 0 || proj.x > this.map.width || proj.y < 0 || proj.y > this.map.height) {
          destroyed = true;
          break;
        }

        const h = this.getHeightAtPoint(proj.x, proj.y);
        if (!h.isCrate) {
          proj.minTraversedElevation = Math.min(proj.minTraversedElevation, h.terrainHeight);
        }
        const crateBlocks = h.isCrate && proj.minTraversedElevation < 1.5 && h.totalHeight - proj.minTraversedElevation > 1.0;
        const cliffBlocks = !h.isCrate && h.totalHeight > proj.startElevation && h.totalHeight - proj.minTraversedElevation > 1.0;
        if (h.isWall || crateBlocks || cliffBlocks) {
          this.spawnBurst(proj.x, proj.y, proj.color, 4);
          destroyed = true;
          break;
        }

        const canHitPlayer =
          p.hp > 0 && proj.ownerId !== 'player' &&
          !proj.hitIds.has('player') &&
          (!proj.noFriendlyFire || areHostile(proj.ownerFaction, proj.ownerId, p.faction, 'player'));
        if (canHitPlayer && p.elevation - proj.startElevation < 2.0) {
          const hit = segmentCircleHit(proj.prevX, proj.prevY, proj.x, proj.y, p.x, p.y, p.radius + proj.radius * 0.5);
          if (hit.hit) {
            proj.hitIds.add('player');
            const isAllyOrb = !areHostile(proj.ownerFaction, proj.ownerId, p.faction, 'player');
            this.damagePlayer(isAllyOrb ? Math.round(proj.damage * 0.5) : proj.damage, false, proj.ownerId, proj.prevX, proj.prevY);
            if (proj.pierce > 0) {
              proj.pierce -= 1;
            } else {
              destroyed = true;
              break;
            }
          }
        }

        for (const e of [...this.enemies]) {
          if (e.id === proj.ownerId || proj.hitIds.has(e.id)) continue;
          if (e.elevation - proj.startElevation >= 2.0) continue;

          const hit = segmentCircleHit(
            proj.prevX,
            proj.prevY,
            proj.x,
            proj.y,
            e.x,
            e.y,
            e.radius + proj.radius * 0.6
          );
          if (hit.hit) {
            proj.hitIds.add(e.id);
            this.damageEnemy(
              e,
              proj.damage,
              false,
              proj.vx * 0.04,
              proj.vy * 0.04,
              false,
              Boolean(proj.noFriendlyFire),
              proj.ownerId,
              proj.ownerFaction,
              proj.prevX,
              proj.prevY
            );

            if (proj.pierce > 0) {
              proj.pierce -= 1;
            } else {
              destroyed = true;
              break;
            }
          }
        }
        if (destroyed) break;
      }

      if (!destroyed) nextProjectiles.push(proj);
    }

    this.projectiles = nextProjectiles;
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.fillStyle = '#0D1017';
    ctx.fillRect(0, 0, width, height);

    const shakeX = (Math.random() - 0.5) * this.camera.shake * 2;
    const shakeY = (Math.random() - 0.5) * this.camera.shake * 2;
    const renderCam = this.clampCameraToMap(this.camera.x, this.camera.y, width, height);

    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-renderCam.x, -renderCam.y);

    // 1–4 & 6–7: 繪製統一格線地板、河道橋樑、多層高台、階梯、草叢、樹幹、大箱子與特色牆柱
    renderMapBaseLayer(ctx, this.map, false, this.time);

    // 8. 地面武器與可重複彈藥補給
    for (const pk of this.pickups) {
      this.drawPickup(ctx, pk);
    }

    // 9. 近戰特效
    for (const s of this.slashes) {
      this.drawSlashEffect(ctx, s);
    }

    // 10. 電腦敵我士兵（皆 100 血，含集氣線與主動技能狀態）
    for (const e of this.enemies) {
      if (e.chargingSkillTimer > 0) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + this.time * 5;
          const outerDist = e.radius + 36 * (e.chargingSkillTimer / 0.65);
          const innerDist = Math.max(e.radius * 0.5, outerDist - 12);
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(ang) * outerDist, e.y + Math.sin(ang) * outerDist);
          ctx.lineTo(e.x + Math.cos(ang) * innerDist, e.y + Math.sin(ang) * innerDist);
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
      }

      if (e.royalShieldTimer > 0) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.fill();
        ctx.stroke();
      }

      if (e.vampireTimer > 0) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#F43F5E';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const eMag = this.enemyMagState.get(e.id);
      const eReloading = Boolean(eMag && eMag.reloadTimer > 0);
      const eReloadProg = eMag && eMag.reloadTimer > 0 ? 1 - eMag.reloadTimer / eMag.reloadDur : 0;

      const eGunDef = GUNS.find((g) => g.kind === e.gunKind) || GUNS[0];
      const eMeleeDef = MELEES.find((m) => m.kind === e.meleeKind) || MELEES[0];
      const eWeaponColor = e.activeSlot === 'melee' && !eReloading ? eMeleeDef.color : eGunDef.color;

      const eAtkProg =
        e.attackAnimTimer > 0 && e.attackAnimDuration > 0
          ? clamp(1 - e.attackAnimTimer / e.attackAnimDuration, 0, 1)
          : 0;

      this.drawCharacter(
        ctx,
        e.x,
        e.y,
        e.radius,
        e.angle,
        e.hitFlash > 0 ? '#FFFFFF' : e.characterSkin.bodyColor,
        e.isAlly ? 'ALLY' : 'ENEMY',
        e.activeSlot === 'melee' && !eReloading,
        e.shadowCloneTimer > 0,
        eReloading,
        eReloadProg,
        eWeaponColor,
        e.blindTimer > 0,
        e.gunKind,
        e.meleeKind,
        e.characterSkin,
        e.walkPhase,
        e.moveIntensity,
        0,
        eAtkProg,
        e.attackAnimKind,
        e.gunfireTimer
      );

      const bw = 40;
      const bx = e.x - bw / 2;
      const by = e.y - e.radius - 13;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = e.isAlly ? '#38BDF8' : e.color;
      ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 5);

      const stateIcon = eReloading
        ? ' [裝彈]'
        : e.blindTimer > 0
          ? ' [致盲]'
          : e.hasLosToTarget
            ? e.reactionTimer > 0 ? ' [警覺]' : ' !'
            : e.lastSeenTargetPos && e.alertTimer > 0
              ? ' ?'
              : '';
      const nameplateColor =
        e.faction === 'royal'
          ? '#FFFFFF'
          : e.faction === 'shadow'
            ? '#6E146B'
            : '#92400E';
      const nameplateStroke =
        e.faction === 'royal'
          ? 'rgba(0, 0, 0, 0.92)'
          : e.faction === 'shadow'
            ? 'rgba(241, 245, 249, 0.95)'
            : 'rgba(254, 243, 199, 0.95)';
      this.drawOutlinedText(
        ctx,
        `${e.name}${stateIcon}`,
        e.x,
        by - 5,
        nameplateColor,
        11,
        'center',
        nameplateStroke
      );
    }

    // 11. 玩家角色與集氣線條 / 氣場特效
    const p = this.player;
    const facHex = p.characterSkin.bodyColor || FACTIONS[p.faction].accentHex;

    if (p.hp > 0) {
      if (p.chargingMelee && this.chargeSessionAllowed && !p.chargeReady) {
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + this.time * 4;
          const cycle = (this.time * 3.5 + i * 0.25) % 1;
          const outerDist = p.radius + 44 * (1 - cycle);
          const innerDist = Math.max(p.radius * 0.5, outerDist - 16);
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(ang) * outerDist, p.y + Math.sin(ang) * outerDist);
          ctx.lineTo(p.x + Math.cos(ang) * innerDist, p.y + Math.sin(ang) * innerDist);
          ctx.strokeStyle = FACTIONS[p.faction].accentHex;
          ctx.lineWidth = 2.6;
          ctx.stroke();
        }
      }

      if (p.chargeReady) {
        const auraPulse = 1 + Math.sin(this.time * 14) * 0.08;
        const auraColor = FACTIONS[p.faction].accentHex;
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.radius + 14) * auraPulse, 0, Math.PI * 2);
        ctx.fillStyle = `${auraColor}33`;
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = auraColor;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.radius + 22) * auraPulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.restore();
      }

      if (p.royalShieldTimer > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.fill();
        ctx.stroke();
      }

      if (p.vampireTimer > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#F43F5E';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      const weapon = p.weapons[p.activeHand];
      const isReloading = weapon.type === 'gun' && weapon.reloadTimer > 0;
      const playerReloadProg = isReloading ? clamp(1 - weapon.reloadTimer / weapon.def.reloadTime, 0, 1) : 0;
      const playerSwapProg = p.swapTimer > 0 && p.swapDuration > 0 ? clamp(1 - p.swapTimer / p.swapDuration, 0.01, 1) : 0;
      const playerAtkProg =
        p.attackAnimTimer > 0 && p.attackAnimDuration > 0
          ? clamp(1 - p.attackAnimTimer / p.attackAnimDuration, 0, 1)
          : 0;

      this.drawCharacter(
        ctx,
        p.x,
        p.y,
        p.radius,
        p.angle,
        p.invulnTimer > 0 && Math.floor(this.time * 16) % 2 === 0 ? '#FFFFFF' : facHex,
        'PLAYER',
        weapon.type === 'melee',
        p.shadowCloneTimer > 0,
        isReloading,
        playerReloadProg,
        weapon.def.color,
        false,
        weapon.type === 'gun' ? weapon.def.kind : undefined,
        weapon.type === 'melee' ? weapon.def.kind : undefined,
        p.characterSkin,
        p.walkPhase,
        p.moveIntensity,
        playerSwapProg,
        playerAtkProg,
        p.attackAnimKind,
        p.gunfireTimer
      );

      if (isReloading) {
        const barW = 42;
        const barX = p.x - barW / 2;
        const barY = p.y - p.radius - 16;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(barX, barY, barW, 5);
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(barX, barY, barW * playerReloadProg, 5);
        this.drawOutlinedText(ctx, '裝彈中', p.x, barY - 4, '#FBBF24', 11, 'center');
      }
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius * 1.25, p.radius * 0.54, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#020617';
      ctx.fill();
      ctx.strokeStyle = facHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 12. 敵我共用極速線狀子彈
    for (const b of this.beams) {
      const alpha = clamp(b.life / b.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1, b.width * 0.45);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 13. 陣營近武波動（黃色光彈與深紫藍長龍黑龍波）
    for (const proj of this.projectiles) {
      ctx.save();
      if (proj.isBlackDragon) {
        const segs = proj.segments && proj.segments.length > 0 ? proj.segments : [{ x: proj.x, y: proj.y }];
        // 龍身（由尾向頭疊加紫藍刺毛與黑核）
        for (let k = segs.length - 1; k >= 1; k--) {
          const sp = segs[k];
          const t = 1 - k / Math.max(1, segs.length);
          const segR = 11 + t * 8;
          ctx.save();
          ctx.translate(sp.x, sp.y);
          // 紫藍棘刺外環
          ctx.fillStyle = 'rgba(67, 56, 202, 0.55)';
          for (let spike = 0; spike < 8; spike++) {
            const sa = (spike / 8) * Math.PI * 2 + k * 0.4 + this.time * 9;
            ctx.beginPath();
            ctx.moveTo(Math.cos(sa - 0.25) * segR * 0.7, Math.sin(sa - 0.25) * segR * 0.7);
            ctx.lineTo(Math.cos(sa) * (segR + 7), Math.sin(sa) * (segR + 7));
            ctx.lineTo(Math.cos(sa + 0.25) * segR * 0.7, Math.sin(sa + 0.25) * segR * 0.7);
            ctx.closePath();
            ctx.fill();
          }
          const bodyGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, segR);
          bodyGrad.addColorStop(0, '#020617');
          bodyGrad.addColorStop(0.6, '#1E1B4B');
          bodyGrad.addColorStop(1, 'rgba(49, 46, 129, 0.25)');
          ctx.beginPath();
          ctx.arc(0, 0, segR, 0, Math.PI * 2);
          ctx.fillStyle = bodyGrad;
          ctx.fill();
          ctx.restore();
        }
        // 龍頭（深紫藍帶雙長角）
        ctx.translate(proj.x, proj.y);
        ctx.rotate(Math.atan2(proj.vy, proj.vx));
        ctx.fillStyle = 'rgba(67, 56, 202, 0.5)';
        for (let spike = 0; spike < 10; spike++) {
          const sa = (spike / 10) * Math.PI * 2 + this.time * 10;
          ctx.beginPath();
          ctx.moveTo(Math.cos(sa - 0.2) * 14, Math.sin(sa - 0.2) * 14);
          ctx.lineTo(Math.cos(sa) * 26, Math.sin(sa) * 26);
          ctx.lineTo(Math.cos(sa + 0.2) * 14, Math.sin(sa + 0.2) * 14);
          ctx.closePath();
          ctx.fill();
        }
        // 後掠雙龍角
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(4, side * 9);
          ctx.lineTo(-26, side * 19);
          ctx.lineTo(-8, side * 5);
          ctx.closePath();
          ctx.fillStyle = '#312E81';
          ctx.fill();
          ctx.strokeStyle = '#6366F1';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        const headGrad = ctx.createRadialGradient(3, 0, 2, 0, 0, 21);
        headGrad.addColorStop(0, '#020617');
        headGrad.addColorStop(0.65, '#1E1B4B');
        headGrad.addColorStop(1, '#312E81');
        ctx.beginPath();
        ctx.ellipse(2, 0, 21, 15, 0, 0, Math.PI * 2);
        ctx.fillStyle = headGrad;
        ctx.fill();
        // 龍眼微光
        ctx.fillStyle = '#818CF8';
        ctx.beginPath();
        ctx.arc(10, -5, 2.2, 0, Math.PI * 2);
        ctx.arc(10, 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 黃色彗星光彈（對應 光彈.png）
        const ang = Math.atan2(proj.vy, proj.vx);
        ctx.translate(proj.x, proj.y);
        ctx.rotate(ang);
        // 尾焰光束
        const tailGrad = ctx.createLinearGradient(-34, 0, 8, 0);
        tailGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
        tailGrad.addColorStop(0.55, 'rgba(250, 204, 21, 0.72)');
        tailGrad.addColorStop(1, '#FEF08A');
        ctx.fillStyle = tailGrad;
        ctx.beginPath();
        ctx.moveTo(-34, 0);
        ctx.lineTo(-8, -proj.radius * 0.95);
        ctx.lineTo(4, 0);
        ctx.lineTo(-8, proj.radius * 0.95);
        ctx.closePath();
        ctx.fill();

        // 刺芒白黃輝光
        ctx.fillStyle = 'rgba(254, 249, 195, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-24, -4);
        ctx.lineTo(8, 0);
        ctx.lineTo(-24, 4);
        ctx.closePath();
        ctx.fill();

        const orbGrad = ctx.createRadialGradient(2, 0, 2, 0, 0, proj.radius);
        orbGrad.addColorStop(0, '#FFFFFF');
        orbGrad.addColorStop(0.45, '#FEF08A');
        orbGrad.addColorStop(0.85, '#FACC15');
        orbGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, proj.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = orbGrad;
        ctx.fill();
      }
      ctx.restore();
    }

    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // 14. 高 z-index 樹葉（依不同地圖呈現相應樹冠）
    renderMapCanopies(ctx, this.map, p);

    for (const ft of this.floatingTexts) {
      ctx.globalAlpha = clamp(ft.life / ft.maxLife, 0, 1);
      this.drawOutlinedText(ctx, ft.text, ft.x, ft.y, ft.color, Math.round(13 * ft.scale), 'center');
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    if (this.status === 'PLAYING') this.drawCrosshair(ctx);
  }

  private drawSlashEffect(ctx: CanvasRenderingContext2D, s: SlashEffect) {
    const progress = clamp(1 - s.life / s.maxLife, 0, 1);
    const alpha = clamp(s.life / s.maxLife, 0, 1);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.globalAlpha = alpha;

    if (s.style === 'thrust') {
      const thrustLen = s.reach * (0.65 + 0.45 * progress);
      ctx.beginPath();
      ctx.moveTo(16, -8);
      ctx.lineTo(thrustLen + 12, 0);
      ctx.lineTo(16, 8);
      ctx.closePath();
      ctx.fillStyle = `${s.color}99`;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (s.style === 'claw') {
      const clawReach = s.reach * (0.72 + 0.35 * progress);
      for (const oy of [-11, 0, 11]) {
        ctx.beginPath();
        ctx.arc(10 + progress * 8, oy, clawReach * 0.78, -0.5, 0.5);
        ctx.strokeStyle = oy === 0 ? '#FFFFFF' : s.color;
        ctx.lineWidth = oy === 0 ? 3.5 : 2.5;
        ctx.stroke();
      }
    } else {
      // 順時針弧形刀光軌跡（由負角順時針掃向正角）
      const startAng = -s.arc / 2;
      const curEnd = s.isUltimate
        ? s.arc / 2
        : startAng + s.arc * clamp(progress * 1.25, 0.18, 1.0);
      const trailStart = s.isUltimate ? startAng : Math.max(startAng, curEnd - s.arc * 0.72);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, s.reach, trailStart, curEnd, false);
      ctx.closePath();
      ctx.fillStyle = `${s.color}${s.isUltimate ? '66' : '38'}`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, s.reach, trailStart, curEnd, false);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = s.isUltimate ? 6 : 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 地面武器拾取點：直接放置於地面（無光環、無文字），完全對應實戰武器原圖
   */
  private drawPickup(ctx: CanvasRenderingContext2D, pk: PickupItem) {
    ctx.save();
    ctx.translate(pk.x, pk.y);

    if (pk.kind === 'gun' && pk.gunDef) {
      ctx.rotate(-0.42);
      const gk = pk.gunDef.kind;
      if (gk === 'sniper') {
        // 木托深藍鋼管 + 放大鏡瞄準器
        ctx.fillStyle = '#B45309';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-18, 1);
        ctx.lineTo(-10, -1);
        ctx.lineTo(6, -1);
        ctx.lineTo(6, 3.5);
        ctx.lineTo(-6, 4);
        ctx.lineTo(-9, 9);
        ctx.lineTo(-12, 8);
        ctx.lineTo(-11, 4);
        ctx.lineTo(-16, 7.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1E3A5F';
        ctx.fillRect(-2, -3.5, 22, 3.4);
        ctx.strokeRect(-2, -3.5, 22, 3.4);

        // 大型藍鋼狙擊鏡
        ctx.fillStyle = '#1E3A5F';
        ctx.fillRect(-7, -8.8, 14, 4.2);
        ctx.strokeRect(-7, -8.8, 14, 4.2);
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(-6.8, -6.7, 2.1, 0, Math.PI * 2);
        ctx.arc(6.8, -6.7, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (gk === 'shotgun') {
        // 紅木托＋橘棕護木＋深鋼槍管
        ctx.fillStyle = '#1E3A5F';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.7;
        ctx.fillRect(-4, -3.5, 22, 3.4);
        ctx.strokeRect(-4, -3.5, 22, 3.4);

        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-8, -3.5, 11, 5.5);
        ctx.strokeRect(-8, -3.5, 11, 5.5);

        ctx.fillStyle = '#C2410C';
        ctx.fillRect(3, -0.5, 11, 4);
        ctx.strokeRect(3, -0.5, 11, 4);

        ctx.fillStyle = '#B45309';
        ctx.beginPath();
        ctx.moveTo(-18, 2);
        ctx.lineTo(-8, -2);
        ctx.lineTo(-7, 3);
        ctx.lineTo(-14, 8.5);
        ctx.lineTo(-18, 6.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (gk === 'rifle') {
        // 黑色 M4 步槍＋提把＋前準星＋彎彈匣
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.7;
        // 槍托
        ctx.beginPath();
        ctx.moveTo(-18, -2.5);
        ctx.lineTo(-7, -2.5);
        ctx.lineTo(-7, 2);
        ctx.lineTo(-15, 5.5);
        ctx.lineTo(-18, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // 槍身與槍管
        ctx.fillRect(-7, -3, 19, 5.5);
        ctx.strokeRect(-7, -3, 19, 5.5);
        ctx.fillRect(12, -1.8, 8, 2.5);
        ctx.strokeRect(12, -1.8, 8, 2.5);
        // 提把與前準星
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.lineTo(-3.5, -6.5);
        ctx.lineTo(3, -6.5);
        ctx.lineTo(4, -3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(13, -1.8);
        ctx.lineTo(14.5, -5.5);
        ctx.lineTo(16, -1.8);
        ctx.fill();
        // 彈匣與握把
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.moveTo(1, 2.5);
        ctx.lineTo(5, 2.5);
        ctx.lineTo(7, 11.5);
        ctx.lineTo(3, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // 深黑軍用小槍
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.8;
        ctx.fillRect(-9, -6, 20, 6);
        ctx.strokeRect(-9, -6, 20, 6);
        ctx.fillStyle = '#334155';
        ctx.fillRect(-8, -5, 17, 2.5);
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 9.5);
        ctx.lineTo(-10, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (pk.kind === 'melee' && pk.meleeDef) {
      const mk = pk.meleeDef.kind;
      if (mk === 'shield') {
        // 放置於地面的戰術防彈盾（實心裝甲盾體＋觀察窗＋金屬鉚釘）
        ctx.rotate(-0.28);
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.roundRect(-11, -14, 22, 28, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.roundRect(-8.5, -11.5, 17, 23, 3.5);
        ctx.fill();

        // 青藍色戰術邊線
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-7, -9.5, 14, 19);

        // 上方防彈觀察窗
        ctx.fillStyle = '#020617';
        ctx.fillRect(-5.5, -7, 11, 4.2);
        ctx.fillStyle = '#BAE6FD';
        ctx.fillRect(-4, -5.8, 8, 1.8);

        // 下方鋼栓鉚釘
        ctx.fillStyle = '#94A3B8';
        ctx.beginPath();
        ctx.arc(-4.5, 6.5, 1.3, 0, Math.PI * 2);
        ctx.arc(4.5, 6.5, 1.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (mk === 'claw') {
        // 地面雙爪並排（左右各一具深藍護腕＋三根彎曲銀爪）
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * 9, 4);
          ctx.fillStyle = '#1E3A8A';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1.7;
          ctx.fillRect(-6, 0, 12, 4.5);
          ctx.strokeRect(-6, 0, 12, 4.5);

          for (const bx of [-4, 0, 4]) {
            ctx.beginPath();
            ctx.moveTo(bx - 1.4, 0);
            ctx.quadraticCurveTo(bx - side * 1.5, -9, bx + side * 2.2, -16);
            ctx.quadraticCurveTo(bx + 1.5, -8, bx + 1.4, 0);
            ctx.closePath();
            ctx.fillStyle = '#E2E8F0';
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      } else if (mk === 'greatsword') {
        // 武士刀風格重型大刀（深藍金菱紋柄＋圓金鍔＋修長銀弧刃）
        ctx.rotate(-0.38);
        // 刀身
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.quadraticCurveTo(10, -2, 20, 2);
        ctx.quadraticCurveTo(10, 2.2, -2, 1.5);
        ctx.closePath();
        ctx.fillStyle = '#E2E8F0';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.7;
        ctx.stroke();
        // 金鍔
        ctx.fillStyle = '#EAB308';
        ctx.beginPath();
        ctx.ellipse(-2.5, 0, 2, 4.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // 深藍刀柄＋金色菱紋
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-16, -2.2, 13, 4.2);
        ctx.strokeRect(-16, -2.2, 13, 4.2);
        ctx.fillStyle = '#FACC15';
        for (const dx of [-13, -9.5, -6]) {
          ctx.fillRect(dx, -0.9, 2, 1.8);
        }
      } else {
        // 弧形黑脊亮銀刃戰術小刀
        ctx.rotate(-0.52);
        ctx.beginPath();
        ctx.moveTo(-1, -3);
        ctx.quadraticCurveTo(8, -3.5, 16, 0.5);
        ctx.quadraticCurveTo(8, 3.2, -1, 2.8);
        ctx.closePath();
        ctx.fillStyle = '#E2E8F0';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(-13, -2.5, 11, 5);
        ctx.strokeRect(-13, -2.5, 11, 5);
      }
    } else if (pk.kind === 'ammo') {
      const bobY = Math.sin(pk.bobPhase) * 2;
      ctx.translate(0, bobY);
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(-9, -7, 18, 14);
      ctx.strokeStyle = '#93C5FD';
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -7, 18, 14);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-4, -4, 2, 8);
      ctx.fillRect(-1, -4, 2, 8);
      ctx.fillRect(2, -4, 2, 8);
    }

    ctx.restore();
  }

  private drawOutlinedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    size = 12,
    align: CanvasTextAlign = 'left',
    strokeColor = 'rgba(0, 0, 0, 0.85)'
  ) {
    ctx.save();
    ctx.font = `700 ${size}px "Noto Sans TC", "JetBrains Mono", sans-serif`;
    ctx.textAlign = align;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawHand(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, handColor: string) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.3, r * 0.1, hx, hy, r);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.4, handColor);
    g.addColorStop(1, handColor);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.0;
    ctx.stroke();
    ctx.restore();
  }

  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    angle: number,
    bodyColor: string,
    role: 'PLAYER' | 'ALLY' | 'ENEMY',
    holdingMelee: boolean,
    shadowActive: boolean,
    isReloading = false,
    reloadProgress = 0,
    weaponColor = '#E2E8F0',
    isBlinded = false,
    gunKind: GunKind = 'pistol',
    meleeKind: MeleeKind = 'knife',
    skin?: CharacterSkin,
    walkPhase = 0,
    moveIntensity = 0,
    swapProgress = 0,
    attackAnimProgress = 0,
    attackAnimKind: MeleeKind | null = null,
    gunfireTimer = 0,
    isPhantomClone = false
  ) {
    if (shadowActive && !isPhantomClone) {
      const perpAngle = angle + Math.PI / 2;
      const cloneOffset = radius * 0.96 + Math.sin(this.time * 12) * 2.5;
      for (const side of [-1, 1]) {
        const cx = x + Math.cos(perpAngle) * cloneOffset * side;
        const cy = y + Math.sin(perpAngle) * cloneOffset * side;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(192, 38, 211, 0.26)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.42;
        this.drawCharacter(
          ctx,
          cx,
          cy,
          radius * 0.95,
          angle,
          bodyColor,
          role,
          holdingMelee,
          false,
          isReloading,
          reloadProgress,
          weaponColor,
          isBlinded,
          gunKind,
          meleeKind,
          skin,
          walkPhase + side * 0.45,
          moveIntensity,
          swapProgress,
          attackAnimProgress,
          attackAnimKind,
          gunfireTimer,
          true
        );
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(x, y);
    if (shadowActive && !isPhantomClone) {
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#FB7185';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(2, 4, radius * 0.84, radius * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(angle);

    const bodyR = radius * 0.72;
    const stride = Math.sin(walkPhase) * radius * 0.4 * moveIntensity;
    const armSwing = Math.sin(walkPhase) * radius * 0.22 * moveIntensity;
    const handR = Math.max(4.4, radius * 0.25);
    const handColor = skin?.handColor || '#FECACA';
    const isHitWhite = bodyColor.toUpperCase() === '#FFFFFF';

    // 1. 雙腳（行走時前後交替擺動）
    for (const side of [-1, 1]) {
      const footX = radius * 0.14 + (side === -1 ? stride : -stride);
      const footY = side * radius * 0.34;
      ctx.save();
      ctx.translate(footX, footY);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.28, radius * 0.17, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#020617';
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(radius * 0.08, 0, radius * 0.09, radius * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. 後腦飾物（依三大陣營實戰角色原圖繪製）
    if (skin && !isHitWhite) {
      ctx.save();
      ctx.lineJoin = 'round';
      if (skin.hairOrCrest === 'spiky_crest') {
        ctx.beginPath();
        ctx.moveTo(bodyR * 0.1, -bodyR * 0.92);
        ctx.lineTo(-bodyR * 0.95, -bodyR * 1.05);
        ctx.lineTo(-bodyR * 0.65, -bodyR * 0.55);
        ctx.lineTo(-bodyR * 1.32, -bodyR * 0.35);
        ctx.lineTo(-bodyR * 0.8, 0);
        ctx.lineTo(-bodyR * 1.32, bodyR * 0.35);
        ctx.lineTo(-bodyR * 0.65, bodyR * 0.55);
        ctx.lineTo(-bodyR * 0.95, bodyR * 1.05);
        ctx.lineTo(bodyR * 0.1, bodyR * 0.92);
        ctx.closePath();
        ctx.fillStyle = skin.hairColor;
        ctx.fill();
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'twintail_bow') {
        const tailWag = Math.sin(walkPhase) * radius * 0.1 * moveIntensity;
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.55, -bodyR * 0.15);
        ctx.quadraticCurveTo(-bodyR * 1.05, -bodyR * 0.45 + tailWag, -bodyR * 1.42, tailWag);
        ctx.quadraticCurveTo(-bodyR * 1.05, bodyR * 0.4 + tailWag, -bodyR * 0.55, bodyR * 0.22);
        ctx.closePath();
        ctx.fillStyle = skin.hairColor;
        ctx.fill();
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = '#020617';
        ctx.stroke();

        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(bodyR * 0.05, side * bodyR * 0.78);
          ctx.lineTo(bodyR * 0.38, side * bodyR * 1.06);
          ctx.lineTo(bodyR * 0.48, side * bodyR * 0.72);
          ctx.closePath();
          ctx.fillStyle = skin.trimColor;
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#020617';
          ctx.stroke();
        }
      } else if (skin.hairOrCrest === 'horned_mask') {
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.35, bodyR * 0.5);
        ctx.quadraticCurveTo(-bodyR * 0.95, bodyR * 0.9, -bodyR * 1.32, bodyR * 0.65);
        ctx.lineTo(-bodyR * 0.92, bodyR * 0.3);
        ctx.lineTo(-bodyR * 1.25, bodyR * 0.12);
        ctx.lineTo(-bodyR * 0.45, bodyR * 0.1);
        ctx.closePath();
        ctx.fillStyle = skin.hairColor;
        ctx.fill();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'cyber_visor') {
        ctx.save();
        ctx.translate(-bodyR * 0.75, -bodyR * 0.72);
        ctx.rotate(-0.24);
        ctx.fillStyle = skin.hairColor;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.8;
        ctx.fillRect(-bodyR * 0.45, -2, bodyR * 0.75, 4);
        ctx.strokeRect(-bodyR * 0.45, -2, bodyR * 0.75, 4);
        ctx.restore();
        for (const side of [-1, 1]) {
          ctx.fillStyle = skin.hairColor;
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1.6;
          ctx.fillRect(-bodyR * 0.25, side * bodyR * 0.82 - 2, bodyR * 0.45, 4);
          ctx.strokeRect(-bodyR * 0.25, side * bodyR * 0.82 - 2, bodyR * 0.45, 4);
        }
      } else if (skin.hairOrCrest === 'royal_wing_crown') {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-bodyR * 0.45, side * bodyR * 0.55);
          ctx.lineTo(-bodyR * 1.35, side * bodyR * 1.0);
          ctx.lineTo(-bodyR * 0.9, side * bodyR * 0.35);
          ctx.closePath();
          ctx.fillStyle = skin.hairColor;
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = '#020617';
          ctx.stroke();
        }
      } else if (skin.hairOrCrest === 'royal_ears_band') {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-bodyR * 0.4, side * bodyR * 0.62);
          ctx.lineTo(-bodyR * 1.25, side * bodyR * 1.08);
          ctx.lineTo(-bodyR * 0.8, side * bodyR * 0.35);
          ctx.closePath();
          ctx.fillStyle = skin.hairColor;
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = skin.trimColor;
          ctx.stroke();
        }
      } else if (skin.hairOrCrest === 'royal_v_knight') {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-bodyR * 0.75, side * bodyR * 0.35);
          ctx.lineTo(-bodyR * 1.45, side * bodyR * 0.55);
          ctx.lineTo(-bodyR * 1.0, side * bodyR * 0.12);
          ctx.closePath();
          ctx.fillStyle = '#38BDF8';
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#020617';
          ctx.stroke();
        }
      } else if (skin.hairOrCrest === 'merc_cloak_goggles') {
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.3, -bodyR * 0.95);
        ctx.quadraticCurveTo(-bodyR * 1.15, -bodyR * 1.15, -bodyR * 1.4, -bodyR * 0.75);
        ctx.lineTo(-bodyR * 1.05, -bodyR * 0.18);
        ctx.lineTo(-bodyR * 1.4, bodyR * 0.65);
        ctx.quadraticCurveTo(-bodyR * 1.15, bodyR * 1.15, -bodyR * 0.3, bodyR * 0.95);
        ctx.closePath();
        ctx.fillStyle = skin.hairColor;
        ctx.fill();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'merc_ponytail_goggles') {
        ctx.fillStyle = '#C2410C';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.6;
        ctx.fillRect(-bodyR * 1.42, -bodyR * 0.88, bodyR * 0.9, 3.6);
        ctx.strokeRect(-bodyR * 1.42, -bodyR * 0.88, bodyR * 0.9, 3.6);

        const tailWag = Math.sin(walkPhase) * radius * 0.1 * moveIntensity;
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.55, -bodyR * 0.12);
        ctx.quadraticCurveTo(-bodyR * 1.05, -bodyR * 0.45 + tailWag, -bodyR * 1.45, tailWag);
        ctx.quadraticCurveTo(-bodyR * 1.05, bodyR * 0.35 + tailWag, -bodyR * 0.55, bodyR * 0.2);
        ctx.closePath();
        ctx.fillStyle = skin.hairColor;
        ctx.fill();
        ctx.stroke();
      } else if (skin.hairOrCrest === 'merc_spiky_goggles') {
        ctx.beginPath();
        ctx.moveTo(0, -bodyR * 0.95);
        ctx.quadraticCurveTo(-bodyR * 0.85, -bodyR * 1.15, -bodyR * 1.32, -bodyR * 0.55);
        ctx.lineTo(-bodyR * 0.92, -bodyR * 0.32);
        ctx.lineTo(-bodyR * 1.38, bodyR * 0.18);
        ctx.lineTo(-bodyR * 0.95, bodyR * 0.38);
        ctx.quadraticCurveTo(-bodyR * 1.15, bodyR * 0.82, -bodyR * 0.45, bodyR * 0.95);
        ctx.lineTo(0, bodyR * 0.85);
        ctx.closePath();
        ctx.fillStyle = skin.bodyHighlight;
        ctx.fill();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'merc_gem_band') {
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.15, -bodyR * 0.95);
        ctx.lineTo(-bodyR * 1.15, -bodyR * 0.72);
        ctx.lineTo(-bodyR * 0.9, -bodyR * 0.32);
        ctx.lineTo(-bodyR * 1.25, 0);
        ctx.lineTo(-bodyR * 0.9, bodyR * 0.32);
        ctx.lineTo(-bodyR * 1.15, bodyR * 0.72);
        ctx.lineTo(-bodyR * 0.15, bodyR * 0.95);
        ctx.closePath();
        ctx.fillStyle = skin.bodyColor;
        ctx.fill();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. 武器與雙手（無肩膀，依實戰武器原圖精準繪製）
    if (swapProgress > 0) {
      // 換武器搓手動畫：重武器耗時更長，雙手合於身前來回搓動
      const rub = Math.sin(swapProgress * Math.PI * 6) * 5.2;
      const handX = bodyR * 0.92;
      this.drawHand(ctx, handX + rub * 0.35, -3.5 + rub * 0.4, handR, handColor);
      this.drawHand(ctx, handX - rub * 0.35, 3.5 - rub * 0.4, handR, handColor);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(handX - 3, -5);
      ctx.lineTo(handX + 3, 5);
      ctx.stroke();
    } else if (isReloading && !holdingMelee) {
      const tilt = -0.82 + Math.sin(reloadProgress * Math.PI * 2) * 0.12;
      const gunLen = gunKind === 'sniper' ? 28 : gunKind === 'rifle' ? 23 : gunKind === 'shotgun' ? 22 : 14;
      const magPhase =
        reloadProgress < 0.4
          ? reloadProgress / 0.4
          : reloadProgress < 0.75
            ? 1 - (reloadProgress - 0.4) / 0.35
            : 0;
      const rackPhase = reloadProgress >= 0.75 ? Math.sin(((reloadProgress - 0.75) / 0.25) * Math.PI) : 0;

      ctx.save();
      ctx.rotate(tilt);

      ctx.fillStyle = gunKind === 'sniper' || gunKind === 'shotgun' ? '#B45309' : '#0F172A';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 1.6;
      ctx.fillRect(bodyR * 0.52, -3.2, gunLen, 6.4);
      ctx.strokeRect(bodyR * 0.52, -3.2, gunLen, 6.4);
      ctx.fillStyle = gunKind === 'sniper' || gunKind === 'shotgun' ? '#1E3A5F' : '#334155';
      ctx.fillRect(bodyR * 0.52 + 8, -2.2, gunLen - 8, 4.4);
      if (gunKind === 'sniper') {
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(bodyR * 0.52 + 6, -5, 10, 2.5);
      }

      const magOffsetY = 4 + magPhase * 12;
      const magX = bodyR * 0.78 + (gunKind === 'sniper' ? 4 : 2);
      ctx.fillStyle = gunKind === 'shotgun' ? '#C2410C' : '#FBBF24';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.2;
      ctx.fillRect(magX, magOffsetY, gunKind === 'rifle' ? 6 : 5, gunKind === 'shotgun' ? 8 : 9);
      ctx.strokeRect(magX, magOffsetY, gunKind === 'rifle' ? 6 : 5, gunKind === 'shotgun' ? 8 : 9);

      const leftHandX = reloadProgress >= 0.75 ? bodyR * 0.78 - rackPhase * 7 : magX + 2.5;
      const leftHandY = reloadProgress >= 0.75 ? -5 : magOffsetY + 4;
      this.drawHand(ctx, leftHandX, leftHandY, handR, handColor);
      this.drawHand(ctx, bodyR * 0.62, -bodyR * 0.55, handR * 0.95, handColor);
      ctx.restore();
    } else if (holdingMelee) {
      if (meleeKind === 'claw') {
        const lunge = attackAnimKind === 'claw' && attackAnimProgress > 0 ? Math.sin(attackAnimProgress * Math.PI) : 0;
        const rx = bodyR * 0.66 + armSwing * 0.72 + lunge * 14;
        const ry = bodyR * 0.78 - lunge * 6;
        const lx = bodyR * 0.66 - armSwing * 0.72 + lunge * 14;
        const ly = -bodyR * 0.78 + lunge * 6;

        // 雙手腕深藍護腕＋各自三根彎曲銀爪
        for (const [hx, hy, dir] of [
          [rx, ry, -1],
          [lx, ly, 1],
        ] as const) {
          ctx.fillStyle = '#1E3A8A';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1.4;
          ctx.fillRect(hx - 4, hy - 5, 8, 10);
          ctx.strokeRect(hx - 4, hy - 5, 8, 10);
          for (const oy of [-3.5, 0, 3.5]) {
            ctx.beginPath();
            ctx.moveTo(hx + 2, hy + oy - 1);
            ctx.quadraticCurveTo(hx + 11, hy + oy + dir * 2, hx + 16, hy + oy + dir * 3.5);
            ctx.quadraticCurveTo(hx + 9, hy + oy + 1.4, hx + 2, hy + oy + 1.2);
            ctx.closePath();
            ctx.fillStyle = '#E2E8F0';
            ctx.fill();
            ctx.stroke();
          }
        }
        this.drawHand(ctx, rx, ry, handR, handColor);
        this.drawHand(ctx, lx, ly, handR, handColor);
      } else if (meleeKind === 'shield') {
        // 手持戰術防彈盾：置於身前正弧方向（左鍵推擊時雙手同步前頂）
        const bashLunge = attackAnimKind === 'shield' && attackAnimProgress > 0 ? Math.sin(attackAnimProgress * Math.PI) : 0;
        const gripX = bodyR * 0.85 + bashLunge * 15;
        this.drawHand(ctx, gripX, -bodyR * 0.48, handR, handColor);
        this.drawHand(ctx, gripX, bodyR * 0.48, handR, handColor);

        const shieldFrontX = bodyR * 1.16 + bashLunge * 16;
        const halfSpan = bodyR * 1.12;
        ctx.save();
        // 弧形防彈裝甲盾面
        ctx.beginPath();
        ctx.moveTo(shieldFrontX - 4, -halfSpan);
        ctx.quadraticCurveTo(shieldFrontX + 5.5, 0, shieldFrontX - 4, halfSpan);
        ctx.lineTo(shieldFrontX - 9, halfSpan * 0.92);
        ctx.quadraticCurveTo(shieldFrontX + 0.5, 0, shieldFrontX - 9, -halfSpan * 0.92);
        ctx.closePath();
        ctx.fillStyle = '#1E293B';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // 金屬外緣框與戰術青藍條紋
        ctx.beginPath();
        ctx.moveTo(shieldFrontX - 4.2, -halfSpan * 0.92);
        ctx.quadraticCurveTo(shieldFrontX + 4.8, 0, shieldFrontX - 4.2, halfSpan * 0.92);
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(shieldFrontX - 5.2, -halfSpan * 0.65);
        ctx.quadraticCurveTo(shieldFrontX + 3.2, 0, shieldFrontX - 5.2, halfSpan * 0.65);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // 中央防彈觀察窗
        ctx.fillStyle = '#BAE6FD';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.2;
        ctx.fillRect(shieldFrontX - 2.2, -4.5, 3.6, 9);
        ctx.strokeRect(shieldFrontX - 2.2, -4.5, 3.6, 9);
        ctx.restore();
      } else if (meleeKind === 'greatsword') {
        if (attackAnimKind === 'greatsword' && attackAnimProgress > 0) {
          // 大刀順時針橫斬：雙手握柄與刀身同步由負角順時針掃向正角
          const swingRot = -1.55 + attackAnimProgress * 3.0;
          ctx.save();
          ctx.rotate(swingRot);
          const gripInnerX = bodyR * 0.65;
          const gripOuterX = bodyR * 0.92;
          ctx.fillStyle = '#EAB308';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1.6;
          ctx.fillRect(gripOuterX + 1, -6, 3.5, 12);
          ctx.strokeRect(gripOuterX + 1, -6, 3.5, 12);
          ctx.beginPath();
          ctx.moveTo(gripOuterX + 4.5, -2.5);
          ctx.quadraticCurveTo(gripOuterX + 20, -3.5, gripOuterX + 33, -0.5);
          ctx.quadraticCurveTo(gripOuterX + 19, 2.5, gripOuterX + 4.5, 2.2);
          ctx.closePath();
          ctx.fillStyle = '#E2E8F0';
          ctx.fill();
          ctx.stroke();
          this.drawHand(ctx, gripInnerX, 2.5, handR, handColor);
          this.drawHand(ctx, gripOuterX, -2.0, handR, handColor);
          ctx.restore();
        } else {
          const rx = bodyR * 0.58 + armSwing * 0.25;
          const ry = bodyR * 0.56;
          const lx = bodyR * 0.8 + armSwing * 0.22;
          const ly = bodyR * 0.1;

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(-0.46);
          ctx.fillStyle = '#EAB308';
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1.6;
          ctx.fillRect(-3, -6, 3.5, 12);
          ctx.strokeRect(-3, -6, 3.5, 12);
          ctx.beginPath();
          ctx.moveTo(0.5, -2.5);
          ctx.quadraticCurveTo(16, -3.5, 29, -0.5);
          ctx.quadraticCurveTo(15, 2.5, 0.5, 2.2);
          ctx.closePath();
          ctx.fillStyle = '#E2E8F0';
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          this.drawHand(ctx, rx, ry, handR, handColor);
          this.drawHand(ctx, lx, ly, handR, handColor);
        }
      } else {
        // 小刀：刺擊時右手筆直前刺、左手後收保持平衡
        const thrust = attackAnimKind === 'knife' && attackAnimProgress > 0 ? Math.sin(attackAnimProgress * Math.PI) : 0;
        const rx = bodyR * 0.64 + armSwing * 0.55 + thrust * 16;
        const ry = bodyR * 0.74 - thrust * bodyR * 0.42;
        const lx = bodyR * 0.52 - armSwing * 0.85 - thrust * 6;
        const ly = -bodyR * 0.78;

        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(-0.55 * (1 - thrust * 0.88));
        ctx.beginPath();
        ctx.moveTo(0, -2.6);
        ctx.quadraticCurveTo(8, -3.4, 15.5, 0.2);
        ctx.quadraticCurveTo(8, 2.8, 0, 2.2);
        ctx.closePath();
        ctx.fillStyle = '#E2E8F0';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(-5, -2, 6, 4);
        ctx.restore();

        this.drawHand(ctx, rx, ry, handR, handColor);
        this.drawHand(ctx, lx, ly, handR, handColor);
      }
    } else {
      const recoil = (gunfireTimer / GUNFIRE_ANIMATION_SECONDS) ** 2;
      const flash = Math.max(0, (gunfireTimer - 0.072) / (GUNFIRE_ANIMATION_SECONDS - 0.072));
      ctx.save();
      ctx.translate(-recoil * (gunKind === 'pistol' ? 6 : 8), 0);
      if (gunKind === 'pistol') {
        // 小槍：深黑軍用半自動手槍正前指
        const rx = bodyR * 0.74 + armSwing * 0.2;
        const ry = bodyR * 0.5;
        const lx = bodyR * 0.48 - armSwing * 0.8;
        const ly = -bodyR * 0.78;

        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.5;
        ctx.fillRect(rx - 2, ry - 3, 15, 6);
        ctx.strokeRect(rx - 2, ry - 3, 15, 6);
        ctx.fillStyle = '#334155';
        ctx.fillRect(rx + 1, ry - 1.8, 10, 3.2);

        this.drawHand(ctx, rx, ry, handR, handColor);
        this.drawHand(ctx, lx, ly, handR, handColor);
        this.drawMuzzleFlash(ctx, rx + 13, ry, flash);
      } else {
        // 步槍（黑 M4）、狙擊槍（木托藍鋼鏡）、散彈槍（木托木護木）
        const baseGunX = bodyR * 0.56;
        const rx = bodyR * 0.58;
        const ry = bodyR * 0.42;
        const lx = (gunKind === 'sniper' ? bodyR * 1.15 : bodyR * 0.98) + armSwing * 0.18;
        const ly = -bodyR * 0.14;

        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.5;
        if (gunKind === 'sniper') {
          ctx.fillStyle = '#B45309';
          ctx.fillRect(baseGunX - 2, -3.2, 16, 6.4);
          ctx.strokeRect(baseGunX - 2, -3.2, 16, 6.4);
          ctx.fillStyle = '#1E3A5F';
          ctx.fillRect(baseGunX + 10, -2.2, 21, 4.4);
          ctx.strokeRect(baseGunX + 10, -2.2, 21, 4.4);
          // 頂部藍鋼瞄準鏡
          ctx.fillStyle = '#1E3A5F';
          ctx.fillRect(baseGunX + 3, -3.8, 13, 5.2);
          ctx.strokeRect(baseGunX + 3, -3.8, 13, 5.2);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(baseGunX + 4.5, -2.4, 3, 2.4);
        } else if (gunKind === 'shotgun') {
          ctx.fillStyle = '#B45309';
          ctx.fillRect(baseGunX - 2, -3.2, 10, 6.4);
          ctx.strokeRect(baseGunX - 2, -3.2, 10, 6.4);
          ctx.fillStyle = '#1E3A5F';
          ctx.fillRect(baseGunX + 7, -2.4, 16, 4.8);
          ctx.strokeRect(baseGunX + 7, -2.4, 16, 4.8);
          ctx.fillStyle = '#C2410C';
          ctx.fillRect(baseGunX + 10, -1.6, 8, 4.8);
          ctx.strokeRect(baseGunX + 10, -1.6, 8, 4.8);
        } else {
          // 黑色 M4 步槍
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(baseGunX, -3.2, 23, 6.4);
          ctx.strokeRect(baseGunX, -3.2, 23, 6.4);
          ctx.fillStyle = '#334155';
          ctx.fillRect(baseGunX + 4, -1.8, 12, 3.6);
        }

        this.drawHand(ctx, rx, ry, handR, handColor);
        this.drawHand(ctx, lx, ly, handR, handColor);
        this.drawMuzzleFlash(ctx, baseGunX + (gunKind === 'sniper' ? 31 : 23), 0, flash);
      }
      ctx.restore();
    }

    // 4. 單一圓形身體（無肩膀橢圓！）
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    if (!isHitWhite && skin) {
      const dome = ctx.createRadialGradient(-bodyR * 0.22, -bodyR * 0.22, bodyR * 0.12, 0, 0, bodyR);
      dome.addColorStop(0, skin.bodyHighlight);
      dome.addColorStop(0.72, skin.bodyColor);
      dome.addColorStop(1, '#020617');
      ctx.fillStyle = dome;
    } else {
      ctx.fillStyle = bodyColor;
    }
    ctx.fill();
    ctx.lineWidth = role === 'PLAYER' ? 2.6 : 2.1;
    ctx.strokeStyle = role === 'PLAYER' ? '#FFFFFF' : '#020617';
    ctx.stroke();

    // 5. 面部、眼瞳、護目鏡與頭盔飾條
    if (!isHitWhite && skin) {
      if (skin.faceSkinColor) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, bodyR - 1, -0.68, 0.68);
        ctx.quadraticCurveTo(bodyR * 0.72, 0, Math.cos(-0.68) * (bodyR - 1), Math.sin(-0.68) * (bodyR - 1));
        ctx.closePath();
        ctx.fillStyle = skin.faceSkinColor;
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = isBlinded ? '#FEF08A' : skin.visorColor;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(bodyR * 0.7, side * bodyR * 0.27, bodyR * 0.1, bodyR * 0.13, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (skin.hairOrCrest === 'standard_visor') {
        ctx.beginPath();
        ctx.arc(0, 0, bodyR * 0.82, -0.62, 0.62);
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = Math.max(3.8, bodyR * 0.28);
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, bodyR * 0.82, -0.56, 0.56);
        ctx.strokeStyle = isBlinded ? '#FEF08A' : skin.trimColor;
        ctx.lineWidth = Math.max(2, bodyR * 0.15);
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'spiky_crest') {
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.12, -bodyR * 0.72);
        ctx.lineTo(bodyR * 0.85, 0);
        ctx.lineTo(-bodyR * 0.12, bodyR * 0.72);
        ctx.lineTo(bodyR * 0.24, 0);
        ctx.closePath();
        ctx.fillStyle = skin.trimColor;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'twintail_bow') {
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(-bodyR * 0.45, side * bodyR * 0.46);
          ctx.rotate(side * 0.32);
          ctx.beginPath();
          ctx.ellipse(0, 0, bodyR * 0.26, bodyR * 0.36, 0, 0, Math.PI * 2);
          ctx.fillStyle = skin.trimColor;
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#020617';
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(-bodyR * 0.35, 0, bodyR * 0.19, 0, Math.PI * 2);
        ctx.fillStyle = skin.trimColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'horned_mask') {
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(bodyR * 0.48, side * bodyR * 0.38);
          ctx.rotate(side * 0.42);
          ctx.beginPath();
          ctx.ellipse(0, 0, bodyR * 0.21, bodyR * 0.11, 0, 0, Math.PI * 2);
          ctx.fillStyle = isBlinded ? '#FEF08A' : skin.visorColor;
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.moveTo(bodyR * 0.14, side * bodyR * 0.42);
          ctx.lineTo(-bodyR * 1.05, side * bodyR * 0.88);
          ctx.lineTo(-bodyR * 0.16, side * bodyR * 0.24);
          ctx.closePath();
          ctx.fillStyle = skin.trimColor;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#020617';
          ctx.stroke();
        }
      } else if (skin.hairOrCrest === 'cyber_visor') {
        ctx.beginPath();
        ctx.arc(0, 0, bodyR * 0.84, -0.68, 0.68);
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = Math.max(4, bodyR * 0.3);
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, bodyR * 0.84, -0.62, 0.62);
        ctx.strokeStyle = isBlinded ? '#FEF08A' : skin.visorColor;
        ctx.lineWidth = Math.max(2.2, bodyR * 0.16);
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'royal_wing_crown') {
        ctx.beginPath();
        ctx.moveTo(bodyR * 0.1, -bodyR * 0.92);
        ctx.quadraticCurveTo(bodyR * 0.48, 0, bodyR * 0.1, bodyR * 0.92);
        ctx.quadraticCurveTo(bodyR * 0.7, 0, bodyR * 0.1, -bodyR * 0.92);
        ctx.closePath();
        ctx.fillStyle = skin.trimColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'royal_ears_band') {
        ctx.beginPath();
        ctx.arc(0, 0, bodyR * 0.88, -Math.PI * 0.56, Math.PI * 0.56);
        ctx.strokeStyle = skin.trimColor;
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (skin.hairOrCrest === 'royal_v_knight') {
        ctx.beginPath();
        ctx.moveTo(-bodyR * 0.12, -bodyR * 0.85);
        ctx.lineTo(bodyR * 0.84, 0);
        ctx.lineTo(-bodyR * 0.12, bodyR * 0.85);
        ctx.lineTo(bodyR * 0.3, 0);
        ctx.closePath();
        ctx.fillStyle = '#0F172A';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = skin.trimColor;
        ctx.stroke();

        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(bodyR * 0.48, side * bodyR * 0.38);
          ctx.rotate(side * 0.4);
          ctx.beginPath();
          ctx.ellipse(0, 0, bodyR * 0.21, bodyR * 0.12, 0, 0, Math.PI * 2);
          ctx.fillStyle = isBlinded ? '#FEF08A' : skin.visorColor;
          ctx.fill();
          ctx.restore();
        }
      } else if (
        skin.hairOrCrest === 'merc_cloak_goggles' ||
        skin.hairOrCrest === 'merc_ponytail_goggles' ||
        skin.hairOrCrest === 'merc_spiky_goggles'
      ) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(bodyR * 0.25, side * bodyR * 0.48, bodyR * 0.36, 0, Math.PI * 2);
          ctx.fillStyle = skin.trimColor;
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#020617';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(bodyR * 0.25, side * bodyR * 0.48, bodyR * 0.21, 0, Math.PI * 2);
          ctx.fillStyle = isBlinded ? '#FEF08A' : skin.visorColor;
          ctx.fill();
        }
      } else if (skin.hairOrCrest === 'merc_gem_band') {
        ctx.beginPath();
        ctx.arc(0, 0, bodyR * 0.88, -Math.PI * 0.56, Math.PI * 0.56);
        ctx.strokeStyle = skin.trimColor;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-bodyR * 0.05, 0, bodyR * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = skin.visorColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#020617';
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = isBlinded ? '#FEF08A' : '#0F172A';
      ctx.fillRect(bodyR * 0.32, -bodyR * 0.45, bodyR * 0.42, bodyR * 0.9);
    }

    ctx.restore();
  }

  private drawMuzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, intensity: number) {
    if (intensity <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= intensity;
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(4, -6);
    ctx.lineTo(9, -2);
    ctx.lineTo(20, 0);
    ctx.lineTo(9, 2);
    ctx.lineTo(4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFF0B3';
    ctx.beginPath();
    ctx.ellipse(5, 0, 8, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D) {
    const mx = this.mouseScreen.x;
    const my = this.mouseScreen.y;
    const p = this.player;
    const weapon = p.weapons[p.activeHand];
    const r = weapon.type === 'gun' ? this.getPlayerGunSpread(weapon.def) * GUN_AIM.spreadScale : 12;

    ctx.save();
    ctx.translate(mx, my);

    if (weapon.type === 'gun' && weapon.reloadTimer > 0) {
      // 換子彈圖示（對應 換子彈.png：雙橘黃順時針旋轉彎曲箭頭）
      ctx.rotate(this.time * 4.5);
      for (const baseAng of [0, Math.PI]) {
        ctx.save();
        ctx.rotate(baseAng);
        ctx.beginPath();
        ctx.arc(0, 0, 12, -0.35, 1.55);
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 6.2;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 12, -0.35, 1.55);
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 3.6;
        ctx.lineCap = 'round';
        ctx.stroke();

        const tipX = Math.cos(1.62) * 12;
        const tipY = Math.sin(1.62) * 12;
        ctx.translate(tipX, tipY);
        ctx.rotate(1.62 + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -5.5);
        ctx.lineTo(-4, 5.5);
        ctx.closePath();
        ctx.fillStyle = '#F97316';
        ctx.fill();
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    } else if (weapon.type === 'gun' && weapon.ammoInMag <= 0) {
      // 沒有子彈圖示（對應 沒有子彈.png：紅色空圓環 + 12 道外射警示紅線）
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 10.5, Math.sin(ang) * 10.5);
        ctx.lineTo(Math.cos(ang) * 15.5, Math.sin(ang) * 15.5);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = p.eagleEyeTimer > 0 ? '#FB7185' : p.comboEmpowerTimer > 0 ? '#FBBF24' : '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 2.0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }

    ctx.restore();
  }

  public emitHud() {
    const p = this.player;
    let nearby: string | null = null;
    for (const pk of this.pickups) {
      if (dist(p.x, p.y, pk.x, pk.y) < 70) {
        nearby =
          pk.meleeDef?.kind === 'shield' && pk.durability !== undefined
            ? `${pk.label} (${pk.durability}/100)`
            : pk.label;
        break;
      }
    }
    const hostiles = this.enemies.filter((e) => areHostile(p.faction, 'player', e.faction, e.id));
    const weapon = p.weapons[p.activeHand];
    const offHandWeapon = p.weapons[p.activeHand === 0 ? 1 : 0];
    const activeSkill = weapon.type === 'melee' ? FACTIONS[p.faction].meleeSkills[weapon.def.kind].name : null;

    const buffs: string[] = [];
    const activeTimedSkills: HudSnapshot['player']['activeTimedSkills'] = [];
    if (p.royalShieldTimer > 0) {
      buffs.push(`聖光護盾 ${p.royalShieldTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'royalShield', name: '聖光護盾', remaining: p.royalShieldTimer, duration: 6.5, color: '#38BDF8' });
    }
    if (p.eagleEyeTimer > 0) {
      buffs.push(`鷹眼術 ${p.eagleEyeTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'eagleEye', name: '鷹眼術', remaining: p.eagleEyeTimer, duration: 8.0, color: '#FB7185' });
    }
    if (p.shadowCloneTimer > 0) {
      buffs.push(`影分身 ${p.shadowCloneTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'shadowClone', name: '影分身', remaining: p.shadowCloneTimer, duration: 6.5, color: '#A855F7' });
    }
    if (p.vampireTimer > 0) {
      buffs.push(`吸血術 ${p.vampireTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'vampire', name: '吸血術', remaining: p.vampireTimer, duration: 7.5, color: '#F43F5E' });
    }
    if (p.shrinkTimer > 0) {
      buffs.push(`縮小化 ${p.shrinkTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'shrink', name: '縮小化', remaining: p.shrinkTimer, duration: 7.5, color: '#FBBF24' });
    }
    if (p.giantTimer > 0) {
      buffs.push(`巨人化 ${p.giantTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'giant', name: '巨人化', remaining: p.giantTimer, duration: 7.5, color: '#F97316' });
    }

    const factionActive: Record<FactionId, number> = {
      royal: this.getActiveFactionCount('royal'),
      shadow: this.getActiveFactionCount('shadow'),
      mercenary: this.getActiveFactionCount('mercenary'),
    };
    const factionRemaining: Record<FactionId, number> = {
      royal: factionActive.royal + this.deploymentQueue.royal,
      shadow: factionActive.shadow + this.deploymentQueue.shadow,
      mercenary: factionActive.mercenary + this.deploymentQueue.mercenary,
    };
    const totalSoldiersRemaining =
      factionRemaining.royal + factionRemaining.shadow + factionRemaining.mercenary;

    this.onHudUpdate({
      mode: this.mode,
      mapId: this.mapId,
      mapName: this.map.name,
      status: this.status,
      respawnSeconds: Math.ceil(this.respawnTimer),
      enemiesRemaining: hostiles.length + (p.faction === 'mercenary'
        ? this.deploymentQueue.royal + this.deploymentQueue.shadow + this.deploymentQueue.mercenary
        : (['royal', 'shadow', 'mercenary'] as FactionId[])
            .filter((f) => f !== p.faction)
            .reduce((acc, f) => acc + this.deploymentQueue[f], 0)),
      totalSoldiersRemaining,
      factionRemaining,
      factionActive,
      bannerText: this.bannerTimer > 0 ? this.bannerText : '',
      activeSkillBanner: this.activeSkillBannerTimer > 0 ? this.activeSkillBanner : null,
      player: {
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        shield: weapon.type === 'melee' ? Math.round(weapon.durability) : 0,
        maxShield: p.maxShield,
        qi: Math.round(p.qi),
        maxQi: p.maxQi,
        lives: p.lives,
        maxLives: p.maxLives,
        reputation: p.reputations[p.faction],
        reputations: { ...p.reputations },
        qiSpeedMultiplier: getReputationQiMultiplier(p.reputations[p.faction]),
        score: Math.floor(p.score),
        totalDamage: p.totalDamage,
        kills: p.kills,
        comboCount: p.comboCount,
        maxCombo: p.maxCombo,
        faction: p.faction,
        characterSkin: p.characterSkin,
        weapon: { ...weapon },
        offHandWeapon: { ...offHandWeapon },
        reserveAmmo: p.reserveAmmo,
        maxReserveAmmo: p.maxReserveAmmo,
        reloadProgress: weapon.type === 'gun' && weapon.reloadTimer > 0
          ? Math.max(0.01, 1 - weapon.reloadTimer / weapon.def.reloadTime)
          : 0,
        isSwapping: p.swapTimer > 0,
        chargingMelee: p.chargingMelee && this.chargeSessionAllowed,
        chargeReady: p.chargeReady,
        comboEmpower: p.comboEmpowerTimer > 0,
        activeSkillName: activeSkill,
        activeBuffText: buffs.length > 0 ? buffs.join(' · ') : null,
        activeTimedSkills,
        dmgMultiplier: p.dmgMultiplier,
        critChance: p.critChance,
        armor: p.armor,
        lifesteal: p.lifesteal,
      },
      nearbyPickup: nearby,
      factionScores: { ...this.factionScores },
    });
  }
}
