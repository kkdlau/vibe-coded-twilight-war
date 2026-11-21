import type { EnemyArchetype, GunKind } from './types';

export const PLAYER_MOVEMENT = {
  speed: 180,
  stepDistance: 48,
};

export const GUN_AIM = {
  nearDistance: 32,
  bloomRecovery: 20,
  spreadScale: 260,
  minSpread: 0.004,
  maxSpread: 0.40,
  distanceKnee: 360, // 7.5 tiles
  longRangeSpan: 720,
};

const AIM_BY_GUN = {
  pistol: { near: 0.35, knee: 2.15, longRangeExtra: 1.65, pelletRadius: 0 },
  rifle: { near: 0.35, knee: 2.15, longRangeExtra: 1.65, pelletRadius: 0 },
  shotgun: { near: 0.32, knee: 4.35, longRangeExtra: 1.55, pelletRadius: 10 },
  sniper: { near: 0.35, knee: 1.02, longRangeExtra: 0.50, pelletRadius: 0 },
} satisfies Record<GunKind, { near: number; knee: number; longRangeExtra: number; pelletRadius: number }>;

export function getGunSpread(kind: GunKind, aimRadius: number, distance: number, focus: number): number {
  const profile = AIM_BY_GUN[kind];
  const { nearDistance, distanceKnee, longRangeSpan } = GUN_AIM;
  const nearProgress = Math.max(0, Math.min(1, (distance - nearDistance) / (distanceKnee - nearDistance)));
  const farProgress = Math.max(0, Math.min(1, (distance - distanceKnee) / longRangeSpan));
  const distanceMultiplier = profile.near + (profile.knee - profile.near) * nearProgress ** 1.45
    + profile.longRangeExtra * farProgress;
  const spread = (aimRadius * distanceMultiplier * focus + profile.pelletRadius) / GUN_AIM.spreadScale;
  return Math.max(GUN_AIM.minSpread, Math.min(GUN_AIM.maxSpread, spread));
}

export const RIFLE_RECOIL = {
  kick: 0.019,
  maxAngle: 0.075,
  recovery: 2.8,
  eagleEyeMultiplier: 0.45,
};

export const RELOAD_CUES = [
  { phase: 'remove', progress: 0.22 },
  { phase: 'insert', progress: 0.66 },
  { phase: 'close', progress: 0.88 },
] as const;

export type ReloadCue = 'start' | 'ready' | typeof RELOAD_CUES[number]['phase'];

export const QI_RATE = { charge: 62, recover: 100 / 30 };
export const SHIELD_BASH_DISTANCE = 18;
export const ROYAL_SHIELD_PADDING = 9;

export const MELEE_CHARGE_HOLD_SECONDS = 0.18;
export const AI_SURPRISE_SECONDS = 0.18;

export const GUNFIRE_ANIMATION_SECONDS = 0.14;
export const RESPAWN_DELAY_SECONDS = 2.5;
export const EAGLE_EYE_DURATION = 8;

export const AI_COMBAT = {
  trooper: { reactionSeconds: 0.76, preferredRange: 205 },
  rusher: { reactionSeconds: 0.58, preferredRange: 65 },
  sniper: { reactionSeconds: 0.90, preferredRange: 300 },
  phantom: { reactionSeconds: 0.48, preferredRange: 110 },
  heavy: { reactionSeconds: 0.85, preferredRange: 165 },
} satisfies Record<EnemyArchetype, { reactionSeconds: number; preferredRange: number }>;


export const AI_DIFFICULTY = {
  relaxed: { label: '休閒', reactionMultiplier: 1.45, aimSpreadMultiplier: 1.35, moveMultiplier: 0.76 },
  standard: { label: '標準', reactionMultiplier: 1.22, aimSpreadMultiplier: 1.12, moveMultiplier: 0.86 },
  hard: { label: '困難', reactionMultiplier: 0.78, aimSpreadMultiplier: 0.90, moveMultiplier: 0.94 },
};

export type AiDifficulty = keyof typeof AI_DIFFICULTY;

export const AI_PATROL = {
  searchSteps: 4,
  radius: 210,
  arrivalDistance: 18,
  speedMultiplier: 0.60,
  legSeconds: 4,
  retrySeconds: 0.65,
  turnSpeed: 3.2,
};
