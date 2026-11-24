# Architecture map

This document separates the current implementation from desired invariants.
It is an orientation aid; inspect code and callers before changing behavior.

## Current boundaries

Forge packages the production Vite output in an integrity-protected ASAR. The
Windows executable is TMC-desktop.exe; internal package/profile identity stays
unchanged. Packaged configuration uses app.getVersion() for diagnostics and skips
working-directory local.properties; environment overrides remain supported.
First launch without an active session shows login guidance rather than invoking
authenticated history. The separate [packaged smoke test](windows-local-package.md)
launches the unmodified protected artifact with an isolated native profile and
checks local UI/IPC/preferences/restart; installer and real-login acceptance are
distinct from these automated observations.

Live video is opt-in through Show live for the actually opened channel. The
renderer measures a resizable host above chat; main owns one TmcPlayerManager,
one playback WebContentsView and at most one separate video window. It embeds
only with at least 400x300 video pixels and 180px remaining feed space. Otherwise
it opens/moves to a separate window without stealing focus; returning inline is
explicit. Moving reparents the same WebContents rather than reloading playback.
Closing either control or the separate window destroys media and closes its
source; account changes replace the anonymous playback context, while channel
changes navigate the owned view. Refreshing history never restarts the same video.

TmcPlayerDocument serves a script-free document from an ephemeral IPv4 loopback
listener, addressed as localhost with an unpredictable path and validated channel.
Host/path/method/channel checks, no-store headers and a restrictive CSP limit it
to the official Twitch iframe. This provides an actual localhost parent even
when the packaged shell uses file URLs; no frame-ancestor headers are stripped.
The remote video surface has no preload or Node bridge; sandboxing, context
isolation and web security stay enabled. Popups, top-level navigation and session
permissions are denied. Playback uses one bounded, nonpersistent anonymous
partition, cleared on close/account replacement, separate from chat and PCG
authentication. If Twitch requires sign-in, Open on Twitch uses the existing
validated browser-link operation; player login is not inferred from chat login.

Typed trusted-main-frame IPC validates context, dimensions and window bounds.
Queued operations carry request revisions and initiating account/channel; a
pending open can be cancelled and an old close cannot cancel a newer context.
The manager captures WebContents ownership before native teardown, awaits actual
destruction and bounds loading to 15 seconds. Global owner-window occlusion is
recorded even before view creation: login opening awaits video/PCG hiding, and
account menus hide/mute the embedded player throughout loading. Restoring the
same view preserves its prior native audio mute state. The detached player is a
separate surface. Renderer observers, frames and subscriptions are disposed on
pagehide; main owns source/session cleanup on close, owner-document navigation
(including reload) and application shutdown. A fresh renderer synchronizes modal
occlusion from its own DOM, without relying on exit-time IPC from the old frame.
The single window-owned navigation watcher is installed before queuing an open
and stays through resource cleanup, invalidating pending requests on reload;
it is removed when that window closes or ownership changes.
The quit coordinator waits for serialized cleanup before Electron tears down
sessions, with a ten-second failure deadline and an explicit non-success exit
path. Closing the application while video is active is covered separately from
closing the player controls.
"Ready" means the local player document loaded, not proof a channel is live;
Twitch owns offline, ads, quality, volume and playback states in the iframe.

The shell follows the actual client viewport inside a 960x650 outer-window
minimum, accounting for Windows frame borders; the document itself does not
scroll. Sidebar, message feed and catalogs own their scrolling. This
keeps DOM host positions aligned with native PCG bounds when Windows constrains
the application to a narrow display or focus changes inside the chat controls.

Local chat search is owned by TmcChatSearchController through the existing
channel controller. Search opens an integrated panel with a button or Ctrl/Cmd+F,
matches literal NFC/case-normalized message text (including original emote codes)
and username, and never requests more history or persists queries. Enter and
Shift+Enter cycle results; Escape/close returns to the unchanged composer draft.
Only row classes change, preserving actual emote, link, badge and reply nodes.
The existing scroll owner reveals a result while search keeps keyboard focus;
incoming matches update the count without navigating or sending messages.
New history/live rows register incrementally. The index retains at most 10000
recent rows and two million normalized characters; eviction or oversized input
is disclosed alongside the indexed-message count, without removing chat rows.
Account/auth/channel/history resets clear the query/index/highlights and close
the panel; disposal releases all listeners and row references. Ctrl+F does not
move focus behind an open login dialog. PCG remains a separate native surface.

