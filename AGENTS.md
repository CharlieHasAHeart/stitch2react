# AGENTS.md

## Purpose

This repository implements a one-shot product understanding pipeline.

The system converts exactly one user input into a frozen `ProductBlueprintV1`, then uses that frozen blueprint as the only source of truth for downstream Stitch, React, mock data, API, and state-generation work.

Codex must treat this file as the repository-level operating guide.

## Required Reading Order

Before implementing or modifying this system, read these documents in order:

1. `docs/ProductBlueprintV1-Type-Definitions.md`
   - Defines the TypeScript type definitions for `ProductBlueprintV1`.
   - This document answers: "What is the target data structure?"

2. `docs/ProductBlueprintV1-Generation-Pipeline-Design.md`
   - Defines the staged LLM generation pipeline, artifact passing, validation, repair, freeze rules, and Responses API usage.
   - This document answers: "How do we generate, validate, repair, freeze, and consume the blueprint?"

If these files are stored elsewhere in the repository, locate them by filename and follow the same reading order.

## Non-negotiable Architecture Rules

### 1. One user input only

The product flow assumes the user provides one input only.

Do not implement user follow-up questions as part of the blueprint generation pipeline.

When information is missing:
- make conservative MVP assumptions
- mark assumptions explicitly
- assign confidence
- record unresolved questions
- provide default decisions
- continue generation safely

### 2. Product Blueprint is the source of truth

The raw user input is only used to generate the blueprint.

After a `ProductBlueprintV1` is frozen, downstream systems must not reinterpret the raw input.

Correct:

```text
rawInput -> ProductBlueprintV1 -> freeze -> Stitch / React / Mock API / State
```

Incorrect:

```text
rawInput -> Stitch
rawInput -> React
rawInput -> Mock API
```

### 3. Flow before pages

Do not generate pages directly from the raw user input.

The pipeline must generate:
1. product intent
2. users
3. domain model
4. flows
5. UI model / page contracts
6. policies and uncertainty
7. assembled blueprint

Pages must be derived from flows.

A page is a UI surface that supports one or more flows.

### 4. Core User Flow is not page navigation

A Core User Flow must describe:
- user goal
- trigger
- steps
- system effects
- feedback
- recovery
- completion signal
- involved entities
- UI surfaces

Do not reduce a flow to route changes, button clicks, or page order.

### 5. Every important field must be traceable

Important fields use `Field<T>`.

Respect the distinction:

```text
explicit  = user explicitly said it
inferred  = model inferred it from context
defaulted = system default policy filled it in
```

Do not mark inferred or defaulted information as explicit.

Do not silently invent product scope.

### 6. Conservative MVP by default

When the user input is short or ambiguous:
- generate a conservative MVP
- limit the number of Core User Flows
- limit the number of pages
- do not add payments unless explicitly requested
- do not add team collaboration unless explicitly requested
- do not add complex permissions unless explicitly requested
- do not add integrations unless explicitly requested
- do not add authentication unless required by the stated product or explicitly requested

### 7. Real HTML over visual illusion

For Stitch-facing outputs, preserve this rule:

- Main UI must be represented as real editable HTML elements.
- Do not allow UI-as-image.
- Images may be used only as subtle decorative backgrounds, ambient accents, thumbnails, avatars, or content images.
- Navigation, forms, tables, cards, buttons, charts, and important text must not be embedded inside raster images.

## Generation Pipeline

Implement the pipeline as explicit JSON artifact passing.

Do not rely on implicit model conversation state.

The required organization is **phase + gate + repair routing**, not a single linear generate-everything chain.

