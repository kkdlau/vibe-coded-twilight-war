import type { EnemyArchetype, GunKind } from './types';

export const PLAYER_MOVEMENT = {
  speed: 205,
  stepDistance: 48,
};

export const GUN_AIM = {
  nearDistance: 32,
  bloomRecovery: 20,
  spreadScale: 260,
  minSpread: 0.004,
  maxSpread: 0.33,
};

const AIM_BY_GUN = {
  pistol: { near: 0.35, far: 1.75, farDistance: 400, pelletRadius: 0 },
  rifle: { near: 0.35, far: 1.75, farDistance: 400, pelletRadius: 0 },
  shotgun: { near: 0.32, far: 4.20, farDistance: 290, pelletRadius: 10 },
  sniper: { near: 0.35, far: 1.15, farDistance: 400, pelletRadius: 0 },
} satisfies Record<GunKind, { near: number; far: number; farDistance: number; pelletRadius: number }>;

export function getGunSpread(kind: GunKind, aimRadius: number, distance: number, focus: number): number {
  const profile = AIM_BY_GUN[kind];
  const progress = Math.max(0, Math.min(1, (distance - GUN_AIM.nearDistance) / (profile.farDistance - GUN_AIM.nearDistance)));
  const eased = progress * progress * (3 - 2 * progress);
  const distanceMultiplier = profile.near + (profile.far - profile.near) * eased;
  const spread = (aimRadius * distanceMultiplier * focus + profile.pelletRadius) / GUN_AIM.spreadScale;
  return Math.max(GUN_AIM.minSpread, Math.min(GUN_AIM.maxSpread, spread));
}

export const RELOAD_CUES = [
  { phase: 'remove', progress: 0.22 },
  { phase: 'insert', progress: 0.66 },
  { phase: 'close', progress: 0.88 },
] as const;

export type ReloadCue = 'start' | 'ready' | typeof RELOAD_CUES[number]['phase'];

export const GUNFIRE_ANIMATION_SECONDS = 0.14;
export const RESPAWN_DELAY_SECONDS = 2.5;

export const AI_COMBAT = {
  trooper: { reactionSeconds: 0.55, preferredRange: 205 },
  rusher: { reactionSeconds: 0.36, preferredRange: 65 },
  sniper: { reactionSeconds: 0.78, preferredRange: 300 },
  phantom: { reactionSeconds: 0.28, preferredRange: 110 },
  heavy: { reactionSeconds: 0.68, preferredRange: 165 },
} satisfies Record<EnemyArchetype, { reactionSeconds: number; preferredRange: number }>;


export const AI_PATROL = {
  searchSteps: 4,
  radius: 210,
  arrivalDistance: 18,
  speedMultiplier: 0.60,
  legSeconds: 4,
  retrySeconds: 0.65,
  turnSpeed: 3.2,
};
