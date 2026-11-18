import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Crosshair,
  Download,
  Eraser,
  FolderPlus,
  Grid,
  Layers,
  Package,
  PaintBucket,
  Play,
  Redo2,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { drawPickup } from '../game/combatRenderer';
import {
  CustomMapData,
  FLOOR_STYLE_OPTIONS,
  arenaMapToCustomData,
  buildArenaMapFromCustom,
  cloneCustomMap,
  createBlankCustomMap,
  createCustomMapId,
  floorStyleToBiome,
  hasUniformCellElevation,
  resizeCustomMap,
  validateCustomMap,
} from '../game/customMaps';
import { FACTIONS, GUNS, MAP_CATALOG, MELEES } from '../game/data';
import { clamp } from '../game/geometry';
import {
  HelpCatalogVisualId,
  renderHelpPreview,
  renderMapBaseLayer,
  renderMapCanopies,
} from '../game/mapRenderer';
import { TILE, biomeToDefaultFloor, createArenaMap, createFloorGrid } from '../game/maps';
import { FactionId, FloorStyle, MapId, ObstacleStyle, PickupItem, PlatformStyle } from '../game/types';
import { FactionLogoSvg, WeaponIconSvg } from './WeaponArt';

interface MapEditorViewProps {
  savedMaps: CustomMapData[];
  onSaveMap: (map: CustomMapData) => void;
  onDeleteMap: (id: string) => void;
  onPlayCustomMap: (map: CustomMapData) => void;
  onBackToLobby: () => void;
}

type EditorTab = 'floor' | 'terrain' | 'objects' | 'spawns';
type CompassDir = 'north' | 'east' | 'south' | 'west';
type RailAxis = 'horizontal' | 'vertical';

type ToolId =
  | 'floor_shrine_dirt'
  | 'floor_bamboo_moss'
  | 'floor_desert_sand'
  | 'floor_castle_stone'
  | 'floor_warehouse_steel'
  | 'floor_grass'
  | 'floor_reset'
  | 'terrain_hill_raise'
  | 'terrain_hill_stair'
  | 'terrain_stone_raise'
  | 'terrain_stone_stair'
  | 'terrain_plank_raise'
  | 'terrain_lower'
  | 'obj_water'
  | 'obj_bridge'
  | 'obj_stone_road'
  | 'obj_rail'
  | 'obj_stair_crate'
  | 'obj_small_crate'
  | 'obj_big_crate'
  | 'obj_container'
  | 'obj_train_car'
  | 'obj_stone_wall_tan'
  | 'obj_stone_wall_green'
  | 'obj_shrine_wall'
  | 'obj_castle_pillar'
  | 'obj_house'
  | 'obj_bamboo'
  | 'obj_bush'
  | 'obj_tree'
  | 'obj_erase'
  | 'spawn_royal'
  | 'spawn_shadow'
  | 'spawn_mercenary'
  | 'spawn_weapon'
  | 'spawn_ammo'
  | 'spawn_shield'
  | 'spawn_erase';

interface ToolMeta {
  id: ToolId;
  tab: EditorTab;
  label: string;
  heightLabel: string;
  footprint: string;
  previewId?: HelpCatalogVisualId;
  rotatable?: boolean;
  floorStyle?: FloorStyle;
}

const FLOOR_TOOL_STYLE_MAP: Partial<Record<ToolId, FloorStyle>> = {
  floor_shrine_dirt: 'shrine_dirt',
  floor_bamboo_moss: 'bamboo_moss',
  floor_desert_sand: 'desert_sand',
  floor_castle_stone: 'castle_stone',
  floor_warehouse_steel: 'warehouse_steel',
  floor_grass: 'grass_ground',
};

const FLOOR_PREVIEW_BY_STYLE: Record<FloorStyle, HelpCatalogVisualId> = {
  shrine_dirt: 'floor_shrine_dirt',
  bamboo_moss: 'floor_bamboo_moss',
  desert_sand: 'floor_desert_sand',
  castle_stone: 'floor_castle_stone',
  warehouse_steel: 'floor_warehouse_steel',
  grass_ground: 'terrain_grass',
};

const TOOL_CATALOG: ToolMeta[] = [
  // Floor tab (6 種獨立可混搭地板，無「一般地板」)
  ...FLOOR_STYLE_OPTIONS.map((opt) => ({
    id: (opt.id === 'grass_ground' ? 'floor_grass' : `floor_${opt.id}`) as ToolId,
    tab: 'floor' as const,
    label: opt.label,
    heightLabel: '高度 0.0',
    footprint: '1×1 格',
    previewId: FLOOR_PREVIEW_BY_STYLE[opt.id],
    floorStyle: opt.id,
  })),

  // Terrain tab (純粹地形高台與階梯，不覆蓋地板)
  { id: 'terrain_hill_raise', tab: 'terrain', label: '土丘高地（疊加）', heightLabel: '每層 +1.0', footprint: '1×1 格', previewId: 'terrain_hill' },
  { id: 'terrain_hill_stair', tab: 'terrain', label: '土坡階梯', heightLabel: '所在層 +0.5', footprint: '1×1 格', previewId: 'terrain_hill_stair', rotatable: true },
  { id: 'terrain_stone_raise', tab: 'terrain', label: '切石高台（疊加）', heightLabel: '每層 +1.0', footprint: '1×1 格', previewId: 'terrain_platform' },
  { id: 'terrain_stone_stair', tab: 'terrain', label: '切石石階', heightLabel: '所在層 +0.5', footprint: '1×1 格', previewId: 'terrain_platform_stair', rotatable: true },
  { id: 'terrain_plank_raise', tab: 'terrain', label: '木板神社高台', heightLabel: '每層 +1.0', footprint: '1×1 格', previewId: 'terrain_plank' },
  { id: 'terrain_lower', tab: 'terrain', label: '地形橡皮擦（降層／清階梯）', heightLabel: '降 -1.0／清梯', footprint: '1×1 格' },

  // Objects tab (含水域河道及所有可疊加物件)
  { id: 'obj_water', tab: 'objects', label: '水域河道', heightLabel: '隨地形層 0.0', footprint: '1×1 格', previewId: 'terrain_river' },
  { id: 'obj_bridge', tab: 'objects', label: '跨河木橋', heightLabel: '所在層 +0.0', footprint: '可拉框 / 3×2', previewId: 'object_bridge', rotatable: true },
  { id: 'obj_stone_road', tab: 'objects', label: '石板參道', heightLabel: '所在層 +0.0', footprint: '1×1 格', previewId: 'object_stone_road' },
  { id: 'obj_rail', tab: 'objects', label: '鐵道路軌', heightLabel: '所在層 +0.0', footprint: '1×1 格', previewId: 'object_rail', rotatable: true },
  { id: 'obj_stair_crate', tab: 'objects', label: '木條階梯踏台', heightLabel: '所在層 +0.5', footprint: '1×1 格', previewId: 'object_stair_crate', rotatable: true },
  { id: 'obj_small_crate', tab: 'objects', label: '小木箱', heightLabel: '所在層 +1.0', footprint: '1×1 格', previewId: 'object_small_crate' },
  { id: 'obj_big_crate', tab: 'objects', label: '大木箱（斜撐）', heightLabel: '所在層 +1.5', footprint: '2×2 格', previewId: 'object_big_crate' },
  { id: 'obj_container', tab: 'objects', label: '彩色鋼製貨櫃', heightLabel: '所在層 +2.0', footprint: '4×2 / 2×4', previewId: 'object_container', rotatable: true },
  { id: 'obj_train_car', tab: 'objects', label: '火車頭 / 車廂', heightLabel: '所在層 +2.0', footprint: '4×2 / 2×4', previewId: 'object_train_car', rotatable: true },
  { id: 'obj_stone_wall_tan', tab: 'objects', label: '褐沙石砌實牆', heightLabel: '高度 10', footprint: '1×1 格', previewId: 'object_stone_wall' },
  { id: 'obj_stone_wall_green', tab: 'objects', label: '苔綠石砌實牆', heightLabel: '高度 10', footprint: '1×1 格', previewId: 'object_stone_wall_green' },
  { id: 'obj_shrine_wall', tab: 'objects', label: '江戶杉木板塀', heightLabel: '高度 10', footprint: '1×1 格', previewId: 'object_shrine_wall' },
  { id: 'obj_castle_pillar', tab: 'objects', label: '聖殿雕紋石柱', heightLabel: '高度 10', footprint: '1×1 格', previewId: 'object_castle_pillar' },
  { id: 'obj_house', tab: 'objects', label: '斜頂磚石房屋', heightLabel: '高度 10', footprint: '3×2 / 2×3', previewId: 'object_house', rotatable: true },
  { id: 'obj_bamboo', tab: 'objects', label: '竹林實牆（3 株）', heightLabel: '高度 10', footprint: '1×1 格', previewId: 'object_bamboo', rotatable: true },
  { id: 'obj_bush', tab: 'objects', label: '野生灌木草叢', heightLabel: '所在層 +0.0', footprint: '1×1 格', previewId: 'object_bush' },
  { id: 'obj_tree', tab: 'objects', label: '林間樹木', heightLabel: '高度 10', footprint: '1×1 格', previewId: 'object_tree' },
  { id: 'obj_erase', tab: 'objects', label: '移除物件／水域／橋樑', heightLabel: '清除', footprint: '1×1 格' },

  // Spawns tab (陣營出生點；武器、盾牌與彈藥箱統一收編於下方「地圖武器點」按鈕群)
  { id: 'spawn_royal', tab: 'spawns', label: '皇家騎士團出生點', heightLabel: '團隊陣營', footprint: '1×1 格' },
  { id: 'spawn_shadow', tab: 'spawns', label: '天影十字軍出生點', heightLabel: '團隊陣營', footprint: '1×1 格' },
  { id: 'spawn_mercenary', tab: 'spawns', label: '第三勢力出生點', heightLabel: '孤狼陣營', footprint: '1×1 格' },
  { id: 'spawn_erase', tab: 'spawns', label: '清除出生點／武器補給', heightLabel: '清除', footprint: '1×1 格' },
];

