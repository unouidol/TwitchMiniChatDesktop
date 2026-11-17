# Electron E2E dependency security review

Follow-up (2026-11-14): the E2E launcher now requires explicit,
archive-provenance-pinned ChromeDriver verification and an isolated empty WDIO
cache. See [setup and limitations](../../CONTRIBUTING.md#explicit-verified-chromedriver).
The snapshot and recommendations below describe the preceding assessment;
bypassing acquisition does not resolve the recorded dependency findings.

Evidence follow-up (2026-11-14): the test now reads required,
completion-checked per-process application guard ledgers instead of emitting a
constant forbidden-traffic list. Separate local real-Electron negative probes
exercise the same guards. See [the current schema and boundaries](../../CONTRIBUTING.md#coherent-ui-and-observed-application-traffic).
This does not change the historical dependency audit below or establish OS-wide
network isolation, packaged-app coverage or dependency remediation.

## Evidence snapshot — 2026-11-14

Investigation only; no dependencies, application/test behavior, CI, commits or PR
metadata changed. Host: Windows, Node **24.18.0**, npm **12.0.1**, registry
`https://registry.npmjs.org/`. This npm differs from the documented bundled
11.16.0; results below describe the actual investigation environment.

Baseline: `codex/account-removal-ci` at
`ca9c0f22c9335a901fcae5759550f307eae50f81`. Current: uncommitted E2E work on
`codex/electron-account-removal-e2e`, adding direct development dependencies
`webdriverio@9.31.9` and `ws@8.23.0`. Structured lockfile comparison confirms
**200 added entries, none removed, and no version/resolved/integrity changes to
pre-existing entries**. This does not mean every other lockfile field is identical.

Manifest/lockfile-only copies in an isolated temporary directory were audited
back-to-back with `npm audit --json --package-lock-only`: baseline at
12:31:48–12:32:01 UTC, current at 12:32:01–12:32:07 UTC. Both returned exit 1
for findings, not an execution error. No install or lifecycle script was run.

| Lockfile | Low | Moderate | High | Critical | Package records |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 3 | 4 | 38 | 1 | 46 |
| Current | 3 | 8 | 47 | 1 | 59 |
| Delta | 0 | 4 | 9 | 0 | 13 |

Deduplicating object-valued `via` entries by advisory URL gives **110 baseline
and 114 current advisory IDs**; all 110 common advisory objects are identical.
Thus the comparison observes the same advisory content for shared findings,
although sequential live-registry requests are not an immutable database snapshot.
The thirteen additional package records are not thirteen independent flaws:

- High: `@puppeteer/browsers`, `@wdio/config`, `@wdio/utils`, `basic-ftp`,
  `get-uri`, `pac-proxy-agent`, `proxy-agent`, `webdriver`, `webdriverio`.
- Moderate: `archiver`, `archiver-utils`, `glob`, `zip-stream`.

There are **four new advisory IDs in two newly introduced root packages**,
plus additional paths to existing `extract-zip` and `minimatch` findings.
`ws@8.23.0` has no finding in this snapshot. The unchanged critical `tar@6.2.1`
build-tooling finding is baseline debt, not a new E2E critical vulnerability;
it is distinct from the added `tar-fs@3.1.3` package.

## Prioritized root causes and reachability

Paths below are installed versions, checked against the lockfile, installed
sources and summarized `npm explain ... --json` results. Severity is the
advisory classification, not a claim that this application is exploitable.

| Root cause / official sources | Installed path | Invocation and conditions | Supported remediation / limits |
| --- | --- | --- | --- |
| **High, existing root with a new download path:** ZIP symlink escape / writes outside destination, [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3); [upstream patch PR](https://github.com/max-mapper/extract-zip/pull/160). | `webdriverio@9.31.9 → @wdio/utils@9.31.9 → @puppeteer/browsers@2.13.2 → extract-zip@2.0.1 → yauzl@2.10.0`. Shared with baseline Electron tooling. | Driver setup is used. On a cold Windows cache it downloads/extracts a ZIP; a malicious archive is required. Compromised distribution, configured mirror, proxy or cache are threat conditions, not observed incidents. Existing final-run logs show **cache hits**, not fresh extraction. Windows symlink privileges/filesystem behavior affect impact and were not tested. | No patched `extract-zip` release; registry latest remains 2.0.1. Puppeteer browsers 3 replaces ZIP extraction with OS tools, outside WDIO 9's declared `^2` range. Explicit driver provisioning can avoid this E2E execution path, but does not remove the package or baseline exposure. |
| **High + two moderate, new root:** FTP listing CPU exhaustion, malformed MLSD crash, and control-character password/download-path crash: maintainer advisories [c475](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-c475-qrg2-pj4r), [5pm8](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-5pm8-86m8-9m6r), [r4jh](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-r4jh-29pc-gfqr). | `@wdio/utils@9.31.9 → @puppeteer/browsers@2.13.2 → proxy-agent@6.5.0 → pac-proxy-agent@7.2.0 → get-uri@6.0.5 → basic-ftp@5.3.1`. | Downloader constructs `ProxyAgent`; FTP is **conditional**, not inherent to HTTPS downloads. A selected `pac+ftp:` proxy configuration fetches a PAC file through FTP. `get-uri` calls `access`, `lastMod`, falls back to `list` if MDTM yields no date, then `downloadTo`. Thus both listing parsers have a concrete conditional caller; decoded malicious URL credentials/path can reach the third issue. No FTP/PAC invocation established; proxy credential values were not inspected. | Fixes respectively 6.2.1, 6.2.4 and 6.2.3; 6.2.4 covers these three, latest is 6.2.6. Installed get-uri 6.0.5 requests basic-ftp `^5.0.2`; latest get-uri 8.0.1 still requests `^5.3.1`. Neither range admits the fixed major. Owner changes/removal of this optional path are required, not an override. |
| **Moderate, new root:** cancellation fails to stop filesystem traversal, [glob maintainer advisory](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4). | `webdriverio → @wdio/config@9.31.9 → glob@10.5.0`; also `webdriverio → archiver@7.0.1 → archiver-utils@5.0.2 → glob@10.5.0`, including `zip-stream@6.0.1`. | Requires a traversal using cancellation as a resource budget, with costly patterns/tree. WDIO's config glob helper uses `globSync` for spec discovery; standalone `remote` uses validation, not spec discovery. This test supplies no globs, AbortSignal budget or archive directory traversal. Vulnerable operation is **not established** in this scenario. | Fixed in glob 14.0.2; both owners request 10.x. WDIO 10 config requests `^14.0.2`; archive owner changes must be assessed separately. No compatible 10.x fix identified. |
| **Moderate, inherited advisory with additional copies:** pattern preprocessing amplification, [reviewed advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), [maintainer report](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). | New `minimatch@9.0.9` under `@wdio/config` and `archiver-utils`, through glob 10.5.0; baseline already has a copy under `@electron/universal`. | Requires adversarial patterns and relevant optimization (`optimizationLevel >= 2` in the report). No such input/call was established. `archiver` is imported by WDIO but instantiated by `uploadFile`, unused here; import is not proof of traversal. Maintainer report names 10.2.6, whereas reviewed audit range is `>=7 <11.0.1`; exact behavior of 9.0.9 was not experimentally reproduced. | Fixed 11.0.1, outside glob 10's minimatch 9 range. WDIO 10's archiver 8 still uses `readdir-glob ^3.0.0 → minimatch ^10.2.2`: residual affected range. `readdir-glob@4.0.0` uses `^11.0.1`, but is outside archiver's range. Do not force it. |

Installation and local operation are separate surfaces:

- Added packages with lifecycle scripts are `edgedriver@6.3.1` and
  `geckodriver@6.1.1`. Their download entry points require their respective
  `*_AUTO_INSTALL` variables. They are unnecessary for this ChromeDriver scenario,
  but not optional lockfile dependencies removable by `--omit=optional`.
  Existing npm `allowScripts` policy must not be broadened; no install was rerun
  to establish behavior under other npm versions or environments.
- `tests/e2e/account-removal.mjs:80` invokes public `remote`, specifies the real
  Electron binary, but no driver binary. Installed
  `@wdio/utils/build/node.js:223` and `:358` establish automatic driver setup,
  including cache checks; Puppeteer `fileUtil.js:56` uses `extract-zip` on ZIPs,
  and `httpUtil.js:63` uses ProxyAgent. Local WebDriver commands run after setup
  against the loopback driver; they do not themselves require FTP or ZIP extraction.
- No new dependency is imported by production startup. Packaging runtime inclusion
  was not tested. Dev-only placement does not protect installation/build machines,
  nor does a production-only audit assess Electron's bundled Chromium/Node runtime.
  Electron/Forge runtime security remains a separate baseline review.

## Tool choice and smallest credible options

9.31.9 matches the exact dependency of the evaluated Electron service 10.4.1;
the final implementation removed that service and uses standalone `remote`.
This explains compatibility selection, **not a security-fix selection**. Its
Node `>=18.20.0` engine admits the tested host. Official
[version policy](https://webdriver.io/versions) now marks v9 **Maintenance** and
v10 **Stable**. Registry dist-tags are v9=9.33.1 and latest=10.2.0.
Candidate dependency ranges were read from official npm registry metadata with
`npm view`, including [WDIO 9.33.1](https://registry.npmjs.org/webdriverio/9.33.1),
[browsers 3.2.7](https://registry.npmjs.org/@puppeteer/browsers/3.2.7),
[archiver 8.0.0](https://registry.npmjs.org/archiver/8.0.0) and
[get-uri 8.0.1](https://registry.npmjs.org/get-uri/8.0.1).

1. **Targeted maintained-v9 refresh:** [9.33.1 release notes](https://github.com/webdriverio/webdriverio/releases/tag/v9.33.1)
   retain Puppeteer browsers `^2.13.2` and config glob `^10.2.2`, so do not resolve
   all roots. Its OS-unzip change is documented for Node 26, not evidence that
   Node 24 avoids extract-zip. Its new engines require Node 24.22.1 or newer
   within 24.x, due the upstream CA-store security floor; current 24.18.0 is below
   it. A refresh is not a drop-in security solution on the current runtime.
2. **Documented reduced invocation:** [explicit driver binary](https://webdriver.io/docs/driverbinaries)
   alongside the existing Electron binary bypasses automated driver acquisition.
   Source confirms both driver pre-setup and launch honor it. A separately
   provisioned, version/integrity-verified official driver can remove the most
   plausible E2E ZIP/PAC execution path without changing Electron/Forge. It does
   **not** shrink WDIO's mandatory graph or clear its audit findings. No documented
   switch was found that removes archiver/config/Puppeteer dependencies from the
   published standalone package; do not import undocumented internal modules.
3. **Supported major migration candidate, not a proven fix:**
   [WDIO 10.2.0](https://github.com/webdriverio/webdriverio/releases/tag/v10.2.0)
   requests browsers `^3.2.1`, glob `^14.0.2`, archiver `^8.0.0`.
   [Browsers 3 release notes](https://github.com/puppeteer/puppeteer/releases/tag/browsers-v3.0.0)
   remove extract-zip and make proxy-agent an optional peer; 3.2.7 metadata confirms
   that. This could remove the mandatory FTP path, but npm peer resolution/proxy
   needs must be checked, not assumed. Archiver 8's readdir-glob/minimatch issue
   remains. The [migration guide](https://webdriver.io/docs/v10-migration) requires
   newer host Node (24.22.1 minimum in 24.x) and identifies API/selector changes.
   A full isolated resolution/audit and actual Electron restart runs are needed;
   no candidate graph was installed or validated here. Electron/Forge need not be
   upgraded merely to evaluate the client, but compatibility is not yet proven.
4. **Different automation:** not justified yet, since renderer WebDriver works.
   [Playwright Electron](https://playwright.dev/docs/api/class-electron) remains
   experimental and documents the disabled-inspector-fuse constraint. It is not
   a stable, equivalent security remediation. No protection should be relaxed.

Audit's `fixAvailable` suggestion of **webdriverio 8.6.1** is a major downgrade,
not a supported recommendation: v8 is retired by the version policy; its metadata
adds old devtools/Puppeteer and minimatch `^7`, and it predates automatic driver
setup introduced in 8.14. It does not establish removal of these root causes.
No complete supported refresh eliminating all E2E-added affected paths has been
established. Neither retaining the current graph nor a migration is risk acceptance.

## Evidence quality at assessment time

Descriptions and source locations in this section refer to the assessment
snapshot, not the updated guard instrumentation linked in the follow-up above.

At the original assessment, `account-removal.mjs` wrote `forbiddenTraffic: []` literally.
It is not an observed traffic ledger. Actual assertions first require an empty
fixture failure collection and absent/empty bootstrap `failures.log`.
`bootstrap.ts:46` guards Node fetch and WebSocket destinations; its session hook
guards Chromium requests, cancelling and failing on unexpected destinations.
These are meaningful guards for those APIs, not a whole-process firewall.
They do not cover arbitrary Node sockets, the WDIO parent/downloader, or prove
that every startup request is intercepted. No forbidden traffic incident was
established by this review; constant reporting alone does not invalidate guards.

The assessment recommended replacing the constant with sanitized observed denied events and
per-transport installation/call counters, or explicitly name an asserted
invariant and record the ledgers it checked. Keep driver/setup traffic distinct
from application traffic. Validate guard failures using local synthetic requests,
not external Twitch/backend calls; do not turn missing evidence into an empty list.

## Recommended next implementation task

**Make E2E driver provisioning explicit and fail-closed**, as a bounded exposure
mitigation while owner-level dependency fixes are evaluated separately.

Scope: test launcher/setup documentation only, using public
`wdio:chromedriverOptions.binary`; no application, Forge, dependency overrides,
CI, credential, fuse or unit-runner changes. Provision the exact matching driver
from an official distribution outside scenario execution, with recorded provenance
and independently checked integrity; do not reuse an unverified shared cache.

Acceptance criteria:

1. Missing, mismatched or tampered driver fails before Electron starts; there is
   no fallback download. Both Electron and driver binaries are explicit.
2. With an empty test-owned WDIO cache, demonstrate no downloader/proxy acquisition
   calls during the scenario, using local instrumentation rather than blocked
   live external probes. Keep real preload/IPC/storage and existing traffic guards.
3. Run the synthetic UI/removal/full-exit/restart scenario three separate times
   with fresh isolated profiles and real safeStorage, no retry-to-pass. Run unit
   tests, typecheck, zero-warning lint and diff checks; preserve failure evidence.
4. Manifest/lockfile remain unchanged; report the same outstanding audit roots
   explicitly. This task mitigates invocation, **not** dependency remediation.

Afterwards, qualify the maintained Node/WDIO update in an isolated copy, resolve
the upstream archive-owner range constraint before claiming complete remediation,
and re-audit baseline/candidate together. No forced transitive majors or blanket
tool replacement. Network-report evidence repair was a separate follow-up, now described above.

## Verification and limits

Performed: paired lockfile-only audits; structured graph/advisory comparison;
`npm explain` for basic-ftp/glob/extract-zip/minimatch; read-only `npm view` for
installed and candidate owner versions/engines; installed-source and existing-log
inspection; official advisory/release/documentation link checks; diff whitespace
and preservation checks. Temporary comparison files were isolated from profiles
and installation. No credentials or `local.properties` were read, no application
connections started, and no dependencies installed or modified.

No E2E, application tests, typecheck or lint were rerun: this task changes only
documentation. The independent synthetic E2E pass is prior evidence, not a run
performed here. No exploit demonstrations or exhaustive dynamic reachability
analysis were attempted. Packaged-app testing, real Twitch authentication,
full cryptographic assurance and PCG retention remain explicitly separate.
