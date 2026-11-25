# Contributing

Human and AI-assisted changes follow the same review process. Read
[AGENTS.md](AGENTS.md) and [the architecture map](docs/ARCHITECTURE.md).
The maintainer remains responsible for reviewing and accepting each change.

## Local setup and checks

Welcome/update tests and the public GitHub/site contract are documented in
[welcome and updates](docs/welcome-and-updates.md). Synthetic UI tests replace
only release-metadata transport with local HTTP; automated tests must not query
GitHub or download/install a release. New checks retain the existing network guards.

Player unit tests exercise the actual loopback source's path/channel validation,
CSP, retired documents and listener closure, plus manager ownership with Electron
boundaries substituted: reparenting versus destruction, shared-session preservation,
stale creation/cancellation, disappearing native getters, modal occlusion before
creation, permission/navigation denial and load deadlines. Player IPC rejects
foreign frames, malformed contexts, dimensions and occlusion payloads.
Synthetic Electron retains the actual document server and native view lifecycle;
only the official Twitch frame origin constant is replaced at build time with an
inert loopback fixture. The Chromium guard additionally permits only the current
owned localhost origin, unpredictable path and selected channel; retired/other
destinations remain forbidden. Playback observations record status, actual view
IDs/bounds/destruction and a one-time capability observation of the app-owned
local wrapper (never remote Twitch or PCG DOM). Tests keep provider playback
substitution distinct from real-video evidence, and check held loading/modal
occlusion, resizing, channel drafts/history refresh, reparenting, account changes,
window-close cleanup, owner reload while login is open, PCG view preservation and no
chat sends. App shutdown with video
still active is exercised; source/view cleanup observations are retained without
credentials or provider DOM. Native window resizing/closing
uses bounded commands in the test-owned root because this Electron build lacks
ChromeDriver's native-window-size CDP command; no production test IPC is added.

PCG and playback share one persistent Chromium session per registered account;
the main web-session owner installs permission policy once. Unit regressions
forbid player calls that clear shared storage/cache/authentication/connections,
check A/B separation and retained legacy paths, reject unknown/case-aliased IDs,
and keep unsafe IDs in a disjoint namespace. Synthetic playback observes only
the owned local wrapper and native session identity/persistence plus synthetic
cookie presence. B's PCG session must survive active-video exit and full restart.
No real login, cookie value, subscription status or ad-free result is asserted.
See [shared Twitch web access](docs/twitch-web-access.md) for manual acceptance.

Search tests cover literal/Unicode/case matching, author and original emote-code
lookup, both navigation directions, live arrivals without navigation, draft
preservation, bounded retention/eviction disclosure and reset/dispose. Synthetic
Electron uses native Ctrl+F, Enter/Shift+Enter/Escape, checks actual emote/link
node identity remains unchanged, treats HTML/regex-looking queries literally,
and verifies live results, account/channel reset, native PCG bounds and no sends.
A held-history response with an actual live IRC arrival proves history commit
removes temporary/detached search results before replacing the feed.

Badges are not displayed in either history or live chat. The backend history
contract does not include original badge identities; the user chose consistent
removal over live-only text fallbacks. The bounded transport metadata parser
remains covered, but the unused catalog service/bridge/rendering owner is removed.
Synthetic Electron supplies history and IRC badge metadata and verifies no badge
labels/images or catalog bridge, preserved message/author colors, account changes,
unchanged native PCG and no sends. Badge API destinations are not admitted by
the synthetic transport guard. See [badge display](docs/chat-badge-display.md).
The full synthetic Electron process has a 180-second watchdog to cover the
expanded auth/chat/appearance scenario on Windows. Individual production
request deadlines, assertion timeouts and ownership/network guards are unchanged.

