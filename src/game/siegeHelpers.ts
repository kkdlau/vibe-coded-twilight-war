import {
  SIEGE_CONFIG,
  SIEGE_HERO_PRESETS,
  SIEGE_UPGRADES,
  getDefaultSiegeLoadout,
  getTacticalMeta,
  sanitizeSiegeLoadout,
} from './siegeData';
import { SiegeMapSpec, createSiegeMapSpec } from './siegeMap';
import {
  GunKind,
  SiegeBossKind,
  SiegeFactionId,
  SiegeLane,
  SiegeMatchDurationSec,
  SiegePlayerLoadout,
  SiegeStructure,
  SiegeUpgradeTrack,
  SiegeZoneEffect,
} from './types';

export interface SiegeHeroState {
  gold: number;
  xp: number;
  level: number;
  xpToNext: number;
  upgrades: Record<SiegeUpgradeTrack, number>;
  tacticalCd: number;
  recallTimer: number;
  aegisReflectTimer: number;
  smokeSpeedTimer: number;
  markedTimer: number;
  minionKills: number;
  towerKills: number;
  deaths: number;
  outOfCombatTimer: number;
  loadout: SiegePlayerLoadout;
}

export interface SiegeAiRespawnItem {
  name: string;
  skinId: string;
  faction: SiegeFactionId;
  lane: SiegeLane;
  loadout: SiegePlayerLoadout;
  timer: number;
  deaths: number;
  gold: number;
  upgrades: Record<SiegeUpgradeTrack, number>;
}

export interface SiegeRuntime {
  spec: SiegeMapSpec;
  structures: SiegeStructure[];
  zones: SiegeZoneEffect[];
  matchTime: number;
  matchDuration: SiegeMatchDurationSec;
  suddenDeath: boolean;
  suddenDeathAnnounced: boolean;
  waveTimer: number;
  waveNumber: number;
  jungleTimers: Record<string, number>;
  vanguardState: 'alive' | 'countdown';
  vanguardTimer: number;
  baronState: 'alive' | 'countdown';
  baronTimer: number;
  teamBuffs: {
    royal: { vanguardStacks: number; baronTimer: number };
    shadow: { vanguardStacks: number; baronTimer: number };
  };
  playerState: SiegeHeroState;
  remoteStates: Map<string, SiegeHeroState>;
  aiRespawns: SiegeAiRespawnItem[];
  passiveGoldTimer: number;
}

export function createEmptyUpgrades(): Record<SiegeUpgradeTrack, number> {
  return { firepower: 0, blade: 0, armor: 0, core: 0 };
}

export function createHeroSiegeState(loadout: SiegePlayerLoadout): SiegeHeroState {
  return {
    gold: 120,
    xp: 0,
    level: 1,
    xpToNext: 80,
    upgrades: createEmptyUpgrades(),
    tacticalCd: 0,
    recallTimer: 0,
    aegisReflectTimer: 0,
    smokeSpeedTimer: 0,
    markedTimer: 0,
    minionKills: 0,
    towerKills: 0,
    deaths: 0,
    outOfCombatTimer: 0,
    loadout,
  };
}

export function createSiegeRuntime(
  playerFaction: SiegeFactionId,
  playerSkinId: string,
  playerLoadout?: SiegePlayerLoadout,
  durationSec: SiegeMatchDurationSec = SIEGE_CONFIG.defaultDurationSec
): SiegeRuntime {
  const spec = createSiegeMapSpec();
  const structures = spec.createInitialStructures();
  refreshStructureInvulnerability(structures);

  const resolvedLoadout = sanitizeSiegeLoadout(
    playerFaction,
    playerLoadout ?? getDefaultSiegeLoadout(playerFaction, playerSkinId)
  );

  const jungleTimers: Record<string, number> = {};
  for (const camp of spec.jungleCamps) {
    jungleTimers[camp.id] = SIEGE_CONFIG.jungleInitialDelaySec;
  }

  return {
    spec,
    structures,
    zones: [],
    matchTime: 0,
    matchDuration: durationSec,
    suddenDeath: false,
    suddenDeathAnnounced: false,
    waveTimer: SIEGE_CONFIG.firstWaveDelaySec,
    waveNumber: 0,
    jungleTimers,
    vanguardState: 'countdown',
    vanguardTimer: SIEGE_CONFIG.vanguardInitialDelaySec,
    baronState: 'countdown',
    baronTimer: SIEGE_CONFIG.baronInitialDelaySec,
    teamBuffs: {
      royal: { vanguardStacks: 0, baronTimer: 0 },
      shadow: { vanguardStacks: 0, baronTimer: 0 },
    },
    playerState: createHeroSiegeState(resolvedLoadout),
    remoteStates: new Map(),
    aiRespawns: [],
    passiveGoldTimer: 0,
  };
}

