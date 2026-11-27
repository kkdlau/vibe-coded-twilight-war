import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Crosshair,
  Flame,
  Play,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react';
import { FACTIONS, FACTION_CHARACTERS, GUNS, MELEES } from '../game/data';
import {
  SIEGE_DURATION_OPTIONS,
  SIEGE_HERO_PRESETS,
  SIEGE_PASSIVES,
  SIEGE_TACTICAL_SKILLS,
  SIEGE_ULTIMATE_SKILLS,
  getDefaultSiegeLoadout,
  getPassiveMeta,
  getTacticalMeta,
  getUltimateMeta,
} from '../game/siegeData';
import { SIEGE_MAP_ID } from '../game/siegeMap';
import { AI_DIFFICULTY, type AiDifficulty } from '../game/tuning';
import {
  CharacterSkin,
  MeleeDef,
  SiegeFactionId,
  SiegeMatchDurationSec,
  SiegePlayerLoadout,
} from '../game/types';
import { MiniMapPreview } from './MiniMapPreview';
import { CharacterAvatarSvg, FactionLogoSvg, WeaponIconSvg } from './WeaponArt';

interface SiegeSetupViewProps {
  initialFaction?: SiegeFactionId;
  aiDifficulty: AiDifficulty;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onBackToLobby: () => void;
  onStartSiege: (
    faction: SiegeFactionId,
    character: CharacterSkin,
    loadout: SiegePlayerLoadout,
    durationSec: SiegeMatchDurationSec
  ) => void;
}

type SetupTab = 'gear' | 'skills';

function formatMeleeSummary(m: MeleeDef): string {
  if (m.kind === 'shield') {
    return `正面格擋 · 耐久 100 · 震退破陣 · 移動 ${Math.round(m.moveSpeedMult * 100)}%`;
  }
  return `傷害 ${m.damage} · 攻速 ${m.swingRate}/s · 距離 ${m.reach}px`;
}

