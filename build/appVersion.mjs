import fs from 'node:fs';

/** Stamp only public display metadata; keep package identity/profile paths unchanged. */
export function appVersionPlugin(kind = 'dev') {
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '.').slice(0, 15) + 'Z';
  const label = `v${manifest.version} · ${kind} ${stamp}`;
  return {
    name: 'tmc-app-version',
    transformIndexHtml(html) {
      return html.replace('<title>TMC desktop</title>', `<title>TMC desktop ${label}</title>`)
        .replace('<span data-tmc-app-version></span>', `<span data-tmc-app-version>${label}</span>`);
    },
  };
}
