# Welcome and Windows release checks

The local welcome page opens once on first use, after an installed version
increase, or once for a newly cached newer stable release at a subsequent start.
It can always be reopened from the header's **••• → About TMC** menu. It includes
desktop sign-in/channel guidance, the shared PCG/video web login, the project website,
Discord (`#tmc-ticket`) and voluntary Ko-fi support. Public community links and
the welcome structure follow the Android project's `welcome` package and
`ProjectLinks.kt`; Android application behavior is not imported.

This is bundled local DOM, not a remote website with access to the preload.
Before showing the dialog, native PCG/video surfaces are hidden, with the player
muted as needed; closing restores bounds/audio without destroying sessions.
Welcome initializes independently of chat history. A failed initial opening
does not retry itself indefinitely; the menu provides an explicit retry.

## One release source per platform

The existing site is `https://tmc.ircminichat.party/`, maintained in
`https://github.com/unouidol/tmc-site` and deployed on Cloudflare Pages. Its
Android version labels already query Android GitHub Releases. Desktop does not
need Cloudflare credentials or an additional server to use the same pattern:

- Desktop metadata: `https://api.github.com/repos/unouidol/TwitchMiniChatDesktop/releases/latest`.
- Stable tag: `vMAJOR.MINOR.PATCH` (legacy tags without `v` are also understood).
- Windows x64 asset: exactly `TMC-desktop-Setup.exe`, in uploaded state.
- Download: the matching versioned GitHub release asset, opened by the existing
  validated browser-link operation. No installer is downloaded or run by the app.

The site now uses that desktop endpoint alongside its independent Android endpoint.
Windows installer, release-note and SHA256SUMS links use GitHub's permanent
`releases/latest` routes, following future stable releases without a redeploy or
JavaScript. Keep the exact installer and checksum asset names in future releases.
An unsigned-package notice is visible beside the download, with no recommendation
to disable Windows protections. Update that notice when signing is introduced.
The first stable `v1.1.0` release and site update were authorized on 2026-11-26;
see [the publication record](releases/1.1.0.md). Future publication and repository
settings changes still require explicit authorization.

## Scheduling, failures and privacy

Main owns one account-independent `welcome.json`, using the existing atomic JSON
store. It records the last seen version, noticed update, validated public release
and attempt time. Writes are serialized by the welcome service; unreadable or
invalid state is preserved rather than silently overwritten. No authentication
is stored there. Snapshot sequence numbers reject stale renderer responses.

Automatic checks run at startup only for **packaged stable versions**, at most
once per 24 hours. Attempts are recorded before networking, including failed
attempts; a clock moved backwards does not disable checks indefinitely. Dev and
prerelease builds make no automatic request. **Check for updates** works manually
in these builds, coalesces concurrent calls and bounds attempts to one per minute.

The request carries fixed product User-Agent and GitHub Accept headers, no
account/session tokens, cookies or installation identifier. GitHub receives the
source IP and request time. A ten-second deadline covers fetch/body reading,
response size is limited to 256 KiB, redirects are rejected, and shutdown aborts
pending work. Only stable non-draft releases with the exact owned Windows asset
can yield a download. Tags and cached links are revalidated; release notes/HTML
are never rendered. 404 means no published stable release; HTTP/network/format
failures remain distinct from a successful up-to-date result, retaining previous
known metadata. A late result can update the menu/status without opening a modal
over an ongoing chat; an unseen available-update page waits for another start.

## Verification boundaries

Focused tests exercise numeric versions, strict installer identity, anonymous
transport, size/deadline failures, daily/manual bounds, coalescing, persistence,
offline/corrupt-file behavior, cancellation, trusted IPC and a persistent modal
opening failure. The Windows synthetic scenario substitutes only the public
metadata HTTP boundary with a local fixture; existing network guards remain
active. It covers welcome startup/menu/restart, update status and browser-boundary
download interception, visible/hidden controls and retained native PCG/video.
The packaged smoke test covers actual protected first-launch welcome and no
repeat on restart, without contacting GitHub or completing a real login.

These tests do not establish a live stable-release download, installer upgrade,
real OAuth/PCG/video acceptance, signing or website deployment. Publication-time
anonymous HTTP checks separately verified the stable `v1.1.0` installer route and
checksum bytes. They do not establish an installed-app cold-start update check,
installer execution or upgrade on another machine.
