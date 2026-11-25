import type { ClientToServerMsg, ServerToClientMsg } from './protocol';

export interface RoomConnectionOptions {
  roomCode: string;
  name: string;
  faction: string;
  skinId: string;
  passcode?: string;
}

export interface RoomTransport {
  connect(opts: RoomConnectionOptions): void;
  send(msg: ClientToServerMsg): void;
  disconnect(reason?: string): void;
  onMessage(handler: (msg: ServerToClientMsg) => void): () => void;
  onOpen(handler: () => void): () => void;
  onClose(handler: (info: { code: number; reason: string }) => void): () => void;
  isConnected(): boolean;
  getRttMs(): number | null;
  getBufferedAmount(): number;
}

export class WebSocketRoomTransport implements RoomTransport {
  private ws: WebSocket | null = null;
  private messageHandlers = new Set<(msg: ServerToClientMsg) => void>();
  private openHandlers = new Set<() => void>();
  private closeHandlers = new Set<(info: { code: number; reason: string }) => void>();
  private pingTimer: number | null = null;
  private rttMs: number | null = null;

  public connect(opts: RoomConnectionOptions): void {
    this.disconnect('Reconnecting');
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      name: opts.name,
      faction: opts.faction,
      skinId: opts.skinId,
    });
    if (opts.passcode && opts.passcode.trim().length > 0) {
      params.set('passcode', opts.passcode.trim());
    }
    const url = `${proto}//${window.location.host}/api/rooms/${encodeURIComponent(opts.roomCode)}/ws?${params.toString()}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.startPing();
      for (const cb of this.openHandlers) cb();
    });

    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as ServerToClientMsg;
        if (msg.type === 'pong') {
          this.rttMs = Math.max(1, Math.round(performance.now() - msg.clientTime));
          return;
        }
        for (const cb of this.messageHandlers) cb(msg);
      } catch {
        // ignore malformed packets
      }
    });

    ws.addEventListener('close', (ev) => {
      if (this.ws !== ws) return;
      this.stopPing();
      this.ws = null;
      this.rttMs = null;
      for (const cb of this.closeHandlers) {
        cb({ code: ev.code, reason: ev.reason || '' });
      }
    });
  }

  public send(msg: ClientToServerMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  public disconnect(reason = 'Client left'): void {
    this.stopPing();
    const current = this.ws;
    this.ws = null;
    this.rttMs = null;
    if (current) {
      try {
        if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
          current.close(1000, reason);
        }
      } catch {
        // ignore
      }
    }
  }

  public onMessage(handler: (msg: ServerToClientMsg) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onOpen(handler: () => void): () => void {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  public onClose(handler: (info: { code: number; reason: string }) => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getRttMs(): number | null {
    return this.rttMs;
  }

  public getBufferedAmount(): number {
    return this.ws ? this.ws.bufferedAmount : 0;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', clientTime: performance.now() });
      }
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