const CONTAINER_COLORS = [
  { value: '#0284C7', label: '海藍' },
  { value: '#D97706', label: '琥珀' },
  { value: '#B91C1C', label: '赤紅' },
  { value: '#047857', label: '深綠' },
  { value: '#475569', label: '鐵灰' },
];

const TRAIN_VARIANTS = [
  { value: 'loco', label: '蒸汽火車頭' },
  { value: '#991B1B', label: '紅木車廂' },
  { value: '#92400E', label: '原木車廂' },
  { value: '#3F6212', label: '軍綠車廂' },
];

type PlaceableWeaponItem =
  | { entryType: 'gun'; weaponId: string; iconKind: 'rifle' | 'shotgun' | 'sniper'; label: string; subtitle: string }
  | { entryType: 'melee'; weaponId: string; iconKind: 'claw' | 'greatsword'; label: string; subtitle: string }
  | { entryType: 'shield'; weaponId: string; iconKind: 'shield'; label: string; subtitle: string }
  | { entryType: 'ammo'; weaponId: string; iconKind: 'ammo'; label: string; subtitle: string };

const PLACEABLE_WEAPONS: PlaceableWeaponItem[] = [
  ...GUNS.filter((g) => g.kind !== 'pistol').map((g) => ({
    entryType: 'gun' as const,
    weaponId: g.id,
    iconKind: g.kind as 'rifle' | 'shotgun' | 'sniper',
    label: g.name,
    subtitle: '遠程槍械',
  })),
  ...MELEES.filter((m) => m.kind !== 'knife' && m.kind !== 'shield').map((m) => ({
    entryType: 'melee' as const,
    weaponId: m.id,
    iconKind: m.kind as 'claw' | 'greatsword',
    label: m.name,
    subtitle: '近戰兵器',
  })),
  {
    entryType: 'shield',
    weaponId: 'shield',
    iconKind: 'shield',
    label: '防彈盾牌',
    subtitle: '近戰兵器',
  },
  {
    entryType: 'ammo',
    weaponId: 'ammo_box',
    iconKind: 'ammo',
    label: '彈藥箱',
    subtitle: '補給物資',
  },
];

const DIR_LABELS: Record<CompassDir, string> = {
  north: '朝北 ↑',
  east: '朝東 →',
  south: '朝南 ↓',
  west: '朝西 ←',
};

const BAMBOO_DIR_LABELS: Record<CompassDir, string> = {
  north: '2上1下',
  east: '1左2右',
  south: '1上2下',
  west: '2左1右',
};

const HOUSE_DIR_LABELS: Record<CompassDir, string> = {
  north: '橫 3×2 北門',
  east: '直 2×3 東門',
  south: '橫 3×2 南門',
  west: '直 2×3 西門',
};

const COMPASS_ORDER: CompassDir[] = ['north', 'east', 'south', 'west'];

const ToolThumb: React.FC<{ visualId: HelpCatalogVisualId }> = ({ visualId }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderHelpPreview(ctx, visualId, 76, 48);
  }, [visualId]);
  return <canvas ref={ref} width={76} height={48} className="w-[64px] h-[42px] rounded border border-slate-700/80 shrink-0 block" />;
};

const AmmoIconCanvas: React.FC = () => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 32, 32);
    drawPickup(ctx, {
      id: 'thumb_ammo',
      x: 16,
      y: 16,
      kind: 'ammo',
      label: '彈藥箱',
      color: '#60A5FA',
      amount: 30,
      bobPhase: 0,
    });
  }, []);
  return <canvas ref={ref} width={32} height={32} className="w-7 h-7 block" />;
};

function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function buildEditorPickups(arena: ReturnType<typeof buildArenaMapFromCustom>): PickupItem[] {
  return [
    ...arena.ammoSpawns.map(
      (a, idx): PickupItem => ({
        id: `ed_ammo_${idx}`,
        x: a.x,
        y: a.y,
        kind: 'ammo',
        label: '彈藥箱',
        color: '#60A5FA',
        amount: 30,
        bobPhase: 0,
      })
    ),
    ...arena.shieldSpawns.map((s, idx): PickupItem => {
      const shDef = MELEES.find((m) => m.kind === 'shield');
      return {
        id: `ed_shield_${idx}`,
        x: s.x,
        y: s.y,
        kind: 'melee',
        label: shDef?.name || '防彈盾牌',
        color: shDef?.color || '#38BDF8',
        meleeDef: shDef,
        durability: 100,
        bobPhase: 0,
      };
    }),
    ...arena.weaponSpawns.flatMap((ws, idx): PickupItem[] => {
      if (ws.kind === 'gun') {
        const g = GUNS.find((item) => item.id === ws.weaponId);
        if (!g) return [];
        return [
          {
            id: `ed_w_${idx}`,
            x: ws.x,
            y: ws.y,
            kind: 'gun',
            label: g.name,
            color: g.color,
            gunDef: g,
            ammoInMag: g.magSize,
            bobPhase: 0,
          },
        ];
      }
      const m = MELEES.find((item) => item.id === ws.weaponId);
      if (!m) return [];
      return [
        {
          id: `ed_m_${idx}`,
          x: ws.x,
          y: ws.y,
          kind: 'melee',
          label: m.name,
          color: m.color,
          meleeDef: m,
          bobPhase: 0,
        },
      ];
    }),
  ];
}

interface ApplyContext {
  activeTab: EditorTab;
  tool: ToolId;
  stairDir: CompassDir;
  bambooDir: CompassDir;
  houseDir: CompassDir;
  railOrientation: RailAxis;
  rotated: boolean;
  containerColor: string;
  trainVariant: string;
  selectedWeapon: { kind: 'gun' | 'melee'; weaponId: string };
}

function getEffectiveTool(ctxOpts: ApplyContext, forceErase: boolean): ToolId {
  if (!forceErase) return ctxOpts.tool;
  if (ctxOpts.activeTab === 'floor') return 'floor_reset';
  if (ctxOpts.activeTab === 'spawns') return 'spawn_erase';
  if (ctxOpts.activeTab === 'objects') return 'obj_erase';
  return 'terrain_lower';
}

function getFootprintForTool(toolId: ToolId, ctxOpts: ApplyContext): { gw: number; gh: number } {
  if (toolId === 'obj_big_crate') return { gw: 2, gh: 2 };
  if (toolId === 'obj_house') {
    return ctxOpts.houseDir === 'east' || ctxOpts.houseDir === 'west' ? { gw: 2, gh: 3 } : { gw: 3, gh: 2 };
  }
  if (toolId === 'obj_bridge') return ctxOpts.rotated ? { gw: 2, gh: 3 } : { gw: 3, gh: 2 };
  if (toolId === 'obj_container' || toolId === 'obj_train_car') return ctxOpts.rotated ? { gw: 2, gh: 4 } : { gw: 4, gh: 2 };
  return { gw: 1, gh: 1 };
}

