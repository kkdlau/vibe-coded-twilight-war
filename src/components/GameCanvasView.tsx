import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { sfx } from '../audio/sfx';
import { FACTIONS, FACTION_CHARACTERS } from '../game/data';
import { CustomMapData } from '../game/customMaps';
import { TwilightEngine } from '../game/engine';
import type { AiDifficulty } from '../game/tuning';
import { CharacterSkin, FactionId, HudSnapshot, MultiplayerEngineConfig, RunRecord } from '../game/types';
import { ClientInputSyncState, RoomLobbyState, shouldSendClientInput } from '../net/protocol';
import type { ActiveMultiplayerSession } from './MultiplayerLobbyView';
import { CharacterAvatarSvg, SkillIconSvg, WeaponIconSvg } from './WeaponArt';

interface GameCanvasViewProps {
  faction: FactionId;
  characterSkin: CharacterSkin;
  mapId: string;
  customMap?: CustomMapData;
  aiDifficulty: AiDifficulty;
  initialReputations: Record<FactionId, number>;
  onReputationsChange: (reps: Record<FactionId, number>, change: Record<FactionId, number>) => void;
  onBackToFaction: () => void;
  onExitLobby: () => void;
  onSaveRecord: (record: RunRecord) => void;
  multiplayer?: {
    session: ActiveMultiplayerSession;
    onReturnToMpLobby: (nextLobby?: RoomLobbyState) => void;
    onLeaveMultiplayer: (reason?: string) => void;
  };
}

const OUTCOME_TITLE_DELAY_MS = 2400;
const OUTCOME_PANEL_DELAY_MS = 850;

function normalizeControlCode(e: KeyboardEvent): string {
  if (e.code && e.code !== 'Unidentified') {
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'KeyQ',
        'KeyR',
        'KeyP',
        'Space',
        'Escape',
      ].includes(e.code)
    ) {
      return e.code;
    }
  }
  const k = e.key.toLowerCase();
  if (k === 'w') return 'KeyW';
  if (k === 'a') return 'KeyA';
  if (k === 's') return 'KeyS';
  if (k === 'd') return 'KeyD';
  if (k === 'q') return 'KeyQ';
  if (k === 'r') return 'KeyR';
  if (k === 'p') return 'KeyP';
  if (k === ' ') return 'Space';
  if (e.key === 'Escape' || e.key === 'Esc') {
    return 'Escape';
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    return e.key;
  }
  return e.code;
}

