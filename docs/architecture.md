# Architecture

| Path | Role |
|---|---|
| `src/fetch.ts` | fetchEventSource: request, retry, visibility handling |
| `src/parse.ts` | SSE stream parser |
| `src/index.ts` | exports |
| `src/parse.spec.ts` | jasmine specs |
| `tsconfig.json, tsconfig.esm.json` | CJS and ESM builds to lib/ |


