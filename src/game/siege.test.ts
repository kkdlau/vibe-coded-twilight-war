import { describe, expect, it } from 'vitest';
import { FACTION_CHARACTERS } from './data';
import { TwilightEngine } from './engine';
import { TILE } from './maps';
import { SIEGE_CONFIG, SIEGE_HERO_PRESETS, SIEGE_PASSIVES, SIEGE_TACTICAL_SKILLS, SIEGE_ULTIMATE_SKILLS, SIEGE_UPGRADES, getDefaultSiegeLoadout } from './siegeData';
import { applySiegeDefenseReduction, computeSiegeDefense, computeSiegeGunFalloffMult, computeSiegeMaxHp, computeSiegeMoveSpeedMult, getSiegeGunProfile, grantSiegeXpAndGold } from './siegeHelpers';
import { SIEGE_MAP_ID, createSiegeMapSpec } from './siegeMap';
import { HudSnapshot, SiegeFactionId, SiegePlayerLoadout } from './types';

function createSiegeEngine(
  faction: SiegeFactionId = 'royal',
  loadoutOverride?: Partial<SiegePlayerLoadout>,
  durationSec: 900 | 1080 | 1200 = 1080
) {
  let latestHud: HudSnapshot | null = null;
  const skin = FACTION_CHARACTERS[faction][0];
  const baseLoadout = getDefaultSiegeLoadout(faction, skin.id);
  const loadout: SiegePlayerLoadout = { ...baseLoadout, ...loadoutOverride };

  const engine = new TwilightEngine(
    faction,
    skin,
    SIEGE_MAP_ID,
    { royal: 0, shadow: 0, mercenary: 0 },
    (snap) => {
      latestHud = snap;
    },
    undefined,
    undefined,
    'standard',
    undefined,
    'siege',
    { loadout, durationSec }
  );

  return { engine, getHud: () => latestHud };
}

