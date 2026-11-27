import React, { useEffect, useRef } from 'react';
import { FactionId, SiegeHudState } from '../game/types';

interface SiegeMinimapProps {
  siege: SiegeHudState;
  playerFaction: FactionId;
}

const SIZE = 176;

export const SiegeMinimap: React.FC<SiegeMinimapProps> = ({ siege, playerFaction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sx = SIZE / siege.mapWidth;
    const sy = SIZE / siege.mapHeight;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Base terrain background
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Jungle foliage tint
    ctx.fillStyle = '#14261D';
    ctx.fillRect(4, 4, SIZE - 8, SIZE - 8);

    // River diagonal band
    ctx.strokeStyle = '#0369A1';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(SIZE - 32, SIZE - 32);
    ctx.stroke();

    // 3 Lanes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Top lane
    ctx.beginPath();
    ctx.moveTo(18, SIZE - 28);
    ctx.lineTo(18, 18);
    ctx.lineTo(SIZE - 28, 18);
    ctx.stroke();
    // Bot lane
    ctx.beginPath();
    ctx.moveTo(28, SIZE - 18);
    ctx.lineTo(SIZE - 18, SIZE - 18);
    ctx.lineTo(SIZE - 18, 28);
    ctx.stroke();
    // Mid lane
    ctx.beginPath();
    ctx.moveTo(26, SIZE - 26);
    ctx.lineTo(SIZE - 26, 26);
    ctx.stroke();

    // Bases
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fillRect(4, SIZE - 40, 36, 36);
    ctx.fillStyle = 'rgba(192, 38, 211, 0.25)';
    ctx.fillRect(SIZE - 40, 4, 36, 36);

    // Boss pit icons
    const drawPit = (gx: number, gy: number, alive: boolean, color: string) => {
      const px = (gx / 54) * SIZE;
      const py = (gy / 54) * SIZE;
      ctx.fillStyle = alive ? color : 'rgba(148, 163, 184, 0.3)';
      ctx.beginPath();
      ctx.arc(px, py, alive ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    };
    drawPit(18.5, 18.5, siege.baronState === 'alive', '#F43F5E');
    drawPit(35.5, 35.5, siege.vanguardState === 'alive', '#F59E0B');

    // Structures
    for (const st of siege.structures) {
      const x = st.x * sx;
      const y = st.y * sy;
      if (!st.alive) {
        ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        continue;
      }
      const r = st.kind === 'castle' ? 5.5 : 3.5;
      ctx.fillStyle = st.faction === 'royal' ? '#38BDF8' : '#E879F9';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Units
    for (const u of siege.minimapUnits) {
      const x = u.x * sx;
      const y = u.y * sy;
      if (u.kind === 'minion') {
        ctx.fillStyle = u.faction === 'royal' ? 'rgba(125, 211, 252, 0.8)' : 'rgba(232, 121, 249, 0.8)';
        ctx.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
      } else if (u.kind === 'jungle') {
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else if (u.kind === 'boss') {
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (u.kind === 'hero') {
        ctx.fillStyle = u.faction === playerFaction ? '#22D3EE' : '#FB7185';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (u.kind === 'player') {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Camera viewport rect
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.72)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      siege.cameraRect.x * sx,
      siege.cameraRect.y * sy,
      siege.cameraRect.w * sx,
      siege.cameraRect.h * sy
    );
  }, [siege, playerFaction]);

  return (
    <div className="pointer-events-none relative rounded-xl border border-slate-700/90 bg-slate-950/90 p-1.5 shadow-2xl">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="block rounded-lg" />
      <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-mono-num text-slate-300">
        <span className="text-sky-300">皇塔 {siege.royalTowersAlive}/6</span>
        <span className="text-amber-300">{siege.suddenDeath ? '總攻' : '小地圖'}</span>
        <span className="text-fuchsia-300">影塔 {siege.shadowTowersAlive}/6</span>
      </div>
    </div>
  );
};
