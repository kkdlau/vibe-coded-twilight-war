import { describe, expect, it } from 'vitest';
import { FACTION_CHARACTERS, GUNS, MELEES, getReputationQiMultiplier, getWeaponSwapDuration } from './data';
import { TwilightEngine, snapToEightDirections } from './engine';
import { TILE, createArenaMap } from './maps';
import { EnemyEntity, FactionId, HudSnapshot, MapId } from './types';

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
    engine.player.ammoInMag = 2;
    engine.player.reserveAmmo = 30;

    engine.setKey('KeyR', true);
    engine.setKey('KeyR', false);

    expect(engine.player.reloadTimer).toBeGreaterThan(0);
    expect(getHud()!.player.reloadProgress).toBeGreaterThan(0);

    // Advance past pistol reload time (0.95s)
    engine.update(0.5, 1280, 720);
    engine.update(0.6, 1280, 720);

    expect(engine.player.reloadTimer).toBe(0);
    expect(engine.player.ammoInMag).toBe(engine.player.gun.magSize);
    expect(engine.player.reserveAmmo).toBe(26);
  });

  it('gives all 4 ranged guns infinite map-spanning range and stops on first hit (no multi-target pierce)', () => {
    for (const g of GUNS) {
      expect(g.range).toBeGreaterThanOrEqual(9000);
    }

    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    // Place player on clear left lane and two shadow enemies lined up far away (> 900px from player!)
    engine.player.x = 1.5 * TILE;
    engine.player.y = 9.5 * TILE;
    engine.player.elevation = 0;
    engine.player.angle = 0;
    engine.player.gun = GUNS.find((g) => g.kind === 'pistol')!;
    engine.player.ammoInMag = 6;

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

    // Fire pistol via mouseDown: must hit the first distant enemy (~984px away) and NOT pierce the second!
    const hp1Before = shadowEnemies[0].hp;
    const hp2Before = shadowEnemies[1].hp;
    engine.setMouseDown(true);
    engine.setMouseDown(false);

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
    engine.player.activeSlot = 'gun';
    engine.setMouseDown(true);
    engine.setMouseDown(false);

    expect(engine.player.royalShieldTimer).toBe(0);
  });
});

