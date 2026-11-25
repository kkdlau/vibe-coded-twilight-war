import { describe, expect, it } from 'vitest';
import {
  CLIENT_INPUT_TIMING,
  ClientInputSyncState,
  LOBBY_IDLE_TIMEOUT_MS,
  MAX_MATCH_DURATION_MS,
  MAX_ROOM_PLAYERS,
  POST_MATCH_CLEANUP_MS,
  ROOM_CODE_REGEX,
  RemotePlayerInput,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeNickname,
  shouldSendClientInput,
} from './protocol';

describe('Multiplayer wire protocol helpers & free-tier limits', () => {
  it('enforces 8-player room cap and short free-tier cleanup timeouts', () => {
    expect(MAX_ROOM_PLAYERS).toBe(8);
    expect(POST_MATCH_CLEANUP_MS).toBe(60_000);
    expect(LOBBY_IDLE_TIMEOUT_MS).toBe(300_000);
    expect(MAX_MATCH_DURATION_MS).toBe(1_800_000);
  });

  it('generates and normalizes valid 6-char room codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(ROOM_CODE_REGEX);
      expect(normalizeRoomCode(`  ${code.toLowerCase()}  `)).toBe(code);
    }
    expect(normalizeRoomCode('tw-4829')).toBe('TW4829');
    expect(normalizeRoomCode('short')).toBeNull();
    expect(normalizeRoomCode('toolong12')).toBeNull();
  });

  it('sanitizes nicknames cleanly with fallback', () => {
    expect(sanitizeNickname('  Alice   Bob  ')).toBe('Alice Bob');
    expect(sanitizeNickname('   ', '玩家一號')).toBe('玩家一號');
    expect(sanitizeNickname('A'.repeat(30)).length).toBe(18);
  });

  it('throttles idle pointer moves while sending attacks, movement, and close-combat aim immediately', () => {
    const base: RemotePlayerInput = {
      moveX: 0,
      moveY: 0,
      aimX: 500,
      aimY: 500,
      mouseDown: false,
      clickSeq: 0,
      reloadSeq: 0,
      swapSeq: 0,
      pickupSeq: 0,
      dropSeq: 0,
    };
    const state: ClientInputSyncState = {
      lastSent: base,
      lastSentAt: 1000,
      lastAimSentAt: 1000,
    };

    // Idle pointer sweep: suppressed at +500ms and +1900ms, sent at >= 2000ms
    const swept = { ...base, aimX: 560 };
    expect(shouldSendClientInput(swept, state, { now: 1500, hasNearbyCombatant: false, holdingShield: false })).toBe(false);
    expect(
      shouldSendClientInput(swept, state, {
        now: 1000 + CLIENT_INPUT_TIMING.idleAimMs - 10,
        hasNearbyCombatant: false,
        holdingShield: false,
      })
    ).toBe(false);
    expect(
      shouldSendClientInput(swept, state, {
        now: 1000 + CLIENT_INPUT_TIMING.idleAimMs,
        hasNearbyCombatant: false,
        holdingShield: false,
      })
    ).toBe(true);

    // Essential events (attack click, movement change, reload/swap/pickup/drop) bypass aim throttle at +5ms
    expect(
      shouldSendClientInput({ ...base, mouseDown: true, clickSeq: 1 }, state, {
        now: 1005,
        hasNearbyCombatant: false,
        holdingShield: false,
      })
    ).toBe(true);
    expect(
      shouldSendClientInput({ ...base, moveX: 1 }, state, {
        now: 1005,
        hasNearbyCombatant: false,
        holdingShield: false,
      })
    ).toBe(true);
    expect(
      shouldSendClientInput({ ...base, dropSeq: 1 }, state, {
        now: 1005,
        hasNearbyCombatant: false,
        holdingShield: false,
      })
    ).toBe(true);

    // Close combat / stacked players raise aim cadence to 120ms, firing raises it to 90ms
    expect(
      shouldSendClientInput(swept, state, {
        now: 1000 + CLIENT_INPUT_TIMING.closeCombatAimMs,
        hasNearbyCombatant: true,
        holdingShield: false,
      })
    ).toBe(true);
    const firingState: ClientInputSyncState = {
      lastSent: { ...base, mouseDown: true },
      lastSentAt: 2000,
      lastAimSentAt: 2000,
    };
    expect(
      shouldSendClientInput({ ...base, mouseDown: true, aimX: 510 }, firingState, {
        now: 2000 + CLIENT_INPUT_TIMING.firingAimMs,
        hasNearbyCombatant: false,
        holdingShield: false,
      })
    ).toBe(true);
  });
});
