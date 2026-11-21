import { describe, expect, it, vi } from 'vitest';
import { sfx } from '../audio/sfx';
import {
  FLOOR_TERRAIN_BINDINGS,
  TREE_FOLIAGE_PRESETS,
  arenaMapToCustomData,
  buildArenaMapFromCustom,
  canPlaceTerrainStairAt,
  createBlankCustomMap,
  hasUniformCellElevation,
  validateCustomMap,
} from './customMaps';
import { FACTION_CHARACTERS, GUNS, MAP_CATALOG, MELEES, getReputationQiMultiplier, getWeaponSwapDuration } from './data';
import { TwilightEngine, snapToEightDirections } from './engine';
import { CHAR_BASE_RADIUS } from './geometry';
import { TILE, createArenaMap, getIglooCellMask } from './maps';
import { AI_COMBAT, AI_GUN_AIM, GUN_AIM, RESPAWN_DELAY_SECONDS, getGunSpread } from './tuning';
import { CardinalDir, EnemyEntity, FactionId, FloorStyle, HudSnapshot, MapId, WeaponHand } from './types';

function createTestEngine(
  faction: FactionId = 'royal',
  mapId: MapId = 'tokyo_shrine',
  initialRepsInput: number | Partial<Record<FactionId, number>> = 10
) {
  const initialReps: Record<FactionId, number> =
    typeof initialRepsInput === 'number'
      ? { royal: initialRepsInput, shadow: initialRepsInput, mercenary: initialRepsInput }
      : {
          royal: initialRepsInput.royal ?? 0,
          shadow: initialRepsInput.shadow ?? 0,
          mercenary: initialRepsInput.mercenary ?? 0,
        };

  let latestHud: HudSnapshot | null = null;
  let latestReps: Record<FactionId, number> = { ...initialReps };
  const engine = new TwilightEngine(
    faction,
    FACTION_CHARACTERS[faction][0],
    mapId,
    initialReps,
    (snap) => {
      latestHud = snap;
    },
    (reps) => {
      latestReps = { ...reps };
    }
  );
  return { engine, getHud: () => latestHud, getRep: () => latestReps[faction], getReps: () => latestReps };
}

function gunInHand(engine: TwilightEngine, hand: WeaponHand = 0) {
  const weapon = engine.player.weapons[hand];
  if (weapon.type !== 'gun') throw new Error('Expected a gun');
  return weapon;
}

function meleeInHand(engine: TwilightEngine, hand: WeaponHand = 1) {
  const weapon = engine.player.weapons[hand];
  if (weapon.type !== 'melee') throw new Error('Expected a melee weapon');
  return weapon;
}

describe('Reputation logarithmic Qi speed & independent per-faction kill adjustments', () => {
  it('follows the exact log10 multiplier points (0 -> 0.5x, 10 -> 1.0x, 100 -> 1.5x, 1000 -> 2.0x) and handles negative safely', () => {
    expect(getReputationQiMultiplier(-5)).toBeCloseTo(0.5, 5);
    expect(getReputationQiMultiplier(0)).toBeCloseTo(0.5, 5);
    expect(getReputationQiMultiplier(10)).toBeCloseTo(1.0, 5);
    expect(getReputationQiMultiplier(100)).toBeCloseTo(1.5, 5);
    expect(getReputationQiMultiplier(1000)).toBeCloseTo(2.0, 5);
  });

  it('tracks independent reputations per faction: Royal/Shadow mutual -1, Third never deducted, Third deducts Royal/Shadow', () => {
    type DamageEnemyFn = (
      enemy: EnemyEntity,
      dmg: number,
      isMelee: boolean,
      kx: number,
      ky: number,
      bull: boolean,
      noFF: boolean,
      attackerId: string,
      attackerFac: FactionId
    ) => void;

    // 1. Royal starts at {0, 0, 0}: kills Shadow -> Royal +1, Shadow -1; kills Mercenary -> Royal +1, Mercenary stays 0; kills Royal ally -> Royal -1
    const rCtx = createTestEngine('royal', 'european_castle', { royal: 0, shadow: 0, mercenary: 0 });
    const rDmg = (rCtx.engine as unknown as { damageEnemy: DamageEnemyFn }).damageEnemy.bind(rCtx.engine);

    const shadowTarget = rCtx.engine.enemies.find((e) => e.faction === 'shadow')!;
    shadowTarget.hp = 5;
    rDmg(shadowTarget, 50, true, 0, 0, false, false, 'player', 'royal');
    expect(rCtx.getReps()).toEqual({ royal: 1, shadow: -1, mercenary: 0 });

    const mercTarget = rCtx.engine.enemies.find((e) => e.faction === 'mercenary')!;
    mercTarget.hp = 5;
    rDmg(mercTarget, 50, true, 0, 0, false, false, 'player', 'royal');
    expect(rCtx.getReps()).toEqual({ royal: 2, shadow: -1, mercenary: 0 });

    const allyTarget = rCtx.engine.enemies.find((e) => e.faction === 'royal')!;
    allyTarget.hp = 5;
    rDmg(allyTarget, 50, true, 0, 0, false, false, 'player', 'royal');
    expect(rCtx.getReps()).toEqual({ royal: 1, shadow: -1, mercenary: 0 });

    // 2. Shadow starts at {0, 0, 0}: kills Royal -> Shadow +1, Royal -1; kills Mercenary -> Shadow +1, Mercenary stays 0
    const sCtx = createTestEngine('shadow', 'european_castle', { royal: 0, shadow: 0, mercenary: 0 });
    const sDmg = (sCtx.engine as unknown as { damageEnemy: DamageEnemyFn }).damageEnemy.bind(sCtx.engine);

    const sRoyal = sCtx.engine.enemies.find((e) => e.faction === 'royal')!;
    sRoyal.hp = 5;
    sDmg(sRoyal, 50, true, 0, 0, false, false, 'player', 'shadow');
    expect(sCtx.getReps()).toEqual({ royal: -1, shadow: 1, mercenary: 0 });

    const sMerc = sCtx.engine.enemies.find((e) => e.faction === 'mercenary')!;
    sMerc.hp = 5;
    sDmg(sMerc, 50, true, 0, 0, false, false, 'player', 'shadow');
    expect(sCtx.getReps()).toEqual({ royal: -1, shadow: 2, mercenary: 0 });

    // 3. Mercenary starts at {0, 0, 0}: kills Royal -> Mercenary +1, Royal -1; kills Shadow -> Mercenary +1, Shadow -1; kills Mercenary -> Mercenary +1 only
    const mCtx = createTestEngine('mercenary', 'european_castle', { royal: 0, shadow: 0, mercenary: 0 });
    const mDmg = (mCtx.engine as unknown as { damageEnemy: DamageEnemyFn }).damageEnemy.bind(mCtx.engine);

    const mRoyal = mCtx.engine.enemies.find((e) => e.faction === 'royal')!;
    mRoyal.hp = 5;
    mDmg(mRoyal, 50, true, 0, 0, false, false, 'player', 'mercenary');
    expect(mCtx.getReps()).toEqual({ royal: -1, shadow: 0, mercenary: 1 });

    const mShadow = mCtx.engine.enemies.find((e) => e.faction === 'shadow')!;
    mShadow.hp = 5;
    mDmg(mShadow, 50, true, 0, 0, false, false, 'player', 'mercenary');
    expect(mCtx.getReps()).toEqual({ royal: -1, shadow: -1, mercenary: 2 });

    const mOther = mCtx.engine.enemies.find((e) => e.faction === 'mercenary')!;
    mOther.hp = 5;
    mDmg(mOther, 50, true, 0, 0, false, false, 'player', 'mercenary');
    expect(mCtx.getReps()).toEqual({ royal: -1, shadow: -1, mercenary: 3 });
  });
});

describe('10 soldiers per faction & max 2 active per faction', () => {
  it('starts with 10 soldiers per faction (30 total) and caps active field count at 2 per faction', () => {
    const { engine, getHud } = createTestEngine('royal', 'tokyo_shrine', 10);
    const hud = getHud()!;

    expect(hud.factionRemaining.royal).toBe(10);
    expect(hud.factionRemaining.shadow).toBe(10);
    expect(hud.factionRemaining.mercenary).toBe(10);

    expect(hud.factionActive.royal).toBe(2);
    expect(hud.factionActive.shadow).toBe(2);
    expect(hud.factionActive.mercenary).toBe(2);

    // Total active AI = 1 royal ally + 2 shadow + 2 mercenary = 5
    expect(engine.enemies.length).toBe(5);
  });

  it('spawns a replacement of the same faction when one dies until all 10 are spent', () => {
    const { engine, getHud } = createTestEngine('royal', 'tokyo_shrine', 10);

    // Remove one shadow soldier and advance time to trigger refill
    const shadowUnit = engine.enemies.find((e) => e.faction === 'shadow')!;
    shadowUnit.hp = 1;
    (engine as unknown as {
      damageEnemy: (
        enemy: typeof shadowUnit,
        dmg: number,
        isMelee: boolean,
        kx: number,
        ky: number,
        bull: boolean,
        noFF: boolean,
        attackerId: string,
        attackerFac: FactionId
      ) => void;
    }).damageEnemy(shadowUnit, 50, true, 0, 0, false, false, 'player', 'royal');

    expect(getHud()!.factionRemaining.shadow).toBe(9);
    expect(getHud()!.factionActive.shadow).toBe(1);

    engine.update(0.7, 1280, 720);
    expect(getHud()!.factionRemaining.shadow).toBe(9);
    expect(getHud()!.factionActive.shadow).toBe(2);

    // Also verify ally replacement for player's own faction
    const allyUnit = engine.enemies.find((e) => e.faction === 'royal')!;
    allyUnit.hp = 1;
    (engine as unknown as {
      damageEnemy: (
        enemy: typeof allyUnit,
        dmg: number,
        isMelee: boolean,
        kx: number,
        ky: number,
        bull: boolean,
        noFF: boolean,
        attackerId: string,
        attackerFac: FactionId
      ) => void;
    }).damageEnemy(allyUnit, 50, true, 0, 0, false, false, 'player', 'royal');

    expect(getHud()!.factionRemaining.royal).toBe(9);
    engine.update(0.7, 1280, 720);
    expect(getHud()!.factionActive.royal).toBe(2);
    expect(getHud()!.factionRemaining.royal).toBe(9);
  });

  it('treats third-faction mercenaries as hostile to each other', () => {
    const { engine } = createTestEngine('mercenary', 'tokyo_shrine', 10);
    const otherMerc = engine.enemies.find((e) => e.faction === 'mercenary');
    expect(otherMerc).toBeTruthy();
    expect(otherMerc!.isAlly).toBe(false);
  });
});

describe('KeyR reload & infinite ranged weapon range', () => {
  it('reloads magazine from reserve ammo when pressing R and completes after reloadTime', () => {
    const { engine, getHud } = createTestEngine('royal', 'tokyo_shrine', 10);
    gunInHand(engine).ammoInMag = 2;
    engine.player.reserveAmmo = 30;

    engine.setKey('KeyR', true);
    engine.setKey('KeyR', false);

    expect(gunInHand(engine).reloadTimer).toBeGreaterThan(0);
    expect(getHud()!.player.reloadProgress).toBeGreaterThan(0);

    // Advance past pistol reload time (0.95s)
    engine.update(0.5, 1280, 720);
    engine.update(0.6, 1280, 720);

    expect(gunInHand(engine).reloadTimer).toBe(0);
    expect(gunInHand(engine).ammoInMag).toBe(gunInHand(engine).def.magSize);
    expect(engine.player.reserveAmmo).toBe(26);
  });

  it.each(['shotgun', 'sniper'] as const)('times each %s reload cue to the reload and waits over two seconds', (kind) => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const weapon = gunInHand(engine);
    weapon.def = GUNS.find(gun => gun.kind === kind)!;
    weapon.ammoInMag = 0;
    expect(weapon.def.reloadTime).toBeGreaterThan(2);

    const reload = vi.spyOn(sfx, 'reload');
    try {
      engine.startReload();
      expect(reload.mock.calls).toEqual([[kind, 'start']]);
      engine.update(weapon.def.reloadTime * 0.30, 1280, 720);
      expect(reload.mock.calls).toEqual([[kind, 'start'], [kind, 'remove']]);
      engine.setKey('KeyP', true);
      engine.setKey('KeyP', false);
      engine.update(1.5, 1280, 720);
      expect(reload).toHaveBeenCalledTimes(2);
      expect(weapon.ammoInMag).toBe(0);
      engine.setKey('KeyP', true);
      engine.setKey('KeyP', false);
      engine.update(weapon.def.reloadTime * 0.65, 1280, 720);
      expect(reload.mock.calls.slice(2)).toEqual([[kind, 'insert'], [kind, 'close']]);
      expect(weapon.ammoInMag).toBe(0);
      engine.update(weapon.def.reloadTime * 0.06, 1280, 720);
      expect(reload).toHaveBeenLastCalledWith(kind, 'ready');
      expect(weapon.ammoInMag).toBe(weapon.def.magSize);
    } finally {
      reload.mockRestore();
    }
  });

  it('gives all 4 ranged guns infinite map-spanning range and stops on first hit (no multi-target pierce)', () => {
    expect(GUNS.length).toBe(4);

    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    // Place player on clear left lane and two shadow enemies lined up far away (> 900px from player!)
    engine.player.x = 1.5 * TILE;
    engine.player.y = 9.5 * TILE;
    engine.player.elevation = 0;
    engine.player.angle = 0;
    gunInHand(engine).def = GUNS.find((g) => g.kind === 'pistol')!;
    gunInHand(engine).ammoInMag = 6;

    const shadowEnemies = engine.enemies.filter((e) => e.faction === 'shadow');
    // Line up two enemies at gx=21 (~960px away!) and gx=23 (~1056px away!) along y=9.5*TILE
    // Wait: make sure y=9.5*TILE on industrial_warehouse is clear or test at y=18.5*TILE (open bottom lane!)
    engine.player.y = 19.3 * TILE;
    shadowEnemies[0].x = 22 * TILE;
    shadowEnemies[0].y = 19.3 * TILE;
    shadowEnemies[0].elevation = 0;
    shadowEnemies[1].x = 25 * TILE;
    shadowEnemies[1].y = 19.3 * TILE;
    shadowEnemies[1].elevation = 0;

    // Aim directly right at 0 rad (far beyond old 540px pistol limit!)
    const seg = (engine as unknown as {
      traceBulletSegment: (
        x1: number,
        y1: number,
        angle: number,
        maxDist: number,
        startElev: number
      ) => { x1: number; y1: number; x2: number; y2: number };
    }).traceBulletSegment(engine.player.x + 28, engine.player.y, 0, 3000, 0);

    // Bullet traces all the way across the 28-tile map without dying mid-air
    expect(seg.x2).toBeGreaterThan(26 * TILE);

    // Center the shot to test map-spanning travel independently of long-range dispersion.
    const hp1Before = shadowEnemies[0].hp;
    const hp2Before = shadowEnemies[1].hp;
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    try {
      engine.setMouseDown(true);
      engine.setMouseDown(false);
    } finally {
      random.mockRestore();
    }

    expect(shadowEnemies[0].hp).toBeLessThan(hp1Before);
    expect(shadowEnemies[1].hp).toBe(hp2Before);
  });
});

describe('Map layouts & 2.5D terrain rules', () => {
  it('tokyo_shrine uses 1x1 wooden walls, zero crates, 2 shrine stairs, and seamless irregular 2-tier hills', () => {
    const map = createArenaMap('tokyo_shrine');

    // Zero crates in Edo shrine
    expect(map.obstacles.every((o) => o.kind === 'wall' && o.style === 'shrine_wall')).toBe(true);
    // Every wall is strictly 1x1 tile
    expect(map.obstacles.every((o) => o.w === TILE && o.h === TILE)).toBe(true);

    // Shrine has only top & bottom stairs
    const shrineStairs = map.stairs.filter((s) => s.style === 'shrine_floor');
    expect(shrineStairs.length).toBe(2);

    // Right hill is one seamless connected mass from gy=5 to gy=17 (no gap between gy=7 and gy=8!)
    for (let gy = 5; gy <= 17; gy++) {
      const hasHillInRow = map.tileGrid[gy].slice(22, 29).some((c) => c.style === 'hill' && c.elev >= 1.0);
      expect(hasHillInRow).toBe(true);
    }

    // Non-rectangular width variation on hills
    const leftWidths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(
      (gy) => map.tileGrid[gy].slice(0, 10).filter((c) => c.style === 'hill' && c.elev >= 1.0).length
    );
    expect(new Set(leftWidths).size).toBeGreaterThan(1);

    // Both hills reach elevation 2.0
    const hasLevel2Left = map.tileGrid.some((row) => row.slice(0, 10).some((c) => c.elev === 2.0));
    const hasLevel2Right = map.tileGrid.some((row) => row.slice(20).some((c) => c.elev === 2.0));
    expect(hasLevel2Left).toBe(true);
    expect(hasLevel2Right).toBe(true);
  });

  it('desert_ruins has tile-based river blocking ground travel except on bridges, plus 3-tier pyramid', () => {
    const { engine } = createTestEngine('royal', 'desert_ruins', 10);
    const map = engine.map;

    // 3-tier pyramid reaches elevation 3.0
    expect(engine.getWalkableElevation(8.5 * TILE, 10.5 * TILE)).toBe(3.0);

    // Water tile blocks walking; bridge over water allows walking
    const isGroundWalkable = (x: number, y: number) =>
      (engine as unknown as { isGroundWalkable: (x: number, y: number) => boolean }).isGroundWalkable(x, y);

    expect(isGroundWalkable(22.5 * TILE, 10.5 * TILE)).toBe(false);
    expect(isGroundWalkable(21.5 * TILE, 4.5 * TILE)).toBe(true); // North bridge
    expect(isGroundWalkable(22.5 * TILE, 15.5 * TILE)).toBe(true); // South bridge
    expect(map.waterTiles.length).toBeGreaterThan(40);
  });

  it('industrial_warehouse replaces platforms with 2.0 shipping containers, uses strictly 1x1 stairs & small crates, and supports 0->0.5->1->1.5->2 climbing', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);

    // Zero elevated tileGrid platforms
    const anyPlatformTile = engine.map.tileGrid.some((row) => row.some((c) => c.elev > 0));
    expect(anyPlatformTile).toBe(false);

    // Every stair and every small_crate in East Port must be strictly 1x1 tile
    expect(engine.map.stairs.length).toBeGreaterThan(0);
    for (const st of engine.map.stairs) {
      expect(st.w).toBe(TILE);
      expect(st.h).toBe(TILE);
    }
    const smallCrates = engine.map.obstacles.filter((o) => o.kind === 'crate' && o.style === 'small_crate');
    expect(smallCrates.length).toBeGreaterThan(0);
    for (const sc of smallCrates) {
      expect(sc.w).toBe(TILE);
      expect(sc.h).toBe(TILE);
      expect(sc.elevation).toBe(1.0);
    }

    // Verify 0 -> 0.5 -> 1.0 -> 1.5 -> 2.0 climb chain A (1x1 stair at (4,4), 1x1 small_crate at (5,4))
    expect(engine.getWalkableElevation(3.5 * TILE, 4.5 * TILE)).toBe(0);
    expect(engine.getWalkableElevation(4.5 * TILE, 4.5 * TILE)).toBe(0.5);
    expect(engine.getWalkableElevation(5.5 * TILE, 4.5 * TILE)).toBe(1.0);
    expect(engine.getWalkableElevation(6.5 * TILE, 4.5 * TILE)).toBe(1.5);
    expect(engine.getWalkableElevation(9.5 * TILE, 3.5 * TILE)).toBe(2.0);
  });
});

describe('Faction skill combat rules', () => {
  it('breaks Shadow Clone immediately when struck by melee', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    const shadowEnemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    shadowEnemy.shadowCloneTimer = 5.0;

    (engine as unknown as {
      damageEnemy: (
        enemy: typeof shadowEnemy,
        dmg: number,
        isMelee: boolean,
        kx: number,
        ky: number,
        bull: boolean,
        noFF: boolean,
        attackerId: string,
        attackerFac: FactionId
      ) => void;
    }).damageEnemy(shadowEnemy, 15, true, 0, 0, false, false, 'player', 'royal');

    expect(shadowEnemy.shadowCloneTimer).toBe(0);
    expect(shadowEnemy.hp).toBeLessThan(100);
  });

  it('breaks Royal Shield when the shielded player fires a gun', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    engine.player.royalShieldTimer = 6.0;
    engine.player.activeHand = 0;
    engine.setMouseDown(true);
    engine.setMouseDown(false);

    expect(engine.player.royalShieldTimer).toBe(0);
  });
});