interface ApplyToolResult {
  next: CustomMapData;
  error?: string;
}

function validateMultiTileUniformTerrain(data: CustomMapData): string | undefined {
  for (const obs of data.obstacles) {
    if ((obs.gw > 1 || obs.gh > 1) && !hasUniformCellElevation(data.tileGrid, obs.gx, obs.gy, obs.gw, obs.gh)) {
      return `上方存在跨格物件 (${obs.gx}, ${obs.gy}) ${obs.gw}×${obs.gh}，請整塊一併升降或先移除後再調整高度`;
    }
  }
  for (const br of data.bridges) {
    if ((br.gw > 1 || br.gh > 1) && !hasUniformCellElevation(data.tileGrid, br.gx, br.gy, br.gw, br.gh)) {
      return `上方存在跨格木橋 (${br.gx}, ${br.gy}) ${br.gw}×${br.gh}，調整地形會造成底層高度不一致`;
    }
  }
  return undefined;
}

function applyToolToRect(
  prev: CustomMapData,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  forceErase: boolean,
  ctxOpts: ApplyContext
): ApplyToolResult {
  const minX = clamp(Math.min(startX, endX), 0, prev.cols - 1);
  const maxX = clamp(Math.max(startX, endX), 0, prev.cols - 1);
  const minY = clamp(Math.min(startY, endY), 0, prev.rows - 1);
  const maxY = clamp(Math.max(startY, endY), 0, prev.rows - 1);
  const rw = maxX - minX + 1;
  const rh = maxY - minY + 1;

  const next = cloneCustomMap(prev);
  next.updatedAt = Date.now();
  const effectiveTool = getEffectiveTool(ctxOpts, forceErase);

  const removeSpawnsInRect = (rx: number, ry: number, w: number, h: number) => {
    const out = (cx: number, cy: number) => cx < rx || cx >= rx + w || cy < ry || cy >= ry + h;
    next.weaponSpawns = next.weaponSpawns.filter((it) => out(it.gx, it.gy));
    next.ammoSpawns = next.ammoSpawns.filter((it) => out(it.gx, it.gy));
    next.shieldSpawns = next.shieldSpawns.filter((it) => out(it.gx, it.gy));
    next.factionSpawns.royal = next.factionSpawns.royal.filter((it) => out(it.gx, it.gy));
    next.factionSpawns.shadow = next.factionSpawns.shadow.filter((it) => out(it.gx, it.gy));
    next.factionSpawns.mercenary = next.factionSpawns.mercenary.filter((it) => out(it.gx, it.gy));
  };

  const removeObjectsInRect = (rx: number, ry: number, w: number, h: number, includeRoadsRailsAndWater = true) => {
    next.obstacles = next.obstacles.filter((o) => !rectsOverlap(o.gx, o.gy, o.gw, o.gh, rx, ry, w, h));
    next.stairs = next.stairs.filter((s) => !rectsOverlap(s.gx, s.gy, s.gw ?? 1, s.gh ?? 1, rx, ry, w, h));
    next.bridges = next.bridges.filter((b) => !rectsOverlap(b.gx, b.gy, b.gw, b.gh, rx, ry, w, h));
    next.bushes = next.bushes.filter((b) => !rectsOverlap(b.gx, b.gy, 1, 1, rx, ry, w, h));
    next.trees = next.trees.filter((t) => !rectsOverlap(t.gx, t.gy, 1, 1, rx, ry, w, h));
    if (includeRoadsRailsAndWater) {
      next.waterTiles = next.waterTiles.filter((wt) => !rectsOverlap(wt.gx, wt.gy, 1, 1, rx, ry, w, h));
      next.stoneRoads = (next.stoneRoads || []).filter((r) => !rectsOverlap(r.gx, r.gy, 1, 1, rx, ry, w, h));
      next.railTracks = (next.railTracks || []).filter((r) => !rectsOverlap(r.gx, r.gy, 1, 1, rx, ry, w, h));
    }
  };

  // Floor tools (pure 0.0 surface style layer — never alters terrain height, stairs, water, or objects)
  const targetFloorStyle =
    effectiveTool === 'floor_reset' ? biomeToDefaultFloor(next.biome) : FLOOR_TOOL_STYLE_MAP[effectiveTool];
  if (targetFloorStyle) {
    if (!next.floorGrid) {
      next.floorGrid = createFloorGrid(next.cols, next.rows, biomeToDefaultFloor(next.biome));
    }
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.floorGrid[gy][gx] = targetFloorStyle;
      }
    }
    return { next };
  }

  // Terrain tools (raise/lower height or place stairs — preserves floorGrid and waterTiles)
  if (
    effectiveTool === 'terrain_hill_raise' ||
    effectiveTool === 'terrain_stone_raise' ||
    effectiveTool === 'terrain_plank_raise'
  ) {
    const style: PlatformStyle =
      effectiveTool === 'terrain_hill_raise'
        ? 'hill'
        : effectiveTool === 'terrain_plank_raise'
          ? 'shrine_floor'
          : next.biome === 'castle_indoor'
            ? 'castle_dais'
            : 'pyramid';
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const curElev = next.tileGrid[gy][gx].elev;
        const nextElev = Math.min(6, Math.floor(curElev) + 1);
        next.tileGrid[gy][gx] = { elev: nextElev, style };
      }
    }
    const uniformErr = validateMultiTileUniformTerrain(next);
    if (uniformErr) return { next: prev, error: uniformErr };
    return { next };
  }

  if (effectiveTool === 'terrain_lower') {
    next.stairs = next.stairs.filter((s) => !rectsOverlap(s.gx, s.gy, s.gw ?? 1, s.gh ?? 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const cur = next.tileGrid[gy][gx];
        if (cur.elev >= 1.0) {
          const nextElev = Math.max(0, Math.floor(cur.elev) - 1);
          next.tileGrid[gy][gx] = {
            elev: nextElev,
            style: nextElev === 0 ? 'default' : cur.style,
          };
        } else {
          next.tileGrid[gy][gx] = { elev: 0, style: 'default' };
        }
      }
    }
    const uniformErr = validateMultiTileUniformTerrain(next);
    if (uniformErr) return { next: prev, error: uniformErr };
    return { next };
  }

  if (effectiveTool === 'terrain_hill_stair' || effectiveTool === 'terrain_stone_stair') {
    next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    next.stairs = next.stairs.filter((s) => !rectsOverlap(s.gx, s.gy, s.gw ?? 1, s.gh ?? 1, minX, minY, rw, rh));
    const stairStyle: PlatformStyle =
      effectiveTool === 'terrain_hill_stair'
        ? 'hill'
        : next.biome === 'castle_indoor'
          ? 'castle_dais'
          : 'pyramid';
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.stairs.push({
          gx,
          gy,
          gw: 1,
          gh: 1,
          direction: ctxOpts.stairDir,
          style: stairStyle,
        });
      }
    }
    return { next };
  }

  // Object tools
  if (effectiveTool === 'obj_erase') {
    removeObjectsInRect(minX, minY, rw, rh, true);
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (next.tileGrid[gy][gx].style === 'rail_track') {
          next.tileGrid[gy][gx] = { ...next.tileGrid[gy][gx], style: 'default' };
        }
      }
    }
    return { next };
  }

  // 水域河道（物件層，不覆蓋底層地板也不吃掉下方地形高台）
  if (effectiveTool === 'obj_water') {
    const existingWater = new Set(next.waterTiles.map((w) => `${w.gx},${w.gy}`));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (!existingWater.has(`${gx},${gy}`)) {
          next.waterTiles.push({ gx, gy });
          existingWater.add(`${gx},${gy}`);
        }
      }
    }
    next.obstacles = next.obstacles.filter((o) => !rectsOverlap(o.gx, o.gy, o.gw, o.gh, minX, minY, rw, rh));
    next.stairs = next.stairs.filter((s) => !rectsOverlap(s.gx, s.gy, s.gw ?? 1, s.gh ?? 1, minX, minY, rw, rh));
    next.bushes = next.bushes.filter((b) => !rectsOverlap(b.gx, b.gy, 1, 1, minX, minY, rw, rh));
    next.trees = next.trees.filter((t) => !rectsOverlap(t.gx, t.gy, 1, 1, minX, minY, rw, rh));
    next.stoneRoads = next.stoneRoads.filter((r) => !rectsOverlap(r.gx, r.gy, 1, 1, minX, minY, rw, rh));
    next.railTracks = next.railTracks.filter((r) => !rectsOverlap(r.gx, r.gy, 1, 1, minX, minY, rw, rh));
    return { next };
  }

  if (effectiveTool === 'obj_stone_road') {
    next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    const roadSet = new Set(next.stoneRoads.map((r) => `${r.gx},${r.gy}`));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (!roadSet.has(`${gx},${gy}`)) {
          next.stoneRoads.push({ gx, gy });
          roadSet.add(`${gx},${gy}`);
        }
      }
    }
    return { next };
  }

  if (effectiveTool === 'obj_rail') {
    next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    next.railTracks = next.railTracks.filter((r) => !rectsOverlap(r.gx, r.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (next.tileGrid[gy][gx].style === 'rail_track') {
          next.tileGrid[gy][gx] = { ...next.tileGrid[gy][gx], style: 'default' };
        }
        next.railTracks.push({ gx, gy, orientation: ctxOpts.railOrientation });
      }
    }
    return { next };
  }

  if (effectiveTool === 'obj_bridge') {
    const fp = rw === 1 && rh === 1 ? getFootprintForTool('obj_bridge', ctxOpts) : { gw: rw, gh: rh };
    const bx = rw === 1 && rh === 1 ? clamp(minX, 0, Math.max(0, next.cols - fp.gw)) : minX;
    const by = rw === 1 && rh === 1 ? clamp(minY, 0, Math.max(0, next.rows - fp.gh)) : minY;
    if ((fp.gw > 1 || fp.gh > 1) && !hasUniformCellElevation(next.tileGrid, bx, by, fp.gw, fp.gh)) {
      return { next: prev, error: '跨格木橋所佔格位的底層地形高度必須完全一致' };
    }
    removeObjectsInRect(bx, by, fp.gw, fp.gh, false);
    next.bridges.push({
      gx: bx,
      gy: by,
      gw: fp.gw,
      gh: fp.gh,
      orientation:
        rw === 1 && rh === 1
          ? ctxOpts.rotated
            ? 'vertical'
            : 'horizontal'
          : rh > rw
            ? 'vertical'
            : rw > rh
              ? 'horizontal'
              : ctxOpts.rotated
                ? 'vertical'
                : 'horizontal',
    });
    return { next };
  }

  if (effectiveTool === 'obj_stair_crate') {
    removeObjectsInRect(minX, minY, rw, rh, false);
    next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.stairs.push({ gx, gy, gw: 1, gh: 1, direction: ctxOpts.stairDir, style: 'default' });
      }
    }
    return { next };
  }

  if (effectiveTool === 'obj_bush') {
    removeObjectsInRect(minX, minY, rw, rh, false);
    next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.bushes.push({ gx, gy });
      }
    }
    return { next };
  }

  if (effectiveTool === 'obj_tree') {
    removeObjectsInRect(minX, minY, rw, rh, false);
    removeSpawnsInRect(minX, minY, rw, rh);
    next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.trees.push({ gx, gy, canopyRadius: 44 });
      }
    }
    return { next };
  }

  const obstacleSpecs: Partial<
    Record<
      ToolId,
      {
        gw: number;
        gh: number;
        elevation: number;
        kind: 'crate' | 'wall';
        style: ObstacleStyle;
        colorVariant?: string;
        direction?: CompassDir;
      }
    >
  > = {
    obj_small_crate: { gw: 1, gh: 1, elevation: 1.0, kind: 'crate', style: 'small_crate' },
    obj_big_crate: { gw: 2, gh: 2, elevation: 1.5, kind: 'crate', style: 'default' },
    obj_container: {
      gw: ctxOpts.rotated ? 2 : 4,
      gh: ctxOpts.rotated ? 4 : 2,
      elevation: 2.0,
      kind: 'crate',
      style: 'container',
      colorVariant: ctxOpts.containerColor,
    },
    obj_train_car: {
      gw: ctxOpts.rotated ? 2 : 4,
      gh: ctxOpts.rotated ? 4 : 2,
      elevation: 2.0,
      kind: 'crate',
      style: 'train_car',
      colorVariant: ctxOpts.trainVariant,
    },
    obj_stone_wall_tan: { gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'stone_wall_tan' },
    obj_stone_wall_green: { gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'stone_wall_green' },
    obj_shrine_wall: { gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'shrine_wall' },
    obj_castle_pillar: { gw: 1, gh: 1, elevation: 10, kind: 'wall', style: 'castle_pillar' },
    obj_house: {
      gw: ctxOpts.houseDir === 'east' || ctxOpts.houseDir === 'west' ? 2 : 3,
      gh: ctxOpts.houseDir === 'east' || ctxOpts.houseDir === 'west' ? 3 : 2,
      elevation: 10,
      kind: 'wall',
      style: 'house',
      direction: ctxOpts.houseDir,
    },
    obj_bamboo: {
      gw: 1,
      gh: 1,
      elevation: 10,
      kind: 'wall',
      style: 'bamboo',
      direction: ctxOpts.bambooDir,
    },
  };

  const spec = obstacleSpecs[effectiveTool];
  if (spec) {
    const isMultiTile = spec.gw > 1 || spec.gh > 1;
    let placedAny = false;
    let blockedByUneven = false;

    const tryPlaceObstacleAt = (gx: number, gy: number) => {
      const ox = clamp(gx, 0, Math.max(0, next.cols - spec.gw));
      const oy = clamp(gy, 0, Math.max(0, next.rows - spec.gh));
      if (isMultiTile && !hasUniformCellElevation(next.tileGrid, ox, oy, spec.gw, spec.gh)) {
        blockedByUneven = true;
        return;
      }
      removeObjectsInRect(ox, oy, spec.gw, spec.gh, false);
      if (spec.kind === 'wall') removeSpawnsInRect(ox, oy, spec.gw, spec.gh);
      next.waterTiles = next.waterTiles.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, ox, oy, spec.gw, spec.gh));
      next.obstacles.push({
        gx: ox,
        gy: oy,
        gw: spec.gw,
        gh: spec.gh,
        elevation: spec.elevation,
        kind: spec.kind,
        style: spec.style,
        colorVariant: spec.colorVariant,
        direction: spec.direction,
      });
      placedAny = true;
    };

    if (rw === 1 && rh === 1) {
      tryPlaceObstacleAt(minX, minY);
    } else {
      for (let gy = minY; gy <= maxY; gy += spec.gh) {
        for (let gx = minX; gx <= maxX; gx += spec.gw) {
          tryPlaceObstacleAt(gx, gy);
        }
      }
    }

    if (!placedAny && blockedByUneven) {
      return {
        next: prev,
        error: `多格物件 (${spec.gw}×${spec.gh}) 無法跨越不同地形高度，所跨格位底層高度必須一致`,
      };
    }
    return {
      next,
      error: blockedByUneven ? '部分跨格位置底層高度不一致已略過，僅放置於等高區域' : undefined,
    };
  }

  // Spawn & weapon/supply tools
  if (effectiveTool === 'spawn_erase') {
    removeSpawnsInRect(minX, minY, rw, rh);
    return { next };
  }

  if (effectiveTool === 'spawn_royal' || effectiveTool === 'spawn_shadow' || effectiveTool === 'spawn_mercenary') {
    const fac: FactionId =
      effectiveTool === 'spawn_royal' ? 'royal' : effectiveTool === 'spawn_shadow' ? 'shadow' : 'mercenary';
    removeSpawnsInRect(minX, minY, rw, rh);
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.factionSpawns[fac].push({ gx, gy });
      }
    }
    return { next };
  }

  if (effectiveTool === 'spawn_weapon') {
    next.weaponSpawns = next.weaponSpawns.filter((w) => !rectsOverlap(w.gx, w.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.weaponSpawns.push({
          gx,
          gy,
          kind: ctxOpts.selectedWeapon.kind,
          weaponId: ctxOpts.selectedWeapon.weaponId,
        });
      }
    }
    return { next };
  }

  if (effectiveTool === 'spawn_ammo') {
    next.ammoSpawns = next.ammoSpawns.filter((a) => !rectsOverlap(a.gx, a.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.ammoSpawns.push({ gx, gy });
      }
    }
    return { next };
  }

  if (effectiveTool === 'spawn_shield') {
    next.shieldSpawns = next.shieldSpawns.filter((s) => !rectsOverlap(s.gx, s.gy, 1, 1, minX, minY, rw, rh));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        next.shieldSpawns.push({ gx, gy });
      }
    }
    return { next };
  }

  return { next };
}

