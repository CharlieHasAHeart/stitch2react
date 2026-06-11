# Execution Validation

## 1. Execution Scope

This document is the Codex execution spine for implementing the documentation-defined Stitch validation and experimental candidate-search stage in this repository.

This document owns:

```text
FLOW-* execution entries
TASK-* implementation entries
VAL-* validation entries
minimal foundation tasks
flow-slice task catalog
cross-flow hardening tasks
task-scoped source references
task-to-validation mapping
release validation expectations
execution readiness
```

This document does not own:

```text
product requirements
new product scope
new blueprint semantics
new raw-input interpretation rules
new UI product behavior
Stitch SDK API design
runtime worklog format
documentation source-of-truth changes
```

Codex must implement existing code toward the current stage documentation. Codex must not reinterpret the documentation into a new architecture, replace the default path with the experimental path, or introduce product semantics outside the frozen `ProductBlueprintV1` and `PageContract`.

The implementation target is:

```text
Default path:
Frozen ProductBlueprintV1
  -> PageContract
  -> one Stitch prompt
  -> one Stitch HTML artifact
  -> validation
  -> deterministic postprocess or fail
  -> cross-page validation
  -> final validation gate

Experimental candidate-search path:
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

## 2. Execution Reading Policy

Codex must start with:

```text
AGENTS.md
```

Then Codex must use this file as the execution spine.

Codex must read source documents only when a `TASK-*` entry explicitly lists them.

Codex must not infer new tasks from all docs by scanning the repository. Codex must not redefine reference-owned contracts inside implementation tasks.

Primary source documents for this execution:

```text
docs/stitch2html-stage.md
docs/stitch-candidate-search-stage.md
docs/validation-repair-stage.md
docs/stage-contract-test-matrix.md
docs/issue-code-inventory.md
```

Primary source code areas for this execution:

```text
src/stitch/pipeline/generate-stitch-html-artifacts.ts
src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts
src/stitch/validation/validate-stitch-html.ts
src/stitch/runtime/validate-stitch-runtime.ts
src/stitch/runtime/validate-stitch-cross-page-runtime.ts
src/stitch/validation/validate-stitch-cross-page.ts
src/stitch/postprocess/postprocess-stitch-html.ts
src/stitch/plan/build-stitch-prompt-plan.ts
src/stitch/prompts/build-stitch-page-prompt.ts
src/stitch/constraints/load-stitch-ui-constraints.ts
src/stitch/constraints/stitch-ui-constraints.yaml
src/blueprint/types/blueprint.ts
src/blueprint/schemas/blueprint.ts
src/blueprint/persistence/repository.ts
tests/blueprint.test.ts
tests/stitch-candidate-search.test.ts
package.json
```

## 3. Implementation Strategy

Use flow-first execution.

The sequence is:

```text
minimal foundation
-> default-path guardrails
-> candidate-search flow slices
-> validation and lineage flow slices
-> cross-flow hardening
-> release validation
```

Do not execute as:

```text
all schemas first
all pipeline code second
all tests last
all docs last
all backend first
all frontend second
all data third
```

Some narrow foundation work is allowed where multiple flows depend on the same type, schema, artifact, config, or selection helper. Keep foundation tasks small and only as reusable as the flows require.

The default path must remain single-candidate. Experimental candidate-search must be opt-in through runtime configuration and must not change existing default behavior.

## 4. Flow Model

### FLOW-001: Default Single-Candidate Stitch Generation Remains Stable

Flow Type:
- core_user_flow

Goal:
- Preserve the current default Stitch generation path as one `PageContract` to one prompt to one HTML artifact, followed by validation and deterministic postprocess or failure.

Trigger / Start Condition:
- A frozen blueprint is passed to the current Stitch generation pipeline without candidate-search mode enabled.

Required Foundation:
- TASK-001
- TASK-002

UI Surface Summary:
- Not applicable. This is an artifact generation flow.

Completion Signal:
- Generated page artifacts and validation/final gate artifacts are persisted with the same default artifact shape expected by existing consumers.

Task Coverage:
- TASK-010
- TASK-011
- TASK-012

Validation Summary:
- VAL-001
- VAL-002
- VAL-003
- VAL-004

Related Source Areas:
- `src/stitch/pipeline/generate-stitch-html-artifacts.ts`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- `src/stitch/validation/validate-stitch-html.ts`
- `src/stitch/postprocess/postprocess-stitch-html.ts`
- `tests/blueprint.test.ts`

### FLOW-002: Validation and Deterministic Postprocess Gate

Flow Type:
- system_support_flow

Goal:
- Ensure generated Stitch HTML is checked by static validation, runtime validation, cross-page validation, deterministic postprocess, re-validation, and final gate reporting without mutating the frozen blueprint.

Trigger / Start Condition:
- A generated Stitch HTML artifact exists for a page.

Required Foundation:
- TASK-001
- TASK-002
- TASK-003

UI Surface Summary:
- Not applicable. Validation inspects generated HTML artifacts.

Completion Signal:
- `stitch_html_validation_report`, `stitch_runtime_validation_report`, `stitch_html_postprocess_report` when applicable, `stitch_cross_page_validation_report`, `validated_stitch_artifact_gate_report`, and `stitch_final_validation_gate_report` are persisted.

Task Coverage:
- TASK-020
- TASK-021
- TASK-022
- TASK-023

Validation Summary:
- VAL-005
- VAL-006
- VAL-007
- VAL-008

Related Source Areas:
- `src/stitch/validation/validate-stitch-html.ts`
- `src/stitch/runtime/validate-stitch-runtime.ts`
- `src/stitch/runtime/validate-stitch-cross-page-runtime.ts`
- `src/stitch/validation/validate-stitch-cross-page.ts`
- `src/stitch/postprocess/postprocess-stitch-html.ts`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`

### FLOW-003: Experimental Candidate Search Generation

Flow Type:
- side_effect_flow

Goal:
- Add an opt-in candidate-search path where each page may produce multiple bounded Stitch candidates from structured `StitchPromptPlan` artifacts.

Trigger / Start Condition:
- Runtime configuration explicitly sets candidate-search mode and enables `experimentalCandidateSearch`.

Required Foundation:
- TASK-001
- TASK-002
- TASK-003
- TASK-004

UI Surface Summary:
- Not applicable. Candidate search produces generated HTML artifacts.

Completion Signal:
- Candidate attempts are generated and persisted with prompt-plan, prompt, HTML, and validation lineage sufficient for candidate selection.

Task Coverage:
- TASK-030
- TASK-031
- TASK-032
- TASK-033

Validation Summary:
- VAL-009
- VAL-010
- VAL-011

