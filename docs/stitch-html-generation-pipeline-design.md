# Stitch HTML Generation Pipeline Design

## 1. Purpose

This document defines the downstream pipeline that starts after a `ProductBlueprintV1` has been frozen.

The goal is to convert a frozen blueprint into page-level Stitch prompts, Stitch-generated HTML, screenshots, validation reports, and artifacts that can later be consumed by React generation.

This document does not redefine how to generate the blueprint. Blueprint generation remains governed by:

```text
docs/productblueprintv1-generation-pipeline-design.md
docs/productblueprintv1-type-definitions.md
AGENTS.md
```

## 2. Non-negotiable principles

### 2.1 Frozen blueprint only

Stitch generation must consume the frozen `ProductBlueprintV1`.

Correct:

```text
frozen ProductBlueprintV1
  -> PageContract
  -> Stitch prompt
  -> Stitch HTML
```

Incorrect:

```text
raw user input -> Stitch prompt
raw user input -> HTML
unfrozen draft blueprint -> Stitch prompt
```

After freeze, downstream systems must not reinterpret the raw input.

### 2.2 Page-by-page generation

Generate Stitch output one page at a time.

```text
for each PageContract:
  create StitchPromptArtifact
  generate StitchHtmlArtifact
  capture StitchScreenshotArtifact
  run HTML validation
  persist page-level validation report
```

Do not ask Stitch to generate the whole application in one prompt during the default pipeline.

Page-level generation gives better traceability, easier regeneration, and a cleaner handoff to React.

### 2.3 PageContract is the source for each page

Each Stitch prompt must be derived from a specific `PageContract`.

The prompt must not let Stitch invent:

```text
new user flows
new product scope
new pages
new roles
new integrations
new auth/payment/collaboration features
```

unless those features exist in the frozen blueprint.

### 2.4 Real HTML over visual illusion

Stitch output must use real editable HTML elements.

Do not allow UI-as-image.

Navigation, forms, tables, cards, buttons, charts, and important text must be represented as real HTML and text, not embedded inside raster images.

Images may be used only as:

```text
subtle decorative backgrounds
ambient accents
thumbnails
avatars
content images
```

## 3. Inputs

The Stitch HTML generation pipeline requires:

```ts
type StitchGenerationInput = {
  sessionId: string;
  blueprintId: string;
  frozenBlueprint: ProductBlueprintV1;
  targetPages?: string[];
};
```

Required source fields from the frozen blueprint:

```text
product
users
domain
flows
ui.pages
visualPolicy
generationPolicy
uncertainty
```

For each page, the prompt builder must resolve:

```text
PageContract
supported CoreUserFlows
supported supportingInteractionFlows
supported feedbackFlows
supported recoveryFlows
related domain entities
visual policy
generation rules
```

## 4. Output artifacts

Persist artifacts explicitly.

Recommended artifact types:

```text
stitch_prompt_plan
stitch_page_prompt
stitch_html
stitch_screenshot
stitch_html_validation_report
stitch_page_generation_report
```

Recommended IDs:

```text
stitch_plan_
stitch_prompt_
stitch_html_
stitch_shot_
stitch_val_
```

A page-level Stitch generation result should include:

```ts
type StitchPageGenerationResult = {
  sessionId: string;
  blueprintId: string;
  pageId: string;
  promptArtifactId: string;
  htmlArtifactId: string;
  screenshotArtifactId?: string;
  validationReportId: string;
  status: "generated" | "validated" | "failed";
};
```

## 5. Stitch prompt planning

Before generating page prompts, create a prompt plan.

The plan answers:

```text
which pages will be generated
which flows each page must support
which domain entities are visible on each page
which actions must appear
which states must be represented
which recovery and feedback surfaces must exist
```

Recommended type:

```ts
type StitchPromptPlan = {
  sessionId: string;
  blueprintId: string;
  pages: StitchPromptPlanPage[];
};

type StitchPromptPlanPage = {
  pageId: string;
  pageName: string;
  pageRole: "input" | "result" | "confirmation" | "readonly_detail" | "dashboard" | "supporting" | "unknown";
  supportedFlowIds: string[];
  requiredDomainEntityIds: string[];
  requiredActions: string[];
  requiredStates: string[];
  requiredFeedbackSurfaces: string[];
  requiredRecoverySurfaces: string[];
};
```

The prompt plan should be deterministic and derived from the frozen blueprint.

## 6. Stitch page prompt contract

Each page prompt must include:

```text
product context
current page purpose
page role
supported flow ids
primary action
secondary actions
required sections
required components
states
feedback surfaces
recovery surfaces
completion signals
visual policy
HTML element rules
```

Recommended type:

```ts
type StitchPagePromptArtifact = {
  sessionId: string;
  blueprintId: string;
  pageId: string;
  prompt: string;
  sourcePageContractId: string;
  sourceFlowIds: string[];
  createdAt: string;
};
```

