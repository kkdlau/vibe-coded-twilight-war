import { describe, expect, it } from 'vitest';
import {
  LOBBY_IDLE_TIMEOUT_MS,
  MAX_MATCH_DURATION_MS,
  MAX_ROOM_PLAYERS,
  POST_MATCH_CLEANUP_MS,
  ROOM_CODE_REGEX,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeNickname,
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
});
