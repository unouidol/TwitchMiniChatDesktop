# Architecture map

This document separates the current implementation from desired invariants.
It is an orientation aid; inspect code and callers before changing behavior.

## Current boundaries

| Area | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `src/main.ts`, `src/main/` | App startup, accounts/auth, backend requests, IRC, local storage, PCG web surfaces | Electron/Node and shared contracts; no renderer implementation imports |
| `src/preload.ts`, `src/preload/` | Explicit, typed bridge between local UI and main | Electron bridge APIs and shared contracts; no business services |
| `src/renderer.ts`, `src/renderer/` | DOM, UI state, rendering, user interactions | Shared contracts and the exposed bridge; no privileged Electron/Node APIs |
| `src/shared/` | Cross-process data contracts, IPC names, portable helpers | No privileged runtime APIs or main/renderer implementation imports |

Some older files may violate their directory's intended responsibility. Trace
imports and runtime entry points before moving or deleting them; do not copy the
exception into new code.

## Startup and authentication

`src/main.ts` registers IPC through `main/ipc/registerIpcHandlers.ts` and then
creates the local main window. Registration currently also constructs services
and restores saved accounts before window creation.

`TmcSecureAuthSessionStore` persists desktop session tokens encrypted with
Electron safeStorage. `TmcAuthBrokerClient` exchanges/restores sessions through an
external backend. Access tokens remain in memory in the main process.

`TmcAccountSessionRegistry` tracks restored accounts and selection.
`TmcAuthSessionStore` mirrors the currently selected session for compatibility.
`TmcAccountStore` is currently a compatibility no-op, not the durable account store.
The backend implementation is outside this repository; desktop types alone do
not establish its full contract.

Saved-account removal runs through the local renderer, `accounts.removeLocal`
in preload, and `ACCOUNT_REMOVE_LOCAL` in `registerAccountIpcHandlers.ts`.
The handler validates the profile identifier and the local main-frame sender.
`registerIpcHandlers.ts` supplies the required secure store, runtime configuration,
and the single chat controller. `TmcAccountRemovalService` coordinates those
existing services; it does not own another account store or chat connection.

Removal commits the encrypted session deletion before changing memory or
attempting backend logout. Storage read/decryption/write failures reject the IPC
operation without removing accounts from memory or revoking remote credentials.
The currently selected account's chat is disconnected when that account is
removed; removing another saved account leaves the selected account's chat alone.
The registry selects a remaining account or becomes signed out, and the
compatibility authentication store mirrors that result. Backend logout uses only
the removed session's token and is best effort: failure does not undo local
removal. Only logout has a ten-second HTTP timeout; session restoration is unchanged.
A late logout completion does not change the subsequently selected account.
Save/delete operations on the application's secure-store instance are serialized
to avoid overlapping read-modify-write operations restoring removed credentials.

## Chat and account state

Account-scoped recent/favorite/last channels live in `TmcAccountChannelStore`.
`registerChatIpcHandlers.ts` creates one `TmcTwitchIrcClient`, so saved multiaccount
support currently does not mean one simultaneous IRC connection per account.

The renderer's `TmcChannelChatController` coordinates channel selection, history,
and live events. It already uses generation checks for several asynchronous
operations. Account identity and stale-completion protection must remain intact
across the main-process and PCG paths as those paths evolve.

Switching the selected account must preserve other saved accounts' authenticated
sessions, subject to provider session validity. This account-removal change does
not change selection or general session restoration.

## PCG

`TmcPcgSessionManager` hosts remote PCG/Twitch content in isolated web surfaces,
using persistent browser partitions per profile. Browser cookies and the OAuth
tokens used by chat are separate authentication mechanisms.

`TmcPcgSessionHoldManager` separately tracks account/channel session metadata
with grace periods and capacity limits. Its lifecycle callbacks are not yet
connected to ownership of the real views. Its status must not be treated as
proof that an actual panel was retained or disposed.

Product requirement for subsequent lifecycle work: PCG panels must remain loaded
when switching accounts. Selection must not automatically close, expire, or evict
a panel. This account-removal change does not implement retention or change PCG
behavior; the ownership gaps below remain unresolved.

## Known gaps to address incrementally

- Restore errors currently remove saved sessions without classifying temporary
  network errors separately from invalid credentials.
- Restores run before window creation, sequentially, without an explicit OAuth
  request timeout. Offline startup needs deliberate behavior.
- Real PCG views and hold metadata have separate owners. Replacement detaches
  the old view without an explicit close in that path; verify and fix disposal.
- Preload and renderer bridge types duplicate the contract and retain aliases.
  Consolidation must update callers without assuming backend compatibility.
- `npm test` covers account removal through the actual application composition,
  temporary persistent storage, and service recreation, with controlled external
  substitutes. This standalone tree has no quality CI workflow; hosted execution
  is unverified. The running application's account-removal smoke test
  remains outstanding; live login, real Electron encryption, broader account
  switching, and PCG resource usage still need separate coverage.

These observations are a baseline, not a mandate to refactor them all in one task.
Update or remove each entry when the corresponding change is verified.

## Local verification

Use Node 24.18.0 with its bundled npm 11.16.0. In a fresh Windows checkout:

```text
npm ci
npm test
npm run typecheck
npm run lint
git diff --check
```

`npm run lint` checks the existing TypeScript/TSX scope with zero warnings allowed
(`--max-warnings 0`) and reports unused suppression directives as errors
(`--report-unused-disable-directives`). It does not cover the CommonJS test
scripts or establish that installation, runtime, and build tools are warning-free.

`npm test` compiles the main-process composition to ignored `.test-build/` output
and runs 16 account-removal regressions using Node's built-in test runner with
experimental module mocking. The experimental warning remains visible. No new
dependency is needed. HTTP is substituted and unexpected real WebSocket
construction is blocked; tests use temporary stores and synthetic credentials.
No Twitch account, backend credentials, or `local.properties` is required.
Installation can contact package/download services. No test verifies real
Electron encryption, the running renderer, or provider authentication.

Manual account-removal validation remains deferred: with development accounts A
and B, remove the currently selected account A, restart, and verify A is absent
and B still authenticates; remove B and restart to verify the signed-out state.
This procedure has not been executed. Do not run it without user participation.
The development-build `pathToFileURL` warning is a separate diagnostic follow-up:
verify both development and packaged URL paths before changing that import.

## Guidance for future changes

Keep service construction in an explicit composition point, and keep transport
handlers separate from business decisions. Account changes should coordinate
chat, PCG, persistence, and emitted state in the main process. Carry initiating
identity through async work and reject stale results.

Prefer one owner for PCG resource lifecycle, with per-account browser storage,
per-account/channel panel identity, bounded retention, and explicit cleanup.
Choose and document whether multiple accounts may be simultaneously operational
before introducing multiple chat connections or background panels.

These are design directions, not claims that the coordinators or guarantees
already exist. Record consequential choices and tradeoffs in `docs/decisions/`
when implementing them.
