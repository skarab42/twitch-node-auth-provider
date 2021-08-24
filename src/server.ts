import fs from "fs";
import http from "http";
import path from "path";
import open from "open";
import { URL } from "url";
import { Socket } from "net";
import { v4 as uuid } from "uuid";
import { EventEmitter } from "events";

export interface ServerOptions {
  clientId: string;
  redirectUri: string;
  closeTimeout?: number;
  loginTimeout?: number;
  forceVerify?: boolean;
  forceVerifyOnce?: boolean;
}

export interface ServerResponse {
  accessToken: string;
  scope: string;
}

export enum ServerErrorTypes {
  UNKNOW = "UNKNOW",
  INVALIDATED = "INVALIDATED",
  LOGIN_TIMEOUT = "LOGIN_TIMEOUT",
  INVALID_STATE = "INVALID_STATE",
  ACCESS_DENIED = "ACCESS_DENIED",
}

export enum ServerEvents {
  ERROR = "ERROR",
  CLOSE = "CLOSE",
  LISTEN = "LISTEN",
  LISTENING = "LISTENING",
  BROWSER_OPEN = "BROWSER_OPEN",
  ACCESS_TOKEN = "ACCESS_TOKEN",
}

export interface ServerResponseError {
  type: ServerErrorTypes | string;
  message: string;
}

type ReplaceRecord = Record<string, string>;

interface FileOptions {
  statusCode?: number;
  contentType?: string;
  replace?: ReplaceRecord;
}

interface ServerPromise {
  resolve: (value: ServerResponse) => void;
  reject: (reason: ServerResponseError) => void;
}

export class Server extends EventEmitter {
  public readonly host: string;
  public readonly port: string;
  public readonly authPath: string;
  public readonly clientId: string;
  public readonly redirectUri: string;

  public closeTimeout: number;
  public loginTimeout: number;
  public forceVerify: boolean = false;
  public forceVerifyOnce: boolean = false;

  private server: http.Server | null = null;
  private promise: ServerPromise | null = null;
  private states: Set<string | null> = new Set();
  private sockets: Map<string, Socket> = new Map();
  private listenPromise: Promise<void> | null = null;
  private loginTimeoutId: NodeJS.Timeout | null = null;

  constructor(options: ServerOptions) {
    super();

    const { clientId, redirectUri, closeTimeout, loginTimeout } = options;
    const { host, port, pathname } = new URL(redirectUri);

    this.host = host;
    this.port = port;
    this.authPath = pathname;
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.closeTimeout = closeTimeout ?? 2000;
    this.loginTimeout = loginTimeout ?? 5 * 60 * 1000;
  }

  override emit(eventName: string, data?: unknown): boolean {
    const a = super.emit("event", { eventName, data });
    const b = super.emit(eventName, data);
    return a || b;
  }

  private sendFile(
    res: http.ServerResponse,
    file: string,
    options: FileOptions = {}
  ) {
    const { statusCode, contentType, replace } = {
      statusCode: 200,
      contentType: "text/html",
      ...options,
    };

    let content = fs.readFileSync(
      path.join(__dirname, "..", "www", file),
      "utf-8"
    );

    if (replace) {
      Object.entries(replace).forEach(([tag, replaceValue]) => {
        content = content.replace(new RegExp(`{{${tag}}}`, "gi"), replaceValue);
      });
    }

    res.writeHead(statusCode, { "Content-Type": contentType });
    res.end(content);
  }

  private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/404", this.redirectUri);

