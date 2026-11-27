import { useCallback, useEffect, useMemo, useState } from 'react';
import { FactionRoomView } from './components/FactionRoomView';
import { GameCanvasView } from './components/GameCanvasView';
import { MapEditorView } from './components/MapEditorView';
import { ActiveMultiplayerSession, MultiplayerLobbyView } from './components/MultiplayerLobbyView';
import { PortalView } from './components/PortalView';
import { SiegeSetupView } from './components/SiegeSetupView';
import {
  CustomMapData,
  deleteCustomMap,
  loadCustomMaps,
  upsertCustomMap,
} from './game/customMaps';
import { FACTION_CHARACTERS } from './game/data';
import { getDefaultSiegeLoadout } from './game/siegeData';
import { SIEGE_MAP_ID } from './game/siegeMap';
import { CharacterSkin, FactionId, GameMode, RunRecord, SiegeOptions } from './game/types';
import type { AiDifficulty } from './game/tuning';
import { normalizeRoomCode } from './net/protocol';

const STORAGE_KEY = 'twilight_rpg_records_v2';
const REP_STORAGE_KEY = 'twilight_rpg_reputations_v2';

const DEFAULT_REPUTATIONS: Record<FactionId, number> = {
  royal: 0,
  shadow: 0,
  mercenary: 0,
};