export const GameCanvasView: React.FC<GameCanvasViewProps> = ({
  faction,
  characterSkin,
  mapId,
  customMap,
  aiDifficulty,
  initialReputations,
  onReputationsChange,
  onBackToFaction,
  onExitLobby,
  onSaveRecord,
  multiplayer,
}) => {
  const [muted, setMuted] = useState(sfx.muted);
  const [tabHeld, setTabHeld] = useState(false);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [runSeed, setRunSeed] = useState(1);
  const [outcomePhase, setOutcomePhase] = useState<'title' | 'panel' | null>(null);
  const [mpRttMs, setMpRttMs] = useState<number | null>(null);
  const outcome = hud?.status === 'VICTORY' || hud?.status === 'GAME_OVER' ? hud.status : null;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TwilightEngine | null>(null);
  const recordSavedRef = useRef(false);
  const matchEndedSentRef = useRef(false);
  const seqsRef = useRef({ clickSeq: 0, reloadSeq: 0, swapSeq: 0, pickupSeq: 0, dropSeq: 0 });
  const clientSyncStateRef = useRef<ClientInputSyncState>({ lastSent: null, lastSentAt: 0, lastAimSentAt: 0 });
  const initRepsRef = useRef(initialReputations);
  initRepsRef.current = initialReputations;
  const repCallbackRef = useRef(onReputationsChange);
  repCallbackRef.current = onReputationsChange;
  const customMapRef = useRef(customMap);
  customMapRef.current = customMap;
  const multiplayerRef = useRef(multiplayer);
  multiplayerRef.current = multiplayer;

  const mpRoomKey = multiplayer
    ? `${multiplayer.session.lobby.roomCode}:${multiplayer.session.localPeerId}:${multiplayer.session.isHost ? 'h' : 'c'}`
    : 'solo';

  const syncMouseFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const eng = engineRef.current;
    if (!canvas || !eng) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(canvas.width, ((clientX - rect.left) / rect.width) * canvas.width));
    const y = Math.max(0, Math.min(canvas.height, ((clientY - rect.top) / rect.height) * canvas.height));
    eng.setMousePos(x, y);
  };

  const sendClientInputIfNeeded = (force = false) => {
    const mp = multiplayerRef.current;
    const eng = engineRef.current;
    if (!mp || mp.session.isHost || !eng) return;
    const inp = eng.getLocalInputSnapshot(seqsRef.current);
    const now = performance.now();
    const syncState = clientSyncStateRef.current;
    if (!force) {
      const hints = eng.getClientSyncHints();
      if (!shouldSendClientInput(inp, syncState, { now, ...hints })) {
        return;
      }
      if (mp.session.transport.getBufferedAmount() > 16_384) {
        return;
      }
    }
    const prev = syncState.lastSent;
    const aimMoved = !prev || Math.hypot(inp.aimX - prev.aimX, inp.aimY - prev.aimY) >= 1;
    syncState.lastSent = inp;
    syncState.lastSentAt = now;
    if (force || aimMoved) {
      syncState.lastAimSentAt = now;
    }
    mp.session.transport.send({
      type: 'player_input',
      input: prev ? inp : { ...inp, startingReputation: eng.player.reputations[eng.player.faction] },
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.focus();
    sfx.prepareGunshot();
    recordSavedRef.current = false;
    matchEndedSentRef.current = false;
    seqsRef.current = { clickSeq: 0, reloadSeq: 0, swapSeq: 0, pickupSeq: 0, dropSeq: 0 };
    clientSyncStateRef.current = { lastSent: null, lastSentAt: 0, lastAimSentAt: 0 };

    const mp = multiplayerRef.current;
    const mpConfig: MultiplayerEngineConfig | undefined = mp
      ? {
          role: mp.session.isHost ? 'host' : 'client',
          localPeerId: mp.session.localPeerId,
          hostPeerId: mp.session.lobby.hostPeerId,
          peers: mp.session.lobby.players.map((pl) => ({
            peerId: pl.peerId,
            name: pl.name,
            faction: pl.faction,
            characterSkin:
              FACTION_CHARACTERS[pl.faction].find((s) => s.id === pl.skinId) ||
              FACTION_CHARACTERS[pl.faction][0],
            isHost: pl.isHost,
          })),
        }
      : undefined;

    const engine = new TwilightEngine(
      faction,
      characterSkin,
      mapId,
      initRepsRef.current,
      (snap) => setHud(snap),
      (reps, change) => repCallbackRef.current(reps, change),
      customMapRef.current,
      aiDifficulty,
      mpConfig
    );
    engineRef.current = engine;

    const resize = () => {
      const stage = stageRef.current;
      const rect = stage?.getBoundingClientRect();
      const w = rect && rect.width > 0 ? Math.round(rect.width) : Math.round(Math.min(window.innerWidth, (window.innerHeight * 4) / 3));
      const h = rect && rect.height > 0 ? Math.round(rect.height) : Math.round(Math.min(window.innerHeight, (window.innerWidth * 3) / 4));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    engine.setMousePos(canvas.width / 2, canvas.height / 2);
    window.addEventListener('resize', resize);
    const resizeObserver = stageRef.current ? new ResizeObserver(resize) : null;
    if (resizeObserver && stageRef.current) {
      resizeObserver.observe(stageRef.current);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (engine.status === 'VICTORY' || engine.status === 'GAME_OVER') return;
      if (e.code === 'Tab' || e.key === 'Tab') {
        e.preventDefault();
        setTabHeld(true);
        return;
      }
      if (!e.repeat) sfx.unlock();
      const norm = normalizeControlCode(e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape'].includes(norm)) {
        e.preventDefault();
      }
      engineRef.current?.setKey(norm, true);
      if (mp && !mp.session.isHost && !e.repeat) {
        let isAction = false;
        if (norm === 'KeyR') {
          seqsRef.current.reloadSeq += 1;
          isAction = true;
        } else if (norm === 'KeyQ') {
          seqsRef.current.swapSeq += 1;
          isAction = true;
        } else if (norm === 'Space') {
          seqsRef.current.pickupSeq += 1;
          isAction = true;
        } else if (norm === 'Escape') {
          seqsRef.current.dropSeq += 1;
          isAction = true;
        }
        sendClientInputIfNeeded(isAction);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (engine.status === 'VICTORY' || engine.status === 'GAME_OVER') return;
      if (e.code === 'Tab' || e.key === 'Tab') {
        e.preventDefault();
        setTabHeld(false);
        return;
      }
      const norm = normalizeControlCode(e);
      engineRef.current?.setKey(norm, false);
      if (mp && !mp.session.isHost) {
        sendClientInputIfNeeded(false);
      }
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      syncMouseFromClient(e.clientX, e.clientY);
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        engineRef.current?.setMouseDown(false);
        if (mp && !mp.session.isHost) {
          sendClientInputIfNeeded(true);
        }
      }
    };

    const onBlur = () => {
      setTabHeld(false);
      engineRef.current?.clearInputs();
      if (mp && !mp.session.isHost) {
        sendClientInputIfNeeded(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('blur', onBlur);

    let offMpMsg: (() => void) | null = null;
    let offMpClose: (() => void) | null = null;
    let mpTickTimer: number | null = null;
    let mpRttTimer: number | null = null;

    if (mp) {
      const { transport, isHost } = mp.session;
      offMpMsg = transport.onMessage((msg) => {
        if (msg.type === 'remote_input' && isHost) {
          engine.setRemoteInput(msg.peerId, msg.input);
        } else if (msg.type === 'peer_left' && isHost) {
          engine.removeRemoteHuman(msg.peerId);
        } else if (msg.type === 'world_snapshot' && !isHost) {
          engine.applyWorldSnapshot(msg.snapshot);
        } else if (msg.type === 'lobby_state' && msg.lobby.phase === 'lobby') {
          multiplayerRef.current?.onReturnToMpLobby(msg.lobby);
        } else if (msg.type === 'room_closed') {
          multiplayerRef.current?.onLeaveMultiplayer(msg.reason);
        }
      });

      offMpClose = transport.onClose((info) => {
        multiplayerRef.current?.onLeaveMultiplayer(info.reason || '與房間的連線已中斷');
      });

      if (isHost) {
        let lastHostSnapAt = performance.now();
        transport.send({ type: 'world_snapshot', snapshot: engine.exportWorldSnapshot() });
        mpTickTimer = window.setInterval(() => {
          if (engine.status === 'PLAYING' || engine.status === 'RESPAWNING' || engine.status === 'PAUSED') {
            const now = performance.now();
            const { intervalMs, hasEvents } = engine.getRecommendedSnapshotIntervalMs();
            if (now - lastHostSnapAt >= intervalMs && (hasEvents || transport.getBufferedAmount() <= 16_384)) {
              lastHostSnapAt = now;
              transport.send({ type: 'world_snapshot', snapshot: engine.exportWorldSnapshot() });
            }
          }
        }, 25);
      } else {
        sendClientInputIfNeeded(true);
        mpTickTimer = window.setInterval(() => {
          sendClientInputIfNeeded(false);
        }, 50);
      }

      mpRttTimer = window.setInterval(() => {
        setMpRttMs(transport.getRttMs());
      }, 1500);
    }

    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const eng = engineRef.current;
      if (eng) {
        eng.update(dt, canvas.width, canvas.height);
        eng.render(ctx, canvas.width, canvas.height);
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      if (mpTickTimer !== null) window.clearInterval(mpTickTimer);
      if (mpRttTimer !== null) window.clearInterval(mpRttTimer);
      offMpMsg?.();
      offMpClose?.();
      engine.clearInputs();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [faction, characterSkin, mapId, aiDifficulty, runSeed, mpRoomKey]);

  useEffect(() => {
    setOutcomePhase(null);
    if (!outcome) return;
    setTabHeld(false);
    let panelTimer: number | undefined;
    const titleTimer = window.setTimeout(() => {
      setOutcomePhase('title');
      panelTimer = window.setTimeout(() => setOutcomePhase('panel'), OUTCOME_PANEL_DELAY_MS);
    }, OUTCOME_TITLE_DELAY_MS);
    return () => {
      window.clearTimeout(titleTimer);
      window.clearTimeout(panelTimer);
    };
  }, [outcome, runSeed]);

  useEffect(() => {
    if (!hud) return;
    if (hud.status === 'GAME_OVER' || hud.status === 'VICTORY') {
      const mp = multiplayerRef.current;
      const eng = engineRef.current;
      if (mp?.session.isHost && eng && !matchEndedSentRef.current) {
        matchEndedSentRef.current = true;
        mp.session.transport.send({ type: 'world_snapshot', snapshot: eng.exportWorldSnapshot() });
        mp.session.transport.send({ type: 'match_ended' });
      }
      if (!recordSavedRef.current) {
        recordSavedRef.current = true;
        onSaveRecord({
          id: `${Date.now()}`,
          mode: hud.mode,
          mapName: hud.mapName,
          faction: hud.player.faction,
          characterName: hud.player.characterSkin.name,
          score: hud.player.score,
          totalDamage: hud.player.totalDamage,
          kills: hud.player.kills,
          victory: hud.status === 'VICTORY',
          timestamp: Date.now(),
        });
      }
    }
  }, [hud, onSaveRecord]);

  const toggleMute = () => {
    sfx.muted = !sfx.muted;
    setMuted(sfx.muted);
  };

  const p = hud?.player;
  const facInfo = p ? FACTIONS[p.faction] : FACTIONS[faction];
  const hpPct = p ? Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100))) : 100;
  const qiPct = p ? Math.max(0, Math.min(100, (p.qi / p.maxQi) * 100)) : 100;

  const outerR = 46;
  const outerCirc = 2 * Math.PI * outerR;
  const outerDash = outerCirc * (hpPct / 100);

  const innerR = 37;
  const innerCirc = 2 * Math.PI * innerR;
  const innerDash = innerCirc * (qiPct / 100);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#05080F] select-none flex items-center justify-center">
      <div
        ref={stageRef}
        className="relative overflow-hidden bg-[#0B0F17] border border-slate-800/90 shadow-[0_0_60px_rgba(0,0,0,0.85)]"
        style={{
          width: 'min(100vw, calc(100vh * 4 / 3))',
          height: 'min(100vh, calc(100vw * 3 / 4))',
        }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          className="block w-full h-full cursor-none outline-none"
          onMouseDown={(e) => {
            canvasRef.current?.focus();
            syncMouseFromClient(e.clientX, e.clientY);
            if (e.button === 0) {
              sfx.unlock();
              engineRef.current?.setMouseDown(true);
              if (multiplayer && !multiplayer.session.isHost) {
                seqsRef.current.clickSeq += 1;
                sendClientInputIfNeeded(true);
              }
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
        />

      {/* TOP-LEFT HUD: Dual-Ring (HP & Qi) + Right-Side Timed Skill Matrix + Shield Bar */}
      {hud && p && (
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
          <div className="flex items-start gap-2.5">
            <div className="relative w-[112px] h-[112px] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 112 112" className="w-full h-full -rotate-90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
                <circle cx="56" cy="56" r={outerR} fill="rgba(15,23,42,0.72)" stroke="#1E293B" strokeWidth="8" />
                <circle
                  cx="56"
                  cy="56"
                  r={outerR}
                  fill="none"
                  stroke={hpPct > 35 ? '#4ADE80' : '#F43F5E'}
                  strokeWidth="7"
                  strokeDasharray={`${outerDash} ${outerCirc}`}
                  strokeLinecap="round"
                  className="transition-all duration-100"
                />
                <circle cx="56" cy="56" r={innerR} fill="none" stroke="#0F172A" strokeWidth="6" />
                <circle
                  cx="56"
                  cy="56"
                  r={innerR}
                  fill="none"
                  stroke={p.chargeReady ? '#FBBF24' : '#38BDF8'}
                  strokeWidth="5.5"
                  strokeDasharray={`${innerDash} ${innerCirc}`}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="font-mono-num text-xl font-black text-white leading-none"
                  style={{ WebkitTextStroke: '1px #020617', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}
                >
                  {hpPct}%
                </span>
                <div className="flex items-center gap-0.5 mt-1">
                  {Array.from({ length: p.maxLives }).map((_, i) => (
                    <Heart
                      key={i}
                      className={`w-3.5 h-3.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                        i < p.lives ? 'text-rose-500 fill-rose-500' : 'text-slate-700 fill-slate-800'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Active Timed Skill Matrix Boxes (Left-to-right grey mask over centered skill icon) */}
            {p.activeTimedSkills.length > 0 && (
              <div className="flex items-center gap-2 pt-2">
                {p.activeTimedSkills.map((sk) => {
                  const elapsedPct = Math.min(100, Math.max(0, (1 - sk.remaining / sk.duration) * 100));
                  return (
                    <div key={sk.id} className="flex flex-col items-center gap-0.5">
                      <div
                        className="relative w-12 h-12 rounded-lg border border-slate-600/90 bg-slate-950/90 flex items-center justify-center overflow-hidden shadow-lg"
                        style={{ borderColor: sk.color }}
                      >
                        <SkillIconSvg id={sk.id} className="w-8 h-8 relative z-0" />
                        <div
                          className="absolute inset-y-0 left-0 bg-slate-900/80 z-10 pointer-events-none"
                          style={{ width: `${elapsedPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono-num font-bold text-slate-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                        {sk.remaining.toFixed(1)}s
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-slate-950/78 border border-slate-800/90 rounded-lg px-2.5 py-1.5 backdrop-blur-xs flex items-center gap-2.5 min-w-[205px]">
            <CharacterAvatarSvg skin={p.characterSkin} className="w-8 h-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className={facInfo.color}>{facInfo.name}</span>
                {p.chargeReady && <span className="text-amber-400">氣滿可放</span>}
              </div>
              <div className="text-[11px] text-slate-300 truncate">{p.characterSkin.name}</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono-num bg-slate-900/85 border border-slate-700/80 rounded px-2 py-0.5">
                <span className="text-[11px] font-sans text-slate-300">聲望</span>
                <strong className="text-sm font-black text-amber-300 leading-none">{p.reputation}</strong>
                <span className="text-slate-600">·</span>
                <span className="text-xs font-bold text-sky-300">氣 {p.qiSpeedMultiplier.toFixed(2)}×</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOP-CENTER: Transient Combat Banners Only (Keeps Top-Right 100% Clear for Aiming) */}
      {hud && (hud.activeSkillBanner || hud.bannerText) && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-full max-w-xl px-4">
          {hud.activeSkillBanner && (
            <div className="bg-slate-950/90 border border-sky-400/70 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg">
              技能發動：{hud.activeSkillBanner}
            </div>
          )}
          {hud.bannerText && (
            <div className="bg-slate-950/88 border border-amber-500/60 text-amber-200 px-5 py-1.5 rounded-lg text-sm font-semibold shadow-lg text-center">
              {hud.bannerText}
            </div>
          )}
        </div>
      )}

      {/* BOTTOM-LEFT: Controls */}
      {hud && p && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col items-start gap-2">
          <div className="text-[11px] text-slate-200 bg-slate-950/78 px-3 py-1.5 rounded-lg border border-slate-800/90">
            [Q] 切換 · [Esc] 放下武器 · [R] 裝彈 · [Space] 拾取 · [Tab] 遊戲進展
            {(!multiplayer || multiplayer.session.isHost) && ' · [P] 暫停'}
          </div>
        </div>
      )}

      {/* BOTTOM-RIGHT: Multiplayer Room & Latency Indicator */}
      {multiplayer && (
        <div className="pointer-events-none absolute bottom-3 right-3 bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-[11px] font-mono-num text-sky-300 shadow-lg">
          房號 {multiplayer.session.lobby.roomCode} · {multiplayer.session.lobby.players.length} 人 ·{' '}
          {multiplayer.session.isHost ? '房主' : '連線玩家'}
          {mpRttMs !== null ? ` · ${mpRttMs}ms` : ''}
        </div>
      )}

      {/* TOP-RIGHT: Active Weapon (Lower-Left, Larger, Higher Z) + Off-Hand (Upper-Right, Smaller, Lower Z) + Gun Ammo Directly Below */}
      {hud && p && (
        <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-center">
          <div className="relative w-24 h-20">
            {/* Off-hand weapon: upper-right, lower z-index, smaller/thinner */}
            <div className="absolute top-0 right-0 z-0 opacity-65 scale-90">
              <WeaponIconSvg kind={p.offHandWeapon.def.kind} color={p.offHandWeapon.def.color} className="w-9 h-9" />
            </div>

            {/* Active hand weapon: lower-left, higher z-index, larger */}
            <div className="absolute bottom-0 left-0 z-10 drop-shadow-[0_3px_6px_rgba(0,0,0,0.95)]">
              <WeaponIconSvg kind={p.weapon.def.kind} color={p.weapon.def.color} className="w-16 h-16" />
            </div>
          </div>

          {/* Ammo / Shield Durability shown ONLY directly beneath the active weapon icon */}
          {p.weapon.type === 'gun' ? (
            <div
              className="mt-0.5 flex items-center justify-center gap-2 font-cyrbit text-sm font-black"
              style={{ textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}
            >
              <span className="text-white">
                {p.weapon.ammoInMag}/{p.weapon.def.magSize}
              </span>
              <span className="text-amber-400">{p.reserveAmmo}</span>
            </div>
          ) : p.weapon.def.kind === 'shield' ? (
            <div
              className="mt-0.5 flex items-center justify-center font-cyrbit text-sm font-black"
              style={{ textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}
            >
              <span className={p.shield <= 25 ? 'text-amber-400' : 'text-white'}>
                {p.shield}/{p.maxShield}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB OVERLAY: Match Progress, Remaining Targets & Scoreboard */}
      {tabHeld && hud && p && hud.status === 'PLAYING' && (
        <div className="pointer-events-none fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-20">
          <div className="w-full max-w-2xl bg-[#111827]/95 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">戰場遊戲進展總覽</h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  {hud.mapName} · {facInfo.name}（{p.characterSkin.name}）
                </div>
              </div>
              <span className="text-xs text-slate-400">放開 Tab 鍵關閉</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 font-mono-num text-sm">
              <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-400">剩餘敵對目標</div>
                <div className="text-xl font-bold text-rose-400">{hud.enemiesRemaining}</div>
              </div>
              <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-400">目前積分 / 聲望</div>
                <div className="text-lg font-bold text-white">
                  {p.score} <span className="text-sky-400 text-sm">/ {p.reputation}</span>
                </div>
              </div>
              <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-400">累計總傷害</div>
                <div className="text-xl font-bold text-amber-400">{p.totalDamage}</div>
              </div>
              <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-400">擊殺數 / 最高連殺</div>
                <div className="text-lg font-bold text-emerald-400">
                  {p.kills} / {p.maxCombo}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 font-mono-num text-xs">
              <div className="bg-slate-900/90 p-3 rounded-lg border border-sky-500/30">
                <div className="text-white font-sans font-bold mb-1">皇家騎士團</div>
                <div className="text-white text-sm font-bold">總兵力 {hud.factionRemaining.royal} / 10</div>
                <div className="text-slate-400 mt-0.5">場上現役：{hud.factionActive.royal} 人</div>
                <div className="text-sky-300 mt-1">皇家聲望：{p.reputations.royal}</div>
              </div>
              <div className="bg-slate-900/90 p-3 rounded-lg border border-fuchsia-700/40">
                <div className="font-sans font-bold mb-1" style={{ color: '#C026D3' }}>
                  天影十字軍
                </div>
                <div className="text-white text-sm font-bold">總兵力 {hud.factionRemaining.shadow} / 10</div>
                <div className="text-slate-400 mt-0.5">場上現役：{hud.factionActive.shadow} 人</div>
                <div className="text-fuchsia-300 mt-1">天影聲望：{p.reputations.shadow}</div>
              </div>
              <div className="bg-slate-900/90 p-3 rounded-lg border border-amber-500/30">
                <div className="text-amber-500 font-sans font-bold mb-1">第三勢力（傭兵團）</div>
                <div className="text-white text-sm font-bold">總兵力 {hud.factionRemaining.mercenary} / 10</div>
                <div className="text-slate-400 mt-0.5">場上現役：{hud.factionActive.mercenary} 人</div>
                <div className="text-amber-300 mt-1">第三聲望：{p.reputations.mercenary}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {hud?.status === 'RESPAWNING' && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center" role="status">
          <div className="rounded-xl border border-rose-400/50 bg-slate-950/90 px-6 py-4 text-center shadow-xl">
            <div className="text-lg font-bold text-rose-200">你已倒下</div>
            <div className="mt-1 text-sm tabular-nums text-slate-200">{hud.respawnSeconds} 秒後重返戰場</div>
          </div>
        </div>
      )}
      </div>

      {/* PAUSE MODAL (Triggered via [P]) */}
      {hud?.status === 'PAUSED' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-30">
          <div className="w-full max-w-sm bg-[#111827] border border-slate-700 rounded-xl p-6 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">遊戲暫停</h2>
            <p className="text-sm text-slate-400 mb-6">{hud.mapName} · 按 P 鍵隨時返回戰場</p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  if (engineRef.current) {
                    engineRef.current.status = 'PLAYING';
                    engineRef.current.emitHud();
                    canvasRef.current?.focus();
                  }
                }}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg cursor-pointer"
              >
                繼續戰鬥
              </button>
              <button
                onClick={toggleMute}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-lg cursor-pointer flex items-center justify-center gap-2"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{muted ? '開啟戰鬥音效' : '靜音戰鬥音效'}</span>
              </button>
              {multiplayer ? (
                <>
                  {multiplayer.session.isHost && (
                    <button
                      onClick={() => multiplayer.session.transport.send({ type: 'return_to_lobby' })}
                      className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-sm rounded-lg cursor-pointer"
                    >
                      結束本局並返回房間
                    </button>
                  )}
                  <button
                    onClick={() => {
                      multiplayer.session.transport.disconnect('Left room');
                      multiplayer.onLeaveMultiplayer();
                    }}
                    className="w-full py-2.5 border border-rose-500/50 hover:bg-rose-950/60 text-rose-200 text-sm rounded-lg cursor-pointer"
                  >
                    離開多人房間
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setRunSeed((s) => s + 1)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-lg cursor-pointer"
                  >
                    重新開局
                  </button>
                  <button
                    onClick={onBackToFaction}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-sm rounded-lg cursor-pointer"
                  >
                    返回陣營界面（更換角色／地圖）
                  </button>
                  <button
                    onClick={onExitLobby}
                    className="w-full py-2.5 border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm rounded-lg cursor-pointer"
                  >
                    返回遊戲大廳
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {outcome && outcomePhase && hud && p && (
        <div className="match-outcome fixed inset-0 z-40 flex flex-col items-center overflow-y-auto bg-[#080d18]/75 px-4 pb-4 pt-[min(18vh,8rem)]">
          <h2
            role="status"
            className={`match-outcome-title mb-4 text-center text-4xl font-bold tracking-wider sm:text-5xl ${
              outcome === 'VICTORY' ? 'text-amber-300' : 'text-rose-300'
            }`}
          >
            {outcome === 'VICTORY' ? '遊戲勝利' : '遊戲失敗'}
          </h2>
          {outcomePhase === 'panel' && (
            <div className="match-outcome-panel w-full max-w-md rounded-xl border border-slate-700 bg-[#111827] p-5 shadow-2xl sm:p-7">
              <div className="mb-2 text-xs text-slate-400">
                {hud.mapName} · {facInfo.name} · 戰役結算
              </div>
              <p className="text-sm text-slate-300 mb-6">
                {hud.status === 'VICTORY'
                  ? faction === 'mercenary'
                    ? '你已清除全場所有敵我勢力，以孤狼之姿稱霸戰場！'
                    : `你已協助${facInfo.name}清除全數非己方勢力，奪下本場勝利！`
                  : '結算統計已寫入本地戰績殿堂，準備好再次出戰了嗎？'}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6 font-mono-num">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400">最終積分</div>
                  <div className="text-xl font-bold text-white">{p.score}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400">總傷害輸出</div>
                  <div className="text-xl font-bold text-amber-400">{p.totalDamage}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400">擊殺數 / 最高連殺</div>
                  <div className="text-lg font-bold text-sky-400">
                    {p.kills} / {p.maxCombo}
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400">三方獨立聲望</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1">
                    皇 {p.reputations.royal} / 影 {p.reputations.shadow} / 三 {p.reputations.mercenary}
                  </div>
                </div>
              </div>

              {multiplayer ? (
                <div className="flex flex-col gap-2.5">
                  {multiplayer.session.isHost ? (
                    <button
                      onClick={() => multiplayer.session.transport.send({ type: 'return_to_lobby' })}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      返回多人房間（再戰一局）
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-3 bg-slate-900 border border-slate-700 text-sky-200 text-xs font-semibold text-center rounded-lg">
                      等待房主決定返回房間再開下一局...（戰局結束 60 秒無動作將自動清理房間）
                    </div>
                  )}
                  <button
                    onClick={() => {
                      multiplayer.session.transport.disconnect('Left room');
                      multiplayer.onLeaveMultiplayer();
                    }}
                    className="w-full py-2.5 border border-rose-500/50 hover:bg-rose-950/60 text-rose-200 text-sm font-medium rounded-lg cursor-pointer"
                  >
                    離開房間
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRunSeed((s) => s + 1)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      再戰一局
                    </button>
                    <button
                      onClick={onBackToFaction}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 text-sm font-medium rounded-lg cursor-pointer"
                    >
                      陣營界面
                    </button>
                  </div>
                  <button
                    onClick={onExitLobby}
                    className="w-full py-2.5 border border-slate-700 hover:bg-slate-800 text-slate-200 text-sm font-medium rounded-lg cursor-pointer"
                  >
                    返回大廳
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
