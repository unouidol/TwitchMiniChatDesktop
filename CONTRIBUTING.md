# Contributing

Human and AI-assisted changes follow the same review process. Read
[AGENTS.md](AGENTS.md) and [the architecture map](docs/ARCHITECTURE.md).
The maintainer remains responsible for reviewing and accepting each change.

## Local setup and checks

Use Node **24.18.0** with its bundled npm **11.16.0**, matching the CI runtime.
In a fresh Windows checkout, run:

```text
npm ci
npm test
npm run typecheck
npm run lint
git diff --check
```

Dependency installation accesses package/download services. The checks require
no Twitch account, backend credentials, repository secrets, or `local.properties`.
For clean-install experiments, use an isolated checkout/copy rather than replacing
another developer's `node_modules` or working files.

`npm test` compiles the main-process composition to ignored `.test-build/` and
runs 16 account-removal regressions with Node's built-in test runner. Tests use
temporary storage, synthetic credentials, Electron/encryption/IRC substitutes,
mocked HTTP, and a guard against real WebSocket construction. Preserve those
boundaries; never contact Twitch/backend services in behavior tests.

`npm run lint` runs ESLint on `.ts`/`.tsx`/`.mjs`, with `--max-warnings 0` and
`--report-unused-disable-directives`. Any warning fails the command; unused
suppression directives are errors. The unused settings argument was removed at
its cause. CommonJS `.cjs` test scripts are not yet covered by this lint scope.
Zero ESLint warnings does not mean the entire toolchain is warning-free.
Node's experimental module-mocking warning remains visible and unresolved;
evaluate a stable testing approach separately, without suppressing diagnostics.

`npm start` launches the application and can restore authenticated state; it is
not an automated check. Backend/OAuth setup needs suitable development
configuration. Never attach credentials to issues or test fixtures.
Use `npm run package` for packaging changes and before releases; packaging is not
part of this quality workflow and does not establish correct authentication.

## Continuous integration

[The quality workflow](.github/workflows/quality.yml) runs on pull requests,
pushes to the verified default branch `main`, and manual dispatch. Its single
`Windows quality checks` job uses `windows-2025`, Node 24.18.0, `npm ci`, and
separate test/typecheck/lint steps. A failing check fails the job; later steps
may be skipped. Runs time out after 20 minutes and superseded runs for the same
pull request or branch are cancelled.

Repository permissions are read-only, checkout credentials are not persisted,
and package-manager caching is disabled. The workflow has no application secrets,
privileged PR trigger, packaging, or publishing steps. Checkout/setup actions use
immutable pins, with readable version comments, reconfirmed against official tags:

- [checkout v6.1.0](https://github.com/actions/checkout/tree/d23441a48e516b6c34aea4fa41551a30e30af803)
- [setup-node v6.5.0](https://github.com/actions/setup-node/tree/249970729cb0ef3589644e2896645e5dc5ba9c38)

Both actions use the Node 24 action runtime and document runner version 2.327.1
or newer. This is separate from the project Node version selected by setup-node.
The selected hosted Windows image is documented by
[GitHub runner-images](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md).
Local validation does not execute that hosted environment.

The baseline workflow passed on [draft PR #1](https://github.com/unouidol/TwitchMiniChatDesktop/actions/runs/43496736663)
for head `ca9c0f22c9335a901fcae5759550f307eae50f81`. This does not verify later
uncommitted changes or the separate Electron E2E command, which is not in CI.
After a successful hosted run, the maintainer may separately configure required
checks. Defining a workflow does not configure branch protection.

## Product requirements and runtime evidence

Switching accounts must preserve saved authentication, subject to provider
session validity, and keep PCG panels loaded. Selection must not automatically
close, expire, or evict panels. These are product requirements, not a claim that
the existing PCG lifecycle already implements retention. See the architecture
map for current owners and unresolved gaps; this quality change does not alter PCG.

The real-account removal smoke test remains deferred because user-assisted OTP
access was unavailable. With user participation and development accounts A/B:
remove the currently selected account A, restart, and verify A is absent and B
still authenticates. Remove the last account B, restart, and verify signed-out
state. Separately check removal of another saved account without disconnecting
the currently selected account. No such manual result is claimed here.
The mocked unit tests do not verify OS-backed encryption, the running renderer, real login,
broader account switching, or PCG panel/resource behavior.

## Electron E2E (synthetic)

On Windows x64 with Node 24.18.0 and PowerShell 7, install dependencies with
`npm ci`, provision the driver as described below, then run `npm run test:e2e`.
Run serially; generated bundles and sanitized evidence live
under ignored `.test-build/electron-e2e/`. This command is intentionally separate
from `npm test` and the CI workflow. Maintained E2E `.mjs` and `.ts` files receive
Node-specific ESLint coverage, with no diagnostic suppressions.

The scenario seeds synthetic B/A through the production secure store, selects A
and confirms removal using the real UI, closes Electron, waits for process exit,
then starts a new process on the same temporary profile. It asserts that only B
is restored, its synthetic credential is unchanged, selection/display agree, and
only B reaches the local restore endpoint after restart. No renderer test API,
mocked IPC/deletion/filesystem, or mocked Electron/encryption is used.

The artifact is an **unpackaged Vite bundle**, not the protected Forge package.
It uses a test-only main bootstrap plus the production renderer, preload,
composition, removal service, and storage. Normal startup imports development
configuration before isolation; the separate entry avoids importing that module
entirely. Production `src/main.ts`, window preferences, Forge config, and fuses
are unchanged. This does not establish packaged-app behavior or full startup parity.

Dependencies: `webdriverio` 9.31.9 (WebDriver client/driver lifecycle, Node
>=18.20.0) and `ws` 8.23.0 (loopback IRC fixture). Electron remains 43.0.0;
ChromeDriver 150.0.7871.46 matches the actual Electron Chromium version.
No scaffolding wizard, new unit runner, or browser download is needed.

### Explicit verified ChromeDriver

Provisioning is separate from scenario execution:

```powershell
node tests/e2e/provision-driver.mjs
$env:TMC_E2E_DRIVER_PATH = '<absolute path printed by provisioning>'
node --test tests/e2e/driver.test.mjs
node --test tests/e2e/network-guards.test.mjs
node --test tests/e2e/finalize.test.mjs
npm run test:e2e
```

The setup utility downloads only the Windows x64 ChromeDriver ZIP from the
[official Electron 43.0.0 release](https://github.com/electron/electron/releases/tag/v43.0.0).
`tests/e2e/driver-provenance.json` pins its source URL and SHA-256 from the official
`SHASUMS256.txt`, independently corroborated by the GitHub release asset digest.
Only after checking the archive does PowerShell 7 `Expand-Archive` extract it.
The executable digest is derived from that authenticated archive, **not** an
arbitrary cached file; it is also pinned and checked after provisioning.
Do not substitute an unverified cached driver or change pins to match local files.
Provisioned archives/binaries and provenance copies stay under ignored
`.test-build/electron-e2e/provisioned-driver-*`; do not commit them or local paths.
Failed provisioning leaves artifacts for diagnosis and never runs the driver.

The launcher requires the explicit absolute path and verifies its regular-file
status and SHA-256 **before** executing `--version`. It checks the pinned driver
version and queries the actual development Electron executable in Node mode
(`ELECTRON_RUN_AS_NODE=1`) for Electron/Chromium versions, without starting the app
or reading its profile. Unsupported/protected binaries that cannot provide this
preflight fail; production fuses are not changed. Preflight repeats before each
application launch. Missing configuration/files, directories/symlinks, altered
bytes or incompatible versions fail before the application starts.

The public `wdio:chromedriverOptions.binary` uses this driver; the existing
`goog:chromeOptions.binary` remains the installed Electron executable. There is
no automatic acquisition/fallback. Each scenario creates an empty test-owned
WDIO cache and asserts it remains empty across both starts. `driver-traffic.json`
records observed parent HTTP/Undici request origins and actual cache contents;
passing requires observed loopback commands and no non-loopback requests.
This is local observation combined with installed WDIO source-path inspection,
not OS-wide network capture or an assertion about arbitrary child-process sockets.
Driver traffic is separate from the existing application guards and fixtures.

Focused negative checks exercise the launcher with absent/missing/non-file and
tampered disposable driver copies; version mismatch checks exercise the preflight
validator directly. Failure logs remain in ignored evidence directories. No
live external probes or corruption of the provisioned original are used.

This is an **acquisition-path mitigation**, not dependency remediation: vulnerable
packages remain installed and audit findings are not resolved. Owner-level
dependency updates remain separate; see [the tooling assessment](docs/security/e2e-tooling-review.md).
Packaged-app verification, real Twitch login and PCG retention remain unverified.

### Coherent UI and observed application traffic

Account option observations use one synchronous, read-only DOM snapshot inside
`browser.execute`, not option handles followed by asynchronous attribute reads.
The renderer can replace options between WebDriver commands after removal; that
previously produced stale-element diagnostics and automatic element refetches.
Missing/invalid selects throw rather than becoming an empty list. Existing
condition-based waits and real selection/removal/confirmation assertions remain.
No driver diagnostics are filtered and no scenario retry is introduced.

`result.json` now contains `applicationNetwork.first` and `.restart`, read from
the required per-process `first-network.json` / `restart-network.json` files.
There is no constant `forbiddenTraffic` field. Schema version 1 records:

- `installed` and `scopes` for main-process global fetch, global WebSocket, and
  the Chromium session-created request hook; `chromiumSessions` counts attachments.
- `counts` of allowed calls and denied attempts per transport, backed by `events`
  containing only transport, allowed flag, URL scheme and origin. Paths, queries,
  userinfo, bodies, headers, tokens and cookies are not recorded in this ledger.
- `collectionComplete` and `completionReason`: successful runs require
  `will-quit`, installed guards, observed allowed calls for all three scopes,
  internally consistent counts and zero denied attempts. Guard denial records
  `guard-denied` before failure. JSON snapshots are written atomically; absent,
  unreadable, malformed, incomplete or inconsistent evidence fails verification.
  Failed scenarios retain available ledgers and report unavailable evidence.

The Node fetch guard checks the initial destination only: redirect hops inside
native fetch are not separately intercepted. WebSocket coverage is construction
through the guarded main global, not arbitrary Node sockets/libraries. Chromium
coverage is `onBeforeRequest` on sessions created after hook installation, not
requests preceding installation. This is not OS-wide isolation, packet capture,
or coverage of Electron/ChromeDriver background sockets. WDIO parent observations
stay in separate `driver-traffic.json`; setup downloads remain separate again.

`node --test tests/e2e/network-guards.test.mjs` launches separate real Electron
probe processes with isolated marked profiles and the same test-only guard module.
Each sends an allowed request to one loopback fixture and attempts an unexpected
destination at another loopback fixture. It requires a recorded denial, expected
nonzero child exit and zero HTTP/upgrade requests reaching the rejected target.
The Chromium probe uses a sandboxed window; no production preload/API is added.
These expected failures are **not** successful removal scenarios. Probe logs,
ledgers and target counters remain under ignored `guard-probe-*` directories;
child processes exit and verified test-owned profiles are removed even on failure.
Additional checks reject missing/incomplete/inconsistent evidence. No live
Twitch/backend probes, sleeps for UI stability, warning filters or dependency
patches are involved.

[WDIO Electron service](https://webdriver.io/docs/desktop-testing/electron/standalone)
10.4.1 was evaluated first. Its standalone helper adds a main inspector bridge,
extra peer/log-capture requirements, and internal startup retries; local attempts
did not establish a reliable graceful restart with that setup. Those dependencies
were removed. The final test uses WebdriverIO's [public `remote` API](https://webdriver.io/docs/api/modules#remote) with the
classic WebDriver protocol and `connectionRetryCount: 0`, not BiDi or main-process
execution/mocking. There are no scenario retries.
[The documented fuse constraint](https://webdriver.io/docs/desktop-testing/electron/common-issues)
disables main-process execute/mock/log access, not renderer automation. No fuse
is changed to work around it; protected packaged verification remains separate.

Before production modules load, the bootstrap uses documented `app.setPath` for
user/session/app data, logs and crash dumps under a fresh marked temp root, then
changes its working directory there. ChromeDriver's `user-data-dir` matches the
same session path, using [documented ChromeDriver options](https://developer.chrome.com/docs/chromedriver/capabilities)
(otherwise its DevToolsActivePort lookup fails). A build guard
rejects runtime-config/local-properties imports. Node fetch/WebSocket guards and
Chromium session request guards reject unexpected application destinations;
HTTP/IRC and an inert PCG page are served only by the loopback fixture. Driver
traffic is separately restricted to loopback. Certificate errors are not accepted,
and ChromeDriver's basic-password/mock-keychain switches are excluded.

Real Windows safeStorage must be available; missing encryption is a failure,
never a plaintext fallback/skip. Runtime checks exercise the real isolated preload,
absence of renderer Node access, and OS sandbox metrics; source checks retain
all four production window security settings. These are not a security certification.
Native Electron logs, verbose driver logs, bootstrap reports, failure screenshots,
and error stacks are retained. Expected driver disconnect diagnostics during a
verified app exit are reported, not filtered. Test-owned paths are checked before
cleanup; bounded cleanup polling handles transient Windows file locks only.

Finalization attempts diagnostics, browser-session shutdown, each owned Electron
and ChromeDriver release, fixture shutdown, environment restoration and verified
profile removal independently. Each attempt has a bounded timeout. Driver child
handles are observed through Node's public
[`child_process` diagnostics channel](https://nodejs.org/docs/latest-v24.x/api/diagnostics_channel.html#event-child_process),
restricted to the explicit driver and this run's log arguments; live Electron
PIDs must match the expected executable and unique profile marker before signaling.
Unknown ownership or unverified process shutdown retains the profile and fails,
reporting its path. The fixture attempts HTTP and WebSocket closure independently.

The original scenario cause and secondary failures remain in an `AggregateError`.
`finalization.json` records attempted releases and any remaining profile. A failed
diagnostic, shutdown, environment restore, safe removal or final report is not a
pass; the overall PASS is printed only after finalization succeeds. The focused
cleanup regressions inject deterministic filesystem/session/fixture failures into
this same finalizer with disposable directories and simulated process boundaries;
they do not dynamically demonstrate active Electron-process leakage. The earlier
EIO experiment established skipped directory cleanup before Electron launched.

Earlier development attempts exposed inherited `ELECTRON_RUN_AS_NODE`, a mismatched
driver/session path, service peer/teardown issues, and missing local panel routing.
Their failure evidence is retained; they are not passing runs. The runner removes
RunAsNode only for its child-launch environment and restores the parent setting.
Install/runtime warnings and dependency findings remain open; E2E is not an audit.
This is functional synthetic encryption/removal evidence, not real Twitch login,
backend correctness, cryptographic assurance, or PCG retention/lifecycle coverage.

## Review and completion

Keep one coherent problem per change. Describe expected behavior, constraints,
and observable acceptance criteria before implementation. Reuse existing owners,
trace callers, and keep unrelated cleanup, upgrades, and migrations separate.
For consequential changes, request a separate defect-focused review; agreement
between reviewers is not proof of correctness.

Use [the PR template](.github/pull_request_template.md) to record scope, actual
checks, diagnostics, and missing evidence. Fix diagnostic causes rather than
filtering warnings, adding suppressions, weakening rules, or bypassing failures.
Tests must exercise claimed behavior, not replace it with a mock. Inspect new
files and textual/structured lockfile changes before committing.
Required checks that were not performed remain outstanding; documenting a gap
does not satisfy an acceptance criterion. Local passes alone are not merge approval.

### Remaining controls in this tree

- TypeScript enables `noImplicitAny`, not the full `strict` family;
  `skipLibCheck` skips declaration checking. Tighten these in focused changes.
- ESLint enables browser and Node globals together; CJS coverage and process
  import-boundary enforcement need separate work.
- No tracked `.gitattributes` or `.editorconfig` exists here. System
  `core.autocrlf=true` currently produces LF-to-CRLF notices. The lockfile has no
  repository `-diff` attribute; review its actual changes. Align EOL policy
  separately, without changing global settings or normalizing unrelated files.
- `src/index.css.broken-backup` remains tracked. No root license or security
  reporting file is present; package license metadata alone is not such a file.
  Trace consumers before cleanup and leave policy choices to the maintainer.
- Dependency security findings remain unresolved; the historical evidence and
  mitigation limits are in [the E2E tooling assessment](docs/security/e2e-tooling-review.md).
  Production-only audit results do not establish Electron runtime/build safety.
- The development-build `pathToFileURL` warning needs separate development and
  packaged-path verification; do not remove its production-path import blindly.

Keep operational rules in AGENTS, current boundaries in the architecture map,
and task evidence in PR/commit descriptions. Avoid duplicate policies, generated
task diaries, or claims that proposed safeguards are already implemented.
