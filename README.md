# @fitzyracing/fetch-event-source

> Part of **[360 Bench](https://github.com/fitzyracing1/360-bench)**, tested fixes for abandoned npm packages.

[![npm](https://img.shields.io/npm/v/@fitzyracing/fetch-event-source.svg)](https://www.npmjs.com/package/@fitzyracing/fetch-event-source)

> **This is a fork of [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source)
> by Microsoft** and its contributors, published as a drop-in replacement that also works
> outside the browser main thread (Node.js, Bun, web workers). The upstream package has
> not been released since v2.0.1 (April 2021), and the crash below is still open. All credit
> for the original library goes to its authors and contributors; it remains available under
> the same MIT license. This fork is not affiliated with or endorsed by Microsoft.


## What's fixed in this fork

Based on upstream `@microsoft/fetch-event-source@2.0.1`; the API is unchanged.

- **No more `ReferenceError: document is not defined` in Node.js.** 2.0.1 registers a
  Page Visibility listener on `document` unconditionally, so calling `fetchEventSource()`
  anywhere without a DOM (Node.js, Bun, a web worker, a service worker or an
  extension background script) rejected immediately, before making a request. The fork only
  uses `document` when it exists. Without a document there is no page visibility, so the
  connection simply stays open, as with `openWhenHidden: true`.
  Upstream issues: [#39](https://github.com/Azure/fetch-event-source/issues/39),
  [#20](https://github.com/Azure/fetch-event-source/issues/20).
- **No more `ReferenceError: window is not defined`, even with `openWhenHidden: true`.**
  2.0.1 takes its default `fetch` and its retry timers from `window`
  (`window.fetch`, `window.setTimeout`, `window.clearTimeout`). The fork still uses
  `window` when there is one, and `globalThis` when there isn't.
  With your own `fetch` and `openWhenHidden: true`, 2.0.1 got as far as streaming the
  messages, then threw `document is not defined` while closing: `onerror` received that
  error, the returned promise never settled, and Node reported an unhandled rejection
  (which exits the process by default since Node 15). That case now resolves normally.
  This is the approach of the open upstream PRs
  [#41](https://github.com/Azure/fetch-event-source/pull/41) (`globalThis`),
  [#8](https://github.com/Azure/fetch-event-source/pull/8),
  [#21](https://github.com/Azure/fetch-event-source/pull/21) and
  [#71](https://github.com/Azure/fetch-event-source/pull/71) (web workers).
- **Nothing changes in the browser.** When `document` exists the fork registers and removes
  the same `visibilitychange` listener as 2.0.1, closes the request when the page is hidden
  and reconnects with the last event ID when it becomes visible again. The message parser,
  retry logic, `onopen`/`onmessage`/`onclose`/`onerror` callbacks and the TypeScript types
  are untouched; the whole change is a few lines in `src/fetch.ts`.

Upstream `main` has four commits after the 2.0.1 tag (2021-2023): stricter TypeScript compiler
settings and Dependabot updates of development dependencies. None of them changes the published
code, so they are not included.

In Node.js the default `fetch` is the built-in one (Node 18+). On older Node versions, or to use
another client, pass a `fetch` option whose responses have a WHATWG `ReadableStream` body (for
example [undici](https://www.npmjs.com/package/undici)'s `fetch`).


## Install

```bash
npm install @fitzyracing/fetch-event-source
```

```ts
import { fetchEventSource } from '@fitzyracing/fetch-event-source';
```

The package layout is the same as upstream (`lib/cjs` for `require()`, `lib/esm` for bundlers
via `module`, types in `lib/cjs/index.d.ts`).

### Using it as a drop-in replacement

If you depend on `@microsoft/fetch-event-source` yourself, install the fork under the old
name, so every `import ... from '@microsoft/fetch-event-source'` keeps working unchanged:

```bash
npm install @microsoft/fetch-event-source@npm:@fitzyracing/fetch-event-source@^2.0.2
```

This writes `"@microsoft/fetch-event-source": "npm:@fitzyracing/fetch-event-source@^2.0.2"`
into your `dependencies`.

To fix it inside other packages that depend on `@microsoft/fetch-event-source`, add an
override to your `package.json` (npm 8.3+):

```json
{
  "overrides": {
    "@microsoft/fetch-event-source": "npm:@fitzyracing/fetch-event-source@^2.0.2"
  }
}
```

If you also have it as a direct dependency, npm requires the override to match it
("Override for ... conflicts with direct dependency"), so do the install above first and
then reference it instead: `"@microsoft/fetch-event-source": "$@microsoft/fetch-event-source"`.

(Yarn: use `"resolutions"`; pnpm: `"pnpm": { "overrides": { ... } }`. Very early npm 9
releases such as 9.2.0 reject aliased overrides with "Invalid comparator", so upgrade npm if
you see that.)

### Tests

`npm test` runs the upstream parser tests (jasmine) and then `npm run test:node`
(`node:test`, Node 18+, run `npm run build` first):

- `test/node.test.js` streams from a local `http.createServer` SSE server with no `document`
  or `window`: default options, `openWhenHidden: true`, a custom `fetch` with a POST body,
  retries (with `last-event-id` and the server's `retry:` field), a fatal `onerror`, and
  aborting (including during a retry wait). Every request test fails on 2.0.1.
- `test/browser.test.js` puts a fake `window` and `document` on `globalThis` and checks that
  the `visibilitychange` listener is still registered and removed, that hiding the page closes
  the request and showing it reconnects with the last event ID, that `fetch` and the retry
  timers still come from `window`, and that `openWhenHidden: true`
  skips the listener. These pass on both 2.0.1 and the fork.

To run the same tests against another build, for example the original 2.0.1 from npm:
`FES_LIB=/path/to/package/lib/cjs npm run test:node`.


## About fetch-event-source

This package provides a better API for making [Event Source requests](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - also known as server-sent events - with all the features available in the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).

The [default browser EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) imposes several restrictions on the type of request you're allowed to make: the [only parameters](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource#Parameters) you're allowed to pass in are the `url` and `withCredentials`, so:
* You cannot pass in a request body: you have to encode all the information necessary to execute the request inside the URL, which is [limited to 2000 characters](https://stackoverflow.com/questions/417142) in most browsers.
* You cannot pass in custom request headers
* You can only make GET requests - there is no way to specify another method.
* If the connection is cut, you don't have any control over the retry strategy: the browser will silently retry for you a few times and then stop, which is not good enough for any sort of robust application.

This library provides an alternate interface for consuming server-sent events, based on the Fetch API. It is fully compatible with the [Event Stream format](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format), so if you already have a server emitting these events, you can consume it just like before. However, you now have greater control over the request and response so:

* You can use any request method/headers/body, plus all the other functionality exposed by fetch(). You can even provide an alternate fetch() implementation, if the default browser implementation doesn't work for you.
* You have access to the response object if you want to do some custom validation/processing before  parsing the event source. This is useful in case you have API gateways (like nginx) in front of your application server: if the gateway returns an error, you might want to handle it correctly.
* If the connection gets cut or an error occurs, you have full control over the retry strategy.

In addition, this library also plugs into the browser's [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) so the connection closes if the document is hidden (e.g., the user minimizes the window), and automatically retries with the last event ID when it becomes visible again. This reduces the load on your server by not having open connections unnecessarily (but you can opt out of this behavior if you want.)

### Install
```sh
npm install @fitzyracing/fetch-event-source
```

### Usage
```ts
// BEFORE:
const sse = new EventSource('/api/sse');
sse.onmessage = (ev) => {
    console.log(ev.data);
};

// AFTER:
import { fetchEventSource } from '@fitzyracing/fetch-event-source';

await fetchEventSource('/api/sse', {
    onmessage(ev) {
        console.log(ev.data);
    }
});
```

You can pass in all the [other parameters](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters) exposed by the default fetch API, for example:
```ts
const ctrl = new AbortController();
fetchEventSource('/api/sse', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        foo: 'bar'
    }),
    signal: ctrl.signal,
});
```

You can add better error handling, for example:
```ts
class RetriableError extends Error { }
class FatalError extends Error { }

fetchEventSource('/api/sse', {
    async onopen(response) {
        if (response.ok && response.headers.get('content-type') === EventStreamContentType) {
            return; // everything's good
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            // client-side errors are usually non-retriable:
            throw new FatalError();
        } else {
            throw new RetriableError();
        }
    },
    onmessage(msg) {
        // if the server emits an error message, throw an exception
        // so it gets handled by the onerror callback below:
        if (msg.event === 'FatalError') {
            throw new FatalError(msg.data);
        }
    },
    onclose() {
        // if the server closes the connection unexpectedly, retry:
        throw new RetriableError();
    },
    onerror(err) {
        if (err instanceof FatalError) {
            throw err; // rethrow to stop the operation
        } else {
            // do nothing to automatically retry. You can also
            // return a specific retry interval here.
        }
    }
});
```

### Compatibility
This fork also runs in Node.js 18+ (tested on Node 20) and Bun (tested on 1.4), where it uses the built-in `fetch`.

This library is written in typescript and targets ES2017 features supported by all evergreen browsers (Chrome, Firefox, Safari, Edge.) You might need to [polyfill TextDecoder](https://www.npmjs.com/package/fast-text-encoding) for old Edge (versions < 79), though:
```js
require('fast-text-encoding');
```

## Contributing

Bug reports and pull requests for this fork are welcome at
[fitzyracing1/fetch-event-source](https://github.com/fitzyracing1/fetch-event-source/issues).
If a fix belongs upstream, please also send it to
[Azure/fetch-event-source](https://github.com/Azure/fetch-event-source); if upstream ships a
release with these fixes, this fork will point people back there.

## Security contact

To report a security vulnerability in this fork, please use
[GitHub private vulnerability reporting](https://github.com/fitzyracing1/fetch-event-source/security/advisories/new)
rather than a public issue. Vulnerabilities in the original package go to Microsoft, see
[upstream SECURITY.md](https://github.com/Azure/fetch-event-source/blob/main/SECURITY.md).

## License

[MIT](./LICENSE) - Copyright (c) Microsoft Corporation. The original license and copyright
notice are retained unchanged; fork changes are released under the same license.

Original project: https://github.com/Azure/fetch-event-source

## Documentation

- In-repo docs: [docs/](docs/index.md)
- Wiki: [https://github.com/fitzyracing1/fetch-event-source/wiki](https://github.com/fitzyracing1/fetch-event-source/wiki)

## Plans

This project is free, and its license stays as is. Support it through [GitHub Sponsors](https://github.com/sponsors/fitzyracing1):

- **Free**: use the code, community support.
- **Pro ($49/month)**: priority issues and support.
- **Team ($199/month)**: priority support for your team plus early access.