export const MapEditorView: React.FC<MapEditorViewProps> = ({
  savedMaps,
  onSaveMap,
  onDeleteMap,
  onPlayCustomMap,
  onBackToLobby,
}) => {
  // 預設開啟全新空白地圖，尺寸可自由調整
  const [draft, setDraft] = useState<CustomMapData>(() => createBlankCustomMap());
  const [colsInput, setColsInput] = useState(() => String(30));
  const [rowsInput, setRowsInput] = useState(() => String(22));
  const [history, setHistory] = useState<CustomMapData[]>([]);
  const [redoStack, setRedoStack] = useState<CustomMapData[]>([]);
  const [activeTab, setActiveTab] = useState<EditorTab>('floor');
  const [tool, setTool] = useState<ToolId>('floor_shrine_dirt');
  const [stairDir, setStairDir] = useState<CompassDir>('east');
  const [bambooDir, setBambooDir] = useState<CompassDir>('north');
  const [houseDir, setHouseDir] = useState<CompassDir>('south');
  const [railOrientation, setRailOrientation] = useState<RailAxis>('horizontal');
  const [rotated, setRotated] = useState(false); // false = horizontal (4×2 / 3×2), true = vertical (2×4 / 2×3)
  const [containerColor, setContainerColor] = useState('#0284C7');
  const [trainVariant, setTrainVariant] = useState('loco');
  const [selectedWeapon, setSelectedWeapon] = useState<{ kind: 'gun' | 'melee'; weaponId: string }>({
    kind: 'gun',
    weaponId: PLACEABLE_WEAPONS[0].weaponId,
  });
  const [showGrid, setShowGrid] = useState(true);
  const [showElevTags, setShowElevTags] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null);
  const [dragRect, setDragRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    mode: 'paint' | 'erase';
  } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' | 'err' } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRectRef = useRef<typeof dragRect>(null);

  const arena = useMemo(() => buildArenaMapFromCustom(draft), [draft]);
  const validation = useMemo(() => validateCustomMap(draft), [draft]);

  const applyContext = useMemo<ApplyContext>(
    () => ({
      activeTab,
      tool,
      stairDir,
      bambooDir,
      houseDir,
      railOrientation,
      rotated,
      containerColor,
      trainVariant,
      selectedWeapon,
    }),
    [activeTab, tool, stairDir, bambooDir, houseDir, railOrientation, rotated, containerColor, trainVariant, selectedWeapon]
  );
  const applyContextRef = useRef(applyContext);
  applyContextRef.current = applyContext;

  const notify = useCallback((text: string, tone: 'ok' | 'warn' | 'err' = 'ok') => {
    setToast({ text, tone });
  }, []);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    setColsInput(String(draft.cols));
    setRowsInput(String(draft.rows));
  }, [draft.cols, draft.rows]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const commitDraftWithHistory = useCallback((nextMap: CustomMapData, prevSnapshot?: CustomMapData) => {
    setDraft((cur) => {
      const base = prevSnapshot ?? cur;
      setHistory((h) => [...h.slice(-29), base]);
      setRedoStack([]);
      return nextMap;
    });
  }, []);

  const commitSizeChange = useCallback(
    (rawCols = colsInput, rawRows = rowsInput) => {
      const parsedCols = Number.parseInt(rawCols, 10);
      const parsedRows = Number.parseInt(rawRows, 10);
      const nextCols = clamp(Number.isFinite(parsedCols) ? parsedCols : draft.cols, 12, 60);
      const nextRows = clamp(Number.isFinite(parsedRows) ? parsedRows : draft.rows, 12, 60);
      setColsInput(String(nextCols));
      setRowsInput(String(nextRows));
      if (nextCols !== draft.cols || nextRows !== draft.rows) {
        commitDraftWithHistory(resizeCustomMap(draft, nextCols, nextRows));
        notify(`已調整地圖尺寸為 ${nextCols} × ${nextRows} 格`);
      }
    },
    [colsInput, rowsInput, draft, commitDraftWithHistory, notify]
  );

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setRedoStack((r) => [...r, draft]);
      setDraft(prev);
      return h.slice(0, -1);
    });
  }, [draft]);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const nxt = r[r.length - 1];
      setHistory((h) => [...h, draft]);
      setDraft(nxt);
      return r.slice(0, -1);
    });
  }, [draft]);

  const handleRotate = useCallback(() => {
    if (tool === 'terrain_hill_stair' || tool === 'terrain_stone_stair' || tool === 'obj_stair_crate') {
      setStairDir((d) => {
        const next = COMPASS_ORDER[(COMPASS_ORDER.indexOf(d) + 1) % COMPASS_ORDER.length];
        notify(`階梯方向已旋轉為：${DIR_LABELS[next]}`);
        return next;
      });
    } else if (tool === 'obj_bamboo') {
      setBambooDir((d) => {
        const next = COMPASS_ORDER[(COMPASS_ORDER.indexOf(d) + 1) % COMPASS_ORDER.length];
        notify(`竹林配置已旋轉為：${BAMBOO_DIR_LABELS[next]}`);
        return next;
      });
    } else if (tool === 'obj_house') {
      setHouseDir((d) => {
        const next = COMPASS_ORDER[(COMPASS_ORDER.indexOf(d) + 1) % COMPASS_ORDER.length];
        notify(`房屋朝向：${HOUSE_DIR_LABELS[next]}`);
        return next;
      });
    } else if (tool === 'obj_rail') {
      setRailOrientation((o) => {
        const next: RailAxis = o === 'horizontal' ? 'vertical' : 'horizontal';
        notify(`鐵道路軌方向：${next === 'horizontal' ? '水平 (左右)' : '垂直 (上下)'}`);
        return next;
      });
    } else {
      const activeMeta = TOOL_CATALOG.find((t) => t.id === tool);
      if (activeMeta?.rotatable) {
        setRotated((r) => {
          const next = !r;
          notify(`物件方向：${next ? '直向' : '橫向'}`);
          return next;
        });
      } else {
        setStairDir((d) => COMPASS_ORDER[(COMPASS_ORDER.indexOf(d) + 1) % COMPASS_ORDER.length]);
      }
    }
  }, [tool, notify]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleRotate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleRotate]);

  const commitDragRectangle = useCallback((rect: NonNullable<typeof dragRect>) => {
    setDraft((prev) => {
      const { next, error } = applyToolToRect(
        prev,
        rect.startX,
        rect.startY,
        rect.endX,
        rect.endY,
        rect.mode === 'erase',
        applyContextRef.current
      );
      if (error) {
        notifyRef.current(error, next === prev ? 'err' : 'warn');
      }
      if (next === prev) return prev;
      setHistory((h) => [...h.slice(-29), prev]);
      setRedoStack([]);
      return next;
    });
  }, []);

  // Global mouseup ensures drag rectangle finalizes even if pointer leaves canvas
  useEffect(() => {
    const onWindowMouseUp = () => {
      const activeDrag = dragRectRef.current;
      if (!activeDrag) return;
      dragRectRef.current = null;
      setDragRect(null);
      commitDragRectangle(activeDrag);
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, [commitDragRectangle]);

  // Render main editor canvas + WYSIWYG Ghost Preview (hover & drag rectangle)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = arena.width;
    canvas.height = arena.height;

    ctx.clearRect(0, 0, arena.width, arena.height);
    renderMapBaseLayer(ctx, arena, true);
    renderMapCanopies(ctx, arena);

    for (const pk of buildEditorPickups(arena)) {
      drawPickup(ctx, pk);
    }

    // Real WYSIWYG ghost preview before mouse release (hover footprint OR dragged rectangle)
    const activePreviewRange = dragRect
      ? {
          minX: clamp(Math.min(dragRect.startX, dragRect.endX), 0, arena.cols - 1),
          maxX: clamp(Math.max(dragRect.startX, dragRect.endX), 0, arena.cols - 1),
          minY: clamp(Math.min(dragRect.startY, dragRect.endY), 0, arena.rows - 1),
          maxY: clamp(Math.max(dragRect.startY, dragRect.endY), 0, arena.rows - 1),
          erase: dragRect.mode === 'erase',
        }
      : hoverCell
        ? {
            minX: hoverCell.gx,
            maxX: hoverCell.gx,
            minY: hoverCell.gy,
            maxY: hoverCell.gy,
            erase: false,
          }
        : null;

    if (activePreviewRange) {
      const effectiveTool = getEffectiveTool(applyContext, activePreviewRange.erase);
      const isSingleCellHover =
        activePreviewRange.minX === activePreviewRange.maxX && activePreviewRange.minY === activePreviewRange.maxY;
      const fp = getFootprintForTool(effectiveTool, applyContext);
      const rx0 = isSingleCellHover
        ? clamp(activePreviewRange.minX, 0, Math.max(0, arena.cols - fp.gw))
        : activePreviewRange.minX;
      const ry0 = isSingleCellHover
        ? clamp(activePreviewRange.minY, 0, Math.max(0, arena.rows - fp.gh))
        : activePreviewRange.minY;
      const rw = isSingleCellHover ? fp.gw : activePreviewRange.maxX - activePreviewRange.minX + 1;
      const rh = isSingleCellHover ? fp.gh : activePreviewRange.maxY - activePreviewRange.minY + 1;

      const { next: previewDraft, error: previewError } = applyToolToRect(
        draft,
        activePreviewRange.minX,
        activePreviewRange.minY,
        activePreviewRange.maxX,
        activePreviewRange.maxY,
        activePreviewRange.erase,
        applyContext
      );
      const previewRejected = Boolean(previewError && previewDraft === draft);

      if (!previewRejected) {
        const previewArena = buildArenaMapFromCustom(previewDraft);
        if (!previewOffscreenRef.current) {
          previewOffscreenRef.current = document.createElement('canvas');
        }
        const off = previewOffscreenRef.current;
        off.width = arena.width;
        off.height = arena.height;
        const octx = off.getContext('2d');
        if (octx) {
          const clipX = Math.max(0, rx0 * TILE - TILE * 0.65);
          const clipY = Math.max(0, ry0 * TILE - TILE * 0.65);
          const clipW = Math.min(arena.width - clipX, (rw + 1.3) * TILE);
          const clipH = Math.min(arena.height - clipY, (rh + 1.3) * TILE);

          octx.clearRect(0, 0, off.width, off.height);
          octx.save();
          octx.beginPath();
          octx.rect(clipX, clipY, clipW, clipH);
          octx.clip();
          renderMapBaseLayer(octx, previewArena, true);
          renderMapCanopies(octx, previewArena);
          for (const pk of buildEditorPickups(previewArena)) {
            if (pk.x >= clipX && pk.x <= clipX + clipW && pk.y >= clipY && pk.y <= clipY + clipH) {
              drawPickup(octx, pk);
            }
          }
          octx.restore();

          ctx.save();
          ctx.globalAlpha = 0.78;
          ctx.drawImage(off, clipX, clipY, clipW, clipH, clipX, clipY, clipW, clipH);
          ctx.restore();
        }
      }

      const isEraseVisual =
        previewRejected ||
        activePreviewRange.erase ||
        effectiveTool === 'obj_erase' ||
        effectiveTool === 'spawn_erase' ||
        effectiveTool === 'terrain_lower' ||
        effectiveTool === 'floor_reset';

      ctx.save();
      ctx.fillStyle = isEraseVisual ? 'rgba(244, 63, 94, 0.22)' : 'rgba(245, 158, 11, 0.12)';
      ctx.strokeStyle = isEraseVisual ? '#FB7185' : '#FBBF24';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(rx0 * TILE + 1, ry0 * TILE + 1, rw * TILE - 2, rh * TILE - 2);
      ctx.strokeRect(rx0 * TILE + 1, ry0 * TILE + 1, rw * TILE - 2, rh * TILE - 2);
      ctx.setLineDash([]);

      // Live dimension / error badge
      if (previewRejected || rw > 1 || rh > 1) {
        const badgeText = previewRejected ? '底層高度不一致' : `${rw}×${rh} 格`;
        ctx.font = '700 11px "JetBrains Mono", monospace';
        const tw = ctx.measureText(badgeText).width + 12;
        const bx = Math.min(arena.width - tw - 4, rx0 * TILE + 4);
        const by = Math.max(4, ry0 * TILE - 20);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(bx, by, tw, 17);
        ctx.fillStyle = isEraseVisual ? '#FDA4AF' : '#FCD34D';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + 6, by + 9);
      }
      ctx.restore();
    }

    // Optional grid lines
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1;
      for (let gx = 1; gx < arena.cols; gx++) {
        ctx.beginPath();
        ctx.moveTo(gx * TILE, 0);
        ctx.lineTo(gx * TILE, arena.height);
        ctx.stroke();
      }
      for (let gy = 1; gy < arena.rows; gy++) {
        ctx.beginPath();
        ctx.moveTo(0, gy * TILE);
        ctx.lineTo(arena.width, gy * TILE);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Optional elevation / stair / stacked crate badges
    if (showElevTags) {
      ctx.save();
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let gy = 0; gy < arena.rows; gy++) {
        for (let gx = 0; gx < arena.cols; gx++) {
          const elev = arena.tileGrid[gy][gx].elev;
          if (elev >= 1.0) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
            ctx.fillRect(gx * TILE + 3, gy * TILE + 3, 22, 13);
            ctx.fillStyle = '#FCD34D';
            ctx.fillText(`+${elev}`, gx * TILE + 14, gy * TILE + 10);
          }
        }
      }
      for (const obs of arena.obstacles) {
        if (obs.kind === 'crate') {
          const ogx = clamp(Math.floor(obs.x / TILE), 0, arena.cols - 1);
          const ogy = clamp(Math.floor(obs.y / TILE), 0, arena.rows - 1);
          const baseElev = arena.tileGrid[ogy][ogx].elev;
          if (baseElev >= 1.0) {
            const cx = obs.x + obs.w / 2;
            const cy = obs.y + obs.h / 2;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(cx - 15, cy - 8, 30, 16);
            ctx.fillStyle = '#34D399';
            ctx.fillText(`${obs.elevation}`, cx, cy + 0.5);
          }
        }
      }
      const arrowByDir: Record<CompassDir, string> = { north: '↑', east: '→', south: '↓', west: '←' };
      for (const st of arena.stairs) {
        const cx = st.x + st.w / 2;
        const cy = st.y + st.h / 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(cx - 19, cy - 8, 38, 16);
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`${st.elevation}${arrowByDir[st.direction]}`, cx, cy + 0.5);
      }
      ctx.restore();
    }
  }, [arena, draft, showGrid, showElevTags, hoverCell, dragRect, applyContext]);

  const pointerToCell = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = arena.width / rect.width;
    const scaleY = arena.height / rect.height;
    const wx = (e.clientX - rect.left) * scaleX;
    const wy = (e.clientY - rect.top) * scaleY;
    const gx = clamp(Math.floor(wx / TILE), 0, arena.cols - 1);
    const gy = clamp(Math.floor(wy / TILE), 0, arena.rows - 1);
    return { gx, gy };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cell = pointerToCell(e);
    if (!cell) return;
    const nextDrag = {
      startX: cell.gx,
      startY: cell.gy,
      endX: cell.gx,
      endY: cell.gy,
      mode: (e.button === 2 ? 'erase' : 'paint') as 'paint' | 'erase',
    };
    dragRectRef.current = nextDrag;
    setDragRect(nextDrag);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = pointerToCell(e);
    setHoverCell(cell);
    if (!cell || !dragRectRef.current) return;
    if (dragRectRef.current.endX === cell.gx && dragRectRef.current.endY === cell.gy) return;
    const updated = { ...dragRectRef.current, endX: cell.gx, endY: cell.gy };
    dragRectRef.current = updated;
    setDragRect(updated);
  };

  const handleSave = () => {
    if (!validation.valid) {
      notify(validation.errors[0] || '請確保三個陣營皆有出生點且所有出生點路徑相通後再儲存', 'err');
      return;
    }
    const cleaned: CustomMapData = {
      ...draft,
      name: draft.name.trim() || '未命名自訂戰場',
      updatedAt: Date.now(),
    };
    setDraft(cleaned);
    onSaveMap(cleaned);
    notify(`已儲存自訂地圖「${cleaned.name}」`);
  };

  const handleSaveAndPlay = () => {
    if (!validation.valid) {
      notify(validation.errors[0] || '請確保三個陣營皆有出生點且所有出生點路徑相通再出戰', 'err');
      return;
    }
    const cleaned: CustomMapData = {
      ...draft,
      name: draft.name.trim() || '未命名自訂戰場',
      updatedAt: Date.now(),
    };
    setDraft(cleaned);
    onSaveMap(cleaned);
    onPlayCustomMap(cleaned);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(draft.name.trim() || 'custom_map').replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('已匯出 JSON 地圖檔');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CustomMapData;
        if (!parsed || !Array.isArray(parsed.tileGrid) || !parsed.cols || !parsed.rows) {
          notify('JSON 格式無效，請匯入光暈戰記自訂地圖檔', 'err');
          return;
        }
        const imported: CustomMapData = {
          ...parsed,
          stoneRoads: Array.isArray(parsed.stoneRoads) ? parsed.stoneRoads : [],
          railTracks: Array.isArray(parsed.railTracks) ? parsed.railTracks : [],
          id: createCustomMapId(),
          updatedAt: Date.now(),
        };
        commitDraftWithHistory(imported);
        notify(`已匯入地圖「${imported.name}」`);
      } catch {
        notify('讀取地圖 JSON 失敗', 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const currentTabTools = useMemo(() => TOOL_CATALOG.filter((t) => t.tab === activeTab), [activeTab]);
  const activeToolMeta = TOOL_CATALOG.find((t) => t.id === tool);
  const selectedWeaponLabel =
    PLACEABLE_WEAPONS.find((w) => w.weaponId === selectedWeapon.weaponId)?.label || '武器點';
  const activeFloorStyle = FLOOR_TOOL_STYLE_MAP[tool];

  const handleFillEntireFloor = () => {
    if (!activeFloorStyle) return;
    const next = cloneCustomMap(draft);
    next.biome = floorStyleToBiome(activeFloorStyle);
    next.floorGrid = createFloorGrid(next.cols, next.rows, activeFloorStyle);
    next.updatedAt = Date.now();
    commitDraftWithHistory(next);
    notify(`已將全圖底層地板鋪滿「${activeToolMeta?.label || ''}」`);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0F17] text-slate-100 select-none">
      {/* TOP BAR */}
      <header className="shrink-0 bg-[#0B0F17] border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onBackToLobby}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回大廳
          </button>

          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="輸入地圖名稱"
            maxLength={28}
            className="w-40 sm:w-48 bg-slate-900 border border-slate-700 focus:border-amber-400 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs font-bold text-white"
          />

          {/* 自由調整地圖寬 × 高格數 */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <span className="text-slate-400">寬</span>
            <input
              type="number"
              min={12}
              max={60}
              aria-label="地圖寬度格數"
              value={colsInput}
              onChange={(e) => setColsInput(e.target.value)}
              onBlur={() => commitSizeChange()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSizeChange();
              }}
              className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono-num text-white focus:border-amber-400 focus:outline-none"
            />
            <span className="text-slate-500">×</span>
            <span className="text-slate-400">高</span>
            <input
              type="number"
              min={12}
              max={60}
              aria-label="地圖高度格數"
              value={rowsInput}
              onChange={(e) => setRowsInput(e.target.value)}
              onBlur={() => commitSizeChange()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSizeChange();
              }}
              className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono-num text-white focus:border-amber-400 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400 mr-0.5">格</span>
            <button
              type="button"
              onClick={() => commitSizeChange()}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-sky-300 font-semibold cursor-pointer"
            >
              套用
            </button>
          </div>

          <select
            value=""
            onChange={(e) => {
              const mapId = e.target.value as MapId;
              if (!mapId) return;
              const builtIn = createArenaMap(mapId);
              commitDraftWithHistory(arenaMapToCustomData(builtIn));
              notify(`已複製「${builtIn.name}」為編輯底稿`);
            }}
            aria-label="從現有戰場複製"
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-sky-300 cursor-pointer"
          >
            <option value="">複製現有戰場...</option>
            {MAP_CATALOG.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {savedMaps.length > 0 && (
            <select
              value={savedMaps.some((m) => m.id === draft.id) ? draft.id : ''}
              onChange={(e) => {
                const found = savedMaps.find((m) => m.id === e.target.value);
                if (found) {
                  setDraft(cloneCustomMap(found));
                  setHistory([]);
                  setRedoStack([]);
                  notify(`已載入「${found.name}」`);
                }
              }}
              aria-label="切換已存自訂地圖"
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-amber-300 max-w-[140px] cursor-pointer"
            >
              <option value="">已存地圖 ({savedMaps.length})</option>
              {savedMaps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => {
              commitDraftWithHistory(createBlankCustomMap(`自訂戰場 ${savedMaps.length + 1}`, draft.biome, draft.cols, draft.rows));
              notify('已建立全新空白戰場');
            }}
            title="新增空白地圖"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
          </button>

          {savedMaps.some((m) => m.id === draft.id) && (
            <button
              type="button"
              onClick={() => {
                const targetId = draft.id;
                const remaining = savedMaps.filter((m) => m.id !== targetId);
                onDeleteMap(targetId);
                setDraft(remaining.length > 0 ? cloneCustomMap(remaining[0]) : createBlankCustomMap());
                setHistory([]);
                setRedoStack([]);
                notify('已刪除自訂地圖', 'warn');
              }}
              title="刪除當前已存地圖"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/70 border border-slate-700 hover:border-rose-500/60 text-rose-300 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="復原 (Ctrl+Z)"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-35 border border-slate-700 text-slate-200 cursor-pointer disabled:cursor-default"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="重做 (Ctrl+Y)"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-35 border border-slate-700 text-slate-200 cursor-pointer disabled:cursor-default"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="匯入 JSON"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportJson} className="hidden" />

          <button
            type="button"
            onClick={handleExportJson}
            title="匯出 JSON"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            儲存
          </button>

          <button
            type="button"
            onClick={handleSaveAndPlay}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer whitespace-nowrap shadow-lg shadow-amber-500/20"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            儲存並出戰
          </button>
        </div>
      </header>

      {/* BODY: LEFT CANVAS + RIGHT SIDEBAR */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* CENTER MAP CANVAS VIEWPORT */}
        <div className="flex-1 min-w-0 relative bg-[#070B12] flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto flex p-6">
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoverCell(null)}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                width: `${Math.round(arena.width * zoom)}px`,
                height: `${Math.round(arena.height * zoom)}px`,
              }}
              className="m-auto shrink-0 rounded-lg shadow-2xl border border-slate-800 cursor-crosshair block"
            />
          </div>

          {/* Floating Canvas Controls (Bottom-Left) */}
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
            <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-950/92 border border-slate-700/85 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 shadow-lg">
              <button
                type="button"
                onClick={() => setZoom((z) => clamp(Number((z - 0.15).toFixed(2)), 0.4, 1.6))}
                aria-label="縮小畫布"
                className="p-1 rounded hover:bg-slate-800 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono-num font-bold min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => clamp(Number((z + 0.15).toFixed(2)), 0.4, 1.6))}
                aria-label="放大畫布"
                className="p-1 rounded hover:bg-slate-800 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <span className="text-slate-700">|</span>
              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer ${
                  showGrid ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Grid className="w-3 h-3" />
                格線
              </button>
              <button
                type="button"
                onClick={() => setShowElevTags((v) => !v)}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  showElevTags ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                高度標記
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-100 cursor-pointer"
              >
                <RotateCw className="w-3 h-3 text-amber-400" />
                旋轉 (R)
              </button>
            </div>

            <div className="bg-slate-950/88 border border-slate-800 rounded-lg px-3 py-1 text-[11px] text-slate-300 font-mono-num">
              {dragRect
                ? `矩形選取 (${Math.min(dragRect.startX, dragRect.endX)}, ${Math.min(dragRect.startY, dragRect.endY)}) → (${Math.max(dragRect.startX, dragRect.endX)}, ${Math.max(dragRect.startY, dragRect.endY)})`
                : hoverCell
                  ? `(${hoverCell.gx}, ${hoverCell.gy}) · 地形高度 ${arena.tileGrid[hoverCell.gy]?.[hoverCell.gx]?.elev ?? 0}`
                  : '按住左鍵拖曳矩形佈置 · 右鍵拖曳矩形清除 · R 旋轉方向'}
            </div>
          </div>

          {/* Inline Toast */}
          {toast && (
            <div
              className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg border text-xs font-bold shadow-xl ${
                toast.tone === 'err'
                  ? 'bg-rose-950/95 border-rose-500 text-rose-200'
                  : toast.tone === 'warn'
                    ? 'bg-amber-950/95 border-amber-500 text-amber-200'
                    : 'bg-slate-950/95 border-sky-400/70 text-sky-200'
              }`}
            >
              {toast.text}
            </div>
          )}
        </div>

        {/* RIGHT-SIDE SIDEBAR (FLOOR / TERRAIN / OBJECTS / SPAWNS + VALIDATION) */}
        <aside className="w-80 xl:w-96 shrink-0 border-l border-slate-800 bg-[#0F1624] flex flex-col min-h-0">
          {/* Sidebar Tabs */}
          <div className="shrink-0 p-2 border-b border-slate-800 grid grid-cols-4 gap-1 bg-slate-950/60">
            <button
              type="button"
              onClick={() => {
                setActiveTab('floor');
                setTool('floor_shrine_dirt');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                activeTab === 'floor' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              地板
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('terrain');
                setTool('terrain_hill_raise');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                activeTab === 'terrain' ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              地形
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('objects');
                setTool('obj_small_crate');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                activeTab === 'objects' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              物件
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('spawns');
                setTool('spawn_royal');
              }}
              className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                activeTab === 'spawns' ? 'bg-rose-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              出生物資
            </button>
          </div>

          {/* Contextual Options Bar */}
          <div className="shrink-0 px-3 py-2 border-b border-slate-800/80 bg-slate-900/55 space-y-2 text-[11px]">
            <div className="flex items-center justify-between text-slate-300">
              <span>
                已選：
                {tool === 'spawn_weapon'
                  ? `武器點（${selectedWeaponLabel}）`
                  : tool === 'spawn_shield'
                    ? '防彈盾牌'
                    : tool === 'spawn_ammo'
                      ? '彈藥箱'
                      : activeToolMeta?.label}
              </span>
              <span className="font-mono-num text-amber-300">
                {tool === 'spawn_weapon' || tool === 'spawn_shield' || tool === 'spawn_ammo'
                  ? '地面補給'
                  : activeToolMeta?.heightLabel}
              </span>
            </div>

            {activeFloorStyle && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">單格或拖曳矩形即可與其他地板混搭</span>
                <button
                  type="button"
                  onClick={handleFillEntireFloor}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <PaintBucket className="w-3 h-3" />
                  鋪滿全圖
                </button>
              </div>
            )}

            {(tool === 'terrain_hill_raise' || tool === 'terrain_stone_raise' || tool === 'terrain_plank_raise') && (
              <div className="text-slate-400">
                點擊或拉框疊加：自動依該格既有地形高度 <span className="text-amber-300 font-mono-num font-bold">+1.0</span> 層（保留底層地板與水面）
              </div>
            )}

            {(tool === 'terrain_hill_stair' || tool === 'terrain_stone_stair' || tool === 'obj_stair_crate') && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-slate-400 mr-1">上坡方向 (R)：</span>
                {COMPASS_ORDER.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setStairDir(dir)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      stairDir === dir ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {DIR_LABELS[dir]}
                  </button>
                ))}
              </div>
            )}

            {tool === 'obj_bamboo' && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-slate-400 mr-1">竹群排列 (R)：</span>
                {COMPASS_ORDER.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setBambooDir(dir)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      bambooDir === dir ? 'bg-emerald-400 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {BAMBOO_DIR_LABELS[dir]}
                  </button>
                ))}
              </div>
            )}

            {tool === 'obj_house' && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-slate-400 mr-1">房屋門向 (R)：</span>
                {COMPASS_ORDER.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setHouseDir(dir)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      houseDir === dir ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {HOUSE_DIR_LABELS[dir]}
                  </button>
                ))}
              </div>
            )}

            {tool === 'obj_rail' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  路軌方向 (R)：{railOrientation === 'horizontal' ? '水平 (左右)' : '垂直 (上下)'}
                </span>
                <button
                  type="button"
                  onClick={() => setRailOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  切換直/橫 (自動轉角分叉)
                </button>
              </div>
            )}

            {activeToolMeta?.rotatable &&
              tool !== 'terrain_hill_stair' &&
              tool !== 'terrain_stone_stair' &&
              tool !== 'obj_stair_crate' &&
              tool !== 'obj_bamboo' &&
              tool !== 'obj_house' &&
              tool !== 'obj_rail' && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">擺放方向：{rotated ? '直向' : '橫向'}</span>
                  <button
                    type="button"
                    onClick={() => setRotated((r) => !r)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    切換旋轉 (R)
                  </button>
                </div>
              )}

            {tool === 'obj_container' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400">貨櫃塗裝：</span>
                {CONTAINER_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setContainerColor(c.value)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      containerColor === c.value ? 'border-amber-400 text-white font-bold' : 'border-slate-700 text-slate-300'
                    }`}
                    style={{ backgroundColor: c.value }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {tool === 'obj_train_car' && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-slate-400">編組樣式：</span>
                {TRAIN_VARIANTS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setTrainVariant(v.value)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      trainVariant === v.value ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable Tool List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {currentTabTools.map((item) => {
              const selected = tool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTool(item.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                    selected
                      ? 'bg-[#182336] border-amber-400 shadow-md shadow-amber-500/15'
                      : 'bg-slate-900/75 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {item.previewId ? (
                    <ToolThumb visualId={item.previewId} />
                  ) : (
                    <div className="w-[64px] h-[42px] rounded border border-slate-700/80 bg-slate-950 flex items-center justify-center shrink-0">
                      {item.id === 'obj_erase' || item.id === 'spawn_erase' || item.id === 'terrain_lower' ? (
                        <Eraser className="w-5 h-5 text-rose-400" />
                      ) : item.id === 'spawn_royal' ? (
                        <FactionLogoSvg faction="royal" className="w-8 h-8" />
                      ) : item.id === 'spawn_shadow' ? (
                        <FactionLogoSvg faction="shadow" className="w-8 h-8" />
                      ) : (
                        <FactionLogoSvg faction="mercenary" className="w-8 h-8" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{item.label}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-num">
                      <span className="text-amber-300">{item.heightLabel}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">{item.footprint}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* 出生與物資頁籤：地圖武器點（含全遠程槍械、近戰兵器、防彈盾牌與彈藥箱，無數值干擾） */}
            {activeTab === 'spawns' && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-300 px-1">地圖武器點（點選圖示後於畫布放置）</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PLACEABLE_WEAPONS.map((w) => {
                    const selected =
                      w.entryType === 'shield'
                        ? tool === 'spawn_shield'
                        : w.entryType === 'ammo'
                          ? tool === 'spawn_ammo'
                          : tool === 'spawn_weapon' && selectedWeapon.weaponId === w.weaponId;
                    return (
                      <button
                        key={w.weaponId}
                        type="button"
                        onClick={() => {
                          if (w.entryType === 'shield') {
                            setTool('spawn_shield');
                          } else if (w.entryType === 'ammo') {
                            setTool('spawn_ammo');
                          } else {
                            setSelectedWeapon({ kind: w.entryType, weaponId: w.weaponId });
                            setTool('spawn_weapon');
                          }
                        }}
                        className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-left cursor-pointer ${
                          selected
                            ? 'bg-[#182336] border-amber-400 shadow-md shadow-amber-500/15'
                            : 'bg-slate-900/75 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-950 border border-slate-700/80 flex items-center justify-center shrink-0">
                          {w.iconKind === 'ammo' ? (
                            <AmmoIconCanvas />
                          ) : (
                            <WeaponIconSvg kind={w.iconKind} className="w-7 h-7" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white truncate">{w.label}</div>
                          <div className="text-[10px] text-amber-300 font-mono-num">{w.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Pinned Validation Summary */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-950/90 p-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between font-mono-num">
              <div className="flex items-center gap-2">
                <span className="text-sky-300 font-bold">
                  {FACTIONS.royal.name.slice(0, 2)} {draft.factionSpawns.royal.length}
                </span>
                <span style={{ color: '#C026D3' }} className="font-bold">
                  天影 {draft.factionSpawns.shadow.length}
                </span>
                <span className="text-amber-300 font-bold">
                  第三 {draft.factionSpawns.mercenary.length}
                </span>
              </div>
              <span className="text-slate-400">可走格 {validation.standableCount}</span>
            </div>

            {validation.valid ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>三方出生點與全圖連通驗證通過</span>
              </div>
            ) : (
              <div className="space-y-1 text-rose-300">
                {validation.errors.slice(0, 2).map((err, i) => (
                  <div key={i} className="flex items-start gap-1.5 leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {validation.valid && validation.warnings.length > 0 && (
              <div className="text-amber-300/90 leading-snug">{validation.warnings[0]}</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