Appearance coverage exercises legacy defaults without read-side writes,
serialized concurrent channel/appearance updates, fresh-store persistence,
invalid payloads, failed writes and corrupt-file preservation. Synthetic Electron
changes font size and spacing without rebuilding rows or changing draft/account/
channel/native PCG state, runs the remaining chat interactions with those settings,
and verifies them again after a full process restart.
Timestamp checks cover migration of existing appearance choices and persistence;
the synthetic UI hides/restores history/live times without losing datetime,
font/density or native PCG state, then verifies hidden state after restart.
Layout comparisons first require selected PCG identity, DOM-host bounds and the
independently sampled native view to agree on two observations. This excludes
an account-transition snapshot from the baseline without weakening the exact
before/after bounds and native-view identity assertion.

Reply coverage includes real IRC serialization/parsing against substituted
WebSocket transport, injection/preview bounds, active-profile/channel checks and
trusted send IPC origin/frame validation. The Windows synthetic UI scenario
also selects/cancels/sends a reply, displays incoming parent context and checks
that account/channel changes clear selection and restart never replays sends.
These checks use local fixtures, not a real Twitch delivery acknowledgment.
Emote favorites tests cover 24-item FIFO insertion (reuse preserves position),
tail eviction, per-account/channel behavior, serialized concurrent writes,
restart persistence, stale entitlement and corrupt/unwritable storage. The
synthetic Electron picker checks section order, unified search, no usage from
unsent selections, channel/global favorites, account isolation and a fresh
process reading the saved favorites. All transports remain local substitutes.
Picker search also checks direct global matches, unique results across favorites
and their original section, one empty result, and section restoration on clear.
Color coverage rejects non-RGB/CSS metadata, preserves actual provider colors,
uses stable per-username fallbacks and resets own USERSTATE color on reconnect.
Synthetic UI checks compare history/live/local-echo colors and verify both hover
and keyboard reveal/activation for Reply; no real user-color API calls are made.
Missing-color lookup tests cover batched login/ID resolution, positive/negative
cache expiry, token/account isolation, stale completion, response identity/CSS
validation, failure cooldown and shared request/body deadlines. Renderer tests
exercise 5000 new authors with bounded batches and no full-DOM scanning, additional
messages during a pending lookup, live-tag precedence and reset/dispose cleanup.
Synthetic Electron history with missing red/yellow bot colors resolves through
the actual trusted IPC and main service using loopback HTTP substitutes; reload
reuses cache, unset colors retain their fallback and existing tags stay intact.
Chat-link tests cover punctuation/Unicode, bracket balancing, raw/canonical URL
bounds, oversized prose tails, link-count budgets, inert unsupported schemes,
trusted main-frame validation, OS-boundary failures and local-window navigation
guards. Synthetic Electron verifies history/live links alongside emotes, trusted
primary/middle/keyboard activation, inert programmatic events, explicit retry
and unchanged local-window URL/handles. Only the OS browser boundary is replaced;
no real browser or remote destination is opened and network guards stay active.
Autocomplete unit coverage exercises token boundaries, collapsed caret rules,
Unicode/middle-word edits, participant bounds, exact emote code insertion,
availability, prefix/favorites ranking and option deduplication. Synthetic
Electron checks history/live mention sources, native Tab/Enter/arrows/click,
punctuation acceptance without reopening, preserved input history/draft, IME
events, Escape/reply precedence, panel exclusivity and unchanged native PCG.
A held loopback catalog response across account/channel changes proves stale
results are ignored and selections never send/replay. Unicode entry substitutes
only the paste input boundary because ChromeDriver cannot type non-BMP text.
Mention coverage checks whole-word/case/Unicode boundaries, URL/email exclusions,
self-message exclusion and authoritative reply recipient IDs. History IPC tests
exercise trusted senders, account-specific results and stale account/token
rejection across a pending real history load with substituted HTTP. Synthetic
Electron checks history/live mentions, replies without textual mentions,
conflicting reply identities, cycling/focus, unchanged drafts and paused scroll,
account/channel reset and unchanged native PCG. The counter describes loaded
matches, not unread messages; detection/navigation never sends chat.
Network guards publish their completed report once; sparse, immutable progress
snapshots avoid Windows errors replacing files held by scanners/readers. Failure
cleanup retains the latest partial snapshot under a distinct progress name;
partial reports never satisfy completed-network-evidence acceptance checks.

