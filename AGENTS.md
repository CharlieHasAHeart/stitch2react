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

The required stages are:

1. `input_understanding`
   - Output:
     - `InputUnderstanding`
     - `ProductIntent`
     - `UserModel`

2. `domain_modeling`
   - Input:
     - raw input
     - input understanding
     - product intent
     - user model
   - Output:
     - `DomainModel`

3. `flow_modeling`
   - Input:
     - input understanding
     - product intent
     - user model
     - domain model
   - Output:
     - `FlowModel`

4. `ui_modeling`
   - Input:
     - product intent
     - user model
     - domain model
     - flow model
   - Output:
     - `UIModel`

5. `policy_uncertainty`
   - Input:
     - all prior artifacts
   - Output:
     - `VisualPolicy`
     - `GenerationPolicy`
     - `UncertaintyModel`

6. `blueprint_assembly`
   - Input:
     - all prior artifacts
   - Output:
     - `ProductBlueprintV1`

7. `validation`
   - Use programmatic validation.
   - Do not rely on the model to declare validity.

8. `blueprint_repair`
   - Run only if validation fails.
   - Repair only invalid or inconsistent fields.
   - Do not change explicit user facts.
   - Do not expand scope.
   - Return the full corrected `ProductBlueprintV1`.

9. `freeze`
   - Mark the validated blueprint as frozen.
   - Set it as the active blueprint for the session.
   - Require all downstream generation to reference the frozen blueprint.

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
- every `supportsFlowIds` reference points to an existing flow
- every `UIAction.triggersFlowId` reference points to an existing flow
- every non-confirmation/non-readonly page has a primary action
- every primary action has expected feedback or a clear target
- every recovery flow has at least one recovery action
- every unresolved question has a default decision
- `visualPolicy.imageUsage.forbidUiAsImage` is `true`
- `generationPolicy.noFollowUpQuestions` is `true`
- max pages and max flows respect generation policy unless the user explicitly requested more
- explicit user constraints are not violated

If validation fails, create a validation report and run bounded repair.

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
- semantic validation passes
- repair is not needed or repair has passed validation

After freeze:
- set `session.activeBlueprintId`
- mark the blueprint version as `frozen`
- mark previous non-frozen versions as `superseded` where appropriate
- prevent downstream generation from using raw input as the primary source

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
7. Implement stage execution order.
8. Implement schema validation.
9. Implement semantic validation.
10. Implement bounded repair.
11. Implement freeze behavior.
12. Add tests for validation and repair.
13. Add minimal integration test for a one-line product input.

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