Twitch badge identities come only from supplied PRIVMSG/USERSTATE tags or a
history badges field (IRC string or structured set/version entries). They are
bounded and deduplicated; missing metadata never becomes a guessed role. Own
USERSTATE badges reset on every connection. TmcBadgeCatalogService validates the
initiating OAuth identity, resolves the exact channel login, and combines Helix
global/channel chat badge definitions with channel versions taking precedence.
Fixed endpoints reject redirects; image URLs must match the fixed Twitch badge
CDN path. A single ten-second deadline covers requests and bodies. Cache entries
are profile/token/channel-scoped, at most eight contexts, with four concurrent
loads; successful definitions last 30 minutes and failures back off 30 seconds.
Stale account/token completions are rejected without changing authentication.
The explicit CHAT_BADGES IPC accepts only the trusted local main frame and
returns public definitions, never credentials or raw provider responses.

The channel controller owns TmcChatBadgeController and supplies newly rendered
author nodes. It retains at most 1000 pending containers, never rescans growing
history and requests a catalog only when supplied badge metadata needs it.
Renderer definitions expire after five minutes when new rows arrive; failures retain
text labels for 30 seconds. Account/auth/channel/history resets and pagehide
invalidate pending results and release references. Fixed-size, lazy images have
plain-text titles and a text fallback on failure; badge layout changes notify
the existing scroll owner. No badge selection, moderation action or new chat
transport is introduced. Historical messages without badge metadata stay unbadged.

Chat appearance extends the existing TmcSettingsStore/settings.json owner with
desktop-wide font size (14/16/18/20 px) and comfortable/compact message spacing.
The same appearance value includes timestamp visibility (shown by default).
Hiding uses chat-only CSS for existing and future history/live rows; original
time text and machine-readable datetime remain intact. Older appearance objects
retain their font/density when gaining the timestamp default.
Older valid settings receive defaults in memory without a migration write on
read. All store operations serialize, so legacy channel writes preserve appearance
and concurrent edits do not compete for the atomic temporary file. Malformed
JSON and filesystem failures propagate without replacing the original data.
Explicit trusted-main-frame IPC validates the appearance payload. The renderer
applies saved values through chat-only CSS, leaving existing rows, drafts and
native PCG views intact; controls report failures and keep the last saved choice.
Changing appearance notifies the existing scroll owner, preserving a reader's
pause and keeping followers at the latest message. Listeners are removed on pagehide.

Chat replies reuse the existing IRC connection. Server UUID messages in live
chat and history expose a Reply action; system messages and local echo IDs do
not. The renderer owns one cancelable preview above the composer, scoped to the
initiating profile/channel and invalidated on navigation/account/auth events.
Selecting/canceling never sends or removes draft text. Explicit Send includes
the parent UUID via Twitch's reply-parent-msg-id tag; it never retries/replays.
The send IPC validates the trusted local main frame, payload, active profile and
connected channel. Reply preview fields are bounded plain text, never HTML.
Incoming IRC reply tags render parent author/text above the message. Backend
history currently supplies no normalized reply metadata; its real message UUIDs
remain replyable, but missing parent context is not reconstructed. Local echoes
mean a socket write, not Twitch delivery acknowledgment. Pending send completion
does not clear a changed draft, selection or account/channel context. Chat dedup
keys reset with the displayed history so old context cannot hide newly loaded
messages after an account/channel switch.
Reply controls reserve their space but appear only on message hover or keyboard
focus within the message; devices without hover keep the controls visible.

Main classifies attention for the selected account through the pure
TmcChatAttention helper. Whole-word, case-insensitive login matches with or
without @ count as mentions; embedded names, email addresses, URLs and own
messages do not. Incoming replies prefer Twitch's parent user ID, falling back
to parent login only when that ID is absent; display names and quoted text
never determine the recipient. History classification uses copied results and
rejects account/token changes across the load, without modifying cached history.
Live decoration reads the current main-process account; history captures its
initiating identity across the asynchronous load. Only profile ID and
mention/reply kind reach the renderer.

The existing channel controller owns a bounded index of the most recent 1000
matching rows. Mentions (N) cycles loaded matches, including history, rather than
claiming an unread count. Navigation focuses the row and pauses automatic scroll
through the existing scroll controller. Account/auth/channel/history changes
clear the index and old highlights; asynchronous obsolete loads cannot restore
them. No notification permission, sound, outgoing message or extra transport is
introduced.

