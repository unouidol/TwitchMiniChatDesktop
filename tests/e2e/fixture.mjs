import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer } from 'ws';

export async function startFixture() {
  const requests = [];
  const failures = [];
  const chats = [];
  const histories = [];
  const sentMessages = [];
  const emoteCalls = [];
  const catalogBlockedRequests = [];
  const colorCalls = [];
  const playerCalls = [];
  let colorMessages = false;
  let mentionMessages = false;
  let badgeMessages = false;
  let playerGate;
  let releasePlayer;
  let historyGate;
  let releaseHistory;
  let pendingHistories = 0;
  let colorGate;
  let releaseColors;
  const colorUsers = [
    { id: '6101', login: 'fixture_color_red', color: '#FF0000' },
    { id: '6102', login: 'fixture_color_yellow', color: '#FFFF00' },
    { id: '6103', login: 'fixture_color_unset', color: '' },
    { id: '6104', login: 'fixture_color_late', color: '#FFFF00' },
  ];
  let phase = 'first';
  let emoteMessages = false;
  let catalogGate;
  let releaseCatalog;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let body = '';
      for await (const chunk of request) body += chunk;
      if (url.pathname === '/desktop-release') {
        assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, undefined); assert.equal(request.headers.cookie, undefined);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ tag_name: 'v99.0.0', draft: false, prerelease: false,
          assets: [{ name: 'TMC-desktop-Setup.exe', state: 'uploaded', size: 140000000,
            browser_download_url: 'https://github.com/unouidol/TwitchMiniChatDesktop/releases/download/v99.0.0/TMC-desktop-Setup.exe' }] }));
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/twitch/')) {
        if (catalogGate) { catalogBlockedRequests.push(url.pathname); await catalogGate; }
        const token = request.headers.authorization;
        assert.ok(['OAuth synthetic-access-A', 'OAuth synthetic-access-B', 'Bearer synthetic-access-A', 'Bearer synthetic-access-B'].includes(token));
        const profileId = token.endsWith('-A') ? 'A' : 'B';
        emoteCalls.push({ path: url.pathname, profileId });
        response.setHeader('Content-Type', 'application/json');
        if (url.pathname === '/twitch/oauth2/validate') {
          response.end(JSON.stringify({ client_id: 'synthetic-client', user_id: `fixture-user-${profileId}`,
            scopes: profileId === 'B' ? ['user:read:emotes'] : [] }));
          return;
        }
        assert.equal(request.headers['client-id'], 'synthetic-client');
        const colorLogins = url.searchParams.getAll('login');
        if (url.pathname === '/twitch/helix/users' && colorLogins.length && colorLogins.every((login) => login === 'other' || login.startsWith('fixture_color_'))) {
          if (colorLogins.some((login) => login.startsWith('fixture_color_'))) colorCalls.push({ path: 'users', logins: colorLogins, profileId });
          response.end(JSON.stringify({ data: colorUsers.filter((user) => colorLogins.includes(user.login)).map(({ id, login }) => ({ id, login })) }));
          return;
        }
        if (url.pathname === '/twitch/helix/chat/color') {
          const ids = url.searchParams.getAll('user_id');
          assert.ok(ids.length && ids.every((id) => colorUsers.some((user) => user.id === id)));
          colorCalls.push({ path: 'color', ids, profileId });
          if (colorGate) await colorGate;
          response.end(JSON.stringify({ data: colorUsers.filter((user) => ids.includes(user.id)).map((user) => ({ user_id: user.id, user_login: user.login, color: user.color })) }));
          return;
        }
        let data;
        if (url.pathname === '/twitch/helix/chat/badges/global' || url.pathname === '/twitch/helix/chat/badges') {
          // Twitch campaign set IDs can exceed 64 characters; an unused valid set must not reject the entire catalog.
          const sets = url.pathname.endsWith('/global') ? ['moderator', 'vip', 'broadcaster', 'subscriber', `campaign-${'a'.repeat(80)}`] : ['subscriber', 'founder'];
          const offset = url.pathname.endsWith('/global') ? 1 : 5;
          data = sets.map((set_id, index) => ({ set_id, versions: [{ id: '1', title: `${offset === 5 ? 'Channel ' : ''}${set_id}`,
            image_url_2x: `https://static-cdn.jtvnw.net/badges/v1/00000000-0000-0000-0000-00000000000${offset + index}/2` }] }));
        }
        else if (url.pathname === '/twitch/helix/chat/emotes/global') data = [{ id: '25', name: 'Kappa' }];
        else if (url.pathname === '/twitch/helix/users') data = [{ id: 'fixture-broadcaster', login: url.searchParams.get('login') }];
        else if (url.pathname === '/twitch/helix/chat/emotes') data = [{ id: '1902', name: 'Keepo' }, { id: '999', name: 'Locked' }];
        else {
          assert.equal(url.pathname, '/twitch/helix/chat/emotes/user');
          assert.equal(profileId, 'B');
          assert.equal(url.searchParams.get('user_id'), 'fixture-user-B');
          assert.equal(url.searchParams.get('broadcaster_id'), 'fixture-broadcaster');
          const after = url.searchParams.get('after');
          response.end(JSON.stringify({ data: after ? [{ id: '88', name: 'BWave' }] : [{ id: '1902', name: 'Keepo' }],
            pagination: after ? {} : { cursor: 'next' } }));
          return;
        }
        response.end(JSON.stringify({ data }));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/finalize') {
        const payload = JSON.parse(body);
        assert.ok(['synthetic-claim-B', 'synthetic-expired', 'synthetic-stalled'].includes(payload.login_token));
        const accepted = payload.login_token === 'synthetic-claim-B';
        requests.push({ phase, path: '/finalize', accepted });
        response.setHeader('Content-Type', 'application/json');
        if (payload.login_token === 'synthetic-stalled') {
          response.writeHead(200);
          response.write('{');
          return; // Deliberately unfinished body, interrupted by the production deadline.
        }
        if (!accepted) {
          response.writeHead(401).end(JSON.stringify({ error: 'Synthetic expired claim' }));
          return;
        }
        // Keep the submitting state observable without substituting UI behavior.
        await new Promise((resolve) => setTimeout(resolve, 500));
        response.end(JSON.stringify({
          profile_id: 'B', username: 'fixture-b', user_id: 'fixture-user-B',
          access_token: 'synthetic-access-B', desktop_session_token: 'synthetic-desktop-B',
        }));
        return;
      }
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
        const channel = url.searchParams.get('channel');
        assert.ok(['fixture-channel', 'fixture-other'].includes(channel));
        histories.push({ phase, channel });
        if (historyGate) { pendingHistories++; await historyGate; pendingHistories--; }
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(badgeMessages ? [
          { id: 'badge-history', user: 'fixture_badge_user', color: '#34D399', text: 'Supplied Twitch badges', ts: Date.now(), badges: 'broadcaster/1,moderator/1,vip/1,subscriber/1,founder/1,mystery/1', badge_info: 'subscriber/14' },
          { id: 'badge-missing', user: 'fixture_badge_user', color: '#34D399', text: 'No badge metadata', ts: Date.now() },
        ] : mentionMessages ? channel === 'fixture-channel' ? [
          { id: 'mention-history-a', user: 'fixture_mention_bot', color: '#FB923C', text: 'Hello @fixture-a!', ts: Date.now() },
          { id: 'mention-history-b', user: 'fixture_mention_bot', color: '#FB923C', text: 'Hello @FIXTURE-B!', ts: Date.now() },
          { id: 'mention-history-both', user: 'fixture_mention_bot', color: '#FB923C', text: 'fixture-a and fixture-b together', ts: Date.now() },
          { id: 'mention-history-self-a', user: 'fixture-a', color: '#FF7F50', text: '@fixture-a from myself', ts: Date.now() },
          { id: 'mention-history-self-b', user: 'fixture-b', color: '#DA70D6', text: '@fixture-b from myself', ts: Date.now() },
          { id: 'mention-history-boundaries', user: 'fixture_mention_bot', color: '#FB923C', text: 'fixture-b_suffix fixture-aSuffix person@fixture-b.test https://example.test/fixture-b', ts: Date.now() },
          ...Array.from({ length: 30 }, (_, index) => ({ id: `mention-filler-${index}`, user: 'fixture_mention_bot', color: '#FB923C', text: `Ordinary loaded chat line ${index}`, ts: Date.now() })),
        ] : [] : colorMessages ? [
          { id: 'color-history-red', user: 'fixture_color_red', text: 'Color missing from history', ts: Date.now() },
          { id: 'color-history-yellow', user: 'fixture_color_yellow', text: 'Another missing color', ts: Date.now() },
          { id: 'color-history-unset', user: 'fixture_color_unset', text: 'No Twitch color set', ts: Date.now() },
          { id: 'color-history-provided', user: 'fixture_color_tagged', color: '#00FF00', text: 'Supplied color stays intact', ts: Date.now() },
        ] : emoteMessages ? [
          { id: 'e403cdaf-b781-4740-8473-9a00291fef0b', channel, user: 'fixture-viewer', text: '  😀 Kappa  hello https://example.test/history?x=1&y=2).',
            ts: Date.now(), emotes: '25:4-8', color: '#00ff7f' },
          { id: 'fixture-emote-missing', channel, user: 'fixture-viewer', text: 'MissingEmote',
            ts: Date.now(), emotes_raw: '404:0-11', color: '#123456;background:url(https://invalid)' },
          { id: 'fixture-emote-invalid', channel, user: 'fixture-other-viewer', text: '<img src=x onerror=alert(1)> Kappa',
            ts: Date.now(), emotes_raw: '25:999-1000' },
          { id: 'fixture-completion-history', channel, user: 'autocomplete_history', text: 'A user from history', color: '#FB923C', ts: Date.now() },
        ] : []));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/player-frame') {
        assert.ok(['fixture-channel', 'fixture-other'].includes(url.searchParams.get('channel')));
        assert.equal(url.searchParams.get('parent'), 'localhost');
        assert.equal(url.searchParams.get('muted'), 'true');
        assert.equal(url.searchParams.get('autoplay'), 'true');
        assert.equal(request.headers.authorization, undefined);
        playerCalls.push({ channel: url.searchParams.get('channel') });
        if (playerGate) await playerGate;
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Local inert video fixture</title><style>body{background:#161328;color:white;font:24px sans-serif}</style><h1>Isolated video fixture</h1><p>No remote streaming service.</p>');
        return;
      }
      if (request.method === 'GET' && ['/pcg/fixture-channel', '/pcg/fixture-other'].includes(url.pathname)) {
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
        if (line === '@reply-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f PRIVMSG #fixture-channel :synthetic-reply') {
          sentMessages.push({ channel: 'fixture-channel', username: chat.username, parentMessageId: '885196de-cb67-427a-baa8-82f9b0fcd05f' });
          return;
        }
        if (line.startsWith('NICK ')) chat.username = line.slice(5);
        if (line.startsWith('JOIN ')) connection.send(`@color=${chat.username === 'fixture-a' ? '#FF7F50' : '#DA70D6'} :fixture.tmi.twitch.tv USERSTATE ${line.slice(5)}\r\n`);
        if (line === 'PRIVMSG #fixture-channel :synthetic-layout-message' || line === 'PRIVMSG #fixture-channel :Kappa' || line === 'PRIVMSG #fixture-channel :Keepo') {
          sentMessages.push({ channel: 'fixture-channel', username: chat.username });
          return;
        }
        if (!/^(CAP REQ|PASS oauth:synthetic-access-[AB]$|NICK fixture-[ab]$|JOIN #fixture-(channel|other)$|PONG)/.test(line)) {
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
    requests, failures, chats, histories, sentMessages, emoteCalls, colorCalls, playerCalls, catalogBlockedRequests,
    setColorMessages: (enabled) => { colorMessages = enabled; },
    setMentionMessages: (enabled) => { mentionMessages = enabled; },
    sendMentionMessages: (mode = 'mentions') => {
      assert.ok(['mentions', 'plain'].includes(mode));
      for (const connection of sockets.clients) {
        if (connection.readyState !== 1) continue;
        if (mode === 'plain') {
          connection.send('@id=mention-live-plain;color=#FB923C :fixture_mention_bot!fixture_mention_bot@irc PRIVMSG #fixture-channel :Another ordinary message\r\n');
          continue;
        }
        for (const profileId of ['A', 'B']) {
          const login = `fixture-${profileId.toLowerCase()}`;
          connection.send(`@id=mention-live-${profileId};color=#FB923C :fixture_mention_bot!fixture_mention_bot@irc PRIVMSG #fixture-channel :New message for @${login}\r\n`);
          connection.send(`@id=mention-reply-${profileId};color=#FB923C;reply-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f;reply-parent-display-name=${login};reply-parent-user-login=${login};reply-parent-user-id=fixture-user-${profileId} :fixture_mention_bot!fixture_mention_bot@irc PRIVMSG #fixture-channel :A reply without a textual mention\r\n`);
          connection.send(`@id=mention-self-${profileId};color=#FB923C :${login}!${login}@irc PRIVMSG #fixture-channel :@${login} from myself\r\n`);
        }
        connection.send('@id=mention-wrong-identity;color=#FB923C;reply-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f;reply-parent-display-name=fixture-b;reply-parent-user-login=fixture-b;reply-parent-user-id=wrong-user :fixture_mention_bot!fixture_mention_bot@irc PRIVMSG #fixture-channel :Conflicting parent identity\r\n');
      }
    },
    holdColors: () => { colorGate = new Promise((resolve) => { releaseColors = resolve; }); },
    releaseColors: () => { releaseColors?.(); colorGate = undefined; releaseColors = undefined; },
    sendColorMessage: (id, username, color) => {
      assert.ok(['fixture_color_red', 'fixture_color_late'].includes(username));
      assert.ok(['color-live-red', 'color-live-late', 'color-live-tagged'].includes(id));
      for (const connection of sockets.clients) {
        if (connection.readyState === 1) connection.send(`@id=${id}${color ? `;color=${color}` : ''} :${username}!${username}@irc PRIVMSG #fixture-channel :Color metadata fixture\r\n`);
      }
    },
    setPhase: (value) => { phase = value; },
    setEmoteMessages: (enabled) => { emoteMessages = enabled; },
    setBadgeMessages: (enabled) => { badgeMessages = enabled; },
    holdPlayer: () => { playerGate = new Promise((resolve) => { releasePlayer = resolve; }); },
    releasePlayer: () => { releasePlayer?.(); playerGate = undefined; releasePlayer = undefined; },
    get pendingHistories() { return pendingHistories; },
    holdHistory: () => { historyGate = new Promise((resolve) => { releaseHistory = resolve; }); },
    releaseHistory: () => { releaseHistory?.(); historyGate = undefined; releaseHistory = undefined; },
    sendBadgeMessage: () => {
      for (const connection of sockets.clients) if (connection.readyState === 1) connection.send('@id=badge-live;color=#34D399;badges=moderator/1,vip/1 :fixture_badge_user!fixture_badge_user@irc PRIVMSG #fixture-channel :Live badge metadata\r\n');
    },
    sendFloodMessages: (prefix, count) => {
      assert.match(prefix, /^flood-[a-z]+$/);
      for (const connection of sockets.clients) {
        if (connection.readyState !== 1) continue;
        for (let index = 0; index < count; index += 1) {
          connection.send(`@id=${prefix}-${index};color=#60A5FA :fixture_flood_user!fixture_flood_user@irc PRIVMSG #fixture-channel :${prefix} message ${index}\r\n`);
        }
      }
    },
    sendSearchMessage: () => {
      for (const connection of sockets.clients) if (connection.readyState === 1) connection.send('@id=search-temporary;color=#34D399 :fixture_search_user!fixture_search_user@irc PRIVMSG #fixture-channel :Live during history refresh\r\n');
    },
    sendCompletionUsers: () => {
      for (const connection of sockets.clients) {
        if (connection.readyState !== 1) continue;
        for (const name of ['autocomplete_one', 'autocomplete_two']) connection.send(`@id=completion-${name};display-name=${name};color=#FF7F50 :${name}!${name}@irc PRIVMSG #fixture-channel :A user from live chat\r\n`);
      }
    },
    sendLinkMessages: () => {
      for (const connection of sockets.clients) {
        if (connection.readyState !== 1) continue;
        connection.send('@id=fixture-links;display-name=FixtureViewer;emotes=25:0-4 :fixture-viewer!fixture-viewer@irc PRIVMSG #fixture-channel :Kappa http://example.test/live https://example.test/middle https://example.test/keyboard https://example.test/fail javascript:alert(1) file:///C:/Windows <script>literal text</script>\r\n');
      }
    },
    sendReplyMessages: () => {
      for (const connection of sockets.clients) {
        if (connection.readyState !== 1) continue;
        connection.send(`@id=885196de-cb67-427a-baa8-82f9b0fcd05f;display-name=FixtureViewer :fixture-viewer!fixture-viewer@irc PRIVMSG #fixture-channel :original message\r\n`);
        connection.send(`@id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;display-name=Other;reply-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f;reply-parent-display-name=FixtureViewer;reply-parent-msg-body=hello\\s<img> :other!other@irc PRIVMSG #fixture-channel :received answer\r\n`);
      }
    },
    holdEmoteCatalog: () => { catalogGate = new Promise((resolve) => { releaseCatalog = resolve; }); },
    releaseEmoteCatalog: () => { releaseCatalog?.(); catalogGate = undefined; releaseCatalog = undefined; },
    sendEmoteMessages: () => {
      for (const connection of sockets.clients) {
        if (connection.readyState !== 1) continue;
        connection.send(`@id=fixture-emote-live;display-name=FixtureViewer;color=#1E90FF;tmi-sent-ts=${Date.now()};emotes=25:2-6 :fixture-viewer!fixture-viewer@fixture.tmi.twitch.tv PRIVMSG #fixture-channel :😀 Kappa!\r\n`);
        connection.send(`@id=fixture-emote-action;display-name=FixtureViewer;color=invalid;tmi-sent-ts=${Date.now()};emotes=25:0-4 :fixture-viewer!fixture-viewer@fixture.tmi.twitch.tv PRIVMSG #fixture-channel :\u0001ACTION Kappa waves\u0001\r\n`);
      }
    },
    close: async () => {
      releaseColors?.();
      releaseCatalog?.();
      releaseHistory?.();
      releasePlayer?.();
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
