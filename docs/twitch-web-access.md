# Shared Twitch web access

The user selected one web sign-in per account, shared by PCG and video. Installed
dev.21 played live video but used an anonymous memory partition, so it could not
use the viewer's web subscription context. Dev.22 replaces that playback storage
with the account's existing persistent PCG session.

## Ownership and identity

Main composition creates one TmcTwitchWebSessions owner using registered account
metadata. PCG and video request its native Chromium Session. Cookies are neither
copied nor read by this owner or the player. Chat OAuth tokens stay in the
existing main-process authentication owners and are not browser login cookies.
Signing into PCG/Twitch uses the existing manual Twitch web window. Use the same
Twitch identity as the selected chat account: stored web-cookie presence alone
does not establish that those two provider identities match.

Safe legacy IDs retain `persist:tmc-pcg-<profileId>`, preserving existing browser
sign-in storage. Other IDs use a disjoint `persist:tmc-twitch-web~<SHA256>` name
instead of the old lossy underscore mapping. Old ambiguous storage is never
copied or deleted; a noncanonical legacy account may require manual web sign-in.
Registered case aliases are rejected before native storage selection. No default
or guest session is used by PCG/video for an unknown account.

Video owns one media view, optional detached window and loopback document. Moving
the video retains its view; account changes replace it with the new account's
session. Close, errors, reload, stale requests and shutdown release those media
resources without clearing shared storage, cache, HTTP auth or connections; only
the explicit PCG sign-out and account removal clear that account's web storage. PCG
keeps ownership of its existing view and cookie-status subscription. Native
persistent sessions remain owned by Electron for the application lifetime.

## Security and provider limits

One permission owner denies web permission requests/checks once per native Session,
including camera, microphone, geolocation and storage-access. This preserves the
old player's denial policy and also applies explicitly to PCG/popup browsing;
the previous PCG default did not install these handlers. No permission is broadly
granted to work around embed authentication. If Twitch demonstrably requires a
permission, investigate an owned-view/origin-scoped policy rather than disabling
web security. Sandbox, context isolation, no renderer Node/preload bridge, blocked
player popups/navigation and the script-free restrictive iframe wrapper remain.

Twitch documents [web authentication for embeds](https://dev.twitch.tv/docs/embed/everything)
and [subscription benefits in authenticated embeds](https://discuss.dev.twitch.com/t/an-updated-twitch-embedded-player-viewer-experience/41718).
Benefits depend on the recognized account and channel settings. The app does not
set an ad-free flag, fetch alternative playback URLs, or claim that an OAuth scope,
native Session identity or a present cookie proves ad-free viewing. Recognition
in this Electron embed needs a user-assisted real Twitch check.

## Player authentication visibility

The player has no permanent shared-login guidance. The PCG panel retains its
conditional sign-in prompt when browser-session evidence is absent or unknown;
a present session hides that prompt, while manual sign-in remains in its menu.
The [documented player status methods and events](https://dev.twitch.tv/docs/embed/video-and-clips/)
expose playback state, not viewer authentication. A playback failure, blocked
autoplay, or a present cookie cannot reliably establish an anonymous or signed-in
viewer. No automatic request to renew PCG login is inferred from these signals.
The app does not inspect remote player DOM, private messages or token values to
manufacture that status. A documented provider signal would be needed for a
reliable player-triggered renewal prompt.

## Verification and acceptance

Focused tests check registered-account selection, PCG legacy-session reuse,
isolation and alias rejection, one permission owner, zero cookie-value reads,
player close/reopen/account changes without shared cleanup, genuine failure and
stale request handling. Synthetic Electron uses only marked temporary profiles,
local providers and synthetic cookies. It verifies actual persistent native
session identity, cookie presence without values, A/B transitions, intact PCG
views and browser-session restoration after active-video process exit/restart.

Those tests do not contact Twitch or validate subscriptions. The candidate's
manual checks must confirm existing PCG login after upgrade; correct A/B web
identity and separation; PCG continuity while opening/closing video; persistence
after restarting the app; real playback and subscription benefits on a channel
where the same account receives those benefits on twitch.tv. Prior dev.21 video
playback was partial acceptance, not proof of entitlement recognition. Publication
is separate and remains unauthorized.

Local Node 24.22.3/npm 11.19.1 checks passed 207 behavior tests, TypeScript,
zero-warning lint and the full synthetic UI/removal/restart scenario
(`evidence-tmc-electron-e2e-2saVAA`). The first adaptation attempt exposed a fixture
that seeded A too early and invalidated the signed-out guidance test; the fixture
now preserves that case and adds A's synthetic web session just before video.
Review also added explicit hiding/bounds gates for a rejected new identity and a
regression proving that the old view cannot be revealed by later bounds updates.
Packaging, hosted exact-head results and installed manual observations are recorded
separately; local passes do not establish those results.

On 2026-11-25, the user tested installed dev.24 with A selected and PCG connected,
reported correct player authentication on their own channel, and observed no
advertising during that test. This passes that scoped playback observation, not
a guarantee of future ad-free playback. Real A/B player web-identity isolation
and persistence after a video restart remain separate checks. The user resized
the separate player initially to approximately 903x607 outer pixels at 96 DPI.
Dev.25 used 900x600, but the user found that too small. After an explicit final
resize confirmation, the window measured 1010x698 outer pixels (994x659 client
area) at 96 DPI. Dev.26 uses those exact outer dimensions as its initial size.

The user accepted the dev.26 size but reported clipped Twitch bottom controls.
An isolated native probe reproduced the app defect without Twitch: after native
menu layout, the content root was 994x633 while the video view/iframe retained
994x659. The bottom 26 pixels therefore lay outside the parent. The script-free
wrapper's iframe itself fit its own viewport; increasing the outer window was
not the correction for this mismatch.

Dev.27 sizes detached video from its captured native content View and observes
that View's `bounds-changed` event, covering delayed menu/layout changes as well
as ordinary resizing. The listener is removed during return-inline/native-close
cleanup. A repeated isolated probe measured root, video viewport and iframe all
994x633 at the same 1010x698 outer size, and 884x535 after a 900x600 resize.
Before/after evidence is `player-layout-probe-h9gqaO` / `player-layout-probe-y1g44R`;
only the frame transport was replaced with a guarded loopback fixture, with no
real account or Twitch contact. Owned temporary profiles were removed. Real
installed Twitch control visibility still requires a separate user observation.

The clipping correction passed 221 local behavior tests, typecheck, zero-warning
lint, independent defect review and the complete isolated Electron scenario
(`evidence-tmc-electron-e2e-eDAhOn`), including stable native parent/video equality
and profile cleanup. The familiar WebDriver disconnect during `window.close()`
was emitted rather than filtered; process-exit, restart and cleanup assertions
passed. Hosted and protected-package checks for the final commit are separate.
