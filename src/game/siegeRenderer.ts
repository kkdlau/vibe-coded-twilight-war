import { clamp } from './geometry';
import { SiegeFactionId, SiegeStructure, SiegeZoneEffect } from './types';

export function drawSiegeFountains(
  ctx: CanvasRenderingContext2D,
  fountains: Record<SiegeFactionId, { x: number; y: number; radius: number }>,
  time: number
) {
  const configs: { fac: SiegeFactionId; primary: string; glow: string; label: string }[] = [
    { fac: 'royal', primary: '#38BDF8', glow: 'rgba(56, 189, 248, 0.22)', label: '皇家泉水' },
    { fac: 'shadow', primary: '#C026D3', glow: 'rgba(192, 38, 211, 0.22)', label: '天影泉水' },
  ];

  for (const cfg of configs) {
    const f = fountains[cfg.fac];
    const pulse = 0.88 + Math.sin(time * 2.6) * 0.12;
    ctx.save();
    const grad = ctx.createRadialGradient(f.x, f.y, f.radius * 0.15, f.x, f.y, f.radius);
    grad.addColorStop(0, cfg.glow);
    grad.addColorStop(0.75, cfg.glow);
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = cfg.primary;
    ctx.globalAlpha = 0.55 * pulse;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time * 24;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius * 0.86, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius * 0.36 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.85;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = cfg.primary;
    ctx.fillText(cfg.label, f.x, f.y + f.radius * 0.62);
    ctx.restore();
  }
}

export function drawSiegeZones(
  ctx: CanvasRenderingContext2D,
  zones: SiegeZoneEffect[],
  time: number
) {
  for (const z of zones) {
    const fade = clamp(z.life / Math.min(0.45, z.maxLife), 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;

    if (z.kind === 'sanctuary') {
      const grad = ctx.createRadialGradient(z.x, z.y, 12, z.x, z.y, z.radius);
      grad.addColorStop(0, 'rgba(250, 204, 21, 0.14)');
      grad.addColorStop(0.8, 'rgba(56, 189, 248, 0.20)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0.04)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = time * 40;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    } else if (z.kind === 'vortex') {
      const grad = ctx.createRadialGradient(z.x, z.y, 10, z.x, z.y, z.radius);
      grad.addColorStop(0, 'rgba(88, 28, 135, 0.45)');
      grad.addColorStop(0.65, 'rgba(168, 85, 247, 0.25)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 2.5;
      for (let arm = 0; arm < 3; arm++) {
        const baseA = time * 4.5 + (arm * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * 0.65, baseA, baseA + 1.3);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // shadow decoy bomb
      const pulse = 1 + Math.sin(time * 18) * 0.14;
      ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#E879F9';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#3B0764';
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, 16 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}

export function drawSiegeStructures(
  ctx: CanvasRenderingContext2D,
  structures: SiegeStructure[],
  playerFaction: SiegeFactionId,
  playerPos: { x: number; y: number },
  targetPositions: Map<string, { x: number; y: number }>,
  time: number
) {
  for (const s of structures) {
    const isRoyal = s.faction === 'royal';
    const primary = isRoyal ? '#38BDF8' : '#C026D3';
    const trim = isRoyal ? '#FACC15' : '#FB7185';
    const stoneDark = isRoyal ? '#334155' : '#1E1B4B';
    const stoneLight = isRoyal ? '#94A3B8' : '#4C1D95';

    if (!s.alive) {
      // Destroyed rubble crater
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#475569';
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        ctx.fillRect(s.x + Math.cos(a) * 10 - 4, s.y + Math.sin(a) * 10 - 3, 8, 6);
      }
      ctx.restore();
      continue;
    }

    ctx.save();

    // Enemy structure threat range ring when player is near
    if (s.faction !== playerFaction) {
      const d = Math.hypot(playerPos.x - s.x, playerPos.y - s.y);
      if (d <= s.range + 150) {
        const targetingPlayer = s.aggroTargetId === 'player';
        ctx.strokeStyle = targetingPlayer ? 'rgba(239, 68, 68, 0.72)' : 'rgba(248, 113, 113, 0.28)';
        ctx.lineWidth = targetingPlayer ? 2.2 : 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Active turret aggro laser line
    if (s.aggroTargetId) {
      const tp = targetPositions.get(s.aggroTargetId);
      if (tp && Math.hypot(tp.x - s.x, tp.y - s.y) <= s.range + 35) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 10);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
      }
    }

    // Drop shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.beginPath();
    ctx.ellipse(s.x + 3, s.y + 8, s.radius * 1.08, s.radius * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base plinth
    ctx.fillStyle = s.hitFlash > 0 ? '#FFFFFF' : stoneDark;
    ctx.strokeStyle = trim;
    ctx.lineWidth = s.kind === 'castle' ? 3.2 : 2.2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2.5D upper tier
    const upperY = s.y - (s.kind === 'castle' ? 12 : 8);
    const upperR = s.radius * 0.72;
    ctx.fillStyle = s.hitFlash > 0 ? '#FFFFFF' : stoneLight;
    ctx.beginPath();
    ctx.arc(s.x, upperY, upperR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rotating crystal core
    const rot = time * (s.kind === 'castle' ? 1.4 : 2.0);
    const coreR = s.kind === 'castle' ? 15 : 9;
    ctx.save();
    ctx.translate(s.x, upperY - 4);
    ctx.rotate(rot);
    ctx.fillStyle = primary;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -coreR);
    ctx.lineTo(coreR * 0.78, 0);
    ctx.lineTo(0, coreR);
    ctx.lineTo(-coreR * 0.78, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Invulnerable or Backdoor protection ring
    if (s.invulnerable) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 4, s.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.backdoorProtected) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(s.x, s.y - 4, s.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // HP Bar & Label
    const bw = s.kind === 'castle' ? 92 : 60;
    const bh = s.kind === 'castle' ? 8 : 6;
    const bx = s.x - bw / 2;
    const by = upperY - upperR - 18;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = primary;
    ctx.fillRect(bx, by, bw * clamp(s.hp / s.maxHp, 0, 1), bh);

    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';
    const tag = s.invulnerable ? ' [無敵]' : s.backdoorProtected ? ' [堅守減傷]' : '';
    const title = s.kind === 'castle' ? (isRoyal ? '皇家主城堡' : '天影主城堡') : s.kind === 'inner_tower' ? '高地塔' : '外防禦塔';
    ctx.fillText(`${title}${tag}`, s.x, by - 4);

    ctx.restore();
  }
}
