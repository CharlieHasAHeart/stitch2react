# Stitch HTML Generation Pipeline Design

## 1. Purpose

This document defines how a frozen `ProductBlueprintV1` becomes Stitch HTML artifacts.

Detailed YAML, validation, and postprocess rules live in separate short docs:

```text
docs/stitch-ui-constraints-yaml-design.md
docs/stitch-html-validation-design.md
docs/stitch-html-postprocess-design.md
```

## 2. Core rules

```text
Use frozen ProductBlueprintV1 only.
Do not reinterpret raw input.
Generate page by page.
Every Stitch prompt is derived from a PageContract.
Generated UI must be real HTML.
Every clickable element must have visible behavior.
Cross-page navigation/sidebar must be consistent.
```

## 3. Pipeline

```text
frozen ProductBlueprintV1
  -> build StitchPromptPlan
  -> build StitchPagePrompt for each PageContract
  -> generate Stitch HTML per page
  -> run single-page HTML validation
  -> run Codex SDK postprocess when code-fixable
  -> revalidate
  -> run cross-page validation
  -> run cross-page postprocess when code-fixable
  -> capture screenshots
  -> handoff to React generation
```

## 4. Stitch prompt plan

The prompt plan is deterministic.

It defines:

```text
which pages to generate
which flows each page supports
which actions must appear
which states must appear
which feedback/recovery surfaces must exist
which cross-page navigation model is expected
```

## 5. Page prompt contract

Each page prompt must include:

```text
product context
page purpose
supported flow ids
primary action
secondary actions
required sections
required components
states
feedback surfaces
recovery surfaces
completion signals
global UI constraints from stitch-ui-constraints.yaml
```

Do not dump the full YAML into the prompt. Inject only relevant concise rules.

## 6. HTML validation

Validation is deterministic.

Single-page checks include:

```text
empty HTML
missing visible root
missing heading
missing primary/secondary action
missing feedback/recovery surface
UI-as-image violation
missing click behavior
invented navigation
```

Cross-page checks include:

```text
sidebar labels/order/destinations consistency
global navigation consistency
declared page destination validity
```

## 7. Codex SDK postprocess

Codex SDK may locally fix code-verifiable HTML issues.

Allowed examples:

```text
add modal behavior to unhandled button
add toast or inline feedback behavior
add form submit/reset behavior
normalize sidebar across pages
remove invented navigation
convert fake links to buttons
```

Postprocess must produce a report and must be followed by revalidation.

## 8. Regeneration

If validation fails and postprocess cannot safely fix the page, regenerate that page using:

```text
same frozen blueprint
same PageContract
same page id
stricter prompt rules by issue code
```

Do not regenerate from raw input.

Do not ask an LLM to patch existing HTML in the default path.

## 9. Artifacts

Persist:

```text
stitch_prompt_plan
stitch_page_prompt
stitch_html
stitch_html_validation_report
stitch_cross_page_validation_report
stitch_html_postprocess_report
stitch_screenshot
```

## 10. React handoff

React generation consumes:

```text
frozen ProductBlueprintV1
validated Stitch HTML
optional screenshot
validation reports
postprocess reports
```

React generation must preserve visible structure, actions, states, feedback, recovery, and completion signals.
