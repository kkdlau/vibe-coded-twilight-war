import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { renderMapBaseLayer } from '../game/mapRenderer';
import { createArenaMap } from '../game/maps';
import { MapId } from '../game/types';

interface MiniMapPreviewProps {
  mapId: MapId;
  className?: string;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.5;

export const MiniMapPreview: React.FC<MiniMapPreviewProps> = ({ mapId, className = '' }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arena = useMemo(() => createArenaMap(mapId), [mapId]);

  const [zoom, setZoom] = useState(1);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 640, h: 420 });

  // Reset zoom when switching map
  useEffect(() => {
    setZoom(1);
  }, [mapId]);

  // Measure outer container so 1x fits proportionally by longest/tightest dimension
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBoxSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateSize);
      obs.observe(el);
      return () => obs.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Render sharp high-resolution backing canvas once per map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewW = Math.max(1280, arena.cols * 36);
    const previewH = Math.round((arena.height / arena.width) * previewW);
    canvas.width = previewW;
    canvas.height = previewH;

    const scale = previewW / arena.width;
    ctx.save();
    ctx.clearRect(0, 0, previewW, previewH);
    ctx.scale(scale, scale);
    renderMapBaseLayer(ctx, arena, true);
    ctx.restore();
  }, [arena]);

  // Aspect-fitted 1x base pixel dimensions derived from container & map cols/rows ratio
  const pad = 12;
  const availW = Math.max(120, boxSize.w - pad * 2);
  const availH = Math.max(120, boxSize.h - pad * 2);
  const fitScale = Math.min(availW / arena.width, availH / arena.height);
  const displayW = Math.round(arena.width * fitScale * zoom);
  const displayH = Math.round(arena.height * fitScale * zoom);

  return (
    <div className={`relative rounded-lg border border-slate-700/80 bg-slate-950 overflow-hidden ${className}`}>
      {/* Scrollable Map Viewport */}
      <div
        ref={viewportRef}
        className="w-full h-full overflow-auto flex p-3"
      >
        <canvas
          ref={canvasRef}
          style={{ width: `${displayW}px`, height: `${displayH}px` }}
          className="block m-auto shrink-0 rounded shadow-lg"
          aria-label={`${arena.name} 戰場縮圖預覽`}
        />
      </div>

      {/* Pinned Top-Right Zoom Controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-950/90 border border-slate-700/85 rounded-lg px-1.5 py-1 shadow-lg">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="縮小地圖預覽"
          className="p-1 rounded hover:bg-slate-800 disabled:opacity-35 text-slate-200 cursor-pointer disabled:cursor-default"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="px-1.5 text-[11px] font-mono-num font-bold text-slate-100 min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="放大地圖預覽"
          className="p-1 rounded hover:bg-slate-800 disabled:opacity-35 text-slate-200 cursor-pointer disabled:cursor-default"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        {zoom > 1 && (
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="重設縮放"
            className="p-1 rounded hover:bg-slate-800 text-amber-300 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Pinned Bottom-Right Spawn Legend (Colors aligned with map spawns) */}
      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2.5 bg-slate-950/90 border border-slate-700/80 rounded px-2.5 py-0.5 text-[10px] font-semibold text-slate-200">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border border-white/80 inline-block" style={{ backgroundColor: '#38BDF8' }} />
          皇家
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border border-white/80 inline-block" style={{ backgroundColor: '#C026D3' }} />
          天影
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border border-white/80 inline-block" style={{ backgroundColor: '#FBBF24' }} />
          第三
        </span>
      </div>
    </div>
  );
};
