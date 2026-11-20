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
- Run `npm run test:e2e` for the Windows synthetic Electron UI/restart scenario.
  Keep its marked temp profile and local-only transports isolated; it is not a
  real-login or packaged-release test. The separate Windows E2E job is configured;
  hosted run 44054285201 passed quality checks and the full E2E scenario at
  `01ee0beea53d538ca5a87d3bddb2ee9010e0dfb1`, including native short-TEMP
  coverage. Later changes need their own hosted result before claiming CI success.
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
- Follow the delegated Git authority below. Release publication and repository
  settings changes still require explicit authorization.

## Git ownership and repository maintenance

- The user delegates day-to-day Git organization and maintenance to the coding
  agent. Take responsibility for a coherent, recoverable history and an orderly
  repository; do not leave this coordination to the user. Within requested work,
  this includes feature-branch creation, logical commits, normal pushes, draft PR
  creation/updates and verified merged-branch cleanup without repeated approval.
- Before Git mutations, inspect the branch, working tree, index, upstream and
  relevant PRs. Preserve existing/unrelated work and unpublished commits. Verify
  the actual remote integration branch; current documentation names `main`.
  Treat "stable" as a release/integration target to verify, not permission to
  invent or rename a branch. Do not add permanent development/release branches
  without an actual workflow need.
- Use short-lived, descriptive `codex/<topic>` branches and reuse a suitable
  existing branch/PR for the same change. Keep unrelated topics separate. If PRs
  depend on one another, record their bases and merge order explicitly.
- Checkpoint completed, validated increments promptly instead of accumulating
  multiple features in an uncommitted working tree. Keep each commit coherent
  and revertible, including its relevant tests/docs. Use concise English commit
  subjects describing the change; do not fabricate independent commits by
  splitting tightly coupled code into broken intermediate states.
- Inspect the actual staged diff, new files and lockfile before every commit;
  stage only the intended changes. Keep secrets, authenticated profiles,
  generated binaries, dependencies and temporary evidence out of history.
- Push ordinary feature-branch updates for remote recovery and keep draft PR
  titles/descriptions aligned with final scope, dependencies and observed checks.
  Distinguish local results, exact hosted commit/run evidence and manual checks.
  Never call work ready because a draft exists or an older CI run passed.
- Integrate into `main`, a verified stable/release branch, or publish a release
  or tag only with explicit user authorization, appropriate review and passing
  required checks for the final candidate. Resolve failures at their cause;
  never bypass branch protections or weaken checks to obtain a merge.
- Prefer follow-up commits and `git revert` for shared history. Do not force-push,
  rewrite published history, retarget release tags, discard work or delete
  unmerged/unique work without explicit authorization. Do not change repository
  protections, visibility, access or global Git configuration as routine cleanup.
- After an authorized merge, synchronize the integration branch without losing
  local work and remove only branches verified merged with no unique/unpublished
  work or dependent PR/worktree. Preserve historical backup/spike branches until
  their ownership and purpose are established. Report branch/commit/PR, CI status
  and outstanding work accurately; never claim a clean tree without checking.
- Use the [Git workflow in CONTRIBUTING.md](CONTRIBUTING.md#git-workflow) for the
  operating sequence and official reference material.

## Review findings

Report concrete locations, triggering sequences, and consequences. Flag
cross-account/stale results, destructive handling of transient failures, unowned
resources, duplicate ownership, hidden diagnostics, and success-shaped failures.
Separate confirmed defects from hypotheses; avoid style-only review findings.