```text
Phase 0: Session and input contract
  Stage: input_contract
  Output:
    - raw input artifact
    - GlobalGenerationPolicySeed
  Gate: input_contract

Phase 1: Product frame
  Stages:
    - input_understanding
    - product_frame
  Output:
    - InputUnderstanding
    - ProductIntent
    - UserModel
  Gate: intent_scope

Phase 2: Product behavior model
  Stages:
    - domain_modeling
    - flow_modeling
    - optional flow_quality_review
  Output:
    - DomainModel
    - FlowModel
  Gate: domain_flow_consistency

Phase 3: UI contract model
  Stages:
    - ui_modeling
    - optional ui_contract_review
  Output:
    - UIModel
  Gate: flow_ui_coverage

Phase 4: Blueprint assembly
  Stages:
    - policy_uncertainty
    - blueprint_assembly
    - deterministic_validation
  Output:
    - VisualPolicy
    - GenerationPolicy
    - UncertaintyModel
    - ProductBlueprintV1
    - ValidationReport
  Gate: full_deterministic_validation

Phase 5: Quality and targeted repair
  Stages:
    - semantic_quality_review
    - repair_routing
    - blueprint_repair, when schema or deterministic semantic validation fails
    - quality_repair, when quality review finds targeted-repairable issues
  Output:
    - BlueprintQualityReport
    - RepairPlan, when needed
    - repaired ProductBlueprintV1, when needed
  Gate: quality_revalidation

Phase 6: Freeze
  Stage:
    - freeze
  Output:
    - frozen ProductBlueprintV1
```

### Gate behavior

Codex must not move to the next dependency layer when the current gate has blocking issues.

Use these gates:

```text
input_contract
intent_scope
domain_flow_consistency
flow_ui_coverage
full_deterministic_validation
quality_revalidation
```

Gate responsibilities:

- `input_contract`: one-shot mode, raw input artifact, and global generation policy seed exist.
- `intent_scope`: explicit constraints are preserved and conservative MVP scope is respected.
- `domain_flow_consistency`: flows are grounded in product intent, user model, and domain model.
- `flow_ui_coverage`: pages support valid flow ids and core flows have visible UI surfaces.
- `full_deterministic_validation`: schema and deterministic semantic validation pass.
- `quality_revalidation`: post-repair schema, semantic, and quality checks pass.

### Early global policy seed

Before any LLM stage, create or pass a policy seed equivalent to:

```text
noFollowUpQuestions = true
assumptionStrategy = conservative_mvp
forbidUiAsImage = true
explicitBeatsInferred = true
doNotExpandScope = true
```

This policy constrains every generation stage. Do not wait until `policy_uncertainty` to enforce it.

### Repair routing

Repair is a router, not a broad rewrite stage.

Use these routes or equivalent internal names:

```text
no_repair_needed
code_schema_repair
code_reference_repair
code_policy_repair
llm_semantic_local_repair
quality_repair
manual_blocking_issue
```

`blueprint_repair` is for schema or deterministic semantic defects.

`quality_repair` is for targeted quality defects after schema and deterministic semantic validation have already passed.

Do not use broad full-blueprint regeneration when a local targeted repair is sufficient.


## Quality Repair Safety Rules

Codex must treat LLM-assisted repair output as untrusted until deterministic guards pass.

### 1. Never assign LLM quality repair output directly

Incorrect:

```ts
activeBlueprint = qualityRepairStage.output;
```

Correct:

```ts
const locallyRepaired = repairBlueprintQuality(activeBlueprint, qualityReviewReport);
const candidate = qualityRepairStage.output;
const { guardedBlueprint, guardReport } = enforceQualityRepairInvariants({
  beforeRepair: activeBlueprint,
  locallyRepaired,
  candidate,
  qualityReviewReport,
  repairPlan
});
persistRepairGuardReport(guardReport);
activeBlueprint = guardedBlueprint;
```

The LLM output is a repair candidate, not the active blueprint.

### 2. Deterministic local repair must be protected

If deterministic local repair changes protected fields, later LLM repair must not revert those changes.

Protected examples:

```text
ui.appStructure.shell
ui.responsivePolicy.mobileFirst
ui.responsivePolicy.breakpoints
generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage
input.raw
ids
flow references
page references
explicit-source facts
```

