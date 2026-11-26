import { clamp } from './geometry';
import type { ActorSkillVisuals, Projectile, SkillTrace } from './types';

function drawSwordLight(ctx: CanvasRenderingContext2D, projectile: Projectile) {
  const r = projectile.radius;
  const phase = (projectile.maxLife - projectile.life) * 23;
  const roll = 0.66 + 0.34 * Math.sin(phase);
  ctx.translate(projectile.x, projectile.y);
  ctx.rotate(Math.atan2(projectile.vy, projectile.vx));

  // Draw the sheared wake behind the cutting edge.
  const wake = ctx.createLinearGradient(-r * 3.5, 0, r, 0);
  wake.addColorStop(0, 'rgba(133, 113, 77, 0)');
  wake.addColorStop(0.57, 'rgba(186, 157, 105, 0.29)');
  wake.addColorStop(1, 'rgba(255, 237, 193, 0.84)');
  ctx.fillStyle = wake;
  for (const side of [-1, 1]) {
    const y = side * r;
    const drift = Math.sin(phase + side * 1.4) * r * 0.24;
    ctx.beginPath();
    ctx.moveTo(r * 0.68, 0);
    ctx.bezierCurveTo(2, y * roll, -r * 1.1, y * 0.76, -r * 3.5, y * 0.4 + drift);
    ctx.bezierCurveTo(-r * 1.58, y * 0.33, -r * 0.7, y * 0.52, r * 0.68, 0);
    ctx.fill();
  }

  ctx.save();
  ctx.scale(1, roll);
  const metal = ctx.createLinearGradient(-r, 0, r, 0);
  metal.addColorStop(0, 'rgba(142, 107, 67, 0)');
  metal.addColorStop(0.48, '#927454');
  metal.addColorStop(0.78, '#DDC8A3');
  metal.addColorStop(1, '#FFF6DB');
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -r);
  ctx.bezierCurveTo(r * 0.66, -r * 0.97, r * 1.27, -r * 0.35, r * 1.04, 0);
  ctx.bezierCurveTo(r * 1.27, r * 0.35, r * 0.66, r * 0.97, -r * 0.9, r);
  ctx.bezierCurveTo(r * 0.11, r * 0.59, r * 0.28, -r * 0.59, -r * 0.9, -r);
  ctx.fillStyle = metal;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 253, 239, 0.85)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.47, -r * 0.89);
  ctx.quadraticCurveTo(r * 1.15, -r * 0.62, r * 1.07, 0);
  ctx.quadraticCurveTo(r * 1.09, r * 0.4, r * 0.3, r * 0.67);
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < 3; i++) {
    const age = ((projectile.maxLife - projectile.life) * 8 + i / 3) % 1;
    const x = -r * (0.5 + age * 2.6);
    const y = (i - 1) * r * (0.33 + age * 0.34);
    ctx.strokeStyle = `rgba(235, 206, 154, ${0.62 * (1 - age)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 0.31, y);
    ctx.stroke();
  }
}

let blackDragonHeadSprite: HTMLImageElement | null = null;
let blackDragonHeadRequested = false;

function getBlackDragonHeadSprite(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!blackDragonHeadRequested) {
    blackDragonHeadRequested = true;
    const baseUrl = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
    const img = new Image();
    img.decoding = 'async';
    img.src = `${baseUrl}assets/vfx/black-dragon-head.png`;
    blackDragonHeadSprite = img;
  }
  if (blackDragonHeadSprite && blackDragonHeadSprite.complete && blackDragonHeadSprite.naturalWidth > 0) {
    return blackDragonHeadSprite;
  }
  return null;
}

function drawDragonHeadFallback(ctx: CanvasRenderingContext2D, time: number) {
  const sway = Math.sin(time * 10) * 1.8;
  const armor = ctx.createLinearGradient(-22, -16, 22, 16);
  armor.addColorStop(0, '#130D1E');
  armor.addColorStop(0.45, '#2A213A');
  armor.addColorStop(0.78, '#171123');
  armor.addColorStop(1, '#09060F');

  // Swept-back crescent assassin horns
  for (const side of [-1, 1]) {
    ctx.fillStyle = armor;
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, side * 6);
    ctx.bezierCurveTo(-12, side * 18, -24, side * 20, -34, side * (16 + sway));
    ctx.quadraticCurveTo(-22, side * 11, -13, side * 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Obsidian skull mask
  ctx.beginPath();
  ctx.moveTo(23, 0);
  ctx.lineTo(14, 6);
  ctx.lineTo(4, 10);
  ctx.lineTo(-7, 13);
  ctx.lineTo(-16, 7);
  ctx.lineTo(-13, 0);
  ctx.lineTo(-16, -7);
  ctx.lineTo(-7, -13);
  ctx.lineTo(4, -10);
  ctx.lineTo(14, -6);
  ctx.closePath();
  ctx.fillStyle = armor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.5)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Glowing crimson crescent-moon forehead rune
  ctx.save();
  ctx.fillStyle = '#F43F5E';
  ctx.beginPath();
  ctx.arc(-3, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#130D1E';
  ctx.beginPath();
  ctx.arc(-1.4, 0, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Glowing blood-rose slit eyes
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#F43F5E';
    ctx.beginPath();
    ctx.moveTo(10, side * 3.2);
    ctx.lineTo(2, side * 7.2);
    ctx.lineTo(7, side * 4.8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawDragon(ctx: CanvasRenderingContext2D, projectile: Projectile, time: number) {
  const points = [{ x: projectile.x, y: projectile.y }, ...(projectile.segments ?? []).slice(1)];
  const count = points.length;
  const normals = points.map((point, i) => {
    const front = points[Math.max(0, i - 1)];
    const back = points[Math.min(count - 1, i + 1)];
    const dx = front.x - back.x;
    const dy = front.y - back.y;
    const span = Math.hypot(dx, dy);
    const t = i / Math.max(1, count);
    const width = 14.5 * (0.14 + 0.86 * (1 - t) ** 0.72);
    if (span < 0.01) {
      return { x: 0, y: width, tx: 1, ty: 0, width, point };
    }
    return {
      x: (-dy * width) / span,
      y: (dx * width) / span,
      tx: dx / span,
      ty: dy / span,
      width,
      point,
    };
  });

  if (normals.length >= 2) {
    // 1. Outer spectral violet-magenta phantom aura ribbon
    for (const [spread, color] of [
      [1.48, 'rgba(147, 51, 234, 0.24)'],
      [1.16, 'rgba(192, 38, 211, 0.32)'],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i < normals.length; i++) {
        const edge = normals[i];
        const wave = 1 + 0.14 * Math.sin(time * 9 - i * 0.9);
        const x = edge.point.x - edge.x * spread * wave;
        const y = edge.point.y - edge.y * spread * wave;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = normals.length - 1; i >= 0; i--) {
        const edge = normals[i];
        const wave = 1 + 0.14 * Math.cos(time * 9 - i * 0.9);
        ctx.lineTo(edge.point.x + edge.x * spread * wave, edge.point.y + edge.y * spread * wave);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // 2. Sumi-e ink-black calligraphic ribbon with jagged dry-brush flank spikes
    ctx.beginPath();
    for (let i = 0; i < normals.length; i++) {
      const edge = normals[i];
      const jag = i > 0 && i < normals.length - 1
        ? 0.92 + 0.34 * Math.abs(Math.sin(i * 1.85 - time * 8.5))
        : 0.95;
      const x = edge.point.x - edge.x * jag;
      const y = edge.point.y - edge.y * jag;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = normals.length - 1; i >= 0; i--) {
      const edge = normals[i];
      const jag = i > 0 && i < normals.length - 1
        ? 0.92 + 0.34 * Math.abs(Math.cos(i * 1.95 - time * 8.5))
        : 0.95;
      ctx.lineTo(edge.point.x + edge.x * jag, edge.point.y + edge.y * jag);
    }
    ctx.closePath();
    ctx.fillStyle = '#09060F';
    ctx.fill();

    // Inner obsidian volume + glowing spectral violet energy spine
    for (const [left, right, color] of [
      [-0.64, 0.56, '#181026'],
      [-0.22, 0.22, 'rgba(168, 85, 247, 0.52)'],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i < normals.length; i++) {
        const edge = normals[i];
        const x = edge.point.x + edge.x * left;
        const y = edge.point.y + edge.y * left;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = normals.length - 1; i >= 0; i--) {
        const edge = normals[i];
        ctx.lineTo(edge.point.x + edge.x * right, edge.point.y + edge.y * right);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // 3. Swept calligraphic energy chevrons pulsing head-to-tail
    for (let i = normals.length - 1; i >= 1; i--) {
      const { x, y, point } = normals[i];
      const { point: front } = normals[i - 1];
      const fade = 1 - i / normals.length;
      const pulse = (0.5 + 0.5 * Math.cos(time * 14 - i * 0.85)) * fade;
      ctx.fillStyle = `rgba(216, 180, 254, ${0.14 + pulse * 0.48})`;
      ctx.beginPath();
      ctx.moveTo(point.x - x * 0.88, point.y - y * 0.88);
      ctx.lineTo(front.x - x * 0.16, front.y - y * 0.16);
      ctx.lineTo(point.x + x * 0.88, point.y + y * 0.88);
      ctx.lineTo(point.x - x * 0.04, point.y - y * 0.04);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Flying dry-brush sumi-e ink splatters flinging off the flanks
    const splatterCount = Math.min(10, normals.length);
    for (let s = 1; s < splatterCount; s++) {
      const idx = Math.min(normals.length - 1, Math.floor((s / splatterCount) * (normals.length - 1)) + 1);
      const seg = normals[idx];
      const side = s % 2 === 0 ? 1 : -1;
      const cycle = (time * 3.4 + s * 0.37) % 1;
      const offset = 0.95 + cycle * 1.15;
      const sx = seg.point.x + seg.x * side * offset - seg.tx * cycle * 8;
      const sy = seg.point.y + seg.y * side * offset - seg.ty * cycle * 8;
      const r = (1 - cycle) * (2.6 + (s % 3) * 0.9) * (0.45 + 0.55 * (1 - idx / normals.length));
      if (r < 0.4) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.atan2(seg.ty, seg.tx));
      ctx.globalAlpha *= (1 - cycle) * 0.85;
      ctx.fillStyle = '#09060F';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.9, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }

    // 5. Floating crimson will-o'-the-wisp ghost-fire orbs trailing the mid-to-tail body
    const orbCount = Math.min(5, Math.max(2, Math.floor(normals.length / 2)));
    for (let k = 0; k < orbCount; k++) {
      const frac = 0.25 + (k / Math.max(1, orbCount - 1)) * 0.68;
      const idx = Math.min(normals.length - 1, Math.max(1, Math.floor(frac * (normals.length - 1))));
      const seg = normals[idx];
      const side = k % 2 === 0 ? 1 : -1;
      const bob = Math.sin(time * 7.5 + k * 2.1);
      const lateral = side * (1.28 + 0.34 * bob);
      const ox = seg.point.x + seg.x * lateral;
      const oy = seg.point.y + seg.y * lateral;
      const orbR = 3.2 + 0.9 * Math.cos(time * 9 + k * 1.7);

      const halo = ctx.createRadialGradient(ox, oy, 0.5, ox, oy, orbR * 3.1);
      halo.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      halo.addColorStop(0.28, 'rgba(244, 63, 94, 0.88)');
      halo.addColorStop(0.62, 'rgba(192, 38, 211, 0.36)');
      halo.addColorStop(1, 'rgba(147, 51, 234, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(ox, oy, orbR * 3.1, 0, Math.PI * 2);
      ctx.fill();

      // Short teardrop comet wisp trailing backward along the body tangent
      ctx.fillStyle = 'rgba(244, 63, 94, 0.78)';
      ctx.beginPath();
      ctx.moveTo(ox + seg.tx * orbR * 0.9, oy + seg.ty * orbR * 0.9);
      ctx.lineTo(ox - seg.tx * orbR * 3.2 + seg.ty * orbR * 0.45, oy - seg.ty * orbR * 3.2 - seg.tx * orbR * 0.45);
      ctx.lineTo(ox - seg.tx * orbR * 3.2 - seg.ty * orbR * 0.45, oy - seg.ty * orbR * 3.2 + seg.tx * orbR * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 6. Dragon head (Design B Spectral Sumi-e Assassin Dragon)
  ctx.translate(projectile.x, projectile.y);
  ctx.rotate(Math.atan2(projectile.vy, projectile.vx));

  const pulseGlow = 0.72 + 0.28 * Math.sin(time * 11);

  // Subtle violet-crimson aura behind the skull & horns to fuse with the ink neck
  const neckAura = ctx.createRadialGradient(-4, 0, 2, -4, 0, 32);
  neckAura.addColorStop(0, `rgba(244, 63, 94, ${0.34 * pulseGlow})`);
  neckAura.addColorStop(0.5, 'rgba(147, 51, 234, 0.28)');
  neckAura.addColorStop(1, 'rgba(147, 51, 234, 0)');
  ctx.fillStyle = neckAura;
  ctx.beginPath();
  ctx.arc(-4, 0, 32, 0, Math.PI * 2);
  ctx.fill();

  // Animated ink-smoke wisps curling off the swept-back horns
  for (const side of [-1, 1]) {
    const wispSway = Math.sin(time * 11 + side * 1.4) * 3.2;
    ctx.fillStyle = 'rgba(15, 10, 24, 0.72)';
    ctx.beginPath();
    ctx.moveTo(-10, side * 9);
    ctx.quadraticCurveTo(-24, side * (16 + wispSway), -39, side * (11 - wispSway * 0.6));
    ctx.quadraticCurveTo(-25, side * (8 + wispSway * 0.4), -14, side * 4);
    ctx.closePath();
    ctx.fill();
  }

  const headSprite = getBlackDragonHeadSprite();
  if (headSprite) {
    ctx.drawImage(headSprite, -36, -19, 62, 38);

    // Living crimson pulse over the forehead crescent & eyes
    const runePulse = ctx.createRadialGradient(-3, 0, 0.5, -3, 0, 11);
    runePulse.addColorStop(0, `rgba(251, 113, 133, ${0.32 * pulseGlow})`);
    runePulse.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = runePulse;
    ctx.beginPath();
    ctx.arc(-3, 0, 11, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawDragonHeadFallback(ctx, time);
  }
}

export function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[], time: number) {
  for (const projectile of projectiles) {
    ctx.save();
    if (projectile.isBlackDragon) drawDragon(ctx, projectile, time);
    else if (projectile.isLightOrb) drawSwordLight(ctx, projectile);
    ctx.restore();
  }
}

export function drawVampireMist(
  ctx: CanvasRenderingContext2D,
  actor: { x: number; y: number; radius: number },
  visuals: ActorSkillVisuals,
  time: number
) {
  const { radius } = actor;
  ctx.save();
  ctx.globalAlpha *= visuals.mistOpacity;
  for (let i = 0; i < 8; i++) {
    const phase = time * (0.58 + i * 0.024) + i * 2.39;
    const drift = Math.sin(time * 2.2 + i * 1.4);
    const rear = i / 8;
    const spread = radius * (0.79 + rear * 0.43 + drift * 0.19);
    const x = actor.x + (visuals.mistX - actor.x) * rear + Math.cos(phase) * spread;
    const y = actor.y + (visuals.mistY - actor.y) * rear + Math.sin(phase) * spread;
    const length = radius * (0.93 + rear * 0.68);
    const fog = ctx.createRadialGradient(length * 0.18, -2, 0, 0, 0, length);
    fog.addColorStop(0, `rgba(161, 47, 65, ${0.37 + drift * 0.11})`);
    fog.addColorStop(0.45, 'rgba(109, 26, 47, 0.23)');
    fog.addColorStop(0.77, 'rgba(54, 14, 31, 0.12)');
    fog.addColorStop(1, 'rgba(45, 10, 28, 0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(phase + Math.PI / 2);
    ctx.scale(1, 0.42 + rear * 0.22);
    ctx.fillStyle = fog;
    ctx.fillRect(-length, -length, length * 2, length * 2);
    ctx.restore();
  }
  ctx.restore();
}

export function drawShadowForms(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  facing: number,
  time: number,
  lean: number,
  dodgeAngle: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean > 0 ? dodgeAngle : facing);
  const sideways = lean > 0 ? 1 : 0;
  for (const side of [-1, 1]) {
    const sway = Math.sin(time * 4.2 + side * 2) * 0.2 + 1;
    const shift = side * radius * (0.9 + sway * 0.36);
    ctx.save();
    ctx.translate(sideways * Math.min(0, side * lean * 0.45), (1 - sideways) * shift);
    ctx.rotate(sideways * -Math.PI / 2);
    const shadow = ctx.createLinearGradient(radius * 0.5, 0, -radius * 1.65, 0);
    shadow.addColorStop(0, 'rgba(62, 67, 86, 0)');
    shadow.addColorStop(0.28, lean > 0 ? 'rgba(151, 151, 182, 0.78)' : 'rgba(111, 115, 142, 0.36)');
    shadow.addColorStop(0.55, 'rgba(56, 54, 78, 0.64)');
    shadow.addColorStop(1, 'rgba(38, 36, 58, 0)');
    ctx.scale(radius, radius);
    ctx.beginPath();
    ctx.moveTo(0.45, 0);
    ctx.bezierCurveTo(0.57, -0.48, 0.1, -0.59, -0.12, -0.32);
    ctx.bezierCurveTo(-0.42, -0.92, -0.85, -0.89, -1.65, -1.02 * sway);
    ctx.quadraticCurveTo(-0.98, -0.36, -0.86, 0.01);
    ctx.quadraticCurveTo(-1.15, 0.47, -1.7, 0.68 * sway);
    ctx.quadraticCurveTo(-0.48, 0.75, -0.16, 0.27);
    ctx.bezierCurveTo(0.17, 0.61, 0.46, 0.39, 0.45, 0);
    ctx.fillStyle = shadow;
    ctx.fill();
    ctx.restore();
  }
  if (lean > 0) {
    // A short streak through the discarded silhouette reads as a projectile pass-through.
    const streak = ctx.createLinearGradient(0, -radius * 1.8, 0, radius * 1.8);
    streak.addColorStop(0, 'rgba(185, 186, 213, 0)');
    streak.addColorStop(0.45, 'rgba(216, 218, 238, 0.82)');
    streak.addColorStop(1, 'rgba(185, 186, 213, 0)');
    ctx.fillStyle = streak;
    ctx.globalAlpha *= clamp(lean / radius, 0, 1);
    ctx.fillRect(-0.8, -radius * 1.8, 1.6, radius * 3.6);
  }
  ctx.restore();
}

export function drawMorphGround(
  ctx: CanvasRenderingContext2D,
  actor: { x: number; y: number; angle: number; baseRadius: number; sizeScale: number },
  visualScale: number,
  time: number
) {
  const shrinking = Math.min(visualScale, actor.sizeScale) < 1;
  const change = clamp(Math.abs(actor.sizeScale - visualScale) * 4, 0, 1);
  const intensity = Math.max(Math.abs(visualScale - 1) * 1.7, change);
  const r = actor.baseRadius;
  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.rotate(actor.angle);
  ctx.globalAlpha *= intensity;
  const tint = ctx.createRadialGradient(0, 0, r * 0.13, 0, 0, r * (shrinking ? 1.16 : 1.68));
  tint.addColorStop(0, 'rgba(19, 19, 25, 0.69)');
  tint.addColorStop(0.65, shrinking ? 'rgba(69, 83, 99, 0.28)' : 'rgba(126, 86, 59, 0.42)');
  tint.addColorStop(1, 'rgba(49, 36, 29, 0)');
  ctx.fillStyle = tint;
  ctx.fillRect(-r * 1.7, -r * 1.7, r * 3.4, r * 3.4);

  if (change > 0.02) {
    ctx.save();
    ctx.globalAlpha *= change;
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.39996 + (shrinking ? -time * 0.4 : 0);
      ctx.save();
      ctx.rotate(angle);
      const inner = r * (shrinking ? 0.45 : 0.93);
      const outer = r * (shrinking ? 1.63 : 1.86);
      const sweep = ctx.createLinearGradient(inner, 0, outer, 0);
      sweep.addColorStop(0, shrinking ? 'rgba(188, 206, 222, 0.76)' : 'rgba(24, 23, 24, 0.9)');
      sweep.addColorStop(0.66, shrinking ? 'rgba(126, 144, 162, 0.29)' : 'rgba(141, 103, 76, 0.59)');
      sweep.addColorStop(1, 'rgba(27, 27, 31, 0)');
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.moveTo(inner, 0);
      ctx.quadraticCurveTo(outer * 0.74, shrinking ? 5 : -4, outer, shrinking ? 7 : -3);
      ctx.quadraticCurveTo(outer * 0.71, shrinking ? 2 : 1, inner, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Shrinkage pulls slivers inward; growth throws heavier fragments away from the feet.
  const spin = time * (shrinking ? -0.8 : 0.22);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.39996 + spin;
    const phase = (time * (shrinking ? 2.9 : 1.6) + i / 6) % 1;
    const distance = r * (shrinking ? 1.4 - 0.87 * phase : 1.02 + 0.65 * phase);
    const alpha = Math.sin(phase * Math.PI) * (0.43 + change * 0.54);
    ctx.save();
    ctx.translate(Math.cos(a) * distance, Math.sin(a) * distance);
    ctx.rotate(a);
    ctx.fillStyle = shrinking ? `rgba(156, 171, 179, ${alpha})` : `rgba(190, 147, 112, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(shrinking ? 8 : 4 + change * 4, -1.2);
    ctx.lineTo(shrinking ? 1 : 2, shrinking ? 0.8 : 2.4);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBloodSiphon(ctx: CanvasRenderingContext2D, progress: number, length: number) {
  const pull = clamp((progress - 0.19) / 0.75, 0, 1);
  const travel = pull * pull * (3 - 2 * pull);
  const bow = Math.min(30, length * 0.22);
  const headX = travel * length;
  const headY = -Math.sin(travel * Math.PI) * bow;
  const form = clamp(progress / 0.19, 0, 1);
  const absorbed = clamp((progress - 0.84) / 0.16, 0, 1);
  const radius = (2.1 + form * 4.4) * (1 - absorbed * 0.95);

  for (let i = 2; i >= 0; i--) {
    const bead = Math.max(0, travel - i * 0.075);
    if (i > 0 && (bead <= 0 || absorbed > 0.75)) continue;
    const x = i === 0 ? headX : bead * length;
    const y = i === 0 ? headY : -Math.sin(bead * Math.PI) * bow;
    const r = radius * (1 - i * 0.27);
    const shade = ctx.createRadialGradient(x - r * 0.3, y - r * 0.43, 0, x, y, r * 1.15);
    shade.addColorStop(0, '#F1ADB1');
    shade.addColorStop(0.23, '#B95161');
    shade.addColorStop(0.6, '#751F38');
    shade.addColorStop(1, '#2F1125');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1 + Math.sin(pull * Math.PI) * 0.48), r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (absorbed > 0) {
    const halo = ctx.createRadialGradient(length, 0, 1, length, 0, 13 + absorbed * 7);
    halo.addColorStop(0, `rgba(190, 62, 85, ${Math.sin(absorbed * Math.PI) * 0.66})`);
    halo.addColorStop(1, 'rgba(111, 22, 53, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(length - 21, -21, 42, 42);
  }
}

export function drawSkillTraces(ctx: CanvasRenderingContext2D, traces: SkillTrace[], time: number) {
  for (const trace of traces) {
    const progress = clamp((time - trace.startedAt) / trace.duration, 0, 1);
    const dx = trace.destination.x - trace.fromX;
    const dy = trace.destination.y - trace.fromY;
    const length = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(trace.fromX, trace.fromY);
    ctx.rotate(Math.atan2(dy, dx));
    if (trace.kind === 'blink') {
      if (length > 1) {
        const base = Math.min(length * 0.09, 23);
        const streak = ctx.createLinearGradient(0, 0, length, 0);
        streak.addColorStop(0, 'rgba(123, 184, 204, 0)');
        streak.addColorStop(0.7, 'rgba(167, 218, 231, 0.55)');
        streak.addColorStop(1, 'rgba(228, 245, 248, 0.9)');
        ctx.globalAlpha *= (1 - progress) ** 2;
        ctx.fillStyle = streak;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(length * 0.62, -base, length, 0);
        ctx.quadraticCurveTo(length * 0.78, base * 0.45, 0, 0);
        ctx.fill();
      }
      ctx.globalAlpha = (1 - progress) * 0.68;
      ctx.strokeStyle = '#B6D8E1';
      ctx.lineWidth = 1.5 * (1 - progress) + 0.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 + progress * 15, 13 + progress * 21, 0, -1, 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(length, 0, 8 + progress * 23, 14 + progress * 22, 0, 1.4, 4.9);
      ctx.stroke();
    } else {
      drawBloodSiphon(ctx, progress, length);
    }
    ctx.restore();
  }
}