Twitch name colors are optional six-digit RGB metadata. Main validates IRC
PRIVMSG color tags and the backend history color field before exposing them;
the renderer validates again when applying author color. GLOBALUSERSTATE and
current-channel USERSTATE update only the connection's own local-echo color,
which resets on every new connection/account. Missing/invalid metadata initially
uses a stable username palette; background enrichment can replace it with the
user's current Twitch color. Bots follow the same provider metadata as any user,
without guessed bot lists. Lookup colors describe current settings, not the
original color at the time of a historical message.

TmcUserColorService is the main-process owner of missing-color lookup/cache.
It validates the initiating OAuth user/client, resolves up to 100 Twitch logins
with Get Users, then requests their IDs with Get User Chat Color. Fixed HTTPS
endpoints reject redirects, unexpected/duplicate identities and non-RGB CSS.
One 10-second deadline covers fetches and bodies. At most 4 batches run concurrently;
at most 8 account/token contexts each keep 1000 entries. Positive results last
30 minutes, missing users/unset colors 5 minutes; failures back off 30 seconds and
retain authentication and readable fallback colors. No access token or raw API
object crosses the trusted CHAT_USER_COLORS IPC boundary; it accepts bounded
profile/channel/login arrays from the local main frame only.

TmcChatNameColorController enriches newly rendered author nodes in 60ms batches;
it never rescans growing chat history per message. The existing channel/chat
owner passes new nodes from history/live rendering, resets the controller on
auth/account/navigation and disposes it on pagehide. Pending nodes, attempted
names and known display colors are bounded to 1000 per displayed context; requests
contain at most 100 names. Timer/pending identity is revision/profile/channel
scoped. Same-author nodes arriving during lookup share its result, while real
message metadata arriving meanwhile takes precedence over a late API response.
Unknown/unset/failing lookups retain the palette and are retried on a subsequent
context/history refresh rather than on every incoming message.

Composer autocomplete is renderer-owned in initializeChatCompletion.ts, with
portable token/matching/edit rules in TmcChatCompletion.ts. Whitespace-delimited
@ prefixes use up to 1000 distinct logins already observed by the existing channel
controller in history/live messages; this is not a viewer list or a new API.
Colon prefixes use the existing trusted emote-catalog operation/cache, delayed
150ms and scoped to profile/channel/revision. Only available emotes are offered,
with favorites prioritized, case-insensitive search and exact-case insertion.
At most 20 options render in an inline listbox above the composer. The main picker
and completion list are mutually exclusive through their existing owners; PCG
stays loaded and its bounds are unchanged. A local catalog reference is checked
for five-minute expiry on interaction and discarded on blur, dismissal, context/
auth changes and pagehide; late
responses cannot populate a different context or move focus.

The combobox keeps input focus, announces selection with aria-activedescendant,
and accepts arrows plus Tab/Enter or click; accepting never submits, including
repeated Enter events from a held key. Escape
closes suggestions before reply cancellation. Capturing key handling leaves the
existing input-history owner active when suggestions are closed. Composition
events keep IME input native. Insertion replaces only the current token and emits
an input notification for existing draft/history owners, while suppressing its
own reopening. Noncollapsed selections and embedded email/URL/time markers do
not trigger completion. Timers/listeners are released through pagehide ownership.

Twitch received messages and history share validated text/emote fragments from
`shared/chat/TmcMessageContent.ts`. Main parses the IRC emotes tag or backend
emotes/emotes_raw/emotesRaw alias into inclusive Unicode code-point ranges, preserving
original message text and spaces. ACTION envelopes are removed only for display.
Malformed/conflicting or excessive metadata falls back to readable text. IDs
generate only fixed HTTPS Twitch CDN URLs; remote message URLs/HTML are not used.

`renderer/chat/createMessageContent.ts` owns DOM creation for both paths: text
nodes and fixed-size images with alt/title, lazy decoding/loading and text
fallback on image error. No additional OAuth/API catalog request is needed to
render received tagged emotes. Local outgoing echoes use an already loaded,
unexpired catalog for the current account/token/channel; without it they remain
plain text. Third-party providers are separate follow-up work. No code was copied
from Chatterino.

