'use strict';
// Node.js (no DOM): there is no `document` and no `window`.
// On @microsoft/fetch-event-source 2.0.1 these fail with
// "ReferenceError: document is not defined" / "window is not defined"
// (https://github.com/Azure/fetch-event-source/issues/39).
const test = require('node:test');
const assert = require('node:assert');
const { load, startServer, stopServer, sseHead, within } = require('./helpers');

const { fetchEventSource, EventStreamContentType } = load();

// Unhandled rejections from inside the library must fail the run, not vanish.
const unhandled = [];
process.on('unhandledRejection', (err) => unhandled.push(err));

test.beforeEach(() => {
    assert.strictEqual(typeof document, 'undefined');
    assert.strictEqual(typeof window, 'undefined');
});
test.afterEach(() => {
    assert.deepStrictEqual(unhandled.map(String), [], 'no unhandled rejections');
});

function twoMessages(req, res) {
    sseHead(res);
    res.write('id: 1\ndata: hello\n\n');
    res.write('event: custom\ndata: world\n\n');
    res.end();
}

test('exports are unchanged', () => {
    assert.strictEqual(typeof fetchEventSource, 'function');
    assert.strictEqual(EventStreamContentType, 'text/event-stream');
});

test('default options: streams messages from a local server and resolves', async () => {
    const server = await startServer(twoMessages);
    try {
        const messages = [];
        let closed = 0;
        await within(fetchEventSource(server.url, {
            onmessage: (ev) => messages.push(ev),
            onclose: () => { closed++; },
            onerror: (err) => { throw err; },
        }), 5000, 'fetchEventSource');
        assert.deepStrictEqual(messages.map((m) => [m.id, m.event, m.data]), [
            ['1', '', 'hello'],
            ['', 'custom', 'world'], // id is per message (2.0.0+)
        ]);
        assert.strictEqual(closed, 1);
        assert.strictEqual(server.requests.length, 1);
        assert.strictEqual(server.requests[0].headers.accept, 'text/event-stream');
    } finally {
        await stopServer(server);
    }
});

test('openWhenHidden: true streams messages and resolves', async () => {
    const server = await startServer(twoMessages);
    try {
        const data = [];
        await within(fetchEventSource(server.url, {
            openWhenHidden: true,
            onmessage: (ev) => data.push(ev.data),
            onerror: (err) => { throw err; },
        }), 5000, 'fetchEventSource');
        assert.deepStrictEqual(data, ['hello', 'world']);
        assert.strictEqual(server.requests.length, 1);
    } finally {
        await stopServer(server);
    }
});

test('openWhenHidden: true with a custom fetch: POST body/headers are passed through', async () => {
    let body = '';
    const server = await startServer((req, res) => {
        req.on('data', (c) => { body += c; });
        req.on('end', () => twoMessages(req, res));
    });
    try {
        let fetchCalls = 0;
        const data = [];
        await within(fetchEventSource(server.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-test': 'yes' },
            body: JSON.stringify({ prompt: 'hi' }),
            openWhenHidden: true,
            fetch: (...args) => { fetchCalls++; return fetch(...args); },
            onmessage: (ev) => data.push(ev.data),
            onerror: (err) => { throw err; },
        }), 5000, 'fetchEventSource');
        assert.strictEqual(fetchCalls, 1);
        assert.deepStrictEqual(data, ['hello', 'world']);
        assert.strictEqual(server.requests[0].method, 'POST');
        assert.strictEqual(server.requests[0].headers['x-test'], 'yes');
        assert.strictEqual(body, '{"prompt":"hi"}');
    } finally {
        await stopServer(server);
    }
});

