import type { CustomMapData } from '../game/customMaps';
import type { AiDifficulty } from '../game/tuning';
import type {
  CardinalDir,
  EnemyArchetype,
  FactionId,
  GameMode,
  HudSnapshot,
  MeleeKind,
  PickupKind,
  SiegeMatchDurationSec,
  SiegePlayerLoadout,
  SiegeStructureKind,
  SiegeUpgradeTrack,
  WeaponHand,
} from '../game/types';

export const MAX_ROOM_PLAYERS = 8;
export const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;
export const MAX_LOBBY_MSG_BYTES = 65_536;
export const MAX_GAME_MSG_BYTES = 65_536;
export const LOBBY_IDLE_TIMEOUT_MS = 5 * 60_000;
export const POST_MATCH_CLEANUP_MS = 60_000;
export const MAX_MATCH_DURATION_MS = 30 * 60_000;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ROOM_CODE_REGEX.test(cleaned) ? cleaned : null;
}

export function sanitizeNickname(raw: string, fallback = '特戰隊員'): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 18);
  return cleaned.length > 0 ? cleaned : fallback;
}

export interface LobbyPlayerInfo {
  peerId: string;
  name: string;
  faction: FactionId;
  skinId: string;
  isHost: boolean;
  disconnected?: boolean;
  siegeLoadout?: SiegePlayerLoadout;
}

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface RoomLobbyState {
  roomCode: string;
  phase: RoomPhase;
  hostPeerId: string;
  maxPlayers: number;
  mode?: GameMode;
  siegeDurationSec?: SiegeMatchDurationSec;
  mapId: string;
  customMap?: CustomMapData;
  difficulty: AiDifficulty;
  players: LobbyPlayerInfo[];
  expiresAt: number | null;
}

export interface RemotePlayerInput {
  startingReputation?: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  mouseDown: boolean;
  clickSeq: number;
  reloadSeq: number;
  swapSeq: number;
  pickupSeq: number;
  dropSeq: number;
  tacticalSeq?: number;
  ultSeq?: number;
  recallSeq?: number;
  upgradeSeq?: number;
  upgradeTrack?: SiegeUpgradeTrack;
}

export const CLIENT_INPUT_TIMING = {
  firingAimMs: 90,
  closeCombatAimMs: 120,
  shieldAimMs: 140,
  idleAimMs: 2000,
  heartbeatMs: 3000,
  minAimDeltaPx: 14,
  minFiringAimDeltaPx: 4,
} as const;

export interface ClientInputSyncState {
  lastSent: RemotePlayerInput | null;
  lastSentAt: number;
  lastAimSentAt: number;
}

export interface ClientInputSyncContext {
  now: number;
  hasNearbyCombatant: boolean;
  holdingShield: boolean;
}

export function shouldSendClientInput(
  next: RemotePlayerInput,
  state: ClientInputSyncState,
  ctx: ClientInputSyncContext
): boolean {
  if (!state.lastSent) return true;
  const prev = state.lastSent;
  if (
    next.moveX !== prev.moveX ||
    next.moveY !== prev.moveY ||
    next.mouseDown !== prev.mouseDown ||
    next.clickSeq !== prev.clickSeq ||
    next.reloadSeq !== prev.reloadSeq ||
    next.swapSeq !== prev.swapSeq ||
    next.pickupSeq !== prev.pickupSeq ||
    next.dropSeq !== prev.dropSeq ||
    (next.tacticalSeq ?? 0) !== (prev.tacticalSeq ?? 0) ||
    (next.ultSeq ?? 0) !== (prev.ultSeq ?? 0) ||
    (next.recallSeq ?? 0) !== (prev.recallSeq ?? 0) ||
    (next.upgradeSeq ?? 0) !== (prev.upgradeSeq ?? 0)
  ) {
    return true;
  }
  if (ctx.now - state.lastSentAt >= CLIENT_INPUT_TIMING.heartbeatMs) {
    return true;
  }
  const aimDelta = Math.hypot(next.aimX - prev.aimX, next.aimY - prev.aimY);
  if (next.mouseDown) {
    return aimDelta >= CLIENT_INPUT_TIMING.minFiringAimDeltaPx && ctx.now - state.lastAimSentAt >= CLIENT_INPUT_TIMING.firingAimMs;
  }
  if (ctx.hasNearbyCombatant) {
    return aimDelta >= CLIENT_INPUT_TIMING.minAimDeltaPx && ctx.now - state.lastAimSentAt >= CLIENT_INPUT_TIMING.closeCombatAimMs;
  }
  if (ctx.holdingShield) {
    return aimDelta >= CLIENT_INPUT_TIMING.minAimDeltaPx && ctx.now - state.lastAimSentAt >= CLIENT_INPUT_TIMING.shieldAimMs;
  }
  return aimDelta >= CLIENT_INPUT_TIMING.minAimDeltaPx && ctx.now - state.lastAimSentAt >= CLIENT_INPUT_TIMING.idleAimMs;
}

export interface NetEquippedSlot {
  t: 'g' | 'm';
  id: string;
  ammo?: number;
  reload?: number;
  dur?: number;
}

