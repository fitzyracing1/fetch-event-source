# Getting started

## Install

```
npm install @fitzyracing/fetch-event-source
# or keep the old import name:
npm install @microsoft/fetch-event-source@npm:@fitzyracing/fetch-event-source@^2.0.2
```



## Usage

Same API as upstream: `fetchEventSource(url, { onopen, onmessage, onclose, onerror, openWhenHidden, ... })`. See the README "Usage" section.

## Develop and test

```
npm ci
npm run build
npm test   # jasmine (nyc) + node --test test/*.test.js
```