describe('Default loadout, player respawn, and map crate placement invariants', () => {
  it('gives every faction (including Shadow) pistol and knife as default starting weapons', () => {
    for (const fac of ['royal', 'shadow', 'mercenary'] as FactionId[]) {
      const { engine } = createTestEngine(fac, 'tokyo_shrine', 10);
      expect(gunInHand(engine).def.kind).toBe('pistol');
      expect(meleeInHand(engine).def.kind).toBe('knife');
    }
  });

  it.each(['pistol', 'shotgun'] as const)('tightens actual %s dispersion at close range', (kind) => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const player = engine.player;
    player.x = 10.5 * TILE;
    player.y = 19.3 * TILE;
    player.elevation = 0;
    engine.enemies = [];
    const aim = engine as unknown as {
      camera: { x: number; y: number; zoom: number };
      resetGunFeedback: () => void;
    };
    aim.camera.x = player.x;
    aim.camera.y = player.y;
    aim.camera.zoom = 1;

    const weapon = gunInHand(engine);
    weapon.def = GUNS.find(gun => gun.kind === kind)!;
    const fire = (distance: number) => {
      weapon.ammoInMag = weapon.def.magSize;
      engine.setMousePos(640 + distance, 360);
      aim.resetGunFeedback();
      player.attackCooldown = 0;
      engine.beams = [];
      engine.setMouseDown(true);
      engine.setMouseDown(false);
      expect(player.gunfireTimer).toBeGreaterThan(0);
      const shot = engine.beams[0];
      return Math.abs(Math.atan2(shot.y2 - shot.y1, shot.x2 - shot.x1));
    };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.75);
    try {
      const nearAngle = fire(24);
      const farAngle = fire(420);
      expect(nearAngle).toBeGreaterThan(0);
      expect(farAngle).toBeGreaterThan(nearAngle * 4.5);
      expect(farAngle).toBeLessThan(0.085);
    } finally {
      random.mockRestore();
    }
  });

  it('respawns the player back at their faction spawn point upon death', () => {
    const { engine } = createTestEngine('shadow', 'desert_ruins', 10);
    const spawnPt = engine.map.factionSpawns.shadow[0];

    // Move player far onto the 3-tier pyramid top
    engine.player.x = 8.5 * TILE;
    engine.player.y = 10.5 * TILE;
    engine.player.elevation = 3.0;
    engine.player.invulnTimer = 0;

    (engine as unknown as {
      damagePlayer: (rawDmg: number, isMelee: boolean, attackerId?: string) => void;
    }).damagePlayer(999, false);

    expect(engine.player.lives).toBe(2);
    expect(engine.status).toBe('RESPAWNING');
    expect(engine.player.hp).toBe(0);
    expect(engine.player.x).toBe(8.5 * TILE);
    engine.setKey('KeyD', true);
    engine.setMouseDown(true);
    engine.update(RESPAWN_DELAY_SECONDS - 0.5, 1280, 720);
    expect(engine.status).toBe('RESPAWNING');
    expect(engine.player.x).toBe(8.5 * TILE);
    engine.update(0.5, 1280, 720);
    expect(engine.status).toBe('PLAYING');
    expect(engine.player.hp).toBe(engine.player.maxHp);
    expect(engine.player.x).toBe(spawnPt.x);
    expect(engine.player.y).toBe(spawnPt.y);
    expect(engine.player.elevation).toBe(0);
  });

  it('continues the battle while the player is down and does not target the body', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const attacker = engine.enemies.find(e => e.faction === 'shadow')!;
    const rival = engine.enemies.find(e => e.faction === 'mercenary')!;
    engine.enemies = [attacker, rival];
    engine.pickups = [];
    attacker.x = 12.5 * TILE;
    attacker.y = rival.y = engine.player.y = 19.3 * TILE;
    attacker.elevation = rival.elevation = engine.player.elevation = 0;
    attacker.speed = rival.speed = 0;
    attacker.attackCooldown = 0;
    attacker.qi = -999;
    rival.attackCooldown = 99;
    rival.qi = -999;
    rival.x = attacker.x + 205;
    engine.player.x = attacker.x + 100;
    engine.player.invulnTimer = 0;
    attacker.focusedTargetId = 'player';
    const downX = engine.player.x;

    const damagePlayer = (engine as unknown as {
      damagePlayer: (damage: number, melee: boolean) => void;
    }).damagePlayer.bind(engine);
    damagePlayer(999, false);

    let firedDuringRespawn = false;
    for (let i = 0; i < 50; i++) {
      engine.update(1 / 60, 1280, 720);
      firedDuringRespawn ||= engine.beams.length > 0;
    }
    expect(engine.status).toBe('RESPAWNING');
    expect(attacker.focusedTargetId).toBe(rival.id);
    expect(firedDuringRespawn).toBe(true);
    expect(rival.hp).toBeLessThan(rival.maxHp);
    expect(engine.player.hp).toBe(0);
    expect(engine.player.x).toBe(downX);
    expect(engine.player.lives).toBe(2);
  });

  it('never places any crate straddling different terrain elevations, water, or stairs on any map', () => {
    const allMaps: MapId[] = [
      'tokyo_shrine',
      'european_castle',
      'desert_ruins',
      'industrial_warehouse',
      'western_railway',
      'bamboo_fortress',
      'stanley_island',
      'glacier_rift',
    ];
    for (const mapId of allMaps) {
      const map = createArenaMap(mapId);
      const crates = map.obstacles.filter((o) => o.kind === 'crate');
      for (const crate of crates) {
        const gxStart = Math.floor(crate.x / TILE);
        const gyStart = Math.floor(crate.y / TILE);
        const gxEnd = Math.floor((crate.x + crate.w - 1) / TILE);
        const gyEnd = Math.floor((crate.y + crate.h - 1) / TILE);

        const coveredElevs = new Set<number>();
        for (let gy = gyStart; gy <= gyEnd; gy++) {
          for (let gx = gxStart; gx <= gxEnd; gx++) {
            expect(map.waterTileKeys.has(`${gx},${gy}`)).toBe(false);
            coveredElevs.add(map.tileGrid[gy][gx].elev);
          }
        }
        // Every tile beneath a crate must share the exact same base terrain elevation
        expect(coveredElevs.size).toBe(1);

        // No crate should overlap a stair
        for (const st of map.stairs) {
          const overlaps =
            crate.x < st.x + st.w &&
            crate.x + crate.w > st.x &&
            crate.y < st.y + st.h &&
            crate.y + crate.h > st.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });
});

describe('Shotgun 5-round burst, 1xN tunnel traversal, and full map BFS reachability', () => {
  it('shotgun fires 5 pellets at once and drains magazine from 5/5 to 0/5 without auto-reloading until R or a fresh click', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    const shotgun = GUNS.find((g) => g.kind === 'shotgun')!;
    gunInHand(engine).def = shotgun;
    gunInHand(engine).ammoInMag = 5;
    engine.player.reserveAmmo = 30;
    engine.player.activeHand = 0;
    engine.beams = [];

    engine.setMouseDown(true);
    engine.setMouseDown(false);

    expect(engine.beams.length).toBe(5);
    expect(gunInHand(engine).ammoInMag).toBe(0);
    // Must NOT auto-reload when hitting 0/5
    expect(gunInHand(engine).reloadTimer).toBe(0);

    // Clicking again while 0/5 triggers reload
    engine.setMouseDown(true);
    engine.setMouseDown(false);
    expect(gunInHand(engine).reloadTimer).toBeGreaterThan(0);
  });

  it('allows a character to walk smoothly through a 1xN tunnel in East Port', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    // gx=7, gy=1..3 is a 1x3 tunnel bounded by container (3,1,4,2) on the left and (8,3,4,2) on the right
    engine.player.x = 7.5 * TILE;
    engine.player.y = 3.5 * TILE;
    engine.player.elevation = engine.getWalkableElevation(engine.player.x, engine.player.y);

    // Move straight north through the 1-tile wide tunnel up to gy=0
    engine.setKey('KeyW', true);
    for (let i = 0; i < 45; i++) {
      engine.update(1 / 60, 1280, 720);
    }
    engine.setKey('KeyW', false);

    expect(engine.player.y).toBeLessThan(1.5 * TILE);
  });

  it('guarantees all faction spawns are mutually reachable and all weapons/ammo/shields are reachable by elevation rules on all 8 maps', () => {
    const mapIds: MapId[] = [
      'tokyo_shrine',
      'european_castle',
      'desert_ruins',
      'industrial_warehouse',
      'western_railway',
      'bamboo_fortress',
      'stanley_island',
      'glacier_rift',
    ];

    for (const mapId of mapIds) {
      const { engine } = createTestEngine('royal', mapId, 10);
      const map = engine.map;
      const moveFn = (engine as unknown as {
        moveCharacterWithElevation: (
          cx: number,
          cy: number,
          ce: number,
          dx: number,
          dy: number,
          r: number
        ) => { x: number; y: number; elevation: number };
        canStandWithPadding: (x: number, y: number, curElev: number, hitRadius: number) => boolean;
      });

      const tileKey = (gx: number, gy: number) => `${gx},${gy}`;
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      // Build real-physics directed walkability graph once per map (4 substeps per cardinal tile step)
      const standable = new Set<string>();
      const elevMap = new Map<string, number>();
      for (let gy = 0; gy < map.rows; gy++) {
        for (let gx = 0; gx < map.cols; gx++) {
          const cx = (gx + 0.5) * TILE;
          const cy = (gy + 0.5) * TILE;
          const elev = engine.getWalkableElevation(cx, cy);
          if (moveFn.canStandWithPadding(cx, cy, elev, engine.player.radius)) {
            const k = tileKey(gx, gy);
            standable.add(k);
            elevMap.set(k, elev);
          }
        }
      }

      const adj = new Map<string, string[]>();
      for (const k of standable) {
        const [gxStr, gyStr] = k.split(',');
        const gx = Number(gxStr);
        const gy = Number(gyStr);
        const cx = (gx + 0.5) * TILE;
        const cy = (gy + 0.5) * TILE;
        const curElev = elevMap.get(k)!;
        const neighbors: string[] = [];

        for (const [ox, oy] of dirs) {
          const ngx = gx + ox;
          const ngy = gy + oy;
          const nk = tileKey(ngx, ngy);
          if (!standable.has(nk)) continue;

          let simX = cx;
          let simY = cy;
          let simE = curElev;
          const steps = 4;
          const stepDx = (ox * TILE) / steps;
          const stepDy = (oy * TILE) / steps;
          for (let s = 0; s < steps; s++) {
            const res = moveFn.moveCharacterWithElevation(simX, simY, simE, stepDx, stepDy, engine.player.radius);
            simX = res.x;
            simY = res.y;
            simE = res.elevation;
          }

          const targetX = (ngx + 0.5) * TILE;
          const targetY = (ngy + 0.5) * TILE;
          if (Math.hypot(simX - targetX, simY - targetY) < TILE * 0.3) {
            neighbors.push(nk);
          }
        }
        adj.set(k, neighbors);
      }

      const bfsFrom = (startKey: string): Set<string> => {
        const visited = new Set<string>([startKey]);
        const queue: string[] = [startKey];
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          for (const nxt of adj.get(cur) || []) {
            if (!visited.has(nxt)) {
              visited.add(nxt);
              queue.push(nxt);
            }
          }
        }
        return visited;
      };

      const allSpawns = [
        ...map.factionSpawns.royal,
        ...map.factionSpawns.shadow,
        ...map.factionSpawns.mercenary,
      ];

      // 1. Every faction spawn must be standable and mutually reachable from every other faction spawn
      for (const sp of allSpawns) {
        const spKey = tileKey(Math.floor(sp.x / TILE), Math.floor(sp.y / TILE));
        expect(standable.has(spKey), `${mapId}: spawn (${spKey}) is not standable`).toBe(true);
        const reachable = bfsFrom(spKey);

        for (const other of allSpawns) {
          const otherKey = tileKey(Math.floor(other.x / TILE), Math.floor(other.y / TILE));
          expect(reachable.has(otherKey), `${mapId}: spawn (${otherKey}) unreachable from (${spKey})`).toBe(true);
        }

        // 2. Every weapon spawn must sit on a standable tile reachable from every faction spawn
        for (const ws of map.weaponSpawns) {
          const wsKey = tileKey(Math.floor(ws.x / TILE), Math.floor(ws.y / TILE));
          expect(standable.has(wsKey), `${mapId}: weapon ${ws.weaponId} at (${wsKey}) unstandable`).toBe(true);
          expect(reachable.has(wsKey), `${mapId}: weapon ${ws.weaponId} at (${wsKey}) unreachable from (${spKey})`).toBe(true);
        }

        // 3. Every ammo & shield spawn must sit on a standable tile reachable from every faction spawn
        for (const as of map.ammoSpawns) {
          const asKey = tileKey(Math.floor(as.x / TILE), Math.floor(as.y / TILE));
          expect(standable.has(asKey), `${mapId}: ammo at (${asKey}) unstandable`).toBe(true);
          expect(reachable.has(asKey), `${mapId}: ammo at (${asKey}) unreachable from (${spKey})`).toBe(true);
        }
        for (const ss of map.shieldSpawns) {
          const ssKey = tileKey(Math.floor(ss.x / TILE), Math.floor(ss.y / TILE));
          expect(standable.has(ssKey), `${mapId}: shield at (${ssKey}) unstandable`).toBe(true);
          expect(reachable.has(ssKey), `${mapId}: shield at (${ssKey}) unreachable from (${spKey})`).toBe(true);
        }
      }
    }
  }, 15000);
});

