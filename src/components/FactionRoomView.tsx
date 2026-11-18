import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, MapPin, Play, Shuffle, Swords } from 'lucide-react';
import { BIOME_OPTIONS, CustomMapData } from '../game/customMaps';
import { FACTIONS, FACTION_CHARACTERS, MAP_CATALOG, getReputationQiMultiplier } from '../game/data';
import { CharacterSkin, FactionId, MeleeKind } from '../game/types';
import { MiniMapPreview } from './MiniMapPreview';
import { CharacterAvatarSvg, FactionLogoSvg, WeaponIconSvg } from './WeaponArt';

interface FactionRoomViewProps {
  faction: FactionId;
  initialMapChoice: string;
  customMaps: CustomMapData[];
  reputations: Record<FactionId, number>;
  onBackToLobby: () => void;
  onStartBattle: (faction: FactionId, character: CharacterSkin, mapId: string, mapChoice: string) => void;
}

const MELEE_KEYS: { kind: MeleeKind; label: string }[] = [
  { kind: 'knife', label: '戰術小刀' },
  { kind: 'claw', label: '疾風鐵爪' },
  { kind: 'greatsword', label: '重型大刀' },
  { kind: 'shield', label: '戰術防彈盾' },
];

function pickRandomMapId(): string {
  return MAP_CATALOG[Math.floor(Math.random() * MAP_CATALOG.length)].id;
}

