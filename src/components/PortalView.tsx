import React, { useEffect, useRef, useState } from 'react';
import { Grid, HelpCircle, Layers, MapPin, Package, PenTool, Shield, Trophy, X } from 'lucide-react';
import { FLOOR_TERRAIN_BINDINGS, STANDALONE_TERRAIN_SPECS } from '../game/customMaps';
import {
  FACTIONS,
  FACTION_CHARACTERS,
  GUNS,
  MAP_CATALOG,
  MELEES,
  getReputationQiMultiplier,
  getWeaponSwapDuration,
} from '../game/data';
import { HelpCatalogVisualId, renderHelpPreview } from '../game/mapRenderer';
import { FactionId, FloorStyle, MapId, RunRecord } from '../game/types';
import { MiniMapPreview } from './MiniMapPreview';
import { CharacterAvatarSvg, FactionLogoSvg, WeaponIconSvg } from './WeaponArt';

interface PortalViewProps {
  records: RunRecord[];
  reputations: Record<FactionId, number>;
  customMapCount: number;
  onSelectFaction: (faction: FactionId, preselectedMapId?: MapId) => void;
  onOpenMapEditor: () => void;
  onClearRecords: () => void;
}

type HelpTab = 'terrain' | 'maps' | 'weapons' | 'characters' | 'gameplay';

const HELP_TABS: { id: HelpTab; label: string }[] = [
  { id: 'terrain', label: '地板地形物件' },
  { id: 'maps', label: '地圖' },
  { id: 'weapons', label: '武器' },
  { id: 'characters', label: '角色' },
  { id: 'gameplay', label: '玩法' },
];

interface HelpGuideEntry {
  visualId: HelpCatalogVisualId;
  name: string;
  elev: string;
  footprint: string;
  widePreview?: boolean;
  desc: string;
}

const FLOOR_GUIDE_META: Record<
  FloorStyle,
  {
    floorVisualId: HelpCatalogVisualId;
    floorDesc: string;
    tierVisualId: HelpCatalogVisualId;
    stairVisualId: HelpCatalogVisualId;
  }
> = {
  shrine_dirt: {
    floorVisualId: 'floor_shrine_dirt',
    floorDesc: '溫潤砂礫黃土地板，可單格或矩形自由混搭鋪設，具備專屬「江戶土台」與「江戶土坡階梯」。',
    tierVisualId: 'terrain_shrine_dirt',
    stairVisualId: 'terrain_shrine_dirt_stair',
  },
  bamboo_moss: {
    floorVisualId: 'floor_bamboo_moss',
    floorDesc: '深翠苔蘚林地地板，可自由混搭鋪設，具備專屬「嵐山苔台」與「嵐山苔階」。',
    tierVisualId: 'terrain_bamboo_moss',
    stairVisualId: 'terrain_bamboo_moss_stair',
  },
  desert_sand: {
    floorVisualId: 'floor_desert_sand',
    floorDesc: '金色細沙與乾燥風蝕紋理地板，高度 0.0，具備專屬「切石高台」與「切石石階」。',
    tierVisualId: 'terrain_platform',
    stairVisualId: 'terrain_platform_stair',
  },
  castle_stone: {
    floorVisualId: 'floor_castle_stone',
    floorDesc: '淺灰工整切石地磚，適用室內廳堂或戶外混搭，具備專屬「聖殿石台」與「聖殿石階」。',
    tierVisualId: 'terrain_castle_dais',
    stairVisualId: 'terrain_castle_dais_stair',
  },
  warehouse_steel: {
    floorVisualId: 'floor_warehouse_steel',
    floorDesc: '深藍工業防滑鋼板地坪，踏步發出硬質聲響，具備專屬「鋼構高台」與「鋼構斜階」。',
    tierVisualId: 'terrain_warehouse_steel',
    stairVisualId: 'terrain_warehouse_steel_stair',
  },
  grass_ground: {
    floorVisualId: 'terrain_grass',
    floorDesc: '鮮綠柔軟草皮地板，與其他主題地板完全平權，具備專屬「土丘高地」與「土坡階梯」。',
    tierVisualId: 'terrain_hill',
    stairVisualId: 'terrain_hill_stair',
  },
  glacier_ice: {
    floorVisualId: 'floor_glacier_ice',
    floorDesc: '極地冰原晶瑩冰層地板，高度 0.0，具備專屬「極地冰川高地」與「極地冰川階梯」。',
    tierVisualId: 'terrain_glacier',
    stairVisualId: 'terrain_glacier_stair',
  },
};