describe('Enemy sight radius (8 tiles), hit-based target switching, and A* elevation navigation', () => {
  it('sets normal enemy sight radius to 8 tiles so targets >= 8.5 tiles away are not spotted while <= 7.8 tiles are spotted', () => {
    const { engine } = createTestEngine('royal', 'european_castle', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    enemy.archetype = 'trooper';
    enemy.weapons[0] = { type: 'gun', def: GUNS.find((g) => g.kind === 'pistol')!, ammoInMag: 6, reloadTimer: 0 };
    enemy.eagleEyeTimer = 0;
    enemy.x = 6.5 * TILE;
    enemy.y = 18.5 * TILE;
    enemy.elevation = 0;
    enemy.focusedTargetId = null;
    enemy.alertTimer = 0;

    // Move all other units far away and place player at 8.5 tiles away on open south lane
    for (const other of engine.enemies) {
      if (other !== enemy) {
        other.x = 26.5 * TILE;
        other.y = 1.5 * TILE;
      }
    }
    engine.player.x = 15.0 * TILE;
    engine.player.y = 18.5 * TILE;
    engine.player.elevation = 0;

    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(false);

    // Move player within 8-tile radius (7.7 tiles away) -> enemy spots player
    engine.player.x = 14.2 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
    expect(enemy.focusedTargetId).toBe('player');
  });

  it('switches enemy pursuit target to the attacker when damaged', () => {
    const { engine } = createTestEngine('royal', 'european_castle', 10);
    const targetEnemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    const mercAttacker = engine.enemies.find((e) => e.faction === 'mercenary')!;

    // Place targetEnemy out of LoS from player so ambush hit immediately switches aggro to player
    targetEnemy.x = 18.5 * TILE;
    targetEnemy.y = 18.5 * TILE;
    targetEnemy.focusedTargetId = mercAttacker.id;
    targetEnemy.hasLosToTarget = false;
    targetEnemy.shadowCloneTimer = 0;
    targetEnemy.royalShieldTimer = 0;
    targetEnemy.hp = 100;

    engine.player.x = 2.5 * TILE;
    engine.player.y = 18.5 * TILE;

    const damageEnemy = (engine as unknown as {
      damageEnemy: (
        enemy: typeof targetEnemy,
        dmg: number,
        isMelee: boolean,
        kx: number,
        ky: number,
        bull: boolean,
        noFF: boolean,
        attackerId: string,
        attackerFac: FactionId
      ) => void;
    }).damageEnemy.bind(engine);

    damageEnemy(targetEnemy, 5, false, 0, 0, false, false, 'player', 'royal');
    expect(targetEnemy.focusedTargetId).toBe('player');
    expect(targetEnemy.aggroLockTimer).toBeGreaterThan(0);

    // Even when targetEnemy currently has LoS on mercAttacker, repeated hits from player give a chance to switch aggro
    targetEnemy.focusedTargetId = mercAttacker.id;
    targetEnemy.hasLosToTarget = true;
    targetEnemy.hp = 100;
    let switched = false;
    for (let i = 0; i < 12; i++) {
      damageEnemy(targetEnemy, 2, false, 0, 0, false, false, 'player', 'royal');
      if (targetEnemy.focusedTargetId === 'player') {
        switched = true;
        break;
      }
    }
    expect(switched).toBe(true);
  });

  it('computes A* elevation-aware paths across Nile bridges and up 3-tier pyramids / 2.0 containers', () => {
    // 1. Egypt: east bank across bridge and up 3-tier pyramid (0 -> 0.5 -> 1 -> 1.5 -> 2 -> 2.5 -> 3.0)
    const { engine: egyptEngine } = createTestEngine('royal', 'desert_ruins', 10);
    const pyPath = egyptEngine.findPathAStar(26.5 * TILE, 10.5 * TILE, 8.5 * TILE, 10.5 * TILE);
    expect(pyPath.length).toBeGreaterThan(10);
    const pyEnd = pyPath[pyPath.length - 1];
    expect(egyptEngine.getWalkableElevation((pyEnd.gx + 0.5) * TILE, (pyEnd.gy + 0.5) * TILE)).toBe(3.0);

    for (let i = 1; i < pyPath.length; i++) {
      const a = pyPath[i - 1];
      const b = pyPath[i];
      expect(Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)).toBe(1);
      const ea = egyptEngine.getWalkableElevation((a.gx + 0.5) * TILE, (a.gy + 0.5) * TILE);
      const eb = egyptEngine.getWalkableElevation((b.gx + 0.5) * TILE, (b.gy + 0.5) * TILE);
      expect(Math.abs(ea - eb)).toBeLessThanOrEqual(0.5);
    }

    // 2. East Port: ground -> 1x1 stair (0.5) -> 1x1 small_crate (1.0) -> big_crate (1.5) -> container (2.0)
    const { engine: portEngine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const portPath = portEngine.findPathAStar(1.5 * TILE, 4.5 * TILE, 9.5 * TILE, 3.5 * TILE);
    expect(portPath.length).toBeGreaterThan(5);
    const portEnd = portPath[portPath.length - 1];
    expect(portEngine.getWalkableElevation((portEnd.gx + 0.5) * TILE, (portEnd.gy + 0.5) * TILE)).toBe(2.0);
    for (let i = 1; i < portPath.length; i++) {
      const a = portPath[i - 1];
      const b = portPath[i];
      expect(Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)).toBe(1);
      const ea = portEngine.getWalkableElevation((a.gx + 0.5) * TILE, (a.gy + 0.5) * TILE);
      const eb = portEngine.getWalkableElevation((b.gx + 0.5) * TILE, (b.gy + 0.5) * TILE);
      expect(Math.abs(ea - eb)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('Enemy pistol/knife spawn, fixed map weapon pool, no heal packs, AI weapon seeking & switching, and walk animation', () => {
  it('spawns all enemies with pistol and knife, excludes heal packs, and conserves total non-default weapons', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    for (const e of engine.enemies) {
      expect(e.weapons[0].def.kind).toBe('pistol');
      expect(e.weapons[1].def.kind).toBe('knife');
    }

    const countNonDefaultWeapons = () => {
      let total = engine.pickups.filter((pk) => pk.kind === 'gun' || pk.kind === 'melee').length;
      total += engine.player.weapons.filter(({ def }) => def.kind !== 'pistol' && def.kind !== 'knife').length;
      for (const e of engine.enemies) {
        for (const w of e.weapons) {
          if (w.def.kind !== 'pistol' && w.def.kind !== 'knife') total += 1;
        }
      }
      return total;
    };

    const initialPoolCount = countNonDefaultWeapons();
    expect(initialPoolCount).toBe(engine.map.weaponSpawns.length + engine.map.shieldSpawns.length);
    expect(engine.pickups.some((pk) => (pk.kind as string) === 'heal')).toBe(false);

    // 1. Player picks up a rifle while holding default pistol -> pistol MUST NOT drop onto ground
    const riflePickup = engine.pickups.find((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle')!;
    engine.player.x = riflePickup.x;
    engine.player.y = riflePickup.y;
    engine.tryPickup();

    expect(gunInHand(engine).def.kind).toBe('rifle');
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'pistol')).toBe(false);
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    // 2. Player picks up a claw while holding default knife -> knife MUST NOT drop onto ground
    engine.switchWeapon();
    const clawPickup = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'claw')!;
    engine.player.x = clawPickup.x;
    engine.player.y = clawPickup.y;
    engine.tryPickup();

    expect(meleeInHand(engine).def.kind).toBe('claw');
    expect(engine.pickups.some((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'knife')).toBe(false);
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    // 3. Player swaps rifle with shotgun -> old rifle DOES drop, pool stays constant
    engine.switchWeapon();
    const shotgunPickup = engine.pickups.find((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'shotgun')!;
    engine.player.x = shotgunPickup.x;
    engine.player.y = shotgunPickup.y;
    engine.tryPickup();

    expect(gunInHand(engine).def.kind).toBe('shotgun');
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle')).toBe(true);
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    // 4. Enemy picks up a weapon, then dies -> weapon returns to ground; default-equipped enemy drops nothing (zero heal packs)
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    const dropPickup = engine.pickups.find((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'sniper')!;
    enemy.x = dropPickup.x;
    enemy.y = dropPickup.y;
    enemy.elevation = engine.getWalkableElevation(enemy.x, enemy.y);
    enemy.focusedTargetId = null;
    enemy.alertTimer = 0;

    // Move player away so combat doesn't interfere during pickup tick
    engine.player.x = 2.5 * TILE;
    engine.player.y = 19.5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.weapons[0].def.kind).toBe('sniper');
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    const damageEnemy = (engine as unknown as {
      damageEnemy: (
        target: EnemyEntity,
        dmg: number,
        isMelee: boolean,
        kx: number,
        ky: number,
        bull: boolean,
        noFF: boolean,
        attackerId: string,
        attackerFac: FactionId
      ) => void;
    }).damageEnemy.bind(engine);

    enemy.shadowCloneTimer = 0;
    enemy.royalShieldTimer = 0;
    enemy.hp = 5;
    damageEnemy(enemy, 50, true, 0, 0, false, false, 'player', 'royal');

    // Sniper returns to ground, zero heal packs created, total pool preserved after replacement spawn
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'sniper')).toBe(true);
    expect(engine.pickups.some((pk) => (pk.kind as string) === 'heal')).toBe(false);
    engine.update(0.8, 1280, 720);
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    // 5. Out-of-combat enemy holding default pistol/knife seeks nearest upgrade weapon via A* and picks it up
    const { engine: seekEngine } = createTestEngine('royal', 'european_castle', 10);
    const seekEnemy = seekEngine.enemies.find((e) => e.faction === 'shadow')!;
    for (const other of seekEngine.enemies) {
      if (other !== seekEnemy) {
        other.x = 2.5 * TILE;
        other.y = 2.5 * TILE;
      }
    }
    seekEngine.player.x = 2.5 * TILE;
    seekEngine.player.y = 2.5 * TILE;
    seekEngine.pickups = seekEngine.pickups.filter((pk) => pk.kind === 'gun').slice(0, 1);
    const targetGun = seekEngine.pickups[0];
    targetGun.x = 18.5 * TILE;
    targetGun.y = 18.5 * TILE;

    seekEnemy.focusedTargetId = null;
    seekEnemy.alertTimer = 0;
    seekEnemy.qi = -999;
    seekEnemy.x = 21.5 * TILE;
    seekEnemy.y = 18.5 * TILE;
    seekEnemy.elevation = seekEngine.getWalkableElevation(seekEnemy.x, seekEnemy.y);

    const distBefore = Math.hypot(seekEnemy.x - targetGun.x, seekEnemy.y - targetGun.y);
    for (let i = 0; i < 20; i++) {
      seekEngine.update(1 / 60, 1280, 720);
    }
    const distAfter = Math.hypot(seekEnemy.x - targetGun.x, seekEnemy.y - targetGun.y);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it('switches enemy to ranged gun hand when target is hittable at distance, and to lightest hand when elevation blocks ranged shots', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    for (const other of engine.enemies) {
      if (other !== enemy) {
        other.x = 26.5 * TILE;
        other.y = 1.5 * TILE;
      }
    }

    // Scenario 1: Same elevation (0.0) on open bottom lane, 5 tiles apart -> enemy equips 'gun' hand
    enemy.weapons = [
      { type: 'gun', def: GUNS.find((g) => g.kind === 'sniper')!, ammoInMag: 1, reloadTimer: 0 },
      { type: 'melee', def: MELEES.find((m) => m.kind === 'claw')!, durability: 0 },
    ];
    enemy.x = 12.5 * TILE;
    enemy.y = 19.3 * TILE;
    enemy.elevation = 0;
    enemy.qi = -999;
    engine.player.x = 17.5 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;

    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
    expect(enemy.weapons[enemy.activeHand].type).toBe('gun');

    // Scenario 2: Player stands on top of a 2.0 shipping container at (10.5, 10.5), enemy is below at (14.5, 10.5) (elev 0.0)
    // Enemy sees player within 8 tiles, CANNOT hit upward across 2.0 elevation -> switches to lightest weapon ('melee' claw) to chase!
    enemy.x = 14.5 * TILE;
    enemy.y = 10.5 * TILE;
    enemy.elevation = 0;
    enemy.focusedTargetId = null;
    engine.player.x = 10.5 * TILE;
    engine.player.y = 10.5 * TILE;
    engine.player.elevation = 2.0;

    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
    expect(enemy.weapons[enemy.activeHand].type).toBe('melee');

    // Scenario 3: If enemy holds heavy greatsword (0.68) + pistol (0.94), lightest weapon is 'gun' (pistol)
    enemy.weapons = [
      { type: 'gun', def: GUNS.find((g) => g.kind === 'pistol')!, ammoInMag: 6, reloadTimer: 0 },
      { type: 'melee', def: MELEES.find((m) => m.kind === 'greatsword')!, durability: 0 },
    ];
    engine.update(0.05, 1280, 720);
    expect(enemy.weapons[enemy.activeHand].type).toBe('gun');
  });

  it('charges Qi and casts the equipped melee skill only while the enemy holds a melee weapon and swap finishes', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    engine.pickups = [];
    enemy.x = 12.5 * TILE;
    enemy.y = engine.player.y = 19.3 * TILE;
    enemy.elevation = engine.player.elevation = 0;
    enemy.weapons[1] = { type: 'melee', def: MELEES.find((m) => m.kind === 'claw')!, durability: 0 };
    enemy.qi = enemy.maxQi;
    enemy.attackCooldown = 99;

    engine.player.x = enemy.x + 5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
    expect(enemy.weapons[enemy.activeHand].type).toBe('gun');
    expect(enemy.chargingMelee).toBe(false);
    enemy.speed = 0;
    engine.update(AI_COMBAT[enemy.archetype].reactionSeconds, 1280, 720);

    // Move player into close melee range -> switches to claw (swap 0.16s) then begins draining Qi
    engine.player.x = enemy.x + 55;
    engine.update(0.05, 1280, 720);
    expect(enemy.weapons[enemy.activeHand].type).toBe('melee');
    expect(enemy.swapTimer).toBeGreaterThan(0);
    engine.update(0.2, 1280, 720);
    expect(enemy.chargingMelee).toBe(true);

    // Pull player back out to ranged distance mid-charge -> switches to gun & cancels melee charge
    engine.player.x = enemy.x + 5 * TILE;
    engine.update(0.2, 1280, 720);
    expect(enemy.weapons[enemy.activeHand].type).toBe('gun');
    expect(enemy.chargingMelee).toBe(false);
    expect(enemy.shadowCloneTimer).toBe(0);

    // Restore full Qi and hold close range through swap (0.16s) + Qi drain (0.58s) -> casts Shadow Clone
    enemy.qi = enemy.maxQi;
    engine.player.x = enemy.x + 55;
    engine.update(0.05, 1280, 720);
    for (let i = 0; i < 10; i++) engine.update(0.1, 1280, 720);
    expect(enemy.chargingMelee).toBe(false);
    expect(enemy.shadowCloneTimer).toBeGreaterThan(0);
  });

  it('gives each AI archetype a reaction window before firing or reacquiring a target', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    engine.pickups = [];
    enemy.archetype = 'sniper';
    enemy.speed = 0;
    enemy.x = 12.5 * TILE;
    enemy.y = engine.player.y = 19.3 * TILE;
    enemy.elevation = engine.player.elevation = 0;
    enemy.attackCooldown = 0;
    engine.player.x = enemy.x + 5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
    expect(enemy.reactionTimer).toBe(AI_COMBAT.sniper.reactionSeconds);
    engine.update(AI_COMBAT.phantom.reactionSeconds, 1280, 720);
    expect(enemy.gunfireTimer).toBe(0);
    engine.update(AI_COMBAT.sniper.reactionSeconds, 1280, 720);
    expect(enemy.gunfireTimer).toBeGreaterThan(0);

    engine.player.x = 26.5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(false);
    engine.player.x = enemy.x + 5 * TILE;
    engine.update(0.15, 1280, 720);
    expect(enemy.reactionTimer).toBe(AI_COMBAT.sniper.reactionSeconds);
    expect(enemy.gunfireTimer).toBe(0);
  });

  it('patrols nearby when AI reaches the last known target position', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const soldier = engine.enemies.find(e => e.faction === 'shadow')!;
    engine.enemies = [soldier];
    engine.pickups = [];
    soldier.x = 12.5 * TILE;
    soldier.y = 19.3 * TILE;
    soldier.elevation = 0;
    soldier.lastSeenTargetPos = { x: soldier.x, y: soldier.y };
    soldier.alertTimer = 5;
    engine.player.x = 26.5 * TILE;
    engine.player.y = 1.5 * TILE;
    const start = { x: soldier.x, y: soldier.y };

    for (let i = 0; i < 30; i++) engine.update(1 / 60, 1280, 720);

    expect(soldier.hasLosToTarget).toBe(false);
    expect(soldier.lastSeenTargetPos).toBeNull();
    expect(soldier.patrolTarget).not.toBeNull();
    expect(Math.hypot(soldier.x - start.x, soldier.y - start.y)).toBeGreaterThan(12);
    expect(soldier.moveIntensity).toBeGreaterThan(0);
  });

  it('plays surface footsteps on movement and releases the melee charging cue on switch', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    engine.enemies = [];
    engine.player.x = 12.5 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;
    const step = vi.spyOn(sfx, 'footstep');
    const charge = vi.spyOn(sfx, 'setMeleeCharge');
    try {
      engine.update(0.15, 1280, 720);
      expect(step).not.toHaveBeenCalled();
      engine.setKey('KeyD', true);
      for (let frame = 0; frame < 24; frame++) engine.update(1 / 60, 1280, 720);
      engine.setKey('KeyD', false);
      expect(step).toHaveBeenCalledWith('hard');

      engine.setMouseDown(true);
      engine.setMouseDown(false);
      expect(charge).not.toHaveBeenCalledWith(0);
      engine.switchWeapon();
      engine.setMouseDown(true);
      engine.update(0.15, 1280, 720);
      expect(charge).toHaveBeenCalledWith(0);
      expect(charge.mock.calls.some(([progress]) => progress !== null && progress > 0)).toBe(true);
      engine.switchWeapon();
      expect(charge).toHaveBeenLastCalledWith(null);
    } finally {
      step.mockRestore();
      charge.mockRestore();
    }
  });

  it('advances walkPhase and moveIntensity when player walks', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    expect(engine.player.walkPhase).toBe(0);
    expect(engine.player.moveIntensity).toBe(0);

    engine.setKey('KeyD', true);
    for (let i = 0; i < 10; i++) {
      engine.update(1 / 60, 1280, 720);
    }
    engine.setKey('KeyD', false);

    expect(engine.player.walkPhase).toBeGreaterThan(0.5);
    expect(engine.player.moveIntensity).toBeGreaterThan(0.5);
  });
});

describe('Esc drops current weapon without pausing, Q-only hand switching, and enemies match faction UI roster', () => {
  it('pressing Escape drops held non-default weapon onto map and reverts to pistol/knife without pausing', () => {
    const { engine, getHud } = createTestEngine('royal', 'tokyo_shrine', 10);

    // Pick up a rifle into gun slot and a claw into melee slot
    const riflePickup = engine.pickups.find((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle')!;
    engine.player.x = riflePickup.x;
    engine.player.y = riflePickup.y;
    engine.tryPickup();
    expect(gunInHand(engine).def.kind).toBe('rifle');

    // Digit1 / Digit2 must NOT switch hands; KeyQ toggles hands
    engine.setKey('Digit2', true);
    engine.setKey('Digit2', false);
    expect(engine.player.activeHand).toBe(0);
    expect('nearbyPickup' in (getHud() as unknown as Record<string, unknown>)).toBe(false);

    engine.setKey('KeyQ', true);
    engine.setKey('KeyQ', false);
    expect(engine.player.activeHand).toBe(1);
    const clawPickup = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'claw')!;
    engine.player.x = clawPickup.x;
    engine.player.y = clawPickup.y;
    engine.tryPickup();
    expect(meleeInHand(engine).def.kind).toBe('claw');

    // KeyQ switches back to first hand (gun), press Esc -> drops rifle back onto map, reverts to pistol, stays PLAYING
    engine.setKey('KeyQ', true);
    engine.setKey('KeyQ', false);
    expect(engine.player.activeHand).toBe(0);

    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.status).toBe('PLAYING');
    expect(gunInHand(engine).def.kind).toBe('pistol');
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle')).toBe(true);

    // Pressing Esc again while holding default pistol does not drop pistol or pause
    const countBefore = engine.pickups.length;
    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.status).toBe('PLAYING');
    expect(engine.pickups.length).toBe(countBefore);

    // KeyQ switches to second hand (melee), press Esc -> drops claw back onto map, reverts to knife
    engine.setKey('KeyQ', true);
    engine.setKey('KeyQ', false);
    expect(engine.player.activeHand).toBe(1);

    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.status).toBe('PLAYING');
    expect(meleeInHand(engine).def.kind).toBe('knife');
    expect(engine.pickups.some((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'claw')).toBe(true);
  });

  it('uses Space to replace the selected hand across weapon types and preserves the other hand', () => {
    const { engine, getHud } = createTestEngine();
    const pickUp = (kind: string) => {
      const pickup = engine.pickups.find((item) => item.gunDef?.kind === kind || item.meleeDef?.kind === kind)!;
      engine.player.x = pickup.x;
      engine.player.y = pickup.y;
      engine.setKey('Space', true);
      engine.setKey('Space', false);
    };

    pickUp('rifle');
    pickUp('claw');
    expect(engine.player.activeHand).toBe(0);
    expect(engine.player.weapons.map(({ def }) => def.kind)).toEqual(['claw', 'knife']);
    expect(engine.pickups.some((item) => item.gunDef?.kind === 'rifle')).toBe(true);

    engine.setKey('KeyQ', true);
    engine.setKey('KeyQ', false);
    expect(engine.player.activeHand).toBe(1);
    pickUp('rifle');
    const rifleInSecondHand = gunInHand(engine, 1);
    rifleInSecondHand.ammoInMag = 2;

    engine.setKey('KeyQ', true);
    engine.setKey('KeyQ', false);
    pickUp('shotgun');
    expect(engine.player.activeHand).toBe(0);
    expect(engine.player.weapons.map(({ def }) => def.kind)).toEqual(['shotgun', 'rifle']);
    expect(gunInHand(engine, 1).ammoInMag).toBe(2);
    expect(getHud()!.player.weapon.def.kind).toBe('shotgun');
    expect(getHud()!.player.offHandWeapon.def.kind).toBe('rifle');
    expect(engine.pickups.some((item) => item.meleeDef?.kind === 'claw')).toBe(true);

    engine.setKey('KeyQ', true);
    engine.setKey('KeyQ', false);
    expect(engine.player.activeHand).toBe(1);
    expect(getHud()!.player.weapon).toMatchObject({ type: 'gun', ammoInMag: 2 });
  });

  it('spawns all battlefield soldiers from their FACTION_CHARACTERS roster with matching name and characterSkin', () => {
    for (const fac of ['royal', 'shadow', 'mercenary'] as FactionId[]) {
      const { engine } = createTestEngine(fac, 'tokyo_shrine', 10);
      for (const e of engine.enemies) {
        const roster = FACTION_CHARACTERS[e.faction];
        const matched = roster.find((c) => c.id === e.characterSkin.id && c.name === e.name);
        expect(matched).toBeTruthy();
        expect(e.characterSkin.handColor).toBeTruthy();
      }
    }
  });
});