The same message-content builder recognizes explicit HTTP/S URLs in text pieces
for history, live and local echoes. It retains exact text, keeps emotes separate,
trims prose punctuation/unmatched closing brackets, and creates at most 100 links
per message. Oversized raw candidates remain text before punctuation processing;
bracket counts are computed once. Raw/canonical URLs are bounded to 4096 characters
and reject controls, backslashes, user-info and other schemes. DOM textContent
is used throughout; message HTML and file/script/custom-protocol links stay inert.

Chat anchors expose their real destination, noopener/noreferrer and keyboard
focus. Trusted primary/middle/keyboard activation prevents Chromium navigation
and calls CHAT_OPEN_LINK; the handler validates the local main frame and URL
again before shell.openExternal. Only this OS-browser boundary opens the link.
One pending open per anchor avoids accidental concurrent duplicates; failures
show an inline status and permit an explicit retry, without URL logging or
automatic retries. Detached message nodes do not insert late error UI. The main
local window denies renderer popups and navigation; PCG windows retain their
separate existing ownership/navigation policies.

`TmcEmoteCatalogService` is the single main-process catalog/cache owner. On picker
request it validates the active OAuth token to obtain the matching client/user
and scopes, then requests Twitch global/channel/paginated user emotes. No token
or provider-supplied image URL reaches the renderer. Requests share a fifteen-
second deadline (including bodies), reject redirects/identity mismatches and
stale account/token completions, and bound pages/items/pending requests. Cached
catalogs last five minutes and are limited to eight account contexts, keyed by
profile plus token fingerprint and channel. Catalog metadata is temporary memory;
the same service owns a separate non-secret favorites file described below.
No authentication is deleted on
provider errors. Missing user:read:emotes is explicit: globals remain available;
channel entitlement is unknown and personal emotes are unavailable.

The EMOTE_CATALOG handler accepts only the trusted local main frame and validates
profile/channel payloads; the service captures the initiating session. The
integrated emote section sits below the message feed and above the composer, occupies
at most 40% of the chat column and scrolls its own grid. The feed reserves at
least 180px so a wrapped toolbar on narrow Windows desktops shrinks the picker
instead of making messages unreadable. It has no dialog, backdrop
or focus trap; chat/composer/account controls and PCG remain available. The toggle
announces expansion, while X/Escape/toggle hide it. Choosing an emote inserts at
the composer's current selection and keeps the panel open for further selection;
it never submits. It closes/discards results on account/channel/auth changes.
The existing chat-scroll owner handles panel layout changes: followers stay at
the bottom and readers of older messages are not forced to the latest. PCG bounds
are unaffected by this inline panel. One scrolling page contains Favorites,
Channel, Account, then Global; Account omits duplicates already in Channel/Global.
One search filters every section, with at most300 choices rendered across all
sections and a request to narrow larger results. Third-party catalogs remain
unimplemented.
While a search query is present, matching IDs appear once in a single grid with
no category headings/empty categories. Available representations take precedence
over disabled duplicates. An empty match shows one message; clearing the query
restores the ordered sections without changing favorites or loading a new catalog.

After an explicit successful IRC socket write, the chat handler records known
available emote IDs with the initiating profile in TmcEmoteCatalogService.
Choosing an emote, receiving chat/history and failed sends never record usage.
New distinct IDs prepend to a 24-item per-account list and evict its tail; reuse
does not move entries. Main serializes read/modify/atomic-write operations through
JsonFileStore in userData/tmc-emote-favorites.json. Only bounded profile IDs and
emote IDs/names persist; no token, message text or provider URL is saved. Reads
validate the schema and reject malformed/duplicate/unbounded data rather than
overwriting it. Failures preserve the send success and produce a favorites
warning in the picker, so storage failure cannot encourage a duplicate send.
Favorites survive restart and channel changes and remain separate per account.
The catalog response joins saved IDs with current availability; missing/revoked
entitlement disables a favorite without deleting/reordering it. Known cached
IDs can be recorded after the display TTL, with no send-time network requests;
unknown names or an absent/mismatched catalog are not guessed. After Send, an
open picker refreshes through the cached catalog path, retaining search/scroll
and rejecting completions for an obsolete account/channel/panel revision.

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

