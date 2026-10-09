'use strict';
// Browser main thread: a minimal fake `window`/`document` (EventTarget with a
// `hidden` flag) on globalThis. These tests pin down the Page Visibility
// behaviour, so they pass on both the original 2.0.1 and this fork.
const test = require('node:test');
const assert = require('node:assert');
const { load, startServer, stopServer, sseHead, within } = require('./helpers');

class FakeDocument extends EventTarget {
    constructor() {
        super();
        this.hidden = false;
        this.listeners = new Map();
    }
    addEventListener(type, fn, opts) {
        this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
        super.addEventListener(type, fn, opts);
    }
    removeEventListener(type, fn, opts) {
        this.listeners.set(type, (this.listeners.get(type) ?? 0) - 1);
        super.removeEventListener(type, fn, opts);
    }
    setHidden(hidden) {
        this.hidden = hidden;
        this.dispatchEvent(new Event('visibilitychange'));
    }
}

const timerCalls = { setTimeout: 0, clearTimeout: 0 };
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let doc;
test.beforeEach(() => {
    doc = new FakeDocument();
    globalThis.document = doc;
    // In a browser window === globalThis; count timer calls made by the library.
    globalThis.window = {
        get fetch() { return globalThis.fetch; },
        setTimeout: (...a) => { timerCalls.setTimeout++; return realSetTimeout(...a); },
        clearTimeout: (...a) => { timerCalls.clearTimeout++; return realClearTimeout(...a); },
    };
});
test.afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
});

const { fetchEventSource } = load();

test('registers a visibilitychange listener by default and removes it when done', async () => {
    const server = await startServer((req, res) => {
        sseHead(res);
        res.end('data: x\n\n');
    });
    try {
        const p = fetchEventSource(server.url, { onmessage() {} });
        assert.strictEqual(doc.listeners.get('visibilitychange'), 1, 'listener registered synchronously');
        await within(p, 5000, 'fetchEventSource');
        assert.strictEqual(doc.listeners.get('visibilitychange'), 0, 'listener removed on close');
    } finally {
        await stopServer(server);
    }
});

test('openWhenHidden: true does not register a visibilitychange listener', async () => {
    const server = await startServer((req, res) => {
        sseHead(res);
        res.end('data: x\n\n');
    });
    try {
        const p = fetchEventSource(server.url, { openWhenHidden: true, onmessage() {} });
        assert.strictEqual(doc.listeners.get('visibilitychange') ?? 0, 0);
        await within(p, 5000, 'fetchEventSource');
    } finally {
        await stopServer(server);
    }
});

test('hiding the page closes the request; showing it reconnects with last-event-id', async () => {
    const opened = [];
    const closedReqs = [];
    const server = await startServer((req, res, n) => {
        sseHead(res);
        req.on('close', () => closedReqs.push(n));
        if (n === 1) {
            res.write('id: 7\ndata: before\n\n'); // stays open
            opened.push(n);
        } else {
            res.end('data: after\n\n');
        }
    });
    try {
        const data = [];
        const p = fetchEventSource(server.url, {
            onmessage: (ev) => {
                data.push(ev.data);
                if (ev.data === 'before') {
                    doc.setHidden(true);
                    realSetTimeout(() => doc.setHidden(false), 100);
                }
            },
            onerror: (err) => { throw err; },
        });
        await within(p, 5000, 'fetchEventSource');
        assert.deepStrictEqual(data, ['before', 'after']);
        assert.strictEqual(server.requests.length, 2);
        assert.strictEqual(server.requests[1].headers['last-event-id'], '7');
        assert.ok(closedReqs.includes(1), 'first request was closed while hidden');
        assert.strictEqual(doc.listeners.get('visibilitychange'), 0);
    } finally {
        await stopServer(server);
    }
});

test('abort removes the visibilitychange listener', async () => {
    const server = await startServer((req, res) => {
        sseHead(res);
        res.write('data: x\n\n');
    });
    try {
        const ctrl = new AbortController();
        const p = fetchEventSource(server.url, { signal: ctrl.signal, onmessage: () => ctrl.abort() });
        await within(p, 5000, 'fetchEventSource');
        assert.strictEqual(doc.listeners.get('visibilitychange'), 0);
    } finally {
        await stopServer(server);
    }
});

test('the default fetch is window.fetch', async () => {
    const server = await startServer((req, res) => {
        sseHead(res);
        res.end('data: x\n\n');
    });
    let calls = 0;
    const realFetch = globalThis.fetch;
    Object.defineProperty(globalThis.window, 'fetch', {
        get() { return (...a) => { calls++; return realFetch(...a); }; },
    });
    try {
        await within(fetchEventSource(server.url, { onmessage() {} }), 5000, 'fetchEventSource');
        assert.strictEqual(calls, 1);
    } finally {
        await stopServer(server);
    }
});

test('retries are scheduled with the page timers', async () => {
    const server = await startServer((req, res, n) => {
        if (n === 1) {
            res.writeHead(500);
            res.end();
        } else {
            sseHead(res);
            res.end('data: ok\n\n');
        }
    });
    try {
        const before = timerCalls.setTimeout;
        const data = [];
        await within(fetchEventSource(server.url, {
            onmessage: (ev) => data.push(ev.data),
            onerror: () => 20,
        }), 5000, 'fetchEventSource');
        assert.deepStrictEqual(data, ['ok']);
        assert.strictEqual(server.requests.length, 2);
        // like 2.0.1, the retry is scheduled with window.setTimeout when there is a window
        assert.strictEqual(timerCalls.setTimeout - before, 1);
    } finally {
        await stopServer(server);
    }
});
