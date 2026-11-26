import { useCallback, useEffect, useMemo, useState } from 'react';
import { FactionRoomView } from './components/FactionRoomView';
import { GameCanvasView } from './components/GameCanvasView';
import { MapEditorView } from './components/MapEditorView';
import { ActiveMultiplayerSession, MultiplayerLobbyView } from './components/MultiplayerLobbyView';
import { PortalView } from './components/PortalView';
import {
  CustomMapData,
  deleteCustomMap,
  loadCustomMaps,
  upsertCustomMap,
} from './game/customMaps';
import { FACTION_CHARACTERS } from './game/data';
import { CharacterSkin, FactionId, RunRecord } from './game/types';
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
  const [initialMpRoomCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '') ?? '';
  });
  const [screen, setScreen] = useState<'lobby' | 'faction' | 'battle' | 'editor' | 'mp_lobby'>(() =>
    initialMpRoomCode ? 'mp_lobby' : 'lobby'
  );
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
    const skin =
      FACTION_CHARACTERS[me.faction].find((s) => s.id === me.skinId) || FACTION_CHARACTERS[me.faction][0];
    setSelectedFaction(me.faction);
    setSelectedCharacter(skin);
    setSelectedMapId(sess.lobby.mapId);
    setAiDifficulty(sess.lobby.difficulty);
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

  if (screen === 'battle' && selectedCharacter) {
    return (
      <GameCanvasView
        faction={selectedFaction}
        characterSkin={selectedCharacter}
        mapId={selectedMapId}
        customMap={activeCustomMap}
        aiDifficulty={aiDifficulty}
        initialReputations={reputations}
        onReputationsChange={handleReputationsChange}
        onBackToFaction={() => {
          mpSession?.transport.disconnect('Left room');
          setMpSession(null);
          setScreen('faction');
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
        setSelectedFaction(fac);
        setFactionMapChoice(preselectedMapId ?? 'random');
        if (preselectedMapId) setSelectedMapId(preselectedMapId);
        setScreen('faction');
      }}
      onOpenMapEditor={() => setScreen('editor')}
      onOpenMultiplayer={() => setScreen('mp_lobby')}
      onClearRecords={handleClearRecords}
    />
  );
}
