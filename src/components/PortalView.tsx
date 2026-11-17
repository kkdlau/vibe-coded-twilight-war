import React, { useState } from 'react';
import { HelpCircle, MapPin, Shield, Trophy, X } from 'lucide-react';
import {
  FACTIONS,
  FACTION_CHARACTERS,
  GUNS,
  MAP_CATALOG,
  MELEES,
  getReputationQiMultiplier,
  getWeaponSwapDuration,
} from '../game/data';
import { FactionId, MapId, RunRecord } from '../game/types';
import { MiniMapPreview } from './MiniMapPreview';
import { CharacterAvatarSvg, FactionLogoSvg, WeaponIconSvg } from './WeaponArt';

interface PortalViewProps {
  records: RunRecord[];
  reputations: Record<FactionId, number>;
  onSelectFaction: (faction: FactionId, preselectedMapId?: MapId) => void;
  onClearRecords: () => void;
}

type HelpTab = 'terrain' | 'maps' | 'weapons' | 'characters' | 'gameplay';

const HELP_TABS: { id: HelpTab; label: string }[] = [
  { id: 'terrain', label: '地形物件' },
  { id: 'maps', label: '地圖' },
  { id: 'weapons', label: '武器' },
  { id: 'characters', label: '角色' },
  { id: 'gameplay', label: '玩法' },
];

const TERRAIN_GUIDE = [
  {
    name: '碎石砂地地板紋理',
    elev: '0.0 格',
    desc: '無格線棋盤感的一致微粒地磚，全角色暢通移動；平地與高台銜接處皆以此紋理為基準。',
    swatch: 'bg-[#A98456] border-[#785B38]',
  },
  {
    name: '河道與泥岸',
    elev: '水阻（不可跨）',
    desc: '一格一格鋪設的青藍水域與有機泥岸邊緣，角色不可涉水跨越，必須繞行木橋或石橋搶渡。',
    swatch: 'bg-[#467794] border-[#5E4029]',
  },
  {
    name: '小箱子／有階梯的小箱子',
    elev: '1.0 格／0.5 格木梯',
    desc: '1×1 橡木小箱提供掩體；搭配 1×1 深色木條階梯可從平地攀上 1.0 格高處或再銜接高箱。',
    swatch: 'bg-[#C48236] border-[#71451B]',
  },
  {
    name: '大箱子（斜撐木箱）',
    elev: '1.5 格',
    desc: '需先站上 1.0 格高台或箱體才可跨上頂端；由平地射向 1.5 格大箱時，子彈會深入外緣約 0.5 格，站太外側仍會中彈。',
    swatch: 'bg-[#B7772C] border-[#593616]',
  },
  {
    name: '高台石階與木板斜台',
    elev: '1.0 / 2.0 / 3.0 格',
    desc: '切石高台與傾斜木板平台；站在高地對低處射擊可享 +15% 傷害與開闊視線，高差 ≥ 2.0 格時子彈於外緣即止。',
    swatch: 'bg-[#948874] border-[#4A4337]',
  },
  {
    name: '土丘平台',
    elev: '1.0 / 2.0 格',
    desc: '帶立體泥岩斜坡的野外高地，僅保留開口階梯進出，適合卡位防守或狙擊伏擊。',
    swatch: 'bg-[#7A593C] border-[#4E3622]',
  },
  {
    name: '樹木（樹幹與葉冠）',
    elev: '樹幹實心遮蔽',
    desc: '樹幹阻擋移動與直線子彈；濃密葉冠為高 z-index 圖層可遮蔽身形，玩家靠近時葉冠自動轉為半透明。',
    swatch: 'bg-[#2E7D32] border-[#1B5E20]',
  },
  {
    name: '石牆（1×N／2×2）與房屋',
    elev: '2.0–3.0 格',
    desc: '米褐與青苔磚砌實牆以及斜頂磚石房屋（兩側藍窗）；高度差 ≥ 2.0 格，所有子彈碰外緣立即阻斷。',
    swatch: 'bg-[#5A5346] border-[#2C2822]',
  },
  {
    name: '竹林實牆（每格 3 株翠竹）',
    elev: '3.0 格（阻擋視線）',
    desc: '一格內生長三株翠綠竹柱的實牆掩體，視同牆壁阻擋移動、子彈與敵人視野，適合竹林繞後伏擊。',
    swatch: 'bg-[#166534] border-[#4ADE80]',
  },
  {
    name: '鐵道路軌與火車車廂',
    elev: '0.0 路軌 / 2.0 車廂',
    desc: '道碴枕木鋼軌供高速穿行，靜止火車車廂高 2.0 格（邊緣直接擋彈），可沿西側階梯貨箱鏈登頂奪取制高點。',
    swatch: 'bg-[#7F1D1D] border-[#94A3B8]',
  },
  {
    name: '戰術防彈盾（地面近戰拾取）',
    elev: '100 耐久（手持）',
    desc: '於地面拾取並裝備於當前手上。手持面向前方才可擋住正面子彈或近戰減半，左鍵推動震退敵人，丟棄或轉手皆保留剩餘耐久。',
    swatch: 'bg-[#1E293B] border-[#38BDF8]',
  },
];