Use Node **24.22.3** with its bundled npm **11.19.1**, matching the CI runtime.
In a fresh Windows checkout, run:

```text
npm ci
npm test
npm run typecheck
npm run lint
git diff --check
```

The [November dependency review](docs/security/dependency-review-2026-11.md) records
the security changes and unresolved tooling findings. `npm ci` invokes the pinned
Electron vendor installer through the project postinstall.

Dependency installation accesses package/download services. The checks require
no Twitch account, backend credentials, repository secrets, or `local.properties`.
For clean-install experiments, use an isolated checkout/copy rather than replacing
another developer's `node_modules` or working files.

`npm test` compiles the main-process composition to ignored `.test-build/` and
runs account-removal and session-restore regressions with Node's built-in test runner. Tests use
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

Session-restore regressions cover offline/HTTP failures followed by a successful
restart, mixed account outcomes, response identity/schema validation, rotated
tokens, bounded requests and local read/decrypt/write failures. A loopback HTTP
fixture also verifies that aborting after response headers interrupts body
consumption. Failed accounts are not activated; their encrypted credentials are
retained and retried on a later restart. Even 401/403 does not delete stored
authentication without a documented backend revocation contract. No retry UI,
automatic retry, live provider request or offline authentication is introduced.
Unreadable encrypted storage is retained and cannot be silently overwritten by
a later login; repair/recovery UI is separate work.

Active-selection regressions restore two accounts in both orders and require the
saved preference and compatibility authentication to agree after startup. They
also check absent/stale preferences, failed preferred-account fallback and recovery
after a fully failed startup. No intermediate restored account may overwrite the
preference before the complete restore batch is available.

`npm start` launches the application and can restore authenticated state; it is
not an automated check. Backend/OAuth setup needs suitable development
configuration. Never attach credentials to issues or test fixtures.
Use `npm run package` for packaging changes and before releases; packaging is not
part of this quality workflow and does not establish correct authentication.
For the local Windows installer and the separate protected-artifact smoke test,
see [local Windows packaging](docs/windows-local-package.md).
The separate `npm run test:squirrel` exercises the protected installer event
lifecycle against an owned updater fixture. It does not install into user profiles;
real installer tests require their own authorized, scoped verification and must
preserve user/development links and avoid starting authenticated services.

## Continuous integration

[The quality workflow](.github/workflows/quality.yml) runs on pull requests,
pushes to the verified default branch `main`, and manual dispatch. The existing
`Windows quality checks` job uses `windows-2025`, Node 24.22.3, `npm ci`, and
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
for head `ca9c0f22c9335a901fcae5759550f307eae50f81`. This does not verify
later changes. The first Electron E2E hosted run is described below; it failed,
and must not be counted as a passing scenario.
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

Manual check on 2026-11-17: normal development startup while online opened the
main window, and the user confirmed an active saved account. After closing the
app and restarting it online with the same profile, the user confirmed that the
account was active without another login. The user then confirmed that Refresh
history completed without errors on the current channel, exercising the restored
session against the history endpoint. The user subsequently completed a second
real-account login and confirmed two distinct accounts in the Accounts menu.
The user confirmed A-to-B-to-A switching with matching status, both accounts
remaining available, and no new login requested. After closing with A selected
and restarting online, both accounts were available without login, but B was
active: credential retention passed; persistence of the selected account failed.
An isolated synthetic registry probe reproduced the selection loss before account
restoration and replacement of the preference by the first restored account.
After the active-selection correction, the user selected A, waited for matching
status, closed the app and restarted online. The user confirmed that A remained
active, both accounts were present and no new login was requested. This manually
verifies the corrected development build's saved selection across restart.
The offline-startup and subsequent online-recovery check is deferred because the network cannot be
disconnected during this session. These observations do not establish offline
retention, real-account removal, or PCG retention/resource behavior.