describe('Handheld tactical shield, death weapon drop/reset, Light Orb FF, Black Dragon bounce, 2.5D depth, and swap timer', () => {
  it('enforces handheld frontal-only shield blocking, durability transfer across drop/pickup, shove, shatter, and Qi repair', () => {
    const { engine, getHud } = createTestEngine('mercenary', 'tokyo_shrine', 10);
    const damagePlayer = (engine as unknown as {
      damagePlayer: (rawDmg: number, isMelee: boolean, attackerId?: string, ox?: number, oy?: number) => void;
    }).damagePlayer.bind(engine);

    // 1. Default spawn starts with knife and 0 shield -> frontal hit deals full HP damage
    expect(meleeInHand(engine).def.kind).toBe('knife');
    expect(meleeInHand(engine).durability).toBe(0);
    expect(getHud()!.player.shield).toBe(0);

    engine.player.invulnTimer = 0;
    const hpStart = engine.player.hp;
    damagePlayer(20, false, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpStart - 20);

    // 2. Map spawns physical 'melee' shield pickups (no old 'shield' pad kind)
    expect(engine.pickups.some((pk) => (pk.kind as string) === 'shield')).toBe(false);
    const shieldPickup = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'shield')!;
    expect(shieldPickup).toBeTruthy();
    expect(shieldPickup.durability).toBe(100);

    engine.player.activeHand = 1;
    engine.player.x = shieldPickup.x;
    engine.player.y = shieldPickup.y;
    engine.tryPickup();
    expect(meleeInHand(engine).def.kind).toBe('shield');
    expect(meleeInHand(engine).durability).toBe(100);

    // 3. Blocking only happens when the shield is actively held
    engine.player.activeHand = 0;
    engine.player.angle = 0;
    engine.player.invulnTimer = 0;
    const hpGun = engine.player.hp;
    damagePlayer(30, false, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 30);
    expect(meleeInHand(engine).durability).toBe(100);

    // Switch back to shield -> frontal bullet is absorbed by shield durability
    engine.player.activeHand = 1;
    engine.player.angle = 0;
    engine.player.invulnTimer = 0;
    damagePlayer(40, false, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 30);
    expect(meleeInHand(engine).durability).toBe(60);

    // 4. Side (90 deg) and rear (180 deg) attacks bypass frontal shield completely
    engine.player.invulnTimer = 0;
    damagePlayer(15, false, undefined, engine.player.x, engine.player.y + 120);
    expect(engine.player.hp).toBe(hpGun - 45);
    expect(meleeInHand(engine).durability).toBe(60);

    engine.player.invulnTimer = 0;
    damagePlayer(10, true, undefined, engine.player.x - 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 55);
    expect(meleeInHand(engine).durability).toBe(60);

    // Frontal melee attack halves HP damage and reduces shield durability
    engine.player.invulnTimer = 0;
    damagePlayer(20, true, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 65);
    expect(meleeInHand(engine).durability).toBe(50);

    // 5. Left-click normal melee with shield shoves & stuns target
    const enemy = engine.enemies[0];
    engine.player.x = 14.5 * TILE;
    engine.player.y = 18.5 * TILE;
    engine.player.elevation = 0;
    engine.player.angle = 0;
    enemy.x = engine.player.x + 42;
    enemy.y = engine.player.y;
    enemy.elevation = 0;
    enemy.royalShieldTimer = 0;
    enemy.shadowCloneTimer = 0;
    enemy.hp = 100;
    const exBefore = enemy.x;
    const hpBeforeBash = enemy.hp;
    engine.setMouseDown(true);
    engine.setMouseDown(false);
    expect(enemy.x).toBeGreaterThan(exBefore);
    expect(enemy.stunTimer).toBeGreaterThan(0);
    expect(enemy.hp).toBe(hpBeforeBash);

    // 6. Dropping shield (Esc) preserves exact durability (50), AI pickup/death or re-pickup preserves 50
    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(meleeInHand(engine).def.kind).toBe('knife');
    expect(meleeInHand(engine).durability).toBe(0);
    const droppedShield = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'shield' && pk.durability === 50)!;
    expect(droppedShield).toBeTruthy();

    // Enemy picks up dropped shield (50 durability) and then player picks it back after enemy drops/dies
    enemy.stunTimer = 0;
    enemy.weapons[1] = { type: 'melee', def: MELEES.find((m) => m.kind === 'knife')!, durability: 0 };
    enemy.x = droppedShield.x;
    enemy.y = droppedShield.y;
    engine.player.x = 2.5 * TILE;
    engine.player.y = 19.5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.weapons[1].def.kind).toBe('shield');
    expect(enemy.weapons[1].type === 'melee' && enemy.weapons[1].durability).toBe(50);

    enemy.hp = 1;
    if (enemy.weapons[1].type === 'melee') enemy.weapons[1].durability = 37;
    enemy.activeHand = 0;
    const damageEnemy = (engine as unknown as {
      damageEnemy: (t: EnemyEntity, d: number, m: boolean, kx: number, ky: number, b: boolean, nff: boolean, id: string, fac: FactionId) => void;
    }).damageEnemy.bind(engine);
    damageEnemy(enemy, 50, true, 0, 0, false, false, 'player', 'mercenary');
    const reDropped = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'shield' && pk.durability === 37)!;
    expect(reDropped).toBeTruthy();

    engine.player.x = reDropped.x;
    engine.player.y = reDropped.y;
    engine.tryPickup();
    expect(meleeInHand(engine).def.kind).toBe('shield');
    expect(meleeInHand(engine).durability).toBe(37);

    // 7. Shield Qi skill restores held shield durability to 100
    engine.player.activeHand = 1;
    engine.player.qi = engine.player.maxQi;
    engine.setMouseDown(true);
    engine.update(1.5, 1280, 720);
    expect(engine.player.chargeReady).toBe(true);
    engine.setMouseDown(false);
    expect(meleeInHand(engine).durability).toBe(100);

    // 8. Dropping to 0 durability shatters shield back to knife
    engine.player.angle = 0;
    engine.player.invulnTimer = 0;
    damagePlayer(150, false, undefined, engine.player.x + 120, engine.player.y);
    expect(meleeInHand(engine).durability).toBe(0);
    expect(meleeInHand(engine).def.kind).toBe('knife');
  });

  it('drops non-default weapons on player death and resets to pistol, knife, and 0 shield on respawn', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    for (const soldier of engine.enemies) soldier.stunTimer = 99;
    gunInHand(engine).def = GUNS.find((g) => g.kind === 'rifle')!;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'greatsword')!;
    meleeInHand(engine).durability = 0;
    engine.player.invulnTimer = 0;
    const deathX = engine.player.x;
    const deathY = engine.player.y;

    (engine as unknown as {
      damagePlayer: (rawDmg: number, isMelee: boolean) => void;
    }).damagePlayer(999, true);

    expect(engine.player.lives).toBe(2);
    engine.update(RESPAWN_DELAY_SECONDS, 1280, 720);
    expect(gunInHand(engine).def.kind).toBe('pistol');
    expect(meleeInHand(engine).def.kind).toBe('knife');
    expect(meleeInHand(engine).durability).toBe(0);
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle' && Math.hypot(pk.x - deathX, pk.y - deathY) < 40)).toBe(true);
    expect(engine.pickups.some((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'greatsword' && Math.hypot(pk.x - deathX, pk.y - deathY) < 40)).toBe(true);
  });

  it('fires yellow friendly-fire Light Orbs for Royal Greatsword and slow bouncing non-FF Black Dragon (head 20 / body 15) for Shadow Greatsword', () => {
    // 1. Royal Light Orbs are yellow and hurt teammates
    const { engine: rEng } = createTestEngine('royal', 'european_castle', 10);
    for (const soldier of rEng.enemies) {
      soldier.attackCooldown = 99;
      soldier.qi = -999;
    }
    const ally = rEng.enemies.find((e) => e.faction === 'royal')!;
    ally.stunTimer = 5;
    rEng.player.activeHand = 1;
    meleeInHand(rEng).def = MELEES.find((m) => m.kind === 'greatsword')!;
    rEng.player.x = 10 * TILE;
    rEng.player.y = 18.5 * TILE;
    rEng.player.elevation = 0;
    rEng.player.angle = 0;
    rEng.player.qi = rEng.player.maxQi;
    ally.x = 12 * TILE;
    ally.y = 18.5 * TILE;
    ally.elevation = 0;
    ally.hp = 100;
    rEng.setMouseDown(true);
    rEng.update(1.5, 1280, 720);
    expect(rEng.player.chargeReady).toBe(true);
    rEng.player.angle = 0;
    rEng.setMouseDown(false);

    expect(rEng.projectiles.length).toBe(5);
    expect(rEng.projectiles[0].color).toBe('#FACC15');
    expect(rEng.projectiles[0].noFriendlyFire).toBe(false);
    for (let i = 0; i < 15; i++) rEng.update(1 / 60, 1280, 720);
    expect(ally.hp).toBeLessThan(100);

    // 2. Shadow Black Dragon does NOT hurt allies, deals 20 head damage, and bounces off map walls/obstacles
    const { engine: sEng } = createTestEngine('shadow', 'tokyo_shrine', 10);
    for (const soldier of sEng.enemies) {
      soldier.attackCooldown = 99;
      soldier.qi = -999;
    }
    const sAlly = sEng.enemies.find((e) => e.faction === 'shadow')!;
    sEng.player.activeHand = 1;
    meleeInHand(sEng).def = MELEES.find((m) => m.kind === 'greatsword')!;
    sEng.player.x = 26 * TILE;
    sEng.player.y = 18.5 * TILE;
    sEng.player.elevation = 0;
    sEng.player.qi = sEng.player.maxQi;
    sAlly.x = 27.2 * TILE;
    sAlly.y = 18.5 * TILE;
    sAlly.elevation = 0;
    sAlly.hp = 100;
    sEng.setMouseDown(true);
    sEng.update(1.5, 1280, 720);
    expect(sEng.player.chargeReady).toBe(true);
    sEng.player.angle = 0; // Aim right into map east wall (~28*TILE) to force bounce
    sEng.setMouseDown(false);

    const dragon = sEng.projectiles.find((pr) => pr.isBlackDragon)!;
    expect(dragon).toBeTruthy();
    expect(dragon.noFriendlyFire).toBe(true);
    expect(dragon.headDamage).toBe(20);
    expect(dragon.bodyDamage).toBe(15);
    const initVx = dragon.vx;

    for (let i = 0; i < 35; i++) sEng.update(1 / 60, 1280, 720);
    expect(sAlly.hp).toBe(100); // Ally untouched
    expect(dragon.vx).toBeLessThan(0); // Bounced off right boundary wall
    expect(initVx).toBeGreaterThan(0);
  });

  it('penetrates 0.5 tiles into 1.5-elev big crates while stopping at the outer edge of >= 2.0 walls/containers', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const trace = (engine as unknown as {
      traceBulletSegment: (x1: number, y1: number, a: number, maxD: number, elev: number, emit?: boolean) => { x2: number; y2: number };
    }).traceBulletSegment.bind(engine);

    // Container (2.0) at (15, 6, 2, 4) -> left edge x = 15*TILE, open ground at (13.5*TILE, 7.5*TILE) (elev 0)
    const wallHit = trace(13.5 * TILE, 7.5 * TILE, 0, 1000, 0, false);
    expect(wallHit.x2).toBeLessThanOrEqual(15 * TILE);
    expect(wallHit.x2).toBeGreaterThanOrEqual(15 * TILE - 8);

    // Big crate (1.5) at (16, 16, 2, 2) -> left edge x = 16*TILE, open ground at (14.5*TILE, 16.5*TILE) (elev 0)
    const crateHit = trace(14.5 * TILE, 16.5 * TILE, 0, 1000, 0, false);
    expect(crateHit.x2).toBeGreaterThan(16 * TILE + TILE * 0.4);
    expect(crateHit.x2).toBeLessThanOrEqual(16 * TILE + TILE * 0.6);
  });

  it('scales weapon swap hand-rubbing duration by weapon weight (heavy slower, light faster)', () => {
    expect(getWeaponSwapDuration('greatsword')).toBeGreaterThan(getWeaponSwapDuration('rifle'));
    expect(getWeaponSwapDuration('rifle')).toBeGreaterThan(getWeaponSwapDuration('claw'));

    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'greatsword')!;
    engine.player.activeHand = 0;
    engine.switchWeapon();
    const gsSwap = engine.player.swapTimer;

    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'claw')!;
    engine.player.activeHand = 0;
    engine.switchWeapon();
    const clawSwap = engine.player.swapTimer;

    expect(gsSwap).toBeGreaterThan(clawSwap);
  });

  it('stops Vampire lifesteal and all other timed skill effects completely when timers expire', () => {
    // 1. Mercenary has ZERO lifesteal before Vampire is cast AND ZERO lifesteal after Vampire expires
    const { engine } = createTestEngine('mercenary', 'tokyo_shrine', 10);
    const enemy = engine.enemies[0];
    enemy.hp = 100;
    enemy.royalShieldTimer = 0;
    enemy.shadowCloneTimer = 0;
    engine.player.hp = 60;

    const damageEnemy = (engine as unknown as {
      damageEnemy: (
        target: (typeof engine.enemies)[number],
        baseDmg: number,
        isMelee: boolean,
        kx: number,
        ky: number,
        bullseye: boolean,
        noFF: boolean,
        attackerId: string,
        attackerFaction: 'royal' | 'shadow' | 'mercenary'
      ) => void;
    }).damageEnemy.bind(engine);

    expect(engine.player.vampireTimer).toBe(0);
    damageEnemy(enemy, 30, false, 0, 0, false, false, 'player', 'mercenary');
    expect(engine.player.hp).toBe(60); // No passive lifesteal!

    // Activate Vampire -> heals on hit
    engine.player.vampireTimer = 7.5;
    damageEnemy(enemy, 30, true, 0, 0, false, false, 'player', 'mercenary');
    expect(engine.player.hp).toBeGreaterThan(60);

    // Expire Vampire via update -> no longer heals on hit
    for (let i = 0; i < 8; i++) engine.update(1.0, 1280, 720);
    expect(engine.player.vampireTimer).toBe(0);
    const hpAfterExpire = 50;
    engine.player.hp = hpAfterExpire;
    enemy.hp = 100;
    damageEnemy(enemy, 30, true, 0, 0, false, false, 'player', 'mercenary');
    expect(engine.player.hp).toBe(hpAfterExpire);

    // 2. Shrink & Giant revert sizeScale and radius completely to 1.0 & baseRadius
    engine.player.shrinkTimer = 0.5;
    engine.update(0.1, 1280, 720);
    expect(engine.player.sizeScale).toBeCloseTo(0.62, 2);
    engine.update(1.0, 1280, 720);
    expect(engine.player.shrinkTimer).toBe(0);
    expect(engine.player.sizeScale).toBe(1.0);
    expect(engine.player.radius).toBe(engine.player.baseRadius);

    engine.player.giantTimer = 0.5;
    engine.update(0.1, 1280, 720);
    expect(engine.player.sizeScale).toBeCloseTo(1.32, 2);
    engine.update(1.0, 1280, 720);
    expect(engine.player.giantTimer).toBe(0);
    expect(engine.player.sizeScale).toBe(1.0);
    expect(engine.player.radius).toBe(engine.player.baseRadius);
  });

  it('non-shield Qi skills do not grant phantom shield durability when holding knife', () => {
    const { engine, getHud } = createTestEngine('mercenary', 'tokyo_shrine', 10);
    engine.player.activeHand = 1;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'knife')!;
    engine.player.qi = engine.player.maxQi;
    engine.setMouseDown(true);
    engine.update(1.5, 1280, 720);
    expect(engine.player.chargeReady).toBe(true);
    engine.setMouseDown(false);

    expect(meleeInHand(engine).durability).toBe(0);
    expect(getHud()!.player.activeTimedSkills.some((s) => s.id === 'vampire')).toBe(true);
  });
});

describe('Map redesigns, allied spawn proximity, and character title format', () => {
  it('places allied royal and shadow spawns nearby (<= 3.5 tiles apart) on all 8 maps', () => {
    const allMaps: MapId[] = [
      'tokyo_shrine',
      'european_castle',
      'desert_ruins',
      'industrial_warehouse',
      'western_railway',
      'bamboo_fortress',
      'stanley_island',
      'glacier_rift',
    ];
    for (const mapId of allMaps) {
      const map = createArenaMap(mapId);
      const r = map.factionSpawns.royal;
      const s = map.factionSpawns.shadow;
      expect(r.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(Math.hypot(r[0].x - r[1].x, r[0].y - r[1].y)).toBeLessThanOrEqual(3.5 * TILE);
      expect(Math.hypot(s[0].x - s[1].x, s[0].y - s[1].y)).toBeLessThanOrEqual(3.5 * TILE);
    }
  });

  it('removes personal name suffixes from all faction characters', () => {
    for (const faction of ['royal', 'shadow', 'mercenary'] as const) {
      for (const ch of FACTION_CHARACTERS[faction]) {
        expect(ch.name.includes('・')).toBe(false);
        expect(ch.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives bamboo_fortress lush green terrain hills (0 crates, 0 water, 0 bridges, 0 houses) and LoS-blocking bamboo', () => {
    const { engine } = createTestEngine('royal', 'bamboo_fortress', 10);
    const map = engine.map;
    expect(map.biome).toBe('bamboo_outdoor');
    expect(map.waterTiles.length).toBe(0);
    expect(map.bridges.length).toBe(0);
    expect(map.obstacles.some((o) => o.kind === 'crate')).toBe(false);
    expect(map.obstacles.some((o) => o.style === 'house')).toBe(false);
    expect(map.tileGrid.flat().some((t) => t.style === 'hill' && t.elev === 2.0)).toBe(true);
    const bamboos = map.obstacles.filter((o) => o.style === 'bamboo');
    expect(bamboos.length).toBeGreaterThanOrEqual(20);
    const sample = bamboos[0];
    expect(sample.kind).toBe('wall');

    const hasLoS = (engine as unknown as {
      hasLineOfSight: (ax: number, ay: number, aElev: number, bx: number, by: number, bElev: number, maxRange: number) => boolean;
    }).hasLineOfSight.bind(engine);

    const cx = sample.x + sample.w / 2;
    const cy = sample.y + sample.h / 2;
    expect(hasLoS(cx - 1.5 * TILE, cy, 0, cx + 1.5 * TILE, cy, 0, 8 * TILE)).toBe(false);
  });

  it('builds western_railway without grass platforms or hills, with rail tracks, train cars, two-room building & small crates; and stanley_island as 34x44 vertical zero-crate breached island', () => {
    const railway = createArenaMap('western_railway');
    expect(railway.railTracks.length).toBeGreaterThan(20);
    expect(railway.tileGrid.flat().some((t) => t.style === 'hill' || t.style === 'wooden_plank' || t.elev > 0)).toBe(false);
    const trains = railway.obstacles.filter((o) => o.style === 'train_car');
    expect(trains.length).toBeGreaterThanOrEqual(3);
    expect(trains.some((t) => t.elevation === 2)).toBe(true);
    expect(railway.obstacles.filter((o) => o.kind === 'crate' && o.style === 'small_crate').length).toBeGreaterThanOrEqual(4);

    const stanley = createArenaMap('stanley_island');
    expect(stanley.cols).toBe(34);
    expect(stanley.rows).toBe(44);
    expect(stanley.rows).toBeGreaterThan(stanley.cols);
    expect(stanley.obstacles.some((o) => o.kind === 'crate')).toBe(false);
    expect(stanley.trees.length).toBeGreaterThanOrEqual(15);
    expect(stanley.waterTileKeys.has('0,0')).toBe(true);
    expect(stanley.waterTileKeys.has('33,43')).toBe(true);
    expect(stanley.waterTileKeys.has('16,35')).toBe(true); // South breach
    expect(stanley.waterTileKeys.has('17,21')).toBe(false); // Central islet
    expect(stanley.bridges.length).toBe(2);
  });
});

describe('Charge movement speed, heavy weapon balance, 1x1 non-adjacent hill stairs, Eagle Eye cursor lookahead, and 8-way Black Dragon Wave', () => {
  it('maintains full movement speed while charging Qi and makes heavy weapons distinctly slower than light weapons', () => {
    const { engine } = createTestEngine('royal', 'european_castle', 10);
    engine.player.x = 10 * TILE;
    engine.player.y = 18.5 * TILE;
    engine.player.elevation = 0;
    engine.player.activeHand = 1;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'knife')!;
    engine.player.qi = engine.player.maxQi;

    // Measure distance moved walking right without charging
    const startXNormal = engine.player.x;
    engine.setKey('KeyD', true);
    for (let i = 0; i < 6; i++) engine.update(1 / 60, 1280, 720);
    engine.setKey('KeyD', false);
    const normalDist = engine.player.x - startXNormal;

    // Reset position and walk right while holding left-click charging melee Qi
    engine.player.x = 10 * TILE;
    engine.player.qi = engine.player.maxQi;
    engine.setMouseDown(true);
    expect(engine.player.chargingMelee).toBe(true);
    engine.setKey('KeyD', true);
    for (let i = 0; i < 6; i++) engine.update(1 / 60, 1280, 720);
    engine.setKey('KeyD', false);
    engine.setMouseDown(false);
    const chargeDist = engine.player.x - 10 * TILE;

    expect(chargeDist).toBeCloseTo(normalDist, 4);

    // Check heavy weapons move slower than light weapons
    const claw = MELEES.find((m) => m.kind === 'claw')!;
    const knife = MELEES.find((m) => m.kind === 'knife')!;
    const greatsword = MELEES.find((m) => m.kind === 'greatsword')!;
    const shield = MELEES.find((m) => m.kind === 'shield')!;
    const pistol = GUNS.find((g) => g.kind === 'pistol')!;
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    const shotgun = GUNS.find((g) => g.kind === 'shotgun')!;
    const sniper = GUNS.find((g) => g.kind === 'sniper')!;

    expect(claw.moveSpeedMult).toBeGreaterThan(knife.moveSpeedMult);
    expect(pistol.moveSpeedMult).toBeGreaterThan(rifle.moveSpeedMult);
    expect(rifle.moveSpeedMult).toBeGreaterThan(shotgun.moveSpeedMult);
    expect(shotgun.moveSpeedMult).toBeGreaterThan(sniper.moveSpeedMult);
    expect(knife.moveSpeedMult).toBeGreaterThan(shield.moveSpeedMult);
    expect(shield.moveSpeedMult).toBeGreaterThan(greatsword.moveSpeedMult);
  });

  it('uses 1x1 hill stairs with zero 0.5/1.5 adjacency across bamboo_fortress, tokyo_shrine, and stanley_island, plus 4 bamboo stalk layouts', () => {
    for (const mapId of ['bamboo_fortress', 'tokyo_shrine', 'stanley_island'] as MapId[]) {
      const map = createArenaMap(mapId);
      const hillStairs = map.stairs.filter((s) => s.style === 'hill');
      expect(hillStairs.length).toBeGreaterThan(0);

      for (const st of hillStairs) {
        expect(st.w, `${mapId} hill stair width`).toBe(TILE);
        expect(st.h, `${mapId} hill stair height`).toBe(TILE);
      }

      const lowHills = hillStairs.filter((s) => Math.abs(s.elevation - 0.5) < 0.01);
      const highHills = hillStairs.filter((s) => Math.abs(s.elevation - 1.5) < 0.01);

      for (const lo of lowHills) {
        const lgx = Math.round(lo.x / TILE);
        const lgy = Math.round(lo.y / TILE);
        for (const hi of highHills) {
          const hgx = Math.round(hi.x / TILE);
          const hgy = Math.round(hi.y / TILE);
          const cheb = Math.max(Math.abs(lgx - hgx), Math.abs(lgy - hgy));
          expect(cheb, `${mapId}: 0.5 stair (${lgx},${lgy}) touches 1.5 stair (${hgx},${hgy})`).toBeGreaterThanOrEqual(2);
        }
      }
    }

    // Verify bamboo_fortress distributes all 4 3-stalk layouts (2T1B, 1T2B, 1L2R, 2L1R)
    const bambooMap = createArenaMap('bamboo_fortress');
    const layouts = new Set<number>();
    for (const o of bambooMap.obstacles) {
      if (o.style === 'bamboo') {
        const gx = Math.round(o.x / TILE);
        const gy = Math.round(o.y / TILE);
        layouts.add((((gx * 3 + gy * 7) % 4) + 4) % 4);
      }
    }
    expect(layouts.size).toBe(4);
  });

  it('keeps camera zoom fixed and pans toward cursor during Eagle Eye', () => {
    const { engine } = createTestEngine('shadow', 'european_castle', 10);
    const getCam = () => (engine as unknown as { camera: { x: number; y: number; zoom: number } }).camera;
    const expectedBaseZoom = (1280 / (19 * TILE) + 720 / (15 * TILE)) / 2;

    engine.enemies = [];
    engine.player.x = 15 * TILE;
    engine.player.y = 10 * TILE;
    engine.setMousePos(640, 360);
    for (let i = 0; i < 120; i++) engine.update(1 / 60, 1280, 720);
    expect(getCam().zoom).toBeCloseTo(expectedBaseZoom, 3);

    // Activate Eagle Eye and move cursor to far right -> zoom stays locked at baseZoom while camera shifts right
    engine.player.eagleEyeTimer = 8.0;
    engine.setMousePos(1200, 360);
    for (let i = 0; i < 60; i++) engine.update(1 / 60, 1280, 720);

    expect(getCam().zoom).toBeCloseTo(expectedBaseZoom, 3);
    expect(getCam().x).toBeGreaterThan(engine.player.x + 80);

    // Move cursor to far left -> camera shifts forward left ahead of player
    engine.setMousePos(80, 360);
    for (let i = 0; i < 60; i++) engine.update(1 / 60, 1280, 720);
    expect(getCam().zoom).toBeCloseTo(expectedBaseZoom, 3);
    expect(getCam().x).toBeLessThan(engine.player.x - 80);
  });

  it('restricts Black Dragon Wave launch velocity strictly to the 8 cardinal/diagonal directions', () => {
    const allowedAnglesDeg = [0, 45, 90, 135, 180, 225, 270, 315];

    // Unit-check snap helper on intermediate off-axis angles
    for (const deg of [12, 33, 60, 110, 162, 200, 248, 299, 349]) {
      const snapped = snapToEightDirections((deg * Math.PI) / 180);
      const outDeg = ((Math.round((Math.atan2(snapped.dy, snapped.dx) * 180) / Math.PI) % 360) + 360) % 360;
      expect(allowedAnglesDeg.includes(outDeg)).toBe(true);
    }

    // End-to-end player Black Dragon Wave trigger at an arbitrary 20-degree aim snaps to 0 degrees (dx=1, dy=0)
    const { engine } = createTestEngine('shadow', 'european_castle', 10);
    engine.player.activeHand = 1;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'greatsword')!;
    engine.player.x = 12 * TILE;
    engine.player.y = 18.5 * TILE;
    engine.player.elevation = 0;
    engine.player.qi = engine.player.maxQi;

    engine.setMouseDown(true);
    engine.update(1.5, 1280, 720);
    expect(engine.player.chargeReady).toBe(true);
    engine.player.angle = (20 * Math.PI) / 180;
    engine.setMouseDown(false);

    const dragon = engine.projectiles.find((pr) => pr.isBlackDragon)!;
    expect(dragon).toBeTruthy();
    expect(dragon.vx).toBeCloseTo(340, 5);
    expect(dragon.vy).toBeCloseTo(0, 5);
  });
});

describe('Architectural parity: 100 HP, zero passives, independent player respawn, Royal AI player flashbang, AI infinite reload & rifle auto-fire bloom', () => {
  it('starts every faction player with 100 HP, zero passive armor/speed buffs, and preserves factionRemaining on respawn', () => {
    const moveResults: number[] = [];
    for (const fac of ['royal', 'shadow', 'mercenary'] as FactionId[]) {
      const { engine } = createTestEngine(fac, 'industrial_warehouse', 10);
      expect(engine.player.maxHp).toBe(100);
      expect(engine.player.hp).toBe(100);

      // Verify zero passive armor (Royal takes full 20 damage)
      engine.enemies = [];
      engine.player.invulnTimer = 0;
      (engine as unknown as {
        damagePlayer: (rawDmg: number, isMelee: boolean, attackerId?: string, ox?: number, oy?: number) => void;
      }).damagePlayer(20, false, undefined, engine.player.x + 100, engine.player.y);
      expect(engine.player.hp).toBe(80);

      // Verify identical base walking speed across all 3 factions
      engine.player.x = 12 * TILE;
      engine.player.y = 19.3 * TILE;
      engine.player.elevation = 0;
      engine.setKey('KeyD', true);
      for (let i = 0; i < 10; i++) engine.update(1 / 60, 1280, 720);
      engine.setKey('KeyD', false);
      moveResults.push(engine.player.x - 12 * TILE);
    }
    expect(moveResults[0]).toBeCloseTo(moveResults[1], 4);
    expect(moveResults[1]).toBeCloseTo(moveResults[2], 4);

    // Verify player respawn does NOT deduct deploymentQueue / factionRemaining
    const { engine, getHud } = createTestEngine('royal', 'tokyo_shrine', 10);
    engine.enemies = engine.enemies.filter((e) => e.faction === 'royal');
    for (const ally of engine.enemies) ally.stunTimer = 99;
    expect(getHud()!.factionRemaining.royal).toBe(10);

    engine.player.invulnTimer = 0;
    (engine as unknown as { damagePlayer: (rawDmg: number, isMelee: boolean) => void }).damagePlayer(999, false);
    expect(engine.status).toBe('RESPAWNING');
    expect(engine.player.lives).toBe(2);
    engine.update(RESPAWN_DELAY_SECONDS, 1280, 720);
    expect(engine.status).toBe('PLAYING');
    expect(getHud()!.factionRemaining.royal).toBe(10);
  });

  it('blinds hostile player with a decaying flash timer when Royal AI casts Claw skill', () => {
    const { engine } = createTestEngine('shadow', 'industrial_warehouse', 10);
    const royalEnemy = engine.enemies.find((e) => e.faction === 'royal')!;
    engine.enemies = [royalEnemy];
    engine.pickups = [];

    royalEnemy.weapons[1] = { type: 'melee', def: MELEES.find((m) => m.kind === 'claw')!, durability: 0 };
    royalEnemy.activeHand = 1;
    royalEnemy.qi = royalEnemy.maxQi;
    royalEnemy.attackCooldown = 99;
    royalEnemy.speed = 0;
    royalEnemy.x = 12 * TILE;
    royalEnemy.y = engine.player.y = 19.3 * TILE;
    royalEnemy.elevation = engine.player.elevation = 0;
    engine.player.x = 13 * TILE;
    engine.player.invulnTimer = 99;

    for (let i = 0; i < 16; i++) engine.update(0.1, 1280, 720);
    expect(engine.player.blindDuration).toBeGreaterThan(0);
    expect(engine.player.blindTimer).toBeGreaterThan(0);

    // Flashbang fades smoothly to 0 over time
    engine.update(1.2, 1280, 720);
    expect(engine.player.blindTimer).toBe(0);
    expect(engine.player.blindDuration).toBe(0);
  });

  it('auto-reloads exhausted AI gun magazines from infinite reserve without pickup pads', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    engine.pickups = [];
    enemy.weapons[0] = { type: 'gun', def: GUNS.find((g) => g.kind === 'sniper')!, ammoInMag: 1, reloadTimer: 0 };
    enemy.activeHand = 0;
    enemy.qi = -999;
    enemy.speed = 0;
    enemy.attackCooldown = 0;
    enemy.x = 10 * TILE;
    enemy.y = engine.player.y = 19.3 * TILE;
    enemy.elevation = engine.player.elevation = 0;
    engine.player.x = 15 * TILE;
    engine.player.invulnTimer = 99;

    // Wait past reaction window so AI fires 1 sniper shot -> magazine drops to 0 and reload starts
    for (let i = 0; i < 10; i++) engine.update(0.1, 1280, 720);
    const sniperSlot = enemy.weapons[0];
    expect(sniperSlot.type === 'gun' && sniperSlot.ammoInMag).toBe(0);
    expect(sniperSlot.type === 'gun' && sniperSlot.reloadTimer).toBeGreaterThan(0);

    // Move player out of LoS so we observe the completed reload cleanly before next shot
    engine.player.x = 26.5 * TILE;
    engine.player.y = 1.5 * TILE;
    for (let i = 0; i < 23; i++) engine.update(0.1, 1280, 720);
    expect(sniperSlot.type === 'gun' && sniperSlot.reloadTimer).toBe(0);
    expect(sniperSlot.type === 'gun' && sniperSlot.ammoInMag).toBe(1);
  });

  it('rapidly expands rifle crosshair radius on auto-fire so bursts disperse distinctly wider than tap shots', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    engine.enemies = [];
    engine.player.x = 10 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;
    const camState = (engine as unknown as { camera: { x: number; y: number; zoom: number } }).camera;
    camState.x = engine.player.x;
    camState.y = engine.player.y;
    camState.zoom = 1;
    engine.player.angle = 0;
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    gunInHand(engine).def = rifle;
    gunInHand(engine).ammoInMag = rifle.magSize;
    engine.setMousePos(1200, 360);
    (engine as unknown as { resetGunFeedback: () => void }).resetGunFeedback();

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      engine.setMouseDown(true);
      const firstBeam = engine.beams[0];
      const firstDeviation = Math.abs(Math.atan2(firstBeam.y2 - firstBeam.y1, firstBeam.x2 - firstBeam.x1) - engine.player.angle);

      // Hold mouse down across 12 x 0.04s frames (0.48s -> ~4 burst shots, dt < 0.085s beam life)
      engine.beams = [];
      for (let i = 0; i < 12; i++) engine.update(0.04, 1280, 720);
      engine.setMouseDown(false);

      const lastBeam = engine.beams[engine.beams.length - 1];
      const burstDeviation = Math.abs(Math.atan2(lastBeam.y2 - lastBeam.y1, lastBeam.x2 - lastBeam.x1) - engine.player.angle);
      expect(burstDeviation).toBeGreaterThan(firstDeviation * 2.5);
    } finally {
      random.mockRestore();
    }
  });
});

