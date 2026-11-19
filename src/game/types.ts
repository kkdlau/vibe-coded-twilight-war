export type GameMode = 'frontier';

export type FactionId = 'royal' | 'shadow' | 'mercenary';

export type MapId =
  | 'tokyo_shrine'
  | 'european_castle'
  | 'desert_ruins'
  | 'industrial_warehouse'
  | 'western_railway'
  | 'bamboo_fortress'
  | 'stanley_island';

export type GunKind = 'pistol' | 'rifle' | 'shotgun' | 'sniper';
export type MeleeKind = 'knife' | 'claw' | 'greatsword' | 'shield';

export interface GunDef {
  id: string;
  kind: GunKind;
  name: string;
  damage: number; // Max center-hit damage
  fireRate: number; // shots per second
  magSize: number;
  reloadTime: number; // seconds
  moveSpeedMult: number;
  baseCrosshair: number; // px base radius before distance-scaled spread curve (see tuning.ts)
  maxCrosshair: number;
  bloomPerShot: number;
  pellets: number;
  color: string;
  description: string;
}

export interface MeleeDef {
  id: string;
  kind: MeleeKind;
  name: string;
  damage: number;
  swingRate: number;
  moveSpeedMult: number;
  reach: number;
  arc: number;
  color: string;
}

export type WeaponHand = 0 | 1;

export type EquippedWeapon =
  | { type: 'gun'; def: GunDef; ammoInMag: number; reloadTimer: number }
  | { type: 'melee'; def: MeleeDef; durability: number };

export type CharacterStyle =
  | 'standard_visor'
  | 'spiky_crest'
  | 'twintail_bow'
  | 'horned_mask'
  | 'cyber_visor'
  | 'royal_wing_crown'
  | 'royal_ears_band'
  | 'royal_v_knight'
  | 'merc_cloak_goggles'
  | 'merc_ponytail_goggles'
  | 'merc_spiky_goggles'
  | 'merc_gem_band';

export interface CharacterSkin {
  id: string;
  name: string;
  roleTitle: string;
  isDefault?: boolean;
  bodyColor: string;
  bodyHighlight: string;
  trimColor: string;
  hairColor: string;
  visorColor: string;
  handColor: string;
  faceSkinColor?: string;
  hairOrCrest: CharacterStyle;
  description: string;
}

export interface MapMeta {
  id: MapId;
  name: string;
  region: string;
  environment: '野外' | '室內';
  era: string;
  description: string;
  highlight: string;
  accentColor: string;
}