const FLOOR_GUIDE_ITEMS: HelpGuideEntry[] = (Object.keys(FLOOR_TERRAIN_BINDINGS) as FloorStyle[]).map((fs) => {
  const b = FLOOR_TERRAIN_BINDINGS[fs];
  return {
    visualId: FLOOR_GUIDE_META[fs].floorVisualId,
    name: b.floorLabel,
    elev: '0.0',
    footprint: '1×1 格',
    desc: FLOOR_GUIDE_META[fs].floorDesc,
  };
});

const STANDALONE_TERRAIN_VISUALS: Record<
  'shrine_floor' | 'mud_pit',
  { tierVisualId: HelpCatalogVisualId; stairVisualId: HelpCatalogVisualId }
> = {
  shrine_floor: { tierVisualId: 'terrain_plank', stairVisualId: 'terrain_plank_stair' },
  mud_pit: { tierVisualId: 'terrain_mud', stairVisualId: 'terrain_mud_stair' },
};

const TERRAIN_TIER_ITEMS: HelpGuideEntry[] = [
  ...(Object.keys(FLOOR_TERRAIN_BINDINGS) as FloorStyle[]).map((fs) => {
    const b = FLOOR_TERRAIN_BINDINGS[fs];
    return {
      visualId: FLOOR_GUIDE_META[fs].tierVisualId,
      name: b.terrainLabel,
      elev: '每層 +1.0',
      footprint: '逐格連通',
      widePreview: true,
      desc: b.terrainDesc,
    };
  }),
  ...STANDALONE_TERRAIN_SPECS.map((sp) => ({
    visualId: STANDALONE_TERRAIN_VISUALS[sp.id].tierVisualId,
    name: sp.terrainLabel,
    elev: sp.heightLabel,
    footprint: sp.id === 'mud_pit' ? '逐格凹陷' : '逐格連通',
    widePreview: true,
    desc: sp.terrainDesc,
  })),
];

const TERRAIN_STAIR_ITEMS: HelpGuideEntry[] = [
  ...(Object.keys(FLOOR_TERRAIN_BINDINGS) as FloorStyle[]).map((fs) => {
    const b = FLOOR_TERRAIN_BINDINGS[fs];
    return {
      visualId: FLOOR_GUIDE_META[fs].stairVisualId,
      name: `${b.stairLabel}（對應${b.terrainLabel.replace('（疊加）', '')}）`,
      elev: '所在層 +0.5',
      footprint: '1×1 格（按 R 轉向）',
      desc: b.stairDesc,
    };
  }),
  ...STANDALONE_TERRAIN_SPECS.map((sp) => ({
    visualId: STANDALONE_TERRAIN_VISUALS[sp.id].stairVisualId,
    name: `${sp.stairLabel}（對應${sp.terrainLabel.replace(/（疊加）|（下挖）/, '')}）`,
    elev: '所在層 +0.5',
    footprint: '1×1 格（按 R 轉向）',
    desc: sp.stairDesc,
  })),
];