The main-window title, local document/header and preload app-info display name
are `TMC desktop`. Internal package identity and existing profile/storage paths
remain unchanged; the display rename does not migrate saved authentication.
The Vite HTML transform in `build/appVersion.mjs` stamps the main document title
and visible header badge with package.json's version and one UTC compilation ID.
Development/build/E2E labels identify the launch type. The native main-window
title follows that local document title. This is display/build metadata, not a
Git cleanliness/provenance claim; hot edits need a fresh launch for a new stamp.

The renderer's `initializeAuthPanel.ts` owns a native modal login dialog, opened
by the compact Login button. It displays either the browser-launch step or the
claim-code step. Browser-launch acknowledgment advances the UI; it does not
prove that remote OAuth completed. Users can also choose an existing code.
Clipboard reading occurs only on Paste code, with keyboard paste as fallback.
Cancellation clears the field, and attempt identity rejects late browser or
clipboard completions. Finalization disables dismissal until the existing main
operation settles; the broker bounds finalization fetch and body consumption to
ten seconds so a stalled response returns the dialog to an editable retry state.
The dialog closes only after success, then notifies account UI.
No access/session token or additional privileged clipboard bridge is exposed.

Before opening the dialog, the renderer hides the native embedded PCG surface
through the existing bridge. Bounds synchronization keeps it hidden while the
dialog is opening/open, including on resize and activation. Closing schedules
normal bounds restoration. Hiding does not unload or destroy PCG authentication.
Detached PCG windows remain separate. PCG's Twitch sign-in is a separate flow.

The compact header uses one account selector and an accessible status region;
removal is inside Account options and still requires the existing confirmation.
The options menu closes on outside pointer interaction, focus leaving it or
Escape. Embedded PCG bounds are hidden while this menu is open, without unloading
the view, and restored on closure through the existing bounds owner.

The compact PCG header shows its title/status and a PCG options details menu.
The existing game-specific Twitch sign-in and separate-window actions live in
that menu. Escape, outside pointer interaction and focus leaving close it;
choosing an action closes it before invoking the existing bridge operation.
While open, normal bounds synchronization hides the embedded native surface so
it cannot cover the DOM menu. Closing restores bounds without reactivation,
navigation or replacement of that view. Separate-window behavior remains owned
by the existing main-process PCG manager; resizing/collapsing is separate work.

`TmcPcgStatus.twitchAuth` reports only local browser-session evidence: unknown,
signed-out or session-present. The PCG manager queries the auth-token cookie's
presence in the active view's account partition and observes relevant cookie
changes (including logout/expiry). Cookie values never reach logs or renderer.
Unknown lookup errors do not imply revoked authentication and retain the panel.
View/partition/profile and query revisions reject late results; listeners are
released on replacement/destruction. Activation revisions also reject old panel
loads before publishing status for a different account.

An active panel without confirmed session evidence shows an explicit game-login
prompt above its host. With a session present, that prompt is hidden and sign-in
remains in PCG options. Both actions use the same existing popup operation.
Presence is not a live Twitch validity check, account-name verification or PCG
extension authorization. Any extension-specific consent remains in its own UI.

Channel navigation is an explicit Open channel form. Refresh history is a
separate chat-toolbar action. The chat controller owns the opened channel and
updates its label; Refresh, Favorite and composer submission use that committed
channel, not unsubmitted navigation text. Account/channel persistence and main
IPC services retain their existing ownership.

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
removal. Logout and each session-restore request have a ten-second HTTP timeout,
including response-body consumption.
A late logout completion does not change the subsequently selected account.
Save/delete operations on the application's secure-store instance are serialized
to avoid overlapping read-modify-write operations restoring removed credentials.

Restore failures preserve saved authentication and leave that account inactive
for this run. Network/timeout/HTTP errors, malformed responses and profile/user
identity mismatches do not delete credentials or prevent another account from
restoring. The broker returns data without selecting an account; the initiating
profile and user identifiers must match before saving and activating it.
HTTP 401/403 is classified as a rejected restore, but is not deletion authority:
the backend's definitive revocation contract is not available in this repository.
Explicit removal remains the deletion path. A later restart retries saved credentials.

A valid restore is saved before activation; local save failure preserves the
previous file and leaves the account inactive. Server-side token rotation followed
by a local save failure cannot guarantee the old token remains accepted by the
provider. Storage read/decryption/schema failures preserve the file and allow
startup to continue signed out; a later login cannot silently replace an unreadable store.
Finalizing a new login likewise saves and registers the session before selecting
it. Failed persistence leaves the previous account active (or remains signed out)
and exposes a fixed storage-error message, not decrypted content, to the renderer.

