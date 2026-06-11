# Stitch Candidate Stage

## Purpose

This document defines the experimental Stitch candidate mode.

Candidate mode treats Stitch as a stochastic candidate generator. It generates multiple bounded page-level HTML candidates, validates them, ranks eligible candidates, and persists a selected artifact with full lineage.

The goal is to improve visual quality and first-pass success rate while preserving the frozen `ProductBlueprintV1` as the only product source of truth.

## Status

Candidate mode is experimental.

It must be explicitly selected by runtime configuration and must not replace the default Stitch2HTML path without a documentation update, contract-test update, and review of artifact compatibility.

Default path:

```text
PageContract
  -> one Stitch prompt
  -> one Stitch HTML artifact
  -> validation
  -> deterministic postprocess or fail
```

Experimental candidate path:

```text
PageContract
  -> StitchPromptPlan
  -> N bounded Stitch candidate prompts
  -> N Stitch HTML candidates
  -> validation and scoring
  -> selected candidate or failure diagnostics
```

## Non-goals

Candidate mode must not:

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

Candidate mode is not a replacement for blueprint generation. It is a bounded visual artifact search over a fixed `PageContract`.

## Source of Truth

Candidate mode consumes:

```text
frozen ProductBlueprintV1
PageContract
compiled Stitch prompt constraints
validation issue codes from previous attempts, when targeted reprompt is enabled
```

Candidate mode must not consume:

```text
raw user input
unfrozen draft blueprint data
free-form product reinterpretation
vague semantic preferences
```

The frozen blueprint remains immutable for the entire candidate run.

## Candidate Flow

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

Candidate mode is a bounded search process, not an unbounded retry loop.

## Generation Configuration

Generation mode and candidate budgets are owned by:

```text
src/stitch/config/stitch-generation-config.yaml
```

Recommended configuration shape:

```yaml
version: 1
mode: "single"
candidateSearch:
  candidatesPerPage: 3
  maxRepromptAttempts: 1
  maxCandidatesPerReprompt: 2
```

Valid modes:

```text
single
candidate
```

`single` remains the default.

`candidate` is the single opt-in switch for experimental candidate generation.

Do not use a second `enabled` flag for candidate mode.

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

## Candidate Run Contract

```ts
type StitchCandidateRun = {
  runId: string;
  pageId: string;
  mode: "candidate";
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

Required soft score keys:

```text
design_consistency
information_hierarchy
visual_polish
density_fit
enterprise_saas_fit
component_clarity
navigation_clarity
```

Soft scores must be deterministic and rule-based in the first implementation. They must not use screenshots, LLM judgment, external visual models, raw user input, or unfrozen blueprint drafts.

### Soft Score Implementation Boundary

The soft-score implementation belongs in:

```text
src/stitch/candidate-search/soft-scores.ts
```

That file must not only consume precomputed `softScores`. It must own the first implementation of reading generated candidate HTML structure and converting that structure into deterministic scores.

Required public functions:

```ts
export function extractSoftScoreSignals(input: {
  html: string;
  pageContract: PageContract;
  validationIssueCodes?: readonly string[];
}): CandidateSoftScoreSignals;

export function scoreCandidateSignals(
  signals: CandidateSoftScoreSignals
): CandidateSoftScores;

export function scoreCandidateHtml(input: {
  html: string;
  pageContract: PageContract;
  validationIssueCodes?: readonly string[];
}): CandidateSoftScores;
```

Function ownership:

```text
extractSoftScoreSignals:
  Reads generated candidate HTML plus PageContract expectations and validation issue codes.
  Extracts measurable structural signals only.
  Does not assign final scores.

scoreCandidateSignals:
  Converts extracted structural signals into the seven required 0..1 score keys.
  Does not parse HTML.
  Does not read candidate attempts.

scoreCandidateHtml:
  Convenience wrapper that calls extractSoftScoreSignals and scoreCandidateSignals.
  This is the default function candidate orchestration should use when computing attempt.softScores.
