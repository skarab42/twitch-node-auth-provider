import fs from "fs";
import http from "http";
import path from "path";
import open from "open";
import { URL } from "url";
import { Socket } from "net";
import { v4 as uuid } from "uuid";

export interface ServerOptions {
  clientId: string;
  redirectUri: string;
}

export interface ServerResponse {
  accessToken: string;
  scope: string;
}

type ReplaceRecord = Record<string, string>;

interface FileOptions {
  statusCode?: number;
  contentType?: string;
  replace?: ReplaceRecord;
}

export interface ServerResponseError {
  type: string;
  message: string;
}

interface ServerPromise {
  resolve: (value: ServerResponse) => void;
  reject: (reason: ServerResponseError) => void;
}

export class Server {
  public readonly host: string;
  public readonly port: string;
  public readonly clientId: string;
  public readonly redirectUri: string;

  private state: string | null = null;
  private server: http.Server | null = null;
  private sockets: Map<string, Socket> = new Map();
  private promise: ServerPromise | null = null;

  constructor(options: ServerOptions) {
    const { clientId, redirectUri } = options;
    const { host, port } = new URL(redirectUri);

    this.host = host;
    this.port = port;
    this.clientId = clientId;
    this.redirectUri = redirectUri;
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

    console.log("onRequest:", url.pathname);

    switch (url.pathname) {
      case "/auth":
        this.sendFile(res, "auth.html");
        break;
      case "/token":
        const state = url.searchParams.get("state");
        const scope = url.searchParams.get("scope");
        const accessToken = url.searchParams.get("access_token");
        if (accessToken && scope && state && state === this.state) {
          this.sendFile(res, "logged-in.html");
          this.resolve({ accessToken, scope });
        } else {
          const message = "Connection refused, the state does not match!";
          this.sendFile(res, `error.html`, { replace: { message } });
          this.reject({ type: "invalid-state", message });
        }
        break;
      case "/error":
        const type = url.searchParams.get("error") || "undefined";
        const message =
          url.searchParams.get("error_description") || "Undefined error";
        this.sendFile(res, "error.html", { replace: { message } });
        this.reject({ type, message });
        break;
      case "/style.css":
        this.sendFile(res, "style.css", { contentType: "text/css" });
        break;
      case "/favicon.ico":
        this.sendFile(res, "favicon.ico", { contentType: "image/x-icon" });
        break;
      default:
        console.log("Error 404", req);
        this.sendFile(res, "404.html");
        break;
    }
  }

  private onSocketConnection(socket: Socket): void {
    const { remoteAddress, remotePort } = socket;
    const socketId = `${remoteAddress}:${remotePort}`;

    console.log("onSocketConnection", { socketId });
    this.sockets.set(socketId, socket);

    socket.on("close", () => {
      console.log("onSocketClose", { socketId });
      this.sockets.delete(socketId);
    });
  }

  private onClose(): void {
    console.log("Twitch auth server closed");
    this.server = null;
  }

  private openTwitchAuthPage(scopes: string) {
    console.log("Open Twitch auth page");

    this.state = uuid();

    open(
      `https://id.twitch.tv/oauth2/authorize?client_id=${this.clientId}` +
        `&redirect_uri=${this.redirectUri}` +
        `&response_type=token` +
        `&state=${this.state}` +
        `&scope=${scopes}`
    );
  }

  private onListening(scopes: string): void {
    console.log(`Twitch auth server listening at http://${this.host}`);
    this.openTwitchAuthPage(scopes);
  }

  private createServerAndlisten(scopes: string) {
    this.server = http.createServer((req, res) => this.onRequest(req, res));
    this.server.on("connection", (socket) => this.onSocketConnection(socket));
    this.server.on("close", () => this.onClose());
    this.server.listen(this.port, () => this.onListening(scopes));
  }

  private resolve(response: ServerResponse) {
    this.promise?.resolve(response);
    this.promise = null;
  }

  private reject(reason: ServerResponseError) {
    this.promise?.reject(reason);
    this.promise = null;
  }

  async listen(scopes: string): Promise<ServerResponse> {
    if (!this.server) {
      this.createServerAndlisten(scopes);
    } else {
      setTimeout(() => {
        if (this.promise) {
          this.openTwitchAuthPage(scopes);
        }
      }, 2000);
    }

    if (this.promise) {
      this.reject({
        type: "invalidated-by-new-request",
        message: "Invalidated by new request",
      });
    }

    return new Promise((resolve, reject) => {
      this.promise = { resolve, reject };
    });
  }
}
