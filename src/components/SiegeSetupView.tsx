import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
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
  getDefaultSiegeLoadout,
  getPassiveMeta,
  getSiegeHeroPreset,
  getTacticalMeta,
  getUltimateMeta,
} from '../game/siegeData';
import { getSiegeGunProfile } from '../game/siegeHelpers';
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

function formatMeleeSummary(m: MeleeDef): string {
  if (m.kind === 'shield') {
    return `正面格擋 · 耐久 100 · 震退破陣 · 移動 ${Math.round(m.moveSpeedMult * 100)}%`;
  }
  return `傷害 ${m.damage} · 攻速 ${m.swingRate}/s · 距離 ${m.reach}px · 移動 ${Math.round(m.moveSpeedMult * 100)}%`;
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
  const [durationSec, setDurationSec] = useState<SiegeMatchDurationSec>(1080);

  const characters = FACTION_CHARACTERS[faction];
  const selectedChar = characters.find((c) => c.id === selectedCharId) || characters[0];
  const facInfo = FACTIONS[faction];

  const activePreset = useMemo(
    () => getSiegeHeroPreset(faction, selectedChar.id),
    [faction, selectedChar.id]
  );
  const bundledLoadout = useMemo(
    () => getDefaultSiegeLoadout(faction, selectedChar.id),
    [faction, selectedChar.id]
  );

  const bundledGun = GUNS.find((g) => g.id === bundledLoadout.gunId) || GUNS[0];
  const bundledGunProfile = getSiegeGunProfile(bundledGun.kind);
  const bundledMelee = MELEES.find((m) => m.id === bundledLoadout.meleeId) || MELEES[0];
  const bundledTactical = getTacticalMeta(bundledLoadout.tacticalId);
  const bundledUltimate = getUltimateMeta(bundledLoadout.ultimateId);
  const bundledPassive = getPassiveMeta(bundledLoadout.passiveId);

  const handleFactionSwitch = (nextFac: SiegeFactionId) => {
    if (nextFac === faction) return;
    setFaction(nextFac);
    const firstSkin = FACTION_CHARACTERS[nextFac][0];
    setSelectedCharId(firstSkin.id);
  };

  const effGunDmg = Math.round(bundledGun.damage * bundledGunProfile.damageMult);

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
              三路城堡攻防戰（塔防 MOBA · 5v5 專屬英雄）
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(['royal', 'shadow'] as SiegeFactionId[]).map((fac) => {
              const active = faction === fac;
              return (
                <button
                  key={fac}
                  type="button"
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

      {/* Single-Page Unified 2-Column Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5 cols): 5 Bundled Hero Roster + Match Settings + Map + Start */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-white">選擇專屬英雄</h2>
              <span className="text-xs text-slate-400">每位英雄自帶獨特武裝與技能組合</span>
            </div>

            <div className="flex flex-col gap-2">
              {characters.map((ch) => {
                const active = ch.id === selectedChar.id;
                const preset = getSiegeHeroPreset(faction, ch.id);
                const heroGun = GUNS.find((g) => g.id === preset.loadout.gunId) || GUNS[0];
                const heroMelee = MELEES.find((m) => m.id === preset.loadout.meleeId) || MELEES[0];
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedCharId(ch.id)}
                    className={`w-full p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      active
                        ? 'bg-[#1A273D] border-amber-400 shadow-lg shadow-amber-500/15'
                        : 'bg-slate-950/75 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <CharacterAvatarSvg skin={ch} className="w-11 h-11 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          {ch.name.replace('（預設）', '')}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-[11px] font-bold text-sky-300 shrink-0">
                          {preset.roleBadge}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">{preset.laneHint}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2 py-1">
                      <WeaponIconSvg kind={heroGun.kind} className="w-6 h-6" />
                      <WeaponIconSvg kind={heroMelee.kind} className="w-6 h-6" />
                      {active && <Check className="w-4 h-4 text-amber-400 ml-0.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Compact Match Settings + Map + Launch CTA */}
          <section className="bg-[#121926] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
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

            <div className="relative h-40 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <MiniMapPreview mapId={SIEGE_MAP_ID} className="w-full h-full border-0 rounded-none" />
              <div className="pointer-events-none absolute top-2 left-2 bg-slate-950/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-200">
                光暈裂谷 54×54 · 三路推塔
              </div>
            </div>

            <button
              type="button"
              onClick={() => onStartSiege(faction, selectedChar, bundledLoadout, durationSec)}
              className="w-full flex items-center justify-center gap-2 px-7 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-base rounded-xl shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>進入三路攻防戰</span>
            </button>
          </section>
        </div>

        {/* RIGHT COLUMN (7 cols): Complete Bundled Hero Showcase on One Page */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Hero Header Showcase */}
          <section className="bg-[#121926] border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-700/80 flex items-center justify-center shrink-0">
              <CharacterAvatarSvg skin={selectedChar} className="w-14 h-14" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-white">
                  {selectedChar.name.replace('（預設）', '')}
                </h1>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-xs font-bold text-amber-300">
                  {activePreset.roleBadge}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-semibold text-sky-300">
                  {facInfo.name} · {activePreset.laneHint}
                </span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">{activePreset.tagline}</p>
            </div>
          </section>

          {/* Bundled Weapons Showcase */}
          <section className="bg-[#121926] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <Swords className="w-4 h-4" />
                <span>專屬武裝組合（按 [Q] 切換 · 脫戰緩速補彈／擊殺補彈）</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Bundled Primary Gun */}
              <div className="rounded-xl bg-slate-950/85 border border-slate-700/80 p-4 flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl bg-slate-900 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <WeaponIconSvg kind={bundledGun.kind} color={bundledGun.color} className="w-11 h-11" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-amber-300">主武器</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-sky-300">
                      {bundledGunProfile.roleTag}
                    </span>
                  </div>
                  <div className="text-base font-extrabold text-white mt-0.5">{bundledGun.name}</div>
                  <div className="text-xs text-slate-300 mt-1 leading-snug">
                    {bundledGun.kind === 'shotgun'
                      ? `單丸 ${effGunDmg}×${bundledGun.pellets} · 破甲 ${Math.round(bundledGunProfile.defensePenetration * 100)}% · 彈匣 ${bundledGun.magSize}`
                      : bundledGunProfile.defensePenetration > 0
                        ? `傷害 ${effGunDmg} · 破甲 ${Math.round(bundledGunProfile.defensePenetration * 100)}% · 彈匣 ${bundledGun.magSize} 發`
                        : `傷害 ${effGunDmg} · 彈匣 ${bundledGun.magSize} 發 · 射速 ${(bundledGun.fireRate * bundledGunProfile.fireRateMult).toFixed(1)}/s`}
                  </div>
                </div>
              </div>

              {/* Bundled Secondary Melee */}
              <div className="rounded-xl bg-slate-950/85 border border-slate-700/80 p-4 flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl bg-slate-900 border border-sky-500/40 flex items-center justify-center shrink-0">
                  <WeaponIconSvg kind={bundledMelee.kind} color={bundledMelee.color} className="w-11 h-11" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Swords className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="text-xs font-bold text-sky-300">近戰兵器 / 戰術盾</span>
                  </div>
                  <div className="text-base font-extrabold text-white mt-0.5">{bundledMelee.name}</div>
                  <div className="text-xs text-slate-300 mt-1 leading-snug">{formatMeleeSummary(bundledMelee)}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Bundled Skills & Passive Showcase */}
          <section className="bg-[#121926] border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-sky-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>專屬技能變種與天賦</span>
            </h2>

            <div className="grid grid-cols-1 gap-3">
              {/* Tactical */}
              <div className="rounded-xl bg-slate-950/85 border border-sky-500/40 p-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold">
                      戰術技 · Lv.2 解鎖
                    </span>
                    <span className="text-base font-extrabold text-white">{bundledTactical.name}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-semibold text-sky-200">
                      {bundledTactical.shortTag}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono-num font-bold text-slate-200">
                    按 [E] / 右鍵 · CD {bundledTactical.cooldownSec}s
                  </span>
                </div>
                <p className="text-[13px] text-slate-200 leading-relaxed">{bundledTactical.desc}</p>
              </div>

              {/* Ultimate */}
              <div className="rounded-xl bg-slate-950/85 border border-amber-500/40 p-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold inline-flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      終極大招 · Lv.4 解鎖
                    </span>
                    <span className="text-base font-extrabold text-white">{bundledUltimate.name}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-semibold text-amber-200">
                      {bundledUltimate.shortTag}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs font-semibold text-amber-200">
                    切近戰滿氣長按左鍵 · 升 3 階覺醒
                  </span>
                </div>
                <p className="text-[13px] text-slate-200 leading-relaxed">{bundledUltimate.desc}</p>
              </div>

              {/* Passive */}
              <div className="rounded-xl bg-slate-950/85 border border-emerald-500/40 p-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                      常駐被動天賦
                    </span>
                    <span className="text-base font-extrabold text-white">{bundledPassive.name}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-semibold text-emerald-200">
                      {bundledPassive.shortTag}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-slate-200 leading-relaxed">{bundledPassive.desc}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-4 py-3 text-xs text-slate-300 flex flex-wrap gap-x-5 gap-y-1 leading-relaxed">
              <span>• 升級加最大血量 (+22)、防禦減傷與跑速</span>
              <span>• 泉水／復活按 [3-6] 升 5 階軍功裝備與技能</span>
              <span>• 彈藥回復放慢，善用近戰搶攻與切武節奏取勝！</span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
