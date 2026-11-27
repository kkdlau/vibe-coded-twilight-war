import { DurableObject } from 'cloudflare:workers';
import {
  ClientToServerMsg,
  LOBBY_IDLE_TIMEOUT_MS,
  LobbyPlayerInfo,
  MAX_GAME_MSG_BYTES,
  MAX_LOBBY_MSG_BYTES,
  MAX_MATCH_DURATION_MS,
  MAX_ROOM_PLAYERS,
  POST_MATCH_CLEANUP_MS,
  ROOM_CODE_REGEX,
  RoomLobbyState,
  ServerToClientMsg,
  sanitizeNickname,
} from '../src/net/protocol';
import type { FactionId, GameMode, SiegeMatchDurationSec } from '../src/game/types';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  ROOM_PASSCODE?: string;
}

interface SocketAttachment {
  peerId: string;
  isHost: boolean;
  joinedAt: number;
}

const VALID_FACTIONS: Set<FactionId> = new Set(['royal', 'shadow', 'mercenary']);
const VALID_DIFFICULTIES = new Set(['relaxed', 'standard', 'hard']);
const VALID_MODES: Set<GameMode> = new Set(['frontier', 'siege']);
const VALID_SIEGE_DURATIONS = new Set<SiegeMatchDurationSec>([900, 1080, 1200]);

function validFaction(raw: unknown): FactionId {
  return typeof raw === 'string' && VALID_FACTIONS.has(raw as FactionId) ? (raw as FactionId) : 'royal';
}

function validDifficulty(raw: unknown): 'relaxed' | 'standard' | 'hard' {
  return typeof raw === 'string' && VALID_DIFFICULTIES.has(raw) ? (raw as 'relaxed' | 'standard' | 'hard') : 'standard';
}

function validMode(raw: unknown): GameMode {
  return typeof raw === 'string' && VALID_MODES.has(raw as GameMode) ? (raw as GameMode) : 'frontier';
}

function validSiegeDuration(raw: unknown): SiegeMatchDurationSec {
  return typeof raw === 'number' && VALID_SIEGE_DURATIONS.has(raw as SiegeMatchDurationSec)
    ? (raw as SiegeMatchDurationSec)
    : 1080;
}

