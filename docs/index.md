# @fitzyracing/fetch-event-source

`@fitzyracing/fetch-event-source` is a drop-in fork of [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source) and part of [360 Bench](https://github.com/fitzyracing1/360-bench). It is based on upstream `@microsoft/fetch-event-source@2.0.1`, and the API is unchanged. All credit for the original library goes to its authors and contributors.

## What the fork fixes (summary of [README.md](../README.md))

- No more `ReferenceError: document is not defined` outside the browser main thread (Node.js, Bun, workers).
- No more `ReferenceError: window is not defined`. `globalThis` is used when there is no `window`.

The full details and links to the upstream issues are in [README.md](../README.md).

Pages: [Getting started](getting-started.md) · [Architecture](architecture.md)

## CI

`.github/workflows/node.js.yml` runs `npm ci`, `npm run build` and `npm test`. A run is **lit** when it succeeds and **dark** otherwise.

## License

MIT. Not affiliated with or endorsed by Microsoft. The original notice is kept: Copyright (c) Microsoft Corporation.
Modifications: Copyright (c) 2026 Joshua Almeida.
