# Twitch.js - HTTP auth provider

This is an {@AuthProvider} implementation for [the `twitch` package family](https://github.com/d-fischer/twitch) that will automatically pop up a Twitch OAuth dialog in default user browser as soon as new scopes are requested.

## Installation

To add this library to your project, just execute:

    yarn add twitch-http-auth-provider

or using npm:

    npm install twitch-http-auth-provider

## Basic usage

To instantiate an {@ApiClient} with this auth provider, just pass it to its constructor:

```ts
import { ApiClient } from "twitch";
import { HTTPAuthProvider } from "twitch-http-auth-provider";

const clientId = "abc123";
const redirectUri = "http://foo.bar/login";

const authProvider = new HTTPAuthProvider({
  clientId,
  redirectUri,
});

const client = new ApiClient({
  authProvider,
});
```

To allow the user to "log out" and change to another account, use:

```ts
authProvider.allowUserChange();
```