## Electron E2E (synthetic)

Emote catalog tests cover token/user validation, pagination and malformed data,
missing personal scope, account/token/channel cache isolation, expiry, stale
results, bounded concurrency, trusted IPC senders and request/body cancellation.
The picker E2E closes/reopens while a catalog is pending, checks category/search,
locked entries, caret insertion without send, cache reuse, account-switch scope
fallback and explicit sending with a decorated local echo. The inline revision
also verifies no native modal, bounded layout between messages and composer, readable chat space,
unchanged visible PCG bounds/identity, chat interaction, composer edits while the
panel stays open and repeated insertion. Focused scroll-owner regressions check
following the latest versus preserving an older reading position on panel resize.
The test bootstrap
maps only the fixed Twitch validate/Helix HTTP endpoints to the authenticated
synthetic loopback fixture before passing transport to the unchanged guards;
real Twitch/CDN services remain inaccessible. Fixture gates are released during
shutdown. Real permission availability must be checked separately with the user.
On2026-11-18 version1.1.0-dev.2 passed101/101 unit tests, typecheck, zero-warning
lint, whitespace checks and the full isolated Electron scenario. Native picker
bounds/identity and synthetic screenshots were checked. Windows observation now
uses bounded immutable numbered snapshots to avoid replacing a file held by a
reader; the scenario waits for actual restart chat readiness before shutdown.
Owned processes/profiles were removed. Experimental module-mocking and existing
Electron diagnostics remain visible. Real personal-scope authorization, hosted
CI and packaging are not established by these local results.
The integrated-panel follow-up1.1.0-dev.3 passed103/103 tests, typecheck,
zero-warning lint, whitespace checks and the full Electron scenario on2026-11-18.
The picker has no modal/backdrop, keeps at least180px of message space in the
tested desktop geometry, leaves native PCG bounds unchanged, and supports editing
the composer and selecting repeatedly while open. Test screenshots were visually
inspected and owned profiles/processes removed. Hosted/package/user-assisted
personal-scope checks remain separate.
The placement adjustment1.1.0-dev.4 moves that same panel below the message feed,
immediately above the composer. The full Electron scenario now asserts that
message/picker/composer rectangles do not overlap and Send remains in the visible
viewport. It passed on2026-11-18, along with the three focused version/scroll
tests; the synthetic screenshot was inspected. No catalog/auth behavior changed.

Twitch emote coverage includes received IRC and backend history, repeated/adjacent
emotes, Unicode code-point ranges, exact whitespace, ACTION bodies, invalid IDs,
conflicting ranges and metadata limits. The Electron scenario exercises real
main normalization, preload and shared DOM rendering; only image delivery is
substituted at the image src boundary with an inert synthetic SVG and a broken
image. CDN URLs are validated by the unit tests, guards/CSP are unchanged, and
the synthetic run makes no Twitch/CDN requests. Error fallback and literal HTML
text are asserted. Real Twitch delivery and the catalog need separate evidence.
The history fixture now uses the actual backend `emotes` field, alongside unit
coverage for null emotes and the older emotes_raw/emotesRaw aliases. A normal
development diagnostic on2026-11-18 inspected only schema/counts, established that
the real endpoint uses `emotes`, and recognized83 occurrences after the alias
fix. The user then confirmed real history emote images were visible. Temporary
schema logging was removed. This does not establish live-chat/outgoing/catalog
behavior. That correction used package1.1.0-dev.1; the picker increment uses
1.1.0-dev.2. Title/header compilation stamps and their agreement receive focused
unit and Electron coverage. No dependencies or package identity were changed.
The correction passed85/85 unit tests, typecheck, zero-warning lint, whitespace
checks and the complete isolated Electron scenario on2026-11-18. The user-assisted
history check passed separately; hosted CI and packaging remain unperformed.
Local verification on 2026-11-18: 82/82 unit tests passed, including history text
alias fallback with preserved whitespace; the full Electron UI/restart scenario
passed with received/history emotes and synthetic image success/failure. Owned
profiles/processes were cleaned. A separate unauthenticated HEAD request to the
fixed public Twitch CDN URL for emote25 returned200 image/png. This does not prove
real chat delivery, catalog authorization or hosted CI. Experimental mocking
warnings remain visible.