export function refreshStructureInvulnerability(structures: SiegeStructure[]) {
  const byId = new Map(structures.map((s) => [s.id, s]));
  for (const fac of ['royal', 'shadow'] as SiegeFactionId[]) {
    for (const lane of ['top', 'mid', 'bot'] as SiegeLane[]) {
      const outer = byId.get(`${fac}_${lane}_outer`);
      const inner = byId.get(`${fac}_${lane}_inner`);
      if (inner) {
        inner.invulnerable = Boolean(outer && outer.alive);
      }
    }
    const castle = byId.get(`${fac}_castle`);
    if (castle) {
      const anyInnerDown = (['top', 'mid', 'bot'] as SiegeLane[]).some(
        (lane) => !byId.get(`${fac}_${lane}_inner`)?.alive
      );
      castle.invulnerable = !anyInnerDown;
    }
  }
}

export function computeSiegeMaxHp(state: Pick<SiegeHeroState, 'level' | 'upgrades' | 'loadout'>): number {
  const passiveHp = state.loadout.passiveId === 'royal_fortitude' ? 25 : 0;
  const armorHp = (state.upgrades.armor ?? 0) * 32;
  const levelHp = Math.max(0, state.level - 1) * 22;
  return 100 + passiveHp + armorHp + levelHp;
}

export function computeSiegeDefense(state: Pick<SiegeHeroState, 'level' | 'upgrades'>): number {
  return Math.floor(Math.max(0, state.level - 1) * 1.5) + (state.upgrades.armor ?? 0) * 3;
}

export function applySiegeDefenseReduction(rawDmg: number, defense: number, defensePenetration = 0): number {
  if (rawDmg <= 0) return rawDmg;
  const effDef = Math.max(0, Math.round(defense * (1 - Math.max(0, Math.min(1, defensePenetration)))));
  if (effDef <= 0) return rawDmg;
  return Math.max(Math.max(2, Math.round(rawDmg * 0.25)), rawDmg - effDef);
}

export function computeSiegeMoveSpeedMult(
  state: Pick<SiegeHeroState, 'level' | 'upgrades' | 'loadout' | 'smokeSpeedTimer'>
): number {
  let mult = 1 + Math.max(0, state.level - 1) * 0.025 + (state.upgrades.armor ?? 0) * 0.04;
  if (state.loadout.passiveId === 'royal_vanguard_aura') mult += 0.1;
  if (state.loadout.passiveId === 'shadow_swift_foot') mult += 0.12;
  if (state.smokeSpeedTimer > 0) mult += 0.22;
  return mult;
}

export function computeSiegeLevelAttackMult(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.04;
}

export interface SiegeGunProfile {
  damageMult: number;
  fireRateMult: number;
  reloadMult: number;
  moveSpeedMult: number;
  defensePenetration: number;
  structureBonusMult: number;
  fullRange: number;
  farRange: number;
  minFalloff: number;
  roleTag: string;
}

const SIEGE_GUN_PROFILES: Record<GunKind, SiegeGunProfile> = {
  rifle: {
    damageMult: 0.72,
    fireRateMult: 0.92,
    reloadMult: 1.0,
    moveSpeedMult: 0.84,
    defensePenetration: 0,
    structureBonusMult: 1.0,
    fullRange: 230,
    farRange: 520,
    minFalloff: 0.25,
    roleTag: '中距穩定壓制',
  },
  shotgun: {
    damageMult: 1.18,
    fireRateMult: 1.0,
    reloadMult: 0.78,
    moveSpeedMult: 0.88,
    defensePenetration: 0.65,
    structureBonusMult: 1.25,
    fullRange: 185,
    farRange: 410,
    minFalloff: 0.22,
    roleTag: '近距破甲爆發',
  },
  sniper: {
    damageMult: 1.15,
    fireRateMult: 1.0,
    reloadMult: 0.78,
    moveSpeedMult: 0.74,
    defensePenetration: 0.6,
    structureBonusMult: 1.15,
    fullRange: 480,
    farRange: 920,
    minFalloff: 0.58,
    roleTag: '超遠穿甲狙殺',
  },
  pistol: {
    damageMult: 1.2,
    fireRateMult: 1.25,
    reloadMult: 0.85,
    moveSpeedMult: 1.02,
    defensePenetration: 0.2,
    structureBonusMult: 1.05,
    fullRange: 250,
    farRange: 550,
    minFalloff: 0.34,
    roleTag: '高機動游擊拉打',
  },
};