Related Source Areas:
- `docs/stitch-candidate-search-stage.md`
- `src/stitch/pipeline/generate-stitch-html-artifacts.ts`
- `src/stitch/plan/build-stitch-prompt-plan.ts`
- `src/stitch/prompts/build-stitch-page-prompt.ts`
- `src/blueprint/types/blueprint.ts`
- `src/blueprint/schemas/blueprint.ts`

### FLOW-004: Candidate Selection Gate

Flow Type:
- system_support_flow

Goal:
- Select only eligible candidate HTML artifacts by rejecting hard-gate failures before soft-score ranking.

Trigger / Start Condition:
- One or more candidate attempts have validation reports.

Required Foundation:
- TASK-002
- TASK-003
- TASK-004

UI Surface Summary:
- Not applicable. Selection consumes validation reports and candidate metadata.

Completion Signal:
- A selected candidate is persisted, or a failed candidate-search run is persisted with rejection diagnostics.

Task Coverage:
- TASK-040
- TASK-041
- TASK-042

Validation Summary:
- VAL-012
- VAL-013
- VAL-014

Related Source Areas:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- new candidate-search module under `src/stitch/candidate-search/`

### FLOW-005: Bounded Targeted Reprompt

Flow Type:
- recovery_flow

Goal:
- Allow issue-code-driven reprompting only inside experimental candidate-search mode and only within explicit runtime budgets.

Trigger / Start Condition:
- Candidate-search mode is enabled and initial candidates fail with validation issue codes that are eligible for targeted reprompt.

Required Foundation:
- TASK-001
- TASK-002
- TASK-003
- TASK-004

UI Surface Summary:
- Not applicable.

Completion Signal:
- Additional bounded candidate attempts are generated using only allowed inputs and persisted with lineage, or no reprompt occurs because budget or eligibility blocks it.

Task Coverage:
- TASK-050
- TASK-051

Validation Summary:
- VAL-015
- VAL-016

Related Source Areas:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/stitch/plan/build-stitch-prompt-plan.ts`
- `src/stitch/prompts/build-stitch-page-prompt.ts`
- new candidate-search module under `src/stitch/candidate-search/`

### FLOW-006: Candidate Lineage and Release Evidence

Flow Type:
- artifact_flow

Goal:
- Persist enough lineage to answer which candidates were generated, why each rejected candidate was rejected, which validation reports were used, which postprocess fixes were applied or rejected, and which candidate was selected.

Trigger / Start Condition:
- Candidate-search run starts or default validation final gate completes.

Required Foundation:
- TASK-002
- TASK-004

UI Surface Summary:
- Not applicable.

Completion Signal:
- Candidate-search artifacts and default validation artifacts are persisted in repository artifacts and project bundle paths.

Task Coverage:
- TASK-060
- TASK-061
- TASK-090
- TASK-091

Validation Summary:
- VAL-017
- VAL-018
- VAL-019

Related Source Areas:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/blueprint/persistence/repository.ts`
- `src/blueprint/types/blueprint.ts`
- `src/blueprint/schemas/blueprint.ts`

## 5. Foundation Task Catalog

### TASK-001: Add Runtime Configuration for Stitch Generation Mode

Task Type:
- foundation

Priority:
- must

Depends On:
- none

Unlocks:
- FLOW-001
- FLOW-003
- FLOW-005

Goal:
- Add a narrow configuration model for `stitchGeneration.mode` and `stitchGeneration.experimentalCandidateSearch` without changing default behavior.

Read Before This Task:
- `docs/stitch2html-stage.md`
- `docs/stitch-candidate-search-stage.md`
- `src/stitch/constraints/stitch-ui-constraints.yaml`
- `src/stitch/constraints/load-stitch-ui-constraints.ts`

Implementation Scope:
- Support `single` and `candidate-search` modes.
- Preserve `single` as the default.
- Require `experimentalCandidateSearch.enabled === true` before candidate-search can run.
- Support `candidatesPerPage`, `maxRepromptAttempts`, and `maxCandidatesPerReprompt`.
- If implementation uses the existing constraints loader, extend it narrowly; otherwise add a small stage config reader near Stitch pipeline code.

Expected Code Impact:
- `src/stitch/constraints/stitch-ui-constraints.yaml`
- `src/stitch/constraints/load-stitch-ui-constraints.ts`
- possibly a new `src/stitch/config/read-stitch-generation-config.ts`

Out of Scope:
- Do not add app-wide config architecture.
- Do not make candidate-search the default.
- Do not add UI configuration.
- Do not introduce raw user input as a config source.

Required Validation:
- VAL-001
- VAL-009

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-002: Add Candidate Search Types and Schemas

Task Type:
- foundation

Priority:
- must

Depends On:
- none

Unlocks:
- FLOW-003
- FLOW-004
- FLOW-006

Goal:
- Add schema-backed types for candidate-search prompt plans, candidate attempts, candidate runs, selection reports, rejected candidate reports, and selected candidate manifests.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/blueprint/types/blueprint.ts`
- `src/blueprint/schemas/blueprint.ts`
- `src/blueprint/persistence/repository.ts`

Implementation Scope:
- Add or extend types equivalent to `StitchPromptPlan`, `StitchCandidateAttempt`, `StitchCandidateSearchRun`, `CandidateSelectionReport`, `RejectedCandidateReport`, and `SelectedCandidateManifest`.
- Add schemas for artifact parsing and persistence.
- Ensure schema fields can reference validation report IDs, prompt artifact IDs, HTML artifact IDs, postprocess report IDs, hard gate issues, soft scores, rejection reasons, and final decision.
- Keep default `stitch_prompt_plan`, `stitch_page_prompt`, and `stitch_html` artifact shapes compatible.

Expected Code Impact:
- `src/blueprint/types/blueprint.ts`
- `src/blueprint/schemas/blueprint.ts`
- `src/blueprint/persistence/repository.ts`
- tests for schemas or artifact persistence

Out of Scope:
- Do not redefine `ProductBlueprintV1`.
- Do not add new product fields to the frozen blueprint.
- Do not add unrelated artifact categories.

Required Validation:
- VAL-010
- VAL-017

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-003: Extract Hard Gate and Soft Score Utilities

Task Type:
- foundation

Priority:
- must

Depends On:
- TASK-002

Unlocks:
- FLOW-002
- FLOW-004
- FLOW-005

Goal:
- Provide reusable utilities that classify hard gate failures and rank eligible candidates without mixing product interpretation into validation.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/stitch/validation/validate-stitch-html.ts`
- `src/stitch/runtime/validate-stitch-runtime.ts`
- `src/stitch/validation/validate-stitch-cross-page.ts`