const OBJECT_GUIDE_ITEMS: HelpGuideEntry[] = [
  {
    visualId: 'object_ice_vent',
    name: '冰氣孔（噴霧冰凍）',
    elev: '所在地形 +0.0',
    footprint: '1×1 格',
    desc: '持續向外噴發極地冷霧的環境機關；任何玩家或電腦經過該高度踩踏即冰凍 5 秒（移速 -10%、近武攻速 -10%、中斷所有持續技能且無法集氣）。',
  },
  {
    visualId: 'object_campfire',
    name: '篝火（營地火堆）',
    elev: '所在地形 +0.0',
    footprint: '1×1 格',
    desc: '疊於原石與交錯木柴上的動態營地火堆，可放於平地或高台出生點旁提供溫煦火光與動態火星粒子（可通行不擋彈道）。',
  },
  {
    visualId: 'object_floating_ice',
    name: '浮冰（僅限水域）',
    elev: '所在地形 +0.0',
    footprint: '1×1 格（自動拼合）',
    widePreview: true,
    desc: '僅能放置於水域格位之上的天然冰排，讓步兵得以踩踏跨越冰河裂隙！單格可獨立存在、相鄰時自動融接成整片冰洲，外露邊緣仍會縮進並明顯露出底層流水。',
  },
  {
    visualId: 'terrain_river',
    name: '水域河道',
    elev: '0.0（隨地形層）',
    footprint: '1×1 格',
    widePreview: true,
    desc: '疊加於地板與高台之上的流動水面物件！岸邊採透明漸層，既不會覆蓋底下的草地／沙地，也不會吃掉下方的 1.0 土丘高地；高度隨底層故 0.0 水面可穿透射擊（須架橋或鋪浮冰通行）。',
  },
  {
    visualId: 'object_pushable_ice',
    name: '可推動寒冰塊',
    elev: '所在層 +1.5',
    footprint: '2×2 格（須等高基底）',
    desc: '朝同一方向持續推頂片刻即可往該方向平滑移動 1 格（須為同高度平地、無牆無階梯）；若前方有人則會連人一併推走，推向實牆或高崖邊緣無路可退時將直接秒殺！',
  },
  {
    visualId: 'object_igloo',
    name: '極地冰屋（3/5/5/5/3）',
    elev: '10（內室 +0.0）',
    footprint: '3/5/5/5/3 格（按 R 轉向）',
    widePreview: true,
    desc: '佔地呈現「3/5/5/5/3」外廓的極地穹頂冰屋，支援 R 鍵 4 向旋轉入口；外圈 11 格為高度 10 實牆，中央入口通往 3×3 可自由走位掩護的內室（靠近時自動淡出屋頂以便觀察）。',
  },
  {
    visualId: 'object_bridge',
    name: '跨河木橋',
    elev: '所在地形 +0.0',
    footprint: '多格橋段（須等高基底）',
    widePreview: true,
    desc: '架設於河道上方的木構橋樑物件，覆蓋水域阻擋判定讓雙岸兵力得以橫渡，跨多格時底層地形須保持等高。',
  },
  {
    visualId: 'object_stone_bridge',
    name: '跨河石橋',
    elev: '所在地形 +0.0',
    footprint: '多格橋段（須等高基底）',
    widePreview: true,
    desc: '堅固的石砌欄邊拱橋，跨越水面讓步兵安全通過，同樣支援 R 鍵切換直／橫擺向與等高多格鋪設。',
  },
  {
    visualId: 'object_stone_road',
    name: '石板參道',
    elev: '所在地形 +0.0',
    footprint: '1×1 格',
    desc: '鋪設於平地或高台上的參道石板物件（如江戶神社南北參道），透明縫隙透出底下地板，不影響通行與高度。',
  },
  {
    visualId: 'object_rail',
    name: '鐵道路軌',
    elev: '所在地形 +0.0',
    footprint: '1×1 格',
    widePreview: true,
    desc: '支援水平、垂直（按 R 轉向）、雙排並軌，以及自動生成的 90° 轉角與 T／十字分叉軌道路網物件。',
  },
  {
    visualId: 'object_railing',
    name: '防護欄杆（自動連接）',
    elev: '所在層 +1.0',
    footprint: '1×1 格',
    widePreview: true,
    desc: '依四鄰自動串連的金屬欄杆，阻擋角色步行翻越；平地（0.0）射擊子彈與視線可越過上方，僅阻擋來自低窪泥坑（-1.0）的射線。',
  },
  {
    visualId: 'object_stair_crate',
    name: '木條階梯踏台',
    elev: '所在層 +0.5',
    footprint: '1×1 格',
    desc: '放置於地板或高台上的踏板物件，高度永遠為「所在底層 +0.5」，用來銜接相差 1.0 格的高台或小木箱。',
  },
  {
    visualId: 'object_small_crate',
    name: '小木箱',
    elev: '所在層 +1.0',
    footprint: '1×1 格',
    desc: '1 格橡木低箱，置於平地為 1.0、疊加於 +1.0 土丘則為 2.0（平地射擊與視線皆依最終總高度差計算）。',
  },
  {
    visualId: 'object_big_crate',
    name: '大木箱（斜撐木箱）',
    elev: '所在層 +1.5',
    footprint: '2×2 格（須等高基底）',
    desc: '2×2 斜撐大型木箱，總高度為「所在地形 +1.5」；跨越多格時，底下 4 格地形高度必須完全一致。',
  },
  {
    visualId: 'object_rock_small',
    name: '小石塊（黑／棕／白）',
    elev: '所在層 +1.5',
    footprint: '1×1 格',
    desc: '天然稜角岩塊掩體，提供黑石、棕石與白石三種色調，總高度「所在地形 +1.5」，透出底層地形。',
  },
  {
    visualId: 'object_rock_large',
    name: '大岩石（黑／棕／白）',
    elev: '所在層 +2.0',
    footprint: '2×2 格（須等高基底）',
    desc: '大型天然巨岩掩體，支援黑、棕、白三色選擇，總高度「所在地形 +2.0」，可完全阻擋平地子彈並須置於等高格位。',
  },
  {
    visualId: 'object_container',
    name: '彩色鋼製貨櫃',
    elev: '所在層 +2.0',
    footprint: '4×2 / 2×4 格（須等高基底）',
    widePreview: true,
    desc: '大型鋼櫃，總高度為「所在地形 +2.0」；支援 R 鍵橫直切換，放置範圍內各格地形高度必須一致。',
  },
  {
    visualId: 'object_train_car',
    name: '火車頭／貨運車廂',
    elev: '所在層 +2.0',
    footprint: '4×2 / 2×4 格（須等高基底）',
    widePreview: true,
    desc: '停泊於鐵軌上的車廂物件，支援橫向（4×2）與直向（2×4）完整朝向繪製，總高度「所在地形 +2.0」。',
  },
  {
    visualId: 'object_stone_wall',
    name: '石砌實牆（棕褐／苔綠）',
    elev: '10',
    footprint: '1×1／連貫牆',
    widePreview: true,
    desc: '實心建築牆體（高度 10），支援 8 向轉角拼接與鄰接木箱側反光打燈；自然阻擋移動、子彈與視線並反彈黑龍波。',
  },
  {
    visualId: 'object_stone_wall_red',
    name: '彩砌磚石實牆（朱紅／靛青）',
    elev: '10',
    footprint: '1×1／連貫牆',
    widePreview: true,
    desc: '朱砂紅磚牆與靛青石砌牆（高度 10），具備相同 8 向轉角與光影拼接效果，適合區分陣營堡壘區域。',
  },
  {
    visualId: 'object_shrine_wall',
    name: '江戶杉木板塀',
    elev: '10',
    footprint: '1×1 格',
    desc: '單格木構實牆，高度 10，可建於平地或高台上，完整阻斷移動、子彈與視線。',
  },
  {
    visualId: 'object_castle_pillar',
    name: '聖殿雕紋石柱',
    elev: '10',
    footprint: '1×1 格',
    desc: '大理石雕紋方柱，高度 10，單格佔位，可放置於高台與平地作為繞柱掩體。',
  },
  {
    visualId: 'object_house',
    name: '斜頂房屋（5 種建築風格）',
    elev: '10',
    footprint: '3×2 / 2×3 格（須等高基底）',
    widePreview: true,
    desc: '提供青苔石瓦、和風朱簷、歐式紅頂、荒野土坯與紅磚工坊 5 種風格並支援 R 鍵 4 向旋轉，高度 10。',
  },
  {
    visualId: 'object_bamboo',
    name: '竹林實牆（4 向 3 株）',
    elev: '10',
    footprint: '1×1 格（3 株）',
    desc: '一格內三株翠竹（R 鍵切換四種擺法），可套用在任何地板或土丘高地上且透明縫隙清楚透出底層地形，高度 10。',
  },
  {
    visualId: 'object_farm',
    name: '耕作農田（4 種作物）',
    elev: '所在地形 +0.0',
    footprint: '1×1 格',
    widePreview: true,
    desc: '可鋪設於平地或高台上的田埂物件，提供空田、紅蘿蔔、小麥與甘藍菜 4 種作物樣式，自由通行不擋彈道。',
  },
  {
    visualId: 'object_bush',
    name: '野生灌木草叢',
    elev: '所在地形 +0.0',
    footprint: '1×1 格',
    desc: '低矮灌木地表植被，高度不額外增加，可自由穿梭通過且不阻礙視野與子彈。',
  },
  {
    visualId: 'object_tree',
    name: '林間樹木（6 種自選葉色）',
    elev: '10',
    footprint: '1×1 格',
    desc: '實心樹幹高度 10，阻斷角色走位、子彈與視線；可自選常青／櫻花／秋楓／銀杏／翡翠／冷杉葉色，不受地板影響。',
  },
];