describe('Rifle 1.1x pistol baseline, map & layer updates, wall height 10, zero terrain buffs, dragon bounce variation, and 0-damage shield', () => {
  it('sets rested rifle crosshair spread to exact 1.1x pistol spread, blooms on cursor movement, and shrinks smoothly when still', () => {
    const pistol = GUNS.find((g) => g.kind === 'pistol')!;
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    expect(rifle.baseCrosshair / pistol.baseCrosshair).toBeCloseTo(1.1, 5);

    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    engine.enemies = [];
    engine.player.x = 12 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;
    const camState = (engine as unknown as { camera: { x: number; y: number; zoom: number } }).camera;
    camState.x = engine.player.x;
    camState.y = engine.player.y;
    camState.zoom = 1;
    const getSpread = (engine as unknown as { getPlayerGunSpread: (gun: typeof pistol) => number }).getPlayerGunSpread.bind(engine);

    for (const [mx, my] of [
      [700, 360], // Near (~60px)
      [1060, 360], // Far (~420px)
    ]) {
      engine.setMousePos(mx, my);
      (engine as unknown as { resetGunFeedback: () => void }).resetGunFeedback();
      const pSpread = getSpread(pistol);
      const rSpread = getSpread(rifle);
      expect(rSpread / pSpread).toBeCloseTo(1.1, 5);
    }

    // Moving cursor rapidly while holding rifle blooms crosshair, then decays back to rest when still
    engine.player.activeHand = 0;
    gunInHand(engine).def = rifle;
    (engine as unknown as { resetGunFeedback: () => void }).resetGunFeedback();
    const restedRifleSpread = getSpread(rifle);

    engine.setMousePos(800, 360);
    engine.setMousePos(1060, 360);
    const movedRifleSpread = getSpread(rifle);
    expect(movedRifleSpread).toBeGreaterThan(restedRifleSpread);
    expect(movedRifleSpread).toBeLessThanOrEqual((rifle.maxCrosshair * 1.75) / 260 + 0.001);

    for (let i = 0; i < 60; i++) engine.update(0.05, 1280, 720);
    expect(getSpread(rifle)).toBeCloseTo(restedRifleSpread, 5);
  });

  it('validates bamboo_fortress hill connection & hill bamboo, tokyo_shrine grass perimeter, desert_ruins crate/wall tweaks, and elevation 10 walls', () => {
    const bamboo = createArenaMap('bamboo_fortress');
    for (let gy = 6; gy <= 23; gy++) {
      const rowHasCentralHill = [14, 15, 16, 17, 18].some((gx) => bamboo.tileGrid[gy][gx].elev >= 1.0);
      expect(rowHasCentralHill, `bamboo_fortress gy=${gy} central hill link`).toBe(true);
    }
    const hillBamboos = bamboo.obstacles.filter((o) => {
      if (o.style !== 'bamboo') return false;
      const gx = Math.round(o.x / TILE);
      const gy = Math.round(o.y / TILE);
      return bamboo.tileGrid[gy][gx].elev >= 1.0;
    });
    expect(hillBamboos.length).toBeGreaterThanOrEqual(8);

    const shrine = createArenaMap('tokyo_shrine');
    expect(shrine.tileGrid[1][1].style).toBe('grass_ground');
    expect(shrine.tileGrid[10][10].style).toBe('default');
    expect(shrine.tileGrid[1][14].style).toBe('default');

    const desert = createArenaMap('desert_ruins');
    expect(desert.obstacles.some((o) => o.kind === 'wall' && o.style === 'stone_wall_tan' && Math.round(o.x / TILE) === 25 && Math.round(o.y / TILE) === 2)).toBe(true);
    expect(desert.obstacles.some((o) => o.kind === 'wall' && o.style === 'stone_wall_tan' && Math.round(o.x / TILE) === 25 && Math.round(o.y / TILE) === 5)).toBe(true);
    expect(desert.obstacles.some((o) => o.kind === 'crate' && o.style === 'small_crate' && Math.round(o.x / TILE) === 25 && Math.round(o.y / TILE) === 4 && o.elevation === 1.0)).toBe(true);
    expect(desert.obstacles.some((o) => o.kind === 'crate' && o.w === 2 * TILE && Math.round(o.x / TILE) === 16 && Math.round(o.y / TILE) === 14)).toBe(true);

    const allMaps: MapId[] = [
      'tokyo_shrine',
      'european_castle',
      'desert_ruins',
      'industrial_warehouse',
      'western_railway',
      'bamboo_fortress',
      'stanley_island',
      'glacier_rift',
    ];
    for (const mapId of allMaps) {
      const m = createArenaMap(mapId);
      for (const obs of m.obstacles) {
        if (obs.kind === 'wall' && obs.style !== 'container') {
          expect(obs.elevation, `${mapId} wall ${obs.style} should have elevation 10`).toBe(10);
        }
      }
    }
  });

  it('grants zero high-ground damage buff when shooting from elevated terrain', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    enemy.stunTimer = 99;
    enemy.royalShieldTimer = 0;
    enemy.shadowCloneTimer = 0;

    const pistol = GUNS.find((g) => g.kind === 'pistol')!;
    engine.player.activeHand = 0;
    gunInHand(engine).def = pistol;

    // Shoot from elevated tile (1.0) down to ground enemy (0)
    engine.player.x = 5 * TILE;
    engine.player.y = 8 * TILE;
    engine.player.elevation = 1.0;
    enemy.x = 7.5 * TILE;
    enemy.y = 8 * TILE;
    enemy.elevation = 0;
    enemy.hp = 100;
    engine.player.angle = 0;

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      gunInHand(engine).ammoInMag = pistol.magSize;
      engine.setMouseDown(true);
      engine.setMouseDown(false);
    } finally {
      random.mockRestore();
    }

    expect(enemy.hp).toBe(100 - pistol.damage);
  });

  it('varies Black Dragon Wave wall bounce angle into +45deg, 0deg, and -45deg (1/3 each)', () => {
    const bounceVelocities: { vx: number; vy: number }[] = [];

    for (const roll of [0.1, 0.5, 0.9]) {
      const { engine } = createTestEngine('shadow', 'tokyo_shrine', 10);
      engine.enemies = [];
      engine.player.activeHand = 1;
      meleeInHand(engine).def = MELEES.find((m) => m.kind === 'greatsword')!;
      engine.player.x = 28.4 * TILE;
      engine.player.y = 18.5 * TILE;
      engine.player.elevation = 0;
      engine.player.qi = engine.player.maxQi;

      engine.setMouseDown(true);
      engine.update(1.5, 1280, 720);
      engine.player.angle = 0;
      engine.setMouseDown(false);

      const dragon = engine.projectiles.find((pr) => pr.isBlackDragon)!;
      expect(dragon).toBeTruthy();
      const initialBounces = dragon.bouncesLeft ?? 5;

      const random = vi.spyOn(Math, 'random').mockReturnValue(roll);
      try {
        for (let i = 0; i < 30 && (dragon.bouncesLeft ?? 0) === initialBounces; i++) {
          engine.update(1 / 60, 1280, 720);
        }
      } finally {
        random.mockRestore();
      }
      expect(dragon.bouncesLeft).toBe(initialBounces - 1);
      bounceVelocities.push({ vx: dragon.vx, vy: dragon.vy });
    }

    // roll 0.1 -> reflected PI + PI/4 (-240.4, -240.4)
    expect(bounceVelocities[0].vx).toBeLessThan(0);
    expect(bounceVelocities[0].vy).toBeLessThan(-150);
    // roll 0.5 -> pure reflection PI (-340, ~0)
    expect(bounceVelocities[1].vx).toBeLessThan(-300);
    expect(Math.abs(bounceVelocities[1].vy)).toBeLessThan(1);
    // roll 0.9 -> reflected PI - PI/4 (-240.4, +240.4)
    expect(bounceVelocities[2].vx).toBeLessThan(0);
    expect(bounceVelocities[2].vy).toBeGreaterThan(150);
  });

  it('deals strictly 0 HP damage on Shield left-click bash and Qi shockwave for both Player and AI', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    enemy.stunTimer = 99;
    enemy.royalShieldTimer = 0;
    enemy.shadowCloneTimer = 0;
    enemy.hp = 100;

    // Give enemy a frontal shield too -> 0 dmg bash must NOT consume enemy shield durability
    enemy.weapons[1] = { type: 'melee', def: MELEES.find((m) => m.kind === 'shield')!, durability: 80 };
    enemy.activeHand = 1;
    enemy.angle = Math.PI;

    engine.player.activeHand = 1;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'shield')!;
    meleeInHand(engine).durability = 35;
    engine.player.x = 12 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;
    engine.player.angle = 0;
    enemy.x = engine.player.x + 42;
    enemy.y = engine.player.y;
    enemy.elevation = 0;

    // 1. Player Qi shockwave restores durability to 100, pushes/stuns enemy, deals 0 HP damage
    engine.player.qi = engine.player.maxQi;
    engine.setMouseDown(true);
    engine.update(1.5, 1280, 720);
    expect(engine.player.chargeReady).toBe(true);
    engine.setMouseDown(false);
    expect(meleeInHand(engine).durability).toBe(100);
    expect(enemy.hp).toBe(100);
    expect(enemy.stunTimer).toBeGreaterThan(0);
    expect(enemy.x).toBeGreaterThan(engine.player.x + 45);
    expect(enemy.weapons[1].type === 'melee' && enemy.weapons[1].durability).toBe(80);

    // 2. AI shield shockwave and AI shield bash push/stun player while dealing strictly 0 HP damage
    (engine as unknown as { deploymentQueue: Record<FactionId, number> }).deploymentQueue = {
      royal: 0,
      shadow: 0,
      mercenary: 0,
    };
    enemy.weapons[0] = { type: 'gun', def: GUNS[0], ammoInMag: 0, reloadTimer: 99 };
    enemy.stunTimer = 0;
    enemy.speed = 0;
    enemy.attackCooldown = 0;
    enemy.qi = enemy.maxQi;
    enemy.weapons[1].durability = 40;
    enemy.x = engine.player.x + 44;
    enemy.y = engine.player.y;
    engine.player.activeHand = 0; // Player holding pistol -> no shield protection
    engine.player.hp = 100;
    engine.player.invulnTimer = 0;

    for (let i = 0; i < 16; i++) engine.update(0.1, 1280, 720);
    expect(engine.player.hp).toBe(100);
    expect(enemy.weapons[1].type === 'melee' && enemy.weapons[1].durability).toBe(100);
  });
});

describe('Solid height-10 trees, zero bush vision penalty, continuous rifle shrink, semi-auto pistol, AI yellow ! popup, and direct shield numbers', () => {
  it('treats 1x1 trees as solid height-10 walls blocking walking, bullets, and line of sight, while bushes do not shrink LoS', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    // tokyo_shrine has tree at (7, 18) and bush at (16, 17)
    const tree = engine.map.trees.find((t) => Math.round(t.x / TILE) === 7 && Math.round(t.y / TILE) === 18)!;
    expect(tree).toBeTruthy();

    const moveFn = (engine as unknown as {
      moveCharacterWithElevation: (x: number, y: number, e: number, dx: number, dy: number, r: number) => { x: number; y: number };
      traceBulletSegment: (x1: number, y1: number, a: number, d: number, e: number, emit?: boolean) => { x2: number; y2: number };
      hasLineOfSight: (ax: number, ay: number, ae: number, bx: number, by: number, be: number, r: number) => boolean;
    });

    // Walking right into 1x1 tree (7, 18) is stopped outside tree left edge (7*TILE)
    const moved = moveFn.moveCharacterWithElevation.call(engine, 6.2 * TILE, 18.5 * TILE, 0, 20, 0, engine.player.radius);
    expect(moved.x).toBeLessThan(tree.x);

    // Bullet aimed across tree stops at outer edge of tree (7*TILE)
    const bulletSeg = moveFn.traceBulletSegment.call(engine, 5.5 * TILE, 18.5 * TILE, 0, 500, 0, false);
    expect(bulletSeg.x2).toBeLessThanOrEqual(tree.x);

    // Line of sight across tree is blocked
    expect(moveFn.hasLineOfSight.call(engine, 5.5 * TILE, 18.5 * TILE, 0, 9.5 * TILE, 18.5 * TILE, 0, 8 * TILE)).toBe(false);

    // Target inside bush (16, 17) ~5.5 tiles away along open ground (gy=17, gx=22 -> 16) stays visible (no bush sight shrink)
    const bush = engine.map.bushes.find((b) => Math.round(b.x / TILE) === 16 && Math.round(b.y / TILE) === 17)!;
    expect(bush).toBeTruthy();
    expect(
      moveFn.hasLineOfSight.call(
        engine,
        21.5 * TILE,
        17.5 * TILE,
        0,
        bush.x + TILE / 2,
        bush.y + TILE / 2,
        0,
        8 * TILE
      )
    ).toBe(true);
  });

  it('shrinks rifle crosshair continuously even during micro cursor motion while wide cursor flicks expand faster than recovery', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    engine.enemies = [];
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    engine.player.activeHand = 0;
    gunInHand(engine).def = rifle;
    const camState = (engine as unknown as { camera: { x: number; y: number; zoom: number } }).camera;
    camState.x = engine.player.x;
    camState.y = engine.player.y;
    camState.zoom = 1;

    // 1. Large rapid cursor flick expands crosshair significantly
    engine.setMousePos(640, 360);
    (engine as unknown as { resetGunFeedback: () => void }).resetGunFeedback();
    const getSpread = (engine as unknown as { getPlayerGunSpread: (g: typeof rifle) => number }).getPlayerGunSpread.bind(engine);
    const rested = getSpread(rifle);

    engine.setMousePos(900, 360);
    const afterWideFlick = getSpread(rifle);
    expect(afterWideFlick).toBeGreaterThan(rested);

    // 2. Micro cursor motion (1.5px/frame) still shrinks net crosshair toward rested every frame
    for (let i = 1; i <= 30; i++) {
      engine.setMousePos(900 + i * 1.5, 360);
      engine.update(1 / 60, 1280, 720);
    }
    expect(getSpread(rifle)).toBeLessThan(afterWideFlick);
  });

  it('prevents pistol hold-to-autofire (semi-auto only) and enforces longer shot interval than rifle', () => {
    const pistol = GUNS.find((g) => g.kind === 'pistol')!;
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    expect(1 / pistol.fireRate).toBeGreaterThan(1 / rifle.fireRate);

    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    engine.enemies = [];
    engine.player.activeHand = 0;
    gunInHand(engine).def = pistol;
    gunInHand(engine).ammoInMag = pistol.magSize;

    // Holding mouse down fires ONLY 1 pistol shot across 0.6s
    engine.setMouseDown(true);
    for (let i = 0; i < 12; i++) engine.update(0.05, 1280, 720);
    engine.setMouseDown(false);
    expect(gunInHand(engine).ammoInMag).toBe(pistol.magSize - 1);

    // Must wait for pistol interval before next click fires
    engine.setMouseDown(true);
    engine.setMouseDown(false);
    expect(gunInHand(engine).ammoInMag).toBe(pistol.magSize - 2);
  });

  it('pops yellow ! when AI discovers a target and renders direct numeric deduction text on frontal shield blocks', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    (engine as unknown as { deploymentQueue: Record<FactionId, number> }).deploymentQueue = {
      royal: 0,
      shadow: 0,
      mercenary: 0,
    };

    enemy.hasLosToTarget = false;
    enemy.visibleTargetId = null;
    enemy.stunTimer = 0;
    enemy.blindTimer = 0;
    enemy.x = 12 * TILE;
    enemy.y = 19.3 * TILE;
    enemy.elevation = 0;
    engine.player.x = 14.5 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;
    engine.floatingTexts = [];

    engine.update(1 / 60, 1280, 720);
    const spotBang = engine.floatingTexts.find((ft) => ft.text === '!');
    expect(spotBang).toBeTruthy();
    expect(spotBang!.color).toBe('#FACC15');

    // Shield block floating texts show direct numeric deduction (-XX) without prefix words
    engine.player.activeHand = 1;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'shield')!;
    meleeInHand(engine).durability = 100;
    engine.player.angle = Math.PI;
    engine.player.invulnTimer = 0;
    engine.floatingTexts = [];

    const damagePlayer = (engine as unknown as {
      damagePlayer: (rawDmg: number, isMelee: boolean, attackerId?: string, ox?: number, oy?: number) => void;
    }).damagePlayer.bind(engine);
    damagePlayer(25, false, enemy.id, enemy.x, enemy.y);

    expect(engine.floatingTexts.some((ft) => ft.text === '-25')).toBe(true);
    expect(engine.floatingTexts.some((ft) => ft.text.includes('盾擋') || ft.text.includes('盾格'))).toBe(false);

    engine.player.invulnTimer = 0;
    engine.floatingTexts = [];
    damagePlayer(20, true, enemy.id, enemy.x, enemy.y);
    expect(engine.floatingTexts.some((ft) => ft.text === '-10')).toBe(true);
    expect(engine.floatingTexts.some((ft) => ft.text.includes('盾擋') || ft.text.includes('盾格'))).toBe(false);
  });
});