## 7. Prompt construction rules

A Stitch page prompt should contain these sections.

### 7.1 Product context

Use only frozen blueprint content.

Include:

```text
product name
primary value proposition
target users
success definition
scope boundaries
```

### 7.2 Page contract

Include:

```text
page id
page name
route
purpose
page role
supported flow ids
primary action
secondary actions
required components
states
completion signals
```

### 7.3 Flow requirements

For each supported flow, include:

```text
flow goal
trigger
relevant steps
system effects
feedback requirements
recovery requirements
completion signal
```

### 7.4 Visual policy

Include:

```text
design tone
layout density
color guidance
typography guidance
component style
image usage restrictions
desktop/mobile policy
```

### 7.5 HTML requirements

Always instruct Stitch:

```text
Use real HTML elements.
Use real form controls for forms.
Use real buttons for actions.
Use real text for labels and messages.
Do not embed primary UI inside an image.
Make the page self-contained.
Avoid external runtime dependencies unless explicitly allowed.
```

## 8. HTML generation

Default behavior:

```text
one PageContract -> one Stitch prompt -> one HTML artifact
```

Do not generate multiple pages in one Stitch prompt unless a later explicit multi-page mode is introduced.

HTML generation should be treated as first-pass generation, not patch-based repair.

If a generated HTML page fails deterministic validation, prefer page regeneration with a stricter prompt over asking the model to patch the existing HTML.

## 9. HTML validation

Run deterministic validation after every generated page.

Minimum checks:

```text
HTML artifact exists
HTML parses successfully
body contains visible content
required page title or heading exists
primary action exists on input pages
required secondary actions exist on result/confirmation pages
required input controls exist for form pages
required completion signal text or state exists
required feedback surface exists
required recovery surface exists
no UI-as-image violation
no oversized raster image as main UI
no empty placeholder-only page
no unsupported page id / flow id leakage
```

Recommended validation report:

```ts
type StitchHtmlValidationReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageId: string;
  htmlArtifactId: string;
  passed: boolean;
  issues: StitchHtmlValidationIssue[];
  createdAt: string;
};

type StitchHtmlValidationIssue = {
  code: string;
  severity: "error" | "warning";
  path?: string;
  message: string;
  suggestedFix?: string;
};
```

## 10. Screenshot capture and visual checks

After HTML validation, capture a screenshot when browser rendering is available.

Screenshot checks should remain lightweight and deterministic where possible:

```text
screenshot exists
page is not blank
primary content appears above the fold
obvious modal/overlay does not hide the whole page
main UI is not a single raster image
```

Do not use subjective visual review as a default blocker in the first version.

## 11. Regeneration policy

Default regeneration policy:

```text
If deterministic HTML validation fails:
  regenerate the page from the frozen PageContract with a stricter prompt.

If regeneration fails after bounded attempts:
  mark the page generation failed and persist diagnostics.
```

Do not ask Stitch or another LLM to patch the existing HTML in the default path.

Recommended attempt limits:

```text
stitch page generation: 2
screenshot capture: 1
html validation: deterministic, no retry by itself
```

## 12. Handoff to React generation

React generation must consume:

```text
frozen ProductBlueprintV1
validated Stitch HTML artifact
optional Stitch screenshot artifact
page-level Stitch validation report
```

React generation must not reinterpret raw input.

React generation must preserve:

```text
page structure
visible labels
actions
states
feedback surfaces
recovery surfaces
completion signals
```

## 13. Implementation order

Recommended implementation order:

```text
1. Add Stitch artifact types.
2. Add Stitch prompt plan builder.
3. Add PageContract -> Stitch prompt builder.
4. Add Stitch stage runner wrapper.
5. Persist stitch_page_prompt artifacts.
6. Persist stitch_html artifacts.
7. Add deterministic HTML validation.
8. Add optional screenshot capture.
9. Add page-level regeneration on deterministic failure.
10. Add handoff metadata for React generation.
```

## 14. Testing requirements

Add tests for:

```text
Stitch generation refuses unfrozen blueprint
Stitch prompt does not use raw input
one PageContract creates one page prompt
input page prompt includes primary action
result page prompt includes completion signal and secondary action
prompt includes UI-as-image prohibition
HTML validation detects missing primary action
HTML validation detects UI-as-image violation
HTML validation detects blank/placeholder page
React handoff receives frozen blueprint and validated HTML
```

## 15. Summary

The Stitch pipeline begins only after blueprint freeze.

The main invariant is:

```text
frozen ProductBlueprintV1
  -> deterministic prompt plan
  -> page-level Stitch prompts
  -> page-level HTML artifacts
  -> deterministic HTML validation
  -> screenshots
  -> React handoff
```

The default strategy mirrors the current blueprint strategy:

```text
generate well once
validate deterministically
regenerate the page if needed
avoid LLM patch-repair by default
```