export const PortalView: React.FC<PortalViewProps> = ({
  records,
  reputations,
  onSelectFaction,
  onClearRecords,
}) => {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>('terrain');

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#090D16] text-slate-100 select-none">
      {/* Subtle tactical backdrop radial + triangular connection geometry */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(30, 41, 59, 0.45) 0%, rgba(9, 13, 22, 0.96) 72%)',
        }}
      />
      <svg
        viewBox="0 0 1000 700"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
      >
        <line x1="160" y1="130" x2="840" y2="130" stroke="#64748B" strokeWidth="1.5" strokeDasharray="6 8" />
        <line x1="160" y1="130" x2="500" y2="575" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="6 8" />
        <line x1="840" y1="130" x2="500" y2="575" stroke="#A21CAF" strokeWidth="1.5" strokeDasharray="6 8" />
      </svg>

      {/* Center Minimal Title */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center -translate-y-6">
        <div className="text-[11px] tracking-[0.35em] text-amber-400/90 uppercase font-semibold mb-2">
          TWILIGHT WARS
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)] font-display">
          光暈戰記
        </h1>
        <p className="mt-3 text-xs sm:text-sm text-slate-400">
          點擊任一陣營徽章進入整備室出戰
        </p>
      </div>

      {/* TOP-LEFT: Royal Crest Logo */}
      <button
        onClick={() => onSelectFaction('royal')}
        className="group absolute top-6 left-6 sm:top-10 sm:left-12 md:top-12 md:left-20 flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-900/90 hover:border-sky-400/80 transition-all cursor-pointer shadow-2xl"
      >
        <FactionLogoSvg
          faction="royal"
          className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 drop-shadow-[0_6px_16px_rgba(56,189,248,0.28)] group-hover:scale-105 transition-transform"
        />
        <div className="text-center">
          <div className="text-base sm:text-lg font-extrabold text-white tracking-wide">皇家騎士團</div>
          <div className="mt-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-sky-400/35 flex items-baseline justify-center gap-2 font-mono-num">
            <span className="text-[11px] font-sans text-slate-300">聲望</span>
            <strong className="text-base sm:text-lg font-black text-sky-300 leading-none">{reputations.royal}</strong>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-bold text-amber-300">{getReputationQiMultiplier(reputations.royal).toFixed(2)}×</span>
          </div>
        </div>
      </button>

      {/* TOP-RIGHT: Shadow Crest Logo */}
      <button
        onClick={() => onSelectFaction('shadow')}
        className="group absolute top-6 right-6 sm:top-10 sm:right-12 md:top-12 md:right-20 flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-900/90 hover:border-fuchsia-500/80 transition-all cursor-pointer shadow-2xl"
      >
        <FactionLogoSvg
          faction="shadow"
          className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 drop-shadow-[0_6px_16px_rgba(162,28,175,0.35)] group-hover:scale-105 transition-transform"
        />
        <div className="text-center">
          <div className="text-base sm:text-lg font-extrabold tracking-wide" style={{ color: '#C026D3' }}>
            天影十字軍
          </div>
          <div className="mt-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-fuchsia-500/35 flex items-baseline justify-center gap-2 font-mono-num">
            <span className="text-[11px] font-sans text-slate-300">聲望</span>
            <strong className="text-base sm:text-lg font-black leading-none" style={{ color: '#E879F9' }}>
              {reputations.shadow}
            </strong>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-bold text-amber-300">{getReputationQiMultiplier(reputations.shadow).toFixed(2)}×</span>
          </div>
        </div>
      </button>

      {/* BOTTOM-CENTER: Third Faction Crest Logo */}
      <button
        onClick={() => onSelectFaction('mercenary')}
        className="group absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-900/90 hover:border-amber-400/80 transition-all cursor-pointer shadow-2xl"
      >
        <FactionLogoSvg
          faction="mercenary"
          className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 drop-shadow-[0_6px_16px_rgba(245,158,11,0.28)] group-hover:scale-105 transition-transform"
        />
        <div className="text-center">
          <div className="text-base sm:text-lg font-extrabold text-amber-400 tracking-wide whitespace-nowrap">
            第三勢力（傭兵團）
          </div>
          <div className="mt-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-amber-400/35 flex items-baseline justify-center gap-2 font-mono-num">
            <span className="text-[11px] font-sans text-slate-300">聲望</span>
            <strong className="text-base sm:text-lg font-black text-amber-300 leading-none">{reputations.mercenary}</strong>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-bold text-sky-300">{getReputationQiMultiplier(reputations.mercenary).toFixed(2)}×</span>
          </div>
        </div>
      </button>

      {/* BOTTOM-RIGHT: Help Consultation Button */}
      <button
        onClick={() => setHelpOpen(true)}
        className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-400/80 text-sm font-bold text-slate-100 shadow-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
      >
        <HelpCircle className="w-4 h-4 text-amber-400" />
        <span>Help</span>
      </button>

      {/* 5-TAB HELP MODAL */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 bg-black/78 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[88vh] bg-[#0F1624] border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header + Tabs */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <h2 className="text-lg font-bold text-white">戰場百科 · Help 諮詢</h2>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {HELP_TABS.map((t) => {
                  const active = helpTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setHelpTab(t.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setHelpOpen(false)}
                  aria-label="關閉視窗"
                  className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {helpTab === 'terrain' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {TERRAIN_GUIDE.map((item) => (
                    <div
                      key={item.name}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5"
                    >
                      <div className={`w-11 h-11 rounded-lg border-2 shrink-0 ${item.swatch}`} />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white">{item.name}</span>
                          <span className="text-[11px] font-mono-num text-amber-300">{item.elev}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {helpTab === 'maps' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {MAP_CATALOG.map((m) => (
                    <div
                      key={m.id}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                    >
                      <div>
                        <MiniMapPreview mapId={m.id} className="mb-3 h-60 w-full" />
                        <div className="text-xs text-amber-400 font-medium mb-1">
                          {m.environment} · {m.region} · {m.era}
                        </div>
                        <h3 className="text-base font-bold text-white flex items-center gap-1.5 mb-1.5">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{m.name}</span>
                        </h3>
                        <p className="text-xs text-slate-300 leading-relaxed mb-3">{m.description}</p>
                      </div>
                      <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-400 truncate">{m.highlight}</span>
                        <button
                          onClick={() => {
                            setHelpOpen(false);
                            onSelectFaction('royal', m.id);
                          }}
                          className="text-sky-400 hover:text-sky-300 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          選圖出戰
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {helpTab === 'weapons' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-amber-400 mb-3">遠程槍械數值一覽</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {GUNS.map((g) => (
                        <div
                          key={g.id}
                          className="bg-slate-900/85 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5"
                        >
                          <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                            <WeaponIconSvg kind={g.kind} color={g.color} className="w-12 h-12" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white mb-1">{g.name}</div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono-num text-slate-300 mb-1.5">
                              <span>
                                傷害：<strong className="text-amber-300">{g.damage}</strong>
                                {g.pellets > 1 ? `×${g.pellets}` : ''}
                              </span>
                              <span>
                                彈匣：<strong className="text-white">{g.magSize} 發</strong>
                              </span>
                              <span>
                                射速：<strong className="text-sky-300">{g.fireRate.toFixed(1)} /s</strong>
                              </span>
                              <span>
                                裝彈：<strong className="text-slate-200">{g.reloadTime.toFixed(2)}s</strong>
                              </span>
                              <span>
                                移速：<strong className="text-emerald-300">{Math.round(g.moveSpeedMult * 100)}%</strong>
                              </span>
                              <span>
                                切槍：<strong className="text-slate-200">{getWeaponSwapDuration(g.kind).toFixed(2)}s</strong>
                              </span>
                              <span className="col-span-2 text-slate-400">
                                準心半徑：{g.baseCrosshair}px → {g.maxCrosshair}px
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-snug">{g.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-sky-400 mb-3">近戰武器數值一覽（長按左鍵集氣至 0 釋放陣營技能）</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {MELEES.map((m) => (
                        <div
                          key={m.id}
                          className="bg-slate-900/85 border border-slate-800 rounded-xl p-4 flex items-start gap-3"
                        >
                          <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                            <WeaponIconSvg kind={m.kind} color={m.color} className="w-12 h-12" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white mb-1">{m.name}</div>
                            <div className="space-y-0.5 text-[11px] font-mono-num text-slate-300">
                              <div>
                                傷害：<strong className="text-amber-300">{m.damage}</strong>
                              </div>
                              <div>
                                攻速：<strong className="text-sky-300">{m.swingRate.toFixed(1)} 次/s</strong>
                              </div>
                              <div>
                                距離：<strong className="text-white">{m.reach}px</strong> · 弧度 {Math.round((m.arc * 180) / Math.PI)}°
                              </div>
                              <div>
                                移速：<strong className="text-emerald-300">{Math.round(m.moveSpeedMult * 100)}%</strong> · 切武{' '}
                                {getWeaponSwapDuration(m.kind).toFixed(2)}s
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {helpTab === 'characters' && (
                <div className="space-y-6">
                  {(['royal', 'shadow', 'mercenary'] as FactionId[]).map((fid) => {
                    const fac = FACTIONS[fid];
                    const skins = FACTION_CHARACTERS[fid];
                    return (
                      <div key={fid} className="bg-slate-900/75 border border-slate-800 rounded-xl p-4 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-3">
                            <FactionLogoSvg faction={fid} className="w-10 h-10 shrink-0" />
                            <div>
                              <h3
                                className={`text-base font-bold ${fid === 'shadow' ? '' : fac.color}`}
                                style={fid === 'shadow' ? { color: '#C026D3' } : undefined}
                              >
                                {fac.name}
                              </h3>
                              <p className="text-xs text-slate-400">{fac.bonusDesc}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setHelpOpen(false);
                              onSelectFaction(fid);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            進入整備室
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                            <span className="text-slate-400">小刀技 · </span>
                            <strong className="text-white">{fac.meleeSkills.knife.name}</strong>
                            <p className="text-slate-400 mt-1 leading-snug">{fac.meleeSkills.knife.desc}</p>
                          </div>
                          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                            <span className="text-slate-400">鐵爪技 · </span>
                            <strong className="text-white">{fac.meleeSkills.claw.name}</strong>
                            <p className="text-slate-400 mt-1 leading-snug">{fac.meleeSkills.claw.desc}</p>
                          </div>
                          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                            <span className="text-slate-400">大刀技 · </span>
                            <strong className="text-white">{fac.meleeSkills.greatsword.name}</strong>
                            <p className="text-slate-400 mt-1 leading-snug">{fac.meleeSkills.greatsword.desc}</p>
                          </div>
                          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                            <span className="text-slate-400">盾牌技 · </span>
                            <strong className="text-sky-300">{fac.meleeSkills.shield.name}</strong>
                            <p className="text-slate-400 mt-1 leading-snug">{fac.meleeSkills.shield.desc}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          {skins.map((sk) => (
                            <div
                              key={sk.id}
                              className="bg-slate-950/75 border border-slate-800 rounded-lg p-2.5 flex flex-col items-center text-center"
                            >
                              <CharacterAvatarSvg skin={sk} className="w-12 h-12 mb-1.5" />
                              <div className="text-xs font-bold text-white">{sk.name}</div>
                              <div className="text-[11px] text-amber-300/90 mb-1">{sk.roleTitle}</div>
                              <p className="text-[11px] text-slate-400 leading-tight">{sk.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {helpTab === 'gameplay' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <div className="text-sm font-bold text-white">基礎操作與換武器機制</div>
                      <p className="text-slate-300">
                        • <strong>WASD / 方向鍵</strong>：移動；滑鼠左鍵射擊或揮砍；<strong>R</strong> 鍵或空彈匣再點一次左鍵裝彈（打空不會自動裝彈）。
                      </p>
                      <p className="text-slate-300">
                        • <strong>1 / 2 / Q</strong>：切換第一手與第二手（切換時觸發搓手動作，重武器更慢；攻擊後 0.34s 內按 Q 取消硬直並觸發連攜增傷）。
                      </p>
                      <p className="text-slate-300">
                        • <strong>Esc</strong>：放下當前非預設武器並換回小槍/小刀；<strong>Space</strong>：拾取彈藥箱，或以地面武器替換當前手持武器；<strong>Tab</strong>：查看戰況進展；<strong>P</strong>：暫停。
                      </p>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <div className="text-sm font-bold text-sky-400 flex items-center gap-1.5">
                        <Shield className="w-4 h-4" />
                        <span>手持戰術防彈盾（100 耐久）</span>
                      </div>
                      <p className="text-slate-300">
                        • <strong>手持與正面格擋</strong>：於地圖拾取後裝備在當前手上，僅有目前持盾且朝向攻擊來源的<strong>正面扇形</strong>才能擋下子彈與減半近戰傷害，側面與背面無法格擋。
                      </p>
                      <p className="text-slate-300">
                        • <strong>左鍵推擊與耐久繼承</strong>：左鍵揮盾可強力推開並短暫震暈敵人；按 Esc 放下或陣亡掉落時會完整保留剩餘耐久度，耐力歸零即碎裂並換回小刀。
                      </p>
                      <p className="text-slate-300">
                        • <strong>集氣修復與技能監控</strong>：持盾長按左鍵集氣至 0 發動「護盾修復」，可震退周圍敵軍並將手中盾牌耐久補滿至 100；時效性技能狀態會顯示於左上血條旁矩陣。
                      </p>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <div className="text-sm font-bold text-amber-400">彈道貫穿、死亡掉落與 AI 生態</div>
                      <p className="text-slate-300">
                        • 射向 1.5 格高大箱子時，子彈會穿透至外緣內 0.5 格處（站太靠箱緣仍會受傷）；≥ 2.0 格石牆/貨櫃則於邊緣即止。
                      </p>
                      <p className="text-slate-300">
                        • 玩家死亡會將身上的非預設武器掉回地面，復活後重置為制式小槍與戰術小刀（三命制）。
                      </p>
                      <p className="text-slate-300">
                        • 皇家 5 發黃色光彈可穿透敵人但會誤傷友軍；天影黑龍波為深紫藍長龍，龍頭傷 20、龍身傷 15、碰牆反彈且絕不傷隊友。
                      </p>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <div className="text-sm font-bold text-emerald-400">三方 10 兵編制與獨立聲望</div>
                      <p className="text-slate-300">
                        • 皇家、天影、第三勢力各 10 名士兵（場上同陣營最多 2 人），所有士兵均 100 血並從陣營角色池選取外觀與名稱。
                      </p>
                      <p className="text-slate-300">
                        • 皇家擊殺天影：皇家 +1、天影 -1（天影殺皇家亦同）；擊殺第三勢力只加己方聲望不扣第三聲望；第三勢力擊殺皇家/天影會扣該陣營聲望。
                      </p>
                    </div>
                  </div>

                  {/* Hall of Fame Records Table */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span>本地戰績殿堂</span>
                      </div>
                      {records.length > 0 && (
                        <button
                          onClick={onClearRecords}
                          className="px-2.5 py-1 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-md cursor-pointer"
                        >
                          清除紀錄
                        </button>
                      )}
                    </div>
                    {records.length === 0 ? (
                      <div className="text-xs text-slate-400 py-3 text-center">
                        尚無結算紀錄，選擇任一陣營進入戰場完成對戰後將自動保存。
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-800 text-slate-400">
                            <tr>
                              <th className="py-2 px-3">陣營</th>
                              <th className="py-2 px-3">角色</th>
                              <th className="py-2 px-3">地圖</th>
                              <th className="py-2 px-3">傷害</th>
                              <th className="py-2 px-3">擊殺</th>
                              <th className="py-2 px-3">積分</th>
                              <th className="py-2 px-3">結果</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70 font-mono-num">
                            {records.map((r) => (
                              <tr key={r.id}>
                                <td
                                  className={`py-2 px-3 font-sans font-semibold ${
                                    r.faction === 'shadow' ? '' : FACTIONS[r.faction]?.color || 'text-slate-300'
                                  }`}
                                  style={r.faction === 'shadow' ? { color: '#C026D3' } : undefined}
                                >
                                  {FACTIONS[r.faction]?.name || r.faction}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-200">{r.characterName || '預設'}</td>
                                <td className="py-2 px-3 font-sans text-slate-300">{r.mapName}</td>
                                <td className="py-2 px-3 text-amber-400 font-bold">{r.totalDamage}</td>
                                <td className="py-2 px-3 text-slate-200">{r.kills}</td>
                                <td className="py-2 px-3 text-white font-bold">{r.score}</td>
                                <td className="py-2 px-3 font-sans">
                                  <span className={r.victory ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                                    {r.victory ? '勝利' : '戰敗'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