export const SiegeSetupView: React.FC<SiegeSetupViewProps> = ({
  initialFaction = 'royal',
  aiDifficulty,
  onDifficultyChange,
  onBackToLobby,
  onStartSiege,
}) => {
  const [faction, setFaction] = useState<SiegeFactionId>(initialFaction);
  const [selectedCharId, setSelectedCharId] = useState<string>(FACTION_CHARACTERS[initialFaction][0].id);
  const [loadout, setLoadout] = useState<SiegePlayerLoadout>(() =>
    getDefaultSiegeLoadout(initialFaction, FACTION_CHARACTERS[initialFaction][0].id)
  );
  const [durationSec, setDurationSec] = useState<SiegeMatchDurationSec>(1080);
  const [activeTab, setActiveTab] = useState<SetupTab>('gear');

  const characters = FACTION_CHARACTERS[faction];
  const selectedChar = characters.find((c) => c.id === selectedCharId) || characters[0];
  const facInfo = FACTIONS[faction];

  const tacticalList = useMemo(
    () => SIEGE_TACTICAL_SKILLS.filter((s) => s.faction === faction),
    [faction]
  );
  const ultimateList = useMemo(
    () => SIEGE_ULTIMATE_SKILLS.filter((s) => s.faction === faction),
    [faction]
  );
  const passiveList = useMemo(
    () => SIEGE_PASSIVES.filter((s) => s.faction === faction),
    [faction]
  );

  const selectedGun = GUNS.find((g) => g.id === loadout.gunId) || GUNS[0];
  const selectedMelee = MELEES.find((m) => m.id === loadout.meleeId) || MELEES[0];
  const selectedTactical = getTacticalMeta(loadout.tacticalId);
  const selectedUltimate = getUltimateMeta(loadout.ultimateId);
  const selectedPassive = getPassiveMeta(loadout.passiveId);

  const handleFactionSwitch = (nextFac: SiegeFactionId) => {
    if (nextFac === faction) return;
    setFaction(nextFac);
    const firstSkin = FACTION_CHARACTERS[nextFac][0];
    setSelectedCharId(firstSkin.id);
    setLoadout(getDefaultSiegeLoadout(nextFac, firstSkin.id));
  };

  const handleHeroPick = (skinId: string) => {
    setSelectedCharId(skinId);
    setLoadout(getDefaultSiegeLoadout(faction, skinId));
  };

  const activePreset = SIEGE_HERO_PRESETS.find((p) => p.faction === faction && p.skinId === selectedChar.id);

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0B0F17] text-slate-100 select-none">
      {/* Top Header */}
      <header className="sticky top-0 z-20 shrink-0 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBackToLobby}
            className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            返回大廳
          </button>

          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="text-base sm:text-lg font-black tracking-wide text-white">
              三路城堡攻防戰（塔防 MOBA · 5v5 無限復活）
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(['royal', 'shadow'] as SiegeFactionId[]).map((fac) => {
              const active = faction === fac;
              return (
                <button
                  key={fac}
                  onClick={() => handleFactionSwitch(fac)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    active
                      ? fac === 'royal'
                        ? 'bg-sky-950/80 border-sky-400 text-sky-100 shadow-md shadow-sky-500/20'
                        : 'bg-fuchsia-950/80 border-fuchsia-400 text-fuchsia-100 shadow-md shadow-fuchsia-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  <FactionLogoSvg faction={fac} className="w-5 h-5" />
                  <span>{FACTIONS[fac].name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: 2-Tab Customizer */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#121926] border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('gear')}
              className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'gear'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Swords className="w-4 h-4" />
              <span>1. 選擇英雄與武器</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'skills'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>2. 技能變種與天賦</span>
            </button>
          </div>

          {activeTab === 'gear' ? (
            <>
              {/* Hero Roster */}
              <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-white">選擇出戰英雄</h2>
                    {activePreset && (
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-xs font-bold text-amber-300">
                        {activePreset.roleBadge} · {activePreset.laneHint}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">選英雄會自動配好推薦裝備與技能，仍可自由修改</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {characters.map((ch) => {
                    const active = ch.id === selectedChar.id;
                    const preset = SIEGE_HERO_PRESETS.find((p) => p.faction === faction && p.skinId === ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => handleHeroPick(ch.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center text-center gap-1.5 ${
                          active
                            ? 'bg-[#1A273D] border-amber-400 shadow-lg shadow-amber-500/15'
                            : 'bg-slate-900/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <CharacterAvatarSvg skin={ch} className="w-12 h-12 shrink-0" />
                        <span className="text-xs sm:text-sm font-bold text-slate-100 leading-tight">
                          {ch.name.replace('（預設）', '')}
                        </span>
                        <span className="text-xs text-sky-300 font-semibold">{preset?.roleBadge}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Primary Gun Selector */}
              <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                    <Crosshair className="w-4 h-4" />
                    <span>主武器（遠程槍械 · 無地上執槍）</span>
                  </div>
                  <span className="text-xs text-slate-400">按 [R] 裝彈 · 脫戰自動補彈</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {GUNS.map((g) => {
                    const active = loadout.gunId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setLoadout((prev) => ({ ...prev, gunId: g.id }))}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          active
                            ? 'bg-[#1A273D] border-amber-400 shadow-md shadow-amber-500/15'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0">
                          <WeaponIconSvg kind={g.kind} color={g.color} className="w-9 h-9" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-white">{g.name}</span>
                            {active && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">
                                <Check className="w-3 h-3" />
                                已裝備
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 mt-1">
                            {g.kind === 'shotgun'
                              ? `單彈丸 ${g.damage}×${g.pellets} · 彈匣 ${g.magSize} 發`
                              : `中心傷害 ${g.damage} · 彈匣 ${g.magSize} 發 · 射速 ${g.fireRate}/s`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Secondary Melee / Shield Selector */}
              <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-sky-300">
                    <Swords className="w-4 h-4" />
                    <span>副武器（近戰兵器 / 戰術盾 · 按 [Q] 切換）</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MELEES.map((m) => {
                    const active = loadout.meleeId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setLoadout((prev) => ({ ...prev, meleeId: m.id }))}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          active
                            ? 'bg-[#1A273D] border-sky-400 shadow-md shadow-sky-500/15'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0">
                          <WeaponIconSvg kind={m.kind} color={m.color} className="w-9 h-9" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-white">{m.name}</span>
                            {active && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold shrink-0">
                                <Check className="w-3 h-3" />
                                已裝備
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 mt-1">{formatMeleeSummary(m)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTab('skills')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/50 text-sky-200 text-sm font-bold cursor-pointer transition-colors"
                  >
                    <span>下一步：自訂技能與天賦</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Tactical [E / Right-Click] */}
              <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-sky-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>戰術技能變種（按 [E] 或滑鼠右鍵施放）</span>
                  </span>
                  <span className="text-xs text-slate-400">冷卻制主動技</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {tacticalList.map((sk) => {
                    const active = loadout.tacticalId === sk.id;
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => setLoadout((prev) => ({ ...prev, tacticalId: sk.id }))}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#1A273D] border-sky-400 shadow-md shadow-sky-500/15'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{sk.name}</span>
                            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-xs font-bold text-sky-300">
                              {sk.shortTag}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-mono-num font-bold text-slate-200">
                              CD {sk.cooldownSec} 秒
                            </span>
                          </div>
                          {active && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-sky-500/20 text-sky-200 text-xs font-bold">
                              <Check className="w-3.5 h-3.5" />
                              已裝備
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-slate-200 leading-relaxed">{sk.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Ultimate [F / Charge] */}
              <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <Flame className="w-4 h-4" />
                    <span>終極大招變種（按 [F] 或近戰滿氣釋放）</span>
                  </span>
                  <span className="text-xs text-slate-400">需集滿 100% 氣力</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {ultimateList.map((sk) => {
                    const active = loadout.ultimateId === sk.id;
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => setLoadout((prev) => ({ ...prev, ultimateId: sk.id }))}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#1A273D] border-amber-400 shadow-md shadow-amber-500/15'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{sk.name}</span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-xs font-bold text-amber-300">
                              {sk.shortTag}
                            </span>
                          </div>
                          {active && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-xs font-bold">
                              <Check className="w-3.5 h-3.5" />
                              已裝備
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-slate-200 leading-relaxed">{sk.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Passive */}
              <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-emerald-300">陣營被動天賦（全場常駐生效）</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {passiveList.map((sk) => {
                    const active = loadout.passiveId === sk.id;
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => setLoadout((prev) => ({ ...prev, passiveId: sk.id }))}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#1A273D] border-emerald-400 shadow-md shadow-emerald-500/15'
                            : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{sk.name}</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-xs font-bold text-emerald-300">
                              {sk.shortTag}
                            </span>
                          </div>
                          {active && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-xs font-bold">
                              <Check className="w-3.5 h-3.5" />
                              已裝備
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-slate-200 leading-relaxed">{sk.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* RIGHT: Current Loadout Summary + Match Settings + Map + Launch CTA */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 flex flex-col gap-4 bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5">
          {/* Selected Loadout Overview */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center gap-3 pb-2.5 border-b border-slate-800">
              <CharacterAvatarSvg skin={selectedChar} className="w-11 h-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-white truncate">
                  {facInfo.name} · {selectedChar.name.replace('（預設）', '')}
                </div>
                <div className="text-xs text-amber-300 font-semibold">
                  {activePreset?.roleBadge} · {activePreset?.laneHint}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('gear')}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-left cursor-pointer"
              >
                <span className="text-slate-400">主／副武器</span>
                <span className="font-bold text-slate-100">
                  {selectedGun.name} + {selectedMelee.name}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('skills')}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-left cursor-pointer"
              >
                <span className="text-sky-300 font-semibold">[E/右鍵] 戰術技</span>
                <span className="font-bold text-white">
                  {selectedTactical.name} ({selectedTactical.cooldownSec}s)
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('skills')}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-left cursor-pointer"
              >
                <span className="text-amber-300 font-semibold">[F/滿氣] 終極大招</span>
                <span className="font-bold text-white">{selectedUltimate.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('skills')}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-left cursor-pointer"
              >
                <span className="text-emerald-300 font-semibold">常駐被動</span>
                <span className="font-bold text-white">{selectedPassive.name}</span>
              </button>
            </div>
          </div>

          {/* Match Settings */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-200">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>對戰時長</span>
              </div>
              <div className="flex items-center gap-1.5">
                {SIEGE_DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => setDurationSec(opt.sec)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                      durationSec === opt.sec
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {opt.sec / 60} 分鐘
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="siege-ai-diff" className="text-xs sm:text-sm font-bold text-slate-200">
                電腦難度（5v5 AI 補齊）
              </label>
              <select
                id="siege-ai-diff"
                value={aiDifficulty}
                onChange={(e) => onDifficultyChange(e.target.value as AiDifficulty)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs sm:text-sm text-slate-100"
              >
                {Object.entries(AI_DIFFICULTY).map(([value, setting]) => (
                  <option key={value} value={value}>
                    {setting.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Map Preview */}
          <div className="relative h-48 sm:h-52 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
            <MiniMapPreview mapId={SIEGE_MAP_ID} className="w-full h-full border-0 rounded-none" />
            <div className="pointer-events-none absolute top-2 left-2 bg-slate-950/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-200">
              光暈裂谷 54×54 · 三路推塔
            </div>
          </div>

          {/* Rule Summary */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 text-xs text-slate-300 space-y-1.5 leading-relaxed">
            <div className="font-bold text-amber-300">模式規則摘要</div>
            <p>• 無限生命復活，摧毀敵方「外塔 → 高地塔 → 主城堡」即獲得勝利。</p>
            <p>• 取消地上執槍；脫戰自動補彈，按 [B] 回泉水或復活時按 [3-6] 用軍功升級屬性。</p>
            <p>• 第三勢力駐守 4 處野區與河道雙 Boss：3:00「幻沙先鋒」與 8:00「狂戰巨神」。</p>
          </div>

          {/* Launch Button */}
          <button
            type="button"
            onClick={() => onStartSiege(faction, selectedChar, loadout, durationSec)}
            className="w-full flex items-center justify-center gap-2 px-7 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-base rounded-xl shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>進入三路攻防戰</span>
          </button>
        </div>
      </main>
    </div>
  );
};