If the LLM candidate reverts a protected field, the post-repair guard must either restore the deterministic value or reject the candidate.

### 3. Layer repair must feed forward

If a flow-layer or UI-layer quality repair changes a blueprint snapshot, Codex must do one of the following:

```text
1. Extract and persist the repaired layer artifact, then use it in downstream stages.
2. Regenerate the affected layer.
3. Keep the gate blocked.
```

Do not clear a gate while downstream stages still consume the original defective artifact.

Examples:

```text
If flow_quality_review repairs FlowModel, ui_modeling must consume the repaired FlowModel.
If ui_contract_review repairs UIModel, policy_uncertainty and blueprint_assembly must consume the repaired UIModel.
```

### 4. Quality reports are immutable

Do not clear quality report issues manually after repair.

Incorrect:

```ts
activeReport = {
  ...activeReport,
  passed: true,
  issues: []
};
```

Correct:

```text
original report remains unchanged
repair plan is persisted
repair candidate is persisted
post-repair guard runs
new quality review report is generated
new report determines whether the gate passes
```

Only a new quality review report may clear previous issues.

### 5. Page role classification must not use business nouns

Do not classify result pages using business nouns such as:

```text
quote
booking
order
request
invoice
report
assessment
application
case
record
```

Use page semantics instead:

```text
readonly
confirmationOnly
route/name/id role words such as result, success, confirmation, complete, completed
purpose
primary actions
secondary actions
completionSignals
states
```

A page such as `quote_request_form_page` is an input page when it has form/input/submit behavior, even though it contains the word `quote`.

For explicit outcome repair:

```text
input page purpose = collect required user input and submit it to generate the visible result
result page purpose = show the immediate estimated result after submission
```

Do not give an input page the same purpose as a result page.

### 6. Required regression tests

When modifying quality repair, add deterministic tests for:

```text
quote_request_form_page is not classified as a result page
LLM quality_repair cannot revert appStructure or responsivePolicy deterministic repairs
layer repair output is used by downstream stages or the gate remains blocked
quality reports are not synthetically cleared
flow_quality_weak targeted repair strengthens validation steps and feedback
ui_contract_ambiguous repair separates input page purpose from result page purpose
```

## Responses API Usage

Use independent Responses API calls per stage.

Use explicit stage payloads and structured outputs.

Recommended parameters:
- `model`
- `instructions`
- `input`
- `text.format.json_schema`
- `reasoning`
- `temperature`
- `max_output_tokens`
- `store`
- `metadata`

Do not use these for blueprint generation:
- `conversation`
- `previous_response_id`
- `tools`
- `tool_choice`
- `parallel_tool_calls`
- `web_search_preview`
- `file_search`
- `code_interpreter`
- `stream`
- `top_p`

Use `metadata` only for non-sensitive trace identifiers:
- `sessionId`
- `stageRunId`
- `stage`
- `promptVersion`

Do not put full user inputs, private data, or large artifacts in metadata.

## Stage Runner Requirement

Implement a reusable stage runner.

It should:
- accept stage name
- accept stage instructions
- accept explicit JSON payload
- accept stage-specific JSON Schema
- call Responses API
- parse structured JSON output
- save the OpenAI response id for debugging
- save output as an artifact
- return typed output

The stage runner must not depend on hidden conversation state.

## ID Model

Do not use OpenAI `response.id` as the application session id.

Use separate IDs:

```text
sessionId        = one product generation workflow
stageRunId      = one LLM stage execution
artifactId      = one persisted input/output artifact
blueprintId     = one ProductBlueprintV1 version
validationId    = one validation report
openaiResponseId = one OpenAI response id, used only for observability/debugging
```

Recommended prefixes:
- `sess_`
- `stage_`
- `art_`
- `bp_`
- `val_`
- `stitch_`
- `react_`

