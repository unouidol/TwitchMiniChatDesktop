# Working agreements for coding agents

These instructions apply to the entire Electron/TypeScript repository.

## Before editing

- Read `CONTRIBUTING.md` and relevant parts of `docs/ARCHITECTURE.md`.
- Inspect the working tree; preserve unrelated work. Trace implementations and
  callers before changing APIs or adding services.
- State intended behavior, acceptance criteria, affected components, and checks.
  Separate current implementation, product requirements, proposals, and unknowns.
- Solve one coherent problem. Reuse existing owners; avoid parallel stores,
  controllers, speculative abstractions, unrelated upgrades, and backup sources.
- Keep business decisions in main-process services, IPC handlers thin, DOM work
  in the renderer, and shared contracts in `src/shared`. Update callers together.
- Validate untrusted input. Do not conceal mismatches with `any`, unsafe casts,
  TypeScript suppressions, or blanket lint disables.

## Account, security, and lifecycle invariants

- Keep access/session tokens in the main process, never renderer payloads, logs,
  fixtures, or committed configuration. Do not read credentials or
  `local.properties` unless explicitly needed for the authorized task.
- Preserve sandboxing, context isolation, web security, and disabled renderer
  Node access. Use explicit preload operations and validate IPC senders/payloads.
  Remote Twitch/PCG pages must not gain access to the privileged local bridge.
- Carry initiating account/channel identity through asynchronous work. Reject
  stale completions; never route results or actions to a newly selected identity.
- Switching accounts must preserve saved authentication, subject to provider
  validity, and keep PCG panels loaded. Do not introduce automatic panel closure,
  expiry, or eviction on selection. Existing retention gaps are not resolved.
- Keep PCG browser storage isolated per account. Browser and OAuth authentication
  are separate identities. Distinguish transient failures from revoked sessions.
- Every connection, view, window, timer, and subscription needs ownership and
  cleanup. Detaching is not destroying. Bound growing resources without violating
  the selection requirement; never replay chat/PCG commands on reconnect.

## Verification and handoff

- Use Node 24.18.0 and bundled npm 11.16.0. Run `npm test`,
  `npm run typecheck`, `npm run lint`, and `git diff --check` as appropriate.
  Lint enforces zero warnings and unused-disable errors, but excludes CJS tests.
- Preserve temporary storage, synthetic sessions, HTTP substitutes, and the
  real-WebSocket guard. Do not launch authenticated services for automated tests.
  Add focused behavior coverage for auth, isolation, persistence, and lifecycle.
- Fix diagnostic causes. Do not filter warnings, stub away unexpected errors,
  downgrade rules, broaden ignores, or bypass CI failures. Experimental module
  mocking still emits a warning; a stable-runner migration is separate work.
- Substitute external boundaries, not the behavior claimed by a test. Handle
  failures deliberately and preserve useful causes without exposing secrets.
- Inspect complete/staged diffs, including new files and actual lockfile content,
  for unrelated changes, obsolete paths, duplication, and secret exposure.
  Justify new dependencies and keep manifests/lockfiles consistent.
- Update documentation to match actual behavior. Report commands, versions,
  results, diagnostics, and missing evidence. Documentation does not complete an
  unperformed acceptance check; local passes do not prove hosted CI or real login.
- Commit, push, publish, or change repository settings only when authorized.

## Review findings

Report concrete locations, triggering sequences, and consequences. Flag
cross-account/stale results, destructive handling of transient failures, unowned
resources, duplicate ownership, hidden diagnostics, and success-shaped failures.
Separate confirmed defects from hypotheses; avoid style-only review findings.
