import { AccessToken, AuthProvider, AuthProviderTokenType } from "twitch-auth";
import { Server, ServerResponse } from "./server";

export interface NodeAuthProviderOptions {
  clientId: string;
  redirectUri: string;
  scopes?: string | string[];
  accessToken?: AccessToken | null;
}

function arrayifyScopes(scopes?: string | string[]): string[] {
  return typeof scopes === "string" ? scopes.split(/[ ,]+/) : scopes ?? [];
}

function arrayUnique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export class NodeAuthProvider implements AuthProvider {
  private readonly _clientId: string;
  private readonly _redirectUri: string;
  private readonly _scopes: string[];

  private _accessToken: AccessToken | null = null;

  public readonly server: Server;
  public readonly tokenType: AuthProviderTokenType = "user";

  get clientId() {
    return this._clientId;
  }

  get redirectUri() {
    return this._redirectUri;
  }

  get currentScopes() {
    return this._accessToken?.scope ?? [];
  }

  constructor(options: NodeAuthProviderOptions) {
    const { clientId, redirectUri, scopes, accessToken } = options;

    this._clientId = clientId;
    this._redirectUri = redirectUri;
    this._scopes = arrayifyScopes(scopes);

    this.server = new Server({ clientId, redirectUri });

    if (accessToken) {
      this.setAccessToken(accessToken);
    }
  }

  setAccessToken(accessToken: AccessToken): void {
    this._accessToken = accessToken;
  }

  hasScopes(scopes: string[]) {
    return scopes.every((scope) => this._accessToken?.scope.includes(scope));
  }

  enableForceVerify(once: boolean = false) {
    this.server.enableForceVerify(once);
  }

  disableForceVerify() {
    this.server.disableForceVerify();
  }

  private async requestNewScopes(scopes: string[]): Promise<ServerResponse> {
    return this.server.listen(
      arrayUnique([...this._scopes, ...scopes]).join(" ")
    );
  }

  get forceVerify() {
    return this.server.forceVerify || this.server.forceVerifyOnce;
  }

  async getAccessToken(scopes?: string | string[]): Promise<AccessToken> {
    scopes = arrayifyScopes(scopes);

    if (!this.forceVerify && this._accessToken && this.hasScopes(scopes)) {
      return this._accessToken;
    }

    try {
      const { accessToken, scope } = await this.requestNewScopes(scopes);

      this._accessToken = new AccessToken({
        scope: arrayifyScopes(scope),
        access_token: accessToken,
        refresh_token: "",
      });
    } catch (error) {
      return Promise.reject(error);
    }

    return this._accessToken;
  }
}