function loadRecords(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadReputations(): Record<FactionId, number> | null {
  try {
    const raw = localStorage.getItem(REP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      royal: Number.isFinite(Number(parsed.royal)) ? Math.floor(Number(parsed.royal)) : 0,
      shadow: Number.isFinite(Number(parsed.shadow)) ? Math.floor(Number(parsed.shadow)) : 0,
      mercenary: Number.isFinite(Number(parsed.mercenary)) ? Math.floor(Number(parsed.mercenary)) : 0,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [initialMpRoomCode, setInitialMpRoomCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '') ?? '';
  });
  const [screen, setScreen] = useState<'lobby' | 'faction' | 'siege_setup' | 'battle' | 'editor' | 'mp_lobby'>(() =>
    initialMpRoomCode ? 'mp_lobby' : 'lobby'
  );
  const [gameMode, setGameMode] = useState<GameMode>('frontier');
  const [siegeOptions, setSiegeOptions] = useState<SiegeOptions | undefined>(undefined);
  const [selectedFaction, setSelectedFaction] = useState<FactionId>('royal');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterSkin | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string>('tokyo_shrine');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('standard');
  const [factionMapChoice, setFactionMapChoice] = useState<string>('random');
  const [mpSession, setMpSession] = useState<ActiveMultiplayerSession | null>(null);
  const [records, setRecords] = useState<RunRecord[]>(() => loadRecords());
  const [reputations, setReputations] = useState(() => loadReputations() ?? DEFAULT_REPUTATIONS);
  const [customMaps, setCustomMaps] = useState<CustomMapData[]>(() => loadCustomMaps());

  const activeCustomMap = useMemo(
    () => (mpSession?.lobby.customMap ? mpSession.lobby.customMap : customMaps.find((m) => m.id === selectedMapId)),
    [customMaps, mpSession, selectedMapId]
  );

  useEffect(() => {
    const syncReputations = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === REP_STORAGE_KEY || event.key === null)) {
        setReputations(loadReputations() ?? DEFAULT_REPUTATIONS);
      }
    };
    window.addEventListener('storage', syncReputations);
    return () => window.removeEventListener('storage', syncReputations);
  }, []);

  const handleReputationsChange = useCallback((matchReps: Record<FactionId, number>, change: Record<FactionId, number>) => {
    const saved = loadReputations();
    const nextReps = saved ? {
      royal: saved.royal + change.royal,
      shadow: saved.shadow + change.shadow,
      mercenary: saved.mercenary + change.mercenary,
    } : matchReps;
    setReputations(nextReps);
    try {
      localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(nextReps));
    } catch {
      // ignore
    }
  }, []);

  const handleSaveRecord = useCallback((record: RunRecord) => {
    setRecords((prev) => {
      const next = [record, ...prev].slice(0, 12);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const handleClearRecords = useCallback(() => {
    setRecords([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const handleSaveCustomMap = useCallback((entry: CustomMapData) => {
    setCustomMaps((prev) => upsertCustomMap(prev, entry));
  }, []);

  const handleDeleteCustomMap = useCallback((id: string) => {
    setCustomMaps((prev) => deleteCustomMap(prev, id));
  }, []);

  const handleMpMatchStarted = useCallback((sess: ActiveMultiplayerSession) => {
    const me = sess.lobby.players.find((pl) => pl.peerId === sess.localPeerId) ?? sess.lobby.players[0];
    if (!me) return;
    const lobbyMode: GameMode = sess.lobby.mode === 'siege' ? 'siege' : 'frontier';
    const effFac: FactionId = lobbyMode === 'siege' && me.faction === 'mercenary' ? 'royal' : me.faction;
    const skin =
      FACTION_CHARACTERS[effFac].find((s) => s.id === me.skinId) || FACTION_CHARACTERS[effFac][0];
    setGameMode(lobbyMode);
    if (lobbyMode === 'siege') {
      const sFac = effFac === 'shadow' ? 'shadow' : 'royal';
      setSiegeOptions({
        loadout: me.siegeLoadout ?? getDefaultSiegeLoadout(sFac, skin.id),
        durationSec: sess.lobby.siegeDurationSec ?? 1080,
      });
    } else {
      setSiegeOptions(undefined);
    }
    setSelectedFaction(effFac);
    setSelectedCharacter(skin);
    setSelectedMapId(lobbyMode === 'siege' ? SIEGE_MAP_ID : sess.lobby.mapId);
    setAiDifficulty(sess.lobby.difficulty);
    setInitialMpRoomCode(sess.lobby.roomCode);
    setMpSession(sess);
    setScreen('battle');
  }, []);

  if (screen === 'mp_lobby') {
    return (
      <MultiplayerLobbyView
        initialRoomCode={initialMpRoomCode}
        customMaps={customMaps}
        existingSession={mpSession}
        onSessionUpdate={setMpSession}
        onMatchStarted={handleMpMatchStarted}
        onBackToPortal={() => {
          setMpSession(null);
          setScreen('lobby');
        }}
      />
    );
  }

  if (screen === 'editor') {
    return (
      <MapEditorView
        savedMaps={customMaps}
        onSaveMap={handleSaveCustomMap}
        onDeleteMap={handleDeleteCustomMap}
        onPlayCustomMap={(cm) => {
          setSelectedMapId(cm.id);
          setFactionMapChoice(cm.id);
          setScreen('faction');
        }}
        onBackToLobby={() => setScreen('lobby')}
      />
    );
  }

  if (screen === 'siege_setup') {
    return (
      <SiegeSetupView
        initialFaction={selectedFaction === 'shadow' ? 'shadow' : 'royal'}
        aiDifficulty={aiDifficulty}
        onDifficultyChange={setAiDifficulty}
        onBackToLobby={() => setScreen('lobby')}
        onStartSiege={(fac, charSkin, loadout, durationSec) => {
          setMpSession(null);
          setGameMode('siege');
          setSiegeOptions({ loadout, durationSec });
          setSelectedFaction(fac);
          setSelectedCharacter(charSkin);
          setSelectedMapId(SIEGE_MAP_ID);
          setScreen('battle');
        }}
      />
    );
  }

  if (screen === 'battle' && selectedCharacter) {
    return (
      <GameCanvasView
        mode={gameMode}
        siegeOptions={siegeOptions}
        faction={selectedFaction}
        characterSkin={selectedCharacter}
        mapId={selectedMapId}
        customMap={gameMode === 'siege' ? undefined : activeCustomMap}
        aiDifficulty={aiDifficulty}
        initialReputations={reputations}
        onReputationsChange={handleReputationsChange}
        onBackToFaction={() => {
          mpSession?.transport.disconnect('Left room');
          setMpSession(null);
          setScreen(gameMode === 'siege' ? 'siege_setup' : 'faction');
        }}
        onExitLobby={() => {
          mpSession?.transport.disconnect('Left room');
          setMpSession(null);
          setScreen('lobby');
        }}
        onSaveRecord={handleSaveRecord}
        multiplayer={
          mpSession
            ? {
                session: mpSession,
                onReturnToMpLobby: (nextLobby) => {
                  if (nextLobby) {
                    setMpSession((prev) =>
                      prev ? { ...prev, lobby: nextLobby, isHost: nextLobby.hostPeerId === prev.localPeerId } : null
                    );
                  }
                  setScreen('mp_lobby');
                },
                onLeaveMultiplayer: () => {
                  if (mpSession?.lobby.roomCode) {
                    setInitialMpRoomCode(mpSession.lobby.roomCode);
                  }
                  setMpSession(null);
                  setScreen('mp_lobby');
                },
              }
            : undefined
        }
      />
    );
  }

  if (screen === 'faction') {
    return (
      <FactionRoomView
        faction={selectedFaction}
        initialMapChoice={factionMapChoice}
        aiDifficulty={aiDifficulty}
        onDifficultyChange={setAiDifficulty}
        customMaps={customMaps}
        reputations={reputations}
        onBackToLobby={() => setScreen('lobby')}
        onStartBattle={(fac, charSkin, mapId, mapChoice) => {
          setMpSession(null);
          setGameMode('frontier');
          setSiegeOptions(undefined);
          setSelectedFaction(fac);
          setSelectedCharacter(charSkin);
          setSelectedMapId(mapId);
          setFactionMapChoice(mapChoice);
          setScreen('battle');
        }}
      />
    );
  }

  return (
    <PortalView
      records={records}
      reputations={reputations}
      customMapCount={customMaps.length}
      onSelectFaction={(fac, preselectedMapId) => {
        setMpSession(null);
        setGameMode('frontier');
        setSiegeOptions(undefined);
        setSelectedFaction(fac);
        setFactionMapChoice(preselectedMapId ?? 'random');
        if (preselectedMapId) setSelectedMapId(preselectedMapId);
        setScreen('faction');
      }}
      onOpenSiegeMode={() => {
        setMpSession(null);
        setGameMode('siege');
        setScreen('siege_setup');
      }}
      onOpenMapEditor={() => setScreen('editor')}
      onOpenMultiplayer={() => setScreen('mp_lobby')}
      onClearRecords={handleClearRecords}
    />
  );
}
