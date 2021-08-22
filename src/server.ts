import type { Socket } from "net";
import { URL } from "url";
import http from "http";
import path from "path";
import fs from "fs";

export interface ServerResponse {
  accessToken: string;
  scope: string;
}

export interface ServerResponseError {
  type: string;
  message: string;
}

export interface ServerOptions {
  redirectUri: string;
}

type ReplaceRecord = Record<string, string>;

interface FileOptions {
  statusCode?: number;
  contentType?: string;
  replace?: ReplaceRecord;
}

export class Server {
  public readonly host: string;
  public readonly port: string;
  public readonly redirectUri: string;

  private http: http.Server | null = null;
  private states: Set<string> = new Set();
  private clients: Map<string, Socket> = new Map();
  private responseTimeout: number = 2 * 60 * 1000;
  private closeTimeout: number = 2000;

  constructor(options: ServerOptions) {
    const { host, port } = new URL(options.redirectUri);

    this.redirectUri = options.redirectUri;
    this.host = host;
    this.port = port;
  }

  private close(immediat: boolean = false) {
    return new Promise((resolve, reject) => {
      if (!this.http) {
        resolve(true);
        return;
      }
      setTimeout(
        () => {
          this.clients.forEach((client) => client.destroy());
          this.http?.close((err) => {
            this.http = null;
            err ? reject(err) : resolve(true);
          });
        },
        immediat ? 0 : this.closeTimeout
      );
    });
  }

  onListening(reject: (reason: ServerResponseError) => void) {
    console.log(`Listening at http://${this.host}`);

    setTimeout(() => {
      this.close(true);
      reject({ type: "timeout", message: "Response timeout" });
    }, this.responseTimeout);
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

  onRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    resolve: (value: ServerResponse | PromiseLike<ServerResponse>) => void,
    reject: (reason: ServerResponseError) => void
  ) {
    const url = new URL(req.url ?? "/404", this.redirectUri);

    console.log("REQUEST:", url.pathname);

    switch (url.pathname) {
      case "/auth":
        this.sendFile(res, "auth.html");
        break;
      case "/error":
        const type = url.searchParams.get("error") || "undefined";
        const message =
          url.searchParams.get("error_description") || "Undefined error";
        this.sendFile(res, "error.html", { replace: { message } });
        reject({ type, message });
        this.close();
        break;
      case "/style.css":
        this.sendFile(res, "style.css", { contentType: "text/css" });
        break;
      case "/favicon.ico":
        this.sendFile(res, "favicon.ico", { contentType: "image/x-icon" });
        break;
      case "/token":
        const state = url.searchParams.get("state");
        const scope = url.searchParams.get("scope");
        const accessToken = url.searchParams.get("access_token");

        if (accessToken && scope && state && this.states.has(state)) {
          this.sendFile(res, "logged-in.html");
          resolve({ accessToken, scope });
        } else {
          const message = "Connection refused, the state does not match!";
          this.sendFile(res, `error.html`, { replace: { message } });
          reject({ type: "invalid-state", message });
        }

        if (state) {
          this.states.delete(state);
        }

        this.close();
        break;
      default:
        console.log("Error 404", req);
        this.sendFile(res, "404.html");
        break;
    }
  }

  private onConnection(socket: Socket) {
    const { remoteAddress, remotePort } = socket;
    const client = `${remoteAddress}:${remotePort}`;

    this.clients.set(client, socket);

    socket.on("close", () => {
      this.clients.delete(client);
    });
  }

  private onClose() {
    console.log("Twitch Auth server closed");
  }

  async listen(state: string): Promise<ServerResponse> {
    if (this.http) {
      await this.close();
    }

    this.states.add(state);

    return new Promise((resolve, reject) => {
      this.http = http.createServer((req, res) =>
        this.onRequest(req, res, resolve, reject)
      );
      this.http.on("close", () => this.onClose());
      this.http.on("connection", (socket) => this.onConnection(socket));
      this.http.listen(this.port, () => this.onListening(reject));
    });
  }
}