test('retry: retries after an error with the onerror interval and sends last-event-id', async () => {
    const server = await startServer((req, res, n) => {
        if (n === 1) {
            sseHead(res);
            // cut the connection mid-stream (incomplete chunked body):
            res.write('id: 41\ndata: first\n\n', () => setTimeout(() => res.socket.end(), 50));
        } else if (n === 2) {
            res.writeHead(500, { 'content-type': 'text/plain' });
            res.end('boom');
        } else {
            sseHead(res);
            res.end('id: 42\ndata: second\n\n');
        }
    });
    try {
        const data = [];
        const errors = [];
        const started = Date.now();
        await within(fetchEventSource(server.url, {
            onmessage: (ev) => data.push(ev.data),
            onerror: (err) => { errors.push(err); return 50; },
        }), 5000, 'fetchEventSource');
        assert.deepStrictEqual(data, ['first', 'second']);
        assert.strictEqual(errors.length, 2);
        assert.match(String(errors[1]), /Expected content-type to be text\/event-stream/);
        assert.strictEqual(server.requests.length, 3);
        assert.strictEqual(server.requests[0].headers['last-event-id'], undefined);
        assert.strictEqual(server.requests[1].headers['last-event-id'], '41');
        assert.strictEqual(server.requests[2].headers['last-event-id'], '41');
        assert.ok(Date.now() - started >= 100, 'waited for the retry interval twice');
    } finally {
        await stopServer(server);
    }
});

test('retry: the server "retry:" field sets the default interval', async () => {
    const server = await startServer((req, res, n) => {
        sseHead(res);
        if (n === 1) {
            res.write('retry: 30\ndata: a\n\n', () => setTimeout(() => res.socket.end(), 50));
        } else {
            res.end('data: b\n\n');
        }
    });
    try {
        const data = [];
        const started = Date.now();
        await within(fetchEventSource(server.url, {
            onmessage: (ev) => data.push(ev.data),
        }), 5000, 'fetchEventSource');
        assert.deepStrictEqual(data, ['a', 'b']);
        assert.ok(Date.now() - started < 900, 'used retry: 30, not the 1000ms default');
        assert.strictEqual(server.requests.length, 2);
    } finally {
        await stopServer(server);
    }
});

test('a fatal error thrown from onerror rejects the promise and stops retrying', async () => {
    const server = await startServer((req, res) => {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end('{}');
    });
    try {
        const fatal = new Error('fatal');
        await assert.rejects(within(fetchEventSource(server.url, {
            onerror: () => { throw fatal; },
        }), 5000, 'fetchEventSource'), (err) => err === fatal);
        await new Promise((r) => setTimeout(r, 100));
        assert.strictEqual(server.requests.length, 1);
    } finally {
        await stopServer(server);
    }
});

test('abort: aborting the signal resolves, closes the connection and cancels a pending retry', async () => {
    let markClosed;
    const closed = new Promise((resolve) => { markClosed = resolve; });
    const server = await startServer((req, res, n) => {
        if (n === 1) {
            sseHead(res);
            res.write('data: one\n\n'); // keep the stream open
            res.on('close', () => markClosed());
        } else {
            res.end();
        }
    });
    try {
        const ctrl = new AbortController();
        const data = [];
        let errors = 0;
        const done = fetchEventSource(server.url, {
            signal: ctrl.signal,
            onmessage: (ev) => {
                data.push(ev.data);
                ctrl.abort();
            },
            onerror: () => { errors++; },
        });
        await within(done, 5000, 'fetchEventSource after abort');
        await within(closed, 5000, 'server connection close');
        assert.deepStrictEqual(data, ['one']);
        assert.strictEqual(errors, 0);
        await new Promise((r) => setTimeout(r, 1200)); // longer than the default retry interval
        assert.strictEqual(server.requests.length, 1, 'no retry after abort');
    } finally {
        await stopServer(server);
    }
});

test('abort during the retry wait cancels the retry timer', async () => {
    const server = await startServer((req, res) => {
        res.writeHead(503);
        res.end();
    });
    try {
        const ctrl = new AbortController();
        const done = fetchEventSource(server.url, {
            signal: ctrl.signal,
            onerror: () => {
                setTimeout(() => ctrl.abort(), 20);
                return 300;
            },
        });
        await within(done, 5000, 'fetchEventSource after abort');
        await new Promise((r) => setTimeout(r, 500));
        assert.strictEqual(server.requests.length, 1, 'pending retry was cancelled');
    } finally {
        await stopServer(server);
    }
});
