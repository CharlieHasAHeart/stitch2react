# AGENTS.md

## Purpose

This repository implements a one-shot product understanding and generation pipeline.

The system converts one user input into a frozen `ProductBlueprintV1`, then uses that frozen blueprint as the only source of truth for downstream Stitch HTML generation, validation, deterministic postprocess, and experimental candidate work.

React, mock data, API, and state-generation are future directions unless a task explicitly scopes them. They are not part of the current required pipeline.

## Required Reading Order

For general repository work, read in this order:

1. `docs/blueprint-stage.md`
2. `docs/stitch2html-stage.md`
3. `docs/stitch-candidate-search-stage.md`
4. `docs/validation-repair-stage.md`
5. `docs/stage-contract-test-matrix.md`
6. `docs/issue-code-inventory.md`

For Codex implementation work, read in this order:

1. `AGENTS.md`
2. `docs/execution/execution-validation.md`
3. Only the task-scoped documents listed by the active `TASK-*` entry

Do not scan every document and infer new work. The execution spine is `docs/execution/execution-validation.md` when present.

## Non-negotiable Rules

- One user input only.
- Frozen `ProductBlueprintV1` is the downstream product source of truth.
- Do not generate Stitch directly from raw input.
- Do not use raw user input for Stitch repair, candidate generation, candidate scoring, or targeted reprompt.
- Flow modeling happens before page modeling.
- Default blueprint repair must be deterministic; do not use LLM repair in the default path.
- Default Stitch generation must remain single-candidate.
- Experimental candidate mode must be explicitly selected by runtime configuration.
- Candidate mode must not replace the default Stitch2HTML path without documentation, contract-test, and artifact-compatibility updates.
- Validation and postprocess must never mutate the frozen blueprint.
- Final validation gate remains the deliverability authority.

## Current Pipeline Scope

The current implementation priority is:

```text
frozen ProductBlueprintV1
  -> PageContract
  -> Stitch prompt plan
  -> page-level Stitch prompt
  -> page-level Stitch HTML
  -> static validation
  -> Chrome headless runtime validation via direct CDP client
  -> deterministic HTML postprocess when code-fixable
  -> re-validation
  -> cross-page validation
  -> final validation gate
  -> persisted validated Stitch artifacts
```

The default path is not allowed to call Stitch again after validation failure. It may only use deterministic postprocess followed by re-validation.

## Configuration Ownership

Stitch UI and HTML behavior constraints live in:

```text
src/stitch/constraints/stitch-ui-constraints.yaml
```

Stitch generation orchestration mode and candidate budgets live in:

```text
src/stitch/config/stitch-generation-config.yaml
```

Do not mix generation runtime configuration back into the UI constraints file.

Valid generation modes are:

```text
single
candidate
```

`single` is the default mode.

`candidate` is the single opt-in switch for experimental candidate generation.

Do not add a second `enabled` flag for candidate mode.

## Experimental Candidate Scope

Candidate mode is experimental and opt-in only.

Allowed candidate path:

```text
PageContract
  -> StitchPromptPlan
  -> N bounded Stitch candidate prompts
  -> N Stitch HTML candidates
  -> static/runtime validation
  -> optional cross-page validation when bundle context exists
  -> hard gate filtering
  -> soft score ranking among eligible candidates
  -> deterministic postprocess when applicable
  -> re-validation
  -> selected candidate or failure diagnostics
```

Candidate mode may consume only:

```text
frozen ProductBlueprintV1
PageContract
compiled Stitch prompt constraints
validation issue codes from previous attempts when targeted reprompt is enabled
previous candidate diagnostics when targeted reprompt is enabled
```

Candidate mode must not consume:

```text
raw user input
unfrozen draft blueprint data
free-form product reinterpretation
vague semantic preferences
new product requirements
unbounded style requests
```

Candidate mode must persist enough lineage to explain:

```text
which candidates were generated
which candidate was selected
why each rejected candidate was rejected
which validation reports were used
which postprocess fixes were applied or rejected
```

No candidate may be silently discarded.

## Hard Gate and Soft Score Rules

A candidate with any hard gate failure must not be selected.

Hard gate failures include:

```text
html_empty
html_missing_visible_root
html_missing_page_root_marker
missing_primary_action
missing_secondary_action
missing_feedback_surface
missing_recovery_surface
invented_navigation
undeclared_navigation_destination
blank_rendered_page
blocking_overlay
console_runtime_error
```

Soft scores may be used only to rank candidates that already pass all hard gates.

A soft visual score must never override a hard gate failure.

## Targeted Reprompt Rules

Targeted reprompt is allowed only in experimental candidate mode.

Targeted reprompt may use:

```text
PageContract
previous StitchPromptPlan
previous validation issue codes
previous candidate diagnostics
compiled Stitch prompt constraints
```

Targeted reprompt must not use:

```text
raw user input
new product requirements
vague semantic preferences
unbounded style requests
free-form product reinterpretation
```

Targeted reprompt must be bounded by explicit runtime configuration.

The default validation-and-repair path must never perform targeted reprompt.

## Stitch HTML Rules

Stitch generation starts only after blueprint freeze.

Stitch prompts must derive from the frozen blueprint, current `PageContract`, and compiled Stitch UI constraints.

The Stitch2HTML stage is a visualization stage, not a product-understanding stage. Product semantics, flows, pages, actions, completion signals, and navigation targets must already exist in the frozen blueprint before Stitch generation begins.

Do not expose internal postprocess fix IDs directly in Stitch prompts. Translate constraints into output-facing requirements such as:

```text
every declared action must have an observable visible behavior
navigation must only use declared routes
feedback and recovery surfaces must be rendered as real semantic HTML
```

## Chrome Headless Runtime Validation

Codex must use the project runtime validation backend for checks that static HTML parsing cannot prove:

```text
Node temporary local server
Chrome headless remote debugging
direct CDP client
```

Required runtime checks:

```text
page is not blank
main content is visible
console has no blocking runtime errors
resources are not broken in a UI-blocking way
every clickable element has a meaningful visible effect
navigation targets are declared
sidebars/global navigation are consistent across pages
```

A clickable element passes only if runtime validation observes a meaningful visible effect:

```text
modal opens
drawer opens
panel toggles
toast appears
inline feedback appears
form submits/resets
route changes to declared page
declared tab switches
```

Focus, hover, active styling, or color-only changes do not count.

Runtime evidence must be structured validation evidence only. Screenshots or visual artifacts may support diagnostics, but they must not become product source of truth.

## Deterministic HTML Postprocess

Postprocess is local deterministic HTML patching. It is not Codex SDK repair, not LLM repair, and not product reinterpretation.

It may fix local, code-verifiable HTML issues using validation evidence.

Allowed deterministic fixes:

```text
add modal/toast/drawer/toggle behavior
add form submit/reset behavior
add inline feedback or recovery state
normalize sidebar across pages
remove or disable invented navigation
retarget or disable undeclared navigation
convert fake links to buttons
patch deterministic local script errors
```

Forbidden fixes:

```text
add new product scope
add new pages or flows
add login/payment/collaboration/integrations
reinterpret raw input
change the frozen blueprint
rewrite the whole page for style preference
hide validation failures without fixing them
```

Postprocess must:

```text
use issue-code routing
respect YAML allowlists
run per-fix safety and applicability checks
persist appliedFixes and rejectedFixes
be followed by static and runtime re-validation
```

## Codex Execution Rules

When working from `docs/execution/execution-validation.md`, Codex must:

1. Execute the active `TASK-*` entries in dependency order.
2. Read only documents listed under `Read Before This Task` for the active task.
3. Preserve all task `Out of Scope` constraints.
4. Run every listed `VAL-*` validation for the task.
5. Update `docs/execution/codex-execution-report.md` after each completed or blocked task.

If `docs/execution/execution-validation.md` is absent, Codex must stop and ask for that execution spine instead of inventing a layer-first plan.

Do not replace `FLOW-*`, `TASK-*`, or `VAL-*` IDs with ad hoc phases.

Do not implement all backend, all frontend, all data, or all validation work as separate layer-first batches. Follow the flow-first execution spine.

## Codex Execution Report

Codex must create `docs/execution/codex-execution-report.md` if it does not exist.

For each task, append an entry containing:

```text
Task ID
Status: completed / blocked
Summary of implementation
Files changed
Validation commands run
Validation result
Blockers or follow-up notes
```

A task is complete only when:

```text
required implementation is done
required validation passes
execution report is updated
```

If validation cannot run because of an environment limitation, Codex must record:

```text
exact command attempted
failure output or evidence
why the blocker is environmental
strongest substitute validation that was run
```

Do not mark blocked or unvalidated work as complete.

## Validation Commands

Use the repository scripts exactly as defined in `package.json`:

```bash
npm run build
npm test
```

Do not use Jest-specific flags such as `--runInBand` unless the repository test script is changed to Jest and the change is documented.

Do not require live Stitch SDK credentials for unit or contract tests. Use fake `StitchHtmlStageClient` implementations for deterministic tests.

## Release Readiness

Before release or handoff, Codex must prove:

```text
TypeScript build passes
unit and contract tests pass
default Stitch generation remains single-candidate
candidate mode is not selected by default
candidate mode is bounded and opt-in
raw input does not enter Stitch prompts, candidate prompts, or targeted reprompts
hard gate failures cannot be selected
soft scores cannot override hard gate failures
rejected candidates persist rejection reasons
targeted reprompt uses issue codes only
selected candidate has validation evidence
final validation gate remains deliverability authority
```

Minimum release commands:

```bash
npm run build
npm test
```