export interface FactionInfo {
  id: FactionId;
  name: string;
  subtitle: string;
  color: string;
  accentHex: string;
  bonusDesc: string;
  startGunId: string;
  startMeleeId: string;
  meleeSkills: Record<MeleeKind, { name: string; desc: string }>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FloorStyle =
  | 'shrine_dirt'
  | 'bamboo_moss'
  | 'desert_sand'
  | 'castle_stone'
  | 'warehouse_steel'
  | 'grass_ground';

export type PlatformStyle =
  | 'default'
  | 'shrine_floor'
  | 'hill'
  | 'mud_pit'
  | 'pyramid'
  | 'castle_dais'
  | 'wooden_plank'
  | 'grass_ground'
  | 'rail_track';

export interface StairRect extends Rect {
  elevation: number; // 所在底層高度 +0.5（例：-1.0 -> -0.5、0.0 -> 0.5、1.0 -> 1.5、2.0 -> 2.5）
  direction: 'north' | 'south' | 'east' | 'west';
  style?: PlatformStyle;
}

export type ObstacleStyle =
  | 'default'
  | 'small_crate'
  | 'shrine_wall'
  | 'castle_pillar'
  | 'obelisk'
  | 'container'
  | 'house'
  | 'stone_wall_tan'
  | 'stone_wall_green'
  | 'stone_wall_red'
  | 'stone_wall_blue'
  | 'railing'
  | 'rock_small'
  | 'rock_large'
  | 'bamboo'
  | 'train_car';

export interface Obstacle extends Rect {
  elevation: number; // 1.0 小木箱／欄杆, 1.5 大木箱／小石塊, 2.0 貨櫃／火車／大岩石, 10 實牆／房屋／竹林／石柱（子彈與視線統一依高度計算）
  kind: 'crate' | 'wall';
  style?: ObstacleStyle;
  colorVariant?: string;
  direction?: 'north' | 'south' | 'east' | 'west';
}

export interface GridTile {
  gx: number;
  gy: number;
}

export type FarmCropType = 'empty' | 'carrot' | 'wheat' | 'cabbage';

export interface FarmTileCell {
  gx: number;
  gy: number;
  crop: FarmCropType;
}

export interface RailTrackCell {
  gx: number;
  gy: number;
  orientation: 'horizontal' | 'vertical';
}

export interface TerrainTileCell {
  elev: number;
  style: PlatformStyle;
}

export interface BridgeRect extends Rect {
  orientation: 'horizontal' | 'vertical';
  style?: 'wood' | 'stone';
}

export interface BushProp {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreeProp {
  x: number;
  y: number;
  w: number;
  h: number;
  canopyRadius: number;
  foliagePalette?: [string, string, string, string];
}

export interface WeaponSpawn {
  x: number;
  y: number;
  kind: 'gun' | 'melee';
  weaponId: string;
}

export interface AmmoSpawn {
  x: number;
  y: number;
  respawnTimer: number;
  active: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  sizeScale: number;
  angle: number;
  walkPhase: number;
  moveIntensity: number;
  elevation: number; // 地形與物件高度（平地 0.0、階梯 +0.5、疊加層 +1.0/層）
  hp: number;
  maxHp: number;
  maxShield: number;
  qi: number; // 0 to 100. Full = 100. Drains to 0 while charging melee!
  maxQi: number;
  lives: number;
  maxLives: number;
  reputation: number;
  reputations: Record<FactionId, number>;
  score: number;
  totalDamage: number;
  kills: number;
  maxCombo: number;
  comboCount: number;
  comboTimer: number;
  faction: FactionId;
  characterSkin: CharacterSkin;
  activeHand: WeaponHand;
  weapons: [EquippedWeapon, EquippedWeapon];
  reserveAmmo: number; // Default 30, max 45
  maxReserveAmmo: number;
  swapTimer: number;
  swapDuration: number;
  gunfireTimer: number;
  attackAnimTimer: number;
  attackAnimDuration: number;
  attackAnimKind: MeleeKind | null;
  attackCooldown: number;
  lastAttackAt: number;
  delayCancelReady: boolean;
  comboEmpowerTimer: number;
  chargingMelee: boolean;
  chargeReady: boolean;
  // 9 Faction × Melee active buffs
  royalShieldTimer: number;
  eagleEyeTimer: number;
  shadowCloneTimer: number;
  vampireTimer: number;
  shrinkTimer: number;
  giantTimer: number;
  blindTimer: number;
  blindDuration: number;
  invulnTimer: number;
  delayCancelBonus: number;
}

export type EnemyArchetype = 'trooper' | 'rusher' | 'sniper' | 'phantom' | 'heavy';

export interface EnemyEntity {
  id: string;
  name: string;
  archetype: EnemyArchetype;
  faction: FactionId;
  isAlly: boolean;
  activeHand: WeaponHand;
  weapons: [EquippedWeapon, EquippedWeapon];
  swapTimer: number;
  swapDuration: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  sizeScale: number;
  angle: number;
  walkPhase: number;
  moveIntensity: number;
  elevation: number;
  hp: number;
  maxHp: number; // Always 100
  qi: number;
  maxQi: number;
  chargingMelee: boolean;
  chargeReady: boolean;
  speed: number;
  attackCooldown: number;
  aiTimer: number;
  lastSeenTargetPos: { x: number; y: number } | null;
  alertTimer: number;
  hasLosToTarget: boolean;
  visibleTargetId: string | null;
  reactionTimer: number;
  focusedTargetId: string | null;
  aggroLockTimer: number;
  pathTiles: GridTile[];
  pathTimer: number;
  patrolAnchor: { x: number; y: number };
  patrolTarget: { x: number; y: number } | null;
  patrolTimer: number;
  // AI Active Faction × Melee Skill Buffs
  royalShieldTimer: number;
  eagleEyeTimer: number;
  shadowCloneTimer: number;
  vampireTimer: number;
  shrinkTimer: number;
  giantTimer: number;
  blindTimer: number;
  stunTimer: number;
  hitFlash: number;
  gunfireTimer: number;
  attackAnimTimer: number;
  attackAnimDuration: number;
  attackAnimKind: MeleeKind | null;
  color: string;
  characterSkin: CharacterSkin;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  startElevation: number;
  minTraversedElevation: number;
  ownerId: string;
  ownerFaction: FactionId;
  fromPlayer: boolean;
  isAlly: boolean;
  noFriendlyFire?: boolean;
  color: string;
  life: number;
  maxLife: number;
  pierce: number;
  isWave?: boolean;
  isLightOrb?: boolean;
  isBlackDragon?: boolean;
  segments?: { x: number; y: number }[];
  bouncesLeft?: number;
  distanceTraveled?: number;
  maxDistance?: number;
  headDamage?: number;
  bodyDamage?: number;
  targetHitCooldowns?: Record<string, number>;
  hitIds: Set<string>;
}

export interface BeamTracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
  width: number;
}

export interface SlashEffect {
  x: number;
  y: number;
  angle: number;
  arc: number;
  reach: number;
  color: string;
  life: number;
  maxLife: number;
  isUltimate: boolean;
  style: 'thrust' | 'claw' | 'sweep';
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export type PickupKind = 'ammo' | 'gun' | 'melee';

export interface PickupItem {
  id: string;
  x: number;
  y: number;
  kind: PickupKind;
  label: string;
  color: string;
  gunDef?: GunDef;
  meleeDef?: MeleeDef;
  amount?: number;
  ammoInMag?: number;
  durability?: number;
  bobPhase: number;
  ammoSpawnIndex?: number;
}

export interface TimedSkillHudItem {
  id: 'royalShield' | 'eagleEye' | 'shadowClone' | 'vampire' | 'shrink' | 'giant';
  name: string;
  remaining: number;
  duration: number;
  color: string;
}

export interface HudSnapshot {
  mode: GameMode;
  mapId: string;
  mapName: string;
  status: 'PLAYING' | 'PAUSED' | 'RESPAWNING' | 'GAME_OVER' | 'VICTORY';
  respawnSeconds: number;
  enemiesRemaining: number;
  totalSoldiersRemaining: number;
  factionRemaining: Record<FactionId, number>;
  factionActive: Record<FactionId, number>;
  bannerText: string;
  activeSkillBanner: string | null;
  player: {
    hp: number;
    maxHp: number;
    shield: number;
    maxShield: number;
    qi: number;
    maxQi: number;
    lives: number;
    maxLives: number;
    reputation: number;
    reputations: Record<FactionId, number>;
    qiSpeedMultiplier: number;
    score: number;
    totalDamage: number;
    kills: number;
    comboCount: number;
    maxCombo: number;
    faction: FactionId;
    characterSkin: CharacterSkin;
    weapon: EquippedWeapon;
    offHandWeapon: EquippedWeapon;
    reserveAmmo: number;
    maxReserveAmmo: number;
    reloadProgress: number;
    isSwapping: boolean;
    chargingMelee: boolean;
    chargeReady: boolean;
    comboEmpower: boolean;
    activeSkillName: string | null;
    activeBuffText: string | null;
    activeTimedSkills: TimedSkillHudItem[];
  };
  nearbyPickup: string | null;
  factionScores: Record<FactionId, number>;
}

export interface RunRecord {
  id: string;
  mode: GameMode;
  mapName: string;
  faction: FactionId;
  characterName: string;
  score: number;
  totalDamage: number;
  kills: number;
  victory: boolean;
  timestamp: number;
}
