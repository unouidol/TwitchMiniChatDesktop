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

`npm run lint` runs ESLint on `.ts`/`.tsx`, with `--max-warnings 0` and
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

Hosted GitHub execution remains unverified until an authorized remote run.
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
Mocked tests do not verify OS-backed encryption, the running renderer, real login,
broader account switching, or PCG panel/resource behavior.

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
- Dependency security findings remain unresolved and require scoped assessment
  and remediation. No dependency assessment document is included in this branch;
  production-only audit results do not establish Electron runtime/build safety.
- The development-build `pathToFileURL` warning needs separate development and
  packaged-path verification; do not remove its production-path import blindly.

Keep operational rules in AGENTS, current boundaries in the architecture map,
and task evidence in PR/commit descriptions. Avoid duplicate policies, generated
task diaries, or claims that proposed safeguards are already implemented.