The production renderer login dialog is also exercised in the isolated Electron
scenario: progressive steps, browser-launch failure and retry, clipboard denial
and keyboard fallback, expired claim, a stalled body reaching the production
ten-second deadline and returning editable controls, reset/cancel, late clipboard completion,
successful paste/finalization and duplicate-submit controls. Only OS browser
launch and clipboard reads are substituted; production IPC, session persistence
and account notification use the loopback fixture. No real browser or system
clipboard is accessed. The test checks native PCG bounds while the modal is open
and captures synthetic step screenshots locally. These checks do not establish
real Twitch OAuth completion or packaged-app behavior.

The header/channel E2E checks the compact header, account-options dismissal with
Escape and outside click, confirmed removal from that menu, navigation with Open
and Enter, and the updated channel label. A draft different channel must not
retarget history refresh, favorites or the single synthetic IRC message. All
transports remain loopback-only; fixture messages never reach Twitch.
Read-only bootstrap observation also verifies zero native PCG bounds while the
account menu is open and visible bounds after Escape, with the same webContents
identity retained. The observation timer is released on window close/app quit.

PCG menu coverage uses the same inert loopback panel: controls are hidden until
the menu is opened, native bounds become zero without changing view identity,
Escape/outside click restore the panel, and the actual separate-window action
opens a local child window. Closing it restores the retained embedded view.
The game-specific Twitch login button is checked for visibility/availability;
automated checks do not click it or contact Twitch authentication.
On 2026-11-18 the PCG menu revision passed the full Electron scenario including
native view identity and detached-window return, plus 52/52 unit tests,
typecheck, zero-warning lint and whitespace checks using Node 24.18.0/npm
11.16.0. Owned processes and the temporary profile were removed; the existing
module-mocking warning remains. Independent review found no confirmed defect.
Real PCG sign-in, hosted CI for this revision and packaged behavior remain
unverified.

Conditional PCG sign-in regressions distinguish absent/persisted browser-session
evidence per account, cookie sign-in/logout/expiry, lookup errors, obsolete
queries/activations and destroyed/replaced view cleanup. Synthetic cookie objects
throw if their values are accessed. The Electron fixture seeds only B's temporary
PCG partition with a synthetic browser cookie: A shows the explicit prompt, B
hides it, and B's evidence persists across restart. Parent-runner commands change
only that synthetic cookie through the test bootstrap, allowing a same-account
logout/return check and a fixed-height native-host positioning regression. They
do not add production IPC or perform real Twitch authentication.
On 2026-11-18 the conditional prompt passed 59/59 unit tests and the complete
isolated Electron scenario, including persisted session evidence after restart,
account-specific prompt visibility and same-account cookie removal/restoration.
The first real teardown probe exposed a cleared WebContentsView getter; cleanup
now captures its contents owner, with a regression and passing shutdown/profile
removal evidence. Review also prompted explicit position synchronization when
prompt visibility changes. Native screenshots were inspected. Provider session
validity and PCG consent remain outside this cookie-presence check; real PCG
login and hosted CI for this revision remain unverified.