describe('Gun magazine persistence across drop/pickup, active-hand reload & swap cancel, and custom map builder', () => {
  it('preserves exact gun ammoInMag across player and AI drops and pickups with zero free refill', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    engine.pickups = [];

    // Player equips a rifle with 11/30 ammo, drops it, and picks it back up -> must remain 11/30
    engine.player.activeHand = 0;
    engine.player.weapons[0] = { type: 'gun', def: rifle, ammoInMag: 11, reloadTimer: 0 };
    engine.dropActiveWeapon();
    expect(engine.player.weapons[0].def.kind).toBe('pistol');
    expect(engine.pickups.length).toBe(1);
    expect(engine.pickups[0].ammoInMag).toBe(11);

    engine.tryPickup();
    const pickedByPlayer = gunInHand(engine, 0);
    expect(pickedByPlayer.def.kind).toBe('rifle');
    expect(pickedByPlayer.ammoInMag).toBe(11);

    // Player drops again with 7 bullets remaining; an AI soldier picks it up -> AI keeps 7 bullets
    pickedByPlayer.ammoInMag = 7;
    engine.dropActiveWeapon();
    const enemy = engine.enemies[0];
    enemy.weapons[0] = { type: 'gun', def: GUNS.find((g) => g.kind === 'pistol')!, ammoInMag: 12, reloadTimer: 0 };
    enemy.x = engine.pickups[0].x;
    enemy.y = engine.pickups[0].y;
    (engine as unknown as { enemyTryPickupWeapon: (e: EnemyEntity) => void }).enemyTryPickupWeapon(enemy);
    expect(enemy.weapons[0].type).toBe('gun');
    if (enemy.weapons[0].type === 'gun') {
      expect(enemy.weapons[0].def.kind).toBe('rifle');
      expect(enemy.weapons[0].ammoInMag).toBe(7);
    }
  });

  it('cancels player reload on hand swap and never finishes reloading a holstered gun', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    engine.enemies = [];
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    engine.player.activeHand = 0;
    engine.player.reserveAmmo = 30;
    engine.player.weapons[0] = { type: 'gun', def: rifle, ammoInMag: 4, reloadTimer: 0 };

    engine.startReload();
    expect(gunInHand(engine, 0).reloadTimer).toBeGreaterThan(0);

    // Swap to melee hand mid-reload -> cancels reloadTimer immediately
    engine.switchWeapon();
    expect(engine.player.activeHand).toBe(1);
    expect(gunInHand(engine, 0).reloadTimer).toBe(0);

    // Advance well past reloadTime while holding melee hand -> off-hand gun stays at 4 bullets and reserve stays 30
    for (let i = 0; i < 60; i++) engine.update(0.05, 1280, 720);
    expect(gunInHand(engine, 0).ammoInMag).toBe(4);
    expect(engine.player.reserveAmmo).toBe(30);
  });

  it('cancels AI reload on hand swap and never refills off-hand gun magazine during swap', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    (engine as unknown as { deploymentQueue: Record<FactionId, number> }).deploymentQueue = {
      royal: 0,
      shadow: 0,
      mercenary: 0,
    };

    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    enemy.activeHand = 0;
    enemy.weapons[0] = { type: 'gun', def: rifle, ammoInMag: 0, reloadTimer: 1.5 };

    // Swap AI to melee hand -> reloadTimer must immediately cancel and ammoInMag remain 0
    (engine as unknown as { switchEnemyHand: (e: EnemyEntity, hand: WeaponHand) => void }).switchEnemyHand(enemy, 1);
    expect(enemy.activeHand).toBe(1);
    expect(enemy.weapons[0].type === 'gun' && enemy.weapons[0].reloadTimer).toBe(0);
    expect(enemy.weapons[0].type === 'gun' && enemy.weapons[0].ammoInMag).toBe(0);

    // Simulate close-range melee engagement where AI stays in hand 1 over 2s -> off-hand gun stays at 0
    enemy.stunTimer = 0;
    enemy.blindTimer = 0;
    enemy.x = 12 * TILE;
    enemy.y = 19.3 * TILE;
    engine.player.x = 12.9 * TILE;
    engine.player.y = 19.3 * TILE;
    for (let i = 0; i < 40; i++) engine.update(0.05, 1280, 720);
    if (enemy.weapons[0].type === 'gun' && (enemy.activeHand as WeaponHand) === 1) {
      expect(enemy.weapons[0].ammoInMag).toBe(0);
    }
  });

  it('compiles dynamic baseElev + 0.5 stairs, boots TwilightEngine with customMap, and validates 3-faction reachability via BFS', () => {
    const custom = createBlankCustomMap('高台測試圖', 'desert_outdoor', 28, 20);
    // Stack elevated tiles at 2.0 and 3.0, and place stairs directly on top of them
    custom.tileGrid[8][10] = { elev: 2.0, style: 'pyramid' };
    custom.tileGrid[8][11] = { elev: 3.0, style: 'pyramid' };
    custom.stairs.push(
      { gx: 10, gy: 8, direction: 'east', style: 'pyramid' },
      { gx: 11, gy: 8, direction: 'east', style: 'pyramid' }
    );
    custom.railTracks.push(
      { gx: 4, gy: 5, orientation: 'horizontal' },
      { gx: 5, gy: 5, orientation: 'vertical' }
    );
    custom.obstacles.push(
      { gx: 7, gy: 7, gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'bamboo', direction: 'west' },
      { gx: 14, gy: 10, gw: 2, gh: 3, elevation: 10, kind: 'wall', style: 'house', direction: 'east' }
    );

    const arena = buildArenaMapFromCustom(custom);
    const stair25 = arena.stairs.find((s) => Math.round(s.x / TILE) === 10 && Math.round(s.y / TILE) === 8);
    const stair35 = arena.stairs.find((s) => Math.round(s.x / TILE) === 11 && Math.round(s.y / TILE) === 8);
    expect(stair25?.elevation).toBeCloseTo(2.5, 5);
    expect(stair35?.elevation).toBeCloseTo(3.5, 5);
    expect(arena.railTracks).toEqual([
      { gx: 4, gy: 5, orientation: 'horizontal' },
      { gx: 5, gy: 5, orientation: 'vertical' },
    ]);
    expect(arena.obstacles.find((o) => o.style === 'bamboo')?.direction).toBe('west');
    expect(arena.obstacles.find((o) => o.style === 'house')?.direction).toBe('east');

    // Blank map starts genuinely empty and fails validation until 3 factions have reachable spawns
    const emptyBlank = createBlankCustomMap('空白起手圖', 'shrine_outdoor', 28, 20);
    expect(emptyBlank.factionSpawns.royal.length).toBe(0);
    expect(emptyBlank.factionSpawns.shadow.length).toBe(0);
    expect(emptyBlank.factionSpawns.mercenary.length).toBe(0);
    expect(emptyBlank.obstacles.length).toBe(0);
    expect(validateCustomMap(emptyBlank).valid).toBe(false);

    // Populating all 3 faction spawns on open ground passes BFS validation and boots engine
    const validBlank = createBlankCustomMap('連通圖', 'shrine_outdoor', 28, 20);
    validBlank.factionSpawns.royal = [{ gx: 2, gy: 9 }, { gx: 2, gy: 10 }];
    validBlank.factionSpawns.shadow = [{ gx: 25, gy: 9 }, { gx: 25, gy: 10 }];
    validBlank.factionSpawns.mercenary = [{ gx: 14, gy: 3 }, { gx: 14, gy: 16 }];
    expect(validateCustomMap(validBlank).valid).toBe(true);

    // Booting TwilightEngine directly with a customMap uses custom.id and custom geometry
    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      validBlank.id,
      { royal: 10, shadow: 10, mercenary: 10 },
      () => {},
      () => {},
      validBlank
    );
    expect(engine.map.id).toBe(validBlank.id);
    expect(engine.map.cols).toBe(28);
    expect(engine.map.rows).toBe(20);

    // Isolating Shadow spawn on an unbridged elev=2.0 cliff without +0.5 stairs must fail BFS validation
    const isolated = createBlankCustomMap('孤島失敗圖', 'shrine_outdoor', 28, 20);
    isolated.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    isolated.factionSpawns.shadow = [{ gx: 24, gy: 9 }];
    isolated.factionSpawns.mercenary = [{ gx: 14, gy: 3 }];
    const sSpawn = isolated.factionSpawns.shadow[0];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        isolated.tileGrid[sSpawn.gy + dy][sSpawn.gx + dx] = { elev: 2.0, style: 'hill' };
      }
    }
    const invalidRes = validateCustomMap(isolated);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors.some((msg) => msg.includes('無法與其他陣營連通'))).toBe(true);

    // Tokyo shrine stone road (14..15, y) must exist as explicit stoneRoads objects rather than biome hardcoding
    const shrine = createArenaMap('tokyo_shrine');
    expect(shrine.stoneRoads.length).toBe(shrine.rows * 2);
    expect(shrine.stoneRoads.every((r) => r.gx === 14 || r.gx === 15)).toBe(true);
  });

  it('stacks objects atop elevated terrain, enforces uniform base elevation for multi-tile objects, and preserves floorGrid/elevation under water', () => {
    const stacked = createBlankCustomMap('疊加測試圖', 'bamboo_outdoor', 24, 18);
    stacked.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    stacked.factionSpawns.shadow = [{ gx: 21, gy: 9 }];
    stacked.factionSpawns.mercenary = [{ gx: 12, gy: 15 }];

    // Build a 1.0 hill plateau across (8..13, 6..10)
    for (let gy = 6; gy <= 10; gy++) {
      for (let gx = 8; gx <= 13; gx++) {
        stacked.tileGrid[gy][gx] = { elev: 1.0, style: 'hill' };
      }
    }
    // Mix multiple FloorStyle values on the ground and under water
    stacked.floorGrid![9][4] = 'grass_ground';
    stacked.floorGrid![9][5] = 'castle_stone';
    stacked.floorGrid![9][6] = 'warehouse_steel';
    // Water placed on grass_ground AND on a 1.0 hill tile keeps both floorGrid and tileGrid elevation intact
    stacked.waterTiles.push({ gx: 4, gy: 9 }, { gx: 8, gy: 6 });

    // Place small crate (+1.0 -> 2.0), big crate (+1.5 -> 2.5), container (+2.0 -> 3.0) uniformly on 1.0 plateau
    stacked.obstacles.push(
      { gx: 9, gy: 8, gw: 1, gh: 1, elevation: 1.0, kind: 'crate', style: 'small_crate' },
      { gx: 10, gy: 7, gw: 2, gh: 2, elevation: 1.5, kind: 'crate', style: 'default' },
      { gx: 9, gy: 9, gw: 4, gh: 2, elevation: 2.0, kind: 'crate', style: 'container', colorVariant: '#0284C7' }
    );

    expect(hasUniformCellElevation(stacked.tileGrid, 10, 7, 2, 2)).toBe(true);
    expect(validateCustomMap(stacked).valid).toBe(true);

    const compiled = buildArenaMapFromCustom(stacked);
    const small = compiled.obstacles.find((o) => o.style === 'small_crate')!;
    const big = compiled.obstacles.find((o) => o.style === 'default')!;
    const cont = compiled.obstacles.find((o) => o.style === 'container')!;
    expect(small.elevation).toBe(2.0);
    expect(big.elevation).toBe(2.5);
    expect(cont.elevation).toBe(3.0);

    // Water preserved floorGrid and tileGrid elevation
    expect(compiled.floorGrid?.[9][4]).toBe('grass_ground');
    expect(compiled.floorGrid?.[9][5]).toBe('castle_stone');
    expect(compiled.floorGrid?.[9][6]).toBe('warehouse_steel');
    expect(compiled.tileGrid[6][8].elev).toBe(1.0);
    expect(compiled.waterTileKeys.has('4,9')).toBe(true);
    expect(compiled.waterTileKeys.has('8,6')).toBe(true);

    // Roundtrip back to CustomMapData subtracts base terrain elev to restore intrinsic height
    const roundtrip = arenaMapToCustomData(compiled);
    expect(roundtrip.obstacles.find((o) => o.style === 'small_crate')?.elevation).toBe(1.0);
    expect(roundtrip.obstacles.find((o) => o.style === 'default')?.elevation).toBe(1.5);
    expect(roundtrip.obstacles.find((o) => o.style === 'container')?.elevation).toBe(2.0);

    // Physics verification in TwilightEngine:
    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      stacked.id,
      { royal: 10, shadow: 10, mercenary: 10 },
      () => {},
      () => {},
      stacked
    );
    const internals = engine as unknown as {
      getHeightAtPoint: (x: number, y: number) => {
        totalHeight: number;
        terrainHeight: number;
        isWall: boolean;
        isCrate: boolean;
      };
      traceBulletSegment: (
        x1: number,
        y1: number,
        angle: number,
        maxDist: number,
        startElev: number,
        emitBurst?: boolean
      ) => { x1: number; y1: number; x2: number; y2: number };
      getFootstepSurface: (x: number, y: number) => string;
    };

    // getHeightAtPoint inside stacked small crate reports total 2.0 and underlying terrainHeight 1.0
    const h = internals.getHeightAtPoint(9.5 * TILE, 8.5 * TILE);
    expect(h.totalHeight).toBe(2.0);
    expect(h.terrainHeight).toBe(1.0);
    expect(h.isCrate).toBe(true);

    // Ground (0.0) shooter cannot shoot past the stacked 2.0 small crate (Δh = 2.0 >= 2.0)
    const groundShot = internals.traceBulletSegment(5.5 * TILE, 8.5 * TILE, 0, 12 * TILE, 0, false);
    expect(groundShot.x2).toBeLessThanOrEqual(9.05 * TILE);

    // Shooter standing on 1.0 hill shoots cleanly OVER the stacked 2.0 small crate (Δh = 1.0 <= 1.0)
    const hillShot = internals.traceBulletSegment(8.3 * TILE, 8.5 * TILE, 0, 3 * TILE, 1.0, false);
    expect(hillShot.x2).toBeGreaterThan(10.0 * TILE);

    // Footsteps adapt dynamically across mixed floorGrid styles
    expect(internals.getFootstepSurface(4.5 * TILE, 9.5 * TILE)).toBe('soft');
    expect(internals.getFootstepSurface(5.5 * TILE, 9.5 * TILE)).toBe('hard');
    expect(internals.getFootstepSurface(6.5 * TILE, 9.5 * TILE)).toBe('hard');

    // Straddling a multi-tile object across 1.0 hill and 0.0 ground fails validateCustomMap
    const uneven = createBlankCustomMap('高低錯落失敗圖', 'shrine_outdoor', 24, 18);
    uneven.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    uneven.factionSpawns.shadow = [{ gx: 21, gy: 9 }];
    uneven.factionSpawns.mercenary = [{ gx: 12, gy: 15 }];
    uneven.tileGrid[7][10] = { elev: 1.0, style: 'hill' }; // only 1 of 4 tiles raised
    uneven.obstacles.push({ gx: 10, gy: 7, gw: 2, gh: 2, elevation: 1.5, kind: 'crate', style: 'default' });
    expect(hasUniformCellElevation(uneven.tileGrid, 10, 7, 2, 2)).toBe(false);
    const unevenRes = validateCustomMap(uneven);
    expect(unevenRes.valid).toBe(false);
    expect(unevenRes.errors.some((err) => err.includes('地形高度不一致'))).toBe(true);
  });
});

