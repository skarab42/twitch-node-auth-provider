import { AccessToken, AuthProvider, AuthProviderTokenType } from "twitch-auth";

function arrayifyScopes(scopes?: string | string[]): string[] {
  return typeof scopes === "string" ? scopes.split(/[ ,\+]+/) : scopes ?? [];
}

export interface NodeAuthProviderOptions {
  clientId: string;
  redirectUri: string;
  scopes?: string | string[];
  accessToken?: AccessToken | string | null;
}

export class NodeAuthProvider implements AuthProvider {
  private readonly _clientId: string;
  private readonly _redirectUri: string;
  private readonly _currentScopes: Set<string>;

  private _accessToken: AccessToken | null = null;

  public readonly tokenType: AuthProviderTokenType = "user";

  get clientId() {
    return this._clientId;
  }

  get redirectUri() {
    return this._redirectUri;
  }

  get currentScopes() {
    return Array.from(this._currentScopes);
  }

  constructor(options: NodeAuthProviderOptions) {
    this._clientId = options.clientId;
    this._redirectUri = options.redirectUri;
    this._currentScopes = new Set(arrayifyScopes(options.scopes));

    if (options.accessToken) {
      this.setAccessToken(options.accessToken);
    }
  }

  setAccessToken(accessToken: AccessToken | string | null): void {
    if (typeof accessToken === "string") {
      accessToken = new AccessToken({
        scope: this.currentScopes,
        access_token: accessToken,
        refresh_token: "",
      });
    }

    this._accessToken = accessToken;
  }

  async getAccessToken(scopes?: string | string[]): Promise<AccessToken> {
    scopes = arrayifyScopes(scopes);
    console.log("getAccessToken:", { scopes });
    return this._accessToken ?? Promise.reject();
  }
}
