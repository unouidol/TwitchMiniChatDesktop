import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer } from 'ws';

export async function startFixture() {
  const requests = [];
  const failures = [];
  const chats = [];
  let phase = 'first';
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let body = '';
      for await (const chunk of request) body += chunk;
      if (request.method === 'POST' && ['/restore', '/logout'].includes(url.pathname)) {
        const payload = JSON.parse(body);
        const profileId = payload.desktop_session_token === 'synthetic-desktop-A' ? 'A' :
          payload.desktop_session_token === 'synthetic-desktop-B' ? 'B' : null;
        assert.ok(profileId, 'Only synthetic credentials are accepted');
        requests.push({ phase, path: url.pathname, profileId });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(url.pathname === '/logout' ? {} : {
          profile_id: profileId,
          username: `fixture-${profileId.toLowerCase()}`,
          user_id: `fixture-user-${profileId}`,
          access_token: `synthetic-access-${profileId}`,
          desktop_session_token: `synthetic-desktop-${profileId}`,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/history') {
        assert.ok(['Bearer synthetic-desktop-A', 'Bearer synthetic-desktop-B'].includes(request.headers.authorization));
        response.setHeader('Content-Type', 'application/json');
        response.end('[]');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/pcg/fixture-channel') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Local inert panel fixture</title><p>No remote PCG services.</p>');
        return;
      }
      throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}`);
    } catch (error) {
      failures.push(error.message);
      response.writeHead(500).end('Controlled fixture rejected request');
    }
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/irc') {
      failures.push('Unexpected WebSocket upgrade');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (connection) => {
      const chat = { username: null, closed: false };
      chats.push(chat);
      connection.on('message', (message) => {
        const line = message.toString().trim();
        if (line.startsWith('NICK ')) chat.username = line.slice(5);
        if (!/^(CAP REQ|PASS oauth:synthetic-access-[AB]$|NICK fixture-[ab]$|JOIN #fixture-channel$|PONG)/.test(line)) {
          failures.push('Unexpected IRC command');
        }
      });
      connection.on('close', () => { chat.closed = true; });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests, failures, chats,
    setPhase: (value) => { phase = value; },
    close: async () => {
      const releases = await Promise.allSettled([
        (async () => {
          for (const connection of sockets.clients) connection.terminate();
          await new Promise((resolve, reject) => sockets.close((error) => error ? reject(error) : resolve()));
        })(),
        (async () => {
          server.closeAllConnections();
          await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        })(),
      ]);
      const errors = releases.filter((release) => release.status === 'rejected').map((release) => release.reason);
      if (errors.length) throw new AggregateError(errors, 'Fixture shutdown failed');
    },
  };
}
