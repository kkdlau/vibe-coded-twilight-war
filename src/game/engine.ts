import { sfx, type FootstepSurface } from '../audio/sfx';
import {
  drawBeamTracers,
  drawCharacter,
  drawCrosshair,
  drawFloatingTexts,
  drawOutlinedText,
  drawParticles,
  drawPickup,
  drawQiRecovery,
  drawRoyalShield,
  drawSlashEffect,
} from './combatRenderer';
import { drawMorphGround, drawProjectiles, drawSkillTraces, drawVampireMist } from './skillRenderer';
import { FACTIONS, FACTION_CHARACTERS, GUNS, MELEES, getReputationQiMultiplier, getWeaponSwapDuration } from './data';
import {
  CHAR_BASE_RADIUS,
  ELEV_PADDING,
  angleDiff,
  areHostile,
  clamp,
  dist,
  getMoveCheckRadius,
  pointInRect,
  resolveCircleRect,
  segmentCircleHit,
  segmentIntersectsRect,
  snapToEightDirections,
  uid,
} from './geometry';
import { renderMapBaseLayer, renderMapCanopies } from './mapRenderer';
import { ArenaMap, TILE, createArenaMap } from './maps';
import {
  AI_COMBAT,
  AI_DIFFICULTY,
  AI_GUN_AIM,
  type AiDifficulty,
  AI_PATROL,
  AI_SURPRISE_SECONDS,
  EAGLE_EYE_DURATION,
  GUN_AIM,
  GUNFIRE_ANIMATION_SECONDS,
  PLAYER_MOVEMENT,
  QI_RATE,
  ROYAL_SHIELD_PADDING,
  SHIELD_BASH_DISTANCE,
  MELEE_CHARGE_HOLD_SECONDS,
  RESPAWN_DELAY_SECONDS,
  RELOAD_CUES,
  RIFLE_RECOIL,
  getGunSpread,
} from './tuning';
import { CustomMapData, buildArenaMapFromCustom } from './customMaps';
import {
  ActorSkillVisuals,
  BeamTracer,
  CardinalDir,
  CharacterSkin,
  EnemyArchetype,
  EnemyEntity,
  EquippedWeapon,
  FactionId,
  FloatingText,
  GridTile,
  GunDef,
  HudSnapshot,
  MeleeKind,
  Particle,
  PickupItem,
  PlayerState,
  Projectile,
  PushableIceBlock,
  SkillTrace,
  SlashEffect,
  WeaponHand,
} from './types';

export { snapToEightDirections };

const DEFAULT_PISTOL = GUNS.find((gun) => gun.kind === 'pistol') || GUNS[0];
const DEFAULT_KNIFE = MELEES.find((melee) => melee.kind === 'knife') || MELEES[0];
const AI_FIXED_REPUTATION = 100;

function equipGun(def: GunDef, ammoInMag = def.magSize): Extract<EquippedWeapon, { type: 'gun' }> {
  return {
    type: 'gun',
    def,
    ammoInMag: clamp(Math.round(ammoInMag), 0, def.magSize),
    reloadTimer: 0,
  };
}

function defaultWeaponForHand(hand: WeaponHand): EquippedWeapon {
  return hand === 0 ? equipGun(DEFAULT_PISTOL) : { type: 'melee', def: DEFAULT_KNIFE, durability: 0 };
}

function applyFrontalShieldMitigation(
  rawDmg: number,
  shieldDurability: number,
  isMeleeAttack: boolean
): { finalDmg: number; nextDurability: number; banner?: { text: string; color: string } } {
  if (!isMeleeAttack) {
    const absorbed = Math.min(shieldDurability, rawDmg);
    const nextDurability = Math.max(0, shieldDurability - absorbed);
    return {
      finalDmg: rawDmg - absorbed,
      nextDurability,
      banner:
        absorbed > 0
          ? {
              text: `-${absorbed}`,
              color: '#FFFFFF',
            }
          : undefined,
    };
  }
  const halfDmg = Math.max(1, Math.round(rawDmg * 0.5));
  const blockedAmt = Math.max(1, rawDmg - halfDmg);
  const nextDurability = Math.max(0, shieldDurability - blockedAmt);
  return {
    finalDmg: halfDmg,
    nextDurability,
    banner: {
      text: `-${blockedAmt}`,
      color: '#FFFFFF',
    },
  };
}

function evaluateBlackDragonHit(
  proj: Projectile,
  segs: { x: number; y: number }[],
  prevX: number,
  prevY: number,
  targetX: number,
  targetY: number,
  targetRadius: number
): { hitDmg: number; hitOriginX: number; hitOriginY: number } | null {
  if (dist(proj.x, proj.y, targetX, targetY) <= targetRadius + 18) {
    return { hitDmg: proj.headDamage ?? 20, hitOriginX: prevX, hitOriginY: prevY };
  }
  for (let k = 1; k < segs.length; k++) {
    if (dist(segs[k].x, segs[k].y, targetX, targetY) <= targetRadius + 13) {
      return { hitDmg: proj.bodyDamage ?? 15, hitOriginX: segs[k].x, hitOriginY: segs[k].y };
    }
  }
  return null;
}

export class TwilightEngine {
  public mode = 'frontier' as const;
  public mapId: string;
  public status: HudSnapshot['status'] = 'PLAYING';
  public map: ArenaMap;
  public player: PlayerState;
  public enemies: EnemyEntity[] = [];
  public projectiles: Projectile[] = [];
  public beams: BeamTracer[] = [];
  public slashes: SlashEffect[] = [];
  public particles: Particle[] = [];
  private skillTraces: SkillTrace[] = [];
  private actorSkillVisuals = new WeakMap<PlayerState | EnemyEntity, ActorSkillVisuals>();
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

  private keys = new Set<string>();
  private mouseScreen = { x: 640, y: 360 };
  private mouseDown = false;
  private chargeSessionAllowed = false;
  private meleeHeldSeconds = 0;
  private crosshairBloom = 0;
  private rifleRecoilAngle = 0;
  private viewport = { width: 1280, height: 720 };
  private respawnTimer = 0;
  private distanceSinceStep = 0;
  private camera = { x: 0, y: 0, shake: 0, zoom: 1.3 };
  private time = 0;
  private hudEmitTimer = 0;
  private navStandable = new Set<number>();
  private navAdj = new Map<number, number[]>();
  private wallCellKeys = new Set<string>();
  private framePushInputs: {
    id: string;
    isPlayer: boolean;
    faction: FactionId;
    x: number;
    y: number;
    radius: number;
    elevation: number;
    dirX: number;
    dirY: number;
  }[] = [];
  private onHudUpdate: (snap: HudSnapshot) => void;
  private onReputationChange?: (reps: Record<FactionId, number>) => void;

