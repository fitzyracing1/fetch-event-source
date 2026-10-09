# CHANGELOG

## 2.0.2 (@fitzyracing/fetch-event-source, 2026-10-09)
First release of the [360 Bench](https://github.com/fitzyracing1/360-bench) fork, based on 2.0.1.

### Fixed
- `fetchEventSource()` no longer rejects with `ReferenceError: document is not defined` outside the browser main thread (Node.js, Bun, web workers). The `visibilitychange` listener is only registered when `document` exists; without a document the connection stays open as with `openWhenHidden: true` ([#39](https://github.com/Azure/fetch-event-source/issues/39), [#20](https://github.com/Azure/fetch-event-source/issues/20))
- No more `ReferenceError: window is not defined` (also with `openWhenHidden: true`): the default `fetch` and the retry timers still come from `window` when it exists, and from `globalThis` otherwise ([#41](https://github.com/Azure/fetch-event-source/pull/41))
- With a custom `fetch` and `openWhenHidden: true` in Node.js, the returned promise now resolves when the stream ends instead of never settling with an unhandled `document is not defined` rejection

### Added
- `node:test` suite (`npm run test:node`) against a local SSE server, plus browser-path tests with a fake `document`/`window`

## 2.0.1
This release adds support for esmodule imports (see #4).

## 2.0.0
This release improves the performance of parsing the response stream and fixes some corner cases to better match [the spec](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation).

### Changed
- The `id`, `event`, and `data` fields are now initialized to empty strings, per the spec (they were previously `undefined`)
- The `onmessage` callback is now called for _all_ messages (it was previously triggered only for messages with a `data` field)
- If a message contains multiple `data` fields, they will be concatenated together into a single string. For example, the following message:
    ````
    data: Foo
    data:Bar
    data
    data: Baz
    ````
    will result in `{ data: 'Foo\nBar\n\nBaz' }`

- If the server sends an `id` field with an empty value, the last-event-id header will no longer be sent on the next reconnect.

### Removed
- The internal `parseStream` function has been removed. The parse implementation was previously based on async generators, which required a lot of supporting code in both the typescript-generated polyfill as well as the javascript engine. The new implementation is based on simple callbacks, which should be much faster.

## 1.0.2
### Changed
- Updated examples in readme to fix typos, added more comments.
- Changed `if` statements in parse.ts to test for specific values instead of truthy/falsy values.

## 1.0.1
### Changed
- Changed the default onOpen validator to allow charset and boundary directives in the content-type
