import { randomUUID } from "node:crypto";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type CdpEventHandler = (params: any) => void;

export class LightweightCdpClient {
  private socket: any;
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly eventHandlers = new Map<string, Set<CdpEventHandler>>();

  private constructor(socket: any) {
    this.socket = socket;
    this.socket.addEventListener("message", (event: { data: string }) => {
      this.handleMessage(event.data);
    });
    this.socket.addEventListener("error", (event: unknown) => {
      const error = event instanceof Error ? event : new Error("CDP websocket error");
      this.rejectAllPending(error);
    });
    this.socket.addEventListener("close", () => {
      this.rejectAllPending(new Error("CDP websocket closed"));
    });
  }

  static async connect(wsUrl: string): Promise<LightweightCdpClient> {
    const WebSocketCtor = (globalThis as any).WebSocket;
    if (!WebSocketCtor) {
      throw new Error("Global WebSocket is not available in this Node runtime.");
    }

    const socket = new WebSocketCtor(wsUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(`Failed to connect to CDP target ${wsUrl}`)), {
        once: true
      });
    });

    return new LightweightCdpClient(socket);
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;
    await new Promise<void>((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true });
      socket.close();
    });
  }

  on(eventName: string, handler: CdpEventHandler): () => void {
    const handlers = this.eventHandlers.get(eventName) ?? new Set<CdpEventHandler>();
    handlers.add(handler);
    this.eventHandlers.set(eventName, handlers);
    return () => {
      const current = this.eventHandlers.get(eventName);
      current?.delete(handler);
      if (current && current.size === 0) {
        this.eventHandlers.delete(eventName);
      }
    };
  }

  once(eventName: string, timeoutMs = 10_000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for CDP event ${eventName}`));
      }, timeoutMs);
      const off = this.on(eventName, (params) => {
        clearTimeout(timeout);
        off();
        resolve(params);
      });
    });
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = ++this.nextId;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });
    this.socket.send(payload);
    return await promise;
  }

  async evaluate<T = unknown>(expression: string, awaitPromise = true): Promise<T> {
    const result = await this.send<{ result?: { result?: { value?: T; description?: string } }; exceptionDetails?: { text?: string } }>(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise,
        returnByValue: true
      }
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? `Runtime.evaluate failed for expression: ${expression.slice(0, 80)}`);
    }
    return (result.result?.result?.value ?? undefined) as T;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
  }

  async clickAt(x: number, y: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none"
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1
    });
  }

  static async createIsolatedTarget(browserOrigin: string): Promise<{ targetId: string; webSocketDebuggerUrl: string }> {
    const response = await fetch(`${browserOrigin}/json/new?${encodeURIComponent("about:blank")}`, {
      method: "PUT"
    });
    if (!response.ok) {
      throw new Error(`Failed to create CDP target: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { id: string; webSocketDebuggerUrl: string };
    return {
      targetId: json.id,
      webSocketDebuggerUrl: json.webSocketDebuggerUrl
    };
  }

  static async getBrowserWebSocketUrl(browserOrigin: string): Promise<string> {
    const response = await fetch(`${browserOrigin}/json/version`);
    if (!response.ok) {
      throw new Error(`Failed to inspect Chrome debugging endpoint: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { webSocketDebuggerUrl?: string };
    if (!json.webSocketDebuggerUrl) {
      throw new Error("Chrome debugging endpoint did not return a browser websocket URL.");
    }
    return json.webSocketDebuggerUrl;
  }

  static async closeTarget(browserOrigin: string, targetId: string): Promise<void> {
    await fetch(`${browserOrigin}/json/close/${targetId}`);
  }

  static makeTempId(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, "")}`;
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { message?: string };
    };

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? `CDP command ${message.id} failed`));
        return;
      }
      pending.resolve(message);
      return;
    }

    if (!message.method) {
      return;
    }

    const handlers = this.eventHandlers.get(message.method);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(message.params);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