describe('Mud pits (-1.0), railings (+1.0), new themed objects, pure numeric popups, and high-ground AI', () => {
  it('supports -1.0/-2.0 mud pits with -0.5 stairs, BFS reachability, and uninterrupted 0.0 shots across the pit', () => {
    const pitMap = createBlankCustomMap('泥坑測試圖', 'bamboo_outdoor', 24, 18);
    pitMap.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    pitMap.factionSpawns.shadow = [{ gx: 12, gy: 9 }]; // Inside -1.0 mud pit
    pitMap.factionSpawns.mercenary = [{ gx: 21, gy: 9 }];

    // Dig a -1.0 mud pit (10..14, 7..11) with a -2.0 core at (12, 9) and mud stairs linking layers
    for (let gy = 7; gy <= 11; gy++) {
      for (let gx = 10; gx <= 14; gx++) {
        pitMap.tileGrid[gy][gx] = { elev: -1.0, style: 'mud_pit' };
      }
    }
    pitMap.stairs.push({ gx: 10, gy: 9, direction: 'west', style: 'mud_pit' }); // -1.0 + 0.5 = -0.5
    // Ground-level 1.0 small crate on the far right bank (x = 16, y = 9)
    pitMap.obstacles.push({ gx: 16, gy: 9, gw: 1, gh: 1, elevation: 1.0, kind: 'crate', style: 'small_crate' });

    const compiled = buildArenaMapFromCustom(pitMap);
    const mudStair = compiled.stairs.find((s) => Math.round(s.x / TILE) === 10 && Math.round(s.y / TILE) === 9);
    expect(mudStair?.elevation).toBeCloseTo(-0.5, 5);
    expect(validateCustomMap(pitMap).valid).toBe(true);

    // Without mud stair, a -1.0 isolated pit containing a spawn fails BFS validation
    const isolatedPit = createBlankCustomMap('孤立泥坑圖', 'bamboo_outdoor', 24, 18);
    isolatedPit.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    isolatedPit.factionSpawns.shadow = [{ gx: 12, gy: 9 }];
    isolatedPit.factionSpawns.mercenary = [{ gx: 21, gy: 9 }];
    for (let gy = 8; gy <= 10; gy++) {
      for (let gx = 11; gx <= 13; gx++) {
        isolatedPit.tileGrid[gy][gx] = { elev: -1.0, style: 'mud_pit' };
      }
    }
    expect(validateCustomMap(isolatedPit).valid).toBe(false);

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      pitMap.id,
      { royal: 10, shadow: 10, mercenary: 10 },
      () => {},
      () => {},
      pitMap
    );
    const internals = engine as unknown as {
      traceBulletSegment: (
        x1: number,
        y1: number,
        angle: number,
        maxDist: number,
        startElev: number,
        emitBurst?: boolean
      ) => { x1: number; y1: number; x2: number; y2: number };
    };

    // Ground shooter (0.0) firing across the -1.0 pit must clear the 1.0 crate on the far bank (effectiveFloor >= 0 -> Δh = 1.0 <= 1.0)
    const acrossShot = internals.traceBulletSegment(8.5 * TILE, 9.5 * TILE, 0, 10 * TILE, 0, false);
    expect(acrossShot.x2).toBeGreaterThan(17.5 * TILE);

    // Shooter inside -1.0 pit firing up at the 1.0 crate (height 1.0 - (-1.0) = 2.0 >= 2.0) IS blocked at crate edge
    const pitShot = internals.traceBulletSegment(12.5 * TILE, 9.5 * TILE, 0, 7 * TILE, -1.0, false);
    expect(pitShot.x2).toBeLessThanOrEqual(16.05 * TILE);
  });

  it('enforces railing (+1.0) movement block while letting 0.0 shots pass, and compiles new custom objects & palettes', () => {
    const map = createBlankCustomMap('新物件測試圖', 'warehouse_indoor', 24, 18);
    map.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    map.factionSpawns.shadow = [{ gx: 21, gy: 9 }];
    map.factionSpawns.mercenary = [{ gx: 12, gy: 15 }];

    const sakuraPalette = TREE_FOLIAGE_PRESETS.find((p) => p.id === 'sakura')!.palette;
    map.tileGrid[5][5] = { elev: -1.0, style: 'mud_pit' };
    map.waterTiles.push({ gx: 7, gy: 9 });
    map.bridges.push({ gx: 7, gy: 9, gw: 1, gh: 1, orientation: 'horizontal', style: 'stone' });
    map.farmTiles = [{ gx: 4, gy: 4, crop: 'carrot' }];
    map.trees.push({ gx: 3, gy: 3, foliagePalette: sakuraPalette });
    map.obstacles.push(
      { gx: 10, gy: 9, gw: 1, gh: 1, elevation: 1.0, kind: 'crate', style: 'railing' },
      { gx: 14, gy: 5, gw: 1, gh: 1, elevation: 1.5, kind: 'crate', style: 'rock_small', colorVariant: '#6B4226' },
      { gx: 16, gy: 5, gw: 2, gh: 2, elevation: 2.0, kind: 'crate', style: 'rock_large', colorVariant: '#CBD5E1' },
      { gx: 14, gy: 12, gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'stone_wall_red' },
      { gx: 15, gy: 12, gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'stone_wall_blue' }
    );

    const compiled = buildArenaMapFromCustom(map);
    expect(compiled.bridges[0].style).toBe('stone');
    expect(compiled.farmTiles).toEqual([{ gx: 4, gy: 4, crop: 'carrot' }]);
    expect(compiled.trees[0].foliagePalette).toEqual(sakuraPalette);
    expect(compiled.obstacles.find((o) => o.style === 'rock_small')?.elevation).toBe(1.5);
    expect(compiled.obstacles.find((o) => o.style === 'rock_large')?.elevation).toBe(2.0);
    expect(compiled.obstacles.some((o) => o.style === 'stone_wall_red' && o.elevation >= 10)).toBe(true);
    expect(compiled.obstacles.some((o) => o.style === 'stone_wall_blue' && o.elevation >= 10)).toBe(true);

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      map.id,
      { royal: 10, shadow: 10, mercenary: 10 },
      () => {},
      () => {},
      map
    );
    const internals = engine as unknown as {
      moveCharacterWithElevation: (x: number, y: number, e: number, dx: number, dy: number, r: number) => { x: number; y: number };
      traceBulletSegment: (x1: number, y1: number, a: number, d: number, e: number, b?: boolean) => { x2: number; y2: number };
      hasLineOfSight: (ax: number, ay: number, ae: number, bx: number, by: number, be: number, r: number) => boolean;
    };

    // Player at (9.2, 9.5) cannot walk east into railing at (10..11, 9..10)
    const blockedMove = internals.moveCharacterWithElevation(9.2 * TILE, 9.5 * TILE, 0, 30, 0, engine.player.radius);
    expect(blockedMove.x).toBeLessThan(9.55 * TILE);

    // Ground 0.0 bullet & LoS pass cleanly over +1.0 railing
    const overShot = internals.traceBulletSegment(8.5 * TILE, 9.5 * TILE, 0, 5 * TILE, 0, false);
    expect(overShot.x2).toBeGreaterThan(13.0 * TILE);
    expect(internals.hasLineOfSight(8.5 * TILE, 9.5 * TILE, 0, 12.5 * TILE, 9.5 * TILE, 0, 8 * TILE)).toBe(true);
  });

  it('renders strictly numeric white/red floating deduction texts (-XX) on shield shatter and HP damage', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];

    engine.player.activeHand = 1;
    meleeInHand(engine).def = MELEES.find((m) => m.kind === 'shield')!;
    meleeInHand(engine).durability = 15;
    engine.player.angle = Math.atan2(enemy.y - engine.player.y, enemy.x - engine.player.x);
    engine.player.invulnTimer = 0;
    engine.floatingTexts = [];

    const damagePlayer = (engine as unknown as {
      damagePlayer: (rawDmg: number, isMelee: boolean, attackerId?: string, ox?: number, oy?: number) => void;
    }).damagePlayer.bind(engine);

    // Shield shatter with 15 remaining vs 20 ranged damage -> white -15 (plus -5 leaked HP), zero shatter/core text
    damagePlayer(20, false, enemy.id, enemy.x, enemy.y);
    expect(engine.floatingTexts.some((ft) => ft.text === '-15' && ft.color === '#FFFFFF')).toBe(true);
    expect(engine.floatingTexts.some((ft) => ft.text === '-5' && ft.color === '#EF4444')).toBe(true);
    expect(engine.floatingTexts.some((ft) => ft.text.includes('碎裂') || ft.text.includes('核心'))).toBe(false);

    // Direct HP hit -> red -22 only (no '核心' label)
    engine.player.invulnTimer = 0;
    engine.floatingTexts = [];
    damagePlayer(22, false, enemy.id, enemy.x, enemy.y);
    expect(engine.floatingTexts.some((ft) => ft.text === '-22' && ft.color === '#EF4444')).toBe(true);
    expect(engine.floatingTexts.some((ft) => ft.text.includes('核心'))).toBe(false);
  });

  it('keeps ranged AI on high ground while engaging lower-ground enemies and picks elevated one-way cover spots', () => {
    const hgMap = createBlankCustomMap('高地AI測試', 'desert_outdoor', 24, 18);
    hgMap.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    hgMap.factionSpawns.shadow = [{ gx: 14, gy: 9 }];
    hgMap.factionSpawns.mercenary = [{ gx: 21, gy: 15 }];

    // Shadow plateau (12..15, 7..11) at 1.0 with stairs at (11, 9) and low crate edge for one-way cover
    for (let gy = 7; gy <= 11; gy++) {
      for (let gx = 12; gx <= 15; gx++) {
        hgMap.tileGrid[gy][gx] = { elev: 1.0, style: 'pyramid' };
      }
    }
    hgMap.stairs.push({ gx: 11, gy: 9, direction: 'west', style: 'pyramid' });
    // Small crate at (10, 9) with ground height 1.0: 1.0 AI shoots cleanly over (Δh = 0.0) while 0.0 target shooting slightly behind or up stays disadvantaged
    hgMap.obstacles.push({ gx: 11, gy: 8, gw: 1, gh: 1, elevation: 1.0, kind: 'crate', style: 'small_crate' });

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      hgMap.id,
      { royal: 10, shadow: 10, mercenary: 10 },
      () => {},
      () => {},
      hgMap
    );
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    (engine as unknown as { deploymentQueue: Record<FactionId, number> }).deploymentQueue = {
      royal: 0,
      shadow: 0,
      mercenary: 0,
    };

    // Place Shadow AI at (13.5, 9.5) on 1.0 plateau with rifle, Player below at (8.5, 9.5) on 0.0 ground
    enemy.x = 13.5 * TILE;
    enemy.y = 9.5 * TILE;
    enemy.elevation = 1.0;
    enemy.activeHand = 0;
    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    enemy.weapons[0] = { type: 'gun', def: rifle, ammoInMag: rifle.magSize, reloadTimer: 0 };
    enemy.stunTimer = 0;
    enemy.blindTimer = 0;

    engine.player.x = 8.5 * TILE;
    engine.player.y = 9.5 * TILE;
    engine.player.elevation = 0;

    // Step AI for 1.5s: AI must NOT descend the stair onto 0.0 ground when holding 1.0 high ground with clear shots
    for (let i = 0; i < 45; i++) {
      engine.update(1 / 30, 1280, 720);
    }
    expect(enemy.elevation).toBeGreaterThanOrEqual(1.0);
    expect(enemy.x).toBeGreaterThanOrEqual(11.9 * TILE);

    // Tactical spot evaluation respects holdingHighGround=true by never selecting lower elevation tiles
    const tactical = (
      engine as unknown as {
        findBestTacticalSpot: (
          ai: EnemyEntity,
          target: { x: number; y: number; elev: number },
          sight: number,
          desired: number,
          holdingHighGround: boolean,
          reloading: boolean
        ) => { x: number; y: number } | null;
      }
    ).findBestTacticalSpot(
      enemy,
      { x: engine.player.x, y: engine.player.y, elev: 0 },
      8 * TILE,
      200,
      true,
      false
    );
    if (tactical) {
      expect(tactical.x).toBeGreaterThanOrEqual(11.9 * TILE);
    }
  });
});

describe('Per-floor terrain/stair bindings, glacier_rift map, and 5s ice_vent freeze mechanics', () => {
  it('binds a high-ground terrain and matching stair to every FloorStyle and ships 8 built-in maps including glacier_rift', () => {
    const allFloors: FloorStyle[] = [
      'shrine_dirt',
      'bamboo_moss',
      'desert_sand',
      'castle_stone',
      'warehouse_steel',
      'grass_ground',
      'glacier_ice',
    ];
    expect(Object.keys(FLOOR_TERRAIN_BINDINGS).sort()).toEqual([...allFloors].sort());
    for (const floor of allFloors) {
      const binding = FLOOR_TERRAIN_BINDINGS[floor];
      expect(binding.floorStyle).toBe(floor);
      expect(binding.terrainStyle).toBeTruthy();
      expect(binding.terrainLabel.length).toBeGreaterThan(0);
      expect(binding.stairLabel.length).toBeGreaterThan(0);
    }

    expect(MAP_CATALOG.length).toBe(8);
    expect(MAP_CATALOG.some((m) => m.id === 'glacier_rift')).toBe(true);

    const glacier = createArenaMap('glacier_rift');
    expect(glacier.biome).toBe('glacier_outdoor');
    expect(glacier.iceVents?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(glacier.waterTiles.length).toBeGreaterThan(10);
    expect(glacier.bridges.length).toBe(0);
    expect(glacier.tileGrid.flat().some((c) => c.style === 'mud_pit')).toBe(false);
    expect(glacier.obstacles.some((o) => o.style === 'railing')).toBe(false);
    expect(glacier.floatingIceTiles?.length ?? 0).toBeGreaterThanOrEqual(10);
    expect(glacier.campfires?.length ?? 0).toBe(2);
    expect(glacier.igloos?.length ?? 0).toBe(1);
    expect(glacier.pushableIceBlocks?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(glacier.floorGrid?.some((row) => row.includes('glacier_ice'))).toBe(true);
    expect(glacier.tileGrid.some((row) => row.some((c) => c.style === 'glacier_ice' && c.elev === 2))).toBe(true);
    expect(glacier.stairs.some((s) => s.style === 'glacier_ice')).toBe(true);
    expect(validateCustomMap(arenaMapToCustomData(glacier)).valid).toBe(true);
  });

  it('rejects mismatched terrain stairs and only accepts stairs attached to matching plateau or mud_pit tiles', () => {
    const map = createBlankCustomMap('階梯配對測試', 'glacier_outdoor', 16, 12);
    map.tileGrid[5][6] = { elev: 1, style: 'glacier_ice' };
    map.tileGrid[5][8] = { elev: -1, style: 'mud_pit' };
    map.factionSpawns.royal.push({ gx: 1, gy: 1 });
    map.factionSpawns.shadow.push({ gx: 14, gy: 1 });
    map.factionSpawns.mercenary.push({ gx: 1, gy: 10 });

    // Mismatched stair style onto glacier_ice plateau must fail both placement check and validation
    expect(canPlaceTerrainStairAt(map.tileGrid, 5, 5, 'hill', 'east')).toBe(false);
    expect(canPlaceTerrainStairAt(map.tileGrid, 5, 5, 'glacier_ice', 'east')).toBe(true);
    expect(canPlaceTerrainStairAt(map.tileGrid, 5, 5, 'glacier_ice', 'west')).toBe(false);

    // Mud pit stair must sit inside -1.0 mud_pit pointing toward 0.0 rim
    expect(canPlaceTerrainStairAt(map.tileGrid, 8, 5, 'mud_pit', 'east')).toBe(true);
    expect(canPlaceTerrainStairAt(map.tileGrid, 7, 5, 'mud_pit', 'east')).toBe(false);

    map.stairs.push({ gx: 5, gy: 5, gw: 1, gh: 1, direction: 'east', style: 'hill' });
    const badRes = validateCustomMap(map);
    expect(badRes.valid).toBe(false);
    expect(badRes.errors.some((e) => e.includes('階梯'))).toBe(true);

    map.stairs = [{ gx: 5, gy: 5, gw: 1, gh: 1, direction: 'east', style: 'glacier_ice' }];
    const okRes = validateCustomMap(map);
    expect(okRes.valid).toBe(true);
  });

  it('freezes player & AI on ice_vent for 5s, interrupts timed skills, slows speed/melee by 10%, and blocks Qi charging', () => {
    const custom = createBlankCustomMap('冰氣孔測試場', 'glacier_outdoor', 20, 14);
    custom.factionSpawns.royal.push({ gx: 2, gy: 6 }, { gx: 3, gy: 6 });
    custom.factionSpawns.shadow.push({ gx: 16, gy: 6 }, { gx: 17, gy: 6 });
    custom.factionSpawns.mercenary.push({ gx: 10, gy: 2 }, { gx: 10, gy: 11 }, { gx: 12, gy: 2 }, { gx: 12, gy: 11 });
    custom.iceVents = [{ gx: 6, gy: 6 }];

    let latestHud: HudSnapshot | null = null;
    const testEngine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      'glacier_rift',
      { royal: 100, shadow: 100, mercenary: 100 },
      (snap) => {
        latestHud = snap;
      },
      undefined,
      custom
    );

    const p = testEngine.player;
    const ventX = 6.5 * TILE;
    const ventY = 6.5 * TILE;

    // Measure normal movement distance over 0.5s away from vent
    p.activeHand = 0;
    p.x = 2.5 * TILE;
    p.y = 6.5 * TILE;
    p.vx = 0;
    p.vy = 0;
    p.freezeTimer = 0;
    testEngine.setKey('KeyD', true);
    for (let i = 0; i < 15; i++) testEngine.update(1 / 30, 1280, 720);
    testEngine.setKey('KeyD', false);
    const normalDx = p.x - 2.5 * TILE;
    expect(normalDx).toBeGreaterThan(50);

    // Step onto ice vent with active timed skills + giant sizeScale
    p.royalShieldTimer = 4.0;
    p.eagleEyeTimer = 5.0;
    p.vampireTimer = 6.0;
    p.giantTimer = 5.0;
    p.sizeScale = 1.45;
    p.radius = CHAR_BASE_RADIUS * 1.45;
    p.chargingMelee = true;
    p.chargeReady = true;
    p.qi = 40;
    p.x = ventX;
    p.y = ventY;
    p.elevation = 0;

    testEngine.update(1 / 60, 1280, 720);

    expect(p.freezeTimer).toBeGreaterThan(4.9);
    expect(p.freezeTimer).toBeLessThanOrEqual(5.0);
    expect(p.royalShieldTimer).toBe(0);
    expect(p.eagleEyeTimer).toBe(0);
    expect(p.vampireTimer).toBe(0);
    expect(p.giantTimer).toBe(0);
    expect(p.sizeScale).toBe(1);
    expect(p.radius).toBeCloseTo(CHAR_BASE_RADIUS, 4);
    expect(p.chargingMelee).toBe(false);
    expect(p.chargeReady).toBe(false);
    const hudAfterFreeze = latestHud as HudSnapshot | null;
    expect(hudAfterFreeze?.player.activeTimedSkills.some((sk) => sk.id === 'frozen')).toBe(true);

    // While frozen: no passive Qi gain, melee click cannot charge Qi and suffers -10% swing speed
    const qiBefore = p.qi;
    p.activeHand = 1;
    p.swapTimer = 0;
    p.attackCooldown = 0;
    testEngine.setMouseDown(true);
    expect(p.chargingMelee).toBe(false);
    expect(p.chargeReady).toBe(false);
    const knife = meleeInHand(testEngine, 1);
    expect(p.attackCooldown).toBeCloseTo(1 / (knife.def.swingRate * 0.9), 3);
    testEngine.setMouseDown(false);

    // Measure frozen movement speed (-10%) from clear ground with matching activeHand = 0
    p.activeHand = 0;
    p.x = 2.5 * TILE;
    p.y = 6.5 * TILE;
    p.vx = 0;
    p.vy = 0;
    testEngine.setKey('KeyD', true);
    for (let i = 0; i < 15; i++) testEngine.update(1 / 30, 1280, 720);
    testEngine.setKey('KeyD', false);
    const frozenDx = p.x - 2.5 * TILE;
    expect(frozenDx / normalDx).toBeCloseTo(0.9, 1);
    expect(p.qi).toBeLessThanOrEqual(qiBefore + 0.001);

    // Enemy AI stepping onto the same ice_vent is also frozen for 5s and loses timed skills
    const enemy = testEngine.enemies[0];
    expect(enemy).toBeDefined();
    enemy.x = ventX;
    enemy.y = ventY;
    enemy.elevation = 0;
    enemy.royalShieldTimer = 4.0;
    enemy.chargingMelee = true;
    enemy.chargeReady = true;
    testEngine.update(1 / 60, 1280, 720);
    expect(enemy.freezeTimer).toBeGreaterThan(4.9);
    expect(enemy.royalShieldTimer).toBe(0);
    expect(enemy.chargingMelee).toBe(false);
    expect(enemy.chargeReady).toBe(false);
  });
});

describe('Polar objects: floatingIceTiles, campfires, igloo 3/5/5/5/3 footprint, and pushableIceBlocks shove & crush', () => {
  it('requires floatingIceTiles to sit strictly on water tiles and bridges split factions cleanly in BFS & gameplay', () => {
    const custom = createBlankCustomMap('浮冰測試圖', 'glacier_outdoor', 16, 12);
    custom.factionSpawns.royal.push({ gx: 2, gy: 5 });
    custom.factionSpawns.shadow.push({ gx: 12, gy: 5 });
    custom.factionSpawns.mercenary.push({ gx: 13, gy: 8 });

    // Full vertical river bisecting column gx = 7
    for (let gy = 0; gy < 12; gy++) {
      custom.waterTiles.push({ gx: 7, gy });
    }
    expect(validateCustomMap(custom).valid).toBe(false);

    // Floating ice placed on dry land (gx = 4) must be rejected
    custom.floatingIceTiles = [{ gx: 4, gy: 5 }];
    const badLandIce = validateCustomMap(custom);
    expect(badLandIce.valid).toBe(false);
    expect(badLandIce.errors.some((e) => e.includes('浮冰'))).toBe(true);

    // Floating ice placed on river tile (7, 5) restores cross-river BFS connectivity & player crossing
    custom.floatingIceTiles = [{ gx: 7, gy: 5 }];
    expect(validateCustomMap(custom).valid).toBe(true);

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      'glacier_rift',
      { royal: 100, shadow: 100, mercenary: 100 },
      () => {},
      undefined,
      custom
    );
    const p = engine.player;
    p.x = 6.5 * TILE;
    p.y = 5.5 * TILE;
    p.elevation = 0;
    engine.setKey('KeyD', true);
    for (let i = 0; i < 45; i++) engine.update(1 / 30, 1280, 720);
    engine.setKey('KeyD', false);
    expect(p.x).toBeGreaterThan(7.5 * TILE);
  });

  it('enforces exact 3/5/5/5/3 igloo mask across all 4 rotations, checks 21-cell uniform elevation, and allows interior entry', () => {
    const dirs: CardinalDir[] = ['south', 'north', 'east', 'west'];
    for (const dir of dirs) {
      const mask = getIglooCellMask(4, 4, dir);
      expect(mask.walls.length).toBe(11);
      expect(mask.interior.length).toBe(9);
      expect(mask.occupied.length).toBe(21);

      // Verify per-slice counts along depth axis are strictly [3, 5, 5, 5, 3]
      const counts = new Array(5).fill(0);
      for (const c of mask.occupied) {
        const lx = c.gx - 4;
        const ly = c.gy - 4;
        const slice = dir === 'south' || dir === 'north' ? ly : lx;
        counts[slice] += 1;
      }
      expect(counts).toEqual([3, 5, 5, 5, 3]);
    }

    const custom = createBlankCustomMap('冰屋測試圖', 'glacier_outdoor', 18, 14);
    custom.factionSpawns.royal.push({ gx: 1, gy: 1 });
    custom.factionSpawns.shadow.push({ gx: 15, gy: 1 });
    custom.factionSpawns.mercenary.push({ gx: 15, gy: 11 });
    custom.igloos = [{ gx: 6, gy: 4, direction: 'south' }];

    // One corner OUTSIDE the 3/5/5/5/3 mask (6,4) being elevated must still be valid
    custom.tileGrid[4][6] = { elev: 1, style: 'glacier_ice' };
    expect(validateCustomMap(custom).valid).toBe(true);

    // One cell INSIDE the 3/5/5/5/3 mask (e.g. entrance 6+2=8, 4+4=8) having different elevation fails validation
    custom.tileGrid[8][8] = { elev: 1, style: 'glacier_ice' };
    const badIgloo = validateCustomMap(custom);
    expect(badIgloo.valid).toBe(false);
    expect(badIgloo.errors.some((e) => e.includes('冰屋'))).toBe(true);

    // Reset and verify player walks through south entrance (8, 8) into center interior (8, 6)
    custom.tileGrid[8][8] = { elev: 0, style: 'default' };
    expect(validateCustomMap(custom).valid).toBe(true);

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      'glacier_rift',
      { royal: 100, shadow: 100, mercenary: 100 },
      () => {},
      undefined,
      custom
    );
    const p = engine.player;
    p.x = 8.5 * TILE;
    p.y = 9.5 * TILE;
    p.elevation = 0;
    engine.setKey('KeyW', true);
    for (let i = 0; i < 60; i++) engine.update(1 / 30, 1280, 720);
    engine.setKey('KeyW', false);
    // Player enters interior and stops smoothly at north back wall (gy = 4 wall bottom edge = 5 * TILE)
    expect(p.y).toBeLessThan(8.0 * TILE);
    expect(p.y).toBeGreaterThanOrEqual(5.4 * TILE);
  });

  it('slides pushable 2x2 ice block 1 tile after sustained push, blocks mismatched height, shoves open targets, and crushes pinned enemies to instant death', () => {
    const custom = createBlankCustomMap('推冰塊測試場', 'glacier_outdoor', 20, 14);
    custom.factionSpawns.royal.push({ gx: 1, gy: 1 });
    custom.factionSpawns.shadow.push({ gx: 17, gy: 1 });
    custom.factionSpawns.mercenary.push({ gx: 17, gy: 11 });
    custom.pushableIceBlocks = [{ gx: 6, gy: 5 }];
    // Plateau to the south blocks pushing onto +1.0 glacier terrain; solid wall at (10, 5..6) creates crush trap
    custom.tileGrid[7][6] = { elev: 1, style: 'glacier_ice' };
    custom.tileGrid[7][7] = { elev: 1, style: 'glacier_ice' };
    custom.obstacles.push(
      { gx: 10, gy: 5, gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'stone_wall_blue' },
      { gx: 10, gy: 6, gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'stone_wall_blue' }
    );

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      'glacier_rift',
      { royal: 100, shadow: 100, mercenary: 100 },
      () => {},
      undefined,
      custom
    );
    const p = engine.player;
    const blk = engine.map.pushableIceBlocks![0];
    expect(blk.elevation).toBe(1.5);

    // 1. Trying to push SOUTH onto +1.0 glacier plateau must NOT move the block
    p.x = 7.0 * TILE;
    p.y = 4.5 * TILE - CHAR_BASE_RADIUS * 0.85;
    p.elevation = 0;
    engine.setKey('KeyS', true);
    for (let i = 0; i < 20; i++) engine.update(1 / 30, 1280, 720);
    engine.setKey('KeyS', false);
    expect(blk.y).toBe(5 * TILE);

    // Clear all enemies except one enemy standing in open lane at (8.2, 6.0)
    const testEnemy = engine.enemies.find((e) => e.faction === 'shadow') ?? engine.enemies[0];
    expect(testEnemy).toBeDefined();
    engine.enemies = [testEnemy];
    testEnemy.x = 8.2 * TILE;
    testEnemy.y = 6.0 * TILE;
    testEnemy.elevation = 0;
    testEnemy.vx = 0;
    testEnemy.vy = 0;
    const enemyHpBeforeOpenShove = testEnemy.hp;

    // 2. Push EAST from west side of block -> slides +1 tile to gx = 7 (336px) and shoves enemy forward safely
    p.x = 6 * TILE - CHAR_BASE_RADIUS * 0.9;
    p.y = 6.0 * TILE;
    p.vx = 0;
    p.vy = 0;
    engine.setKey('KeyD', true);
    for (let i = 0; i < 25; i++) engine.update(1 / 30, 1280, 720);
    engine.setKey('KeyD', false);
    expect(blk.x).toBeCloseTo(7 * TILE, 1);
    expect(testEnemy.hp).toBe(enemyHpBeforeOpenShove);
    expect(testEnemy.x).toBeGreaterThanOrEqual(9 * TILE);

    // 3. Pin enemy directly against wall at gx = 10 (west face = 480px) while block slides from gx = 7 -> gx = 8 (east face = 480px)
    //Wait: block moves gx 7->8 (east edge = 480px? No, 8+2=10 => 480px! Zero gap between block at gx=8..10 and wall at gx=10!)
    testEnemy.x = 9.5 * TILE;
    testEnemy.y = 6.0 * TILE;
    testEnemy.vx = 0;
    testEnemy.vy = 0;
    testEnemy.elevation = 0;
    testEnemy.hp = 100;
    const killsBefore = p.kills;

    p.x = blk.x - CHAR_BASE_RADIUS * 0.9;
    p.y = 6.0 * TILE;
    engine.setKey('KeyD', true);
    for (let i = 0; i < 25; i++) {
      // Hold enemy pinned in lane (don't let AI wander out before crush!)
      if (engine.enemies.includes(testEnemy)) {
        testEnemy.y = 6.0 * TILE;
        testEnemy.vx = 0;
        testEnemy.vy = 0;
      }
      engine.update(1 / 30, 1280, 720);
    }
    engine.setKey('KeyD', false);

    expect(blk.x).toBeCloseTo(8 * TILE, 1);
    expect(testEnemy.hp).toBe(0);
    expect(engine.enemies.includes(testEnemy)).toBe(false);
    expect(p.kills).toBe(killsBefore + 1);
  });
});