Implementation Scope:
- Create a hard gate issue-code set including documented hard gate codes.
- Provide a function that marks a candidate as ineligible if any hard gate issue is present.
- Provide a deterministic soft-score ranking placeholder that only accepts hard-gate-passing candidates.
- If visual scoring is not yet implemented, use deterministic rule-based placeholder scores and make the limitation explicit in code/tests.

Expected Code Impact:
- new `src/stitch/candidate-search/hard-gates.ts`
- new `src/stitch/candidate-search/soft-scores.ts`
- tests in `tests/stitch-candidate-search.test.ts`

Out of Scope:
- Do not call an LLM to score candidates.
- Do not allow soft scores to override hard gate failures.
- Do not add screenshot scoring unless there is already project support for it.

Required Validation:
- VAL-012
- VAL-013

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-004: Add Candidate Search Orchestration Entry Point

Task Type:
- foundation

Priority:
- must

Depends On:
- TASK-001
- TASK-002
- TASK-003

Unlocks:
- FLOW-003
- FLOW-004
- FLOW-005
- FLOW-006

Goal:
- Add a narrow candidate-search orchestration module without replacing the default generation pipeline.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `src/stitch/pipeline/generate-stitch-html-artifacts.ts`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`

Implementation Scope:
- Create a candidate-search module that can be invoked only when candidate-search is explicitly enabled.
- Keep current `generateStitchHtmlArtifacts` usable for default mode.
- Decide whether the top-level CLI/pipeline calls a routing function or whether candidate-search wraps existing generation client logic.
- Ensure the default path remains the same when config is absent or mode is `single`.

Expected Code Impact:
- new `src/stitch/candidate-search/run-stitch-candidate-search.ts`
- possible new `src/stitch/pipeline/generate-stitch-html-artifacts-with-mode.ts`
- minimal integration in CLI or existing pipeline entrypoint

Out of Scope:
- Do not refactor the whole pipeline.
- Do not change unrelated CLI behavior.
- Do not remove the current `StitchHtmlStageClient` abstraction.

Required Validation:
- VAL-001
- VAL-009
- VAL-011

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

## 6. Flow Slice Task Catalog

### TASK-010: Guard the Default Single-Candidate Path

Task Type:
- flow_slice

Flow:
- FLOW-001

Priority:
- must

Depends On:
- TASK-001

Prerequisites Already Satisfied:
- Existing `generateStitchHtmlArtifacts` creates one prompt and one HTML artifact per plan page.
- Existing validation pipeline validates and persists reports.

Goal:
- Prove and preserve that default Stitch generation creates one prompt per page and does not run candidate-search logic.

Read Before This Task:
- `docs/stitch2html-stage.md`
- `docs/stage-contract-test-matrix.md`
- `src/stitch/pipeline/generate-stitch-html-artifacts.ts`
- `tests/blueprint.test.ts`

Implementation Scope:
- Add or update tests proving the default path creates one prompt per page.
- Ensure default config does not invoke candidate-search orchestration.
- Keep existing artifact names for default mode.

Expected Code Impact:
- `tests/blueprint.test.ts`
- possibly config guard in pipeline routing module

Flow-Local Setup Allowed:
- Add a fake `StitchHtmlStageClient` in tests if existing test utilities are insufficient.

Out of Scope:
- Do not test candidate-search selection here.
- Do not change the default prompt shape except where docs already require it.

Required Validation:
- VAL-001
- VAL-002

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-011: Preserve Frozen Blueprint Source Boundary in Default Prompting

Task Type:
- flow_slice

Flow:
- FLOW-001

Priority:
- must

Depends On:
- TASK-010

Goal:
- Ensure default prompt building and Stitch generation do not read raw user input.

Read Before This Task:
- `docs/stitch2html-stage.md`
- `docs/stage-contract-test-matrix.md`
- `src/stitch/plan/build-stitch-prompt-plan.ts`
- `src/stitch/prompts/build-stitch-page-prompt.ts`
- `tests/blueprint.test.ts`

Implementation Scope:
- Add or maintain tests proving Stitch prompt does not use raw input directly.
- If prompt plan includes product context, ensure it comes from frozen blueprint and `PageContract`.
- Avoid adding raw input parameters to prompt builders.

Expected Code Impact:
- `tests/blueprint.test.ts`
- prompt plan or prompt builder only if test exposes leakage

Out of Scope:
- Do not change blueprint generation.
- Do not redefine product source-of-truth.

Required Validation:
- VAL-003

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-012: Keep Default Validation from Regenerating HTML

Task Type:
- flow_slice

Flow:
- FLOW-001

Priority:
- must

Depends On:
- TASK-010

Goal:
- Ensure validation failure in the default path cannot call Stitch generation or targeted reprompt.

Read Before This Task:
- `docs/validation-repair-stage.md`
- `docs/stage-contract-test-matrix.md`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- `tests/blueprint.test.ts`

Implementation Scope:
- Add or preserve tests proving validation module does not call Stitch generation client.
- Ensure targeted reprompt code is not reachable from default validation path.
- Keep deterministic postprocess as the only allowed repair mechanism in default path.

Expected Code Impact:
- `tests/blueprint.test.ts`
- candidate-search routing guard if needed

Out of Scope:
- Do not disable deterministic postprocess.
- Do not add LLM repair.

Required Validation:
- VAL-004

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-020: Complete Static Validation Contract

Task Type:
- flow_slice

Flow:
- FLOW-002

Priority:
- must

Depends On:
- TASK-003

Goal:
- Align static validation issue codes and behavior with `docs/validation-repair-stage.md`.

Read Before This Task:
- `docs/validation-repair-stage.md`
- `docs/issue-code-inventory.md`
- `src/stitch/validation/validate-stitch-html.ts`
- `src/stitch/html/html-contract.ts`

Implementation Scope:
- Confirm all documented static issue codes are emitted under correct conditions.
- Ensure `html_missing_page_root_marker` requires the expected `data-page-id`.
- Ensure navigation validation uses declared routes and blueprint navigation only.
- Add tests for any missing issue code or boundary.

Expected Code Impact:
- `src/stitch/validation/validate-stitch-html.ts`
- `tests/blueprint.test.ts` or a focused validation test file

Out of Scope:
- Do not check runtime click behavior in static validation.
- Do not mutate HTML in static validation.

Required Validation:
- VAL-005

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-021: Complete Runtime Validation Contract

Task Type:
- flow_slice

Flow:
- FLOW-002

Priority:
- must

Depends On:
- TASK-003

Goal:
- Ensure runtime validation proves meaningful visible effects for declared clickable targets and records structured evidence.

Read Before This Task:
- `docs/validation-repair-stage.md`
- `src/stitch/runtime/validate-stitch-runtime.ts`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- `src/blueprint/schemas/blueprint.ts`

Implementation Scope:
- Confirm runtime validation recognizes only documented meaningful effects.
- Confirm focus-only, hover-only, active-style-only, and no visible DOM/route change fail.
- Ensure runtime evidence has backend, pageId, selector/text where available, before/after hashes or URLs, and notes.
- Ensure screenshot artifact IDs are not required in runtime evidence.

Expected Code Impact:
- `src/stitch/runtime/validate-stitch-runtime.ts`
- runtime validation tests

Out of Scope:
- Do not add screenshot as product source of truth.
- Do not require browser-specific tests where current test environment does not support them; use evidence-driven unit tests if needed.

Required Validation:
- VAL-006
- VAL-007

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-022: Complete Deterministic Postprocess Routing

Task Type:
- flow_slice

Flow:
- FLOW-002

Priority:
- must

Depends On:
- TASK-003

Goal:
- Ensure postprocess remains deterministic, allowlist-gated, issue-code routed, and scope-safe.

Read Before This Task:
- `docs/validation-repair-stage.md`
- `docs/stitch2html-stage.md`
- `src/stitch/postprocess/postprocess-stitch-html.ts`
- `src/stitch/constraints/stitch-ui-constraints.yaml`

Implementation Scope:
- Confirm implemented fixes match documented allowed deterministic fixes.
- Confirm each fix can reject based on safety/applicability.
- Ensure disabled fixes are rejected with a clear reason.
- Ensure forbidden behavior is absent: no raw input reinterpretation, no product-scope changes, no whole-page style rewrite, no blueprint mutation.
- Ensure postprocess report records `appliedFixes` and `rejectedFixes`.

Expected Code Impact:
- `src/stitch/postprocess/postprocess-stitch-html.ts`
- tests for postprocess routing and allowlist

Out of Scope:
- Do not add LLM repair.
- Do not add new product flows or pages through postprocess.

Required Validation:
- VAL-008

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-023: Preserve Final Gate Authority

Task Type:
- flow_slice

Flow:
- FLOW-002

Priority:
- must

Depends On:
- TASK-020
- TASK-021
- TASK-022

Goal:
- Ensure final gate remains the only deliverability decision after page-level and cross-page validation.

Read Before This Task:
- `docs/validation-repair-stage.md`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- `src/blueprint/schemas/blueprint.ts`

Implementation Scope:
- Confirm final gate merges page-level failures, cross-page failures, and runtime backend authority failures.
- Ensure final gate does not mutate HTML, regenerate HTML, call Stitch, reinterpret raw input, or mutate blueprint.
- Ensure page can pass page-level validation but fail final gate due to cross-page validation.

Expected Code Impact:
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- tests for final gate behavior

Out of Scope:
- Do not change artifact consumers unless schema compatibility requires it.

Required Validation:
- VAL-004
- VAL-019

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-030: Build Candidate Prompt Plans

Task Type:
- flow_slice

Flow:
- FLOW-003

Priority:
- must

Depends On:
- TASK-001
- TASK-002
- TASK-004

Goal:
- Generate structured candidate `StitchPromptPlan` artifacts before rendering candidate prompt text.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/stitch2html-stage.md`
- `src/stitch/plan/build-stitch-prompt-plan.ts`
- `src/stitch/prompts/build-stitch-page-prompt.ts`