describe('Default loadout, player respawn, and map crate placement invariants', () => {
  it('gives every faction (including Shadow) pistol and knife as default starting weapons', () => {
    for (const fac of ['royal', 'shadow', 'mercenary'] as FactionId[]) {
      const { engine } = createTestEngine(fac, 'tokyo_shrine', 10);
      expect(engine.player.gun.kind).toBe('pistol');
      expect(engine.player.melee.kind).toBe('knife');
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
    expect(engine.player.hp).toBe(engine.player.maxHp);
    expect(engine.player.x).toBe(spawnPt.x);
    expect(engine.player.y).toBe(spawnPt.y);
    expect(engine.player.elevation).toBe(0);
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
    engine.player.gun = shotgun;
    engine.player.ammoInMag = 5;
    engine.player.reserveAmmo = 30;
    engine.player.activeSlot = 'gun';
    engine.beams = [];

    engine.setMouseDown(true);
    engine.setMouseDown(false);

    expect(engine.beams.length).toBe(5);
    expect(engine.player.ammoInMag).toBe(0);
    // Must NOT auto-reload when hitting 0/5
    expect(engine.player.reloadTimer).toBe(0);

    // Clicking again while 0/5 triggers reload
    engine.setMouseDown(true);
    engine.setMouseDown(false);
    expect(engine.player.reloadTimer).toBeGreaterThan(0);
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

  it('guarantees all faction spawns are mutually reachable and all weapons/ammo/shields are reachable by elevation rules on all 7 maps', () => {
    const mapIds: MapId[] = [
      'tokyo_shrine',
      'european_castle',
      'desert_ruins',
      'industrial_warehouse',
      'western_railway',
      'bamboo_fortress',
      'stanley_island',
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
  });
});

describe('Enemy sight radius (8 tiles), hit-based target switching, and A* elevation navigation', () => {
  it('sets normal enemy sight radius to 8 tiles so targets >= 8.5 tiles away are not spotted while <= 7.8 tiles are spotted', () => {
    const { engine } = createTestEngine('royal', 'european_castle', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    enemy.archetype = 'trooper';
    enemy.gunKind = 'pistol';
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
      expect(e.gunKind).toBe('pistol');
      expect(e.meleeKind).toBe('knife');
    }

    const countNonDefaultWeapons = () => {
      let total = engine.pickups.filter((pk) => pk.kind === 'gun' || pk.kind === 'melee').length;
      if (engine.player.gun.kind !== 'pistol') total += 1;
      if (engine.player.melee.kind !== 'knife') total += 1;
      for (const e of engine.enemies) {
        if (e.gunKind !== 'pistol') total += 1;
        if (e.meleeKind !== 'knife') total += 1;
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

    expect(engine.player.gun.kind).toBe('rifle');
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'pistol')).toBe(false);
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    // 2. Player picks up a claw while holding default knife -> knife MUST NOT drop onto ground
    const clawPickup = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'claw')!;
    engine.player.x = clawPickup.x;
    engine.player.y = clawPickup.y;
    engine.tryPickup();

    expect(engine.player.melee.kind).toBe('claw');
    expect(engine.pickups.some((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'knife')).toBe(false);
    expect(countNonDefaultWeapons()).toBe(initialPoolCount);

    // 3. Player swaps rifle with shotgun -> old rifle DOES drop, pool stays constant
    const shotgunPickup = engine.pickups.find((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'shotgun')!;
    engine.player.x = shotgunPickup.x;
    engine.player.y = shotgunPickup.y;
    engine.tryPickup();

    expect(engine.player.gun.kind).toBe('shotgun');
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
    expect(enemy.gunKind).toBe('sniper');
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
    seekEnemy.skillCooldown = 99;
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

  it('switches enemy to ranged gun when target is hittable at distance, and to lightest weapon when elevation blocks ranged shots', () => {
    const { engine } = createTestEngine('royal', 'industrial_warehouse', 10);
    const enemy = engine.enemies.find((e) => e.faction === 'shadow')!;
    for (const other of engine.enemies) {
      if (other !== enemy) {
        other.x = 26.5 * TILE;
        other.y = 1.5 * TILE;
      }
    }

    // Scenario 1: Same elevation (0.0) on open bottom lane, 5 tiles apart -> enemy equips 'gun'
    enemy.gunKind = 'sniper';
    enemy.meleeKind = 'claw';
    enemy.x = 12.5 * TILE;
    enemy.y = 19.3 * TILE;
    enemy.elevation = 0;
    enemy.skillCooldown = 99;
    engine.player.x = 17.5 * TILE;
    engine.player.y = 19.3 * TILE;
    engine.player.elevation = 0;

    engine.update(0.05, 1280, 720);
    expect(enemy.hasLosToTarget).toBe(true);
    expect(enemy.activeSlot).toBe('gun');

    // Scenario 2: Player stands on top of a 2.0 shipping container at (10.5, 10.5), enemy is below at (13.5, 10.5) (elev 0.0)
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
    expect(enemy.activeSlot).toBe('melee');

    // Scenario 3: If enemy holds heavy greatsword (0.82) + pistol (0.98), lightest weapon is 'gun' (pistol)
    enemy.gunKind = 'pistol';
    enemy.meleeKind = 'greatsword';
    engine.update(0.05, 1280, 720);
    expect(enemy.activeSlot).toBe('gun');
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

describe('Esc drops current weapon without pausing, 1/2 equips gun/melee hand, and enemies match faction UI roster', () => {
  it('pressing Escape drops held non-default weapon onto map and reverts to pistol/knife without pausing', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);

    // Pick up a rifle into gun slot and a claw into melee slot
    const riflePickup = engine.pickups.find((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle')!;
    engine.player.x = riflePickup.x;
    engine.player.y = riflePickup.y;
    engine.tryPickup();
    expect(engine.player.gun.kind).toBe('rifle');

    const clawPickup = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'claw')!;
    engine.player.x = clawPickup.x;
    engine.player.y = clawPickup.y;
    engine.tryPickup();
    expect(engine.player.melee.kind).toBe('claw');

    // Digit1 equips first hand (gun), press Esc -> drops rifle back onto map, reverts to pistol, stays PLAYING
    engine.setKey('Digit1', true);
    engine.setKey('Digit1', false);
    expect(engine.player.activeSlot).toBe('gun');

    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.status).toBe('PLAYING');
    expect(engine.player.gun.kind).toBe('pistol');
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle')).toBe(true);

    // Pressing Esc again while holding default pistol does not drop pistol or pause
    const countBefore = engine.pickups.length;
    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.status).toBe('PLAYING');
    expect(engine.pickups.length).toBe(countBefore);

    // Digit2 equips second hand (melee), press Esc -> drops claw back onto map, reverts to knife
    engine.setKey('Digit2', true);
    engine.setKey('Digit2', false);
    expect(engine.player.activeSlot).toBe('melee');

    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.status).toBe('PLAYING');
    expect(engine.player.melee.kind).toBe('knife');
    expect(engine.pickups.some((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'claw')).toBe(true);
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
    expect(engine.player.melee.kind).toBe('knife');
    expect(engine.player.shield).toBe(0);
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

    engine.player.x = shieldPickup.x;
    engine.player.y = shieldPickup.y;
    engine.tryPickup();
    expect(engine.player.melee.kind).toBe('shield');
    expect(engine.player.shield).toBe(100);

    // 3. Blocking ONLY happens when shield is actively held in hand (activeSlot === 'melee')
    engine.player.activeSlot = 'gun';
    engine.player.angle = 0;
    engine.player.invulnTimer = 0;
    const hpGun = engine.player.hp;
    damagePlayer(30, false, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 30);
    expect(engine.player.shield).toBe(100);

    // Switch back to shield -> frontal bullet is absorbed by shield durability
    engine.player.activeSlot = 'melee';
    engine.player.angle = 0;
    engine.player.invulnTimer = 0;
    damagePlayer(40, false, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 30);
    expect(engine.player.shield).toBe(60);

    // 4. Side (90 deg) and rear (180 deg) attacks bypass frontal shield completely
    engine.player.invulnTimer = 0;
    damagePlayer(15, false, undefined, engine.player.x, engine.player.y + 120);
    expect(engine.player.hp).toBe(hpGun - 45);
    expect(engine.player.shield).toBe(60);

    engine.player.invulnTimer = 0;
    damagePlayer(10, true, undefined, engine.player.x - 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 55);
    expect(engine.player.shield).toBe(60);

    // Frontal melee attack halves HP damage and reduces shield durability
    engine.player.invulnTimer = 0;
    damagePlayer(20, true, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.hp).toBe(hpGun - 65);
    expect(engine.player.shield).toBe(50);

    // 5. Left-click normal melee with shield shoves & stuns target
    const enemy = engine.enemies[0];
    engine.player.x = 12 * TILE;
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
    engine.setMouseDown(true);
    engine.setMouseDown(false);
    expect(enemy.x).toBeGreaterThan(exBefore);
    expect(enemy.stunTimer).toBeGreaterThan(0);

    // 6. Dropping shield (Esc) preserves exact durability (50), AI pickup/death or re-pickup preserves 50
    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.player.melee.kind).toBe('knife');
    expect(engine.player.shield).toBe(0);
    const droppedShield = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'shield' && pk.durability === 50)!;
    expect(droppedShield).toBeTruthy();

    // Enemy picks up dropped shield (50 durability) and then player picks it back after enemy drops/dies
    enemy.stunTimer = 0;
    enemy.meleeKind = 'knife';
    enemy.x = droppedShield.x;
    enemy.y = droppedShield.y;
    engine.player.x = 2.5 * TILE;
    engine.player.y = 19.5 * TILE;
    engine.update(0.05, 1280, 720);
    expect(enemy.meleeKind).toBe('shield');
    expect(enemy.shieldDurability).toBe(50);

    enemy.hp = 1;
    enemy.shieldDurability = 37;
    enemy.activeSlot = 'gun';
    const damageEnemy = (engine as unknown as {
      damageEnemy: (t: EnemyEntity, d: number, m: boolean, kx: number, ky: number, b: boolean, nff: boolean, id: string, fac: FactionId) => void;
    }).damageEnemy.bind(engine);
    damageEnemy(enemy, 50, true, 0, 0, false, false, 'player', 'mercenary');
    const reDropped = engine.pickups.find((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'shield' && pk.durability === 37)!;
    expect(reDropped).toBeTruthy();

    engine.player.x = reDropped.x;
    engine.player.y = reDropped.y;
    engine.tryPickup();
    expect(engine.player.melee.kind).toBe('shield');
    expect(engine.player.shield).toBe(37);

    // 7. Shield Qi skill restores held shield durability to 100
    engine.player.activeSlot = 'melee';
    engine.player.qi = engine.player.maxQi;
    engine.setMouseDown(true);
    engine.update(1.5, 1280, 720);
    expect(engine.player.chargeReady).toBe(true);
    engine.setMouseDown(false);
    expect(engine.player.shield).toBe(100);

    // 8. Dropping to 0 durability shatters shield back to knife
    engine.player.invulnTimer = 0;
    damagePlayer(150, false, undefined, engine.player.x + 120, engine.player.y);
    expect(engine.player.shield).toBe(0);
    expect(engine.player.melee.kind).toBe('knife');
  });

  it('drops non-default weapons on player death and resets to pistol, knife, and 0 shield on respawn', () => {
    const { engine } = createTestEngine('royal', 'tokyo_shrine', 10);
    engine.player.gun = GUNS.find((g) => g.kind === 'rifle')!;
    engine.player.melee = MELEES.find((m) => m.kind === 'greatsword')!;
    engine.player.shield = 0;
    engine.player.invulnTimer = 0;
    const deathX = engine.player.x;
    const deathY = engine.player.y;

    (engine as unknown as {
      damagePlayer: (rawDmg: number, isMelee: boolean) => void;
    }).damagePlayer(999, true);

    expect(engine.player.lives).toBe(2);
    expect(engine.player.gun.kind).toBe('pistol');
    expect(engine.player.melee.kind).toBe('knife');
    expect(engine.player.shield).toBe(0);
    expect(engine.pickups.some((pk) => pk.kind === 'gun' && pk.gunDef?.kind === 'rifle' && Math.hypot(pk.x - deathX, pk.y - deathY) < 40)).toBe(true);
    expect(engine.pickups.some((pk) => pk.kind === 'melee' && pk.meleeDef?.kind === 'greatsword' && Math.hypot(pk.x - deathX, pk.y - deathY) < 40)).toBe(true);
  });

  it('fires yellow friendly-fire Light Orbs for Royal Greatsword and slow bouncing non-FF Black Dragon (head 20 / body 15) for Shadow Greatsword', () => {
    // 1. Royal Light Orbs are yellow and hurt teammates
    const { engine: rEng } = createTestEngine('royal', 'european_castle', 10);
    const ally = rEng.enemies.find((e) => e.faction === 'royal')!;
    rEng.player.activeSlot = 'melee';
    rEng.player.melee = MELEES.find((m) => m.kind === 'greatsword')!;
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
    const sAlly = sEng.enemies.find((e) => e.faction === 'shadow')!;
    sEng.player.activeSlot = 'melee';
    sEng.player.melee = MELEES.find((m) => m.kind === 'greatsword')!;
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
    engine.player.melee = MELEES.find((m) => m.kind === 'greatsword')!;
    engine.player.activeSlot = 'gun';
    engine.switchWeapon();
    const gsSwap = engine.player.swapTimer;

    engine.player.melee = MELEES.find((m) => m.kind === 'claw')!;
    engine.player.activeSlot = 'gun';
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
    engine.player.activeSlot = 'melee';
    engine.player.melee = MELEES.find((m) => m.kind === 'knife')!;
    engine.player.qi = engine.player.maxQi;
    engine.setMouseDown(true);
    engine.update(1.5, 1280, 720);
    expect(engine.player.chargeReady).toBe(true);
    engine.setMouseDown(false);

    expect(engine.player.shield).toBe(0);
    expect(getHud()!.player.activeTimedSkills.some((s) => s.id === 'vampire')).toBe(true);
  });
});

describe('Map redesigns, allied spawn proximity, and character title format', () => {
  it('places allied royal and shadow spawns nearby (<= 3.5 tiles apart) on all 7 maps', () => {
    const allMaps: MapId[] = [
      'tokyo_shrine',
      'european_castle',
      'desert_ruins',
      'industrial_warehouse',
      'western_railway',
      'bamboo_fortress',
      'stanley_island',
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
    const railCount = railway.tileGrid.flat().filter((t) => t.style === 'rail_track').length;
    expect(railCount).toBeGreaterThan(20);
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
    engine.player.activeSlot = 'melee';
    engine.player.melee = MELEES.find((m) => m.kind === 'knife')!;
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
    engine.player.activeSlot = 'melee';
    engine.player.melee = MELEES.find((m) => m.kind === 'greatsword')!;
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





