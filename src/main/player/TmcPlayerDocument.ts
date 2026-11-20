import http, { type Server } from 'node:http';
import { randomBytes } from 'node:crypto';

// Only this external frame origin is substituted by the isolated synthetic build.
export const TWITCH_PLAYER_FRAME_ORIGIN = 'https://player.twitch.tv';

/** One ephemeral loopback document, with no credentials, scripts or privileged API. */
export class TmcPlayerDocument {
  private readonly pathname = `/player/${randomBytes(24).toString('hex')}`;
  private server: Server | null = null;
  private starting: Promise<void> | null = null;
  private closed = false;
  private origin: string | null = null;
  private channel: string | null = null;

  get source(): { origin: string; pathname: string } | null {
    return this.origin && !this.closed ? { origin: this.origin, pathname: this.pathname } : null;
  }

  async url(channel: string): Promise<string> {
    if (!/^[a-z0-9_-]{1,64}$/.test(channel) || this.closed) throw new Error('Invalid player document.');
    this.channel = channel;
    if (!this.starting) this.starting = this.listen();
    await this.starting;
    if (this.closed || !this.origin) throw new Error('Player document closed.');
    return `${this.origin}${this.pathname}?channel=${encodeURIComponent(channel)}`;
  }

  private async listen(): Promise<void> {
    const server = http.createServer((request, response) => {
      let url: URL;
      try { url = new URL(request.url || '/', this.origin || 'http://localhost'); }
      catch { response.writeHead(400).end(); return; }
      if (this.closed || request.method !== 'GET' || request.headers.host !== this.origin?.slice('http://'.length) ||
          url.origin !== this.origin || url.pathname !== this.pathname || url.searchParams.get('channel') !== this.channel ||
          [...url.searchParams.keys()].length !== 1) { response.writeHead(404).end(); return; }
      const frame = new URL(TWITCH_PLAYER_FRAME_ORIGIN);
      frame.search = new URLSearchParams({ channel: this.channel, parent: 'localhost', autoplay: 'true', muted: 'true' }).toString();
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': `default-src 'none'; frame-src ${TWITCH_PLAYER_FRAME_ORIGIN}; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` });
      response.end(`<!doctype html><html><head><title>TMC live player</title><link rel="icon" href="data:,"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden;background:#080914}</style></head><body><iframe title="Twitch live player" src="${frame.href.replace(/&/g, '&amp;')}" allow="autoplay; fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" allowfullscreen></iframe></body></html>`);
    });
    this.server = server;
    server.maxConnections = 8;
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 1000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Player source unavailable.');
    this.origin = `http://localhost:${address.port}`;
    server.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.origin = null;
    await this.starting?.catch(() => undefined);
    const server = this.server;
    if (!server) return;
    this.server = null;
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    this.origin = null;
  }
}