Implementation Scope:
- Add candidate-specific prompt plan builder or extend existing builder narrowly.
- Include documented fields: `pageId`, `pageRoute`, `mode`, `candidateIndex`, `generationGoal`, `layoutIntent`, `designSystemRef`, `requiredMarkers`, `requiredActions`, `allowedNavigationTargets`, `forbiddenChanges`, and `previousFailureCodes` when targeted reprompt is used.
- Ensure plans derive only from frozen blueprint, `PageContract`, compiled constraints, and allowed previous issue codes.

Expected Code Impact:
- `src/stitch/plan/build-stitch-prompt-plan.ts`
- new `src/stitch/candidate-search/build-candidate-prompt-plan.ts`
- schema/type updates from TASK-002
- tests in `tests/stitch-candidate-search.test.ts`

Out of Scope:
- Do not rely on brittle final prompt text snapshots as the only test.
- Do not add raw input to candidate plans.

Required Validation:
- VAL-010
- VAL-011

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-031: Render Bounded Candidate Prompts

Task Type:
- flow_slice

Flow:
- FLOW-003

Priority:
- must

Depends On:
- TASK-030

Goal:
- Render one bounded Stitch prompt per candidate plan.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/stitch2html-stage.md`
- `src/stitch/prompts/build-stitch-page-prompt.ts`
- `src/stitch/constraints/load-stitch-ui-constraints.ts`

Implementation Scope:
- Candidate prompts must prevent raw input reinterpretation, product scope changes, new flows, new pages, undeclared navigation, invented integrations/auth/payments/collaboration, and blueprint mutation.
- Candidate prompts must require declared markers/actions/routes.
- Candidate prompts may vary only visual/layout generation goal within allowed candidate plan fields.

Expected Code Impact:
- `src/stitch/prompts/build-stitch-page-prompt.ts`
- or new `src/stitch/candidate-search/render-candidate-prompt.ts`
- tests in `tests/stitch-candidate-search.test.ts`

Out of Scope:
- Do not encode internal postprocess fix IDs directly into prompts.
- Do not use raw input.

Required Validation:
- VAL-011

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-032: Generate Candidate HTML Attempts

Task Type:
- flow_slice

Flow:
- FLOW-003

Priority:
- must

Depends On:
- TASK-031

Goal:
- Generate up to the configured number of bounded candidate HTML attempts per page.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `src/stitch/pipeline/generate-stitch-html-artifacts.ts`
- `src/stitch/candidate-search/run-stitch-candidate-search.ts` if created

Implementation Scope:
- For each target page, generate `candidatesPerPage` candidate attempts.
- Persist candidate prompt plan, prompt, and HTML artifacts.
- Record candidate index and attempt IDs.
- Ensure generated attempts are bounded by configuration.
- Fail safely if generation throws, preserving diagnostic information where possible.

Expected Code Impact:
- `src/stitch/candidate-search/run-stitch-candidate-search.ts`
- repository artifact persistence code
- tests with fake stage client

Out of Scope:
- Do not introduce concurrent generation unless the repository persistence layer is safe for it.
- Do not silently discard failed candidates without diagnostics.

Required Validation:
- VAL-009
- VAL-017

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-033: Route Runtime Mode Without Breaking Existing CLI

Task Type:
- flow_slice

Flow:
- FLOW-003

Priority:
- must

Depends On:
- TASK-032

Goal:
- Integrate candidate-search mode into the existing pipeline entrypoint while preserving existing default CLI behavior.

Read Before This Task:
- `package.json`
- `src/cli/generate-stitch.ts`
- `src/cli/generate-all.ts`
- `src/stitch/pipeline/generate-stitch-html-artifacts.ts`

Implementation Scope:
- When config is absent or `mode: single`, run the existing default flow.
- When config is `mode: candidate-search` and experimental flag is enabled, run candidate-search.
- Keep public scripts unchanged unless a new explicit experimental script is necessary.
- If adding an experimental script, make it explicit and avoid changing existing script semantics.

Expected Code Impact:
- `src/cli/generate-stitch.ts`
- `src/cli/generate-all.ts`
- candidate-search routing module
- tests for route selection

Out of Scope:
- Do not require live Stitch SDK credentials for tests.
- Do not change `npm run stitch:generate` default semantics.

Required Validation:
- VAL-001
- VAL-009
- VAL-020

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-040: Validate Candidate Attempts

Task Type:
- flow_slice

Flow:
- FLOW-004

Priority:
- must

Depends On:
- TASK-032
- TASK-003

Goal:
- Run validation for each candidate attempt and attach validation report IDs to the attempt record.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- `src/stitch/validation/validate-stitch-html.ts`
- `src/stitch/runtime/validate-stitch-runtime.ts`

Implementation Scope:
- For each candidate attempt, run static validation and runtime validation.
- Run cross-page validation when bundle context exists and the implementation can provide all required pages.
- Store validation report IDs on the candidate attempt.
- Derive hard gate issues from validation issue codes.
- Set `hardGateResult` to `pass` or `fail`.

Expected Code Impact:
- candidate-search validation module
- repository persistence code
- tests with fake runtime validation client

Out of Scope:
- Do not let candidate selection proceed without required validation reports.
- Do not treat screenshots as product source-of-truth.

Required Validation:
- VAL-012
- VAL-017

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-041: Select Candidate by Hard Gates Then Soft Scores

Task Type:
- flow_slice

Flow:
- FLOW-004

Priority:
- must

Depends On:
- TASK-040

Goal:
- Select a candidate only after rejecting all candidates with hard gate failures.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- candidate-search hard gate utilities

Implementation Scope:
- Reject candidates with any hard gate issue.
- Persist rejection reasons for every rejected candidate.
- Rank only eligible candidates by deterministic soft score.
- Persist selected attempt ID when selection succeeds.
- Persist failure reasons when no candidate remains eligible.

Expected Code Impact:
- candidate-selection module
- candidate-search run persistence
- tests in `tests/stitch-candidate-search.test.ts`

Out of Scope:
- Do not allow soft score to override hard gate failure.
- Do not select a candidate with missing validation reports.

Required Validation:
- VAL-012
- VAL-013
- VAL-014

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-042: Expose Selected Candidate as Normal Validated Stitch Artifact

Task Type:
- flow_slice

Flow:
- FLOW-004

Priority:
- should

Depends On:
- TASK-041
- TASK-060

Goal:
- Make the selected candidate available to downstream consumers as the normal validated Stitch HTML artifact while preserving candidate-search lineage.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`
- `src/blueprint/persistence/repository.ts`

