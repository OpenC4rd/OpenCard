# Agent Workflow

本文件只记录 agent 的行为约束：agent 该怎么工作、怎么沟通、怎么改动仓库。
工程约束（数据模型、持久化、渲染、UI token、命名、本地化、项目字体、项目图标集）不属于本文件，
见 `docs/工程规则.md` 与 `docs/UI_RULES.md`。

## Coding

- Develop incrementally; avoid bulk generation and mass file operations.
- Preserve unrelated worktree changes and keep the user in control of scope.
- Treat every successful edit as invalidating all older anchors for that file. Use only anchors from the latest read or edit response; re-read before editing any location not present in the latest anchor block.
- When editing templates, CSS, or object literals, verify tag, brace, and delimiter pairing in the full affected block. Do not stack corrective patches onto an unverified structural edit.
- If HMR reports a template, CSS, or transform error, stop subsequent edits and repair that error first. Re-read the complete affected structure after repair.

## Early-Stage Compatibility

- OpenCard is in early development. Backward compatibility is not a requirement: rewrite the rule documents, refactor or replace modules, and change persisted formats outright rather than preserving a second shape for old data.
- Do not add format-version gates, migration paths, or "this file is from an older version" rejections. Never fail a document for being an older or newer shape.
- When a persisted JSON format changes, read liberally: ignore extra and unknown fields, and fill in missing ones from the current defaults. Only data that cannot form a usable current projection at all — corrupt JSON, an unsafe archive path, an exceeded resource limit — may fail to load.
- The same tolerance applies in reverse: writing only the current shape is correct, and a reader that quietly drops what it does not know is behaving as intended.
- `docs/工程规则.md` owns the detailed projection and tolerance rules; this section is the agent-facing summary.

## Refactoring Discipline

- Prefer efficient, unified code paths over layered compatibility wrappers, parallel abstractions, and feature-local exceptions.
- When several resource types share the same invalidation or refresh meaning, route them through one shared entry point; do not add a resource-specific special case in a lower-level file operation.
- A refactor should normally remove obsolete branches, duplicated types, adapters, and special cases; do not accept a growing implementation merely because it preserves the old shape.
- Treat sustained line-count growth during a refactor as a warning signal. Stop and reassess the model, ownership boundaries, and single source of truth before adding more code.
- Every new abstraction must have a concrete complexity payoff. If the result is longer and harder to reason about without reducing behavioral duplication, redesign it.
- Keep current behavior explicit and singular. Do not leave dead transitional APIs, stale tests, compatibility paths, or duplicate representations after the new path is established.

## Production-First Debugging

- When a user reports broken runtime or UI behavior, inspect the production path and collect direct evidence before editing tests. For missing UI, check component imports/registration, rendered DOM, `v-if` conditions, CSS visibility/layout, and console errors first.
- Do not modify a spec until the production root cause is identified, unless the sole purpose is to create the smallest failing reproduction. State that purpose explicitly and do not make the test pass by weakening its assertions.
- Existing stubs, mocks, and shallow mounts are not evidence that real integration works. If a stub replaces the failing path, remove it or add a real-component integration test before claiming the issue is fixed.
- Use tests to confirm a diagnosed production fix, not as a substitute for diagnosis. A passing test does not establish that the reported behavior is fixed without runtime, DOM, HMR, or browser evidence when such evidence is available.
- Limit speculative loops: after one hypothesis or test fails to locate the issue, return to production evidence instead of repeatedly editing specs or adding mocks.
- Prefer the smallest production change that addresses the observed root cause. Do not perform adjacent refactors, broad test rewrites, or repeated full-suite runs while a focused runtime failure remains unexplained.
- Progress reports must distinguish observed facts, hypotheses, production-code changes, automated verification, and pending manual verification. Never describe unverified UI behavior as complete.
- During implementation, proactively report at each meaningful phase boundary (diagnosis complete, production edit complete, verification complete) and whenever a command stalls or work takes unexpectedly long. Do not remain silent through extended tool use; keep the user informed about current findings, changes, blockers, and next steps.

## Test Selection

- Read production code and its complete call chain before changing it. Running tests never substitutes for investigation.
- File size does not determine whether a test is needed. Keep a test only when it detects a meaningful failure.
- Do not test trivial configuration, constants, mappings, forwarding, names, or wording separately.
- Prefer existing feature tests. Do not create a test suite for a small helper or add speculative guards.
- Delete obsolete, duplicate, and implementation-detail tests. Keep minimal checks for data loss, cancellation, async ownership, parsing, and trust boundaries.
- Mocks must not replace the integration path being verified. Passing mocked tests is not runtime evidence.
- Run affected tests during development. Run the remaining full suite once after a repository-wide cleanup; do not repeat it without a new reason.
- A test must justify its setup and assertions. Reduce redundant fixtures and assertions instead of preserving scaffolding for its own sake.

## Release Notes

- The agent that implements a user-facing feature, fix, or removal must update `opencard-app/RELEASE_NOTES.md` for that specific change before handoff or commit.
- Each implementing agent owns only the factual release-note entries for its own work. When behavior is removed or reverted, that agent must also remove or revise any now-stale entry.
- Fixes made while an uncommitted or unreleased feature is still under development belong to that feature's entry, not to a separate fix entry. Create a standalone fix entry only for behavior users could obtain in a published version.
- Review and release agents may check entries for accuracy, duplication, placement, and completeness, but must not reconstruct or author missing entries from the final diff.
- If release notes are missing or inaccurate, the release agent must block the release and return the notes to the implementing agent or user for correction before running `opencard-app/scripts/release.ps1`.
- Internal refactors and test-only changes do not require an entry unless they materially affect users.
- Use `新增`, `变更`, and `修复` sections as applicable. Do not create empty sections.
- Treat `opencard-app/RELEASE_NOTES.md` as the draft for the next stable release, not a cumulative changelog. A preview release publishes the draft and leaves it open, so it accumulates every change made after the most recently published stable release; the stable release publishes that accumulated draft unchanged and then clears it.
- Before release, check every statement against the actual behavior, remove stale or duplicated entries, and rewrite developer-facing wording into user-facing language. Do not advertise behavior that is incomplete or only planned.

### Entry style

An entry is a headline, not a description. The user's own entries are the reference: match their
length and shape, and never expand, shorten, or translate a line the user has already written.

```
- 新增小贴士，可以在设置中控制开关和频率
- 新增引导系统，初步新增两套引导：“界面介绍”和“创建第一个项目”
- 提升了界面风格一致性
```

- Lead with the change itself: `新增…`, `提升…`, `修复…`. Never narrate the product ("现在可以…", "支持了…").
- One change per line, one clause, no longer than the longest reference entry above (about 30 characters). A second change gets its own line, never an appended clause.
- Do not list what a feature contains: no 介绍A、B、C, no 涵盖/包括…等. The feature's own name is the entry.
- Name the capability and stop: no setting location, no steps to reach it, no explanation of what it is good for.
- A `：` may introduce a short list of names, as in the guide example above. It may not introduce an explanation, and the line carries no `；` clause and no parentheses.
- No trailing `。`.
- Use the user's names for features and screens, and quote them with `“”` exactly where the user does.
- State what changed, not why it is better: no 更…, 方便, 直观, 流畅, and no comparison with the previous behavior.
- Write for end users: no component names, providers, tokens, state-machine states, schema fields, or file paths.
- Describe a fix by the symptom that disappears, not by its cause.
- Where the examples above and these rules disagree, the examples win.