## Persistence Requirements

Persist at minimum:

1. `generation_sessions`
   - session id
   - status
   - raw input artifact id
   - active blueprint id
   - timestamps

2. `generation_stage_runs`
   - stage run id
   - session id
   - stage
   - prompt version
   - model
   - input artifact ids
   - output artifact id
   - OpenAI response id
   - status
   - timestamps
   - error

3. `generation_artifacts`
   - artifact id
   - session id
   - artifact type
   - version
   - JSON or URI
   - checksum if available
   - timestamp

4. `blueprint_versions`
   - blueprint id
   - session id
   - version
   - status: draft / repaired / validated / frozen / superseded
   - artifact id
   - validation report id
   - timestamp

5. `validation_reports`
   - validation id
   - session id
   - blueprint id
   - schema validity
   - semantic validity
   - issues

6. `quality_review_reports`
   - quality review id
   - session id
   - blueprint id
   - passed flag
   - immutable issues

7. `repair_plans`
   - repair plan id
   - source report or gate
   - route
   - affected paths
   - allowed mutation paths
   - protected paths

8. `repair_guard_reports`
   - guard report id
   - candidate artifact id
   - guarded artifact id
   - rejected or reverted changes
   - re-applied deterministic invariants

## Validation Requirements

Validation has two layers.

### Schema validation

Validate generated JSON against the relevant schema.

Use Zod, JSON Schema, or an equivalent runtime validator.

### Semantic validation

At minimum, validate:

- every `CoreUserFlow` has a trigger
- every `CoreUserFlow` has at least two meaningful steps
- every `CoreUserFlow` has a completion signal
- every `CoreUserFlow` has at least one UI surface
- every user-visible flow has feedback
- every `PageContract` supports at least one flow
- every `PageContract.supportsFlowIds` reference points to a page-supportable flow id
- every `UIAction.triggersFlowId` reference points to an action-triggerable flow id
- every non-confirmation/non-readonly page has a primary action
- every primary action has expected feedback or a clear target
- every recovery flow has at least one recovery action
- every unresolved question has a default decision
- `visualPolicy.imageUsage.forbidUiAsImage` is `true`
- `generationPolicy.noFollowUpQuestions` is `true`
- max pages and max flows respect generation policy unless the user explicitly requested more
- explicit user constraints are not violated

If validation fails, create a validation report and run bounded repair.



### Flow reference validation scope

Semantic validators must not validate UI flow references against `coreUserFlows` only.

Collect valid flow ids from all relevant flow categories:

```text
flows.coreUserFlows
flows.supportingInteractionFlows
flows.sideEffectFlows
flows.feedbackFlows
flows.recoveryFlows
```

Use separate allowed sets for different UI references.

For `PageContract.supportsFlowIds`, allow references to:

```text
coreUserFlows
supportingInteractionFlows
feedbackFlows
recoveryFlows
sideEffectFlows only when visibleToUser or feedbackSurface is present
```

For `UIAction.triggersFlowId`, allow references to:

```text
coreUserFlows
supportingInteractionFlows
recoveryFlows
sideEffectFlows only when visibleToUser or feedbackSurface is present
```

`UIAction.triggersFlowId` should not normally reference `feedbackFlows` directly.

Feedback flows should usually be connected through:

```text
UIAction.expectedFeedback
PageContract.feedbackSurfaces
UIState.visibleMessage
PageContract.supportsFlowIds
```

If a UI reference points to a flow id that exists in `supportingInteractionFlows`, `feedbackFlows`, or `recoveryFlows`, do not classify it as unknown merely because it is not a core user flow.

That is a validator-scope bug, not a blueprint repair problem.

Do not ask the repair step to remove or flatten valid supporting, feedback, or recovery flow references into core flow references.


## Repair Rules

Repair must be bounded.

Default max repair attempts: 2.

Repair instructions must include:
- validation errors
- invalid blueprint
- repair rules
- instruction to return the full corrected blueprint