Implementation Scope:
- Produce output compatible with existing `GeneratedStitchHtmlArtifactsResult` or validated page artifact result.
- Preserve selected candidate manifest and candidate-search run artifacts.
- Ensure downstream final gate can consume selected candidates.

Expected Code Impact:
- candidate-search orchestration output adapter
- pipeline integration tests

Out of Scope:
- Do not remove candidate lineage after adaptation.
- Do not expose failed candidates as deliverable artifacts.

Required Validation:
- VAL-014
- VAL-018
- VAL-019

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-050: Implement Issue-Code Driven Targeted Reprompt

Task Type:
- flow_slice

Flow:
- FLOW-005

Priority:
- should

Depends On:
- TASK-041

Goal:
- Add bounded targeted reprompt attempts using only allowed candidate-search inputs.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- candidate prompt plan and rendering modules

Implementation Scope:
- Trigger targeted reprompt only in candidate-search mode.
- Use only `PageContract`, previous `StitchPromptPlan`, previous validation issue codes, previous candidate diagnostics, and compiled Stitch prompt constraints.
- Add issue-code-driven reprompt templates for `missing_primary_action`, `undeclared_navigation_destination`, `missing_feedback_surface`, and `sidebar_inconsistent_across_pages`.
- Track `previousFailureCodes` in targeted prompt plans.

Expected Code Impact:
- candidate-search reprompt module
- prompt plan schema/tests
- tests in `tests/stitch-candidate-search.test.ts`

Out of Scope:
- Do not use raw user input.
- Do not accept vague semantic preferences.
- Do not create unbounded style requests.

Required Validation:
- VAL-015
- VAL-016

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-051: Enforce Reprompt Budgets

Task Type:
- flow_slice

Flow:
- FLOW-005

Priority:
- must if TASK-050 is implemented

Depends On:
- TASK-050

Goal:
- Ensure targeted reprompt cannot become an unbounded retry loop.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `src/stitch/constraints/load-stitch-ui-constraints.ts`
- candidate-search run module

Implementation Scope:
- Enforce `maxRepromptAttempts`.
- Enforce `maxCandidatesPerReprompt`.
- Persist budget exhaustion as a failure reason when no candidate becomes eligible.
- Ensure default path cannot enter reprompt.

Expected Code Impact:
- candidate-search run module
- tests for budget limits

Out of Scope:
- Do not add infinite while loops or retry-until-pass logic.
- Do not silently skip budget violations.

Required Validation:
- VAL-009
- VAL-016

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-060: Persist Candidate Search Run and Attempt Lineage

Task Type:
- flow_slice

Flow:
- FLOW-006

Priority:
- must

Depends On:
- TASK-032
- TASK-040
- TASK-041

Goal:
- Persist candidate-search lineage artifacts required by documentation.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/blueprint/persistence/repository.ts`
- `src/blueprint/schemas/blueprint.ts`

Implementation Scope:
- Persist `stitch_candidate_search_run`, `stitch_candidate_attempt`, `stitch_candidate_prompt_plan`, `stitch_candidate_prompt`, `stitch_candidate_html`, candidate validation reports, `candidate_selection_report`, `rejected_candidate_report`, and `selected_candidate_manifest`.
- Ensure every rejected candidate has rejection reasons.
- Ensure selected candidate lineage remains available after adaptation to normal validated artifact.

Expected Code Impact:
- artifact schemas/types
- repository persistence
- candidate-search orchestration
- tests

Out of Scope:
- Do not replace default artifact names in default path.
- Do not omit rejected candidates.

Required Validation:
- VAL-017
- VAL-018

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-061: Persist Validation and Postprocess Evidence for Selected Candidate

Task Type:
- flow_slice

Flow:
- FLOW-006

Priority:
- must

Depends On:
- TASK-060

Goal:
- Ensure the selected candidate has validation reports proving eligibility and postprocess history where applicable.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/stitch/pipeline/validate-repair-stitch-html-artifacts.ts`