export class GameRoom extends DurableObject<Env> {
  private room: RoomLobbyState | null = null;
  private reconnectTokens: Record<string, string> = {};
  private rateTracker = new Map<string, { sec: number; count: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get<RoomLobbyState>('room')) ?? null;
      this.reconnectTokens = (await this.ctx.storage.get<Record<string, string>>('tokens')) ?? {};
    });
  }

  private async persistRoom(): Promise<void> {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.put('tokens', this.reconnectTokens);
  }

  private async scheduleCleanupAt(timestampMs: number): Promise<void> {
    if (this.room) {
      this.room.expiresAt = timestampMs;
      await this.persistRoom();
    }
    await this.ctx.storage.setAlarm(timestampMs);
  }

  private broadcast(msg: ServerToClientMsg, excludePeerId?: string): void {
    const payload = JSON.stringify(msg);
    for (const sock of this.ctx.getWebSockets()) {
      if (sock.readyState !== 1) continue;
      if (excludePeerId) {
        const att = sock.deserializeAttachment() as SocketAttachment | null;
        if (att?.peerId === excludePeerId) continue;
      }
      try {
        sock.send(payload);
      } catch {
        // ignore broken socket
      }
    }
  }

  private sendTo(sock: WebSocket, msg: ServerToClientMsg): void {
    if (sock.readyState !== 1) return;
    try {
      sock.send(JSON.stringify(msg));
    } catch {
      // ignore broken socket
    }
  }

  private findHostSocket(): WebSocket | null {
    for (const sock of this.ctx.getWebSockets()) {
      const att = sock.deserializeAttachment() as SocketAttachment | null;
      if (att?.isHost && sock.readyState === 1) return sock;
    }
    return null;
  }

  private async cleanupRoom(closeCode: number, reason: string): Promise<void> {
    if (this.room) {
      this.broadcast({ type: 'room_closed', reason });
    }
    this.room = null;
    this.reconnectTokens = {};
    this.rateTracker.clear();
    for (const sock of this.ctx.getWebSockets()) {
      try {
        if (sock.readyState === 1) {
          sock.close(closeCode, reason);
        }
      } catch {
        // ignore
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private allowRate(peerId: string, isHost: boolean): boolean {
    const sec = Math.floor(Date.now() / 1000);
    const limit = isHost ? 120 : 90;
    const prev = this.rateTracker.get(peerId);
    if (!prev || prev.sec !== sec) {
      this.rateTracker.set(peerId, { sec, count: 1 });
      return true;
    }
    prev.count += 1;
    return prev.count <= limit;
  }

  public async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/ws$/);
    if (!match) {
      return new Response('Invalid room path', { status: 400 });
    }
    const roomCode = match[1].toUpperCase();
    if (!ROOM_CODE_REGEX.test(roomCode)) {
      return new Response('Invalid room code', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const activeSockets = this.ctx.getWebSockets().filter((s) => s.readyState === 1);
    const name = sanitizeNickname(url.searchParams.get('name') ?? '', '特戰隊員');
    const resumePeerId = (url.searchParams.get('resumePeerId') ?? '').trim();
    const resumeToken = (url.searchParams.get('resumeToken') ?? '').trim();

    if (this.room && this.room.phase === 'playing') {
      const rejoinPlayer = this.room.players.find(
        (p) =>
          !p.isHost &&
          ((resumePeerId.length > 0 &&
            resumeToken.length > 0 &&
            p.peerId === resumePeerId &&
            this.reconnectTokens[p.peerId] === resumeToken) ||
            (p.disconnected === true && p.name.toLowerCase() === name.toLowerCase()))
      );
      if (rejoinPlayer) {
        for (const existingSock of this.ctx.getWebSockets()) {
          const oldAtt = existingSock.deserializeAttachment() as SocketAttachment | null;
          if (oldAtt?.peerId === rejoinPlayer.peerId && existingSock.readyState === 1) {
            try {
              existingSock.close(4005, 'Reconnected from another session');
            } catch {
              // ignore
            }
          }
        }
        rejoinPlayer.disconnected = false;
        if (!this.reconnectTokens[rejoinPlayer.peerId]) {
          this.reconnectTokens[rejoinPlayer.peerId] = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        }
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({
          peerId: rejoinPlayer.peerId,
          isHost: false,
          joinedAt: Date.now(),
        } satisfies SocketAttachment);
        this.room.expiresAt = Date.now() + MAX_MATCH_DURATION_MS;
        await this.persistRoom();
        await this.ctx.storage.setAlarm(this.room.expiresAt);
        this.sendTo(server, {
          type: 'welcome',
          peerId: rejoinPlayer.peerId,
          lobby: this.room,
          reconnectToken: this.reconnectTokens[rejoinPlayer.peerId],
        });
        this.sendTo(server, {
          type: 'match_started',
          lobby: this.room,
        });
        this.broadcast({ type: 'peer_rejoined', peerId: rejoinPlayer.peerId, name: rejoinPlayer.name }, rejoinPlayer.peerId);
        this.broadcast({ type: 'lobby_state', lobby: this.room }, rejoinPlayer.peerId);
        return new Response(null, { status: 101, webSocket: client });
      }
      this.ctx.acceptWebSocket(server);
      this.sendTo(server, {
        type: 'error',
        code: 'MATCH_IN_PROGRESS',
        message: '對戰已經開始，請等房主開下一局再加入。',
      });
      server.close(4003, 'Match already in progress');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.room && (activeSockets.length >= MAX_ROOM_PLAYERS || this.room.players.length >= MAX_ROOM_PLAYERS)) {
      this.ctx.acceptWebSocket(server);
      this.sendTo(server, {
        type: 'error',
        code: 'ROOM_FULL',
        message: `房間已滿（上限 ${MAX_ROOM_PLAYERS} 人）。`,
      });
      server.close(4001, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const peerId = crypto.randomUUID().slice(0, 8);
    const reconnectToken = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    this.reconnectTokens[peerId] = reconnectToken;
    const faction = validFaction(url.searchParams.get('faction'));
    const skinId = (url.searchParams.get('skinId') ?? 'royal_vanguard').slice(0, 48);

    const isHost = !this.room || this.room.players.length === 0;
    const playerInfo: LobbyPlayerInfo = {
      peerId,
      name,
      faction,
      skinId,
      isHost,
    };

    if (!this.room) {
      this.room = {
        roomCode,
        phase: 'lobby',
        hostPeerId: peerId,
        maxPlayers: MAX_ROOM_PLAYERS,
        mapId: 'tokyo_shrine',
        difficulty: 'standard',
        players: [playerInfo],
        expiresAt: Date.now() + LOBBY_IDLE_TIMEOUT_MS,
      };
    } else {
      if (this.room.phase === 'ended') {
        this.room.phase = 'lobby';
      }
      this.room.players.push(playerInfo);
      this.room.expiresAt = Date.now() + LOBBY_IDLE_TIMEOUT_MS;
    }

    this.ctx.acceptWebSocket(server);
    const attachment: SocketAttachment = {
      peerId,
      isHost,
      joinedAt: Date.now(),
    };
    server.serializeAttachment(attachment);

    await this.persistRoom();
    await this.ctx.storage.setAlarm(this.room.expiresAt ?? Date.now() + LOBBY_IDLE_TIMEOUT_MS);

    this.sendTo(server, {
      type: 'welcome',
      peerId,
      lobby: this.room,
      reconnectToken,
    });
    this.broadcast({ type: 'lobby_state', lobby: this.room }, peerId);

    return new Response(null, { status: 101, webSocket: client });
  }

  public async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    if (typeof raw !== 'string') return;

    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;

    const maxBytes = this.room.phase === 'lobby' ? MAX_LOBBY_MSG_BYTES : MAX_GAME_MSG_BYTES;
    if (raw.length > maxBytes) {
      this.sendTo(ws, { type: 'error', code: 'PAYLOAD_TOO_LARGE', message: '封包過大，已拒絕處理。' });
      return;
    }
    if (!this.allowRate(attachment.peerId, attachment.isHost)) {
      return;
    }

    let msg: ClientToServerMsg;
    try {
      msg = JSON.parse(raw) as ClientToServerMsg;
    } catch {
      return;
    }

    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'ping': {
        this.sendTo(ws, { type: 'pong', clientTime: msg.clientTime });
        return;
      }

      case 'player_input': {
        if (this.room.phase !== 'playing' || attachment.isHost) return;
        const hostSock = this.findHostSocket();
        if (hostSock) {
          this.sendTo(hostSock, { type: 'remote_input', peerId: attachment.peerId, input: msg.input });
        }
        return;
      }

      case 'world_snapshot': {
        if (!attachment.isHost || this.room.phase !== 'playing') return;
        this.broadcast({ type: 'world_snapshot', snapshot: msg.snapshot }, attachment.peerId);
        return;
      }

      case 'update_profile': {
        if (this.room.phase === 'playing') return;
        const target = this.room.players.find((p) => p.peerId === attachment.peerId);
        if (!target) return;
        target.name = sanitizeNickname(msg.name, target.name);
        target.faction = validFaction(msg.faction);
        target.skinId = String(msg.skinId || target.skinId).slice(0, 48);
        if (msg.siegeLoadout) {
          target.siegeLoadout = msg.siegeLoadout;
        }
        await this.scheduleCleanupAt(Date.now() + LOBBY_IDLE_TIMEOUT_MS);
        this.broadcast({ type: 'lobby_state', lobby: this.room });
        return;
      }

      case 'update_room_settings': {
        if (!attachment.isHost || this.room.phase === 'playing') return;
        if (msg.mode !== undefined) {
          this.room.mode = validMode(msg.mode);
        }
        if (msg.siegeDurationSec !== undefined) {
          this.room.siegeDurationSec = validSiegeDuration(msg.siegeDurationSec);
        }
        this.room.mapId = String(msg.mapId || 'tokyo_shrine').slice(0, 80);
        this.room.customMap = msg.customMap;
        this.room.difficulty = validDifficulty(msg.difficulty);
        await this.scheduleCleanupAt(Date.now() + LOBBY_IDLE_TIMEOUT_MS);
        this.broadcast({ type: 'lobby_state', lobby: this.room });
        return;
      }

      case 'start_match': {
        if (!attachment.isHost) return;
        if (msg.mode !== undefined) {
          this.room.mode = validMode(msg.mode);
        }
        if (msg.siegeDurationSec !== undefined) {
          this.room.siegeDurationSec = validSiegeDuration(msg.siegeDurationSec);
        }
        this.room.mapId = String(msg.mapId || this.room.mapId).slice(0, 80);
        this.room.customMap = msg.customMap;
        this.room.difficulty = validDifficulty(msg.difficulty);
        this.room.phase = 'playing';
        await this.scheduleCleanupAt(Date.now() + MAX_MATCH_DURATION_MS);
        this.broadcast({ type: 'match_started', lobby: this.room });
        return;
      }

      case 'match_ended': {
        if (!attachment.isHost) return;
        this.room.phase = 'ended';
        await this.scheduleCleanupAt(Date.now() + POST_MATCH_CLEANUP_MS);
        this.broadcast({ type: 'lobby_state', lobby: this.room });
        return;
      }

      case 'return_to_lobby': {
        if (!attachment.isHost) return;
        for (const p of this.room.players) {
          if (p.disconnected) {
            delete this.reconnectTokens[p.peerId];
          }
        }
        this.room.players = this.room.players.filter((p) => !p.disconnected);
        this.room.phase = 'lobby';
        await this.scheduleCleanupAt(Date.now() + LOBBY_IDLE_TIMEOUT_MS);
        this.broadcast({ type: 'lobby_state', lobby: this.room });
        return;
      }
    }
  }

  public async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    await this.handleDisconnect(ws);
  }

  public async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;

    const superseded = this.ctx.getWebSockets().some((s) => {
      if (s === ws || s.readyState !== 1) return false;
      const other = s.deserializeAttachment() as SocketAttachment | null;
      return other?.peerId === att.peerId;
    });
    if (superseded) return;

    if (att.isHost) {
      await this.cleanupRoom(4004, '房主已離線，房間資源已即時釋放');
      return;
    }

    const leaving = this.room.players.find((p) => p.peerId === att.peerId);
    const remainingOpen = this.ctx.getWebSockets().filter((s) => s !== ws && s.readyState === 1);
    if (remainingOpen.length === 0) {
      await this.cleanupRoom(1000, '所有玩家已離開，房間已清除');
      return;
    }

    if (this.room.phase === 'playing') {
      if (leaving) {
        leaving.disconnected = true;
        await this.persistRoom();
        this.broadcast({ type: 'peer_left', peerId: leaving.peerId, name: leaving.name, canRejoin: true });
        this.broadcast({ type: 'lobby_state', lobby: this.room });
      }
      return;
    }

    this.room.players = this.room.players.filter((p) => p.peerId !== att.peerId);
    delete this.reconnectTokens[att.peerId];
    if (this.room.players.length === 0) {
      await this.cleanupRoom(1000, '所有玩家已離開，房間已清除');
      return;
    }

    await this.persistRoom();
    this.broadcast({ type: 'lobby_state', lobby: this.room });
  }

  public async alarm(): Promise<void> {
    await this.cleanupRoom(4002, '房間已逾時或戰局結束，伺服器資源已自動清理');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        maxPlayers: MAX_ROOM_PLAYERS,
        passcodeRequired: Boolean(env.ROOM_PASSCODE && env.ROOM_PASSCODE.trim().length > 0),
      });
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/ws$/);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      if (!ROOM_CODE_REGEX.test(code)) {
        return Response.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      if (env.ROOM_PASSCODE && env.ROOM_PASSCODE.trim().length > 0) {
        const provided = url.searchParams.get('passcode')?.trim() ?? '';
        if (provided !== env.ROOM_PASSCODE.trim()) {
          return Response.json({ error: 'INVALID_PASSCODE', message: '房間密碼錯誤或未填寫。' }, { status: 403 });
        }
      }
      const stub = env.GAME_ROOM.getByName(code);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
