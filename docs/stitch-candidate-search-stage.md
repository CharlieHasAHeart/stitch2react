# Stitch Candidate Search Stage

## Purpose

This document defines the experimental Stitch candidate-search mode.

Candidate search treats Stitch as a stochastic candidate generator. It generates multiple bounded page-level HTML candidates, validates them, ranks eligible candidates, and persists a selected artifact with full lineage.

The goal is to improve visual quality and first-pass success rate while preserving the frozen `ProductBlueprintV1` as the only product source of truth.

## Status

Candidate search is experimental.

It must be explicitly enabled by runtime configuration and must not replace the default Stitch2HTML path without a documentation update, contract-test update, and review of artifact compatibility.

Default path:

```text
PageContract
  -> one Stitch prompt
  -> one Stitch HTML artifact
  -> validation
  -> deterministic postprocess or fail
```

Experimental candidate-search path:

```text
PageContract
  -> StitchPromptPlan
  -> N bounded Stitch candidate prompts
  -> N Stitch HTML candidates
  -> validation and scoring
  -> selected candidate or failure diagnostics
```

## Non-goals

Candidate search must not:

```text
reinterpret raw user input
change product scope
add new flows
add new pages
add undeclared navigation
invent new integrations
invent authentication, payments, or collaboration features
mutate the frozen blueprint
turn soft visual preferences into product requirements
```

Candidate search is not a replacement for blueprint generation. It is a bounded visual artifact search over a fixed `PageContract`.

## Source of Truth

Candidate search consumes:

```text
frozen ProductBlueprintV1
PageContract
compiled Stitch prompt constraints
validation issue codes from previous attempts, when targeted reprompt is enabled
```

Candidate search must not consume:

```text
raw user input
unfrozen draft blueprint data
free-form product reinterpretation
vague semantic preferences
```

The frozen blueprint remains immutable for the entire candidate-search run.

## Candidate Search Flow

```text
Frozen ProductBlueprintV1
  -> PageContract
  -> compile Stitch prompt constraints
  -> build StitchPromptPlan
  -> render candidate prompts
  -> generate Stitch HTML candidates
  -> static validation
  -> runtime validation
  -> optional cross-page validation when bundle context exists
  -> hard gate filtering
  -> soft score ranking among eligible candidates
  -> deterministic postprocess when applicable
  -> re-validation
  -> persist selected candidate or fail with diagnostics
```

Candidate search is a bounded search process, not an unbounded retry loop.

## Feature Flag

Recommended configuration shape:

```yaml
stitchGeneration:
  mode: single
  experimentalCandidateSearch:
    enabled: false
    candidatesPerPage: 3
    maxRepromptAttempts: 1
    maxCandidatesPerReprompt: 2
```

Valid modes:

```text
single
candidate-search
```

`single` remains the default.

`candidate-search` may run only when the experimental flag is enabled.

## StitchPromptPlan Contract

A `StitchPromptPlan` is a structured intermediate artifact. It exists before final prompt text is rendered.

```ts
type StitchPromptPlan = {
  pageId: string;
  pageRoute: string;
  mode: "initial" | "candidate" | "targeted-reprompt";
  candidateIndex?: number;
  generationGoal: "structure" | "balanced" | "visual-polish" | "dense-dashboard";
  layoutIntent: "dashboard" | "form" | "detail" | "workflow" | "empty-state";
  designSystemRef: string;
  requiredMarkers: string[];
  requiredActions: string[];
  allowedNavigationTargets: string[];
  forbiddenChanges: string[];
  previousFailureCodes?: string[];
};
```

The prompt plan is testable. Tests should assert prompt-plan structure instead of relying only on brittle prompt-text snapshots.

## Candidate Attempt Contract

Each generated candidate must be represented as an attempt artifact.

```ts
type StitchCandidateAttempt = {
  attemptId: string;
  pageId: string;
  candidateIndex: number;
  promptPlanArtifactId: string;
  promptArtifactId: string;
  htmlArtifactId: string;
  staticValidationReportId?: string;
  runtimeValidationReportId?: string;
  crossPageValidationReportId?: string;
  hardGateResult: "pass" | "fail";
  hardGateIssues: string[];
  softScores?: Record<string, number>;
  rejectionReasons: string[];
};
```

No candidate may be silently discarded. Every rejected candidate should persist rejection reasons.