Implementation Scope:
- Attach static/runtime/cross-page report IDs to selected attempt.
- Attach postprocess report ID if deterministic postprocess was applied.
- Re-run validation after postprocess before selection is finalized.
- Persist final decision as selected or failed.

Expected Code Impact:
- candidate-search validation/selection module
- artifact persistence tests

Out of Scope:
- Do not mark a candidate selected without validation proof.
- Do not use screenshots as product source of truth.

Required Validation:
- VAL-014
- VAL-017
- VAL-019

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

## 7. Cross-Flow Hardening Task Catalog

### TASK-090: Implement Stage Contract Tests

Task Type:
- cross_flow_hardening

Applies To:
- FLOW-001
- FLOW-002
- FLOW-003
- FLOW-004
- FLOW-005
- FLOW-006

Depends On:
- TASK-010
- TASK-012
- TASK-030
- TASK-041
- TASK-050
- TASK-060

Goal:
- Make `docs/stage-contract-test-matrix.md` executable through focused tests.

Read Before This Task:
- `docs/stage-contract-test-matrix.md`
- `tests/blueprint.test.ts`
- `tests/stitch-candidate-search.test.ts`

Implementation Scope:
- Add or update tests for every matrix row.
- Prefer focused contract tests over broad snapshots.

Out of Scope:
- Do not require live Stitch SDK calls.

Required Validation:
- VAL-021

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-091: Hardening for Source-of-Truth Boundaries

Task Type:
- cross_flow_hardening

Applies To:
- FLOW-001
- FLOW-003
- FLOW-005

Depends On:
- TASK-011
- TASK-030
- TASK-050

Goal:
- Prove that raw input, unfrozen draft blueprint data, and vague semantic preferences cannot enter Stitch default generation or candidate-search generation.

Read Before This Task:
- `docs/stitch2html-stage.md`
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- prompt plan and prompt rendering code

Implementation Scope:
- Add adversarial tests with raw input containing product changes not present in frozen blueprint.
- Assert prompt plans, prompts, targeted reprompts, and selected artifacts do not include those raw-input-only changes.
- Assert targeted reprompt uses issue codes and previous diagnostics only.

Out of Scope:
- Do not alter blueprint generation.
- Do not introduce a sanitizer that hides real bugs without enforcing source boundaries.

Required Validation:
- VAL-003
- VAL-011
- VAL-015

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

### TASK-092: Hardening for Artifact Compatibility

Task Type:
- cross_flow_hardening

Applies To:
- FLOW-001
- FLOW-004
- FLOW-006

Depends On:
- TASK-042
- TASK-060
- TASK-061

Goal:
- Ensure candidate-search artifacts add lineage without breaking default artifact consumers.

Read Before This Task:
- `docs/stitch-candidate-search-stage.md`
- `docs/validation-repair-stage.md`
- `src/blueprint/persistence/repository.ts`
- downstream pipeline code that consumes validated Stitch artifacts

Implementation Scope:
- Add tests proving default artifacts are unchanged in default mode.
- Add tests proving selected candidate can be consumed as normal validated Stitch HTML.
- Add tests proving candidate-search lineage remains available.

Out of Scope:
- Do not migrate historical artifacts.
- Do not remove or rename default artifact kinds.

Required Validation:
- VAL-018
- VAL-019

Completion Rule:
- Required implementation is done.
- Required validation passes.
- Runtime worklog is updated according to `AGENTS.md`, or blocker is recorded with evidence.

## 8. Validation Catalog

### VAL-001: Default Mode Remains Single

Validation Type:
- contract

Purpose:
- Prove candidate-search is disabled by default and existing generation path remains single-candidate.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- With absent/default config, each page produces exactly one prompt and one HTML artifact, and candidate-search orchestration is not invoked.

Used By:
- TASK-001
- TASK-004
- TASK-010
- TASK-033

Failure Meaning:
- Default mode behavior changed or candidate-search is reachable without explicit opt-in.

### VAL-002: Build Succeeds

Validation Type:
- release

Purpose:
- Prove TypeScript types, schemas, and imports compile.

Command or Evidence:
```bash
npm run build
```

Claim Proven:
- Implementation compiles under repository TypeScript configuration.

Used By:
- TASK-010
- TASK-090

Failure Meaning:
- Code changes are not type-safe or module boundaries are broken.

### VAL-003: Raw Input Boundary Test

Validation Type:
- contract

Purpose:
- Prove Stitch generation and candidate-search do not consume raw user input directly.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Prompt plan, prompt rendering, candidate prompt plans, and targeted reprompt use frozen blueprint/PageContract/issue codes, not raw input-only content.

Used By:
- TASK-011
- TASK-091

Failure Meaning:
- Product source-of-truth boundary is violated.

### VAL-004: Default Validation Does Not Regenerate HTML

Validation Type:
- contract

Purpose:
- Prove default validation failure cannot call Stitch generation or LLM repair.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Default validation pipeline may run deterministic postprocess and re-validation, but does not call Stitch generation client or targeted reprompt.

Used By:
- TASK-012
- TASK-023
- TASK-090

Failure Meaning:
- Default path is no longer deterministic after validation failure.

### VAL-005: Static Validation Issue Codes

Validation Type:
- unit

Purpose:
- Prove documented static validation issue codes are emitted under documented conditions.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Static validation covers empty HTML, missing visible root, missing page root marker, missing actions/surfaces, invented navigation, and undeclared destinations.

Used By:
- TASK-020

Failure Meaning:
- Static validation contract is incomplete or mismatched with docs.

### VAL-006: Runtime Validation Meaningful Effects

Validation Type:
- unit / integration

Purpose:
- Prove runtime validation recognizes meaningful visible effects and rejects insufficient effects.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Declared clickable targets pass only with visible DOM/route/dialog/drawer/toast/form/tab effects and fail for focus/hover/active-only/no-op behavior.

Used By:
- TASK-021

Failure Meaning:
- Runtime validation may accept non-functional generated UI behavior.

### VAL-007: Runtime Evidence Shape

Validation Type:
- contract