```

`rankEligibleCandidateAttempts` must only rank attempts whose `softScores` have already been produced by `scoreCandidateHtml` or an equivalent deterministic path. It must not invent missing scores during ranking.

### CandidateSoftScoreSignals Contract

The first implementation should define an explicit signal object rather than scattering ad hoc HTML checks across score functions.

Recommended signal shape:

```ts
type CandidateSoftScoreSignals = {
  headingCount: number;
  sectionCount: number;
  semanticContainerCount: number;
  repeatedStructureGroupCount: number;
  consistentRepeatedStructureGroupCount: number;
  styledElementCount: number;
  totalElementCount: number;
  requiredActionCount: number;
  representedRequiredActionCount: number;
  requiredFeedbackSurfaceCount: number;
  representedFeedbackSurfaceCount: number;
  requiredRecoverySurfaceCount: number;
  representedRecoverySurfaceCount: number;
  allowedNavigationTargetCount: number;
  representedAllowedNavigationTargetCount: number;
  declaredNavigationElementCount: number;
  disallowedNavigationTargetCount: number;
  pageRole: "dashboard" | "form" | "detail" | "workflow" | "empty-state" | "unknown";
  approximateContentBlockCount: number;
};
```

Signal extraction rules:

```text
- Parse only the generated candidate HTML.
- Compare only against PageContract expectations and validation issue codes.
- Count structural evidence such as headings, sections, semantic containers, classed layout hooks, required actions, feedback surfaces, recovery surfaces, and declared navigation targets.
- Missing or unmeasurable evidence must be represented as zero-valued signals.
- Disallowed navigation evidence must remain visible as disallowedNavigationTargetCount and must not be hidden by scoring.
```

### Soft Score Calculation Rules

Each score key returns a finite number in the inclusive range 0..1.

Use only these first-implementation buckets:

```text
0.0 = missing, unmeasurable, or clearly conflicting structural evidence
0.5 = partially present or ambiguous structural evidence
1.0 = clear structural evidence matching the PageContract expectation
```

Required rules:

```text
design_consistency:
  1.0 when repeatedStructureGroupCount > 0 and all repeated groups are consistent.
  0.5 when repeatedStructureGroupCount > 0 and some, but not all, repeated groups are consistent.
  0.0 when repeatedStructureGroupCount is 0.

information_hierarchy:
  1.0 when headingCount >= 1 and sectionCount >= 2.
  0.5 when headingCount >= 1 or sectionCount >= 1.
  0.0 when headingCount is 0 and sectionCount is 0.

visual_polish:
  1.0 when semanticContainerCount >= 2 and styledElementCount / totalElementCount >= 0.5.
  0.5 when semanticContainerCount >= 1 or styledElementCount / totalElementCount >= 0.25.
  0.0 when there are no meaningful styling hooks or semantic layout containers.

density_fit:
  1.0 when approximateContentBlockCount is within the expected range for the PageContract role.
  0.5 when approximateContentBlockCount is slightly below or above the expected range.
  0.0 when approximateContentBlockCount clearly conflicts with the PageContract role.

enterprise_saas_fit:
  1.0 when representedRequiredActionCount, representedFeedbackSurfaceCount, and semanticContainerCount all show workflow-oriented UI structure.
  0.5 when at least two of those three signal groups are present.
  0.0 when fewer than two of those signal groups are present.

component_clarity:
  1.0 when required actions, feedback surfaces, and recovery surfaces are represented as distinct structural components when required by the PageContract.
  0.5 when those components exist but are not clearly separated.
  0.0 when required components collapse into undifferentiated markup or are missing.

navigation_clarity:
  1.0 when representedAllowedNavigationTargetCount > 0, declaredNavigationElementCount > 0, and disallowedNavigationTargetCount is 0.
  0.5 when allowed navigation exists but is not clearly grouped, and disallowedNavigationTargetCount is 0.
  0.0 when there is no meaningful allowed navigation structure or any disallowed navigation target is present.
```

Density role ranges for the first implementation:

```text
dashboard:     6..14 approximate content blocks
form:          3..10 approximate content blocks
detail:        4..12 approximate content blocks
workflow:      4..12 approximate content blocks
empty-state:   2..6 approximate content blocks
unknown:       3..12 approximate content blocks
```

Total score rule:

```text
totalScore = average of all seven required soft score keys.
Do not use sum as the final score.
Do not weight dimensions in the first implementation.
```

Tie-breaker order:

```text
1. totalScore descending
2. candidateIndex ascending
3. attemptId ascending
```

## Screenshot and Visual Evidence

Candidate mode may capture screenshots as evaluation artifacts.

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

## Deterministic Postprocess in Candidate Mode

Candidate mode may reuse the deterministic postprocess stage.

Postprocess remains constrained by:

```text
issue code routing
YAML allowlist
per-fix safety checks
per-fix applicability checks
re-validation
```

Candidate mode must not use postprocess to change product scope or rewrite an entire page for visual preference.

## Targeted Reprompt Policy

Targeted reprompt is allowed only in candidate mode and only within explicit retry budgets.

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

Candidate mode must persist enough lineage to debug selection decisions.

Experimental artifacts:

```text
stitch_candidate_run
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

The final selected candidate may be exposed downstream as the normal validated Stitch HTML artifact, but the candidate lineage should remain available for diagnostics.

## Relationship to Default Pipeline

The default pipeline remains:

```text
PageContract
  -> one Stitch prompt
  -> one Stitch HTML artifact
  -> validation
  -> deterministic postprocess or fail
```

Candidate mode is an experimental replacement for the generation orchestration only.

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

Candidate mode should add contract tests for:

```text
candidate mode is not selected by default
candidate mode does not consume raw input
candidate mode preserves frozen blueprint as sole product source
candidate mode creates bounded prompt plans
candidate with hard gate failure cannot be selected
soft score cannot override hard gate failure
soft score extraction reads generated HTML structure through extractSoftScoreSignals
scoreCandidateHtml produces all required 0..1 soft score keys
ranked candidates use average score and deterministic tie-breakers
rejected candidates persist rejection reasons
targeted reprompt uses issue codes only
candidate lineage is persisted
```
