# Dependency remediation — November 2026

This review supersedes the dependency state, not the historical evidence, in
[the initial E2E tooling review](e2e-tooling-review.md). No release is published.

## Scope and decisions

The baseline `npm audit --json` reported **59 package records**: 3 low,
8 moderate, 47 high and 1 critical. These counts include transitive advisory
propagation; they are not 59 independent vulnerabilities. `--omit=dev` reported
zero, but does not assess the Chromium/Node runtime bundled by Electron or the
production code bundled by Vite.

The user authorized updating the previously fixed host runtime. Use Node
**24.22.3** and its bundled npm **11.19.1**, including both Windows CI jobs.
The official [Node October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
includes TLS/DNS and CA-store fixes; [WDIO 10](https://webdriver.io/docs/v10-migration)
requires at least Node 24.22.1 within the 24.x line.

| Owner | Before | Candidate | Purpose |
| --- | --- | --- | --- |
| Electron | 43.0.0 | 43.8.12 | Security backports within the existing supported major |
| Electron Forge packages | 7.11.2 | 8.0.1 | Replace vulnerable packaging/rebuild/archive chains |
| Electron fuses | 1.8.0 | 2.1.3 | Match the Forge generation; preserve all six protection settings |
| Vite | 5.4.21 | 8.3.8 | Replace unsupported build server/bundler and vulnerable dependencies |
| WebdriverIO | 9.31.9 | 10.2.0 | Replace vulnerable downloader/proxy/glob owners |
| TypeScript ESLint parser/plugin | 5.62.0 | 8.74.0 | Satisfy the current resolver's peer graph without forcing incompatible peers |
| TypeScript import resolver | absent | 4.4.5 | Resolve ESM package exports in the existing import checks |

Compatible transitive patch updates are recorded in the lockfile. There are no
security overrides, forced transitive major versions, audit suppressions, or
changes to release publication. The TypeScript compiler and ESLint remain on their existing versions;
their deprecated packages are not represented as fixed or supported by this review.
The new import resolver is necessary because Forge/Vite now expose ESM package
exports which the old Node-only resolver cannot read. It replaces resolution,
not import-check rules. Its current peer requirements need the matching
TypeScript ESLint generation; peer-conflicting installs were rejected, not forced.

Forge 8 emits main/preload CommonJS bundles with `.cjs` extensions. Package entry,
production preload and synthetic build output change together. The synthetic
build uses Vite's `rolldownOptions`; WDIO callback-style `executeAsync` calls use
awaited `execute(async ...)`, retaining their previous results and assertions.

The pinned Electron npm package supplies `install-electron` without an automatic
dependency postinstall. The project's `postinstall` explicitly invokes that vendor
installer, so a fresh `npm ci` installs the pinned runtime. Its checksum validation
is retained. Unused Edge/Firefox driver postinstall scripts are explicitly denied
at their exact versions; tests still use only the separately verified Electron
ChromeDriver. The obsolete esbuild script permission is removed. The existing
Squirrel native-tool permission is unchanged.

ChromeDriver 150.0.7871.250 matches Electron 43.8.12. Its ZIP SHA-256 is checked
against the official release SHASUMS256 and GitHub asset digest before extraction;
the extracted executable checksum is independently recorded in
`tests/e2e/driver-provenance.json`. Binaries and archives are not committed.

## Remaining findings

The candidate audit reports **4 moderate package records**, no low/high/critical:
`webdriverio → archiver@8.0.0 → readdir-glob@3.0.0 → minimatch@10.x`.
They propagate [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249),
potential denial of service through glob-parts amplification.

The patched minimatch major is admitted by readdir-glob 4, while archiver 8
declares readdir-glob `^3.0.0`. No supported owner release admitting that major
was identified. Forcing readdir-glob/minimatch outside the owner's declared range
is not an accepted fix. Recheck the upstream owner before release.

The test suite uses standalone WDIO with explicit binaries and does not call
`uploadFile`, archive globbing or directory uploads. The application ASAR must
contain only production bundles and metadata, with no WDIO/build dependencies.
This limits the established exposure to development tooling; it does not remove
the installed finding or prove the vulnerable operation safe for other callers.

## Verification

Qualification uses an ignored isolated copy and synthetic/local transports. The
protected packaged smoke test and Squirrel lifecycle fixture are separate from
real login, user-profile testing and an actual installed-app upgrade. The user's
installed v1.1.0-dev.19 and saved accounts are not changed by these checks.

Local verification with Node 24.22.3/npm 11.19.1 passed:

- `npm ci`, including the explicit pinned Electron installation.
- `npm test`: 206/206; `npm run typecheck`; `npm run lint`: zero warnings.
- Driver integrity/configuration checks 4/4, network-guard checks and cleanup 12/12.
- `npm run test:e2e`: full UI/removal/restart, evidence
  `evidence-tmc-electron-e2e-Ebm4bA`, profile removed.
- `npm run make`: Windows package and Squirrel installer generated, unsigned.
- Protected candidate `test:packaged`: login guidance, preferences, runtime
  isolation, fuses and restart (`packaged-smoke-gMKMSp`).
- Protected candidate `test:squirrel`: install/update/uninstall/obsolete events
  (`squirrel-smoke-7JA4Se`). These fixture events do not install the app on the PC.
- Independent defect-focused review and manifest/lock registry/integrity checks.

Qualification exposed Forge filenames, WDIO async API, strict badge selectors and
ESM import-resolution incompatibilities. The badge pair is checked explicitly:
WDIO's array-map result is asynchronous and cannot be passed directly to native
`Promise.all`. Causes were corrected before rerunning; failed evidence was retained.
Node's experimental module-mocking and package deprecation diagnostics are not filtered.
Hosted CI needs its own exact commit/run evidence; older green runs do not qualify
this change. Local output and profiles are excluded from Git.

The first hosted candidate, `bdb3aa7`, passed quality/driver/guard/cleanup checks in
[run 45406959162](https://github.com/unouidol/TwitchMiniChatDesktop/actions/runs/45406959162)
but failed the UI scenario: Electron parsed an incompletely written resize command
and exited with `Unexpected end of JSON input`. The artifact ZIP was verified
against its GitHub SHA-256 digest before inspection. The only bootstrap JSON parser
consumes this command; the parent created its visible name before its asynchronous
write completed. This is a test-control publication race, not an accepted CI pass.

The follow-up publishes resize/close commands and one-time startup, resize-ack and
playback reports only after closed-file writes and rename, matching existing bounds
and network snapshots. Pollers retain exact final names; temporary files cannot
satisfy them. There is no timeout increase, parse-error suppression, retry or
production change. The corrected head requires a new hosted result.
