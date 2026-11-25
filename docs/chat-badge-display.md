# Chat badge icons

The desktop restores badges as icons only in history and live chat. Unknown
definitions, missing metadata and image failures remain hidden; no role labels
or broken-image alt text occupy the feed. Titles and accessible icon names remain
available. Original user colors, emotes, replies and search keep their owners.

## Backend alignment

Backend main includes commit
[`b89fcba4972d05d4a1680a2462f20d44bbb62792`](https://github.com/unouidol/tmc-backend/commit/b89fcba4972d05d4a1680a2462f20d44bbb62792)
(history badge persistence), also present in the inspected local checkout at
`9abfbdf1ff98293e189c87cbbf0db618497fa55c`. Its commit records production deployment
on 2026-11-25; this desktop task does not independently verify server deployment.

The IRC parser and ingestion callback retain `badges`, `badge-info` and `color`;
the store adds optional columns and the endpoint returns:

```json
{
  "badges": "moderator/1,subscriber/12",
  "badge_info": "subscriber/14",
  "color": "#1E90FF"
}
```

Missing values and pre-migration rows return null. The existing desktop parser
already accepts raw badge strings and colors. Icon identity comes from `badges`,
never `badge_info` (subscriber duration is not the icon version). Old messages
without identities cannot acquire historically accurate roles retrospectively.
No backend edit, deployment or authenticated production request is performed here.

## Desktop ownership and failure behavior

Dev.21 removed badge display after installed dev.20 showed live textual labels and
no historical badges. The historical source contract then lacked roles. The new
backend contract removes that blocker; this change selectively restores the
catalog/IPC/renderer owners, without reverting shared PCG/video sessions or
restoring the unwanted text fallback. The original real provider failure is not
claimed fixed merely because the backend now preserves metadata.

Main captures the selected account/token, validates identity/channel, loads global
and channel definitions through the official [Twitch badge APIs](https://dev.twitch.tv/docs/api/reference/chat#get-channel-chat-badges),
and lets channel definitions override matching global versions. Requests reject
redirects and stale identities, share a ten-second deadline including body reads,
coalesce concurrent loads, bound cache/pending entries, and cool down provider
failures without deleting authentication. Diagnostics identify the request stage,
HTTP status when available and deadline expiry without logging credentials or
provider bodies. Only fixed HTTPS Twitch badge CDN URLs cross the trusted IPC.

The renderer enriches at most 1000 pending containers, with no full-feed scan.
Slots and containers start hidden, small images load eagerly so hidden elements
can finish fetching, and only successful loads reveal icons. Unknown definitions
and load errors retain no visible text. Empty image alt avoids broken-image labels;
role/aria-label on the visible slot provides an accessible name. Reset/disposal
invalidates catalog and image callbacks across account/channel changes.

## Verification boundaries

Unit checks cover production-shaped history (including different badge/subscriber
duration values and null legacy rows), catalog isolation/validation/cooldown,
trusted IPC, bounded pending DOM references and image load/error/stale callbacks.
Synthetic Electron replaces only provider/image transports, exercising actual
image events in both feeds, unknown/failed icons, channel-specific definitions,
account changes, supplied author colors, unchanged PCG views/bounds and no sends.
The real-WebSocket guard and temporary-profile ownership remain in force.

Local/hosted checks and real installed observations must be reported separately.
Synthetic icons do not prove that the real Twitch catalog/CDN is reachable or that
the deployed history endpoint returns populated badge values. Installed dev.22
still omits badges until a separately built and installed candidate includes this
change. Real acceptance must observe newly stored historical messages plus live
messages; older null rows are expected to have no badges.

Local verification with Node 24.22.3/npm 11.19.1 passed 217/217 behavior tests,
TypeScript and zero-warning lint. The complete synthetic Electron scenario passed
at `evidence-tmc-electron-e2e-9h9URu`; owned processes and its profile were removed.
The screenshot shows successful icons in both feeds, with unknown/failed icons
absent. Independent defect review found no confirmed actionable defect.
Initial check failures were a missing test-build entry for the production slot
builder and browser globals in the new E2E callback; both were corrected without
weakening assertions. Hosted results and installed/provider acceptance remain
separate. The user authorized a local dev.23 package after the source-only increment.
Hosted run 45588946056 passed both Windows jobs at source commit
`0c0a54382942ff7cd2c18492de717cd374aea859`. The later version-stamped candidate
requires its own exact-head checks and protected-artifact verification.

Installed dev.23 acceptance subsequently failed: the user saw no badges in either
feed. A manual launch of the verified installed artifact, with only sanitized
badge-warning fields retained, observed global-definition rejection after HTTP
200 and no deadline expiry (`badge-live-diagnostic-4MRrP2`). This establishes a
catalog parsing failure, not its exact invalid field. More precise validation
reason codes are allowlisted before logging; provider bodies, token values and
untrusted exception text are never emitted. This diagnostic increment passes
218 behavior tests, typecheck and zero-warning lint. The real field-level result
and corrective change remain pending; it does not claim badge acceptance passed.

The next scoped manual package identified `Invalid badge set ID length` after a
successful global HTTP response (`badge-package-diagnostic-RZVF4B`). The old shared
parser allowed only 64 characters. The correction raises the bounded ASCII
set/version identifier length to 256, preserving its character grammar, raw tag /
entry / catalog bounds and fixed image URL validation. It does not ignore invalid
entries or silently downgrade catalog failures. Safe failure codes also distinguish
set versus version and type/length/characters without logging the provider value.
The diagnostic did not expose the real ID or its exact length; real acceptance of
the larger bound remains required rather than inferred from a synthetic fixture.

Local checks passed 219 behavior tests, typecheck, zero-warning lint and the full
Electron scenario (`evidence-tmc-electron-e2e-vueFHG`, owned profile removed).
The provider fixture now includes an unused 89-character set ID: the prior parser
rejected the entire global catalog, while the corrected parser preserves normal
history/live icons. Unit tests cover long IDs and rejection beyond 256 characters.
Independent review found no confirmed defect in this delta. A separate dev.24
local candidate distinguishes this correction from the installed failing dev.23;
its packaging, hosted result and real provider acceptance need their own evidence.

The development diagnostic window was reported unusable; that experiment was
stopped. Manual diagnostics use the protected packaged rendering instead. The
launcher also stopped requesting hidden-window startup for the interactive app;
Windows then reported a visible main window. This tooling correction does not
claim to resolve the separate development-rendering observation.
