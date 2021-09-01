# Twitch.js - Node (HTTP) auth provider

This is an [AuthProvider](https://d-fischer.github.io/twitch-auth/reference/interfaces/AuthProvider.html) implementation for [d-fischer `twitch` package family](https://github.com/d-fischer/twitch) that will automatically pop up a Twitch OAuth dialog in default user browser as soon as new scopes are requested.

## Installation

To add this library to your project, just execute:

    yarn add twitch-node-auth-provider

or using npm:

    npm install twitch-node-auth-provider

## Basic usage

To instantiate an [ApiClient](https://d-fischer.github.io/twitch/reference/classes/ApiClient.html) with this auth provider, just pass it to its constructor:

```ts
import { ApiClient } from "twitch";
import { NodeAuthProvider } from "twitch-node-auth-provider";

const authProvider = new NodeAuthProvider({
  clientId: "7m7uv94xk5lu42H2G27ay7nd1rpg",
  redirectUri: "http://localhost:4242/auth",
});

const client = new ApiClient({
  authProvider,
});

client.helix.users.getMe(true);
```

## Options

| name        | type                                                                                      | optional | description                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| clientId    | `string`                                                                                  | `false`  | The client ID found in your Twitch Dev Console.                                                     |
| redirectUri | `string`                                                                                  | `false`  | The redirect URI you provided in your Twitch Dev Console.                                           |
| scopes      | `string \| string[]`                                                                      | `true`   | A list of [scopes](https://dev.twitch.tv/docs/authentication#scopes) that will always be requested. |
| accessToken | [AccessToken](https://d-fischer.github.io/twitch-auth/reference/classes/AccessToken.html) | `true`   | Represents the data of an OAuth access token returned by Twitch.                                    |

## Force verify

To allow the user to "log out" and change to another account, use `enableForceVerify()`:

```ts
(async () => {
  await client.helix.users.getMe(); // <- open login page
  await client.helix.users.getMe(); // <- already logged-in

  authProvider.enableForceVerify(); // <- force login for all the latter calls.

  await client.helix.users.getMe(); // <- open login page
  await client.helix.users.getMe(); // <- open login page
```

```ts
  authProvider.enableForceVerify(true); // <- force login on the next call only.

  await client.helix.users.getMe(); // <- open login page
  await client.helix.users.getMe(); // <- already logged-in
})();
```

## Events

Listen all events:

```ts
authProvider.server.on("event", ({ eventName, data }) =>
  console.log(eventName, data)
);
```

Or listen one event:

```ts
authProvider.server.on("BROWSER_OPEN", () =>
  console.log("Opened Twitch login page in your default browser, take a look!")
);
```

### Events list

- ERROR
- CLOSE
- LISTEN
- LISTENING
- BROWSER_OPEN
- ACCESS_TOKEN

### Error types

- UNKNOW
- INVALIDATED
- LOGIN_TIMEOUT
- INVALID_STATE
- ACCESS_DENIED
