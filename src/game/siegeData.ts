import {
  SiegeFactionId,
  SiegeMatchDurationSec,
  SiegePassiveId,
  SiegePlayerLoadout,
  SiegeTacticalId,
  SiegeUltimateId,
  SiegeUpgradeTrack,
} from './types';

export interface SiegeSkillMeta<TId extends string> {
  id: TId;
  faction: SiegeFactionId;
  name: string;
  shortTag: string;
  cooldownSec?: number;
  color: string;
  desc: string;
}

export const SIEGE_TACTICAL_SKILLS: SiegeSkillMeta<SiegeTacticalId>[] = [
  {
    id: 'royal_aegis_reflect',
    faction: 'royal',
    name: '鐵壁反震盾',
    shortTag: '反傷護盾',
    cooldownSec: 12,
    color: '#38BDF8',
    desc: '展開 3.5 秒減傷 60% 的聖光反震盾，並將 35% 遠程傷害反彈給攻擊者（開火不破盾）。',
  },
  {
    id: 'royal_sanctuary_zone',
    faction: 'royal',
    name: '聖域光幕',
    shortTag: '群體結界',
    cooldownSec: 14,
    color: '#FACC15',
    desc: '於腳下展開持續 4.5 秒的半徑 160px 聖域光環，持續為圈內友軍回復 +14 HP/s 並減傷 25%。',
  },
  {
    id: 'royal_dash_bash',
    faction: 'royal',
    name: '破陣衝鋒',
    shortTag: '位移控制',
    cooldownSec: 10,
    color: '#60A5FA',
    desc: '向游標方向突進最高 190px，落點震飛周圍敵軍並造成 25 傷害與 0.8 秒暈眩。',
  },
  {
    id: 'shadow_blink_swap',
    faction: 'shadow',
    name: '瞬影殘步',
    shortTag: '影爆突襲',
    cooldownSec: 11,
    color: '#C084FC',
    desc: '向游標方向瞬影突進 190px 並在原地留下一顆殘影爆彈，1.4 秒後引爆造成 38 範圍傷害與 0.5 秒暈眩。',
  },
  {
    id: 'shadow_hunter_mark',
    faction: 'shadow',
    name: '鷹眼獵殺',
    shortTag: '增傷偵察',
    cooldownSec: 13,
    color: '#FB7185',
    desc: '開啟 4.5 秒鷹眼視距強化並標記前方敵人 5 秒，被標記目標承受的所有傷害額外 +22%。',
  },
  {
    id: 'shadow_smoke_shroud',
    faction: 'shadow',
    name: '影霧隱身',
    shortTag: '閃避加速',
    cooldownSec: 12,
    color: '#A855F7',
    desc: '進入 3.5 秒影分身煙霧狀態（2/3 機率閃避遠程彈道），同時獲得 +22% 移動速度加成。',
  },
];

export const SIEGE_ULTIMATE_SKILLS: SiegeSkillMeta<SiegeUltimateId>[] = [
  {
    id: 'royal_judgment_beam',
    faction: 'royal',
    name: '審判光柱',
    shortTag: '破城貫穿炮',
    color: '#FDE047',
    desc: '發射超粗黃金審判光柱貫穿直線敵軍（75 傷害），對防禦塔／主堡與 Boss 造成 180 破甲重創，絕不傷隊友。',
  },
  {
    id: 'royal_light_rain',
    faction: 'royal',
    name: '連珠光雨',
    shortTag: '9 彈扇射清線',
    color: '#38BDF8',
    desc: '向前方扇形齊射 9 發貫穿聖光彈（每發 28 傷害），絕不誤傷隊友，瞬間掃蕩整波兵線。',
  },
  {
    id: 'royal_healing_salvo',
    faction: 'royal',
    name: '治癒聖彈',
    shortTag: '攻守雙向光波',
    color: '#4ADE80',
    desc: '射出 5 發貫穿聖光波，對敵軍造成 32 傷害，同時為穿過的友軍英雄與小兵回復 +35 生命值。',
  },
  {
    id: 'shadow_twin_dragons',
    faction: 'shadow',
    name: '雙影噬龍',
    shortTag: '雙龍夾擊',
    color: '#818CF8',
    desc: '沿左右夾角召喚兩條高速深紫黑龍（龍頭 24／龍身 16 傷，可反彈 3 次），交叉撕裂團戰陣型。',
  },
  {
    id: 'shadow_pierce_dragon',
    faction: 'shadow',
    name: '極速貫穿龍',
    shortTag: '穿牆遠程狙龍',
    color: '#F43F5E',
    desc: '無視實牆與地形阻擋的極速幽冥長龍（55 傷害、1500px 超遠射程），專精隔牆搶 Boss 與超遠收割。',
  },
  {
    id: 'shadow_vortex_dragon',
    faction: 'shadow',
    name: '盤龍結界',
    shortTag: '持續漩渦陣',
    color: '#A855F7',
    desc: '將長龍轟至目標點化作持續 3.5 秒、半徑 135px 的盤龍漩渦，每 0.45 秒對圈內敵軍與建築造成 16 傷害。',
  },
];