Local guided-login verification on 2026-11-18 used Node 24.18.0 and npm 11.16.0:
`npm test` passed 52/52, typecheck and zero-warning lint passed, and the complete
Electron scenario passed including the ten-second stalled-body recovery and
account-removal/restart checks. Owned temporary profiles/processes were cleaned
up. Independent defect review's modal-blocking finding was corrected and
re-reviewed with no further confirmed finding. The experimental module-mocking
warning remains. The user subsequently confirmed that the guided real-login
flow worked in the development app. The header/channel revision also passed
52/52 unit tests, typecheck, zero-warning lint and the complete Electron scenario,
including direct native-menu bounds/identity observations. Its manual layout
check and hosted CI remain pending. Earlier broader account tests concern the
previous interface.

On Windows x64 with Node 24.22.3 and PowerShell 7, install dependencies with
`npm ci`, provision the driver as described below, then run `npm run test:e2e`.
Run serially; generated bundles and sanitized evidence live
under ignored `.test-build/electron-e2e/`. This command is intentionally separate
from `npm test` and runs in its own CI job. Maintained E2E `.mjs` and `.ts` files receive
Node-specific ESLint coverage, with no diagnostic suppressions.

The scenario seeds synthetic B/A through the production secure store, saves a
preference for the account that will restore last, and verifies the actual restore
order plus the initial UI selection/status. It then selects A
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

