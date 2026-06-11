# Execution Validation

## Purpose

This document is the Codex execution spine for implementing the Stitch validation and experimental candidate stage.

It coordinates flow-first work through `FLOW-*`, `TASK-*`, and `VAL-*` entries. It does not redefine product requirements, blueprint semantics, UI behavior, or documentation source of truth.

Codex must preserve the frozen `ProductBlueprintV1` and `PageContract` as the only downstream product sources of truth.

## Current Target

Default path:

```text
Frozen ProductBlueprintV1
  -> PageContract
  -> one Stitch prompt
  -> one Stitch HTML artifact
  -> validation
  -> deterministic postprocess or fail
  -> cross-page validation
  -> final validation gate
```

Experimental candidate path:

```text
Frozen ProductBlueprintV1
  -> PageContract
  -> StitchPromptPlan
  -> N bounded Stitch candidate prompts
  -> N Stitch HTML candidates
  -> static/runtime/cross-page validation where applicable
  -> hard gate filtering
  -> soft score ranking
  -> deterministic postprocess when applicable
  -> re-validation
  -> selected candidate or failure diagnostics
  -> persisted lineage artifacts
```

## Required Reading Policy

Codex must read in this order:

1. `AGENTS.md`
2. `docs/execution/execution-validation.md`
3. only source documents named by the active task

Primary source documents:

```text
docs/stitch2html-stage.md
docs/stitch-candidate-search-stage.md
docs/validation-repair-stage.md
docs/stage-contract-test-matrix.md
docs/issue-code-inventory.md
```

Primary implementation areas:

```text
src/stitch/config/stitch-generation-config.yaml
src/stitch/config/read-stitch-generation-config.ts
src/stitch/constraints/stitch-ui-constraints.yaml
src/stitch/constraints/load-stitch-ui-constraints.ts
src/stitch/pipeline/generate-stitch-html-artifacts.ts
src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts
src/stitch/validation/validate-stitch-html.ts
src/stitch/runtime/validate-stitch-runtime.ts
src/stitch/runtime/validate-stitch-cross-page-runtime.ts
src/stitch/validation/validate-stitch-cross-page.ts
src/stitch/postprocess/postprocess-stitch-html.ts
src/stitch/plan/build-stitch-prompt-plan.ts
src/stitch/prompts/build-stitch-page-prompt.ts
src/stitch/candidate-search/hard-gates.ts
src/stitch/candidate-search/soft-scores.ts
src/blueprint/types/blueprint.ts
src/blueprint/schemas/blueprint.ts
src/blueprint/persistence/repository.ts
tests/blueprint.test.ts
tests/stitch-candidate-search.test.ts
package.json
```

## Non-negotiable Execution Rules

- Use flow-first execution, not layer-first execution.
- Default Stitch generation remains single-candidate.
- Candidate mode is experimental and opt-in.
- Candidate mode is selected only by `mode: "candidate"` in `src/stitch/config/stitch-generation-config.yaml`.
- Do not add a second `enabled` flag.
- Keep generation config separate from UI constraints.
- `src/stitch/constraints/stitch-ui-constraints.yaml` owns UI, prompt, interaction, navigation, and postprocess constraints only.
- Deterministic postprocess uses `postprocess.allowedFixes`.
- Do not use Codex SDK terminology unless an actual Codex SDK integration exists.
- Do not use raw user input in Stitch prompts, candidate prompts, scoring, repair, or targeted reprompt.
- Do not mutate the frozen blueprint in validation or postprocess.

## Flows

### FLOW-001: Default Single-Candidate Generation

Goal: preserve the default path as one page contract, one prompt, and one HTML artifact.

Trigger: config is absent or `mode: "single"`.

Required validation: VAL-001, VAL-002, VAL-003, VAL-004.

### FLOW-002: Validation and Deterministic Postprocess

Goal: run static validation, runtime validation, cross-page validation, deterministic postprocess, re-validation, and final gate reporting without mutating the blueprint.

Required validation: VAL-005, VAL-006, VAL-007, VAL-008, VAL-019.

### FLOW-003: Experimental Candidate Generation

Goal: generate multiple bounded candidate attempts only when `mode: "candidate"` is selected.

Required validation: VAL-009, VAL-010, VAL-011.

### FLOW-004: Candidate Selection Gate

Goal: reject hard-gate failures before any soft-score ranking.

Required validation: VAL-012, VAL-013, VAL-014, VAL-022.

### FLOW-005: Bounded Targeted Reprompt

Goal: allow issue-code-driven reprompting only in candidate mode and only within explicit budgets.