Purpose:
- Prove runtime evidence is structured and does not require screenshot artifact IDs as product truth.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Runtime evidence includes documented structured fields and omits screenshot artifact dependency from the source-of-truth model.

Used By:
- TASK-021
- TASK-090

Failure Meaning:
- Runtime evidence is not audit-ready or screenshots are leaking into product truth.

### VAL-008: Postprocess Routing and Allowlist

Validation Type:
- unit

Purpose:
- Prove deterministic postprocess is issue-code-routed, YAML-allowlisted, safety/applicability-gated, and report-backed.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Disabled fixes are rejected, enabled applicable fixes are applied, rejected fixes include reasons, and postprocess does not change product scope.

Used By:
- TASK-022
- TASK-090

Failure Meaning:
- Postprocess may perform undocumented or unsafe repair.

### VAL-009: Candidate Search Opt-In and Bounds

Validation Type:
- contract

Purpose:
- Prove candidate-search runs only when explicitly enabled and respects candidate budgets.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Candidate-search is blocked by default, allowed only with enabled experimental config, and bounded by `candidatesPerPage`, `maxRepromptAttempts`, and `maxCandidatesPerReprompt`.

Used By:
- TASK-001
- TASK-004
- TASK-032
- TASK-033
- TASK-051

Failure Meaning:
- Experimental path may run unexpectedly or become unbounded.

### VAL-010: Candidate PromptPlan Structure

Validation Type:
- unit / contract

Purpose:
- Prove candidate prompt plans are structured and testable.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Candidate `StitchPromptPlan` includes documented fields and schema validation passes.

Used By:
- TASK-002
- TASK-030

Failure Meaning:
- Candidate plans are brittle prompt text only or missing required contract fields.

### VAL-011: Candidate Prompt Source Boundary

Validation Type:
- contract

Purpose:
- Prove candidate prompts are bounded to frozen blueprint, PageContract, constraints, and issue codes.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Candidate prompts do not include raw input-only product changes or free-form product reinterpretation.

Used By:
- TASK-030
- TASK-031
- TASK-091

Failure Meaning:
- Candidate-search can change product scope.

### VAL-012: Hard Gate Failure Blocks Selection

Validation Type:
- unit / contract

Purpose:
- Prove hard gate failures make candidates ineligible.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Any candidate with documented hard gate issue codes cannot be selected.

Used By:
- TASK-003
- TASK-040
- TASK-041

Failure Meaning:
- Candidate selection can produce invalid artifacts.

### VAL-013: Soft Score Cannot Override Hard Gate

Validation Type:
- unit / contract

Purpose:
- Prove soft scores only rank already-eligible candidates.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- A high soft score does not select a candidate with hard gate failure.

Used By:
- TASK-003
- TASK-041

Failure Meaning:
- Visual preference can override correctness.

### VAL-014: Candidate Selection Final Decision

Validation Type:
- flow_level

Purpose:
- Prove candidate selection persists selected or failed final decision with correct reasons.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Selection persists selected attempt ID for eligible winners or failure reasons when no eligible candidates remain.

Used By:
- TASK-041
- TASK-042
- TASK-061

Failure Meaning:
- Candidate-search result is not auditable or deterministic.

### VAL-015: Targeted Reprompt Uses Issue Codes Only

Validation Type:
- contract

Purpose:
- Prove targeted reprompt uses issue codes and allowed diagnostics, not raw input or new requirements.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Targeted reprompt prompt plans include previous failure codes and exclude raw input/new product requirements.

Used By:
- TASK-050
- TASK-091

Failure Meaning:
- Targeted reprompt may reinterpret product scope.

### VAL-016: Reprompt Budget Enforcement

Validation Type:
- unit / contract

Purpose:
- Prove targeted reprompt is bounded.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Reprompt attempts and reprompt candidates never exceed config.

Used By:
- TASK-050
- TASK-051

Failure Meaning:
- Candidate-search can become an unbounded retry loop.

### VAL-017: Candidate Lineage Persistence

Validation Type:
- integration / contract

Purpose:
- Prove candidate-search persists attempt, run, prompt, HTML, validation, selection, rejected, and selected manifest artifacts.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Every candidate attempt is represented; every rejected candidate has rejection reasons; selected candidate has lineage.

Used By:
- TASK-002
- TASK-032
- TASK-040
- TASK-060
- TASK-061

Failure Meaning:
- Candidate-search is not debuggable or audit-ready.

### VAL-018: Artifact Compatibility

Validation Type:
- integration

Purpose:
- Prove candidate-search selected output remains compatible with downstream validated Stitch artifact consumption.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Selected candidate can be exposed as normal validated Stitch HTML while candidate-search lineage remains available.

Used By:
- TASK-042
- TASK-060
- TASK-092

Failure Meaning:
- Experimental path breaks downstream artifact consumers.

### VAL-019: Final Gate Release Evidence

Validation Type:
- flow_level / release

Purpose:
- Prove final gate reports deliverability using page, cross-page, postprocess, and runtime backend authority evidence.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Final validation gate is the release decision and can fail pages that pass page-level validation but fail cross-page or runtime authority checks.

Used By:
- TASK-023
- TASK-042
- TASK-061
- TASK-092

Failure Meaning:
- Deliverability is not governed by the documented final gate.

### VAL-020: CLI Default Behavior

Validation Type:
- manual_smoke / release

Purpose:
- Prove existing CLI scripts retain their current default semantics.

Command or Evidence:
```bash
npm run build
npm test
```

Claim Proven:
- Existing package scripts still build and test successfully after routing changes.

Used By:
- TASK-033

Failure Meaning:
- Integration changed default developer workflow.

### VAL-021: Stage Contract Matrix Passes

Validation Type:
- release

Purpose:
- Prove all stage contract matrix claims have executable coverage.

Command or Evidence:
```bash
npm test
```

Claim Proven:
- Every row in `docs/stage-contract-test-matrix.md` is represented by a focused test.

Used By:
- TASK-090

Failure Meaning:
- Documentation contracts are not executable.

## 9. Flow-Level Validation

| Flow | Required Validation | Claim Proven | Evidence |
|---|---|---|---|
| FLOW-001 | VAL-001, VAL-002, VAL-003, VAL-004 | Default generation is single-candidate, build-safe, raw-input-free, and does not regenerate after validation failure. | `npm run build`; `npm test` |
| FLOW-002 | VAL-005, VAL-006, VAL-007, VAL-008, VAL-019 | Validation, postprocess, evidence, and final gate match documented contracts. | `npm test` |
| FLOW-003 | VAL-009, VAL-010, VAL-011 | Candidate-search is opt-in, bounded, and prompt-plan based. | `npm test` |
| FLOW-004 | VAL-012, VAL-013, VAL-014 | Candidate selection rejects hard gate failures before soft scoring. | `npm test` |
| FLOW-005 | VAL-015, VAL-016 | Targeted reprompt is issue-code-driven and budgeted. | `npm test` |
| FLOW-006 | VAL-017, VAL-018, VAL-019 | Candidate lineage and selected artifact compatibility are persisted and release-gated. | `npm test` |