describe('Igloo diagonal corner occlusion and AI crosshair bloom/spread parity', () => {
  it('blocks LoS and gunfire diagonally through all 4 igloo corners (insider and outsider) while keeping the entrance open', () => {
    const custom = createBlankCustomMap('冰屋牆縫阻擋測試', 'glacier_outdoor', 16, 14);
    custom.factionSpawns.royal.push({ gx: 1, gy: 1 });
    custom.factionSpawns.shadow.push({ gx: 13, gy: 1 });
    custom.factionSpawns.mercenary.push({ gx: 13, gy: 11 });
    custom.igloos = [{ gx: 5, gy: 4, direction: 'south' }];

    const engine = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      'glacier_rift',
      { royal: 100, shadow: 100, mercenary: 100 },
      () => {},
      undefined,
      custom
    );

    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    enemy.speed = 0;
    enemy.elevation = 0;
    const p = engine.player;
    p.elevation = 0;

    // Test all 4 diagonal corners of the 5x5 igloo at (5,4):
    // NW: interior (6,5) <-> exterior (5,4)
    // NE: interior (8,5) <-> exterior (9,4)
    // SW: interior (6,7) <-> exterior (5,8)
    // SE: interior (8,7) <-> exterior (9,8)
    const cornerPairs = [
      { inX: 6.45 * TILE, inY: 5.45 * TILE, outX: 5.5 * TILE, outY: 4.5 * TILE },
      { inX: 8.55 * TILE, inY: 5.45 * TILE, outX: 9.5 * TILE, outY: 4.5 * TILE },
      { inX: 6.45 * TILE, inY: 7.55 * TILE, outX: 5.5 * TILE, outY: 8.5 * TILE },
      { inX: 8.55 * TILE, inY: 7.55 * TILE, outX: 9.5 * TILE, outY: 8.5 * TILE },
    ];

    for (const pair of cornerPairs) {
      p.x = pair.inX;
      p.y = pair.inY;
      enemy.x = pair.outX;
      enemy.y = pair.outY;
      enemy.hp = 100;
      enemy.hasLosToTarget = false;
      enemy.visibleTargetId = null;

      // 1. Enemy outside MUST NOT gain LoS into igloo corner
      engine.update(0.05, 1280, 720);
      expect(enemy.hasLosToTarget).toBe(false);

      // 2. Player inside corner shooting diagonally out MUST NOT pierce the corner wall seam or hit outsider
      p.angle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      p.attackCooldown = 0;
      p.weapons[0] = { type: 'gun', def: GUNS.find((g) => g.kind === 'sniper')!, ammoInMag: 1, reloadTimer: 0 };
      p.activeHand = 0;
      engine.setMouseDown(true);
      engine.setMouseDown(false);
      expect(enemy.hp).toBe(100);

      // 3. Outsider shooting diagonally in MUST NOT hit insider either
      const pHpBefore = p.hp;
      const aimIn = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      const fireEnemyGunHitscan = (
        engine as unknown as {
          fireEnemyGunHitscan: (
            ent: EnemyEntity,
            ang: number,
            w: Extract<EnemyEntity['weapons'][number], { type: 'gun' }>,
            d?: number
          ) => void;
        }
      ).fireEnemyGunHitscan.bind(engine);
      const sniperWeapon: Extract<EnemyEntity['weapons'][number], { type: 'gun' }> = {
        type: 'gun',
        def: GUNS.find((g) => g.kind === 'sniper')!,
        ammoInMag: 1,
        reloadTimer: 0,
      };
      fireEnemyGunHitscan(enemy, aimIn, sniperWeapon, 80);
      expect(p.hp).toBe(pHpBefore);
    }

    // Open south entrance at (7, 8) -> (7, 9) MUST allow clear LoS
    p.x = 7.5 * TILE;
    p.y = 7.5 * TILE;
    enemy.x = 7.5 * TILE;
    enemy.y = 9.5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
  });

  it('applies crosshair bloom, aim-sweep bloom, recovery, Eagle Eye tightening, and hand-swap reset to AI gunfire', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    engine.pickups = [];
    enemy.speed = 0;
    enemy.x = 10.5 * TILE;
    enemy.y = 19.3 * TILE;
    enemy.elevation = 0;

    const rifleDef = GUNS.find((g) => g.kind === 'rifle')!;
    const knifeDef = MELEES.find((m) => m.kind === 'knife')!;
    enemy.weapons = [
      { type: 'gun', def: rifleDef, ammoInMag: rifleDef.magSize, reloadTimer: 0 },
      { type: 'melee', def: knifeDef, durability: 0 },
    ];
    enemy.activeHand = 0;
    enemy.crosshairBloom = 0;
    enemy.lastAimAngle = 0;
    enemy.angle = 0;

    // Place player straight east at 280px with clear LoS
    engine.player.x = enemy.x + 280;
    engine.player.y = enemy.y;
    engine.player.elevation = 0;
    engine.player.invulnTimer = 0;

    // 1. Firing multiple rapid rifle shots grows AI crosshairBloom up to (maxCrosshair - baseCrosshair)
    const fireEnemyGunHitscan = (
      engine as unknown as {
        fireEnemyGunHitscan: (
          ent: EnemyEntity,
          ang: number,
          w: Extract<EnemyEntity['weapons'][number], { type: 'gun' }>,
          d?: number
        ) => void;
      }
    ).fireEnemyGunHitscan.bind(engine);

    const gunSlot = enemy.weapons[0] as Extract<EnemyEntity['weapons'][number], { type: 'gun' }>;
    fireEnemyGunHitscan(enemy, 0, gunSlot, 280);
    expect(enemy.crosshairBloom).toBeCloseTo(rifleDef.bloomPerShot, 3);

    for (let i = 0; i < 6; i++) {
      fireEnemyGunHitscan(enemy, 0, gunSlot, 280);
    }
    const maxBloom = rifleDef.maxCrosshair - rifleDef.baseCrosshair;
    expect(enemy.crosshairBloom).toBeCloseTo(maxBloom, 3);

    // 2. When crosshairBloom is maxed at long range, enemy beams span significant dispersion around aimAngle
    engine.beams = [];
    const savedRandom = Math.random;
    const anglesObserved: number[] = [];
    try {
      // Deterministic extremes (0 and 0.9999) + midpoint (0.5)
      for (const r of [0.001, 0.999]) {
        Math.random = () => r;
        engine.beams = [];
        enemy.crosshairBloom = maxBloom;
        fireEnemyGunHitscan(enemy, 0, gunSlot, 400);
        const beam = engine.beams[0];
        anglesObserved.push(Math.atan2(beam.y2 - beam.y1, beam.x2 - beam.x1));
      }
    } finally {
      Math.random = savedRandom;
    }
    const spreadSpan = Math.abs(anglesObserved[1] - anglesObserved[0]);
    const expectedSpan = getGunSpread('rifle', rifleDef.maxCrosshair, 400, AI_GUN_AIM.spreadMult);
    expect(spreadSpan).toBeGreaterThan(expectedSpan * 0.9);

    // 3. Eagle Eye tightens AI spread to 0.45x (still scaled by AI_GUN_AIM.spreadMult)
    enemy.eagleEyeTimer = 5.0;
    enemy.crosshairBloom = maxBloom;
    const eagleAngles: number[] = [];
    try {
      for (const r of [0.001, 0.999]) {
        Math.random = () => r;
        engine.beams = [];
        fireEnemyGunHitscan(enemy, 0, gunSlot, 320);
        const beam = engine.beams[0];
        eagleAngles.push(Math.atan2(beam.y2 - beam.y1, beam.x2 - beam.x1));
      }
    } finally {
      Math.random = savedRandom;
    }
    const eagleSpan = Math.abs(eagleAngles[1] - eagleAngles[0]);
    const expectedEagleSpan = getGunSpread('rifle', rifleDef.maxCrosshair, 320, 0.45 * AI_GUN_AIM.spreadMult);
    expect(eagleSpan).toBeCloseTo(expectedEagleSpan, 2);
    expect(eagleSpan).toBeLessThan(spreadSpan);

    // 4. Bloom recovers over time in updateEnemies and resets to 0 on hand swap
    gunSlot.ammoInMag = rifleDef.magSize;
    enemy.eagleEyeTimer = 0;
    enemy.crosshairBloom = 30;
    enemy.attackCooldown = 99;
    enemy.reactionTimer = 0;
    enemy.lastAimAngle = 0;
    enemy.angle = 0;
    engine.player.x = enemy.x + 220;
    engine.player.y = enemy.y;
    engine.update(0.5, 1280, 720);
    // Recovers by GUN_AIM.bloomRecovery * 0.5 (=10) with minor human mouse-tracking wobble
    expect(enemy.crosshairBloom).toBeLessThan(23);
    expect(enemy.crosshairBloom).toBeGreaterThan(18);

    // Rapid 90 deg flank (clear open aisle north at 120px): AI turns smoothly and accumulates aim-sweep bloom
    const bloomBeforeSnap = enemy.crosshairBloom;
    engine.player.x = enemy.x;
    engine.player.y = enemy.y - 120;
    engine.update(1 / 60, 1280, 720);
    expect(Math.abs(enemy.angle)).toBeLessThan(0.25); // Did NOT teleport 90 deg in 1 frame
    for (let i = 0; i < 16; i++) {
      engine.update(1 / 60, 1280, 720);
    }
    expect(enemy.crosshairBloom).toBeGreaterThan(bloomBeforeSnap + 3);

    // Hand swap resets bloom cleanly
    const switchEnemyHand = (
      engine as unknown as { switchEnemyHand: (ent: EnemyEntity, hand: 0 | 1) => void }
    ).switchEnemyHand.bind(engine);
    switchEnemyHand(enemy, 1);
    expect(enemy.crosshairBloom).toBe(0);
  });
});

describe('3D elevation LoS/bullet occlusion and AI mouse-turn & gunfire cadence nerf', () => {
  it('blocks elevated-to-low LoS and bullets over open ground behind high crates (industrial_warehouse 20,11 -> 16,16 -> 16,18)', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const internals = engine as unknown as {
      hasLineOfSight: (ax: number, ay: number, ae: number, bx: number, by: number, be: number, r: number) => boolean;
      canRangedHitTarget: (ax: number, ay: number, ae: number, bx: number, by: number, be: number) => boolean;
      traceBulletSegment: (
        x1: number,
        y1: number,
        a: number,
        d: number,
        e: number,
        b?: boolean
      ) => { x1: number; y1: number; x2: number; y2: number };
    };

    // Shooter standing on (20,11) 2x2 1.5 crate -> open 0.0 aisle -> (16,16) 2x2 1.5 crate -> target at (16,18) 0.0 ground
    const sx = 20.5 * TILE;
    const sy = 12.5 * TILE;
    const tx = 16.5 * TILE;
    const ty = 18.5 * TILE;
    expect(internals.hasLineOfSight(sx, sy, 1.5, tx, ty, 0, 9.5 * TILE)).toBe(false);
    expect(internals.canRangedHitTarget(sx, sy, 1.5, tx, ty, 0)).toBe(false);

    // Directional ray from (20,11) toward (16,18) drops over open ground and stops inside (16,16) crate
    const shotAng = Math.atan2(ty - sy, tx - sx);
    const seg = internals.traceBulletSegment(sx, sy, shotAng, 12 * TILE, 1.5, false);
    expect(Math.hypot(seg.x2 - sx, seg.y2 - sy)).toBeLessThan(Math.hypot(tx - sx, ty - sy) - 10);

    // Actual player rifle shot from (20,11) toward enemy at (16,18) (even with cursor placed past enemy) deals 0 damage
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    enemy.x = tx;
    enemy.y = ty;
    enemy.elevation = 0;
    enemy.hp = 100;
    enemy.royalShieldTimer = 0;
    enemy.shadowCloneTimer = 0;

    engine.player.x = sx;
    engine.player.y = sy;
    engine.player.elevation = 1.5;
    engine.player.activeHand = 0;
    gunInHand(engine).def = GUNS.find((g) => g.kind === 'sniper')!;
    gunInHand(engine).ammoInMag = 5;
    engine.player.attackCooldown = 0;
    engine.player.swapTimer = 0;
    engine.player.angle = shotAng;
    engine.setMouseDown(true);
    engine.update(1 / 60, 1280, 720);
    engine.setMouseDown(false);
    expect(enemy.hp).toBe(100);

    // Meanwhile, target standing ON TOP of (16,16) (1.5) or on the 0.0 aisle between (20,11) & (16,16) IS visible and hittable!
    expect(internals.hasLineOfSight(sx, sy, 1.5, 17.0 * TILE, 17.0 * TILE, 1.5, 9.5 * TILE)).toBe(true);
    expect(internals.canRangedHitTarget(sx, sy, 1.5, 17.0 * TILE, 17.0 * TILE, 1.5)).toBe(true);
    enemy.x = 17.0 * TILE;
    enemy.y = 17.0 * TILE;
    enemy.elevation = 1.5;
    engine.player.attackCooldown = 0;
    engine.player.angle = Math.atan2(enemy.y - sy, enemy.x - sx);
    engine.setMouseDown(true);
    engine.update(1 / 60, 1280, 720);
    engine.setMouseDown(false);
    expect(enemy.hp).toBeLessThan(100);
  });

  it('prevents 2.0 plateau shooter from seeing/hitting 0.0 targets behind another 2.0 plateau while allowing 2.0-to-2.0 valley dueling', () => {
    const map = createBlankCustomMap('雙高台對射測試', 'desert_outdoor', 24, 18);
    map.factionSpawns.royal = [{ gx: 2, gy: 9 }];
    map.factionSpawns.shadow = [{ gx: 21, gy: 9 }];
    map.factionSpawns.mercenary = [{ gx: 12, gy: 15 }];
    // West 2.0 plateau (4..6, 7..11), 0.0 valley (7..12), East 2.0 plateau (13..15, 7..11)
    for (let gy = 7; gy <= 11; gy++) {
      for (let gx = 4; gx <= 6; gx++) map.tileGrid[gy][gx] = { elev: 2.0, style: 'pyramid' };
      for (let gx = 13; gx <= 15; gx++) map.tileGrid[gy][gx] = { elev: 2.0, style: 'pyramid' };
    }
    const engine = new TwilightEngine('royal', FACTION_CHARACTERS.royal[0], map.id, { royal: 10, shadow: 10, mercenary: 10 }, () => {}, () => {}, map);
    const internals = engine as unknown as {
      hasLineOfSight: (ax: number, ay: number, ae: number, bx: number, by: number, be: number, r: number) => boolean;
      canRangedHitTarget: (ax: number, ay: number, ae: number, bx: number, by: number, be: number) => boolean;
    };

    // 2.0 plateau -> 0.0 target hugging right behind East 2.0 plateau at (16.5, 9.5) is BLOCKED
    expect(internals.hasLineOfSight(5.5 * TILE, 9.5 * TILE, 2.0, 16.5 * TILE, 9.5 * TILE, 0, 14 * TILE)).toBe(false);
    expect(internals.canRangedHitTarget(5.5 * TILE, 9.5 * TILE, 2.0, 16.5 * TILE, 9.5 * TILE, 0)).toBe(false);

    // 2.0 plateau -> 2.0 target standing atop East 2.0 plateau at (14.5, 9.5) across the 0.0 valley IS CLEAR
    expect(internals.hasLineOfSight(5.5 * TILE, 9.5 * TILE, 2.0, 14.5 * TILE, 9.5 * TILE, 2.0, 14 * TILE)).toBe(true);
    expect(internals.canRangedHitTarget(5.5 * TILE, 9.5 * TILE, 2.0, 14.5 * TILE, 9.5 * TILE, 2.0)).toBe(true);
  });

  it('nerfs AI gun fire rate and enforces finite mouse turn rate before opening fire', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    engine.enemies = [enemy];
    engine.pickups = [];
    enemy.speed = 0;
    // Open south lane (gy=18.5, no shrine wall between gx=8.5 and gx=12.5)
    enemy.x = 12.5 * TILE;
    enemy.y = 18.5 * TILE;
    enemy.elevation = 0;

    const rifle = GUNS.find((g) => g.kind === 'rifle')!;
    enemy.weapons[0] = { type: 'gun', def: rifle, ammoInMag: rifle.magSize, reloadTimer: 0 };
    enemy.activeHand = 0;
    enemy.reactionTimer = 0;
    enemy.attackCooldown = 0;
    // Facing East (0 rad), player appears directly West (180 deg behind)
    enemy.angle = 0;
    enemy.lastAimAngle = 0;
    engine.player.x = 8.5 * TILE;
    engine.player.y = 18.5 * TILE;
    engine.player.elevation = 0;
    engine.player.invulnTimer = 99;

    // 1. After 1 frame (1/60s), AI has NOT snapped 180 deg and CANNOT shoot backward
    engine.beams = [];
    engine.update(1 / 60, 1280, 720);
    expect(Math.abs(enemy.angle)).toBeLessThan(0.5);
    expect(engine.beams.length).toBe(0);

    // 2. After completing human-like turn + reaction (~1.2s), AI fires and sets nerfed gun cooldown (> 1.5x player base interval)
    for (let i = 0; i < 90; i++) {
      engine.update(1 / 60, 1280, 720);
      if (engine.beams.length > 0) break;
    }
    expect(engine.beams.length).toBeGreaterThan(0);
    expect(enemy.attackCooldown).toBeGreaterThan((1 / rifle.fireRate) * 1.5);
  });
});