Startup keeps the saved active-account preference unresolved while durable
sessions populate the registry. Restores with `makeActive: false` do not select
or persist intermediate fallback accounts. The composition resolves selection
once the restore batch completes, then synchronizes compatibility authentication.
An available preferred account wins regardless of restore order. Otherwise a
restored account is selected as fallback; if none restores, the app remains signed
out without overwriting the saved preference. Explicit selection, new login and
account removal still resolve selection through the existing registry methods.

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

- Restores still run sequentially before window creation. The timeout is ten seconds
  per request, not a global startup deadline; there is no automatic retry in the
  same run. Offline-account/retry and storage repair/recovery UI remain separate work.
- Real PCG views and hold metadata have separate owners. Replacement detaches
  the old view without an explicit close in that path; verify and fix disposal.
- Preload and renderer bridge types duplicate the contract and retain aliases.
  Consolidation must update callers without assuming backend compatibility.
- `npm test` covers account removal through the actual application composition,
  temporary persistent storage, and service recreation, with controlled external
  substitutes. `.github/workflows/quality.yml` configures Windows quality checks
  with Node 24.18.0, `npm ci`, and separate test/typecheck/zero-warning lint steps.
  Baseline hosted execution passed for PR #1 at `ca9c0f2`; that result does not
  cover later changes. The first separate Windows E2E run failed during driver
  negatives because raw short TEMP paths disagreed with canonical cleanup paths;
  guard/cleanup/scenario steps were skipped. Canonical creation now preserves
  strict cleanup identity checks. The next hosted run at `4a0ee1c` passed driver
  checks but failed during Electron guard bootstrap: non-native synchronous
  realpath retained a short TEMP ancestor. Electron now uses `realpathSync.native`
  for profile and parent checks; the guard suite exercises a real short-TEMP child
  process. Hosted run
  [44054285201](https://github.com/unouidol/TwitchMiniChatDesktop/actions/runs/44054285201)
  passed quality checks, driver 4/4, guards 5/5, cleanup 12/12 and the full
  synthetic UI/restart scenario at `01ee0be`, with native short-TEMP checks not
  skipped and the owned profile removed. Later changes need their own evidence.
  Real Twitch login,
  protected packaging, broader account switching and PCG resources remain separate.

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

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow's permissions,
action pins, reproduction steps, and distinction between local and hosted checks.

`npm run lint` checks TypeScript/TSX and MJS with zero warnings allowed
(`--max-warnings 0`) and reports unused suppression directives as errors
(`--report-unused-disable-directives`). It does not cover the CommonJS test
scripts or establish that installation, runtime, and build tools are warning-free.

`npm test` compiles the main-process composition to ignored `.test-build/` output
and runs account-removal and session-restore regressions using Node's built-in test runner with
experimental module mocking. The experimental warning remains visible. No new
dependency is needed. HTTP is substituted or served by a loopback fixture; unexpected real WebSocket
construction is blocked; tests use temporary stores and synthetic credentials.
No Twitch account, backend credentials, or `local.properties` is required.
Installation can contact package/download services. This mocked unit suite does
not verify real Electron encryption, the running renderer, or provider authentication.

`npm run test:e2e` adds one Windows-only, synthetic scenario using real Electron,
the production renderer/preload/IPC/removal service and OS-backed safeStorage.
Its separate bootstrap isolates user/session paths before importing production
services, rejects real runtime configuration imports, and supplies loopback
backend/IRC transports. The IRC endpoint is an explicit main-process configuration
dependency; when omitted, production retains its original Twitch URL. No renderer
can select this endpoint. The bootstrap and fixture are outside normal startup.
The local artifact is a Vite bundle, not a packaged release; all production fuse
and window settings remain unchanged. See the contributor guide for cleanup,
diagnostics, tool selection, network guards and coverage limitations.

The separate `Windows Electron account-removal E2E` CI job now configures the same
synthetic scenario and existing driver/guard/cleanup checks with Node 24.18.0.
Provisioning exports only the integrity-verified explicit path through `GITHUB_ENV`;
the workflow retains scoped diagnostic artifacts, not profiles, stores or binaries.
Local command reproduction and a configured workflow do not establish a hosted
pass. Neither this integration nor artifact collection changes production security,
authentication, dependency-remediation status or PCG ownership.

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