## 10. UI-Level Validation

| Flow / Task | UI Claim | Required Evidence | Related UI Sources |
|---|---|---|---|
| FLOW-001 | Not applicable; generated HTML artifact flow. | Static/runtime artifact validation, not UI reference validation. | none |
| FLOW-002 | Generated HTML actions must have meaningful visible behavior when clicked. | VAL-006 runtime validation evidence. | none |
| FLOW-003 | Not applicable; candidate generation artifact flow. | Candidate prompt and artifact tests. | none |
| FLOW-004 | Not applicable; candidate selection consumes reports. | Selection tests. | none |
| FLOW-005 | Not applicable; reprompt consumes issue codes. | Reprompt source-boundary tests. | none |
| FLOW-006 | Not applicable; lineage artifacts. | Artifact persistence tests. | none |

## 11. Task-to-Validation Mapping

| Task | Required Validation | Completion Requirement |
|---|---|---|
| TASK-001 | VAL-001, VAL-009 | Config defaults and opt-in gating implemented; tests pass; worklog updated. |
| TASK-002 | VAL-010, VAL-017 | Candidate schemas/types parse and persist required structures; tests pass; worklog updated. |
| TASK-003 | VAL-012, VAL-013 | Hard gate and soft score utilities enforce selection rules; tests pass; worklog updated. |
| TASK-004 | VAL-001, VAL-009, VAL-011 | Candidate orchestration entrypoint is gated and source-safe; tests pass; worklog updated. |
| TASK-010 | VAL-001, VAL-002 | Default one-prompt-per-page behavior preserved; build/tests pass; worklog updated. |
| TASK-011 | VAL-003 | Raw input cannot enter Stitch prompts; tests pass; worklog updated. |
| TASK-012 | VAL-004 | Default validation cannot regenerate HTML; tests pass; worklog updated. |
| TASK-020 | VAL-005 | Static validation issue codes match docs; tests pass; worklog updated. |
| TASK-021 | VAL-006, VAL-007 | Runtime validation/evidence match docs; tests pass; worklog updated. |
| TASK-022 | VAL-008 | Deterministic postprocess routing/allowlist/reporting works; tests pass; worklog updated. |
| TASK-023 | VAL-004, VAL-019 | Final gate remains deliverability authority; tests pass; worklog updated. |
| TASK-030 | VAL-010, VAL-011 | Candidate prompt plans are structured and source-safe; tests pass; worklog updated. |
| TASK-031 | VAL-011 | Candidate prompts are bounded and source-safe; tests pass; worklog updated. |
| TASK-032 | VAL-009, VAL-017 | Candidate generation is bounded and attempts are persisted; tests pass; worklog updated. |
| TASK-033 | VAL-001, VAL-009, VAL-020 | Runtime routing preserves default CLI behavior; build/tests pass; worklog updated. |
| TASK-040 | VAL-012, VAL-017 | Candidate attempts have validation report IDs and hard gate results; tests pass; worklog updated. |
| TASK-041 | VAL-012, VAL-013, VAL-014 | Selection rejects hard gate failures and persists final decision; tests pass; worklog updated. |
| TASK-042 | VAL-014, VAL-018, VAL-019 | Selected candidate adapts to normal validated artifact output; tests pass; worklog updated. |
| TASK-050 | VAL-015, VAL-016 | Targeted reprompt uses issue codes only and remains bounded; tests pass; worklog updated. |
| TASK-051 | VAL-009, VAL-016 | Reprompt budgets enforced; tests pass; worklog updated. |
| TASK-060 | VAL-017, VAL-018 | Candidate lineage artifacts persisted; tests pass; worklog updated. |
| TASK-061 | VAL-014, VAL-017, VAL-019 | Selected candidate has validation/postprocess evidence; tests pass; worklog updated. |
| TASK-090 | VAL-021 | Stage contract matrix has executable coverage; tests pass; worklog updated. |
| TASK-091 | VAL-003, VAL-011, VAL-015 | Source-of-truth boundary hardened across flows; tests pass; worklog updated. |
| TASK-092 | VAL-018, VAL-019 | Artifact compatibility hardened; tests pass; worklog updated. |

## 12. Release Validation

Before considering the implementation complete, Codex must run:

```bash
npm run build
npm test
```

Release validation claims:

```text
TypeScript compilation succeeds.
Default single-candidate path remains default.
Candidate-search is explicitly opt-in.
Static/runtime/cross-page validation contracts pass.
Deterministic postprocess is issue-code-routed and allowlist-gated.
Default validation does not regenerate HTML.
Candidate-search creates bounded prompt plans and bounded attempts.
Hard gate failures cannot be selected.
Soft scores cannot override hard gate failures.
Rejected candidate diagnostics are persisted.
Targeted reprompt uses issue codes only and respects budgets.
Selected candidate lineage and default artifact compatibility are preserved.
Final validation gate remains the deliverability authority.
```

If `npm test` cannot run because the test environment lacks an external runtime dependency, Codex must record the blocker and provide the strongest available evidence:

```text
npm run build output
unit/contract test subset output
manual evidence of the unsupported dependency
exact command that failed
reason the failure is environmental rather than implementation-related
```

Codex must not mark release validation complete based only on code inspection.

## 13. Codex Execution Report Rules

`docs/execution/codex-execution-report.md` is created and maintained by Codex according to `AGENTS.md`.

Task completion may require updating the runtime worklog, but this document does not define the worklog format source of truth.

For every completed task, Codex must record:

```text
task ID
files changed
validation commands run
validation result
blockers, if any
```

If a task is blocked, Codex must record the blocker with evidence instead of inventing missing decisions or continuing into unsafe scope.

## 14. Execution Readiness

Status: ready

Known constraints:

```text
Candidate-search is experimental and must remain opt-in.
Default Stitch generation must remain single-candidate.
Frozen ProductBlueprintV1 and PageContract remain the only product source of truth.
Targeted reprompt is allowed only in candidate-search mode and only within explicit budgets.
Soft scores may rank only hard-gate-passing candidates.
Every rejected candidate must persist rejection reasons.
The selected candidate must have validation reports proving eligibility.
```

Execution can begin with TASK-001 through TASK-004, then proceed through default-path guardrails before implementing candidate-search flow slices.
