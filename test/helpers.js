'use strict';
// Shared helpers for the node:test suites. FES_LIB lets the same tests run
// against another build (for example the original 2.0.1 from npm):
//   FES_LIB=/path/to/package/lib/cjs node --test test/
const http = require('http');
const path = require('path');

const libDir = process.env.FES_LIB
    ? path.resolve(process.env.FES_LIB)
    : path.join(__dirname, '..', 'lib', 'cjs');

function load() {
    return require(libDir);
}

/**
 * Starts a local SSE server. `handler(req, res, n)` gets the 1-based request
 * number; every request is recorded in `server.requests`.
 */
function startServer(handler) {
    return new Promise((resolve) => {
        const requests = [];
        const server = http.createServer((req, res) => {
            requests.push({ method: req.method, url: req.url, headers: req.headers });
            handler(req, res, requests.length);
        });
        server.requests = requests;
        server.listen(0, '127.0.0.1', () => {
            server.url = `http://127.0.0.1:${server.address().port}/sse`;
            resolve(server);
        });
    });
}

function stopServer(server) {
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(() => resolve()));
}

function sseHead(res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
}

/** Rejects if `promise` has not settled after `ms` (so a hang fails the test instead of the run). */
function within(promise, ms, what) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${what}`)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

module.exports = { libDir, load, startServer, stopServer, sseHead, within };