## Candidate Search Run Contract

```ts
type StitchCandidateSearchRun = {
  runId: string;
  pageId: string;
  mode: "candidate-search";
  candidateCount: number;
  attempts: StitchCandidateAttempt[];
  selectedAttemptId?: string;
  finalDecision: "selected" | "failed";
  failureReasons?: string[];
};
```

The run artifact should answer:

```text
which candidates were generated
which candidate was selected
why each rejected candidate was rejected
which validation reports were used
which postprocess fixes were applied or rejected
```

## Hard Gates

Hard gates are binary eligibility checks.

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

Hard gates may be expanded over time, but a soft score must never override a hard gate failure.

## Soft Scores

Soft scores are used only to rank candidates that pass all hard gates.

Recommended soft scores:

```text
design_consistency
information_hierarchy
visual_polish
density_fit
enterprise_saas_fit
component_clarity
navigation_clarity
```

Soft scores should be deterministic or rule-based when possible.

If a score uses a screenshot or visual analysis artifact, the screenshot remains evaluation evidence only. It must not become a product source of truth.

## Screenshot and Visual Evidence

Candidate search may capture screenshots as evaluation artifacts.

Screenshots may be used for:

```text
blank-page diagnosis
visual regression checks
layout collapse detection
design consistency scoring
before/after comparison
candidate selection diagnostics
```

Screenshots must not be required by the default validation path and must not be stored as authoritative product artifacts.

## Selection Rules

Candidate selection must follow this order:

```text
1. Reject candidates with hard gate failures.
2. Apply deterministic postprocess to eligible candidates only when issue routing and safety checks allow it.
3. Re-run validation after postprocess.
4. Rank remaining eligible candidates by soft scores.
5. Persist the selected candidate and rejection diagnostics for all others.
6. Fail if no candidate remains eligible.
```

The selected candidate must have validation reports proving eligibility.

## Deterministic Postprocess in Candidate Search

Candidate search may reuse the deterministic postprocess stage.

Postprocess remains constrained by:

```text
issue code routing
YAML allowlist
per-fix safety checks
per-fix applicability checks
re-validation
```

Candidate search must not use postprocess to change product scope or rewrite an entire page for visual preference.

## Targeted Reprompt Policy

Targeted reprompt is allowed only in candidate-search mode and only within explicit retry budgets.

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

Recommended first implementation:

```text
candidatesPerPage: 3
maxRepromptAttempts: 1
maxCandidatesPerReprompt: 2
```

Reprompt templates should be issue-code driven.

Examples:

```text
missing_primary_action -> structure-focused prompt requiring declared action markers
undeclared_navigation_destination -> navigation-focused prompt requiring only declared routes
missing_feedback_surface -> structure-focused prompt requiring semantic feedback surface markers
sidebar_inconsistent_across_pages -> style/navigation consistency prompt using canonical sidebar model
```

## Artifact Lineage

Candidate search must persist enough lineage to debug selection decisions.

Experimental artifacts:

```text
stitch_candidate_search_run
stitch_candidate_attempt
stitch_candidate_prompt_plan
stitch_candidate_prompt
stitch_candidate_html
candidate_static_validation_report
candidate_runtime_validation_report
candidate_cross_page_validation_report
candidate_selection_report
rejected_candidate_report
selected_candidate_manifest
```

The final selected candidate may be exposed downstream as the normal validated Stitch HTML artifact, but the candidate-search lineage should remain available for diagnostics.

## Relationship to Default Pipeline

The default pipeline remains:

```text
PageContract
  -> one Stitch prompt
  -> one Stitch HTML artifact
  -> validation
  -> deterministic postprocess or fail
```

Candidate search is an experimental replacement for the generation orchestration only.

It does not replace:

```text
frozen blueprint contract
PageContract boundaries
static validation
runtime validation
cross-page validation
deterministic postprocess rules
final validation gate
```

## Required Contract Tests

Candidate search should add contract tests for:

```text
candidate search is disabled by default
candidate search does not consume raw input
candidate search preserves frozen blueprint as sole product source
candidate search creates bounded prompt plans
candidate with hard gate failure cannot be selected
soft score cannot override hard gate failure
rejected candidates persist rejection reasons
targeted reprompt uses issue codes only
candidate-search lineage is persisted
```