const TerrainObjectCanvasPreview: React.FC<{ visualId: HelpCatalogVisualId; wide?: boolean }> = ({
  visualId,
  wide = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasW = wide ? 240 : 144;
  const canvasH = wide ? 120 : 108;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderHelpPreview(ctx, visualId, canvasW, canvasH);
  }, [visualId, canvasW, canvasH]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      className="w-full h-full object-contain block"
    />
  );
};

export const PortalView: React.FC<PortalViewProps> = ({
  records,
  reputations,
  customMapCount,
  onSelectFaction,
  onOpenMapEditor,
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

      {/* BOTTOM-LEFT: Create Custom Map Button */}
      <button
        onClick={onOpenMapEditor}
        className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-sky-400/80 text-sm font-bold text-slate-100 shadow-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
      >
        <PenTool className="w-4 h-4 text-sky-400" />
        <span>創建地圖</span>
        {customMapCount > 0 && (
          <span className="font-mono-num text-xs font-black text-amber-300">({customMapCount})</span>
        )}
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
                <div className="space-y-6">
                  <div className="bg-slate-900/75 border border-slate-700/80 rounded-xl px-4 py-3.5 text-xs text-slate-200 space-y-2">
                    <div className="font-bold text-amber-300">
                      統一高度物理總則（無獨立「擋視野」／「擋子彈」屬性，一切判定完全由高度 h 推算）
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] leading-relaxed text-slate-300">
                      <div className="bg-slate-950/75 border border-slate-800 rounded-lg px-3 py-2">
                        <strong className="text-sky-300 block mb-0.5">1. 步行移動規則</strong>
                        相鄰兩點高度差 <span className="font-mono-num text-white">|Δh| ≤ 0.5</span> 才可跨越；水域（0.0 且無木橋）不可涉水。所有階梯皆為「<span className="font-mono-num text-amber-300">所在底層 +0.5</span>」。
                      </div>
                      <div className="bg-slate-950/75 border border-slate-800 rounded-lg px-3 py-2">
                        <strong className="text-emerald-300 block mb-0.5">2. 視線判定（LoS）</strong>
                        直線路徑上只要出現物件／地形高度 <span className="font-mono-num text-white">h &gt; max(觀察者, 目標) + 1.0</span> 即被遮蔽；高度 10 的實牆、房屋、竹林與樹木自然擋住視線。
                      </div>
                      <div className="bg-slate-950/75 border border-slate-800 rounded-lg px-3 py-2">
                        <strong className="text-amber-300 block mb-0.5">3. 子彈彈道（高差 Δh）</strong>
                        高打低可直接射擊；射向高處時：<span className="font-mono-num text-white">Δh ≤ 1.0</span> 越過、<span className="font-mono-num text-white">1.0 &lt; Δh &lt; 2.0</span> 深入約 0.5 格截停、<span className="font-mono-num text-white">Δh ≥ 2.0</span> 於邊緣即止。
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      正交四層架構：最底層為<strong className="text-amber-300">可混搭地板層（6 種 `0.0` 地坪）</strong>，向上疊加<strong className="text-sky-300">地形高台與階梯</strong>，再於其上配置<strong className="text-emerald-300">物件（含透明邊緣水域、路軌、可疊加箱體與實心牆樹）</strong>；任何大於 1×1 的物件所跨格位底層地形必須等高。
                    </div>
                  </div>

                  {/* Category 1: 地板（Floor Layer） */}
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Grid className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-amber-300">一、地板（6 種可自由混搭地坪，高度 0.0）</h3>
                      <span className="text-[11px] text-slate-400">決定地表質感與踏步音色，與上層水域／地形／物件完全獨立</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {FLOOR_GUIDE_ITEMS.map((item) => (
                        <div
                          key={item.visualId}
                          className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3.5"
                        >
                          <div className="rounded-lg border border-slate-700/80 overflow-hidden bg-[#090D16] shrink-0 w-28 h-24">
                            <TerrainObjectCanvasPreview visualId={item.visualId} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-bold text-white">{item.name}</span>
                              <span className="text-[11px] font-mono-num text-amber-300 shrink-0">
                                高度 {item.elev}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono-num text-slate-400 mb-1.5">
                              <span>佔位：{item.footprint}</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Category 2: 地形（Terrain Layer：層級 與 攀爬階梯 兩類） */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Layers className="w-4 h-4 text-sky-400" />
                      <h3 className="text-sm font-bold text-sky-300">二、地形（可疊加層級與對應 +0.5 攀爬階梯）</h3>
                      <span className="text-[11px] text-slate-400">決定行走高度與攀爬斜坡，保留底層地板紋理</span>
                    </div>

                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>層級（±1.0/層 · 3×3 預覽示範疊加高層）</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {TERRAIN_TIER_ITEMS.map((item) => (
                          <div
                            key={item.visualId}
                            className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3"
                          >
                            <div className="rounded-lg border border-slate-700/80 overflow-hidden bg-[#090D16] shrink-0 w-full h-32">
                              <TerrainObjectCanvasPreview visualId={item.visualId} wide={item.widePreview} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-white">{item.name}</span>
                                <span className="text-[11px] font-mono-num text-amber-300 shrink-0">
                                  高度 {item.elev}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono-num text-slate-400 mb-1.5">
                                <span>佔位：{item.footprint}</span>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        <span>攀爬階梯（所在層 +0.5 · 左梯右台對照）</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {TERRAIN_STAIR_ITEMS.map((item) => (
                          <div
                            key={item.visualId}
                            className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3.5"
                          >
                            <div className="rounded-lg border border-slate-700/80 overflow-hidden bg-[#090D16] shrink-0 w-32 h-24">
                              <TerrainObjectCanvasPreview visualId={item.visualId} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-white">{item.name}</span>
                                <span className="text-[11px] font-mono-num text-amber-300 shrink-0">
                                  高度 {item.elev}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono-num text-slate-400 mb-1.5">
                                <span>佔位：{item.footprint}</span>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Category 3: 物件（Object Layer） */}
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-emerald-300">三、物件（水域、路網、可疊加箱體與建築植被）</h3>
                      <span className="text-[11px] text-slate-400">疊加於地形之上（高度自動累加），多格物件須置於等高基底</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {OBJECT_GUIDE_ITEMS.map((item) => (
                        <div
                          key={item.visualId}
                          className={`bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 flex ${
                            item.widePreview ? 'flex-col gap-3' : 'items-start gap-3.5'
                          }`}
                        >
                          <div
                            className={`rounded-lg border border-slate-700/80 overflow-hidden bg-[#090D16] shrink-0 ${
                              item.widePreview ? 'w-full h-32' : 'w-28 h-24'
                            }`}
                          >
                            <TerrainObjectCanvasPreview visualId={item.visualId} wide={item.widePreview} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-bold text-white">{item.name}</span>
                              <span className="text-[11px] font-mono-num text-amber-300 shrink-0">
                                高度 {item.elev}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono-num text-slate-400 mb-1.5">
                              <span>佔位：{item.footprint}</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
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
                        • <strong>WASD / 方向鍵</strong>：移動；滑鼠左鍵射擊或揮砍；<strong>R</strong> 鍵或空彈匣再點一次左鍵裝彈（僅限當前手持槍械，換手將中斷未完成的裝彈計時）。
                      </p>
                      <p className="text-slate-300">
                        • <strong>1 / 2 / Q</strong>：切換第一手與第二手（切換時觸發搓手動作，重武器更慢；攻擊後 0.34s 內按 Q 取消硬直並觸發連攜增傷）。
                      </p>
                      <p className="text-slate-300">
                        • <strong>Esc</strong>：放下當前非預設武器並換回小槍/小刀（槍械剩餘彈匣與盾牌剩餘耐久皆完整保留於地面）；<strong>Space</strong>：拾取彈藥箱或武器；<strong>Tab</strong>：查看戰況；<strong>P</strong>：暫停。
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
                      <div className="text-sm font-bold text-amber-400">彈道貫穿、死亡掉落與對等戰鬥規則</div>
                      <p className="text-slate-300">
                        • 射向 1.5 格高大箱子時，子彈會穿透至外緣內 0.5 格處（站太靠箱緣仍會受傷）；≥ 2.0 格石牆/貨櫃則於邊緣即止。地形階梯須貼合並指向對應高台／泥坑且邊緣會自然融接。
                      </p>
                      <p className="text-slate-300">
                        • 玩家與電腦同為 <strong>100 血</strong>且無陣營被動能力；踩過「冰氣孔」會陷入 <strong>5 秒冰凍</strong>（步速 -10%、近武攻速 -10%、中斷所有持續技能且無法集氣）。
                      </p>
                      <p className="text-slate-300">
                        • 玩家死亡掉落非預設武器並於出生點以制式小槍／小刀復活；皇家光彈會誤傷友軍、閃光瞬移可致盲敵人（含玩家），天影黑龍波絕不傷隊友。
                      </p>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <div className="text-sm font-bold text-emerald-400">三方 10 兵編制與獨立聲望</div>
                      <p className="text-slate-300">
                        • 皇家、天影、第三勢力各 10 名士兵（場上同陣營最多 2 人）；AI 固定以 <strong>100 聲望（1.5× 集氣）</strong>與<strong>無限備彈</strong>共用雙手與技能冷卻機制。
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