export const SIEGE_PASSIVES: SiegeSkillMeta<SiegePassiveId>[] = [
  {
    id: 'royal_fortitude',
    faction: 'royal',
    name: '聖殿堅壁',
    shortTag: '+25 血 · 扛塔 -15%',
    color: '#38BDF8',
    desc: '最大生命值 +25，且承受敵方防禦塔與主城堡的砲擊傷害永久減少 15%。',
  },
  {
    id: 'royal_vanguard_aura',
    faction: 'royal',
    name: '先鋒旗幟',
    shortTag: '+10% 跑速 · 強化小兵',
    color: '#FACC15',
    desc: '移動速度 +10%，身邊 240px 內的己方小兵攻擊傷害提升 20%。',
  },
  {
    id: 'royal_steady_aim',
    faction: 'royal',
    name: '精密準星',
    shortTag: '-25% 散布 · +15% 換彈',
    color: '#60A5FA',
    desc: '所有槍械散布縮減 25%，換彈匣速度提升 15%，適合中遠程穩定點射與推塔。',
  },
  {
    id: 'shadow_assassin',
    faction: 'shadow',
    name: '冥影追獵',
    shortTag: '殘血 +20% · 殺敵回氣',
    color: '#FB7185',
    desc: '對生命低於 45% 的敵人造成額外 20% 傷害，擊殺英雄或小兵立即回復 18 點氣力。',
  },
  {
    id: 'shadow_swift_foot',
    faction: 'shadow',
    name: '暗影疾步',
    shortTag: '+12% 跑速 · +25% 回氣',
    color: '#C084FC',
    desc: '移動速度 +12%，自然回氣與集氣速度提升 25%，適合三路遊走支援與搶野。',
  },
  {
    id: 'shadow_executioner',
    faction: 'shadow',
    name: '破城死神',
    shortTag: '英雄／Boss +15% 傷',
    color: '#F43F5E',
    desc: '對敵方英雄與中立 Boss／野怪造成的傷害額外提升 15%。',
  },
];

export interface SiegeHeroPreset {
  skinId: string;
  faction: SiegeFactionId;
  roleBadge: string;
  laneHint: string;
  loadout: SiegePlayerLoadout;
}

