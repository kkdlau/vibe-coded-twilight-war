import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  KeyRound,
  LogIn,
  Play,
  Plus,
  Shuffle,
  Users,
  Wifi,
} from 'lucide-react';
import { CustomMapData } from '../game/customMaps';
import { FACTIONS, FACTION_CHARACTERS, GUNS, MAP_CATALOG, MELEES } from '../game/data';
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
import { FactionId, GameMode, SiegeMatchDurationSec, SiegePlayerLoadout } from '../game/types';
import {
  MAX_ROOM_PLAYERS,
  RoomLobbyState,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeNickname,
} from '../net/protocol';
import { RoomTransport, WebSocketRoomTransport } from '../net/transport';
import { MiniMapPreview } from './MiniMapPreview';
import { CharacterAvatarSvg, FactionLogoSvg, WeaponIconSvg } from './WeaponArt';

const NICKNAME_STORAGE_KEY = 'twilight_wars_mp_nickname_v1';
const RECONNECT_STORAGE_KEY = 'twilight_wars_reconnect_v1';

interface SavedReconnectSeat {
  peerId: string;
  token: string;
  name: string;
}

function loadReconnectSeat(roomCode: string): SavedReconnectSeat | null {
  try {
    const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, SavedReconnectSeat>;
    return map[roomCode] ?? null;
  } catch {
    return null;
  }
}

