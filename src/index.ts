import { AccessToken, AuthProvider, AuthProviderTokenType } from "twitch-auth";
import { v4 as uuid } from "uuid";
import open from "open";

function arrayifyScopes(scopes?: string | string[]): string[] {
  return typeof scopes === "string" ? scopes.split(/[ ,]+/) : scopes ?? [];
}

function arrayUnique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export interface NodeAuthProviderOptions {
  clientId: string;
  redirectUri: string;
  scopes?: string | string[];
  accessToken?: AccessToken | null;
}

export class NodeAuthProvider implements AuthProvider {
  private readonly _clientId: string;
  private readonly _redirectUri: string;
  private readonly _scopes: string[];

  private _requestState: string | null = null;
  private _accessToken: AccessToken | null = null;

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
    this._clientId = options.clientId;
    this._redirectUri = options.redirectUri;
    this._scopes = arrayifyScopes(options.scopes);

    if (options.accessToken) {
      this.setAccessToken(options.accessToken);
    }
  }

  setAccessToken(accessToken: AccessToken): void {
    this._accessToken = accessToken;
  }

  hasScopes(scopes: string[]) {
    return scopes.every((scope) => this._accessToken?.scope.includes(scope));
  }

  private openTwitchWindow(scopes: string[]) {
    const scope = arrayUnique([...this._scopes, ...scopes]).join(" ");
    open(
      `https://id.twitch.tv/oauth2/authorize?client_id=${this._clientId}` +
        `&redirect_uri=${this._redirectUri}` +
        `&state=${this._requestState}` +
        `&response_type=token` +
        `&scope=${scope}`
    );
  }

  private async requestNewScopes(scopes: string[]): Promise<AccessToken> {
    this._requestState = uuid();
    this.openTwitchWindow(scopes);
    // start server
    // wait for response
    return Promise.reject("Prout");
  }

  async getAccessToken(scopes?: string | string[]): Promise<AccessToken> {
    scopes = arrayifyScopes(scopes);

    if (this._accessToken && this.hasScopes(scopes)) {
      return this._accessToken;
    }

    try {
      this._accessToken = await this.requestNewScopes(scopes);
    } catch (error) {
      return Promise.reject(error);
    }

    return this._accessToken;
  }
}