export interface NetActorSnapshot {
  id: string;
  peerId?: string;
  reputationChanges?: Record<FactionId, number>;
  isHuman: boolean;
  name: string;
  faction: FactionId;
  skinId: string;
  archetype?: EnemyArchetype;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  angle: number;
  elev: number;
  hp: number;
  maxHp?: number;
  qi: number;
  lives?: number;
  respawn?: number;
  score?: number;
  dmg?: number;
  kills?: number;
  combo?: number;
  maxCombo?: number;
  reserve?: number;
  hand: WeaponHand;
  slots: [NetEquippedSlot, NetEquippedSlot];
  swap?: number;
  swapDur?: number;
  gunfire?: number;
  atkAnim?: number;
  atkDur?: number;
  atkKind?: MeleeKind | null;
  charging?: boolean;
  chargeReady?: boolean;
  comboEmp?: boolean;
  shield?: number;
  shieldImp?: { angle: number; time: number };
  eagle?: number;
  shadow?: number;
  vamp?: number;
  shrink?: number;
  giant?: number;
  blind?: number;
  blindDur?: number;
  freeze?: number;
  stun?: number;
  invuln?: number;
  hitFlash?: number;
  bloom?: number;
}

export interface NetPickupSnapshot {
  id: string;
  x: number;
  y: number;
  kind: PickupKind;
  itemId?: string;
  ammo?: number;
  dur?: number;
}

export interface NetProjectileSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  ownerId: string;
  ownerFaction: FactionId;
  isWave?: boolean;
  isLightOrb?: boolean;
  isBlackDragon?: boolean;
  segs?: { x: number; y: number }[];
}

export interface NetIceBlockSnapshot {
  id: string;
  x: number;
  y: number;
  baseElev: number;
  elev: number;
  slideTimer: number;
  slideDir: CardinalDir | null;
}

export type NetTransientEvent =
  | { k: 'beam'; x1: number; y1: number; x2: number; y2: number; color: string; life: number; w: number }
  | {
      k: 'slash';
      x: number;
      y: number;
      angle: number;
      arc: number;
      reach: number;
      color: string;
      life: number;
      ult: boolean;
      style: 'thrust' | 'claw' | 'sweep';
    }
  | { k: 'text'; x: number; y: number; text: string; color: string; scale: number; subtle?: boolean }
  | { k: 'burst'; x: number; y: number; color: string; count: number }
  | { k: 'trace'; kind: 'blink' | 'siphon'; fx: number; fy: number; tx: number; ty: number; dur: number }
  | { k: 'sfx'; kind: 'gun' | 'melee' | 'hit' | 'down' | 'skill' | 'reload' | 'switch'; x: number; y: number; sub?: string; flag?: boolean };

export interface NetSiegeStructureSnapshot {
  id: string;
  hp: number;
  alive: boolean;
  invuln: boolean;
  bd: boolean;
  aggro: string | null;
  hf?: number;
}

export interface NetSiegeZoneSnapshot {
  id: string;
  kind: 'sanctuary' | 'vortex' | 'decoy';
  fac: 'royal' | 'shadow';
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
}

export interface NetSiegePlayerSnapshot {
  peerId: string;
  gold: number;
  lvl: number;
  xp: number;
  xpNext: number;
  upg: Record<SiegeUpgradeTrack, number>;
  tacCd: number;
  rec: number;
  mk: number;
  tk: number;
  deaths: number;
  maxHp: number;
}

export interface NetSiegeSnapshot {
  matchTime: number;
  matchDuration: number;
  suddenDeath: boolean;
  vanguardState: 'alive' | 'countdown';
  vanguardSec: number;
  baronState: 'alive' | 'countdown';
  baronSec: number;
  teamBuffs: {
    royal: { vanguardStacks: number; baronTimer: number };
    shadow: { vanguardStacks: number; baronTimer: number };
  };
  structures: NetSiegeStructureSnapshot[];
  zones: NetSiegeZoneSnapshot[];
  players: NetSiegePlayerSnapshot[];
}

export interface NetWorldSnapshot {
  seq: number;
  t: number;
  status: HudSnapshot['status'];
  banner: string;
  skillBanner: string | null;
  factionScores: Record<FactionId, number>;
  deploymentQueue: Record<FactionId, number>;
  actors: NetActorSnapshot[];
  pickups?: NetPickupSnapshot[];
  projectiles: NetProjectileSnapshot[];
  iceBlocks?: NetIceBlockSnapshot[];
  siege?: NetSiegeSnapshot;
  events: NetTransientEvent[];
}

export type ClientToServerMsg =
  | { type: 'update_profile'; name: string; faction: FactionId; skinId: string; siegeLoadout?: SiegePlayerLoadout }
  | {
      type: 'update_room_settings';
      mapId: string;
      customMap?: CustomMapData;
      difficulty: AiDifficulty;
      mode?: GameMode;
      siegeDurationSec?: SiegeMatchDurationSec;
    }
  | {
      type: 'start_match';
      mapId: string;
      customMap?: CustomMapData;
      difficulty: AiDifficulty;
      mode?: GameMode;
      siegeDurationSec?: SiegeMatchDurationSec;
    }
  | { type: 'match_ended' }
  | { type: 'return_to_lobby' }
  | { type: 'player_input'; input: RemotePlayerInput }
  | { type: 'world_snapshot'; snapshot: NetWorldSnapshot }
  | { type: 'ping'; clientTime: number };

export type ServerToClientMsg =
  | { type: 'welcome'; peerId: string; lobby: RoomLobbyState; reconnectToken?: string }
  | { type: 'lobby_state'; lobby: RoomLobbyState }
  | { type: 'match_started'; lobby: RoomLobbyState }
  | { type: 'remote_input'; peerId: string; input: RemotePlayerInput }
  | { type: 'world_snapshot'; snapshot: NetWorldSnapshot }
  | { type: 'peer_left'; peerId: string; name: string; canRejoin?: boolean }
  | { type: 'peer_rejoined'; peerId: string; name: string }
  | { type: 'room_closed'; reason: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; clientTime: number };