function saveReconnectSeat(roomCode: string, seat: SavedReconnectSeat) {
  try {
    const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, SavedReconnectSeat>) : {};
    map[roomCode] = seat;
    localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function clearReconnectSeat(roomCode?: string | null) {
  if (!roomCode) return;
  try {
    const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, SavedReconnectSeat>;
    delete map[roomCode];
    localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export interface ActiveMultiplayerSession {
  transport: RoomTransport;
  lobby: RoomLobbyState;
  localPeerId: string;
  isHost: boolean;
}

interface MultiplayerLobbyViewProps {
  initialRoomCode?: string;
  customMaps: CustomMapData[];
  existingSession: ActiveMultiplayerSession | null;
  onSessionUpdate: (session: ActiveMultiplayerSession | null) => void;
  onMatchStarted: (session: ActiveMultiplayerSession) => void;
  onBackToPortal: () => void;
}

function loadSavedNickname(): string {
  try {
    const raw = localStorage.getItem(NICKNAME_STORAGE_KEY);
    return raw ? sanitizeNickname(raw) : '特戰隊員';
  } catch {
    return '特戰隊員';
  }
}

export const MultiplayerLobbyView: React.FC<MultiplayerLobbyViewProps> = ({
  initialRoomCode = '',
  customMaps,
  existingSession,
  onSessionUpdate,
  onMatchStarted,
  onBackToPortal,
}) => {
  const [nickname, setNickname] = useState<string>(() => loadSavedNickname());
  const [joinCodeInput, setJoinCodeInput] = useState<string>(() => normalizeRoomCode(initialRoomCode) ?? '');
  const [passcode, setPasscode] = useState<string>('');
  const [passcodeRequired, setPasscodeRequired] = useState<boolean>(false);
  const [showPasscodeField, setShowPasscodeField] = useState<boolean>(false);

  const initialSelfPlayer = existingSession?.lobby.players.find(
    (p) => p.peerId === existingSession.localPeerId
  );
  const initialMode: GameMode = existingSession?.lobby.mode === 'siege' ? 'siege' : 'frontier';
  const initialFac: FactionId =
    initialMode === 'siege' && (!initialSelfPlayer || initialSelfPlayer.faction === 'mercenary')
      ? 'royal'
      : (initialSelfPlayer?.faction ?? 'royal');
  const initialSkin =
    initialSelfPlayer?.skinId &&
    FACTION_CHARACTERS[initialFac].some((s) => s.id === initialSelfPlayer.skinId)
      ? initialSelfPlayer.skinId
      : FACTION_CHARACTERS[initialFac][0].id;
  const initialSiegeFac = initialFac === 'shadow' ? 'shadow' : 'royal';

  const [selectedFaction, setSelectedFaction] = useState<FactionId>(initialFac);
  const [selectedSkinId, setSelectedSkinId] = useState<string>(initialSkin);
  const [roomMode, setRoomMode] = useState<GameMode>(initialMode);
  const [siegeDurationSec, setSiegeDurationSec] = useState<SiegeMatchDurationSec>(
    existingSession?.lobby.siegeDurationSec ?? 1080
  );
  const [mapChoice, setMapChoice] = useState<string>(() => {
    if (!existingSession?.lobby || existingSession.lobby.mode === 'siege') return 'random';
    return existingSession.lobby.customMap?.id ?? existingSession.lobby.mapId ?? 'random';
  });
  const [difficulty, setDifficulty] = useState<AiDifficulty>(
    existingSession?.lobby.difficulty ?? 'standard'
  );

  const [connecting, setConnecting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<boolean>(false);

  const [session, setSession] = useState<ActiveMultiplayerSession | null>(existingSession);
  const transportRef = useRef<RoomTransport | null>(existingSession?.transport ?? null);
  const localPeerIdRef = useRef<string | null>(existingSession?.localPeerId ?? null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const handedOffToBattleRef = useRef<boolean>(false);
  const autoRejoinAttemptedRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { passcodeRequired?: boolean } | null) => {
        if (cancelled) return;
        const req = Boolean(data?.passcodeRequired);
        if (req) {
          setPasscodeRequired(true);
          setShowPasscodeField(true);
        }
        const normalizedInit = normalizeRoomCode(initialRoomCode);
        if (!req && normalizedInit && !existingSession && !autoRejoinAttemptedRef.current) {
          const savedSeat = loadReconnectSeat(normalizedInit);
          if (savedSeat) {
            autoRejoinAttemptedRef.current = true;
            void connectToRoom(normalizedInit, savedSeat.name);
          }
        }
      })
      .catch(() => {
        // ignore if offline/unavailable during preview
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wire listeners onto current transport (either freshly connected or returning from battle)
  const attachTransportListeners = (
    transport: RoomTransport,
    targetOnStart: (sess: ActiveMultiplayerSession) => void
  ) => {
    listenerCleanupRef.current?.();
    const offOpen = transport.onOpen(() => {
      setConnecting(false);
    });
    const offMsg = transport.onMessage((msg) => {
      if (msg.type === 'welcome') {
        localPeerIdRef.current = msg.peerId;
        if (msg.reconnectToken) {
          const me = msg.lobby.players.find((p) => p.peerId === msg.peerId);
          saveReconnectSeat(msg.lobby.roomCode, {
            peerId: msg.peerId,
            token: msg.reconnectToken,
            name: me?.name ?? sanitizeNickname(nickname),
          });
        }
        const nextSess: ActiveMultiplayerSession = {
          transport,
          lobby: msg.lobby,
          localPeerId: msg.peerId,
          isHost: msg.lobby.hostPeerId === msg.peerId,
        };
        setConnecting(false);
        setErrorMsg(null);
        setSession(nextSess);
        onSessionUpdate(nextSess);
      } else if (msg.type === 'lobby_state') {
        const peerId = localPeerIdRef.current;
        if (!peerId) return;
        const nextSess: ActiveMultiplayerSession = {
          transport,
          lobby: msg.lobby,
          localPeerId: peerId,
          isHost: msg.lobby.hostPeerId === peerId,
        };
        setSession(nextSess);
        onSessionUpdate(nextSess);
      } else if (msg.type === 'match_started') {
        const peerId = localPeerIdRef.current;
        if (!peerId) return;
        const nextSess: ActiveMultiplayerSession = {
          transport,
          lobby: msg.lobby,
          localPeerId: peerId,
          isHost: msg.lobby.hostPeerId === peerId,
        };
        handedOffToBattleRef.current = true;
        setSession(nextSess);
        onSessionUpdate(nextSess);
        targetOnStart(nextSess);
      } else if (msg.type === 'room_closed') {
        clearReconnectSeat(session?.lobby.roomCode ?? joinCodeInput);
        setErrorMsg(msg.reason || '房間已關閉');
        setSession(null);
        onSessionUpdate(null);
        transportRef.current = null;
        localPeerIdRef.current = null;
      } else if (msg.type === 'error') {
        setErrorMsg(msg.message);
        setConnecting(false);
      }
    });
    const offClose = transport.onClose((info) => {
      setConnecting(false);
      if (info.code !== 1000 && info.reason) {
        setErrorMsg(info.reason);
      } else if (info.code === 1006) {
        setErrorMsg('無法連線至房間（請確認房號、通行密碼或伺服器是否已啟動）。');
      }
      setSession(null);
      onSessionUpdate(null);
      transportRef.current = null;
      localPeerIdRef.current = null;
    });

    const cleanup = () => {
      offOpen();
      offMsg();
      offClose();
    };
    listenerCleanupRef.current = cleanup;
    return cleanup;
  };

  useEffect(() => {
    handedOffToBattleRef.current = false;
    const existing = transportRef.current;
    if (!existing) return;
    const cleanup = attachTransportListeners(existing, onMatchStarted);
    return () => {
      cleanup();
    };
  }, [onMatchStarted]);

  useEffect(() => {
    const lobby = session?.lobby;
    if (!lobby) return;
    const nextMode: GameMode = lobby.mode === 'siege' ? 'siege' : 'frontier';
    setRoomMode(nextMode);
    if (lobby.siegeDurationSec) {
      setSiegeDurationSec(lobby.siegeDurationSec);
    }
    setDifficulty(lobby.difficulty);
    if (nextMode !== 'siege' && lobby.mapId && lobby.mapId !== SIEGE_MAP_ID) {
      setMapChoice((prev) => (prev === 'random' ? 'random' : lobby.customMap?.id ?? lobby.mapId));
    }
    const me = lobby.players.find((pl) => pl.peerId === session.localPeerId);
    if (me) {
      const safeFac: FactionId = nextMode === 'siege' && me.faction === 'mercenary' ? 'royal' : me.faction;
      const validSkin = FACTION_CHARACTERS[safeFac].some((s) => s.id === me.skinId)
        ? me.skinId
        : FACTION_CHARACTERS[safeFac][0].id;
      setSelectedFaction(safeFac);
      setSelectedSkinId(validSkin);
    }
  }, [session?.lobby, session?.localPeerId]);

  const connectToRoom = async (roomCode: string, overrideName?: string) => {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) {
      setErrorMsg('請輸入有效的 6 位英數字房號。');
      return;
    }

    const cleanName = sanitizeNickname(overrideName ?? nickname);
    try {
      localStorage.setItem(NICKNAME_STORAGE_KEY, cleanName);
    } catch {
      // ignore
    }

    setErrorMsg(null);
    setConnecting(true);

    try {
      const checkRes = await fetch('/api/health');
      if (checkRes.ok) {
        const info = (await checkRes.json()) as { passcodeRequired?: boolean };
        if (info.passcodeRequired && !passcode.trim()) {
          setPasscodeRequired(true);
          setShowPasscodeField(true);
          setConnecting(false);
          setErrorMsg('此伺服器已啟用私人通行密碼，請輸入密碼後再加入。');
          return;
        }
      }
    } catch {
      // fallback to WS attempt
    }

    const savedSeat = loadReconnectSeat(normalized);
    transportRef.current?.disconnect('Switching room');
    const transport = new WebSocketRoomTransport();
    transportRef.current = transport;
    attachTransportListeners(transport, onMatchStarted);
    transport.connect({
      roomCode: normalized,
      name: cleanName,
      faction: selectedFaction,
      skinId: selectedSkinId,
      passcode: passcode.trim() || undefined,
      resumePeerId: savedSeat?.peerId,
      resumeToken: savedSeat?.token,
    });
  };

  const handleLeaveRoom = () => {
    clearReconnectSeat(session?.lobby.roomCode);
    transportRef.current?.disconnect('Player left lobby');
    transportRef.current = null;
    localPeerIdRef.current = null;
    setSession(null);
    onSessionUpdate(null);
  };

  const handleBack = () => {
    handleLeaveRoom();
    onBackToPortal();
  };

  const pushProfileUpdate = (
    nextName: string,
    nextFaction: FactionId,
    nextSkinId: string
  ) => {
    const activeMode = session?.lobby.mode ?? roomMode;
    const clampedFac: FactionId =
      activeMode === 'siege' && nextFaction === 'mercenary' ? 'royal' : nextFaction;
    const clampedSkin =
      clampedFac !== nextFaction ? FACTION_CHARACTERS[clampedFac][0].id : nextSkinId;
    setSelectedFaction(clampedFac);
    setSelectedSkinId(clampedSkin);
    const effFac = clampedFac === 'shadow' ? 'shadow' : 'royal';
    const resolvedLoadout = getDefaultSiegeLoadout(effFac, clampedSkin);
    if (session) {
      session.transport.send({
        type: 'update_profile',
        name: sanitizeNickname(nextName),
        faction: clampedFac,
        skinId: clampedSkin,
        siegeLoadout: resolvedLoadout,
      });
    }
  };

  const handleFactionClick = (fac: FactionId) => {
    const firstSkin = FACTION_CHARACTERS[fac][0].id;
    pushProfileUpdate(nickname, fac, firstSkin);
  };

  const handleHostSettingsChange = (
    nextMapChoice: string,
    nextDiff: AiDifficulty,
    nextMode: GameMode = roomMode,
    nextDur: SiegeMatchDurationSec = siegeDurationSec
  ) => {
    setRoomMode(nextMode);
    setSiegeDurationSec(nextDur);
    setMapChoice(nextMapChoice);
    setDifficulty(nextDiff);
    if (nextMode === 'siege' && selectedFaction === 'mercenary') {
      handleFactionClick('royal');
    }
    if (!session?.isHost) return;
    const resolvedMapId =
      nextMode === 'siege'
        ? SIEGE_MAP_ID
        : nextMapChoice === 'random'
          ? MAP_CATALOG[0].id
          : nextMapChoice;
    const custom = nextMode === 'siege' ? undefined : customMaps.find((m) => m.id === nextMapChoice);
    session.transport.send({
      type: 'update_room_settings',
      mode: nextMode,
      siegeDurationSec: nextDur,
      mapId: resolvedMapId,
      customMap: custom,
      difficulty: nextDiff,
    });
  };

  const handleStartMatch = () => {
    if (!session?.isHost) return;
    const effectiveMode = activeLobby?.mode ?? roomMode;
    const effectiveDur = activeLobby?.siegeDurationSec ?? siegeDurationSec;
    const finalMapId =
      effectiveMode === 'siege'
        ? SIEGE_MAP_ID
        : mapChoice === 'random'
          ? MAP_CATALOG[Math.floor(Math.random() * MAP_CATALOG.length)].id
          : mapChoice;
    const custom = effectiveMode === 'siege' ? undefined : customMaps.find((m) => m.id === finalMapId);
    session.transport.send({
      type: 'start_match',
      mode: effectiveMode,
      siegeDurationSec: effectiveDur,
      mapId: finalMapId,
      customMap: custom,
      difficulty,
    });
  };

  const handleCopyInvite = async () => {
    if (!session) return;
    const inviteUrl = `${window.location.origin}/?room=${session.lobby.roomCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      setCopiedInvite(false);
    }
  };

  const activeLobby = session?.lobby ?? null;
  const activeMapMeta = useMemo(() => {
    if (!activeLobby) return null;
    if (activeLobby.customMap) return null;
    return MAP_CATALOG.find((m) => m.id === activeLobby.mapId) || MAP_CATALOG[0];
  }, [activeLobby]);

  return (
    <div className="min-h-screen w-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      <header className="shrink-0 bg-[#0B0F17]/95 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            返回主畫面
          </button>

          <div className="flex items-center gap-2.5">
            <Wifi className="w-4 h-4 text-sky-400" />
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
              多人連線作戰室（Cloudflare Edge · 最多 {MAX_ROOM_PLAYERS} 人）
            </h1>
          </div>

          <div className="text-xs text-slate-400 hidden md:block">
            房主權威同步 · 免費省資源自動回收
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 flex flex-col gap-6">
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/50 px-4 py-3 text-sm text-rose-200 flex items-center justify-between gap-4">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs text-rose-300 hover:text-white underline cursor-pointer"
            >
              關閉
            </button>
          </div>
        )}

        {!activeLobby ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Create or Join Form */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">建立或加入好友房間</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  建立房間後會產生 6 位專屬房號與邀請連結，朋友點開即可自由揀選陣營並加入同一戰場，剩餘空位由 AI 自動補齊。
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">你的玩家暱稱</label>
                <input
                  type="text"
                  maxLength={18}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="輸入暱稱（最多 18 字）"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-400"
                />
              </div>

              {(showPasscodeField || passcodeRequired) && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>私人房間通行密碼 {passcodeRequired ? '（伺服器要求）' : '（選填）'}</span>
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="輸入朋友分享的通行密碼"
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {!showPasscodeField && !passcodeRequired && (
                <button
                  type="button"
                  onClick={() => setShowPasscodeField(true)}
                  className="text-xs text-slate-400 hover:text-amber-300 underline cursor-pointer"
                >
                  伺服器有設定通行密碼？按此填寫
                </button>
              )}

              <div className="pt-2 border-t border-slate-800 space-y-4">
                <button
                  disabled={connecting}
                  onClick={() => connectToRoom(generateRoomCode())}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm transition-colors cursor-pointer shadow-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>{connecting ? '連線中...' : '建立新房間（當房主）'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="輸入 6 位房號（例 TW4829）"
                    className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm font-mono-num tracking-widest uppercase text-white focus:outline-none focus:border-sky-400"
                  />
                  <button
                    disabled={connecting}
                    onClick={() => connectToRoom(joinCodeInput)}
                    className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition-colors cursor-pointer shrink-0"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>加入</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Pre-pick Faction & Character + Resource Policy */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-white mb-2">出戰陣營與角色外觀（進房後亦可隨時更換）</h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['royal', 'shadow', 'mercenary'] as FactionId[]).map((fac) => {
                    const info = FACTIONS[fac];
                    const active = selectedFaction === fac;
                    return (
                      <button
                        key={fac}
                        onClick={() => handleFactionClick(fac)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          active
                            ? 'bg-slate-800 border-amber-400 shadow-md'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <FactionLogoSvg faction={fac} className="w-10 h-10 mx-auto mb-1.5" />
                        <div className="text-xs font-bold text-white truncate">{info.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {FACTION_CHARACTERS[selectedFaction].map((skin) => {
                  const active = selectedSkinId === skin.id;
                  return (
                    <button
                      key={skin.id}
                      onClick={() => setSelectedSkinId(skin.id)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-800 border-sky-400'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <CharacterAvatarSvg skin={skin} className="w-10 h-10" />
                      <span className="text-[11px] font-semibold text-slate-200 truncate w-full text-center">
                        {skin.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
                <div className="font-bold text-emerald-300">免費方案資源保護機制</div>
                <p>• 每間房間上限 {MAX_ROOM_PLAYERS} 名真人玩家，大廳無人操作 5 分鐘會自動關閉。</p>
                <p>• 戰局完結後若 60 秒內無再開下一局，房間與雲端狀態會自動徹底清除。</p>
                <p>• 房主離線或全部玩家離開房間時，Durable Object 儲存立即歸零銷毀。</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left/Center: Connected Players Roster + Local Player Selector */}
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">房間代碼</div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black font-mono-num tracking-widest text-amber-300">
                      {activeLobby.roomCode}
                    </span>
                    <button
                      onClick={handleCopyInvite}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                    >
                      {copiedInvite ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedInvite ? '已複製連結' : '複製邀請連結'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono-num text-sky-300">
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      {activeLobby.players.length} / {activeLobby.maxPlayers} 人
                    </span>
                  </div>
                  <button
                    onClick={handleLeaveRoom}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-xs font-bold text-rose-200 cursor-pointer"
                  >
                    離開房間
                  </button>
                </div>
              </div>

              {/* Players List */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-white flex items-center justify-between">
                  <span>房內玩家列表（空位將由 AI 士兵自動補齊）</span>
                  <span className="text-xs text-slate-400">可自由同陣營或跨陣營對戰</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeLobby.players.map((pl) => {
                    const skin =
                      FACTION_CHARACTERS[pl.faction].find((s) => s.id === pl.skinId) ||
                      FACTION_CHARACTERS[pl.faction][0];
                    const fac = FACTIONS[pl.faction];
                    const isSelf = pl.peerId === session?.localPeerId;
                    return (
                      <div
                        key={pl.peerId}
                        className={`flex items-center gap-3 p-3 rounded-xl border ${
                          isSelf
                            ? 'bg-slate-800/90 border-sky-400/70'
                            : 'bg-slate-950/70 border-slate-800'
                        }`}
                      >
                        <CharacterAvatarSvg skin={skin} className="w-11 h-11 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white truncate">{pl.name}</span>
                            {pl.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                                你
                              </span>
                            )}
                            {pl.disconnected && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                                暫離 (AI 託管)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {fac.name} · {skin.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Local Faction & Skin Controls */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white">切換我的陣營與造型</h3>
                <div className={`grid gap-2.5 ${(activeLobby.mode ?? 'frontier') === 'siege' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {(((activeLobby.mode ?? 'frontier') === 'siege' ? ['royal', 'shadow'] : ['royal', 'shadow', 'mercenary']) as FactionId[]).map((fac) => {
                    const active = selectedFaction === fac;
                    return (
                      <button
                        key={fac}
                        onClick={() => handleFactionClick(fac)}
                        className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                          active
                            ? 'bg-slate-800 border-amber-400'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <FactionLogoSvg faction={fac} className="w-6 h-6 shrink-0" />
                        <span className="text-xs font-bold text-white">{FACTIONS[fac].name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {FACTION_CHARACTERS[selectedFaction].map((skin) => {
                    const active = selectedSkinId === skin.id;
                    return (
                      <button
                        key={skin.id}
                        onClick={() => pushProfileUpdate(nickname, selectedFaction, skin.id)}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 cursor-pointer ${
                          active
                            ? 'bg-slate-800 border-sky-400'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <CharacterAvatarSvg skin={skin} className="w-9 h-9" />
                        <span className="text-[11px] font-semibold text-slate-200 truncate w-full text-center">
                          {skin.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {(activeLobby.mode ?? 'frontier') === 'siege' && (() => {
                  const sFac = selectedFaction === 'shadow' ? 'shadow' : 'royal';
                  const bundle = getDefaultSiegeLoadout(sFac, selectedSkinId);
                  const preset = getSiegeHeroPreset(sFac, selectedSkinId);
                  const gun = GUNS.find((g) => g.id === bundle.gunId) || GUNS[0];
                  const gunProfile = getSiegeGunProfile(gun.kind);
                  const melee = MELEES.find((m) => m.id === bundle.meleeId) || MELEES[0];
                  const tac = getTacticalMeta(bundle.tacticalId);
                  const ult = getUltimateMeta(bundle.ultimateId);
                  const pas = getPassiveMeta(bundle.passiveId);
                  return (
                    <div className="pt-3 border-t border-slate-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-300">英雄專屬套裝預覽</span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-[11px] font-bold text-amber-200">
                            {preset.roleBadge} · {preset.laneHint}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">每位英雄配專屬武器與技能，切換上方英雄即可更換打法</span>
                      </div>

                      <p className="text-xs text-slate-200 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
                        {preset.tagline}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="flex items-center gap-3 rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                          <WeaponIconSvg kind={gun.kind} color={gun.color} className="w-9 h-9 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>主武器：{gun.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-300">{gunProfile.roleTag}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {gun.kind === 'shotgun'
                                ? `近戰破甲 ${Math.round(gunProfile.defensePenetration * 100)}% · 彈匣 ${gun.magSize} 發`
                                : gunProfile.defensePenetration > 0
                                  ? `穿甲 ${Math.round(gunProfile.defensePenetration * 100)}% · 彈匣 ${gun.magSize} 發`
                                  : `均衡射速 · 彈匣 ${gun.magSize} 發`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                          <WeaponIconSvg kind={melee.kind} color={melee.color} className="w-9 h-9 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white">副兵器：{melee.name}</div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {melee.kind === 'shield' ? '正面格擋減傷 · 震退破陣' : `傷害 ${melee.damage} · 攻速 ${melee.swingRate}/s · 按 [Q] 切換`}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="rounded-xl bg-slate-950/80 border border-sky-500/30 p-2.5 space-y-1">
                          <div className="font-bold text-sky-300">[E / 右鍵 · Lv.2] {tac.name}</div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">{tac.desc}</p>
                        </div>
                        <div className="rounded-xl bg-slate-950/80 border border-amber-500/30 p-2.5 space-y-1">
                          <div className="font-bold text-amber-300">[近戰集氣 · Lv.4] {ult.name}</div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">{ult.desc}</p>
                        </div>
                        <div className="rounded-xl bg-slate-950/80 border border-emerald-500/30 p-2.5 space-y-1">
                          <div className="font-bold text-emerald-300">[常駐被動] {pas.name}</div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">{pas.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Right Column: Map / Difficulty / Start */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">戰場設定</h3>
                <span className="text-[11px] text-amber-300">
                  {session?.isHost ? '你係房主（可設定地圖）' : '由房主選擇地圖'}
                </span>
              </div>

              {(activeLobby.mode ?? roomMode) === 'siege' ? (
                <MiniMapPreview mapId={SIEGE_MAP_ID} className="h-44 w-full" />
              ) : activeLobby.customMap ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-center space-y-1">
                  <div className="text-sm font-bold text-amber-300">自創地圖：{activeLobby.customMap.name}</div>
                  <div className="text-xs text-slate-400">
                    {activeLobby.customMap.cols}×{activeLobby.customMap.rows} 格（已同步至房內所有玩家）
                  </div>
                </div>
              ) : (
                activeMapMeta && <MiniMapPreview mapId={activeMapMeta.id} className="h-44 w-full" />
              )}

              {session?.isHost ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">遊戲模式</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'frontier' as GameMode, label: '經典混戰' },
                        { id: 'siege' as GameMode, label: '三路塔防 MOBA' },
                      ]).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleHostSettingsChange(mapChoice, difficulty, m.id, siegeDurationSec)}
                          className={`py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                            roomMode === m.id
                              ? 'bg-sky-500 text-slate-950 border-sky-400'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {roomMode === 'siege' ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">對戰時長（光暈裂谷 5v5）</label>
                      <div className="grid grid-cols-3 gap-2">
                        {SIEGE_DURATION_OPTIONS.map((opt) => (
                          <button
                            key={opt.sec}
                            onClick={() => handleHostSettingsChange(mapChoice, difficulty, 'siege', opt.sec)}
                            className={`py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                              siegeDurationSec === opt.sec
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            {opt.sec / 60} 分鐘
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">選擇地圖</label>
                      <select
                        value={mapChoice}
                        onChange={(e) => handleHostSettingsChange(e.target.value, difficulty)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
                      >
                        <option value="random">隨機地圖</option>
                        {MAP_CATALOG.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}（{m.environment}）
                          </option>
                        ))}
                        {customMaps.map((cm) => (
                          <option key={cm.id} value={cm.id}>
                            自創：{cm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">AI 補位強度</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['relaxed', 'standard', 'hard'] as AiDifficulty[]).map((d) => (
                        <button
                          key={d}
                          onClick={() => handleHostSettingsChange(mapChoice, d)}
                          className={`py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                            difficulty === d
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          {AI_DIFFICULTY[d].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleStartMatch}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>開始多人對戰</span>
                  </button>
                </>
              ) : (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span>遊戲模式</span>
                    <span className="font-bold text-amber-300">
                      {(activeLobby.mode ?? 'frontier') === 'siege' ? '三路塔防 MOBA' : '經典混戰'}
                    </span>
                  </div>
                  {(activeLobby.mode ?? 'frontier') === 'siege' ? (
                    <>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <span>戰場地圖</span>
                        <span className="font-bold text-white">光暈裂谷 5v5</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <span>對戰時長</span>
                        <span className="font-bold text-white">{(activeLobby.siegeDurationSec ?? 1080) / 60} 分鐘</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <span>地圖</span>
                      <span className="font-bold text-white flex items-center gap-1">
                        {mapChoice === 'random' && !activeLobby.customMap ? <Shuffle className="w-3.5 h-3.5" /> : null}
                        {activeLobby.customMap?.name ?? activeMapMeta?.name ?? activeLobby.mapId}
                      </span>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span>AI 強度</span>
                    <span className="font-bold text-white">{AI_DIFFICULTY[activeLobby.difficulty].label}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-950/50 border border-sky-500/30 text-sky-200 text-center font-semibold">
                    等待房主按下「開始多人對戰」...
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
