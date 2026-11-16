import { useCallback, useState } from 'react';
import { FactionRoomView } from './components/FactionRoomView';
import { GameCanvasView } from './components/GameCanvasView';
import { PortalView } from './components/PortalView';
import { CharacterSkin, FactionId, MapId, RunRecord } from './game/types';

const STORAGE_KEY = 'twilight_rpg_records_v2';
const OLD_REP_STORAGE_KEY = 'twilight_rpg_reputation_v1';
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

function loadReputations(): Record<FactionId, number> {
  try {
    localStorage.removeItem(OLD_REP_STORAGE_KEY);
    const raw = localStorage.getItem(REP_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REPUTATIONS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_REPUTATIONS };
    return {
      royal: Number.isFinite(Number(parsed.royal)) ? Math.floor(Number(parsed.royal)) : 0,
      shadow: Number.isFinite(Number(parsed.shadow)) ? Math.floor(Number(parsed.shadow)) : 0,
      mercenary: Number.isFinite(Number(parsed.mercenary)) ? Math.floor(Number(parsed.mercenary)) : 0,
    };
  } catch {
    return { ...DEFAULT_REPUTATIONS };
  }
}

export default function App() {
  const [screen, setScreen] = useState<'lobby' | 'faction' | 'battle'>('lobby');
  const [selectedFaction, setSelectedFaction] = useState<FactionId>('royal');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterSkin | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<MapId>('tokyo_shrine');
  const [factionMapChoice, setFactionMapChoice] = useState<MapId | 'random'>('random');
  const [records, setRecords] = useState<RunRecord[]>(() => loadRecords());
  const [reputations, setReputations] = useState<Record<FactionId, number>>(() => loadReputations());

  const handleReputationsChange = useCallback((nextReps: Record<FactionId, number>) => {
    const safeReps: Record<FactionId, number> = {
      royal: Math.floor(Number.isFinite(nextReps.royal) ? nextReps.royal : 0),
      shadow: Math.floor(Number.isFinite(nextReps.shadow) ? nextReps.shadow : 0),
      mercenary: Math.floor(Number.isFinite(nextReps.mercenary) ? nextReps.mercenary : 0),
    };
    setReputations(safeReps);
    try {
      localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(safeReps));
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

  if (screen === 'battle' && selectedCharacter) {
    return (
      <GameCanvasView
        faction={selectedFaction}
        characterSkin={selectedCharacter}
        mapId={selectedMapId}
        initialReputations={reputations}
        onReputationsChange={handleReputationsChange}
        onBackToFaction={() => setScreen('faction')}
        onExitLobby={() => setScreen('lobby')}
        onSaveRecord={handleSaveRecord}
      />
    );
  }

  if (screen === 'faction') {
    return (
      <FactionRoomView
        faction={selectedFaction}
        initialMapChoice={factionMapChoice}
        reputations={reputations}
        onBackToLobby={() => setScreen('lobby')}
        onStartBattle={(fac, charSkin, mapId, mapChoice) => {
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
      onSelectFaction={(fac, preselectedMapId) => {
        setSelectedFaction(fac);
        setFactionMapChoice(preselectedMapId ?? 'random');
        if (preselectedMapId) setSelectedMapId(preselectedMapId);
        setScreen('faction');
      }}
      onClearRecords={handleClearRecords}
    />
  );
}