describe('3-Lane Castle Siege / MOBA Mode (siege)', () => {
  it('builds a symmetric 54x54 3-lane map with zero floor pickups and full A* reachability', () => {
    const { engine } = createSiegeEngine('royal');
    const spec = createSiegeMapSpec();

    expect(engine.mode).toBe('siege');
    expect(engine.map.id).toBe(SIEGE_MAP_ID);
    expect(engine.map.cols).toBe(54);
    expect(engine.map.rows).toBe(54);
    expect(engine.map.weaponSpawns.length).toBe(0);
    expect(engine.map.ammoSpawns.length).toBe(0);
    expect(engine.map.shieldSpawns.length).toBe(0);
    expect(engine.pickups.length).toBe(0);
    expect(engine.siege?.structures.length).toBe(14);

    // 5v5 hero roster: 1 player + 4 allied AI heroes + 5 enemy AI heroes
    const royalHeroes = 1 + engine.enemies.filter((e) => e.faction === 'royal' && e.siegeUnitKind === 'hero').length;
    const shadowHeroes = engine.enemies.filter((e) => e.faction === 'shadow' && e.siegeUnitKind === 'hero').length;
    expect(royalHeroes).toBe(5);
    expect(shadowHeroes).toBe(5);

    const royalFountain = spec.fountains.royal;
    const shadowFountain = spec.fountains.shadow;
    expect(engine.findPathAStar(royalFountain.x, royalFountain.y, shadowFountain.x, shadowFountain.y).length).toBeGreaterThan(10);
    expect(engine.findPathAStar(royalFountain.x, royalFountain.y, spec.bossSpawns.baron.x, spec.bossSpawns.baron.y).length).toBeGreaterThan(5);
    expect(engine.findPathAStar(royalFountain.x, royalFountain.y, spec.bossSpawns.vanguard.x, spec.bossSpawns.vanguard.y).length).toBeGreaterThan(5);

    for (const lane of ['top', 'mid', 'bot'] as const) {
      const midWp = spec.laneWaypoints[lane][3];
      expect(engine.findPathAStar(royalFountain.x, royalFountain.y, midWp.x, midWp.y).length).toBeGreaterThan(5);
    }
  });

  it('grants infinite lives, disables weapon drops, and preserves custom loadout on respawn', () => {
    const { engine } = createSiegeEngine('royal', { gunId: 'sniper', meleeId: 'greatsword' });

    expect(engine.player.weapons[0].def.id).toBe('sniper');
    expect(engine.player.weapons[1].def.id).toBe('greatsword');

    // Dropping active weapon is disabled in Siege
    engine.setKey('Escape', true);
    engine.setKey('Escape', false);
    expect(engine.pickups.length).toBe(0);
    expect(engine.player.weapons[0].def.id).toBe('sniper');

    // Kill player: must enter RESPAWNING (never GAME_OVER) and never drop weapons
    engine.player.invulnTimer = 0;
    (engine as unknown as { handlePlayerDeath: (id?: string) => void }).handlePlayerDeath();
    expect(engine.status).toBe('RESPAWNING');
    expect(engine.pickups.length).toBe(0);
    expect(engine.siege?.playerState.deaths).toBe(1);

    // Advance past respawn timer -> player revives at own fountain with custom loadout intact
    for (let i = 0; i < 120; i++) {
      engine.update(0.05, 1280, 720);
    }
    expect(engine.status).toBe('PLAYING');
    expect(engine.player.hp).toBe(engine.player.maxHp);
    expect(engine.player.weapons[0].def.id).toBe('sniper');
    expect(engine.player.weapons[1].def.id).toBe('greatsword');
  });

  it('enforces tower invulnerability, backdoor protection, and ends with VICTORY when enemy Castle falls', () => {
    const { engine } = createSiegeEngine('royal');
    const sg = engine.siege!;
    const shadowCastle = sg.structures.find((s) => s.id === 'shadow_castle')!;
    const shadowMidOuter = sg.structures.find((s) => s.id === 'shadow_mid_outer')!;
    const shadowMidInner = sg.structures.find((s) => s.id === 'shadow_mid_inner')!;

    // Castle & inner towers start invulnerable while outer towers stand
    expect(shadowCastle.invulnerable).toBe(true);
    expect(shadowMidInner.invulnerable).toBe(true);
    expect(engine.damageSiegeStructure(shadowCastle, 500, 'player', 'royal')).toBe(0);

    // Destroying outer mid tower unlocks inner mid tower
    engine.damageSiegeStructure(shadowMidOuter, 5000, 'player', 'royal');
    expect(shadowMidOuter.alive).toBe(false);
    expect(shadowMidInner.invulnerable).toBe(false);

    // Backdoor protection: without nearby allied minions, structure damage is reduced
    shadowMidInner.backdoorProtected = true;
    const dmgWithBackdoor = engine.damageSiegeStructure(shadowMidInner, 100, 'player', 'royal');
    expect(dmgWithBackdoor).toBeLessThan(50);

    // Destroying inner mid tower unlocks Shadow Castle
    shadowMidInner.backdoorProtected = false;
    engine.damageSiegeStructure(shadowMidInner, 5000, 'player', 'royal');
    expect(shadowMidInner.alive).toBe(false);
    expect(shadowCastle.invulnerable).toBe(false);

    // Destroying Shadow Castle immediately wins the match
    shadowCastle.backdoorProtected = false;
    engine.damageSiegeStructure(shadowCastle, 20000, 'player', 'royal');
    expect(shadowCastle.alive).toBe(false);
    expect(engine.status).toBe('VICTORY');
  });

  it('gates tactical skill at Lv.2 and melee-charge ultimates at Lv.4 across all 12 skill variants', () => {
    for (const tac of SIEGE_TACTICAL_SKILLS) {
      const { engine } = createSiegeEngine(tac.faction, { tacticalId: tac.id });
      engine.setMousePos(800, 360);
      // Locked at Lv.1
      engine.triggerSiegeTactical();
      expect(engine.siege!.playerState.tacticalCd).toBe(0);

      // Unlocked at Lv.2
      engine.siege!.playerState.level = 2;
      engine.triggerSiegeTactical();
      expect(engine.siege!.playerState.tacticalCd).toBeGreaterThan(0);

      if (tac.id === 'royal_aegis_reflect') {
        expect(engine.siege!.playerState.aegisReflectTimer).toBeGreaterThan(0);
      } else if (tac.id === 'royal_sanctuary_zone') {
        expect(engine.siege!.zones.some((z) => z.kind === 'sanctuary')).toBe(true);
      } else if (tac.id === 'shadow_blink_swap') {
        expect(engine.siege!.zones.some((z) => z.kind === 'decoy')).toBe(true);
      } else if (tac.id === 'shadow_hunter_mark') {
        expect(engine.player.eagleEyeTimer).toBeGreaterThan(0);
      } else if (tac.id === 'shadow_smoke_shroud') {
        expect(engine.player.shadowCloneTimer).toBeGreaterThan(0);
      }
    }

    for (const ult of SIEGE_ULTIMATE_SKILLS) {
      const { engine } = createSiegeEngine(ult.faction, { ultimateId: ult.id, meleeId: 'knife' });
      engine.setMousePos(800, 360);
      // Clear away enemies so player takes no damage/CC while charging
      engine.enemies = [];
      engine.switchWeapon(); // switch to knife
      for (let i = 0; i < 10; i++) engine.update(0.05, 1280, 720);

      // Locked below Lv.4: neither [F] nor melee hold charges ultimate
      engine.player.qi = 100;
      engine.triggerSiegeUltimate();
      expect(engine.player.qi).toBe(100);
      engine.setMouseDown(true);
      for (let i = 0; i < 20; i++) engine.update(0.05, 1280, 720);
      expect(engine.player.chargeReady).toBe(false);
      engine.setMouseDown(false);

      // At Lv.4, charging the melee weapon and releasing casts the ultimate
      engine.siege!.playerState.level = 4;
      engine.player.qi = 100;
      engine.setMousePos(800, 360);
      engine.setMouseDown(true);
      for (let i = 0; i < 60 && !engine.player.chargeReady; i++) {
        engine.update(0.05, 1280, 720);
      }
      expect(engine.player.chargeReady).toBe(true);
      engine.setMouseDown(false);
      expect(engine.player.qi).toBe(0);

      if (ult.id === 'royal_judgment_beam') {
        expect(engine.beams.length).toBeGreaterThan(0);
      } else if (ult.id === 'royal_light_rain') {
        expect(engine.projectiles.length).toBe(9);
      } else if (ult.id === 'royal_healing_salvo') {
        expect(engine.projectiles.length).toBe(5);
        expect(engine.projectiles.every((p) => p.healAllies)).toBe(true);
      } else if (ult.id === 'shadow_twin_dragons') {
        expect(engine.projectiles.length).toBe(2);
      } else if (ult.id === 'shadow_pierce_dragon') {
        expect(engine.projectiles.length).toBe(1);
        expect(engine.projectiles[0].ignoresWalls).toBe(true);
      } else if (ult.id === 'shadow_vortex_dragon') {
        expect(engine.siege!.zones.some((z) => z.kind === 'vortex')).toBe(true);
      }
    }

    // Royal Fortitude passive raises starting max HP
    const { engine: tankEng } = createSiegeEngine('royal', {
      passiveId: SIEGE_PASSIVES.find((p) => p.id === 'royal_fortitude')!.id,
    });
    expect(tankEng.player.maxHp).toBe(125);
  });

  it('supports gold upgrades in Fountain and grants team buffs on Third-Faction Boss kills', () => {
    const { engine } = createSiegeEngine('shadow');
    const sg = engine.siege!;

    // Player spawns inside own fountain; starts with 120 Gold
    expect(sg.playerState.gold).toBe(120);
    expect(engine.buySiegeUpgrade('armor')).toBe(true);
    expect(sg.playerState.upgrades.armor).toBe(1);
    expect(engine.player.maxHp).toBe(132);
    expect(engine.buySiegeUpgrade('firepower')).toBe(false);
    // Moving outside fountain prevents shopping while alive
    sg.playerState.gold = 500;
    engine.player.x = 27 * TILE;
    engine.player.y = 27 * TILE;
    expect(engine.buySiegeUpgrade('firepower')).toBe(false);

    // Spawn Baron Boss and slay it as player -> grants 90s Baron buff to Shadow
    engine.spawnSiegeBoss('baron');
    const baron = engine.enemies.find((e) => e.siegeBossKind === 'baron')!;
    expect(baron).toBeTruthy();
    (engine as unknown as { handleSiegeEnemyRemoved: (e: typeof baron, id?: string) => void }).handleSiegeEnemyRemoved(
      baron,
      'player'
    );
    expect(sg.teamBuffs.shadow.baronTimer).toBeGreaterThan(80);
  });

  it('supports mid-match remote human disconnect (AI stand-in) and seamless rejoin', () => {
    const royalSkin = FACTION_CHARACTERS.royal[0];
    const shadowSkin = FACTION_CHARACTERS.shadow[0];
    const hostLoadout = getDefaultSiegeLoadout('royal', royalSkin.id);
    const clientLoadout = getDefaultSiegeLoadout('shadow', shadowSkin.id);

    const engine = new TwilightEngine(
      'royal',
      royalSkin,
      SIEGE_MAP_ID,
      { royal: 0, shadow: 0, mercenary: 0 },
      () => {},
      undefined,
      undefined,
      'standard',
      {
        role: 'host',
        localPeerId: 'host1',
        hostPeerId: 'host1',
        peers: [
          { peerId: 'host1', name: 'Host', faction: 'royal', characterSkin: royalSkin, isHost: true, siegeLoadout: hostLoadout },
          { peerId: 'peer2', name: 'ShadowGuest', faction: 'shadow', characterSkin: shadowSkin, isHost: false, siegeLoadout: clientLoadout },
        ],
      },
      'siege',
      { loadout: hostLoadout, durationSec: 1080 }
    );

    const guestState = engine.siege!.remoteStates.get('peer2')!;
    guestState.gold = 350;
    guestState.level = 2;
    guestState.upgrades.armor = 1;

    let guestEnt = engine.enemies.find((e) => e.peerId === 'peer2')!;
    expect(guestEnt).toBeTruthy();
    expect(guestEnt.isHumanPlayer).toBe(true);

    // Disconnect mid-match: AI takes over, entity stays in match, stats preserved
    engine.markRemoteHumanDisconnected('peer2');
    guestEnt = engine.enemies.find((e) => e.peerId === 'peer2')!;
    expect(guestEnt).toBeTruthy();
    expect(guestEnt.isHumanPlayer).toBe(false);

    // Snapshot still maps seat to peer2 with preserved Siege state
    const midSnap = engine.exportWorldSnapshot();
    expect(midSnap.actors.some((a) => a.peerId === 'peer2')).toBe(true);
    expect(midSnap.siege?.players.find((p) => p.peerId === 'peer2')?.gold).toBe(350);

    // Rejoin via same link: human retakes direct control & fresh seq=1 inputs execute
    engine.rejoinRemoteHuman('peer2');
    guestEnt = engine.enemies.find((e) => e.peerId === 'peer2')!;
    expect(guestEnt.isHumanPlayer).toBe(true);
    engine.setRemoteInput('peer2', {
      moveX: 1,
      moveY: 0,
      aimX: guestEnt.x + 120,
      aimY: guestEnt.y,
      mouseDown: false,
      clickSeq: 0,
      reloadSeq: 0,
      swapSeq: 0,
      pickupSeq: 0,
      dropSeq: 0,
      tacticalSeq: 1,
    });
    engine.update(0.05, 1280, 720);
    expect(engine.siege!.remoteStates.get('peer2')!.tacticalCd).toBeGreaterThan(0);
  });

  it('clears Siege AI hero spawn invulnerability and passes player bullets through allies to hit enemies', () => {
    const { engine } = createSiegeEngine('royal', { gunId: 'rifle' });
    const shadowHero = engine.enemies.find((e) => e.faction === 'shadow' && e.siegeUnitKind === 'hero')!;
    expect(shadowHero).toBeTruthy();

    // Advance past the 1.5s spawn invulnerability window
    for (let i = 0; i < 35; i++) {
      engine.update(0.05, 1280, 720);
    }
    expect(shadowHero.invulnTimer ?? 0).toBe(0);

    // Clear nearby obstacles/noise by placing player, allied minion, and enemy hero cleanly in mid lane
    const p = engine.player;
    p.x = 24 * TILE;
    p.y = 30 * TILE;
    p.elevation = 0;

    // Move other actors aside so nothing else intercepts the shot
    for (const e of engine.enemies) {
      if (e.id !== shadowHero.id) {
        e.x = 4 * TILE;
        e.y = 4 * TILE;
      }
    }

    const allyHero = engine.enemies.find((e) => e.faction === 'royal' && e.siegeUnitKind === 'hero')!;
    allyHero.x = p.x + 60;
    allyHero.y = p.y;
    allyHero.elevation = 0;
    const allyStartHp = allyHero.hp;

    shadowHero.x = p.x + 150;
    shadowHero.y = p.y;
    shadowHero.elevation = 0;
    shadowHero.royalShieldTimer = 0;
    shadowHero.shadowCloneTimer = 0;
    shadowHero.invulnTimer = 0;
    const enemyStartHp = shadowHero.hp;

    // Aim straight east through the allied hero onto the enemy hero
    const cam = (engine as unknown as { camera: { x: number; y: number } }).camera;
    const worldToScreenX = shadowHero.x - (cam.x - 1280 / 2);
    const worldToScreenY = shadowHero.y - (cam.y - 720 / 2);
    engine.setMousePos(worldToScreenX, worldToScreenY);
    engine.player.angle = 0;
    engine.setMouseDown(true);
    engine.setMouseDown(false);

    expect(allyHero.hp).toBe(allyStartHp);
    expect(shadowHero.hp).toBeLessThan(enemyStartHp);
  });

  it('routes Siege A* paths around alive towers and lets lane minions advance past inner towers', () => {
    const { engine } = createSiegeEngine('royal');
    const spec = createSiegeMapSpec();
    const structures = engine.siege!.structures;

    for (const lane of ['top', 'mid', 'bot'] as const) {
      const start = spec.laneWaypoints[lane][0];
      const end = spec.laneWaypoints[lane][spec.laneWaypoints[lane].length - 1];
      const path = engine.findPathAStar(start.x, start.y, end.x, end.y);
      expect(path.length).toBeGreaterThan(15);

      for (const cell of path) {
        const cx = (cell.gx + 0.5) * TILE;
        const cy = (cell.gy + 0.5) * TILE;
        for (const st of structures) {
          if (!st.alive) continue;
          expect(Math.hypot(cx - st.x, cy - st.y)).toBeGreaterThanOrEqual(st.radius);
        }
      }
    }

    // Advance simulation past the first wave delay (8s) + 8s of marching
    for (let i = 0; i < 320; i++) {
      engine.update(0.05, 1280, 720);
    }
    const advancedRoyalTopMinions = engine.enemies.filter(
      (e) =>
        e.faction === 'royal' &&
        (e.siegeUnitKind === 'minion' || e.siegeUnitKind === 'super_minion') &&
        e.siegeLane === 'top' &&
        e.y < 35 * TILE
    );
    expect(advancedRoyalTopMinions.length).toBeGreaterThan(0);

    // Every spawned lane minion uses melee weapons only (knife & greatsword, zero guns)
    const allMinions = engine.enemies.filter(
      (e) => e.siegeUnitKind === 'minion' || e.siegeUnitKind === 'super_minion'
    );
    expect(allMinions.length).toBeGreaterThan(0);
    for (const m of allMinions) {
      expect(m.weapons[0].type).toBe('melee');
      expect(m.weapons[1].type).toBe('melee');
    }
  });

  it('scales HP (+22/lvl), Defense, and Move Speed on level-up, applies gun roles/falloff, and keeps HUD ammo integer', () => {
    const { engine, getHud } = createSiegeEngine('royal', { gunId: 'rifle' });
    const ps = engine.siege!.playerState;

    const baseHp = computeSiegeMaxHp(ps);
    const baseDef = computeSiegeDefense(ps);
    const baseSpd = computeSiegeMoveSpeedMult(ps);
    expect(baseHp).toBe(100);
    expect(baseDef).toBe(0);

    // Grant XP to level up from Lv.1 to Lv.3 via awardSiegeHeroKill so engine player maxHp & HUD update live
    const awardFn = (engine as unknown as {
      awardSiegeHeroKill: (id: string, gold: number, xp: number, isHero: boolean) => void;
    }).awardSiegeHeroKill.bind(engine);
    awardFn('player', 100, 220, true);
    expect(ps.level).toBeGreaterThanOrEqual(3);
    expect(engine.player.maxHp).toBe(144);
    expect(computeSiegeDefense(ps)).toBeGreaterThan(baseDef);
    expect(computeSiegeMoveSpeedMult(ps)).toBeGreaterThan(baseSpd);

    // Defense meaningfully reduces incoming damage (never to zero), while armor-piercing guns bypass part of it
    const unmitigated = 25;
    const def = computeSiegeDefense(ps) + 6;
    const mitigated = applySiegeDefenseReduction(unmitigated, def, 0);
    const pierced = applySiegeDefenseReduction(unmitigated, def, getSiegeGunProfile('shotgun').defensePenetration);
    expect(mitigated).toBeLessThan(unmitigated);
    expect(mitigated).toBeGreaterThanOrEqual(2);
    expect(pierced).toBeGreaterThan(mitigated);

    // Gun role profiles & distance falloff balance rifle vs shotgun / sniper / pistol
    expect(getSiegeGunProfile('rifle').damageMult).toBeLessThan(0.8);
    expect(getSiegeGunProfile('shotgun').defensePenetration).toBeGreaterThan(0.5);
    expect(getSiegeGunProfile('sniper').defensePenetration).toBeGreaterThan(0.5);
    expect(getSiegeGunProfile('pistol').moveSpeedMult).toBeGreaterThanOrEqual(1.0);
    expect(computeSiegeGunFalloffMult('rifle', 180)).toBe(1);
    expect(computeSiegeGunFalloffMult('rifle', 700)).toBeLessThanOrEqual(0.35);
    expect(computeSiegeGunFalloffMult('sniper', 250)).toBe(1);
    expect(computeSiegeGunFalloffMult('sniper', 920)).toBeGreaterThan(0.5);

    // Out-of-combat reserve ammo recharges over time and HUD always outputs whole integers and updated maxHp
    engine.player.reserveAmmo = 10;
    engine.enemies = [];
    for (let i = 0; i < 65; i++) {
      engine.update(0.05, 1280, 720);
    }
    const hud = getHud()!;
    expect(hud.player.maxHp).toBe(144);
    expect(hud.player.reserveAmmo).toBeGreaterThan(10);
    expect(Number.isInteger(hud.player.reserveAmmo)).toBe(true);
  });

  it('refunds qi rapidly on aborted melee charge and evolves Siege skills with 5-rank Gold upgrades', () => {
    // 1. Aborted melee charge snaps qi back nearly immediately
    const { engine } = createSiegeEngine('royal', { ultimateId: 'royal_light_rain', meleeId: 'knife' });
    engine.enemies = [];
    engine.siege!.playerState.level = 4;
    engine.switchWeapon();
    for (let i = 0; i < 10; i++) engine.update(0.05, 1280, 720);
    engine.player.qi = 100;
    engine.setMouseDown(true);
    for (let i = 0; i < 20; i++) engine.update(0.05, 1280, 720);
    expect(engine.player.chargingMelee).toBe(true);
    expect(engine.player.chargeReady).toBe(false);
    expect(engine.player.qi).toBeLessThan(80);

    // Release mouse early -> abort charge and verify qi returns to 100 within 0.35s
    engine.setMouseDown(false);
    for (let i = 0; i < 7; i++) engine.update(0.05, 1280, 720);
    expect(engine.player.qi).toBeCloseTo(100, 1);

    // 2. All 4 Siege upgrades support 5 levels and skill ranks evolve/buff tactical & ultimate skills
    expect(SIEGE_UPGRADES.every((u) => u.maxLevel === 5 && u.costs.length === 5)).toBe(true);
    engine.siege!.playerState.level = 5;
    engine.siege!.playerState.gold = 3000;
    expect(engine.buySiegeUpgrade('blade')).toBe(true);
    expect(engine.buySiegeUpgrade('core')).toBe(true);
    expect(engine.buySiegeUpgrade('core')).toBe(true);
    expect(engine.buySiegeUpgrade('core')).toBe(true);
    expect(engine.siege!.playerState.upgrades.core).toBe(3);

    // Rank-3 Royal Light Rain evolves from 9 -> 11 orbs, enlarges both orb radius & sweeping sword-wave slash
    engine.slashes = [];
    engine.player.qi = 100;
    engine.setMouseDown(true);
    for (let i = 0; i < 60 && !engine.player.chargeReady; i++) engine.update(0.05, 1280, 720);
    engine.setMouseDown(false);
    expect(engine.projectiles.length).toBe(11);
    expect(engine.projectiles.every((pr) => pr.radius >= 24)).toBe(true);
    expect(engine.slashes.some((s) => s.isUltimate && s.reach >= 140)).toBe(true);

    // Rank-3 Shadow Twin Dragons evolves from 2 -> 3 dragons
    const { engine: shadowEng } = createSiegeEngine('shadow', { ultimateId: 'shadow_twin_dragons', meleeId: 'knife' });
    shadowEng.enemies = [];
    shadowEng.siege!.playerState.level = 5;
    shadowEng.siege!.playerState.upgrades.core = 3;
    shadowEng.switchWeapon();
    for (let i = 0; i < 10; i++) shadowEng.update(0.05, 1280, 720);
    shadowEng.player.qi = 100;
    shadowEng.setMouseDown(true);
    for (let i = 0; i < 60 && !shadowEng.player.chargeReady; i++) shadowEng.update(0.05, 1280, 720);
    shadowEng.setMouseDown(false);
    expect(shadowEng.projectiles.length).toBe(3);

    // Tactical skill cooldown scales down with blade upgrade
    shadowEng.siege!.playerState.upgrades.blade = 3;
    shadowEng.triggerSiegeTactical();
    expect(shadowEng.siege!.playerState.tacticalCd).toBeLessThan(10);
  });

  it('keeps melee bots closing distance rather than retreating and applies slower out-of-combat ammo recovery', () => {
    // 1. All 10 bundled Siege hero presets are complete with unique roles and taglines
    expect(SIEGE_HERO_PRESETS.length).toBe(10);
    for (const preset of SIEGE_HERO_PRESETS) {
      expect(preset.tagline.length).toBeGreaterThan(8);
      expect(preset.loadout.gunId).toBeTruthy();
      expect(preset.loadout.meleeId).toBeTruthy();
    }

    // 2. Classic mode melee-wielding AI closes distance instead of backing away at ~115px
    const meleeEng = new TwilightEngine(
      'royal',
      FACTION_CHARACTERS.royal[0],
      'industrial_warehouse',
      { royal: 0, shadow: 0, mercenary: 0 },
      () => {}
    );
    meleeEng.player.x = 20.5 * TILE;
    meleeEng.player.y = 16.5 * TILE;
    meleeEng.player.elevation = meleeEng.getWalkableElevation(meleeEng.player.x, meleeEng.player.y);
    meleeEng.player.invulnTimer = 0;
    meleeEng.enemies = meleeEng.enemies.slice(0, 1);
    const bot = meleeEng.enemies[0];
    bot.faction = 'shadow';
    bot.isAlly = false;
    bot.x = meleeEng.player.x - 110;
    bot.y = meleeEng.player.y;
    bot.elevation = meleeEng.getWalkableElevation(bot.x, bot.y);
    bot.hp = 100;
    bot.maxHp = 100;
    bot.qi = 0;
    bot.swapTimer = 0;
    bot.stunTimer = 0;
    bot.blindTimer = 0;
    bot.activeHand = 1; // hold knife
    bot.weapons[0] = { ...bot.weapons[1] };
    bot.reactionTimer = 0;
    const startDist = Math.hypot(meleeEng.player.x - bot.x, meleeEng.player.y - bot.y);
    for (let i = 0; i < 20; i++) {
      meleeEng.update(0.05, 960, 720);
    }
    const endDist = Math.hypot(meleeEng.player.x - bot.x, meleeEng.player.y - bot.y);
    expect(endDist).toBeLessThan(startDist - 20);

    // 3. Slower out-of-combat ammo recovery outside fountain (delay 4.0s, rate 1.2/s) for local + remote humans
    expect(SIEGE_CONFIG.outOfCombatAmmoDelaySec).toBe(4.0);
    expect(SIEGE_CONFIG.outOfCombatAmmoPerSec).toBe(1.2);
    const { engine: siegeEng } = createSiegeEngine('royal', { gunId: 'rifle' });
    siegeEng.enemies = [];
    siegeEng.player.x = 27 * TILE;
    siegeEng.player.y = 27 * TILE;
    siegeEng.player.reserveAmmo = 10;
    siegeEng.siege!.playerState.outOfCombatTimer = 0;
    for (let i = 0; i < 60; i++) {
      // 3.0s < 4.0s delay -> should NOT recharge yet
      siegeEng.update(0.05, 1280, 720);
    }
    expect(siegeEng.player.reserveAmmo).toBe(10);
    for (let i = 0; i < 40; i++) {
      // another 2.0s -> 1.0s past 4.0s delay -> ~1.2 ammo
      siegeEng.update(0.05, 1280, 720);
    }
    expect(siegeEng.player.reserveAmmo).toBeGreaterThan(10.5);
    expect(siegeEng.player.reserveAmmo).toBeLessThan(12.5);
  });
});