export function getSiegeGunProfile(gunKind: GunKind): SiegeGunProfile {
  return SIEGE_GUN_PROFILES[gunKind];
}

export function computeSiegeGunFalloffMult(gunKind: GunKind, distPx: number, rangeMult = 1): number {
  const band = SIEGE_GUN_PROFILES[gunKind];
  const full = band.fullRange * rangeMult;
  const far = band.farRange * rangeMult;
  if (distPx <= full) return 1;
  if (distPx >= far) return band.minFalloff;
  const t = (distPx - full) / Math.max(1, far - full);
  return 1 - t * (1 - band.minFalloff);
}

export function computeSiegeTacticalCooldown(state: Pick<SiegeHeroState, 'upgrades' | 'loadout'>): number {
  const baseCd = getTacticalMeta(state.loadout.tacticalId).cooldownSec ?? 12;
  const reduction = (state.upgrades.blade ?? 0) * 0.08;
  return Math.max(4, Number((baseCd * (1 - reduction)).toFixed(2)));
}

export function grantSiegeXpAndGold(
  state: SiegeHeroState,
  gold: number,
  xp: number
): { leveledUp: boolean; oldLevel: number; newLevel: number; hpGain: number; defenseGain: number } {
  state.gold += Math.max(0, Math.round(gold));
  state.xp += Math.max(0, Math.round(xp));
  const oldLevel = state.level;
  const oldDef = computeSiegeDefense(state);
  let leveledUp = false;
  let hpGain = 0;
  while (state.level < 10 && state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext;
    state.level += 1;
    state.xpToNext = Math.round(80 + (state.level - 1) * 45);
    leveledUp = true;
    hpGain += 22;
  }
  const newDef = computeSiegeDefense(state);
  return {
    leveledUp,
    oldLevel,
    newLevel: state.level,
    hpGain,
    defenseGain: Math.max(0, newDef - oldDef),
  };
}

export function tryPurchaseSiegeUpgrade(
  state: SiegeHeroState,
  track: SiegeUpgradeTrack
): { ok: boolean; cost: number; level: number; reason?: string } {
  const meta = SIEGE_UPGRADES.find((u) => u.track === track);
  if (!meta) return { ok: false, cost: 0, level: 0, reason: '未知強化項目' };
  const curLv = state.upgrades[track] ?? 0;
  if (curLv >= meta.maxLevel) {
    return { ok: false, cost: 0, level: curLv, reason: `${meta.name} 已滿級` };
  }
  const cost = meta.costs[curLv];
  if (state.gold < cost) {
    return { ok: false, cost, level: curLv, reason: `軍功不足（需 ${cost} 金）` };
  }
  state.gold -= cost;
  state.upgrades[track] = curLv + 1;
  return { ok: true, cost, level: curLv + 1 };
}

export function computeSiegeRespawnSeconds(matchTime: number, suddenDeath: boolean): number {
  const base = 4 + Math.floor(matchTime / 110);
  return suddenDeath ? Math.min(12, base) : Math.min(14, base);
}

export function pickSiegeAiHeroTemplate(
  faction: SiegeFactionId,
  usedSkinIds: Set<string>,
  laneIndex: number
): { skinId: string; loadout: SiegePlayerLoadout; lane: SiegeLane } {
  const lanes: SiegeLane[] = ['mid', 'top', 'bot', 'bot', 'top'];
  const lane = lanes[laneIndex % lanes.length];
  const presets = SIEGE_HERO_PRESETS.filter((p) => p.faction === faction);
  const picked = presets.find((p) => !usedSkinIds.has(p.skinId)) ?? presets[laneIndex % presets.length];
  return {
    skinId: picked.skinId,
    loadout: { ...picked.loadout },
    lane,
  };
}

export function getBossDisplayName(kind: SiegeBossKind): string {
  return kind === 'baron' ? '狂戰巨神・重砲鐵拳' : '幻沙先鋒・雙影巨獸';
}