export const FactionRoomView: React.FC<FactionRoomViewProps> = ({
  faction,
  initialMapChoice,
  customMaps,
  reputations,
  onBackToLobby,
  onStartBattle,
}) => {
  const facInfo = FACTIONS[faction];
  const characters = FACTION_CHARACTERS[faction];
  const facRep = reputations[faction];
  const qiMult = getReputationQiMultiplier(facRep);

  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0].id);
  const [selectedMapChoice, setSelectedMapChoice] = useState<string>(initialMapChoice);

  const selectedChar = characters.find((c) => c.id === selectedCharId) || characters[0];
  const selectedCustomMap = useMemo(
    () => (selectedMapChoice === 'random' ? undefined : customMaps.find((m) => m.id === selectedMapChoice)),
    [selectedMapChoice, customMaps]
  );
  const selectedMapMeta = useMemo(
    () =>
      selectedMapChoice === 'random' || selectedCustomMap
        ? null
        : MAP_CATALOG.find((m) => m.id === selectedMapChoice) || MAP_CATALOG[0],
    [selectedMapChoice, selectedCustomMap]
  );

  const handleLaunchBattle = () => {
    const targetMapId = selectedMapChoice === 'random' ? pickRandomMapId() : selectedMapChoice;
    onStartBattle(faction, selectedChar, targetMapId, selectedMapChoice);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0F17] text-slate-100 select-none">
      {/* Compact 1-row Top Bar with Prominent Reputation */}
      <header className="shrink-0 bg-[#0B0F17]/95 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-6">
          <button
            onClick={onBackToLobby}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            返回遊戲大廳
          </button>

          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <FactionLogoSvg faction={faction} className="w-7 h-7 shrink-0" />
            <span
              className={`text-base font-extrabold tracking-tight ${faction === 'shadow' ? '' : facInfo.color}`}
              style={faction === 'shadow' ? { color: '#C026D3' } : undefined}
            >
              {facInfo.name}
            </span>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span className="text-xs text-slate-400 hidden sm:inline">{facInfo.subtitle}</span>
          </div>

          <div className="flex items-center gap-4 font-mono-num whitespace-nowrap shrink-0 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-400 font-sans">目前陣營聲望</span>
              <span className="text-lg font-black text-amber-400 leading-none">{facRep}</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-400 font-sans">集/回氣倍數</span>
              <span className="text-base font-black text-sky-400 leading-none">{qiMult.toFixed(2)}×</span>
            </div>
            <span className="text-slate-700 hidden md:inline">|</span>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
              <span className="text-sky-300 font-bold">皇 {reputations.royal}</span>
              <span style={{ color: '#C026D3' }} className="font-bold">影 {reputations.shadow}</span>
              <span className="text-amber-300 font-bold">三 {reputations.mercenary}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Single-Viewport Cockpit (Zero Scroll) */}
      <main className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN: Compact Character Picker + Simple 3-Skill List */}
        <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
          {/* Compact Character Selection (No descriptions) */}
          <section className="shrink-0 bg-[#121926] border border-slate-800 rounded-2xl p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold text-white">選擇出戰角色</h2>
              <span className="text-[11px] text-slate-400">外觀造型 · 僅影響視覺</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {characters.map((ch) => {
                const active = ch.id === selectedCharId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedCharId(ch.id)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col items-center text-center gap-1.5 ${
                      active
                        ? 'bg-[#182336] border-amber-400 shadow-md shadow-amber-500/15'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <CharacterAvatarSvg skin={ch} className="w-11 h-11 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-100 leading-tight line-clamp-2">
                      {ch.name.replace('（預設）', '')}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Compact Melee Skills Introduction */}
          <section className="flex-1 min-h-0 bg-[#121926] border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Swords className="w-4 h-4 text-amber-400 shrink-0" />
                <span>陣營近戰集氣技能</span>
              </div>
              <span className="text-[11px] text-slate-400">長按左鍵集氣至 0 釋放</span>
            </div>

            <div className="flex-1 min-h-0 flex flex-col justify-evenly divide-y divide-slate-800/80">
              {MELEE_KEYS.map(({ kind, label }) => {
                const sk = facInfo.meleeSkills[kind];
                return (
                  <div key={kind} className="py-1.5 first:pt-1.5 last:pb-0.5 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                      <WeaponIconSvg kind={kind} color={facInfo.accentHex} className="w-7 h-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-xs font-bold ${faction === 'shadow' ? '' : facInfo.color}`}
                          style={faction === 'shadow' ? { color: '#C026D3' } : undefined}
                        >
                          {sk.name}
                        </span>
                        <span className="text-[11px] text-slate-400">{label}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">{sk.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Map Dropdown + Conditional Preview (Hidden for Random) + Prominent Battle CTA */}
        <div className="lg:col-span-7 flex flex-col gap-3 min-h-0 bg-[#121926] border border-slate-800 rounded-2xl p-4">
          {/* Map Selector Dropdown Row */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
              <label htmlFor="map-select" className="text-sm font-bold text-white whitespace-nowrap">
                選擇戰場地圖
              </label>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
              <div className="relative flex-1">
                <select
                  id="map-select"
                  value={selectedMapChoice}
                  onChange={(e) => setSelectedMapChoice(e.target.value)}
                  className="w-full appearance-none bg-slate-900 border border-slate-700 hover:border-amber-400/70 focus:border-amber-400 focus:outline-none rounded-xl pl-3.5 pr-9 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  <option value="random">隨機地圖（7 張戰場隨機抽取）</option>
                  <optgroup label="內建戰場">
                    {MAP_CATALOG.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}（{m.environment} · {m.region}）
                      </option>
                    ))}
                  </optgroup>
                  {customMaps.length > 0 && (
                    <optgroup label="自訂戰場">
                      {customMaps.map((cm) => {
                        const biomeInfo = BIOME_OPTIONS.find((b) => b.id === cm.biome);
                        return (
                          <option key={cm.id} value={cm.id}>
                            ★ {cm.name}（自訂 · {cm.cols}×{cm.rows} · {biomeInfo?.environment ?? '野外'}）
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </select>
                <ChevronDown className="pointer-events-none w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Map Preview Container: Show mystery panel on Random, real MiniMapPreview with Zoom/Scroll when specific map chosen */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-slate-950/75 border border-slate-800/80 rounded-xl overflow-hidden relative">
            {selectedMapChoice === 'random' || (!selectedMapMeta && !selectedCustomMap) ? (
              <div className="flex flex-col items-center justify-center text-center max-w-md px-6 py-8">
                <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-amber-400/40 flex items-center justify-center mb-4 shadow-xl shadow-amber-500/10">
                  <Shuffle className="w-9 h-9 text-amber-400" />
                </div>
                <h3 className="text-xl font-black text-white tracking-tight mb-2">隨機戰場抽選</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  已選擇「隨機地圖」，開戰後將從 7 張戰場中隨機抽取一張出戰，進入戰場前不會事先揭露地形與出生點位置。
                </p>
                <div className="mt-4 text-[11px] font-mono-num text-amber-300/90">
                  如需指定地形並預覽出生點，請於上方選單切換特定地圖
                </div>
              </div>
            ) : selectedCustomMap ? (
              <>
                <MiniMapPreview
                  mapId={selectedCustomMap.id}
                  customMap={selectedCustomMap}
                  className="w-full h-full border-0 rounded-none"
                />
                <div className="pointer-events-none absolute top-2 left-2 bg-slate-950/88 border border-amber-400/50 rounded-lg px-2.5 py-1 text-[11px] font-medium text-amber-200">
                  自訂地圖 · {selectedCustomMap.name} · {selectedCustomMap.cols}×{selectedCustomMap.rows}
                </div>
              </>
            ) : (
              <>
                <MiniMapPreview mapId={selectedMapMeta!.id} className="w-full h-full border-0 rounded-none" />
                <div className="pointer-events-none absolute top-2 left-2 bg-slate-950/88 border border-slate-700/80 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-200">
                  {selectedMapMeta!.name} · {selectedMapMeta!.environment} · {selectedMapMeta!.region}
                </div>
              </>
            )}
          </div>

          {/* Map Summary + High-Contrast Dominant Launch CTA */}
          <div className="shrink-0 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {selectedChar.name} ·{' '}
                {selectedCustomMap
                  ? `自訂：${selectedCustomMap.name}`
                  : selectedMapMeta
                    ? selectedMapMeta.name
                    : '隨機戰場（開戰抽取）'}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {selectedCustomMap
                  ? `${selectedCustomMap.cols}×${selectedCustomMap.rows} 玩家創作戰場 · 支援全高台疊加與自訂出生點`
                  : selectedMapMeta
                    ? selectedMapMeta.highlight
                    : '7 張不對稱實戰戰場 · 地形與出生點開戰揭曉'}
              </div>
            </div>

            <button
              onClick={handleLaunchBattle}
              className="flex items-center justify-center gap-2.5 px-8 py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-extrabold text-base rounded-xl shadow-lg shadow-amber-500/25 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              進入戰鬥
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
