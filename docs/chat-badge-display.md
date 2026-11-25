# Chat badge display

Starting with the local dev.21 candidate, both historical and live messages omit
badge icons and labels. Author names/colors, timestamps, emotes, links and reply
controls retain their existing behavior.

During real-account acceptance of installed dev.20, the user reported textual
badge labels on live messages and no badges in history. The user requested icons
consistently, or removal if that could not be provided. Source inspection of the
backend's history store and endpoint confirms the current contract contains user,
text, timestamp, emotes and message ID; it does not preserve original badge roles.
Current live roles cannot safely be applied retrospectively to historical messages.
No server change or deployment is included in this desktop correction.

The old renderer intentionally retained text when badge definitions or images were
unavailable. The exact provider failure behind the user's missing live icons was
not established; this change implements the requested removal rather than claiming
to repair that provider. It removes the badge catalog owner/IPC/preload capability,
renderer slots/enrichment and CSS, avoiding unused background requests. Existing
bounded transport metadata and parsing remain compatible and are not displayed.

The synthetic Electron scenario supplies badge identities in history and actual
IRC traffic, verifies neither labels nor images appear, preserves text and supplied
author colors, checks account transitions and unchanged PCG bounds, and asserts no
chat sends. The local bridge has no badge catalog capability. The network guard and
fixture no longer admit badge-provider endpoints, so an unexpected request fails.
Removed unit tests exercised the retired catalog/controller/IPC; transport parser
coverage remains, and the full existing chat/emote/account/player suite still runs.

Manual dev.20 observations already confirmed installed startup, two saved accounts,
A/B/A switching and online selected-account restart, history/emote images, channel
switching, picker search/insertion and separate PCG login. PCG also returned on A
after account switching without login, and the user reported PCG working after an
app restart. That final reply did not separately reconfirm the chat account identity.
Offline startup and real live-video acceptance remain unperformed. Dev.21 needs its
own installed visual check after isolated tests and packaging; earlier manual
acceptance does not prove this updated candidate.