    switch (url.pathname) {
      case this.authPath:
        this.sendFile(res, "auth.html");
        break;
      case "/token":
        const state = url.searchParams.get("state");
        const scope = url.searchParams.get("scope");
        const accessToken = url.searchParams.get("access_token");
        if (accessToken && scope && this.states.has(state)) {
          this.sendFile(res, "logged-in.html");
          this.resolve({ accessToken, scope });
        } else {
          const message = "Connection refused, the state does not match!";
          this.sendFile(res, `error.html`, { replace: { message } });
          this.reject({ type: ServerErrorTypes.INVALID_STATE, message });
        }
        this.states.delete(state);
        break;
      case "/error":
        const type = url.searchParams.get("error") || ServerErrorTypes.UNKNOW;
        const message =
          url.searchParams.get("error_description") || "Undefined error";
        this.sendFile(res, "error.html", { replace: { message } });
        this.reject({ type: type.toLocaleUpperCase(), message });
        break;
      case "/style.css":
        this.sendFile(res, "style.css", { contentType: "text/css" });
        break;
      case "/favicon.ico":
        this.sendFile(res, "favicon.ico", { contentType: "image/x-icon" });
        break;
      default:
        this.sendFile(res, "404.html");
        break;
    }
  }

  private onSocketConnection(socket: Socket): void {
    const { remoteAddress, remotePort } = socket;
    const socketId = `${remoteAddress}:${remotePort}`;

    this.sockets.set(socketId, socket);

    socket.on("close", () => {
      this.sockets.delete(socketId);
    });
  }

  private onClose(): void {
    this.server = null;
    this.promise = null;
    this.emit(ServerEvents.CLOSE);
  }

  enableForceVerify(once: boolean = false) {
    this.forceVerifyOnce = once;
    this.forceVerify = true;
  }

  disableForceVerify() {
    this.forceVerify = false;
    this.forceVerifyOnce = false;
  }

  private openTwitchAuthPage(scopes: string) {
    const state = uuid();
    this.states.add(state);

    const forceVerify = this.forceVerify || this.forceVerifyOnce;
    const url =
      `https://id.twitch.tv/oauth2/authorize?client_id=${this.clientId}` +
      `&redirect_uri=${this.redirectUri}` +
      `&force_verify=${forceVerify}` +
      `&response_type=token` +
      `&scope=${scopes}` +
      `&state=${state}`;

    open(url);

    this.emit(ServerEvents.BROWSER_OPEN, { url });

    if (this.forceVerifyOnce) {
      this.disableForceVerify();
    }
  }

  private close() {
    this.sockets.forEach((client) => client.destroy());
    this.server?.close();
  }

  private closeWithTimeout() {
    setTimeout(() => {
      if (!this.promise && this.server) {
        this.close();
      }
    }, this.closeTimeout);
  }

  private resetLoginTimeout() {
    if (this.loginTimeoutId) {
      clearTimeout(this.loginTimeoutId);
    }
    this.loginTimeoutId = setTimeout(() => {
      if (this.promise) {
        this.reject({
          type: ServerErrorTypes.LOGIN_TIMEOUT,
          message: "Login timeout",
        });
      }
      this.close();
    }, this.loginTimeout);
  }

  private createServerAndlisten(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.onRequest(req, res));
      this.server.on("connection", (socket) => this.onSocketConnection(socket));
      this.server.on("close", () => this.onClose());
      this.server.listen(this.port, () => {
        this.emit(ServerEvents.LISTENING, { host: this.host });
        resolve();
      });
    });
  }

  private resolve(response: ServerResponse) {
    this.promise?.resolve(response);
    this.promise = null;
    this.closeWithTimeout();
    this.emit(ServerEvents.ACCESS_TOKEN, response);
  }

  private reject(reason: ServerResponseError) {
    this.promise?.reject(reason);
    this.promise = null;
    this.closeWithTimeout();
    this.emit(ServerEvents.ERROR, reason);
  }

  async listen(scopes: string) {
    this.emit(ServerEvents.LISTEN);

    if (this.promise) {
      this.reject({
        type: ServerErrorTypes.INVALIDATED,
        message: "Invalidated by new request",
      });
    }

    const promise: Promise<ServerResponse> = new Promise((resolve, reject) => {
      this.promise = { resolve, reject };
    });

    if (!this.server) {
      this.listenPromise = this.createServerAndlisten();
    }

    if (this.listenPromise) {
      await this.listenPromise;
      this.listenPromise = null;
    }

    this.resetLoginTimeout();
    this.openTwitchAuthPage(scopes);

    return promise;
  }
}