Repair must not:
- change explicit user facts
- expand scope
- add unrelated features
- reinterpret the raw user input
- replace the whole blueprint unless necessary for consistency

If repair fails after max attempts:
- mark the session failed
- persist all artifacts
- persist the final validation report
- expose enough debugging information for developers

## Freeze Rule

A blueprint can be frozen only after:

- schema validation passes
- deterministic semantic validation passes
- quality review passes or has no unresolved blocker / high misleading issues
- repair is not needed, or repair has passed validation and affected-area quality review
- all targeted-repairable quality blockers have either been repaired or explicitly downgraded with persisted rationale

After freeze:

- set `session.activeBlueprintId`
- mark the blueprint version as `frozen`
- mark previous non-frozen versions as `superseded` where appropriate
- prevent downstream generation from using raw input as the primary source

Do not freeze a blueprint with unresolved blocker quality issues.

Do not fail a session for targeted-repairable quality blockers until bounded `quality_repair` has been attempted.

## Blueprint Quality Review Requirements

Codex must not treat schema-valid and semantic-valid blueprints as automatically high quality.

Before freezing a blueprint, also check for blueprint quality issues that could mislead downstream Stitch or React generation.

### AppStructure consistency

`UIModel.appStructure` must match the actual UI page and navigation structure.

If `appStructure.pattern` is `multi_step_wizard`, require wizard evidence such as:

```text
navigation.type = stepper
requiredComponents includes stepper
multiple ordered wizard step pages
page sections include step labels/progress
primary flow steps are distributed across sequential step pages
```

If the UI has only a form page and a result page, prefer:

```text
form_to_result
```

Do not keep `multi_step_wizard` unless there is real wizard structure.

Do not invent wizard pages merely to justify an incorrect appStructure.

### Explicit outcome preservation

Preserve explicit user outcome language.

If the user asks to submit and see a result, receive a quote, generate an output, or view an answer, the blueprint must keep that visible outcome in the primary flow completion signal and result page contract.

Bad:

```text
"The user sees either a quote result or request submitted feedback."
```

Good:

```text
"The user sees an estimated quote/result after submitting the form."
```

If real calculation logic is unknown, use an MVP default decision:

```text
Show an immediate estimated result using mock or deterministic placeholder calculation.
```

Do not weaken the product into a generic application submission or lead-capture confirmation unless the user explicitly requested that.

### Primary action policy strength

`generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage` should default to `true`.

Do not set it to `false` merely because a result or confirmation page is readonly.

Represent page-level exceptions through:

```text
PageContract.purpose
PageContract.states
PageContract.completionSignals
PageContract.secondaryActions
```

Input pages must have a primary action.

Result, readonly, or confirmation pages may omit a primary submit action, but should usually include useful secondary actions such as:

```text
edit details
start over
download result
copy result
continue
go back
```

### Quality issue handling

Treat quality issues as follows:

```text
appStructure mismatch that misleads implementation -> high
explicit outcome weakened -> blocker or high
global primary action policy set weak without reason -> medium
missing primary action on input page -> blocker
missing useful next action on result page -> medium or high
```

Do not send these issues to broad full-blueprint regeneration by default.

Prefer targeted repair of:

```text
UIModel.appStructure
ProductIntent.successDefinition
CoreUserFlow.completionSignal
PageContract.purpose
PageContract.completionSignals
FeedbackFlow messages
GenerationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage
UncertaintyModel assumptions/default decisions
```

Freeze is allowed only when schema validation passes, semantic validation passes, and there are no blocker quality issues.




## Quality Blocker Handling and Targeted Quality Repair

Codex must not mark a session failed immediately when Blueprint Quality Review finds a blocker.

First classify each quality blocker as:

```text
targeted_repairable
non_repairable
```

### Targeted-repairable blockers

The following quality issues should normally trigger targeted `quality_repair` before session failure:

```text
app_structure_mismatch
explicit_outcome_weakened
primary_action_policy_weak
missing_result_page_action
```

A quality blocker is targeted-repairable when:

```text
the affected field path is clear
the fix is local
the fix does not change explicit user facts
the fix does not expand scope
the fix does not require rerunning unrelated LLM stages
the fix can be checked again by schema, semantic, and quality validation
```

### Non-repairable blockers

A quality blocker may fail the session without targeted repair only when:

```text
the product intent is contradictory
explicit user requirements conflict
the primary core flow is missing and cannot be safely inferred
UI pages are broadly disconnected from the flow model
domain and flow models are incompatible
repair would require adding major product scope
repair would require changing explicit user facts
multiple artifacts are inconsistent beyond a local patch
```

### Required behavior

Use this flow:

```text
schema validation passes
semantic validation passes
quality review finds blocker
classify blocker
if targeted-repairable -> run quality_repair
persist repaired blueprint as a new blueprint version
rerun schema validation
rerun semantic validation
rerun quality review
freeze if checks pass
fail only if non-repairable or repair attempts are exhausted
```

Do not use this flow:

```text
quality review blocker -> session failed
```

unless the blocker is non-repairable or bounded repair attempts have already failed.

### quality_repair stage

Implement `quality_repair` as a distinct stage from generic `blueprint_repair`.

`blueprint_repair` is for schema or semantic defects.

`quality_repair` is for quality review defects after schema and semantic validation have already passed.

The `quality_repair` input must include:

```text
validated blueprint
quality review report
targeted quality issues
repair rules
```

The `quality_repair` output must be the full corrected `ProductBlueprintV1`, not a patch only.

### Post-repair checks

After `quality_repair`, always rerun:

```text
schema validation
semantic validation
quality review
```

Only freeze after required checks pass.

### Attempt limits

Default max attempts:

```text
blueprint_repair: 2
quality_repair: 2
```

Mark the session failed only when:

```text
the blocker is non-repairable
quality repair attempts are exhausted
quality repair introduces unrepairable schema or semantic failures
quality review still has blockers after max attempts
```

### App structure mismatch repair

For `app_structure_mismatch`, repair the app structure to match existing pages and navigation.

Do not invent stepper pages or wizard UI just to justify a wizard shell.

Example:

```text
Before:
ui.appStructure.shell = "wizard"
navigation.type = "minimal"
pageOrder = ["quote_request_form", "quote_result_view"]

After:
ui.appStructure.shell = "form_to_result"
navigation.type = "minimal"
pageOrder = ["quote_request_form", "quote_result_view"]
```

If `form_to_result` is not supported by the implementation, choose the closest allowed non-wizard shell and persist the rationale.

### Explicit outcome repair

For `explicit_outcome_weakened`, preserve the user's visible outcome in:

```text
ProductIntent.successDefinition
primary CoreUserFlow.completionSignal
result PageContract.purpose
result PageContract.completionSignals
FeedbackFlow messages
UncertaintyModel default decisions
```

Do not turn an explicit "submit and see result" request into generic request-submitted feedback.

### Primary action policy repair

For `primary_action_policy_weak`, prefer:

```text
generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage = true
```

Use page-level semantics to explain readonly/result/confirmation exceptions.

Do not weaken the global rule merely because result pages may omit a primary submit action.

### Session status guidance

Support these statuses or equivalent internal states:

```text
quality_reviewing
quality_repairing
quality_repaired
blueprint_frozen
failed
```

A quality blocker should move the session to `quality_repairing` when it is targeted-repairable, not directly to `failed`.


## Downstream Consumption Rules

### Stitch generation

Stitch prompt generation must consume:
- frozen `ProductBlueprintV1`
- relevant `PageContract`
- relevant `CoreUserFlow`
- `VisualPolicy`
- page-level `stitchPromptHints`

