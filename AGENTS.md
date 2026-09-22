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

## Test Guards

- Tests have two roles and only one of them is permanent. A test written while building records **current behaviour**, incidental implementation detail included; that is scaffolding. A test that freezes a **confirmed contract** is a guard.
- Scaffolding may be dismantled and rewritten wholesale to serve a design change. Never refuse a correct design change because scaffolding would go red, and never keep an accidental assertion merely because it currently passes.
- Promote a module's tests to a guard only when the module is confirmed clean. That judgement is the agent's, and it is offered to the user as a by-product of ordinary work — not sought out, and not raised repeatedly.
- Surface it as a question, never as a report: one line naming the module and asking whether the user wants to hear the reasoning. Deliver the analysis and the structure list only after the user says yes. The insight belongs to the agent; whether to spend the user's attention on it belongs to the user.
- A guard is named `<Source>.guard.spec.ts`. `scripts/lint-naming.mjs` strips `.spec.ts` and then takes the segment before the first `.`, so `OcCard.guard.spec.ts` still resolves to `OcCard.vue` and passes `lint:naming` unchanged. Do not invent a prefix such as `[A]`: it breaks that check.
- Promotion criteria — all six must hold:
  1. The responsibility fits one sentence containing no "and".
  2. Every input and output is an explicit parameter or return value; no globals, no captured outer state.
  3. One implementation of each meaning across the repository.
  4. Every export has a caller outside its own file.
  5. Failure is a value carrying a code, not a throw and not a silent fallback.
  6. Behaviour is testable as a pure function: no mock framework, no mount, no fake timers.
- When the user says yes, answer in this shape: `发现 <module> 满足完美无缺要求，理由：【三句以内】, 模块结构：【方法：输入 arg 名|类型|含义，输出 名|类型|含义；数据结构字段：名|类型|含义与用途】`. That structure list is the guard's table of contents: each entry becomes an assertion.
- Promotion requires a **stable contract**. Early-Stage Compatibility allows persisted formats to be rewritten outright, so a guard freezes the module's inputs and outputs, never a file format.
- When dismantling scaffolding, re-derive the module's intended contract and confirm that any **cross-module** contract it carried is still guarded at the seam. Otherwise a refactor can change behaviour with nothing left to detect it.
- This section governs deliberate design changes. Production-First Debugging still governs bug reports: there, identify the production root cause before touching a spec. Weakening an assertion so that something passes is forbidden under both.
- Do not write a test for something a reader can see at a glance (a rename, a constant, a one-line mapping, a label's wording). If a behaviour needs no explanation to be understood, it needs no test either.
- Do not create a new spec file for a small helper. Cover it inside the spec that already owns the feature, and only when the behaviour is not obvious.
- Verification is spent, not performed. Run only the specs your change actually touches; a full-suite run is for a change whose blast radius is unknown, not a habit.
- Every change is expected to pay for itself in diff size. Adding a feature is not a licence to add scaffolding, helpers, or assertions around it; prefer folding logic into the existing path and deleting what it replaces. A run of net-growing diffs is a signal to stop and cut, not to continue.

## Release Notes

- The agent that implements a user-facing feature, fix, or removal must update `opencard-app/RELEASE_NOTES.md` for that specific change before handoff or commit.
- Each implementing agent owns only the factual release-note entries for its own work. When behavior is removed or reverted, that agent must also remove or revise any now-stale entry.
- Review and release agents may check entries for accuracy, duplication, placement, and completeness, but must not reconstruct or author missing entries from the final diff.
- If release notes are missing or inaccurate, the release agent must block the release and return the notes to the implementing agent or user for correction before running `scripts/release.ps1`.
- Internal refactors and test-only changes do not require an entry unless they materially affect users.
- Write release notes for end users, including non-developers. Lead with what changed in the product and the effect the user can observe.
- Describe features as capabilities or workflow improvements. Describe fixes by the symptom that no longer occurs, not by the implementation cause.
- Prefer visible UI vocabulary and natural Chinese. Avoid internal names and engineering terms such as component class names, provider, token, state-machine states, or schema fields unless the term is itself shown to users and is necessary for recognition.
- Keep one bullet focused on one coherent user outcome. Merge supporting implementation details into that outcome, and omit intermediate attempts, reverted behavior, test details, and refactor history.
- Treat fixes made while an uncommitted or unreleased feature is still under development as part of that feature, not as separate release-note fixes. Revise the feature entry when needed; create a standalone fix entry only for behavior that users could obtain in a published version.
- Use `新增`, `改进`, and `修复` sections as applicable. Do not create empty sections.
- Treat `opencard-app/RELEASE_NOTES.md` as the draft for the next release, not a cumulative changelog. It must contain only changes made after the most recently published version and must not repeat notes from an earlier release.
- Before release, check every statement against the actual behavior, remove stale or duplicated entries, and rewrite developer-facing wording into user-facing language. Do not advertise behavior that is incomplete or only planned.