Required validation: VAL-015, VAL-016.

### FLOW-006: Candidate Lineage and Release Evidence

Goal: persist candidate attempts, rejected reasons, selected candidate, validation reports, postprocess decisions, and compatibility with the normal validated Stitch artifact path.

Required validation: VAL-017, VAL-018, VAL-019.

## Foundation Tasks

### TASK-001: Configure generation mode

Goal: implement and preserve the split between generation configuration and UI constraints.

Implementation requirements:

```text
src/stitch/config/stitch-generation-config.yaml owns:
- version
- mode: "single" | "candidate"
- candidateSearch.candidatesPerPage
- candidateSearch.maxRepromptAttempts
- candidateSearch.maxCandidatesPerReprompt

src/stitch/constraints/stitch-ui-constraints.yaml owns:
- promptRules
- html
- interaction
- navigation
- postprocess.allowedFixes
```

Do not use `candidate-search` as a mode value. Do not use `experimentalCandidateSearch.enabled`.

Required validation: VAL-001, VAL-009.

### TASK-002: Add candidate schemas and types

Goal: add schema-backed candidate prompt plan, candidate attempt, candidate run, selection report, rejected report, and selected manifest types.

Required validation: VAL-010, VAL-017.

### TASK-003: Add hard-gate and soft-score utilities

Goal: classify hard-gate failures and rank only eligible candidates.

Required validation: VAL-012, VAL-013.

### TASK-004: Add candidate orchestration entry point

Goal: invoke candidate orchestration only when `mode: "candidate"` is selected, while preserving the existing default generation path.

Required validation: VAL-001, VAL-009, VAL-011.

## Flow Slice Tasks

### TASK-010: Guard default generation

Goal: prove default generation creates one prompt and one HTML artifact per page.

Required validation: VAL-001, VAL-002.

### TASK-011: Preserve source boundary

Goal: prove default Stitch prompting does not consume raw user input.

Required validation: VAL-003.

### TASK-012: Prevent default regeneration after validation failure

Goal: prove default validation does not call Stitch generation or targeted reprompt.

Required validation: VAL-004.

### TASK-020: Complete static validation

Goal: align static validation issue codes with `docs/validation-repair-stage.md`.

Required validation: VAL-005.

### TASK-021: Complete runtime validation

Goal: prove clickable elements have meaningful visible effects and structured evidence.

Required validation: VAL-006, VAL-007.

### TASK-022: Complete deterministic postprocess routing

Goal: use issue-code routing, `postprocess.allowedFixes`, per-fix safety checks, and applied/rejected fix reporting.

Required validation: VAL-008.

### TASK-023: Preserve final gate authority

Goal: keep final gate as the deliverability decision.

Required validation: VAL-004, VAL-019.

### TASK-030: Build candidate prompt plans

Goal: create structured candidate `StitchPromptPlan` artifacts before prompt rendering.

Required validation: VAL-010, VAL-011.

### TASK-031: Render bounded candidate prompts

Goal: render candidate prompts from prompt plans without raw input or product reinterpretation.

Required validation: VAL-011.

### TASK-032: Generate candidate attempts

Goal: generate up to configured candidate counts and persist prompt plan, prompt, HTML, and diagnostics.

Required validation: VAL-009, VAL-017.

### TASK-033: Route runtime mode

Goal: run default flow for `single` and candidate flow for `candidate` without changing existing CLI defaults.

Required validation: VAL-001, VAL-009, VAL-020.

### TASK-034: Tighten candidate ranking contracts

Goal: turn the first-pass hard-gate and soft-score helpers into strict selection-safe contracts before candidate selection orchestration depends on them.

Implementation requirements:

```text
hard-gates.ts:
- hard gate issue codes remain the only source for binary eligibility.
- collectHardGateIssues must dedupe issue codes.
- hard-gate result must be pass only when no hardGateIssues exist.

soft-scores.ts:
- CandidateSoftScores must use the fixed SoftScoreKey set, not arbitrary Record<string, number>.
- soft score values must be deterministic, finite numbers in the inclusive range 0..1.
- rankEligibleCandidateAttempts must not silently filter hard-gate-failed attempts.
- rankEligibleCandidateAttempts must fail fast when any input attempt is not hard-gate eligible.
- ranking tie-breaker must be stable: totalScore descending, candidateIndex ascending, attemptId ascending.
```

Soft score calculation, first implementation:

```text
Input signals may come only from generated candidate HTML, PageContract expectations, and validation reports.
Input signals must not come from raw user input, unfrozen blueprint drafts, screenshots, LLM judgment, or external visual models.

Each soft score key returns a number from 0 to 1.
Missing or unmeasurable signals return 0, not an inferred value.
Scores are rule-based heuristics for ranking eligible candidates only; they do not prove correctness.
```

Required score keys and rules:

```text
design_consistency:
  1.0 when repeated structural primitives are internally consistent across the candidate HTML.
  0.5 when structure is mostly consistent but has minor naming/class/section irregularity.
  0.0 when the candidate lacks enough repeated structure to assess consistency.

information_hierarchy:
  1.0 when the candidate has a clear heading plus distinguishable primary content sections.
  0.5 when heading or section hierarchy exists but is shallow or partially ambiguous.
  0.0 when there is no meaningful heading/section hierarchy.

visual_polish:
  1.0 when the candidate contains non-empty styling hooks/classes/semantic layout containers sufficient for a polished render.
  0.5 when styling hooks exist but are sparse.
  0.0 when the HTML is mostly unstyled structural markup.

density_fit:
  1.0 when rendered content density matches the PageContract role: forms/detail pages are not overloaded, dashboard pages are not sparse.
  0.5 when density is acceptable but underfilled or slightly crowded.
  0.0 when density clearly conflicts with the page role or required content.

enterprise_saas_fit:
  1.0 when the candidate uses enterprise-appropriate semantic UI structure: clear action area, status/feedback surfaces, navigation discipline, and workflow framing.
  0.5 when some enterprise UI structure is present but incomplete.
  0.0 when the candidate reads as generic static content without workflow framing.

component_clarity:
  1.0 when required actions, inputs, feedback, and recovery surfaces are represented as distinct semantic components.
  0.5 when required components exist but are visually or structurally hard to distinguish.
  0.0 when required components collapse into undifferentiated markup.

navigation_clarity:
  1.0 when declared navigation targets are clear, consistent, and limited to allowed routes.
  0.5 when navigation is present but secondary or not clearly grouped.
  0.0 when no meaningful declared navigation structure exists.
```

Total score rule:

```text
totalScore = average of all required soft score keys.
Do not use sum as the final score, because adding future keys would change score scale.
Do not weight dimensions in the first implementation.
```

Out of scope:

```text
- Do not implement final candidate selection here.
- Do not persist selected manifests here.
- Do not introduce screenshot, LLM, or visual-model scoring.
- Do not use soft scores to repair or rewrite HTML.
```

Required validation: VAL-012, VAL-013, VAL-022.

### TASK-040: Validate candidate attempts

Goal: attach validation report IDs and hard-gate results to candidate attempts.

Required validation: VAL-012, VAL-017.

### TASK-041: Select candidate

Goal: reject hard-gate failures, rank only eligible candidates, and persist selected or failed final decision.

Required validation: VAL-012, VAL-013, VAL-014, VAL-022.

### TASK-042: Adapt selected candidate

Goal: expose the selected candidate as a normal validated Stitch artifact while preserving lineage.

Required validation: VAL-014, VAL-018, VAL-019.

### TASK-050: Implement targeted reprompt

Goal: reprompt only from PageContract, previous prompt plan, previous validation issue codes, previous diagnostics, and compiled constraints.

Required validation: VAL-015, VAL-016.

### TASK-051: Enforce reprompt budgets

Goal: enforce `maxRepromptAttempts` and `maxCandidatesPerReprompt`.

Required validation: VAL-009, VAL-016.

### TASK-060: Persist candidate lineage

Goal: persist candidate run, attempts, prompt plans, prompts, HTML, validation reports, selection report, rejected report, and selected manifest.

Required validation: VAL-017, VAL-018.

### TASK-061: Persist selected candidate evidence

Goal: ensure the selected candidate has validation and postprocess evidence.

Required validation: VAL-014, VAL-017, VAL-019.

## Hardening Tasks

### TASK-090: Implement stage contract tests

Goal: make `docs/stage-contract-test-matrix.md` executable through focused tests.

Required validation: VAL-021.

### TASK-091: Harden source boundaries

Goal: prove raw input and unfrozen draft data cannot enter default or candidate generation.

Required validation: VAL-003, VAL-011, VAL-015.

### TASK-092: Harden artifact compatibility

Goal: prove candidate lineage does not break default artifact consumers.

Required validation: VAL-018, VAL-019.

## Validation Catalog

### VAL-001: Default mode remains single

Command:

```bash
npm test
```

Claim: default config produces one prompt and one HTML artifact per page and does not invoke candidate orchestration.

### VAL-002: Build succeeds

Command:

```bash
npm run build
```

Claim: TypeScript compiles.

### VAL-003: Source boundary holds

Command:

```bash
npm test
```

Claim: default prompt generation does not consume raw user input.

### VAL-004: Default validation does not regenerate

Command:

```bash
npm test
```

Claim: default validation may run deterministic postprocess but does not call Stitch generation or targeted reprompt.

### VAL-005: Static validation issue codes

Command:

```bash
npm test
```

Claim: static validation emits documented issue codes.

### VAL-006: Runtime visible effects

Command:

```bash
npm test
```

Claim: clickable elements pass only with meaningful visible effects.

### VAL-007: Runtime evidence shape

Command:

```bash
npm test
```

Claim: runtime evidence is structured and screenshots do not become product truth.

### VAL-008: Postprocess allowlist

Command:

```bash
npm test
```

Claim: deterministic postprocess uses `postprocess.allowedFixes`, issue routing, safety checks, and reports applied/rejected fixes.

### VAL-009: Candidate mode opt-in and bounds

Command:

```bash
npm test
```

Claim: candidate mode is selected only by `mode: "candidate"` and respects candidate budgets.

### VAL-010: Candidate prompt plan structure

Command:

```bash
npm test
```

Claim: candidate prompt plans are structured and schema-backed.

### VAL-011: Candidate prompt source boundary

Command:

```bash
npm test
```

Claim: candidate prompts do not use raw input or new product requirements.

### VAL-012: Hard gate blocks selection

Command:

```bash
npm test
```

Claim: candidates with hard-gate failures cannot be selected.

### VAL-013: Soft score cannot override hard gate

Command:

```bash
npm test
```

Claim: soft scores rank only hard-gate-passing candidates.

### VAL-014: Candidate selection decision

Command:

```bash
npm test
```

Claim: selection persists a selected attempt or failure reasons.

### VAL-015: Targeted reprompt uses issue codes only

Command:

```bash
npm test
```

Claim: targeted reprompt excludes raw input and new requirements.

### VAL-016: Reprompt budgets enforced

Command:

```bash
npm test
```

Claim: reprompt attempts and candidates never exceed config.

### VAL-017: Candidate lineage persisted

Command:

```bash
npm test
```

Claim: every candidate attempt and rejection reason is persisted.

### VAL-018: Artifact compatibility

Command:

```bash
npm test
```

Claim: selected candidate can be consumed as normal validated Stitch HTML.

### VAL-019: Final gate authority

Command:

```bash
npm test
```

Claim: final validation gate remains the release decision.

### VAL-020: CLI defaults preserved

Command:

```bash
npm run build
npm test
```

Claim: existing scripts keep their default behavior.

### VAL-021: Stage contract matrix covered

Command:

```bash
npm test
```

Claim: matrix claims have focused test coverage.

### VAL-022: Candidate ranking contract tightened

Command:

```bash
npm test
```

Claim:

```text
soft score ranking rejects hard-gate-failed input instead of silently filtering it.
CandidateSoftScores uses fixed SoftScoreKey keys.
soft score values are deterministic, finite, and bounded to 0..1.
each required soft score key is calculated by the documented first-implementation rule.
totalScore is the unweighted average of all required soft score keys.
tie-breaker order is totalScore desc, candidateIndex asc, attemptId asc.
```

## Release Validation

Before handoff, run:

```bash
npm run build
npm test
```

Release claims:

```text
TypeScript compilation succeeds.
Default single-candidate path remains default.
Candidate mode is opt-in through mode: "candidate".
Generation config and UI constraints remain separate.
Deterministic postprocess uses postprocess.allowedFixes.
Static, runtime, and cross-page validation contracts pass.
Default validation does not regenerate HTML.
Candidate mode creates bounded prompt plans and attempts.
Hard gate failures cannot be selected.
Soft scores cannot override hard gate failures.
Candidate ranking contracts are strict, deterministic, and explicitly scored.
Rejected candidate diagnostics are persisted.
Targeted reprompt uses issue codes only and respects budgets.
Selected candidate lineage and default artifact compatibility are preserved.
Final validation gate remains the deliverability authority.
```

If validation cannot run because of the environment, record the exact command, failure output, environmental reason, and strongest substitute validation.

## Execution Report

Codex must maintain `docs/execution/codex-execution-report.md` according to `AGENTS.md`.

For each task, record:

```text
task ID
files changed
validation commands run
validation result
blockers, if any
```

## Execution Readiness

Status: ready

Execution can begin with TASK-001 through TASK-004, then proceed through default-path guardrails before candidate flow slices.