Dependencies: `webdriverio` 10.2.0 (WebDriver client/driver lifecycle, Node
24.22.1 or later within 24.x) and `ws` 8.23.0 (loopback IRC fixture). Electron is
43.8.12; ChromeDriver 150.0.7871.250 matches its actual Chromium version.
No scaffolding wizard or new unit runner is needed. Dependency/runtime setup may
download Electron from official distribution services; WDIO automatic acquisition
is bypassed by the explicit binaries.

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
[official Electron 43.8.12 release](https://github.com/electron/electron/releases/tag/v43.8.12).
`tests/e2e/driver-provenance.json` pins its source URL and SHA-256 from the official
`SHASUMS256.txt`, independently corroborated by the GitHub release asset digest.
Only after checking the archive does PowerShell 7 `Expand-Archive` extract it.
The executable digest is derived from that authenticated archive, **not** an
arbitrary cached file; it is also pinned and checked after provisioning.
Do not substitute an unverified cached driver or change pins to match local files.
Provisioned archives/binaries and provenance copies stay under ignored
`.test-build/electron-e2e/provisioned-driver-*`; do not commit them or local paths.
Failed provisioning leaves artifacts for diagnosis and never runs the driver.

On GitHub Actions, the provisioning utility also writes the verified absolute
binary path to the runner's UTF-8 `GITHUB_ENV` file as `TMC_E2E_DRIVER_PATH`, only
after the pinned SHA-256 check succeeds. It rejects multiline paths; no workflow
step parses human console output or searches a shared cache. The generated
`provenance.json` records `binaryPath` alongside the source and digest, but is not
uploaded. Locally, keep using the explicit path above unless deliberately testing
the [GitHub environment-file protocol](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-environment-variable).

### Windows E2E CI job

`Windows Electron account-removal E2E` is a separate `windows-2025` job with a
25-minute timeout, pinned Node 24.22.3 and bundled npm. It retains inherited
read-only repository permissions, nonpersistent checkout credentials and disabled
package-manager caching. The original `Windows quality checks` job is unchanged.
Named steps record versions, run `npm ci`, provision the official checksum-pinned
driver, run driver checks, network-guard probes, cleanup regressions, and one full
UI-removal/restart scenario. Failures propagate unchanged; there is no scenario
retry, `continue-on-error`, secret, OTP, `local.properties` or privileged PR trigger.

The artifact step runs even after failure, with a five-minute limit and seven-day
retention. [upload-artifact v7.0.2](https://github.com/actions/upload-artifact/tree/cf430e030ddbb5b0abf93d22962f4752f3646cd9)
uses a verified immutable official commit and Node 24. Its path list allows only
named diagnostic reports, logs and failure screenshots. Hidden-file inclusion is
needed for `.test-build`, not a grant to upload that entire directory. Profiles,
credential stores, provisioned binaries/archives/metadata, bundles, dependencies
and unrelated files are excluded by the positive allowlist. Missing artifacts
warn when an earlier setup failure prevented their creation; that failure still
fails the job. A failed artifact upload also fails the job.

Driver-negative evidence moves into `driver-check-evidence` after that step while
retaining its native test exit code. Expected network rejections retain the
`guard-probe-*` prefix and `expectedFailure` reports. Step logs name driver checks,
network guards, cleanup regressions and actual removal separately: fault-test
messages are not proof of a failed removal scenario. Only synthetic accounts and
local fixtures run; application guards and WDIO parent evidence remain distinct,
not OS-wide network isolation or dependency remediation.

To reproduce the command sequence locally, use the setup commands above with
Node 24.22.3/npm 11.19.1 and a fresh test-owned profile (the launcher creates one).
For exact workflow replay, give provisioning a disposable `GITHUB_ENV` file, load
its `TMC_E2E_DRIVER_PATH` assignment into subsequent steps and preserve each native
exit code when teeing logs. Use an isolated copy for a fresh `npm ci`; never replace
another developer's installation. Local reproduction is not hosted execution.
On 2026-11-16, the workflow's run-step bodies were reproduced once in an isolated
Windows copy using Node 24.18.0/npm 11.16.0, including fresh `npm ci`, official
provisioning and environment-file handoff: driver 4/4, network guards 4/4,
cleanup 9/9 and one full real-Electron restart passed. Typecheck, zero-warning
lint, workflow validation and local artifact-selection checks also passed.
The upload action itself was not run locally. The first hosted run,
[44043286718](https://github.com/unouidol/TwitchMiniChatDesktop/actions/runs/44043286718),
passed quality checks but failed driver checks (3/4): Windows returned a short
TEMP alias from directory creation and a long path from `realpath`. The strict
cleanup identity check correctly refused that inconsistent path; the missing
`Diagnostics:` assertion was secondary, not missing diagnostic files. Guard,
cleanup and full scenario steps were skipped. A corrected revision needs its
own hosted result; the earlier baseline CI is not that result.
The next hosted run,
[44049066827](https://github.com/unouidol/TwitchMiniChatDesktop/actions/runs/44049066827),
at head `4a0ee1c9b6ef283dda53a6c836cc8f2cc89831b7` passed quality and driver
checks, but failed network guards (1/4): Electron's non-native synchronous
`realpathSync` still retained a short TEMP ancestor. Cleanup regressions and the
full scenario were skipped. Electron bootstrap and probe now use
`realpathSync.native` for both profile root and TEMP parent.

Hosted run
[44054285201](https://github.com/unouidol/TwitchMiniChatDesktop/actions/runs/44054285201)
passed both Windows jobs at head `01ee0beea53d538ca5a87d3bddb2ee9010e0dfb1`.
Its synthetic merge `15be8a7c39ba44e3da4c77c7d36ba7bd2c3a0007` has that head
and base `ca9c0f22c9335a901fcae5759550f307eae50f81` as parents and the same
tree as the head. Driver checks passed 4/4, guards 5/5 and cleanup 12/12 with no
skips, including native short-TEMP coverage. The full UI-removal/restart scenario
restored only B and finalized without errors or a remaining profile. The diagnostic
artifact contained 45 allowlisted files; its ZIP SHA-256 matched the GitHub digest
`f5fd9fb9714d08a98e8feb95ca88e416bcfe879d977e9402edc93ab0da5e780b`.
This establishes that revision's synthetic hosted scenario, not real login or
packaged-app behavior. Later code changes require their own evidence.

On 2026-11-17, local verification with Node 24.18.0/npm 11.16.0 passed
driver checks (4/4), cleanup regressions (12/12) and one full Electron UI/restart
scenario with TEMP/TMP set to a native 8.3 alias of a disposable directory.
Network guards passed 5/5, including the new short-TEMP child probe without skips;
that regression failed with the previous synchronous checks and passed with the
native checks. Account tests (16/16), typecheck and zero-warning lint passed.
The wrapper's empty-parent check additionally found npm's `node-compile-cache`;
that verified cache and parent were removed separately. Electron profiles were
removed by their existing finalizers. These are local results, not a hosted pass.

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

Temporary directories are canonicalized with
[`fs.promises.realpath`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesrealpathpath-options)
immediately after creation, before bootstrap arguments, process markers or cleanup
receive them. Cleanup still requires exact canonical identity, the canonical TEMP
parent, ownership marker and verified process releases; redirected/replaced paths
are not accepted. Electron bootstrap and probe use `fs.realpathSync.native` for
the matching synchronous checks; the non-native synchronous implementation can
retain short ancestor names. Regression teardown uses the same canonical creation path.
Coverage includes a deterministic alias-return boundary with real directory cleanup,
a native Windows 8.3 alias check (explicitly skipped when unavailable), and rejected
redirected identity without deletion. No machine-wide TEMP or filesystem setting
is changed. The guard suite also launches an independent real-Electron main-fetch
probe with TEMP/TMP set to a native 8.3 alias of a disposable parent. It requires
actual probe completion, network-denial evidence and removal of the child profile;
the empty parent is then removed without recursive deletion. This case explicitly
skips when Windows short aliases are unavailable.

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

## Git workflow

The coding agent owns routine repository organization under the standing
delegation in [AGENTS.md](AGENTS.md#git-ownership-and-repository-maintenance).
Use a lightweight branch/PR workflow rather than adding permanent branches for
each development stage. `main` is the currently documented integration branch;
verify the actual remote target and existing PR dependencies before publishing.
This policy does not assert that remote branch protections are configured.

1. Inspect local changes, staged content, upstream divergence and relevant PRs.
   Fetch remote refs when needed; do not blindly pull into a dirty working tree.
2. Choose or create a descriptive `codex/<topic>` branch from the verified base.
   Preserve unrelated work; use an isolated worktree when simultaneous work
   requires it. Avoid duplicate PRs for the same patch or accidental stacked PRs.
3. Implement one coherent change and run checks appropriate to its scope. Review
   the intended staged changes and checkpoint validated increments with useful
   English commit messages. Preserve test/doc changes with the behavior they cover.
4. Push the feature branch normally and open/update a draft PR using the existing
   template. Record the concrete behavior, dependency order, tests, diagnostics
   and unperformed acceptance checks. A draft can hold incomplete work, clearly
   labelled; it is not merge approval or a claim of passing verification.
5. Before integration, verify the PR's final head/base, diff, independent review
   and required hosted checks, including Windows E2E for relevant app changes.
   Revalidate after conflicts or code/base changes invalidate earlier evidence.
   Local success alone never establishes hosted CI or real-login/release behavior.
6. With explicit integration authorization, merge using the repository's accepted
   strategy. Then synchronize safely and remove verified completed branches only
   after checking for unpublished work and dependent PRs/worktrees. Keep releases
   traceable to their exact source commit; never move published version tags.

For a regression in shared history, prefer a small corrective commit or reviewed
revert. A failed check, unrelated dirty file or old branch is not a reason to
discard work, rewrite published history, force a push or change repository policy.
Do not mass-delete existing branches merely to reduce the branch count.

This workflow adapts the official [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow)
and [Pro Git contribution guidance](https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project).
The [Pro Git rebasing guidance](https://git-scm.com/book/en/v2/Git-Branching-Rebasing)
explains the risk of rewriting commits other work already depends on.
[Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
can enforce review and status checks; configuring them is a separate authorized
repository change, not something this documentation enables automatically.

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