  constructor(
    faction: FactionId,
    characterSkin: CharacterSkin,
    mapId: string,
    initialReputations: Record<FactionId, number>,
    onHudUpdate: (snap: HudSnapshot) => void,
    onReputationChange?: (reps: Record<FactionId, number>) => void,
    customMap?: CustomMapData,
    private readonly difficulty: AiDifficulty = 'standard'
  ) {
    this.mapId = mapId;
    this.onHudUpdate = onHudUpdate;
    this.onReputationChange = onReputationChange;

    this.map = customMap ? buildArenaMapFromCustom(customMap) : createArenaMap(mapId);
    const fac = FACTIONS[faction];
    const startGun = GUNS.find((g) => g.id === fac.startGunId) || GUNS[0];
    const startMelee = MELEES.find((m) => m.id === fac.startMeleeId) || MELEES[0];
    const spawnPt = this.map.factionSpawns[faction][0] || { x: this.map.width / 2, y: this.map.height / 2 };

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
      hp: 100,
      maxHp: 100,
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
      blindTimer: 0,
      blindDuration: 0,
      freezeTimer: 0,
      invulnTimer: 1.5,
      delayCancelBonus: 0.25,
    };
    this.player.elevation = this.getWalkableElevation(this.player.x, this.player.y);

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
      if (resolveCircleRect(x, y, padRadius, tree).hit) return true;
    }
    return false;
  }

  private buildNavigationGraph() {
    const { cols, rows } = this.map;
    const padR = getMoveCheckRadius(CHAR_BASE_RADIUS);
    const elevByTile = new Map<number, number>();
    this.navStandable.clear();
    this.navAdj.clear();
    this.wallCellKeys.clear();

    const markRectWalls = (rect: { x: number; y: number; w: number; h: number }) => {
      const gx0 = clamp(Math.floor(rect.x / TILE), 0, cols - 1);
      const gy0 = clamp(Math.floor(rect.y / TILE), 0, rows - 1);
      const gx1 = clamp(Math.floor((rect.x + rect.w - 0.01) / TILE), 0, cols - 1);
      const gy1 = clamp(Math.floor((rect.y + rect.h - 0.01) / TILE), 0, rows - 1);
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          this.wallCellKeys.add(`${gx},${gy}`);
        }
      }
    };
    for (const obs of this.map.obstacles) {
      if (obs.kind === 'wall') markRectWalls(obs);
    }
    for (const tree of this.map.trees) {
      markRectWalls(tree);
    }

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
    if (!spawns || spawns.length === 0) {
      return { x: this.map.width / 2, y: this.map.height / 2 };
    }
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
    for (const blk of this.map.pushableIceBlocks || []) {
      if (pointInRect(x, y, blk) && blk.elevation > best) best = blk.elevation;
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
    const key = `${gx},${gy}`;
    if (!this.map.waterTileKeys.has(key)) return true;
    if (this.map.floatingIceTileKeys?.has(key)) return true;
    return Boolean(this.map.floatingIceTiles?.some((f) => f.gx === gx && f.gy === gy));
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
          (obs.kind === 'wall' || obs.style === 'railing') &&
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
    const gx = clamp(Math.floor(x / TILE), 0, this.map.cols - 1);
    const gy = clamp(Math.floor(y / TILE), 0, this.map.rows - 1);
    const tileElev = this.map.tileGrid[gy][gx].elev;

    for (const blk of this.map.pushableIceBlocks || []) {
      if (pointInRect(x, y, blk)) {
        return {
          totalHeight: blk.elevation,
          terrainHeight: tileElev,
          isWall: false,
          isCrate: true,
        };
      }
    }
    for (const obs of this.map.obstacles) {
      if (pointInRect(x, y, obs)) {
        return {
          totalHeight: obs.elevation,
          terrainHeight: obs.kind === 'crate' ? tileElev : obs.elevation,
          isWall: obs.kind === 'wall',
          isCrate: obs.kind === 'crate',
        };
      }
    }
    for (const tree of this.map.trees) {
      if (pointInRect(x, y, tree)) {
        const treeHeight = Math.max(10, Math.round((tileElev + 10) * 10) / 10);
        return {
          totalHeight: treeHeight,
          terrainHeight: treeHeight,
          isWall: true,
          isCrate: false,
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
      if (obs.kind === 'wall' || obs.style === 'railing') {
        const res = resolveCircleRect(x, y, checkR, obs);
        if (res.hit) violations += 2;
      }
    }
    for (const tree of this.map.trees) {
      const res = resolveCircleRect(x, y, checkR, tree);
      if (res.hit) violations += 2;
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

    // 不可跨越石牆、防護欄杆與樹幹同樣保留通道間距
    for (const obs of this.map.obstacles) {
      if (obs.kind === 'wall' || obs.style === 'railing') {
        const res = resolveCircleRect(nx, ny, padRadius, obs);
        nx = res.x;
        ny = res.y;
      }
    }

    for (const tree of this.map.trees) {
      const res = resolveCircleRect(nx, ny, padRadius, tree);
      nx = res.x;
      ny = res.y;
    }

    nx = clamp(nx, padRadius, this.map.width - padRadius);
    ny = clamp(ny, padRadius, this.map.height - padRadius);

    const finalElev = this.getWalkableElevation(nx, ny);
    if (Math.abs(finalElev - curElev) > 0.5) {
      return { x: curX, y: curY, elevation: curElev };
    }
    return { x: nx, y: ny, elevation: finalElev };
  }

  private isSolidWallCell(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= this.map.cols || gy < 0 || gy >= this.map.rows) return false;
    return this.wallCellKeys.has(`${gx},${gy}`);
  }

  private findEarliestWallHit(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): { t: number; x: number; y: number } | null {
    let best: { t: number; x: number; y: number } | null = null;
    for (const obs of this.map.obstacles) {
      if (obs.kind !== 'wall') continue;
      const res = segmentIntersectsRect(x1, y1, x2, y2, obs);
      if (res.hit && (!best || res.t < best.t)) {
        best = { t: res.t, x: res.hitX, y: res.hitY };
      }
    }
    for (const tree of this.map.trees) {
      const res = segmentIntersectsRect(x1, y1, x2, y2, tree);
      if (res.hit && (!best || res.t < best.t)) {
        best = { t: res.t, x: res.hitX, y: res.hitY };
      }
    }
    return best;
  }

  /**
   * 視線檢查 (LoS)：視野半徑 ~8 格，若隔實心牆（含對角相接牆縫）或離開較高一方自身站台後被遮蔽物擋住 3D 直線視線則看不到；
   * 統一由較高一端往較低一端步進，保證雙方視線對稱且不會因站得高而無視空地後方的大箱／高台。
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
    if (totalD > maxRange) return false;
    if (this.findEarliestWallHit(ax, ay, bx, by)) return false;

    const aIsHigher = aElev >= bElev;
    const sx = aIsHigher ? ax : bx;
    const sy = aIsHigher ? ay : by;
    const sElev = aIsHigher ? aElev : bElev;
    const ex = aIsHigher ? bx : ax;
    const ey = aIsHigher ? by : ay;
    const eElev = aIsHigher ? bElev : aElev;

    const steps = Math.max(2, Math.ceil(totalD / 6));
    let prevGx = clamp(Math.floor(sx / TILE), 0, this.map.cols - 1);
    let prevGy = clamp(Math.floor(sy / TILE), 0, this.map.rows - 1);
    let leftHighPlatform = false;

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = sx + (ex - sx) * t;
      const py = sy + (ey - sy) * t;
      const curGx = clamp(Math.floor(px / TILE), 0, this.map.cols - 1);
      const curGy = clamp(Math.floor(py / TILE), 0, this.map.rows - 1);
      if (
        curGx !== prevGx &&
        curGy !== prevGy &&
        this.isSolidWallCell(curGx, prevGy) &&
        this.isSolidWallCell(prevGx, curGy)
      ) {
        return false;
      }
      prevGx = curGx;
      prevGy = curGy;
      const h = this.getHeightAtPoint(px, py);
      if (h.isWall) return false;
      if (h.totalHeight < sElev - 0.01) {
        leftHighPlatform = true;
      }
      if (h.totalHeight > sElev + 1.0) return false;
      if (leftHighPlatform) {
        const rayElev = sElev + (eElev - sElev) * t;
        if (h.totalHeight > rayElev + 1.0) return false;
      }
    }
    return true;
  }

  /**
   * 檢查目前站位與高低差下，遠程子彈是否確實射得到目標（而非被 > 1 格高低差或途中遮蔽箱體擋住）
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
    const seg = this.traceBulletSegment(ax, ay, Math.atan2(by - ay, bx - ax), totalD, aElev, false, {
      elev: bElev,
      dist: totalD,
    });
    const reachedDist = dist(ax, ay, seg.x2, seg.y2);
    return reachedDist >= totalD - 20;
  }

  /**
   * 搜尋附近 5×5 格內戰術優勢站位：
   * - 優先選擇「能射到敵人但敵人打不到自己」的單向掩體／高低差位置
   * - 佔據高地時拒絕往低層移動
   */
  private findBestTacticalSpot(
    e: EnemyEntity,
    target: { x: number; y: number; elev: number },
    sightRange: number,
    desiredRange: number,
    holdingHighGround: boolean,
    isReloading: boolean
  ): { x: number; y: number; scoreGain: number; oneWayAdvantage: boolean; isCurrentTile: boolean } | null {
    const { cols, rows } = this.map;
    const curGx = clamp(Math.floor(e.x / TILE), 0, cols - 1);
    const curGy = clamp(Math.floor(e.y / TILE), 0, rows - 1);

    const evalPoint = (px: number, py: number, elev: number) => {
      const d = dist(px, py, target.x, target.y);
      if (d > sightRange * 0.96) return null;
      if (!this.hasLineOfSight(px, py, elev, target.x, target.y, target.elev, sightRange)) return null;
      const aiCanHit = this.canRangedHitTarget(px, py, elev, target.x, target.y, target.elev);
      const targetCanHit = this.canRangedHitTarget(target.x, target.y, target.elev, px, py, elev);
      const oneWayAdvantage = aiCanHit && !targetCanHit;
      let score = 0;
      if (isReloading) {
        score += !targetCanHit ? 160 : -40;
      } else {
        if (!aiCanHit) return null;
        if (oneWayAdvantage) score += 140;
      }
      if (elev > target.elev) {
        score += 45 * (elev - target.elev);
      }
      score -= Math.abs(d - desiredRange) * 0.14;
      score -= dist(e.x, e.y, px, py) * 0.08;
      return { score, oneWayAdvantage };
    };

    const curEval = evalPoint(e.x, e.y, e.elevation);
    const curScore = curEval ? curEval.score : -999;
    let best: { x: number; y: number; score: number; oneWayAdvantage: boolean; isCurrentTile: boolean } | null = curEval
      ? { x: e.x, y: e.y, score: curScore, oneWayAdvantage: curEval.oneWayAdvantage, isCurrentTile: true }
      : null;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const gx = curGx + dx;
        const gy = curGy + dy;
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
        const idx = this.tileIndex(gx, gy);
        if (!this.navStandable.has(idx)) continue;
        const cx = (gx + 0.5) * TILE;
        const cy = (gy + 0.5) * TILE;
        const candElev = this.getWalkableElevation(cx, cy);
        if (holdingHighGround && candElev < e.elevation - 0.01) continue;
        if (Math.abs(candElev - e.elevation) > 1.0) continue;

        const res = evalPoint(cx, cy, candElev);
        if (!res) continue;
        if (!best || res.score > best.score) {
          best = { x: cx, y: cy, score: res.score, oneWayAdvantage: res.oneWayAdvantage, isCurrentTile: false };
        }
      }
    }

    if (!best) return null;
    return {
      x: best.x,
      y: best.y,
      scoreGain: best.score - curScore,
      oneWayAdvantage: best.oneWayAdvantage,
      isCurrentTile: best.isCurrentTile,
    };
  }

  private findWallOrPinchEndpoint(
    x1: number,
    y1: number,
    angle: number,
    maxDist: number
  ): { x2: number; y2: number; hitWall: boolean } {
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const wallHit = this.findEarliestWallHit(x1, y1, x1 + vx * maxDist, y1 + vy * maxDist);
    const wallDist = wallHit ? dist(x1, y1, wallHit.x, wallHit.y) : maxDist;
    let remaining = Math.min(maxDist, wallDist);
    let curX = x1;
    let curY = y1;
    const stepSize = 4;
    while (remaining > 0) {
      const prevX = curX;
      const prevY = curY;
      const prevGx = clamp(Math.floor(prevX / TILE), 0, this.map.cols - 1);
      const prevGy = clamp(Math.floor(prevY / TILE), 0, this.map.rows - 1);
      const step = Math.min(stepSize, remaining);
      curX += vx * step;
      curY += vy * step;
      remaining -= step;
      if (curX < 0 || curX > this.map.width || curY < 0 || curY > this.map.height) {
        return { x2: clamp(curX, 0, this.map.width), y2: clamp(curY, 0, this.map.height), hitWall: false };
      }
      const curGx = clamp(Math.floor(curX / TILE), 0, this.map.cols - 1);
      const curGy = clamp(Math.floor(curY / TILE), 0, this.map.rows - 1);
      if (
        curGx !== prevGx &&
        curGy !== prevGy &&
        this.isSolidWallCell(curGx, prevGy) &&
        this.isSolidWallCell(prevGx, curGy)
      ) {
        return { x2: prevX, y2: prevY, hitWall: true };
      }
    }
    if (wallHit && wallDist <= maxDist) {
      return { x2: wallHit.x, y2: wallHit.y, hitWall: true };
    }
    return { x2: curX, y2: curY, hitWall: false };
  }

  private canBulletReachPoint(
    ax: number,
    ay: number,
    aElev: number,
    bx: number,
    by: number,
    bElev: number
  ): boolean {
    const totalD = dist(ax, ay, bx, by);
    if (totalD <= 2) return true;
    const seg = this.traceBulletSegment(ax, ay, Math.atan2(by - ay, bx - ax), totalD, aElev, false, {
      elev: bElev,
      dist: totalD,
    });
    return dist(ax, ay, seg.x2, seg.y2) >= totalD - 2;
  }

  /**
   * 子彈射線高度阻擋物理：
   * - 可由高處往低處射，但經過低處空地後再遇大箱／高台仍會依 3D 射線高度與最小經過地形受阻
   * - 高度差 > 1.0 且 < 2.0（如大箱子）：子彈深入邊緣約 0.5 格處停止
   * - 高度差 >= 2.0 格（如貨櫃、2層山、實牆）：子彈在邊緣即停止（0 穿透）
   */
  private traceBulletSegment(
    x1: number,
    y1: number,
    angle: number,
    maxDist: number,
    startElev: number,
    emitBurst = true,
    targetAim?: { elev: number; dist: number }
  ): { x1: number; y1: number; x2: number; y2: number } {
    const stepSize = 4;
    let curX = x1;
    let curY = y1;
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const wallHit = this.findEarliestWallHit(x1, y1, x1 + vx * maxDist, y1 + vy * maxDist);
    const wallDist = wallHit ? dist(x1, y1, wallHit.x, wallHit.y) : maxDist;
    const effectiveMaxDist = Math.min(maxDist, wallDist);
    let minTraversedElev = startElev;
    let leftStartCrate = startElev < 1.0;
    let leftStartPlatform = false;
    let remaining = effectiveMaxDist;
    let traveled = 0;
    let penetratingHalfTile = false;
    let penetrationLeft = TILE * 0.49;

    while (remaining > 0) {
      const prevX = curX;
      const prevY = curY;
      const prevGx = clamp(Math.floor(prevX / TILE), 0, this.map.cols - 1);
      const prevGy = clamp(Math.floor(prevY / TILE), 0, this.map.rows - 1);
      const step = Math.min(stepSize, remaining);
      curX += vx * step;
      curY += vy * step;
      remaining -= step;
      traveled += step;

      if (curX < 0 || curX > this.map.width || curY < 0 || curY > this.map.height) {
        return {
          x1,
          y1,
          x2: clamp(curX, 0, this.map.width),
          y2: clamp(curY, 0, this.map.height),
        };
      }

      const curGx = clamp(Math.floor(curX / TILE), 0, this.map.cols - 1);
      const curGy = clamp(Math.floor(curY / TILE), 0, this.map.rows - 1);
      if (
        curGx !== prevGx &&
        curGy !== prevGy &&
        this.isSolidWallCell(curGx, prevGy) &&
        this.isSolidWallCell(prevGx, curGy)
      ) {
        if (emitBurst) this.spawnBurst(prevX, prevY, '#E2E8F0', 4);
        return { x1, y1, x2: prevX, y2: prevY };
      }

      const h = this.getHeightAtPoint(curX, curY);
      if (!h.isCrate && !penetratingHalfTile) {
        leftStartCrate = true;
        const effectiveFloor = startElev < 0 ? h.terrainHeight : Math.max(0, h.terrainHeight);
        minTraversedElev = Math.min(minTraversedElev, effectiveFloor);
      }
      if (h.totalHeight < startElev - 0.01) {
        leftStartPlatform = true;
        leftStartCrate = true;
      }

      let refElev = minTraversedElev;
      if (targetAim) {
        if (targetAim.elev > startElev) {
          // 仰射時子彈不可憑空抬升越障，仍受起點與經過最低地形約束
          refElev = minTraversedElev;
        } else if (!leftStartPlatform) {
          // 尚在射擊者自身站台範圍內，不自我遮擋
          refElev = startElev;
        } else {
          // 離開高處站台並越過低地後，依 3D 彈道斜率線性下降至目標高度
          const frac = targetAim.dist > 0 ? clamp(traveled / targetAim.dist, 0, 1) : 1;
          refElev = startElev + (targetAim.elev - startElev) * frac;
        }
      }

      const heightDiff = h.totalHeight - refElev;
      const crateBlocks = h.isCrate && (leftStartCrate || h.totalHeight > startElev) && heightDiff > 1.0;
      const cliffBlocks = !h.isCrate && heightDiff > 1.0;
      const immediateElevBlock = (!h.isCrate || leftStartCrate || h.totalHeight > startElev) && heightDiff >= 2.0;

      if (h.isWall || immediateElevBlock) {
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

    if (wallHit && wallDist <= maxDist) {
      if (emitBurst) this.spawnBurst(wallHit.x, wallHit.y, '#E2E8F0', 4);
      return { x1, y1, x2: wallHit.x, y2: wallHit.y };
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
            ammoInMag: gunDef.magSize,
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
    this.meleeHeldSeconds = 0;
    sfx.setMeleeCharge(null);
  }

  public setMousePos(x: number, y: number) {
    const moveDist = dist(this.mouseScreen.x, this.mouseScreen.y, x, y);
    this.mouseScreen.x = x;
    this.mouseScreen.y = y;

    const weapon = this.player.weapons[this.player.activeHand];
    if (this.status === 'PLAYING' && weapon.type === 'gun') {
      const gun = weapon.def;
      this.crosshairBloom = Math.min(
        gun.maxCrosshair - gun.baseCrosshair,
        this.crosshairBloom + Math.min(18, Math.max(0, moveDist - 2) * 0.09)
      );
    }
    if (this.status === 'PLAYING') {
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
        this.performMeleeAttack();
        if (this.mouseDown && this.status === 'PLAYING') {
          if (this.player.freezeTimer > 0) {
            this.player.chargingMelee = false;
            this.chargeSessionAllowed = false;
            this.player.chargeReady = false;
          } else {
            this.chargeSessionAllowed = this.player.qi >= this.player.maxQi - 0.5;
          }
        }
      } else {
        if (this.player.swapTimer <= 0 && weapon.ammoInMag <= 0 && weapon.reloadTimer === 0) {
          this.startReload();
        } else {
          this.tryAttack();
        }
      }
    } else if (!down && this.mouseDown) {
      this.mouseDown = false;
      if (weapon.type === 'melee' && this.player.chargeReady) {
        this.performMeleeAttack();
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
    } else if (code === 'KeyQ') {
      this.switchWeapon();
    } else if (code === 'KeyR') {
      this.startReload();
    } else if (code === 'Space') {
      this.tryPickup();
    }
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
        ? { gunDef: weapon.def, ammoInMag: weapon.ammoInMag }
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
    this.rifleRecoilAngle = 0;
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
      p.eagleEyeTimer > 0 ? RIFLE_RECOIL.eagleEyeMultiplier : 1
    );
  }

  private getPlayerRifleDrift() {
    return this.rifleRecoilAngle * (this.player.eagleEyeTimer > 0 ? RIFLE_RECOIL.eagleEyeMultiplier : 1);
  }

  public switchWeapon() {
    const p = this.player;
    this.cancelMeleeCharge();
    const prevWeapon = p.weapons[p.activeHand];
    if (prevWeapon.type === 'gun') {
      prevWeapon.reloadTimer = 0;
    }
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
    const weapon = p.weapons[p.activeHand];
    if (weapon.type !== 'gun' || weapon.reloadTimer > 0) return;
    if (weapon.ammoInMag >= weapon.def.magSize) {
      this.spawnText(p.x, p.y - 36, '彈匣已滿', '#94A3B8', 0.9);
      return;
    }
    if (p.reserveAmmo <= 0) {
      sfx.emptyGun();
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
        weapon = equipGun(item.gunDef, item.ammoInMag ?? item.gunDef.magSize);
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
      const label =
        weapon.type === 'gun'
          ? `${weapon.def.name} (${weapon.ammoInMag}/${weapon.def.magSize})`
          : weapon.def.kind === 'shield'
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

      const comboMult = p.comboEmpowerTimer > 0 ? 1 + p.delayCancelBonus : 1.0;
      if (p.comboEmpowerTimer > 0) p.comboEmpowerTimer = 0;

      const aimAngle = p.angle + (gun.kind === 'rifle' ? this.getPlayerRifleDrift() : 0);
      const muzzleDist = p.radius + 4;
      const spreadRad = this.getPlayerGunSpread(gun);
      const infiniteRange = Math.hypot(this.map.width, this.map.height) + TILE * 2;

      for (let i = 0; i < pelletsToFire; i++) {
        const spreadOffset = (Math.random() - 0.5) * spreadRad;
        const a = aimAngle + spreadOffset;
        const muzzleX = p.x + Math.cos(a) * muzzleDist;
        const muzzleY = p.y + Math.sin(a) * muzzleDist;
        const preSeg = this.traceBulletSegment(p.x, p.y, a, muzzleDist, p.elevation, false);
        const reachedMuzzle = dist(p.x, p.y, preSeg.x2, preSeg.y2) >= muzzleDist - 0.5;
        const seg = reachedMuzzle
          ? this.traceBulletSegment(muzzleX, muzzleY, a, infiniteRange, p.elevation, false)
          : preSeg;
        const wallEnd = reachedMuzzle
          ? this.findWallOrPinchEndpoint(muzzleX, muzzleY, a, infiniteRange)
          : { x2: preSeg.x2, y2: preSeg.y2, hitWall: true };

        let segEndX = seg.x2;
        let segEndY = seg.y2;

        // 槍械子彈碰人即止，不可一子彈攻擊兩人，且不得隔實牆、對角牆縫或地形高箱遮擋擦邊命中！
        const candidates: { enemy: EnemyEntity; t: number; perpDist: number; hitX: number; hitY: number }[] = [];
        for (const e of this.enemies) {
          if (e.elevation - p.elevation >= 2.0) continue;
          const res = this.getHitscanContact({ x1: seg.x1, y1: seg.y1, x2: wallEnd.x2, y2: wallEnd.y2 }, e);
          if (
            res.hit &&
            !this.findEarliestWallHit(res.hitX, res.hitY, e.x, e.y) &&
            this.canBulletReachPoint(seg.x1, seg.y1, p.elevation, res.hitX, res.hitY, e.elevation)
          ) {
            candidates.push({ enemy: e, ...res });
          }
        }
        candidates.sort((c1, c2) => c1.t - c2.t);

        if (candidates.length > 0) {
          const hitInfo = candidates[0];
          const centerAccuracy = clamp(1 - hitInfo.perpDist / hitInfo.enemy.radius, 0, 1);
          const accuracyFactor = 0.28 + 0.72 * centerAccuracy;
          const maxShotDmg = gun.damage * comboMult;
          const actualDmg = Math.max(1, Math.round(maxShotDmg * accuracyFactor));

          if (hitInfo.enemy.royalShieldTimer > 0) {
            this.deflectShieldShot(hitInfo.enemy, hitInfo.hitX, hitInfo.hitY, a);
          } else {
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
          }

          segEndX = hitInfo.hitX;
          segEndY = hitInfo.hitY;
        } else if (reachedMuzzle && dist(muzzleX, muzzleY, seg.x2, seg.y2) < infiniteRange - 1) {
          this.spawnBurst(seg.x2, seg.y2, '#E2E8F0', 4);
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
      if (gun.kind === 'rifle') {
        this.rifleRecoilAngle = Math.min(RIFLE_RECOIL.maxAngle, this.rifleRecoilAngle + RIFLE_RECOIL.kick);
      }

      this.camera.shake = Math.min(8, this.camera.shake + (gun.kind === 'shotgun' || gun.kind === 'sniper' ? 4.5 : 1.4));
      sfx.gunshot(gun.kind);
      const fxMuzzleX = p.x + Math.cos(p.angle) * muzzleDist;
      const fxMuzzleY = p.y + Math.sin(p.angle) * muzzleDist;
      if (!this.findEarliestWallHit(p.x, p.y, fxMuzzleX, fxMuzzleY)) {
        this.spawnBurst(fxMuzzleX, fxMuzzleY, gun.color, gun.kind === 'shotgun' ? 7 : 3);
      }
    }
  }

  private performMeleeAttack() {
    const p = this.player;
    if (p.swapTimer > 0 || (!p.chargeReady && p.attackCooldown > 0)) return;

    const weapon = p.weapons[p.activeHand];
    if (weapon.type !== 'melee') return;
    const melee = weapon.def;
    const comboMult = p.comboEmpowerTimer > 0 ? 1 + p.delayCancelBonus : 1.0;

    if (p.chargeReady && p.freezeTimer <= 0) {
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

    p.attackCooldown = 1 / (melee.swingRate * (p.freezeTimer > 0 ? 0.9 : 1));
    p.lastAttackAt = this.time;
    p.delayCancelReady = true;
    p.attackAnimDuration = melee.kind === 'greatsword' ? 0.24 : 0.16;
    p.attackAnimTimer = p.attackAnimDuration;
    p.attackAnimKind = melee.kind;
    if (p.comboEmpowerTimer > 0) p.comboEmpowerTimer = 0;

    if (melee.kind === 'shield') {
      sfx.shieldBash();
    } else {
      sfx.slash(melee.kind === 'greatsword');
    }
    const giantMult = p.giantTimer > 0 ? 1.3 : 1.0;
    const dmg = Math.round(melee.damage * comboMult * giantMult);
    if (melee.kind !== 'shield') {
      const style = melee.kind === 'knife' ? 'thrust' : melee.kind === 'claw' ? 'claw' : 'sweep';
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
    }

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
            0,
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
        p.royalShieldImpact = undefined;
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
          this.addSkillTrace('blink', p, safeSpot, 0.58);
          p.x = safeSpot.x;
          p.y = safeSpot.y;
          p.elevation = this.getWalkableElevation(p.x, p.y);
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
            damage: Math.round(30 * comboMult),
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
        p.eagleEyeTimer = EAGLE_EYE_DURATION;
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
        const headDmg = Math.round(20 * comboMult);
        const bodyDmg = Math.round(15 * comboMult);
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
    const knockPower = isShieldPush ? SHIELD_BASH_DISTANCE / 0.05 : 200;
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
            enemy.stunTimer = Math.max(enemy.stunTimer, 0.18);
          }
        }
      }
    }
  }

  private isFrontalShieldBlock(defX: number, defY: number, defAngle: number, origX: number, origY: number): boolean {
    const incomingAngle = Math.atan2(origY - defY, origX - defX);
    return Math.abs(angleDiff(defAngle, incomingAngle)) <= Math.PI * 0.38;
  }

  private getActorSkillVisuals(actor: PlayerState | EnemyEntity): ActorSkillVisuals {
    const existing = this.actorSkillVisuals.get(actor);
    if (existing) return existing;
    const visuals = { mistX: actor.x, mistY: actor.y, mistOpacity: 0, sizeScale: 1 };
    this.actorSkillVisuals.set(actor, visuals);
    return visuals;
  }

  private updateActorSkillVisuals(actor: PlayerState | EnemyEntity, dt: number) {
    const visuals = this.getActorSkillVisuals(actor);
    const mistTarget = actor.vampireTimer > 0 ? 1 : 0;
    if (visuals.mistOpacity < 0.015) {
      visuals.mistX = actor.x;
      visuals.mistY = actor.y;
    } else {
      const follow = 1 - Math.exp(-dt * 8);
      visuals.mistX += (actor.x - visuals.mistX) * follow;
      visuals.mistY += (actor.y - visuals.mistY) * follow;
      const trail = dist(actor.x, actor.y, visuals.mistX, visuals.mistY);
      const maxTrail = actor.radius * 1.6;
      if (trail > maxTrail) {
        visuals.mistX = actor.x + (visuals.mistX - actor.x) * maxTrail / trail;
        visuals.mistY = actor.y + (visuals.mistY - actor.y) * maxTrail / trail;
      }
    }
    visuals.mistOpacity += (mistTarget - visuals.mistOpacity) * (1 - Math.exp(-dt * 7));
    const morph = 1 - Math.exp(-dt * (actor.sizeScale > visuals.sizeScale ? 15 : 20));
    visuals.sizeScale += (actor.sizeScale - visuals.sizeScale) * morph;
    if (Math.abs(actor.sizeScale - visuals.sizeScale) < 0.002) visuals.sizeScale = actor.sizeScale;
  }

  private markShadowDodge(actor: PlayerState | EnemyEntity, originX?: number, originY?: number) {
    const shotAngle = originX !== undefined && originY !== undefined
      ? Math.atan2(actor.y - originY, actor.x - originX)
      : actor.angle;
    const side = Math.sin(actor.angle - shotAngle) < 0 ? -1 : 1;
    this.getActorSkillVisuals(actor).shadowDodge = { startedAt: this.time, angle: shotAngle + side * Math.PI / 2 };
  }

  private drawActorSkillEffects(ctx: CanvasRenderingContext2D, actor: PlayerState | EnemyEntity, visuals: ActorSkillVisuals) {
    if (visuals.mistOpacity > 0.015) {
      drawVampireMist(ctx, actor, visuals, this.time);
    }
    if (visuals.sizeScale !== 1 || actor.sizeScale !== 1) {
      drawMorphGround(ctx, actor, visuals.sizeScale, this.time);
    }
  }

  private addSkillTrace(
    kind: SkillTrace['kind'],
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number
  ) {
    this.skillTraces.push({
      kind, fromX: from.x, fromY: from.y, destination: to, startedAt: this.time, duration,
    });
  }

  private applyVampireHealing(attacker: PlayerState | EnemyEntity, victim: { x: number; y: number }, damage: number, melee: boolean) {
    const heal = Math.max(1, Math.round(damage * (melee ? 0.5 : 1 / 3)));
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    this.addSkillTrace('siphon', victim, attacker, 0.64);
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
      if (noFriendlyFire || baseDmg <= 0) return;
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
        this.spawnText(enemy.x, enemy.y - 24, `誤傷友軍 -${ffDmg}`, '#FCA5A5', 0.86, true);
      }
      return;
    }

    // 敵人技能防禦判定：皇家護盾、天影影分身閃避（近戰命中立即破除影分身）、第三變大減傷 / 變細近傷增加
    if (enemy.royalShieldTimer > 0 && !isMelee) {
      this.markShieldImpact(enemy, hitOriginX, hitOriginY);
      return;
    }
    if (enemy.shadowCloneTimer > 0) {
      if (isMelee) {
        enemy.shadowCloneTimer = 0;
        this.getActorSkillVisuals(enemy).shadowDodge = undefined;
        this.spawnText(enemy.x, enemy.y - 38, '近戰破除影分身!', '#FB7185', 1.05);
      } else if (Math.random() < 2 / 3) {
        this.markShadowDodge(enemy, hitOriginX, hitOriginY);
        return;
      }
    }

    let dmg = baseDmg;
    if (enemy.royalShieldTimer > 0 && isMelee) dmg *= 0.8;
    if (enemy.shrinkTimer > 0 && isMelee) dmg *= 1.35;
    if (enemy.giantTimer > 0) dmg *= 0.9;

    let finalDmg = baseDmg <= 0 ? 0 : Math.max(1, Math.round(dmg));

    // 手持盾牌：只擋來自正面的攻擊（側面／背面無法格擋；純推擊 0 傷不消耗盾牌耐久）
    const enemyActiveWeapon = enemy.weapons[enemy.activeHand];
    const enemyHoldingShield =
      enemyActiveWeapon.type === 'melee' &&
      enemyActiveWeapon.def.kind === 'shield' &&
      enemyActiveWeapon.durability > 0;
    if (enemyHoldingShield && finalDmg > 0) {
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
        const shieldRes = applyFrontalShieldMitigation(finalDmg, enemyActiveWeapon.durability, isMelee);
        enemyActiveWeapon.durability = shieldRes.nextDurability;
        finalDmg = shieldRes.finalDmg;
        if (shieldRes.banner) {
          this.spawnText(enemy.x, enemy.y - 30, shieldRes.banner.text, shieldRes.banner.color, 0.95);
        }
        if (enemyActiveWeapon.durability <= 0) {
          enemy.weapons[enemy.activeHand] = { type: 'melee', def: DEFAULT_KNIFE, durability: 0 };
          enemy.chargingMelee = false;
          enemy.chargeReady = false;
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
        if (finalDmg > 0 && enemy.visibleTargetId !== attackerId) {
          const surpriseDelay = (AI_COMBAT[enemy.archetype].reactionSeconds + AI_SURPRISE_SECONDS)
            * AI_DIFFICULTY[this.difficulty].reactionMultiplier;
          enemy.reactionTimer = Math.max(enemy.reactionTimer, surpriseDelay);
          enemy.chargingMelee = false;
          enemy.chargeReady = false;
        }
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
        this.applyVampireHealing(p, enemy, finalDmg, isMelee);
      }

      if (finalDmg > 0) sfx.hit(bullseye);
    } else if (attackerEntity && attackerEntity.vampireTimer > 0 && finalDmg > 0) {
      this.applyVampireHealing(attackerEntity, enemy, finalDmg, isMelee);
    }

    this.spawnBurst(enemy.x, enemy.y, finalDmg === 0 ? '#FFFFFF' : bullseye ? '#FBBF24' : '#F87171', bullseye ? 7 : 5);
    if (finalDmg > 0) {
      this.spawnText(
        enemy.x + (Math.random() - 0.5) * 16,
        enemy.y - 24,
        `-${finalDmg}`,
        '#EF4444',
        0.86,
        true
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
      this.spawnText(enemy.x, enemy.y - 42, repToast, '#7DD3FC', 0.85, true);

      p.score += 120 + p.comboCount * 15;
      this.factionScores[p.faction] += 25;
    }

    // 場上武器數量固定：只有非預設武器（非小槍／非小刀）會在持有者陣亡時掉回地面，防彈盾保留剩餘耐久
    const droppedFirst = this.dropWeapon(enemy.weapons[0], enemy.x, enemy.y);
    const secondX = droppedFirst ? clamp(enemy.x + 18, TILE * 0.5, this.map.width - TILE * 0.5) : enemy.x;
    this.dropWeapon(enemy.weapons[1], secondX, enemy.y);

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
      this.markShieldImpact(p, hitOriginX, hitOriginY);
      return;
    }

    if (p.shadowCloneTimer > 0) {
      if (isMeleeAttack) {
        p.shadowCloneTimer = 0;
        this.getActorSkillVisuals(p).shadowDodge = undefined;
        this.spawnText(p.x, p.y - 44, '近戰破除影分身!', '#FB7185', 1.15);
      } else if (Math.random() < 2 / 3) {
        this.markShadowDodge(p, hitOriginX, hitOriginY);
        return;
      }
    }

    let dmg = rawDmg;
    if (p.royalShieldTimer > 0 && isMeleeAttack) dmg *= 0.8;
    if (p.shrinkTimer > 0 && isMeleeAttack) dmg *= 1.35;
    if (p.giantTimer > 0) dmg *= 0.9;

    let finalDmg = rawDmg <= 0 ? 0 : Math.max(2, Math.round(dmg));

    // 手持盾牌且攻擊來自正面時才能格擋
    const weapon = p.weapons[p.activeHand];
    if (finalDmg > 0 && weapon.type === 'melee' && weapon.def.kind === 'shield' && weapon.durability > 0) {
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
        const shieldRes = applyFrontalShieldMitigation(finalDmg, weapon.durability, isMeleeAttack);
        weapon.durability = shieldRes.nextDurability;
        finalDmg = shieldRes.finalDmg;
        if (shieldRes.banner) {
          this.spawnText(p.x, p.y - 36, shieldRes.banner.text, shieldRes.banner.color, 0.95);
        }
        if (weapon.durability <= 0) {
          p.weapons[p.activeHand] = { type: 'melee', def: DEFAULT_KNIFE, durability: 0 };
          this.cancelMeleeCharge();
        }
      }
    }

    if (finalDmg > 0) {
      p.hp -= finalDmg;
      this.spawnText(p.x, p.y - 34, `-${finalDmg}`, '#EF4444', 0.86, true);
      if (attackerId) {
        const ae = this.enemies.find((e) => e.id === attackerId);
        if (ae && ae.vampireTimer > 0) {
          this.applyVampireHealing(ae, p, finalDmg, isMeleeAttack);
        }
      }
    }

    p.invulnTimer = finalDmg > 0 ? 0.2 : rawDmg > 0 ? 0.08 : 0.04;
    if (p.hp <= 0) {
      this.handlePlayerDeath();
    } else {
      if (rawDmg > 0) sfx.playerHurt();
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
    for (const enemy of this.enemies) {
      if (enemy.visibleTargetId !== 'player') continue;
      enemy.visibleTargetId = null;
      enemy.chargingMelee = false;
      enemy.chargeReady = false;
    }
    const spawnPt = this.map.factionSpawns[p.faction][0];
    p.x = spawnPt.x;
    p.y = spawnPt.y;
    p.vx = 0;
    p.vy = 0;
    p.elevation = this.getWalkableElevation(p.x, p.y);
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
    p.blindTimer = 0;
    p.blindDuration = 0;
    p.freezeTimer = 0;
    p.sizeScale = 1;
    this.actorSkillVisuals.delete(p);
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
    const entityId = uid('enemy');
    const trulyAlly = isAllyFlag && faction !== 'mercenary' && faction === this.player.faction;
    const elev = this.getWalkableElevation(x, y);
    return {
      id: entityId,
      name: pickedSkin.name,
      archetype: arch,
      faction,
      isAlly: trulyAlly,
      activeHand: 0,
      weapons: [defaultWeaponForHand(0), defaultWeaponForHand(1)],
      swapTimer: 0,
      swapDuration: 0,
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
      qi: 100,
      maxQi: 100,
      chargingMelee: false,
      chargeReady: false,
      speed: baseSpeed,
      attackCooldown: 0.7 + Math.random() * 0.5,
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
      freezeTimer: 0,
      hitFlash: 0,
      gunfireTimer: 0,
      crosshairBloom: 0,
      lastAimAngle: 0,
      attackAnimTimer: 0,
      attackAnimDuration: 0,
      attackAnimKind: null,
      color: facColor,
      characterSkin: pickedSkin,
    };
  }

  private getEnemyHandByType(e: EnemyEntity, type: 'gun' | 'melee'): WeaponHand | -1 {
    if (e.weapons[0].type === type) return 0;
    if (e.weapons[1].type === type) return 1;
    return -1;
  }

  private getEnemyGun(e: EnemyEntity): Extract<EquippedWeapon, { type: 'gun' }> | null {
    const active = e.weapons[e.activeHand];
    if (active.type === 'gun') return active;
    const other = e.weapons[e.activeHand === 0 ? 1 : 0];
    return other.type === 'gun' ? other : null;
  }

  private getEnemyMelee(e: EnemyEntity): Extract<EquippedWeapon, { type: 'melee' }> | null {
    const active = e.weapons[e.activeHand];
    if (active.type === 'melee') return active;
    const other = e.weapons[e.activeHand === 0 ? 1 : 0];
    return other.type === 'melee' ? other : null;
  }

  private getLightestEnemyHand(e: EnemyEntity): WeaponHand {
    return e.weapons[1].def.moveSpeedMult > e.weapons[0].def.moveSpeedMult ? 1 : 0;
  }

  private switchEnemyHand(e: EnemyEntity, targetHand: WeaponHand) {
    if (e.activeHand === targetHand) return;
    const prevWeapon = e.weapons[e.activeHand];
    if (prevWeapon.type === 'gun') {
      prevWeapon.reloadTimer = 0;
    }
    e.activeHand = targetHand;
    e.crosshairBloom = 0;
    e.chargingMelee = false;
    e.chargeReady = false;
    const swapDur = getWeaponSwapDuration(e.weapons[targetHand].def.kind);
    e.swapDuration = swapDur;
    e.swapTimer = swapDur;
    e.attackCooldown = Math.max(e.attackCooldown, swapDur);
  }

  private isPickupEligibleForEnemy(e: EnemyEntity, pk: PickupItem): boolean {
    if (pk.kind === 'gun' && pk.gunDef) {
      return pk.gunDef.kind !== 'pistol' && e.weapons.some((w) => w.def.kind === 'pistol');
    }
    if (pk.kind === 'melee' && pk.meleeDef) {
      return pk.meleeDef.kind !== 'knife' && e.weapons.some((w) => w.def.kind === 'knife');
    }
    return false;
  }

  private findNearestEligibleWeaponPickup(e: EnemyEntity): PickupItem | null {
    if (!e.weapons.some((w) => w.def.kind === 'pistol' || w.def.kind === 'knife')) return null;
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
          const targetHand: WeaponHand =
            e.weapons[0].def.kind === 'pistol' ? 0 : e.weapons[1].def.kind === 'pistol' ? 1 : 0;
          this.dropWeapon(e.weapons[targetHand], pk.x, pk.y);
          e.weapons[targetHand] = equipGun(pk.gunDef, pk.ammoInMag ?? pk.gunDef.magSize);
          if (e.activeHand === targetHand) {
            e.crosshairBloom = 0;
            e.chargingMelee = false;
            e.chargeReady = false;
          }
        } else if (pk.kind === 'melee' && pk.meleeDef) {
          const targetHand: WeaponHand =
            e.weapons[1].def.kind === 'knife' ? 1 : e.weapons[0].def.kind === 'knife' ? 0 : 1;
          this.dropWeapon(e.weapons[targetHand], pk.x, pk.y);
          e.weapons[targetHand] = {
            type: 'melee',
            def: pk.meleeDef,
            durability: pk.meleeDef.kind === 'shield' ? clamp(pk.durability ?? 100, 1, 100) : 0,
          };
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

  private spawnText(x: number, y: number, text: string, color: string, scale = 1, subtle = false) {
    this.floatingTexts.push({
      x,
      y,
      vy: -38,
      text,
      color,
      life: 0.85,
      maxLife: 0.85,
      scale,
      subtle,
    });
  }

  private isBattleActive() {
    return this.status === 'PLAYING' || this.status === 'RESPAWNING';
  }

  private updateReloads(dt: number) {
    const p = this.player;
    const weapon = p.weapons[p.activeHand];
    if (weapon.type !== 'gun' || weapon.reloadTimer <= 0) return;

    const previousProgress = 1 - weapon.reloadTimer / weapon.def.reloadTime;
    weapon.reloadTimer = Math.max(0, weapon.reloadTimer - dt);
    const progress = 1 - weapon.reloadTimer / weapon.def.reloadTime;
    for (const cue of RELOAD_CUES) {
      if (previousProgress < cue.progress && progress >= cue.progress) {
        sfx.reload(weapon.def.kind, cue.phase);
      }
    }
    if (weapon.reloadTimer > 0) return;

    const needed = Math.min(weapon.def.magSize - weapon.ammoInMag, p.reserveAmmo);
    weapon.ammoInMag += needed;
    p.reserveAmmo -= needed;
    sfx.reload(weapon.def.kind, 'ready');
    this.emitHud();
  }

  private updatePlayerQi(dt: number, repSpeedMult: number) {
    const p = this.player;
    if (!this.chargeSessionAllowed) {
      p.qi = Math.min(p.maxQi, p.qi + QI_RATE.recover * repSpeedMult * dt);
      return;
    }
    if (p.chargeReady) return;

    let chargeDt = dt;
    if (!p.chargingMelee) {
      this.meleeHeldSeconds += dt;
      if (this.meleeHeldSeconds < MELEE_CHARGE_HOLD_SECONDS || p.swapTimer > 0) return;
      p.chargingMelee = true;
      chargeDt = Math.min(dt, this.meleeHeldSeconds - MELEE_CHARGE_HOLD_SECONDS);
      sfx.setMeleeCharge(0);
    }

    p.qi = Math.max(0, p.qi - QI_RATE.charge * repSpeedMult * chargeDt);
    if (p.qi === 0) {
      p.chargeReady = true;
      sfx.setMeleeCharge(null);
      sfx.meleeReady();
    } else {
      sfx.setMeleeCharge(1 - p.qi / p.maxQi);
    }
  }

  private clearTimedSkillsOnFreeze(unit: {
    royalShieldTimer: number;
    eagleEyeTimer: number;
    shadowCloneTimer: number;
    vampireTimer: number;
    shrinkTimer: number;
    giantTimer: number;
    chargingMelee: boolean;
    chargeReady: boolean;
    sizeScale: number;
    radius: number;
    baseRadius: number;
  }) {
    unit.royalShieldTimer = 0;
    unit.eagleEyeTimer = 0;
    unit.shadowCloneTimer = 0;
    unit.vampireTimer = 0;
    unit.shrinkTimer = 0;
    unit.giantTimer = 0;
    unit.chargingMelee = false;
    unit.chargeReady = false;
    unit.sizeScale = 1;
    unit.radius = unit.baseRadius;
  }

  private applyIceVentFreezeCheck(
    unit: {
      x: number;
      y: number;
      elevation: number;
      freezeTimer: number;
      royalShieldTimer: number;
      eagleEyeTimer: number;
      shadowCloneTimer: number;
      vampireTimer: number;
      shrinkTimer: number;
      giantTimer: number;
      chargingMelee: boolean;
      chargeReady: boolean;
      sizeScale: number;
      radius: number;
      baseRadius: number;
    },
    isPlayer: boolean
  ) {
    const vents = this.map.iceVents;
    if (!vents || vents.length === 0) return;
    for (const iv of vents) {
      const vx = (iv.gx + 0.5) * TILE;
      const vy = (iv.gy + 0.5) * TILE;
      const ventElev = this.map.tileGrid[iv.gy]?.[iv.gx]?.elev ?? 0;
      if (dist(unit.x, unit.y, vx, vy) <= TILE * 0.46 && Math.abs(unit.elevation - ventElev) <= 0.5) {
        const wasFrozen = unit.freezeTimer > 0;
        unit.freezeTimer = 5.0;
        this.clearTimedSkillsOnFreeze(unit);
        if (isPlayer) {
          this.cancelMeleeCharge();
          if (!wasFrozen) {
            this.spawnText(unit.x, unit.y - 38, '冰凍 5s', '#38BDF8', 1.15);
            this.emitHud();
          }
        } else if (!wasFrozen) {
          this.spawnText(unit.x, unit.y - 34, '冰凍 5s', '#38BDF8', 1.05);
        }
        return;
      }
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.gunfireTimer = Math.max(0, p.gunfireTimer - dt);
    p.swapTimer = Math.max(0, p.swapTimer - dt);
    p.attackAnimTimer = Math.max(0, p.attackAnimTimer - dt);
    if (p.attackAnimTimer === 0) p.attackAnimKind = null;
    p.freezeTimer = Math.max(0, p.freezeTimer - dt);
    p.royalShieldTimer = Math.max(0, p.royalShieldTimer - dt);
    p.eagleEyeTimer = Math.max(0, p.eagleEyeTimer - dt);
    p.shadowCloneTimer = Math.max(0, p.shadowCloneTimer - dt);
    p.vampireTimer = Math.max(0, p.vampireTimer - dt);
    p.shrinkTimer = Math.max(0, p.shrinkTimer - dt);
    p.giantTimer = Math.max(0, p.giantTimer - dt);
    p.blindTimer = Math.max(0, p.blindTimer - dt);
    if (p.blindTimer === 0) p.blindDuration = 0;
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.comboEmpowerTimer = Math.max(0, p.comboEmpowerTimer - dt);
    if (p.comboTimer > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) p.comboCount = 0;
    }

    if (p.freezeTimer > 0) {
      this.clearTimedSkillsOnFreeze(p);
      this.cancelMeleeCharge();
    }

    p.sizeScale = p.shrinkTimer > 0 ? 0.62 : p.giantTimer > 0 ? 1.32 : 1.0;
    p.radius = p.baseRadius * p.sizeScale;

    // 視窗縮放：固定維持上下約 15 格、左右約 19 格（鷹眼不縮小視野，改以鏡頭隨游標前移偵察）
    const baseZoom = (this.viewport.width / (19 * TILE) + this.viewport.height / (15 * TILE)) / 2;
    const targetZoom = baseZoom;
    this.camera.zoom += (targetZoom - this.camera.zoom) * Math.min(1, dt * 6);

    // 聲望越高，集氣與回氣速度越快（依當前出戰陣營之獨立聲望計算；冰凍期間無法集氣）
    const activeRep = p.reputations[p.faction];
    p.reputation = activeRep;
    const repSpeedMult = getReputationQiMultiplier(activeRep);
    if (p.freezeTimer > 0) {
      this.cancelMeleeCharge();
    } else {
      this.updatePlayerQi(dt, repSpeedMult);
    }

    const weapon = p.weapons[p.activeHand];
    this.crosshairBloom = Math.max(0, this.crosshairBloom - GUN_AIM.bloomRecovery * dt);
    this.rifleRecoilAngle *= Math.exp(-RIFLE_RECOIL.recovery * dt);

    this.updateReloads(dt);

    const mv = this.getMoveVector();
    if (Math.hypot(mv.x, mv.y) > 0.1) {
      this.framePushInputs.push({
        id: 'player',
        isPlayer: true,
        faction: p.faction,
        x: p.x,
        y: p.y,
        radius: p.radius,
        elevation: p.elevation,
        dirX: mv.x,
        dirY: mv.y,
      });
    }
    const weaponSpeedMult = weapon.def.moveSpeedMult;
    const freezeSpeedMult = p.freezeTimer > 0 ? 0.9 : 1.0;
    const baseSpeed = PLAYER_MOVEMENT.speed * weaponSpeedMult * freezeSpeedMult;
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

    this.applyIceVentFreezeCheck(p, true);

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

    if (this.mouseDown && weapon.type === 'gun' && weapon.def.kind === 'rifle' && weapon.ammoInMag > 0) {
      this.tryAttack();
    }
  }

  public update(dt: number, canvasWidth: number, canvasHeight: number) {
    this.viewport.width = canvasWidth;
    this.viewport.height = canvasHeight;
    if (!this.isBattleActive()) return;

    const respawningAtFrameStart = this.status === 'RESPAWNING';
    this.time += dt;
    if (this.skillTraces.length > 0) {
      this.skillTraces = this.skillTraces.filter((trace) => this.time - trace.startedAt < trace.duration);
    }
    this.framePushInputs = [];
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
    if (this.player.hp > 0) this.updateActorSkillVisuals(this.player, dt);
    for (const enemy of this.enemies) this.updateActorSkillVisuals(enemy, dt);
    if (!this.isBattleActive()) return;
    this.updatePushableIceBlocks(dt);
    if (!this.isBattleActive()) return;
    this.updateProjectiles(dt);
    if (!this.isBattleActive()) return;
    this.checkVictoryCondition();

    this.beams = this.beams.filter((b) => {
      b.life -= dt;
      return b.life > 0;
    });
    const iceVents = this.map.iceVents;
    if (iceVents && iceVents.length > 0) {
      for (const iv of iceVents) {
        if (Math.random() < dt * 7.5 && this.particles.length < 220) {
          const vx = (iv.gx + 0.5) * TILE + (Math.random() - 0.5) * 14;
          const vy = (iv.gy + 0.5) * TILE + (Math.random() - 0.5) * 10;
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
          const spd = 22 + Math.random() * 34;
          this.particles.push({
            x: vx,
            y: vy,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 2.2 + Math.random() * 2.8,
            color: Math.random() < 0.5 ? '#E0F2FE' : '#7DD3FC',
            life: 0.45 + Math.random() * 0.35,
            maxLife: 0.8,
          });
        }
      }
    }
    const campfires = this.map.campfires;
    if (campfires && campfires.length > 0) {
      for (const cf of campfires) {
        if (Math.random() < dt * 6.5 && this.particles.length < 220) {
          const fx = (cf.gx + 0.5) * TILE + (Math.random() - 0.5) * 10;
          const fy = (cf.gy + 0.5) * TILE + (Math.random() - 0.5) * 8;
          this.particles.push({
            x: fx,
            y: fy,
            vx: (Math.random() - 0.5) * 16,
            vy: -(24 + Math.random() * 28),
            size: 1.8 + Math.random() * 2.2,
            color: Math.random() < 0.5 ? '#FBBF24' : '#F97316',
            life: 0.4 + Math.random() * 0.3,
            maxLife: 0.7,
          });
        }
      }
    }
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
    const gx = clamp(Math.floor(x / TILE), 0, this.map.cols - 1);
    const gy = clamp(Math.floor(y / TILE), 0, this.map.rows - 1);
    const tile = this.map.tileGrid[gy]?.[gx];
    const floor = this.map.floorGrid?.[gy]?.[gx];
    if (
      tile?.style === 'wooden_plank' ||
      tile?.style === 'shrine_floor' ||
      this.map.bridges.some((bridge) => pointInRect(x, y, bridge))
    ) {
      return 'wood';
    }
    if (this.map.floatingIceTileKeys?.has(`${gx},${gy}`) || this.map.floatingIceTiles?.some((f) => f.gx === gx && f.gy === gy)) {
      return 'hard';
    }
    if (tile?.style === 'hill') return 'soft';
    if (tile?.elev === 0) {
      if (
        floor === 'grass_ground' ||
        floor === 'bamboo_moss' ||
        floor === 'shrine_dirt' ||
        floor === 'desert_sand' ||
        tile.style === 'grass_ground'
      ) {
        return 'soft';
      }
      if (floor === 'castle_stone' || floor === 'warehouse_steel' || floor === 'glacier_ice') return 'hard';
    }
    if (tile?.style === 'glacier_ice') return 'hard';
    if (tile?.style && tile.style !== 'default') return 'hard';
    return this.map.biome.endsWith('_outdoor') ? 'soft' : 'hard';
  }

  private canSlidePushableIceBlock(blk: PushableIceBlock, dir: CardinalDir): boolean {
    const delta: Record<CardinalDir, [number, number]> = {
      north: [0, -1],
      south: [0, 1],
      east: [1, 0],
      west: [-1, 0],
    };
    const [dx, dy] = delta[dir];
    const nextX = blk.x + dx * TILE;
    const nextY = blk.y + dy * TILE;
    const nextGx = Math.round(nextX / TILE);
    const nextGy = Math.round(nextY / TILE);
    if (nextGx < 0 || nextGy < 0 || nextGx + 2 > this.map.cols || nextGy + 2 > this.map.rows) {
      return false;
    }

    const nextRect = { x: nextX + 2, y: nextY + 2, w: blk.w - 4, h: blk.h - 4 };
    for (let gy = nextGy; gy < nextGy + 2; gy++) {
      for (let gx = nextGx; gx < nextGx + 2; gx++) {
        const cell = this.map.tileGrid[gy]?.[gx];
        if (!cell || Math.abs(cell.elev - blk.baseElev) > 0.01) {
          return false; // 不可推上高台、階梯差層或深坑
        }
        const cx = (gx + 0.5) * TILE;
        const cy = (gy + 0.5) * TILE;
        if (!this.isGroundWalkable(cx, cy)) return false;
        for (const st of this.map.stairs) {
          if (pointInRect(cx, cy, st)) return false;
        }
      }
    }

    const rectsOverlapLoose = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    for (const obs of this.map.obstacles) {
      if (rectsOverlapLoose(nextRect, obs)) return false;
    }
    for (const tree of this.map.trees) {
      if (rectsOverlapLoose(nextRect, tree)) return false;
    }
    for (const other of this.map.pushableIceBlocks || []) {
      if (other.id === blk.id) continue;
      if (rectsOverlapLoose(nextRect, other)) return false;
    }
    return true;
  }

  private crushUnitByIceBlock(
    target: { isPlayer: boolean; enemy?: EnemyEntity },
    pusherId: string | null,
    pusherFaction: FactionId | null
  ) {
    const p = this.player;
    if (target.isPlayer) {
      if (p.hp <= 0) return;
      const fatalDmg = Math.max(1, Math.ceil(p.hp));
      this.spawnBurst(p.x, p.y, '#7DD3FC', 18);
      this.spawnText(p.x, p.y - 34, `-${fatalDmg}`, '#EF4444', 1.25);
      p.hp = 0;
      this.camera.shake = Math.min(14, this.camera.shake + 8);
      this.handlePlayerDeath();
      return;
    }
    const enemy = target.enemy;
    if (!enemy || enemy.hp <= 0) return;
    const fatalDmg = Math.max(1, Math.ceil(enemy.hp));
    this.spawnBurst(enemy.x, enemy.y, '#7DD3FC', 18);
    this.spawnText(enemy.x, enemy.y - 28, `-${fatalDmg}`, '#EF4444', 1.25);
    enemy.hp = 0;
    enemy.hitFlash = 0.16;

    const pushedByPlayer = pusherId === 'player';
    if (pushedByPlayer && pusherFaction) {
      if (!areHostile(pusherFaction, 'player', enemy.faction, enemy.id)) {
        p.reputations[p.faction] -= 1;
        p.reputation = p.reputations[p.faction];
        this.onReputationChange?.({ ...p.reputations });
        this.removeEnemy(enemy, false);
      } else {
        p.totalDamage += fatalDmg;
        p.score += fatalDmg;
        sfx.hit(true);
        this.removeEnemy(enemy, true);
      }
    } else {
      this.removeEnemy(enemy, false);
    }
  }

  private updatePushableIceBlocks(dt: number) {
    const blocks = this.map.pushableIceBlocks;
    if (!blocks || blocks.length === 0) return;

    const dirDelta: Record<CardinalDir, [number, number]> = {
      north: [0, -1],
      south: [0, 1],
      east: [1, 0],
      west: [-1, 0],
    };
    const PUSH_HOLD_THRESHOLD = 0.28;
    let navDirty = false;

    for (const blk of blocks) {
      if (blk.slideTimer > 0 && blk.slideDir) {
        blk.slideTimer = Math.max(0, blk.slideTimer - dt);
        const progress = 1 - blk.slideTimer / Math.max(0.01, blk.slideDuration);
        blk.x = blk.slideStartX + (blk.slideEndX - blk.slideStartX) * progress;
        blk.y = blk.slideStartY + (blk.slideEndY - blk.slideStartY) * progress;

        const [dx, dy] = dirDelta[blk.slideDir];
        const shoveUnit = (
          u: { x: number; y: number; radius: number; elevation: number },
          applyPos: (nx: number, ny: number, ne: number) => void,
          crushTarget: { isPlayer: boolean; enemy?: EnemyEntity }
        ) => {
          if (Math.abs(u.elevation - blk.baseElev) > 0.5) return;
          const padR = getMoveCheckRadius(u.radius);
          if (!resolveCircleRect(u.x, u.y, padR, blk).hit) return;

          // 計算不被冰塊重合的前緣安全位置，並檢查前方是否有牆壁／懸崖／障礙物阻擋
          let desiredOffset = 0;
          if (blk.slideDir === 'east') {
            desiredOffset = Math.max(0, blk.x + blk.w + padR + 1.5 - u.x);
          } else if (blk.slideDir === 'west') {
            desiredOffset = Math.max(0, u.x - (blk.x - padR - 1.5));
          } else if (blk.slideDir === 'south') {
            desiredOffset = Math.max(0, blk.y + blk.h + padR + 1.5 - u.y);
          } else if (blk.slideDir === 'north') {
            desiredOffset = Math.max(0, u.y - (blk.y - padR - 1.5));
          }

          const targetX = u.x + dx * desiredOffset;
          const targetY = u.y + dy * desiredOffset;
          if (this.canStandWithPadding(targetX, targetY, u.elevation, u.radius)) {
            applyPos(targetX, targetY, this.getWalkableElevation(targetX, targetY));
            return;
          }

          // 若目標點受牆壁或高地阻擋，僅盡可能貼近障礙物前緣
          let bestX = u.x;
          let bestY = u.y;
          const maxSteps = Math.max(1, Math.ceil(desiredOffset / 2));
          for (let s = 1; s <= maxSteps; s++) {
            const frac = s / maxSteps;
            const cx = u.x + dx * desiredOffset * frac;
            const cy = u.y + dy * desiredOffset * frac;
            let hitsTerrainCliff = !pointInRect(cx, cy, blk) && Math.abs(this.getWalkableElevation(cx, cy) - u.elevation) > 0.5;
            if (!hitsTerrainCliff) {
              for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const sx = cx + Math.cos(a) * padR;
                const sy = cy + Math.sin(a) * padR;
                if (!pointInRect(sx, sy, blk) && Math.abs(this.getWalkableElevation(sx, sy) - u.elevation) > 0.5) {
                  hitsTerrainCliff = true;
                  break;
                }
              }
            }
            // 僅檢查非本冰塊之地形／實牆阻擋，模擬抵牆位置
            const hitOtherWall =
              cx < padR ||
              cx > this.map.width - padR ||
              cy < padR ||
              cy > this.map.height - padR ||
              !this.isGroundWalkable(cx, cy) ||
              hitsTerrainCliff ||
              this.map.obstacles.some((obs) => (obs.kind === 'wall' || obs.style === 'railing') && resolveCircleRect(cx, cy, padR, obs).hit) ||
              this.map.trees.some((t) => resolveCircleRect(cx, cy, padR, t).hit) ||
              (this.map.pushableIceBlocks || []).some((ob) => ob.id !== blk.id && resolveCircleRect(cx, cy, padR, ob).hit);
            if (hitOtherWall) break;
            bestX = cx;
            bestY = cy;
          }
          applyPos(bestX, bestY, u.elevation);

          const crushRadius = blk.slideTimer === 0 ? Math.max(4, padR - 2) : Math.max(4, padR - 6);
          if (resolveCircleRect(bestX, bestY, crushRadius, blk).hit) {
            this.crushUnitByIceBlock(crushTarget, blk.pusherId, blk.pusherFaction);
          }
        };

        if (this.status === 'PLAYING' && this.player.hp > 0) {
          const p = this.player;
          shoveUnit(
            p,
            (nx, ny, ne) => {
              p.x = nx;
              p.y = ny;
              p.elevation = ne;
            },
            { isPlayer: true }
          );
        }

        for (const e of [...this.enemies]) {
          if (e.hp <= 0) continue;
          shoveUnit(
            e,
            (nx, ny, ne) => {
              e.x = nx;
              e.y = ny;
              e.elevation = ne;
            },
            { isPlayer: false, enemy: e }
          );
        }

        if (blk.slideTimer === 0) {
          blk.x = blk.slideEndX;
          blk.y = blk.slideEndY;
          blk.slideDir = null;
          blk.pusherId = null;
          blk.pusherFaction = null;
          navDirty = true;
        }
        continue;
      }

      // 靜止狀態：偵測貼齊冰塊某一側持續推動之角色
      let detectedDir: CardinalDir | null = null;
      let detectedPusher: { id: string; faction: FactionId } | null = null;

      for (const u of this.framePushInputs) {
        if (Math.abs(u.elevation - blk.baseElev) > 0.5) continue;
        const contactPad = u.radius + 10;
        let candDir: CardinalDir | null = null;

        if (
          u.dirX > 0.35 &&
          Math.abs(u.dirX) >= Math.abs(u.dirY) * 0.7 &&
          u.x < blk.x &&
          blk.x - u.x <= contactPad &&
          u.y >= blk.y + 4 &&
          u.y <= blk.y + blk.h - 4
        ) {
          candDir = 'east';
        } else if (
          u.dirX < -0.35 &&
          Math.abs(u.dirX) >= Math.abs(u.dirY) * 0.7 &&
          u.x > blk.x + blk.w &&
          u.x - (blk.x + blk.w) <= contactPad &&
          u.y >= blk.y + 4 &&
          u.y <= blk.y + blk.h - 4
        ) {
          candDir = 'west';
        } else if (
          u.dirY > 0.35 &&
          Math.abs(u.dirY) >= Math.abs(u.dirX) * 0.7 &&
          u.y < blk.y &&
          blk.y - u.y <= contactPad &&
          u.x >= blk.x + 4 &&
          u.x <= blk.x + blk.w - 4
        ) {
          candDir = 'south';
        } else if (
          u.dirY < -0.35 &&
          Math.abs(u.dirY) >= Math.abs(u.dirX) * 0.7 &&
          u.y > blk.y + blk.h &&
          u.y - (blk.y + blk.h) <= contactPad &&
          u.x >= blk.x + 4 &&
          u.x <= blk.x + blk.w - 4
        ) {
          candDir = 'north';
        }

        if (candDir && this.canSlidePushableIceBlock(blk, candDir)) {
          detectedDir = candDir;
          detectedPusher = { id: u.id, faction: u.faction };
          break;
        }
      }

      if (detectedDir && detectedPusher) {
        if (blk.pushDir === detectedDir) {
          blk.pushTimer += dt;
        } else {
          blk.pushDir = detectedDir;
          blk.pushTimer = dt;
        }
        blk.pusherId = detectedPusher.id;
        blk.pusherFaction = detectedPusher.faction;

        if (blk.pushTimer >= PUSH_HOLD_THRESHOLD) {
          const [dx, dy] = dirDelta[detectedDir];
          blk.pushTimer = 0;
          blk.pushDir = null;
          blk.slideDir = detectedDir;
          blk.slideDuration = 0.16;
          blk.slideTimer = 0.16;
          blk.slideStartX = blk.x;
          blk.slideStartY = blk.y;
          blk.slideEndX = blk.x + dx * TILE;
          blk.slideEndY = blk.y + dy * TILE;
          this.spawnBurst(blk.x + blk.w * 0.5, blk.y + blk.h * 0.5, '#BAE6FD', 8);
        }
      } else {
        blk.pushTimer = Math.max(0, blk.pushTimer - dt * 3);
        if (blk.pushTimer === 0) blk.pushDir = null;
      }
    }

    if (navDirty) {
      this.buildNavigationGraph();
    }
  }

  /**
   * 電腦士兵直線槍線射擊（套用與玩家相同之動態準心擴散、距離曲線與牆縫阻擋）
   */
  private getHitscanContact(
    seg: { x1: number; y1: number; x2: number; y2: number },
    target: PlayerState | EnemyEntity
  ) {
    if (target.royalShieldTimer <= 0) {
      return segmentCircleHit(seg.x1, seg.y1, seg.x2, seg.y2, target.x, target.y, target.radius);
    }

    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const startX = seg.x1 - target.x;
    const startY = seg.y1 - target.y;
    const radius = target.radius + ROYAL_SHIELD_PADDING;
    const lengthSquared = dx * dx + dy * dy;
    const startOffset = startX * startX + startY * startY - radius * radius;
    const projection = startX * dx + startY * dy;
    const discriminant = projection * projection - lengthSquared * startOffset;
    const t = startOffset <= 0
      ? 0
      : lengthSquared > 0 && discriminant >= 0
        ? (-projection - Math.sqrt(discriminant)) / lengthSquared
        : -1;
    return { hit: t >= 0 && t <= 1, t, hitX: seg.x1 + dx * t, hitY: seg.y1 + dy * t, perpDist: 0 };
  }

  private markShieldImpact(target: PlayerState | EnemyEntity, originX?: number, originY?: number) {
    const angle = originX === undefined || originY === undefined
      ? target.angle
      : Math.atan2(originY - target.y, originX - target.x);
    target.royalShieldImpact = { angle, time: this.time };
    return angle;
  }

  private deflectShieldShot(target: PlayerState | EnemyEntity, x: number, y: number, incoming: number) {
    const normal = this.markShieldImpact(target, x, y);
    const outgoing = 2 * normal - incoming + Math.PI;
    this.beams.push({
      x1: x,
      y1: y,
      x2: x + Math.cos(outgoing) * 34,
      y2: y + Math.sin(outgoing) * 34,
      color: '#BAF2FF',
      life: 0.15,
      maxLife: 0.15,
      width: 2.4,
    });
    this.spawnBurst(x, y, '#BAF2FF', 3);
  }

  private fireEnemyGunHitscan(
    e: EnemyEntity,
    aimAngle: number,
    gunWeapon: Extract<EquippedWeapon, { type: 'gun' }>,
    targetDist = 200
  ) {
    const gunDef = gunWeapon.def;
    e.gunfireTimer = GUNFIRE_ANIMATION_SECONDS;
    sfx.gunshot(gunDef.kind, this.nearbySoundVolume(e.x, e.y) * 0.45);
    if (e.royalShieldTimer > 0) {
      e.royalShieldTimer = 0; // 自己用遠程攻擊也會破盾！
      this.spawnText(e.x, e.y - 26, '遠程開火破盾', '#38BDF8', 0.9);
    }

    const muzzleDist = e.radius + 4;
    const pellets = gunDef.kind === 'shotgun' ? gunDef.pellets : 1;
    const difficultySpreadMult =
      AI_DIFFICULTY[this.difficulty].aimSpreadMultiplier / AI_DIFFICULTY.standard.aimSpreadMultiplier;
    const focus = (e.eagleEyeTimer > 0 ? 0.45 : 1) * AI_GUN_AIM.spreadMult * difficultySpreadMult;
    const clampedBloom = clamp(e.crosshairBloom, 0, gunDef.maxCrosshair - gunDef.baseCrosshair);
    const spreadRad = getGunSpread(gunDef.kind, gunDef.baseCrosshair + clampedBloom, targetDist, focus);
    const maxRange = Math.hypot(this.map.width, this.map.height) + TILE * 2;
    const p = this.player;

    for (let i = 0; i < pellets; i++) {
      const a = aimAngle + (Math.random() - 0.5) * spreadRad;
      const muzzleX = e.x + Math.cos(a) * muzzleDist;
      const muzzleY = e.y + Math.sin(a) * muzzleDist;
      const preSeg = this.traceBulletSegment(e.x, e.y, a, muzzleDist, e.elevation, false);
      const reachedMuzzle = dist(e.x, e.y, preSeg.x2, preSeg.y2) >= muzzleDist - 0.5;
      const seg = reachedMuzzle
        ? this.traceBulletSegment(muzzleX, muzzleY, a, maxRange, e.elevation, false)
        : preSeg;
      const wallEnd = reachedMuzzle
        ? this.findWallOrPinchEndpoint(muzzleX, muzzleY, a, maxRange)
        : { x2: preSeg.x2, y2: preSeg.y2, hitWall: true };

      let segEndX = seg.x2;
      let segEndY = seg.y2;

      type Candidate =
        | { kind: 'player'; t: number; perpDist: number; hitX: number; hitY: number }
        | { kind: 'enemy'; enemy: EnemyEntity; t: number; perpDist: number; hitX: number; hitY: number };

      const candidates: Candidate[] = [];

      if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player') && p.elevation - e.elevation < 2.0) {
        const res = this.getHitscanContact({ x1: seg.x1, y1: seg.y1, x2: wallEnd.x2, y2: wallEnd.y2 }, p);
        if (
          res.hit &&
          !this.findEarliestWallHit(res.hitX, res.hitY, p.x, p.y) &&
          this.canBulletReachPoint(seg.x1, seg.y1, e.elevation, res.hitX, res.hitY, p.elevation)
        ) {
          candidates.push({ kind: 'player', ...res });
        }
      }

      for (const other of this.enemies) {
        if (other.id === e.id) continue;
        if (!areHostile(e.faction, e.id, other.faction, other.id)) continue;
        if (other.elevation - e.elevation >= 2.0) continue;
        const res = this.getHitscanContact({ x1: seg.x1, y1: seg.y1, x2: wallEnd.x2, y2: wallEnd.y2 }, other);
        if (
          res.hit &&
          !this.findEarliestWallHit(res.hitX, res.hitY, other.x, other.y) &&
          this.canBulletReachPoint(seg.x1, seg.y1, e.elevation, res.hitX, res.hitY, other.elevation)
        ) {
          candidates.push({ kind: 'enemy', enemy: other, ...res });
        }
      }

      candidates.sort((c1, c2) => c1.t - c2.t);
      if (candidates.length > 0) {
        const firstHit = candidates[0];
        segEndX = firstHit.hitX;
        segEndY = firstHit.hitY;

        const targetRadius = firstHit.kind === 'player' ? p.radius : firstHit.enemy.radius;
        const centerAccuracy = clamp(1 - firstHit.perpDist / targetRadius, 0, 1);
        const scaledDmg = Math.max(3, Math.round(gunDef.damage * (0.4 + 0.6 * centerAccuracy)));

        const target = firstHit.kind === 'player' ? p : firstHit.enemy;
        if (target.royalShieldTimer > 0) {
          this.deflectShieldShot(target, firstHit.hitX, firstHit.hitY, a);
        } else if (firstHit.kind === 'player') {
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
      } else if (reachedMuzzle && dist(muzzleX, muzzleY, seg.x2, seg.y2) < maxRange - 1) {
        this.spawnBurst(seg.x2, seg.y2, '#E2E8F0', 4);
      }

      this.beams.push({
        x1: seg.x1,
        y1: seg.y1,
        x2: segEndX,
        y2: segEndY,
        color: e.color,
        life: gunDef.kind === 'sniper' ? 0.14 : 0.085,
        maxLife: gunDef.kind === 'sniper' ? 0.14 : 0.085,
        width: gunDef.kind === 'sniper' ? 2.6 : 1.9,
      });
    }

    e.crosshairBloom = Math.min(gunDef.maxCrosshair - gunDef.baseCrosshair, clampedBloom + gunDef.bloomPerShot);
  }

  /**
   * 電腦士兵施放陣營 × 近戰武器技能（持續時間、傷害與集氣規則與玩家對齊）
   */
  private executeEnemyFactionSkill(
    e: EnemyEntity,
    meleeWeapon: Extract<EquippedWeapon, { type: 'melee' }>,
    aimAngle: number
  ) {
    const fac = e.faction;
    const mk = meleeWeapon.def.kind;
    const skillName = FACTIONS[fac].meleeSkills[mk].name;
    this.spawnText(e.x, e.y - 34, skillName, e.color, 1.05);

    if (mk === 'shield') {
      meleeWeapon.durability = 100;
      this.spawnBurst(e.x, e.y, '#38BDF8', 16);
      this.slashes.push({
        x: e.x,
        y: e.y,
        angle: aimAngle,
        arc: Math.PI * 1.4,
        reach: 120,
        color: '#38BDF8',
        life: 0.26,
        maxLife: 0.26,
        isUltimate: true,
        style: 'sweep',
      });
      const p = this.player;
      if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player') && Math.abs(e.elevation - p.elevation) <= 1.0 && dist(e.x, e.y, p.x, p.y) <= 125 + p.radius) {
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        const pushed = this.moveCharacterWithElevation(p.x, p.y, p.elevation, Math.cos(ang) * 44, Math.sin(ang) * 44, p.radius);
        p.x = pushed.x;
        p.y = pushed.y;
        p.elevation = pushed.elevation;
        this.damagePlayer(0, true, e.id, e.x, e.y);
      }
      for (const other of [...this.enemies]) {
        if (other.id === e.id) continue;
        if (!areHostile(e.faction, e.id, other.faction, other.id)) continue;
        if (Math.abs(e.elevation - other.elevation) > 1.0) continue;
        if (dist(e.x, e.y, other.x, other.y) <= 125 + other.radius) {
          const ang = Math.atan2(other.y - e.y, other.x - e.x);
          this.damageEnemy(other, 0, true, Math.cos(ang) * 1050, Math.sin(ang) * 1050, false, true, e.id, e.faction, e.x, e.y);
          other.stunTimer = Math.max(other.stunTimer, 0.45);
        }
      }
      return;
    }

    if (fac === 'royal') {
      if (mk === 'knife') {
        e.royalShieldTimer = 6.5;
        e.royalShieldImpact = undefined;
      } else if (mk === 'claw') {
        // 瞬移靠近敵人並閃光致盲（對敵對 AI 與敵對玩家皆會生效）
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
            e.radius + t.r + 6,
            e.radius,
            e.x,
            e.y
          );
          this.addSkillTrace('blink', e, safeSpot, 0.58);
          e.x = safeSpot.x;
          e.y = safeSpot.y;
          e.elevation = this.getWalkableElevation(e.x, e.y);
        }
        this.slashes.push({
          x: e.x,
          y: e.y,
          angle: 0,
          arc: Math.PI * 2,
          reach: 220,
          color: '#FFFFFF',
          life: 0.25,
          maxLife: 0.25,
          isUltimate: true,
          style: 'sweep',
        });
        if (p.hp > 0 && areHostile(e.faction, e.id, p.faction, 'player')) {
          const dp = dist(e.x, e.y, p.x, p.y);
          if (dp <= 260) {
            const blindSec = clamp(1.0 - (dp / 260) * 0.5, 0.5, 1.0);
            p.blindDuration = blindSec;
            p.blindTimer = Math.max(p.blindTimer, blindSec);
            this.spawnText(p.x, p.y - 34, `致盲 ${blindSec.toFixed(1)}s`, '#FEF08A', 1.05);
          }
        }
        for (const other of this.enemies) {
          if (!areHostile(e.faction, e.id, other.faction, other.id)) continue;
          const d = dist(e.x, e.y, other.x, other.y);
          if (d <= 260) {
            const blindSec = clamp(1.0 - (d / 260) * 0.5, 0.5, 1.0);
            other.blindTimer = Math.max(other.blindTimer, blindSec);
          }
        }
      } else {
        // 皇家大刀 5 發黃色光彈（會傷友軍，數值與玩家一致）
        for (const off of [-0.34, -0.17, 0, 0.17, 0.34]) {
          const a = aimAngle + off;
          this.projectiles.push({
            id: uid('elorb'),
            x: e.x + Math.cos(a) * 26,
            y: e.y + Math.sin(a) * 26,
            prevX: e.x,
            prevY: e.y,
            vx: Math.cos(a) * 560,
            vy: Math.sin(a) * 560,
            radius: 13,
            damage: 30,
            startElevation: e.elevation,
            minTraversedElevation: e.elevation,
            ownerId: e.id,
            ownerFaction: e.faction,
            fromPlayer: false,
            isAlly: e.isAlly,
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
      return;
    }

    if (fac === 'shadow') {
      if (mk === 'knife') {
        e.eagleEyeTimer = EAGLE_EYE_DURATION;
      } else if (mk === 'claw') {
        e.shadowCloneTimer = 6.5;
      } else {
        const dir = snapToEightDirections(aimAngle);
        const startX = e.x + dir.dx * 28;
        const startY = e.y + dir.dy * 28;
        this.projectiles.push({
          id: uid('edragon'),
          x: startX,
          y: startY,
          prevX: e.x,
          prevY: e.y,
          vx: dir.dx * 340,
          vy: dir.dy * 340,
          radius: 22,
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
      return;
    }

    if (mk === 'knife') {
      e.vampireTimer = 7.5;
    } else if (mk === 'claw') {
      e.giantTimer = 0;
      e.shrinkTimer = 7.5;
    } else {
      e.shrinkTimer = 0;
      e.giantTimer = 7.5;
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
    const aiRepMult = getReputationQiMultiplier(AI_FIXED_REPUTATION);
    const difficulty = AI_DIFFICULTY[this.difficulty];
    for (const e of [...this.enemies]) {
      if (!this.isBattleActive()) return;
      if (e.hp <= 0) continue;
      const combat = AI_COMBAT[e.archetype];
      e.gunfireTimer = Math.max(0, e.gunfireTimer - dt);
      e.crosshairBloom = Math.max(0, e.crosshairBloom - GUN_AIM.bloomRecovery * dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.swapTimer = Math.max(0, e.swapTimer - dt);
      e.attackAnimTimer = Math.max(0, e.attackAnimTimer - dt);
      if (e.attackAnimTimer === 0) e.attackAnimKind = null;
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.freezeTimer = Math.max(0, e.freezeTimer - dt);
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

      if (e.freezeTimer > 0) {
        this.clearTimedSkillsOnFreeze(e);
      }

      // 電腦與玩家共用彈匣裝填計時（僅在當前持握槍械手位上進行，惟電腦備用彈藥無限）
      const activeReloadWeapon = e.weapons[e.activeHand];
      if (activeReloadWeapon.type === 'gun' && activeReloadWeapon.reloadTimer > 0) {
        activeReloadWeapon.reloadTimer = Math.max(0, activeReloadWeapon.reloadTimer - dt);
        if (activeReloadWeapon.reloadTimer === 0) {
          activeReloadWeapon.ammoInMag = activeReloadWeapon.def.magSize;
        }
      }

      e.sizeScale = e.shrinkTimer > 0 ? 0.62 : e.giantTimer > 0 ? 1.32 : 1.0;
      e.radius = e.baseRadius * e.sizeScale;

      if (e.stunTimer > 0) {
        this.applyIceVentFreezeCheck(e, false);
        e.stunTimer = Math.max(0, e.stunTimer - dt);
        e.visibleTargetId = null;
        e.chargingMelee = false;
        e.chargeReady = false;
        if (e.freezeTimer <= 0) {
          e.qi = Math.min(e.maxQi, e.qi + QI_RATE.recover * aiRepMult * dt);
        }
        e.lastAimAngle = e.angle;
        continue;
      }

      if (e.blindTimer > 0) {
        this.applyIceVentFreezeCheck(e, false);
        e.blindTimer = Math.max(0, e.blindTimer - dt);
        e.angle += dt * 7;
        e.lastAimAngle = e.angle;
        e.hasLosToTarget = false;
        e.visibleTargetId = null;
        e.chargingMelee = false;
        e.chargeReady = false;
        if (e.freezeTimer <= 0) {
          e.qi = Math.min(e.maxQi, e.qi + QI_RATE.recover * aiRepMult * dt);
        }
        continue;
      }

      const heldGun = this.getEnemyGun(e);
      const heldMelee = this.getEnemyMelee(e);

      // 敵人基礎視野半徑調整為 8 格（鷹眼／狙擊手半徑 9.5 格）
      const sightRange = (e.eagleEyeTimer > 0 || heldGun?.def.kind === 'sniper' ? 9.5 : 8.0) * TILE;

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

      const prevHasLos = e.hasLosToTarget;
      e.hasLosToTarget = Boolean(losTargetPos);
      if (!prevHasLos && e.hasLosToTarget) {
        this.spawnText(e.x, e.y - e.radius - 24, '!', '#FACC15', 1.25);
      }
      const visibleTargetId = chosenVisible?.id ?? null;
      if (e.visibleTargetId !== visibleTargetId) {
        e.visibleTargetId = visibleTargetId;
        e.reactionTimer = visibleTargetId
          ? Math.max(e.reactionTimer, combat.reactionSeconds * difficulty.reactionMultiplier)
          : Math.max(0, e.reactionTimer - dt);
        e.chargingMelee = false;
        e.chargeReady = false;
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

      // 雙手武器切換邏輯（完全沿用 swapTimer 搓手切換時間）：
      // - 持盾敵人於裝彈或中近距受傷推進時，主動切出盾牌進行正面防禦
      // - 貼身近戰距離且高度可及 -> 切近戰手位
      // - 有一定距離且槍彈可射中目標 -> 切遠程槍械手位
      // - 其餘狀態／高低差受阻／趕路追擊 -> 切換最輕武器手位加速移動
      const gunHand = this.getEnemyHandByType(e, 'gun');
      const meleeHand = this.getEnemyHandByType(e, 'melee');
      const shieldHand: WeaponHand | -1 =
        e.weapons[0].type === 'melee' && e.weapons[0].def.kind === 'shield' && e.weapons[0].durability > 0
          ? 0
          : e.weapons[1].type === 'melee' && e.weapons[1].def.kind === 'shield' && e.weapons[1].durability > 0
            ? 1
            : -1;
      const curActiveWeapon = e.weapons[e.activeHand];
      const activeGunReloading = curActiveWeapon.type === 'gun' && curActiveWeapon.reloadTimer > 0;

      let desiredHand: WeaponHand;
      if (shieldHand !== -1 && Boolean(losTargetPos) && bestLosDist <= 155 && e.hp < 55) {
        desiredHand = shieldHand;
      } else if (isCloseMeleeRange && meleeHand !== -1) {
        desiredHand = meleeHand;
      } else if (losTargetPos && canHitRanged && gunHand !== -1) {
        desiredHand = gunHand;
      } else if (activeGunReloading) {
        desiredHand = e.activeHand;
      } else {
        desiredHand = this.getLightestEnemyHand(e);
      }
      this.switchEnemyHand(e, desiredHand);

      // 與玩家對齊之氣條集氣／回氣規則（電腦固定以 100 聲望之 1.5x 倍率運作，冰凍期間不能集氣）
      const activeWeapon = e.weapons[e.activeHand];
      if (e.freezeTimer > 0) {
        e.chargingMelee = false;
        e.chargeReady = false;
      } else if (activeWeapon.type !== 'melee') {
        e.chargingMelee = false;
        e.chargeReady = false;
        e.qi = Math.min(e.maxQi, e.qi + QI_RATE.recover * aiRepMult * dt);
      } else if (e.chargingMelee) {
        e.qi = Math.max(0, e.qi - QI_RATE.charge * aiRepMult * dt);
        if (e.qi === 0 && e.swapTimer <= 0) {
          e.chargeReady = true;
          const castAng = losTargetPos
            ? Math.atan2(losTargetPos.y - e.y, losTargetPos.x - e.x)
            : e.angle;
          this.executeEnemyFactionSkill(e, activeWeapon, castAng);
          e.chargingMelee = false;
          e.chargeReady = false;
          e.attackCooldown = Math.max(e.attackCooldown, 0.25);
        }
      } else {
        e.qi = Math.min(e.maxQi, e.qi + QI_RATE.recover * aiRepMult * dt);
        const needEmergencyShieldRepair =
          !losTargetPos && activeWeapon.def.kind === 'shield' && activeWeapon.durability <= 45;
        if (e.swapTimer <= 0 && e.qi >= e.maxQi - 0.5 && (readyToAttack || needEmergencyShieldRepair)) {
          e.chargingMelee = true;
          e.chargeReady = false;
        }
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
        const rawTargetAngle = Math.atan2(losTargetPos.y - e.y, losTargetPos.x - e.x);
        // 模擬玩家手持滑鼠手部微幅追蹤偏擺與有限轉向角速度
        const idSeed = (e.id.charCodeAt(e.id.length - 1) || 1) * 1.37;
        const wobble =
          Math.sin(e.aiTimer * 2.9 + idSeed) * (AI_GUN_AIM.aimWobbleRad * 0.65) +
          Math.cos(e.aiTimer * 5.3 + idSeed * 1.7) * (AI_GUN_AIM.aimWobbleRad * 0.35);
        const desiredAimAngle = rawTargetAngle + wobble;
        const maxTurn = combat.aimTurnSpeed * dt;
        e.angle += clamp(angleDiff(e.angle, desiredAimAngle), -maxTurn, maxTurn);
        const aimAngle = rawTargetAngle;

        const desiredRange =
          !canHitRanged
            ? 44
            : heldMelee?.def.kind === 'claw' || heldMelee?.def.kind === 'greatsword'
              ? 135
              : heldGun?.def.kind === 'sniper'
                ? AI_COMBAT.sniper.preferredRange
                : combat.preferredRange;

        const needsClimb = losTargetPos.elev > e.elevation + 0.5;
        const holdingHighGround = e.elevation > losTargetPos.elev + 0.25 && canHitRanged;
        const enemyCanHitAi = this.canRangedHitTarget(
          losTargetPos.x,
          losTargetPos.y,
          losTargetPos.elev,
          e.x,
          e.y,
          e.elevation
        );
        const aiHasOneWayAdvantage = canHitRanged && !enemyCanHitAi;
        const tacticalSpot =
          heldGun && (canHitRanged || !needsClimb)
            ? this.findBestTacticalSpot(
                e,
                losTargetPos,
                sightRange,
                desiredRange,
                holdingHighGround,
                activeGunReloading
              )
            : null;

        if (!canHitRanged || needsClimb) {
          if (tacticalSpot && tacticalSpot.oneWayAdvantage) {
            astarGoal = { x: tacticalSpot.x, y: tacticalSpot.y };
            desiredX = tacticalSpot.x;
            desiredY = tacticalSpot.y;
            moveFactor = 1.0;
          } else {
            astarGoal = { x: losTargetPos.x, y: losTargetPos.y };
            desiredX = losTargetPos.x;
            desiredY = losTargetPos.y;
            moveFactor = 1.0;
          }
        } else if (holdingHighGround) {
          // 佔據高地且可射擊低處目標時，嚴守高地優勢絕不下坡送頭；優先微調至單向掩體高點
          if (tacticalSpot && !tacticalSpot.isCurrentTile && tacticalSpot.scoreGain > 16) {
            desiredX = tacticalSpot.x;
            desiredY = tacticalSpot.y;
            moveFactor = 0.72;
          } else if (bestLosDist > desiredRange + 90) {
            // 只在高地邊緣視距拉太開時貼近邊緣但仍不降層
            if (tacticalSpot && !tacticalSpot.isCurrentTile) {
              desiredX = tacticalSpot.x;
              desiredY = tacticalSpot.y;
              moveFactor = 0.65;
            } else {
              moveFactor = 0;
            }
          } else {
            moveFactor = 0;
          }
        } else if (aiHasOneWayAdvantage && !activeGunReloading && bestLosDist <= desiredRange + 65) {
          // 已經取得「我打得到敵人、敵人打不到我」的單向優勢掩體站位，穩住架槍
          moveFactor = 0;
        } else if (tacticalSpot && !tacticalSpot.isCurrentTile && tacticalSpot.scoreGain > 22) {
          desiredX = tacticalSpot.x;
          desiredY = tacticalSpot.y;
          moveFactor = 0.85;
        } else if (bestLosDist > desiredRange + 24) {
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
        const maxTurn = combat.aimTurnSpeed * dt;
        e.angle += clamp(angleDiff(e.angle, Math.atan2(desiredY - e.y, desiredX - e.x)), -maxTurn, maxTurn);
        moveFactor = 1.05;
      } else if (desiredPickup) {
        // 主動利用 A* 尋路前往地圖武器位置拾取升級裝備
        astarGoal = { x: desiredPickup.x, y: desiredPickup.y };
        desiredX = desiredPickup.x;
        desiredY = desiredPickup.y;
        const maxTurn = combat.aimTurnSpeed * dt;
        e.angle += clamp(angleDiff(e.angle, Math.atan2(desiredY - e.y, desiredX - e.x)), -maxTurn, maxTurn);
        moveFactor = 0.95;
      } else if (e.isAlly && p.hp > 0 && dist(e.x, e.y, p.x, p.y) > 130) {
        astarGoal = { x: p.x, y: p.y };
        desiredX = p.x;
        desiredY = p.y;
        const maxTurn = combat.aimTurnSpeed * dt;
        e.angle += clamp(angleDiff(e.angle, Math.atan2(desiredY - e.y, desiredX - e.x)), -maxTurn, maxTurn);
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
            const maxTurn = combat.aimTurnSpeed * dt;
            e.angle += clamp(angleDiff(e.angle, Math.atan2(desiredY - e.y, desiredX - e.x)), -maxTurn, maxTurn);
          }
        }
      }

      if (patrolling) {
        const forward = Math.atan2(desiredY - e.y, desiredX - e.x);
        const scanAngle = forward + Math.sin(e.aiTimer * 2.6) * 0.42;
        const turn = AI_PATROL.turnSpeed * dt;
        e.angle += clamp(angleDiff(e.angle, scanAngle), -turn, turn);
      }

      if (activeWeapon.type === 'gun') {
        const aimDelta = Math.abs(angleDiff(e.lastAimAngle, e.angle));
        const sweepRefDist = losTargetPos ? clamp(bestLosDist, GUN_AIM.nearDistance, 400) : 220;
        const equivMoveDist = aimDelta * sweepRefDist;
        e.crosshairBloom = Math.min(
          activeWeapon.def.maxCrosshair - activeWeapon.def.baseCrosshair,
          e.crosshairBloom + Math.min(18, Math.max(0, equivMoveDist - 2) * 0.09)
        );
      }
      e.lastAimAngle = e.angle;

      const prevEX = e.x;
      const prevEY = e.y;
      const avoidDropOff = Boolean(losTargetPos && e.elevation > losTargetPos.elev + 0.25 && canHitRanged);
      if (moveFactor > 0) {
        const weaponSpeedMult = activeWeapon.def.moveSpeedMult;
        const moveAng = Math.atan2(desiredY - e.y, desiredX - e.x);
        this.framePushInputs.push({
          id: e.id,
          isPlayer: false,
          faction: e.faction,
          x: e.x,
          y: e.y,
          radius: e.radius,
          elevation: e.elevation,
          dirX: Math.cos(moveAng),
          dirY: Math.sin(moveAng),
        });
        const reactionPace = losTargetPos && e.reactionTimer > 0 ? 0.55 : 1;
        const freezeSpeedMult = e.freezeTimer > 0 ? 0.9 : 1.0;
        const stepDist = e.speed * difficulty.moveMultiplier * weaponSpeedMult * freezeSpeedMult * moveFactor * reactionPace * dt;
        const moved = this.moveCharacterWithElevation(
          e.x,
          e.y,
          e.elevation,
          Math.cos(moveAng) * stepDist,
          Math.sin(moveAng) * stepDist,
          e.radius
        );
        const dropBlocked = avoidDropOff && moved.elevation < e.elevation - 0.01;
        if (dropBlocked || dist(e.x, e.y, moved.x, moved.y) < stepDist * 0.25) {
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
          const valid1 = !avoidDropOff || alt1.elevation >= e.elevation - 0.01;
          const valid2 = !avoidDropOff || alt2.elevation >= e.elevation - 0.01;
          const d1 = valid1 ? dist(e.x, e.y, alt1.x, alt1.y) : -1;
          const d2 = valid2 ? dist(e.x, e.y, alt2.x, alt2.y) : -1;
          if (d1 > 0 || d2 > 0) {
            const pick = d1 >= d2 ? alt1 : alt2;
            e.x = pick.x;
            e.y = pick.y;
            e.elevation = pick.elevation;
          }
        } else {
          e.x = moved.x;
          e.y = moved.y;
          e.elevation = moved.elevation;
        }
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

      // 路過或抵達地面武器點時自動拾取，並檢查是否踩踏冰氣孔
      this.enemyTryPickupWeapon(e);
      this.applyIceVentFreezeCheck(e, false);

      const postPickupWeapon = e.weapons[e.activeHand];
      if (!e.chargingMelee && e.swapTimer <= 0 && readyToAttack && losTargetPos && e.attackCooldown <= 0 && (targetIsPlayer || targetEntity)) {
        const targetAngle = Math.atan2(losTargetPos.y - e.y, losTargetPos.x - e.x);
        const angleErr = Math.abs(angleDiff(e.angle, targetAngle));
        if (postPickupWeapon.type === 'melee' && isCloseMeleeRange && angleErr <= 0.75) {
          const heldMeleeDef = postPickupWeapon.def;
          const meleeKind = heldMeleeDef.kind;
          e.attackCooldown = 1 / (heldMeleeDef.swingRate * (e.freezeTimer > 0 ? 0.9 : 1));
          const animDur = meleeKind === 'greatsword' ? 0.24 : 0.16;
          e.attackAnimDuration = animDur;
          e.attackAnimTimer = animDur;
          e.attackAnimKind = meleeKind;
          const giantMult = e.giantTimer > 0 ? 1.3 : 1.0;
          const meleeDmg = Math.round(heldMeleeDef.damage * giantMult);
          if (meleeKind !== 'shield') {
            this.slashes.push({
              x: e.x,
              y: e.y,
              angle: e.angle,
              arc: heldMeleeDef.arc,
              reach: heldMeleeDef.reach,
              color: e.color,
              life: animDur,
              maxLife: animDur,
              isUltimate: false,
              style: meleeKind === 'greatsword' ? 'sweep' : meleeKind === 'claw' ? 'claw' : 'thrust',
            });
          }
          if (targetIsPlayer) {
            if (meleeKind === 'shield') {
              const pushed = this.moveCharacterWithElevation(
                p.x,
                p.y,
                p.elevation,
                Math.cos(e.angle) * SHIELD_BASH_DISTANCE,
                Math.sin(e.angle) * SHIELD_BASH_DISTANCE,
                p.radius
              );
              p.x = pushed.x;
              p.y = pushed.y;
              p.elevation = pushed.elevation;
            }
            this.damagePlayer(meleeDmg, true, e.id, e.x, e.y);
          } else if (targetEntity) {
            const knockPower = meleeKind === 'shield' ? SHIELD_BASH_DISTANCE / 0.05 : 140;
            this.damageEnemy(
              targetEntity,
              meleeDmg,
              true,
              Math.cos(e.angle) * knockPower,
              Math.sin(e.angle) * knockPower,
              false,
              false,
              e.id,
              e.faction,
              e.x,
              e.y
            );
            if (meleeKind === 'shield' && targetEntity.hp > 0) {
              targetEntity.stunTimer = Math.max(targetEntity.stunTimer, 0.18);
            }
          }
        } else if (postPickupWeapon.type === 'gun' && canHitRanged && postPickupWeapon.reloadTimer <= 0) {
          if (postPickupWeapon.ammoInMag <= 0) {
            postPickupWeapon.reloadTimer = postPickupWeapon.def.reloadTime;
          } else if (angleErr <= AI_GUN_AIM.fireAngleToleranceRad) {
            e.attackCooldown =
              (1 / postPickupWeapon.def.fireRate) *
              AI_GUN_AIM.fireIntervalMultByKind[postPickupWeapon.def.kind];
            this.fireEnemyGunHitscan(e, e.angle, postPickupWeapon, bestLosDist);
            const spent = postPickupWeapon.def.kind === 'shotgun' ? postPickupWeapon.def.pellets : 1;
            postPickupWeapon.ammoInMag = Math.max(0, postPickupWeapon.ammoInMag - spent);
            if (postPickupWeapon.ammoInMag <= 0) {
              postPickupWeapon.reloadTimer = postPickupWeapon.def.reloadTime;
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
            const roll = Math.random();
            const angleOffset = roll < 1 / 3 ? Math.PI / 4 : roll < 2 / 3 ? 0 : -Math.PI / 4;
            if (angleOffset !== 0) {
              const speed = Math.hypot(proj.vx, proj.vy) || 340;
              const nextAng = Math.atan2(proj.vy, proj.vx) + angleOffset;
              proj.vx = Math.cos(nextAng) * speed;
              proj.vy = Math.sin(nextAng) * speed;
            }
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
              const hitInfo = evaluateBlackDragonHit(proj, segs, prevX, prevY, p.x, p.y, p.radius);
              if (hitInfo) {
                cooldowns['player'] = 0.25;
                this.damagePlayer(hitInfo.hitDmg, true, proj.ownerId, hitInfo.hitOriginX, hitInfo.hitOriginY);
              }
            }
          }

          for (const e of [...this.enemies]) {
            if (e.id === proj.ownerId || cooldowns[e.id]) continue;
            if (!areHostile(proj.ownerFaction, proj.ownerId, e.faction, e.id)) continue;
            const hitInfo = evaluateBlackDragonHit(proj, segs, prevX, prevY, e.x, e.y, e.radius);
            if (hitInfo) {
              cooldowns[e.id] = 0.25;
              this.damageEnemy(
                e,
                hitInfo.hitDmg,
                true,
                proj.vx * 0.05,
                proj.vy * 0.05,
                false,
                true,
                proj.ownerId,
                proj.ownerFaction,
                hitInfo.hitOriginX,
                hitInfo.hitOriginY
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
        const prevSubX = proj.x;
        const prevSubY = proj.y;
        const subDt = dt / subSteps;
        proj.x += proj.vx * subDt;
        proj.y += proj.vy * subDt;

        if (proj.x < 0 || proj.x > this.map.width || proj.y < 0 || proj.y > this.map.height) {
          destroyed = true;
          break;
        }

        const wallHit = this.findEarliestWallHit(prevSubX, prevSubY, proj.x, proj.y);
        if (wallHit) {
          this.spawnBurst(wallHit.x, wallHit.y, proj.color, 4);
          destroyed = true;
          break;
        }

        const h = this.getHeightAtPoint(proj.x, proj.y);
        if (!h.isCrate) {
          const effectiveFloor = proj.startElevation < 0 ? h.terrainHeight : Math.max(0, h.terrainHeight);
          proj.minTraversedElevation = Math.min(proj.minTraversedElevation, effectiveFloor);
        }
        const crateBlocks = h.isCrate && proj.minTraversedElevation < 1.5 && h.totalHeight - proj.minTraversedElevation > 1.0;
        const cliffBlocks = !h.isCrate && h.totalHeight - proj.minTraversedElevation > 1.0;
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
      drawPickup(ctx, pk);
    }

    // 9. 近戰特效
    for (const s of this.slashes) {
      drawSlashEffect(ctx, s);
    }

    // 10. 電腦敵我士兵及技能狀態
    for (const e of this.enemies) {
      if (!e.chargingMelee && e.qi < e.maxQi - 0.5) {
        drawQiRecovery(ctx, e.x, e.y, e.radius, this.time);
      }

      const skillVisuals = this.getActorSkillVisuals(e);
      this.drawActorSkillEffects(ctx, e, skillVisuals);

      const eActive = e.weapons[e.activeHand];
      const eGun = this.getEnemyGun(e);
      const eMelee = this.getEnemyMelee(e);
      const eReloading = eActive.type === 'gun' && eActive.reloadTimer > 0;
      const eReloadProg =
        eActive.type === 'gun' && eActive.reloadTimer > 0
          ? clamp(1 - eActive.reloadTimer / eActive.def.reloadTime, 0, 1)
          : 0;
      const eSwapProg =
        e.swapTimer > 0 && e.swapDuration > 0
          ? clamp(1 - e.swapTimer / e.swapDuration, 0.01, 1)
          : 0;

      const eAtkProg =
        e.attackAnimTimer > 0 && e.attackAnimDuration > 0
          ? clamp(1 - e.attackAnimTimer / e.attackAnimDuration, 0, 1)
          : 0;

      drawCharacter(ctx, {
        x: e.x,
        y: e.y,
        radius: e.baseRadius * skillVisuals.sizeScale,
        morphScale: skillVisuals.sizeScale,
        shadowDodge: skillVisuals.shadowDodge,
        angle: e.angle,
        bodyColor: e.hitFlash > 0 ? '#FFFFFF' : e.characterSkin.bodyColor,
        role: e.isAlly ? 'ALLY' : 'ENEMY',
        holdingMelee: eActive.type === 'melee',
        shadowActive: e.shadowCloneTimer > 0,
        time: this.time,
        isReloading: eReloading,
        reloadProgress: eReloadProg,
        isBlinded: e.blindTimer > 0,
        isFrozen: e.freezeTimer > 0,
        gunKind: eActive.type === 'gun' ? eActive.def.kind : eGun?.def.kind,
        meleeKind: eActive.type === 'melee' ? eActive.def.kind : eMelee?.def.kind,
        skin: e.characterSkin,
        walkPhase: e.walkPhase,
        moveIntensity: e.moveIntensity,
        swapProgress: eSwapProg,
        attackAnimProgress: eAtkProg,
        attackAnimKind: e.attackAnimKind,
        gunfireTimer: e.gunfireTimer,
        eagleEyeRemaining: e.eagleEyeTimer,
      });

      if (e.royalShieldTimer > 0) {
        drawRoyalShield(ctx, e, this.time);
      }

      const bw = 40;
      const bx = e.x - bw / 2;
      const by = e.y - e.radius - 13;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = e.isAlly ? '#38BDF8' : e.color;
      ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 5);

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
      drawOutlinedText(
        ctx,
        e.name.replace(/\s*[（(]預設[）)]$/, ''),
        e.x,
        by - 5,
        nameplateColor,
        11,
        'center',
        nameplateStroke
      );
    }

    // 11. 玩家角色及技能狀態
    const p = this.player;
    const facHex = p.characterSkin.bodyColor || FACTIONS[p.faction].accentHex;

    if (p.hp > 0) {
      if (!this.chargeSessionAllowed && p.qi < p.maxQi - 0.5) {
        drawQiRecovery(ctx, p.x, p.y, p.radius, this.time);
      }

      const skillVisuals = this.getActorSkillVisuals(p);
      this.drawActorSkillEffects(ctx, p, skillVisuals);

      const weapon = p.weapons[p.activeHand];
      const isReloading = weapon.type === 'gun' && weapon.reloadTimer > 0;
      const playerReloadProg = isReloading ? clamp(1 - weapon.reloadTimer / weapon.def.reloadTime, 0, 1) : 0;
      const playerSwapProg = p.swapTimer > 0 && p.swapDuration > 0 ? clamp(1 - p.swapTimer / p.swapDuration, 0.01, 1) : 0;
      const playerAtkProg =
        p.attackAnimTimer > 0 && p.attackAnimDuration > 0
          ? clamp(1 - p.attackAnimTimer / p.attackAnimDuration, 0, 1)
          : 0;

      drawCharacter(ctx, {
        x: p.x,
        y: p.y,
        radius: p.baseRadius * skillVisuals.sizeScale,
        morphScale: skillVisuals.sizeScale,
        shadowDodge: skillVisuals.shadowDodge,
        angle: p.angle,
        bodyColor: p.invulnTimer > 0 && Math.floor(this.time * 16) % 2 === 0 ? '#FFFFFF' : facHex,
        role: 'PLAYER',
        holdingMelee: weapon.type === 'melee',
        shadowActive: p.shadowCloneTimer > 0,
        time: this.time,
        isReloading,
        reloadProgress: playerReloadProg,
        isBlinded: false,
        isFrozen: p.freezeTimer > 0,
        gunKind: weapon.type === 'gun' ? weapon.def.kind : undefined,
        meleeKind: weapon.type === 'melee' ? weapon.def.kind : undefined,
        skin: p.characterSkin,
        walkPhase: p.walkPhase,
        moveIntensity: p.moveIntensity,
        swapProgress: playerSwapProg,
        attackAnimProgress: playerAtkProg,
        attackAnimKind: p.attackAnimKind,
        gunfireTimer: p.gunfireTimer,
        eagleEyeRemaining: p.eagleEyeTimer,
      });

      if (p.royalShieldTimer > 0) {
        drawRoyalShield(ctx, p, this.time);
      }

      if (isReloading) {
        const barW = 42;
        const barX = p.x - barW / 2;
        const barY = p.y - p.radius - 16;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(barX, barY, barW, 5);
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(barX, barY, barW * playerReloadProg, 5);
        drawOutlinedText(ctx, '裝彈中', p.x, barY - 4, '#FBBF24', 11, 'center');
      }
    }

    // 12. 敵我共用極速線狀子彈
    drawBeamTracers(ctx, this.beams);

    // 13. 陣營近武波動（黃色光彈與深紫藍長龍黑龍波）
    drawProjectiles(ctx, this.projectiles, this.time);
    drawSkillTraces(ctx, this.skillTraces, this.time);
    drawParticles(ctx, this.particles);

    // 14. 高 z-index 樹葉（依不同地圖呈現相應樹冠）
    renderMapCanopies(ctx, this.map, p);

    drawFloatingTexts(ctx, this.floatingTexts);

    ctx.restore();

    if (p.hp > 0 && p.blindTimer > 0 && p.blindDuration > 0 && this.status === 'PLAYING') {
      const flashAlpha = clamp(p.blindTimer / p.blindDuration, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (this.status === 'PLAYING') {
      const weapon = p.weapons[p.activeHand];
      const radiusPx = weapon.type === 'gun' ? this.getPlayerGunSpread(weapon.def) * GUN_AIM.spreadScale : 12;
      let { x: aimX, y: aimY } = this.mouseScreen;
      if (weapon.type === 'gun' && weapon.def.kind === 'rifle' && weapon.reloadTimer <= 0 && weapon.ammoInMag > 0) {
        const playerScreenX = width / 2 + (p.x - this.camera.x) * this.camera.zoom;
        const playerScreenY = height / 2 + (p.y - this.camera.y) * this.camera.zoom;
        const dx = aimX - playerScreenX;
        const dy = aimY - playerScreenY;
        const recoil = this.getPlayerRifleDrift();
        aimX = playerScreenX + dx * Math.cos(recoil) - dy * Math.sin(recoil);
        aimY = playerScreenY + dx * Math.sin(recoil) + dy * Math.cos(recoil);
      }

      drawCrosshair(
        ctx,
        aimX,
        aimY,
        this.time,
        radiusPx,
        weapon.type === 'gun' && weapon.reloadTimer > 0,
        weapon.type === 'gun' && weapon.ammoInMag <= 0,
        p.eagleEyeTimer > 0,
        p.comboEmpowerTimer > 0
      );
    }
  }

  public emitHud() {
    const p = this.player;
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
      activeTimedSkills.push({ id: 'eagleEye', name: '鷹眼術', remaining: p.eagleEyeTimer, duration: EAGLE_EYE_DURATION, color: '#FB7185' });
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
    if (p.freezeTimer > 0) {
      buffs.push(`冰凍 ${p.freezeTimer.toFixed(1)}s`);
      activeTimedSkills.push({ id: 'frozen', name: '冰凍', remaining: p.freezeTimer, duration: 5.0, color: '#38BDF8' });
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
      },
      factionScores: { ...this.factionScores },
    });
  }
}