export const SIEGE_HERO_PRESETS: SiegeHeroPreset[] = [
  {
    skinId: 'royal_default',
    faction: 'royal',
    roleBadge: '均衡射手',
    laneHint: '推薦中路 / 下路',
    loadout: {
      gunId: 'rifle',
      meleeId: 'knife',
      tacticalId: 'royal_aegis_reflect',
      ultimateId: 'royal_light_rain',
      passiveId: 'royal_steady_aim',
    },
  },
  {
    skinId: 'royal_paladin',
    faction: 'royal',
    roleBadge: '聖光支援',
    laneHint: '推薦雙人下路 / 團戰',
    loadout: {
      gunId: 'rifle',
      meleeId: 'greatsword',
      tacticalId: 'royal_sanctuary_zone',
      ultimateId: 'royal_healing_salvo',
      passiveId: 'royal_vanguard_aura',
    },
  },
  {
    skinId: 'royal_valkyrie',
    faction: 'royal',
    roleBadge: '突進戰士',
    laneHint: '推薦上路 / 野區',
    loadout: {
      gunId: 'shotgun',
      meleeId: 'claw',
      tacticalId: 'royal_dash_bash',
      ultimateId: 'royal_light_rain',
      passiveId: 'royal_vanguard_aura',
    },
  },
  {
    skinId: 'royal_warden',
    faction: 'royal',
    roleBadge: '鐵壁重坦',
    laneHint: '推薦上路扛塔先手',
    loadout: {
      gunId: 'shotgun',
      meleeId: 'shield',
      tacticalId: 'royal_aegis_reflect',
      ultimateId: 'royal_judgment_beam',
      passiveId: 'royal_fortitude',
    },
  },
  {
    skinId: 'royal_courier',
    faction: 'royal',
    roleBadge: '聖殿炮台',
    laneHint: '推薦中路遠程壓制',
    loadout: {
      gunId: 'sniper',
      meleeId: 'greatsword',
      tacticalId: 'royal_sanctuary_zone',
      ultimateId: 'royal_judgment_beam',
      passiveId: 'royal_steady_aim',
    },
  },
  {
    skinId: 'shadow_default',
    faction: 'shadow',
    roleBadge: '全能偵察',
    laneHint: '推薦中路 / 遊走',
    loadout: {
      gunId: 'rifle',
      meleeId: 'knife',
      tacticalId: 'shadow_hunter_mark',
      ultimateId: 'shadow_twin_dragons',
      passiveId: 'shadow_swift_foot',
    },
  },
  {
    skinId: 'shadow_kuro',
    faction: 'shadow',
    roleBadge: '疾風影刺',
    laneHint: '推薦上路 / 單抓',
    loadout: {
      gunId: 'shotgun',
      meleeId: 'claw',
      tacticalId: 'shadow_blink_swap',
      ultimateId: 'shadow_twin_dragons',
      passiveId: 'shadow_assassin',
    },
  },
  {
    skinId: 'shadow_crimson',
    faction: 'shadow',
    roleBadge: '結界法師',
    laneHint: '推薦中路清線團控',
    loadout: {
      gunId: 'rifle',
      meleeId: 'greatsword',
      tacticalId: 'shadow_smoke_shroud',
      ultimateId: 'shadow_vortex_dragon',
      passiveId: 'shadow_swift_foot',
    },
  },
  {
    skinId: 'shadow_reaper',
    faction: 'shadow',
    roleBadge: '幻影突襲',
    laneHint: '推薦下路 / 搶野',
    loadout: {
      gunId: 'pistol',
      meleeId: 'claw',
      tacticalId: 'shadow_smoke_shroud',
      ultimateId: 'shadow_twin_dragons',
      passiveId: 'shadow_assassin',
    },
  },
  {
    skinId: 'shadow_phantom',
    faction: 'shadow',
    roleBadge: '冥鴉狙擊',
    laneHint: '推薦中路超遠狙殺',
    loadout: {
      gunId: 'sniper',
      meleeId: 'greatsword',
      tacticalId: 'shadow_hunter_mark',
      ultimateId: 'shadow_pierce_dragon',
      passiveId: 'shadow_executioner',
    },
  },
];

export interface SiegeUpgradeMeta {
  track: SiegeUpgradeTrack;
  keyHint: string;
  name: string;
  shortName: string;
  maxLevel: number;
  costs: readonly [number, number, number];
  bonusText: string;
  color: string;
}

export const SIEGE_UPGRADES: SiegeUpgradeMeta[] = [
  {
    track: 'firepower',
    keyHint: '3',
    name: '槍械改造',
    shortName: '槍械',
    maxLevel: 3,
    costs: [100, 200, 320],
    bonusText: '每級：槍傷 +14% · 建築/Boss 傷 +15% · 換彈加快 8%',
    color: '#F59E0B',
  },
  {
    track: 'blade',
    keyHint: '4',
    name: '近武鍛造',
    shortName: '技刃',
    maxLevel: 3,
    costs: [100, 200, 320],
    bonusText: '每級：近戰與大招傷害 +16% · 戰術技傷害 +15%',
    color: '#FB7185',
  },
  {
    track: 'armor',
    keyHint: '5',
    name: '重甲護體',
    shortName: '重甲',
    maxLevel: 3,
    costs: [100, 200, 320],
    bonusText: '每級：最大血量 +30 · 防禦 +3 · 移動速度 +5%',
    color: '#38BDF8',
  },
  {
    track: 'core',
    keyHint: '6',
    name: '光暈核心',
    shortName: '核心',
    maxLevel: 3,
    costs: [100, 200, 320],
    bonusText: '每級：回氣速度 +18% · 戰術技 CD 縮短 10%',
    color: '#A855F7',
  },
];

export const SIEGE_DURATION_OPTIONS: { sec: SiegeMatchDurationSec; label: string }[] = [
  { sec: 900, label: '15 分鐘（快節奏）' },
  { sec: 1080, label: '18 分鐘（標準）' },
  { sec: 1200, label: '20 分鐘（史詩）' },
];