Every Stitch page prompt must include:
- product context
- current page purpose
- supported flow ids
- primary action
- feedback requirements
- recovery requirements
- completion signal
- visual policy
- instruction to avoid UI-as-image

### React generation

React generation must consume:
- frozen `ProductBlueprintV1`
- `UIModel`
- `DomainModel`
- `FlowModel`
- Stitch HTML artifact
- Stitch screenshot artifact if available

React generation must not reinterpret raw input.

## File and Code Organization Guidance

Prefer clear module boundaries.

Suggested structure:

```text
src/
  blueprint/
    types/
    schemas/
    stages/
    prompts/
    validation/
    repair/
    persistence/
    assembly/
  stitch/
  react-generation/
  shared/
docs/
  ProductBlueprintV1-Type-Definitions.md
  ProductBlueprintV1-Generation-Pipeline-Design.md
  AGENTS.md
```

Adapt to the existing repository structure if one already exists.

Do not reorganize unrelated code without a direct reason.

## Implementation Order for Codex

When asked to implement this system, proceed in this order:

1. Locate and read the two required docs.
2. Define or locate TypeScript types from `ProductBlueprintV1-Type-Definitions.md`.
3. Implement runtime schemas or JSON Schemas for stage outputs.
4. Implement persistence records and artifact storage.
5. Implement `runBlueprintStage`.
6. Implement stage prompts.
7. Implement phase/gate execution order.
8. Implement schema validation.
9. Implement deterministic semantic validation.
10. Implement gate reports.
11. Implement semantic quality review.
12. Implement repair routing.
13. Implement bounded `blueprint_repair`.
14. Implement bounded `quality_repair`.
15. Implement freeze behavior.
16. Add tests for validation, quality review, and repair.
17. Add minimal integration test for a one-line product input.

## Testing Requirements

At minimum, add tests for:

- one-line sparse input
- structured PRD-like input
- explicit constraint preservation
- no-follow-up behavior
- flow completion signal validation
- page-to-flow reference validation
- unresolved question default decisions
- visual policy forbids UI-as-image
- repair fixes missing completion signal
- repair does not change explicit constraints
- quality repair does not directly trust LLM full-blueprint output
- post-repair guard prevents LLM from reverting deterministic appStructure and responsivePolicy repairs
- layer repair feeds repaired artifacts into downstream stages
- quality reports are immutable and are not synthetically cleared
- page role classification does not treat business nouns such as quote as result-page evidence
- explicit outcome repair keeps input page and result page purposes distinct

Use deterministic test fixtures.

Avoid tests that depend on live LLM calls unless they are explicitly marked as integration tests.

## Coding Guidance

Prefer:
- small modules
- typed interfaces
- explicit artifacts
- deterministic validators
- narrow prompt builders
- clear errors
- durable IDs
- bounded repair loops

Avoid:
- hidden global state
- implicit conversation context
- direct raw-input-to-Stitch generation
- direct raw-input-to-React generation
- broad "generate everything" functions
- silent defaults without assumptions
- unvalidated LLM JSON
- overwriting artifacts without versioning

## If Instructions Conflict

Priority order:

1. User's direct request in the current Codex task
2. `AGENTS.md`
3. `ProductBlueprintV1-Generation-Pipeline-Design.md`
4. `ProductBlueprintV1-Type-Definitions.md`
5. Existing repository conventions
6. General best practices

If a requested change conflicts with the non-negotiable architecture rules, explain the conflict and implement the closest safe alternative.

## Summary

This project is a controlled one-shot product understanding compiler.

The main invariant is:

```text
One user input -> staged artifacts -> validated ProductBlueprintV1 -> frozen blueprint -> downstream generation
```

Do not bypass the staged pipeline.

Do not bypass validation.

Do not let downstream systems reinterpret raw user input.

Do not treat pages as the source of product truth.

The frozen `ProductBlueprintV1` is the canonical source of truth.