export const SIEGE_CONFIG = {
  teamSize: 5,
  tacticalUnlockLevel: 2,
  ultimateUnlockLevel: 4,
  defaultDurationSec: 1080 as SiegeMatchDurationSec,
  suddenDeathLeadSec: 180,
  firstWaveDelaySec: 8,
  waveIntervalSec: 22,
  suddenDeathWaveIntervalSec: 15,
  maxActiveMinions: 36,
  jungleInitialDelaySec: 35,
  jungleRespawnSec: 80,
  vanguardInitialDelaySec: 180,
  vanguardRespawnSec: 180,
  baronInitialDelaySec: 480,
  baronRespawnSec: 240,
  baronBuffDurationSec: 90,
  recallDurationSec: 3.5,
  fountainHealPerSec: 28,
  outOfCombatAmmoDelaySec: 2.0,
  outOfCombatAmmoPerSec: 3.5,
  backdoorRadiusPx: 310,
  backdoorDamageMult: 0.35,
  suddenDeathStructureDmgMult: 1.35,
  passiveGoldPerSec: 3,
} as const;

const TACTICAL_IDS = new Set<string>(SIEGE_TACTICAL_SKILLS.map((s) => s.id));
const ULTIMATE_IDS = new Set<string>(SIEGE_ULTIMATE_SKILLS.map((s) => s.id));
const PASSIVE_IDS = new Set<string>(SIEGE_PASSIVES.map((s) => s.id));
const VALID_GUN_IDS = new Set(['pistol', 'rifle', 'shotgun', 'sniper']);
const VALID_MELEE_IDS = new Set(['knife', 'claw', 'greatsword', 'shield']);

export function getDefaultSiegeLoadout(faction: SiegeFactionId, skinId?: string): SiegePlayerLoadout {
  const matched = SIEGE_HERO_PRESETS.find((p) => p.faction === faction && p.skinId === skinId);
  if (matched) return { ...matched.loadout };
  const fallback = SIEGE_HERO_PRESETS.find((p) => p.faction === faction) ?? SIEGE_HERO_PRESETS[0];
  return { ...fallback.loadout };
}

export function sanitizeSiegeLoadout(faction: SiegeFactionId, raw?: Partial<SiegePlayerLoadout> | null): SiegePlayerLoadout {
  const fallback = getDefaultSiegeLoadout(faction);
  if (!raw) return fallback;
  const gunId = raw.gunId && VALID_GUN_IDS.has(raw.gunId) ? raw.gunId : fallback.gunId;
  const meleeId = raw.meleeId && VALID_MELEE_IDS.has(raw.meleeId) ? raw.meleeId : fallback.meleeId;
  const tacMeta = SIEGE_TACTICAL_SKILLS.find((s) => s.id === raw.tacticalId && s.faction === faction);
  const ultMeta = SIEGE_ULTIMATE_SKILLS.find((s) => s.id === raw.ultimateId && s.faction === faction);
  const pasMeta = SIEGE_PASSIVES.find((s) => s.id === raw.passiveId && s.faction === faction);
  return {
    gunId,
    meleeId,
    tacticalId: tacMeta && TACTICAL_IDS.has(tacMeta.id) ? tacMeta.id : fallback.tacticalId,
    ultimateId: ultMeta && ULTIMATE_IDS.has(ultMeta.id) ? ultMeta.id : fallback.ultimateId,
    passiveId: pasMeta && PASSIVE_IDS.has(pasMeta.id) ? pasMeta.id : fallback.passiveId,
  };
}

export function getTacticalMeta(id: SiegeTacticalId): SiegeSkillMeta<SiegeTacticalId> {
  return SIEGE_TACTICAL_SKILLS.find((s) => s.id === id) ?? SIEGE_TACTICAL_SKILLS[0];
}

export function getUltimateMeta(id: SiegeUltimateId): SiegeSkillMeta<SiegeUltimateId> {
  return SIEGE_ULTIMATE_SKILLS.find((s) => s.id === id) ?? SIEGE_ULTIMATE_SKILLS[0];
}

export function getPassiveMeta(id: SiegePassiveId): SiegeSkillMeta<SiegePassiveId> {
  return SIEGE_PASSIVES.find((s) => s.id === id) ?? SIEGE_PASSIVES[0];
}
