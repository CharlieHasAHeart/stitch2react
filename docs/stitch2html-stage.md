# Stitch2HTML Stage

## Purpose

This document defines the stage that converts a frozen `ProductBlueprintV1` into page-level Stitch HTML artifacts.

The output of this stage is generated HTML plus screenshots and generation artifacts.

Validation and deterministic repair are defined separately in the validation-and-repair stage document.

## Source of Truth

Stitch generation must consume only the frozen blueprint.

```text
frozen ProductBlueprintV1
  -> Stitch prompt plan
  -> page-level Stitch prompts
  -> page-level Stitch HTML
```

Do not use raw user input to generate or repair Stitch HTML.

## Page-by-page Generation

Default Stitch generation is page-level:

```text
one PageContract -> one Stitch prompt -> one Stitch HTML artifact
```

This keeps validation, regeneration, and postprocess scoped and traceable.

## Stitch Prompt Contract

Each page prompt is derived from a `PageContract`.

Each prompt should include:

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
relevant Stitch UI constraints
```

## Stitch UI Constraints

Use:

```text
src/stitch/constraints/stitch-ui-constraints.yaml
```

This constraint file is not an app archetype library.

It should stay focused on reusable behavior constraints for:

```text
real HTML
real click behavior
no invented navigation
consistent sidebar
safe deterministic postprocess
bounded regeneration
```

## Constraint Responsibilities

The YAML is consumed by:

```text
Stitch prompt builder
static HTML validator
runtime validator
postprocess
regeneration prompt builder
```

Recommended top-level shape:

```yaml
version: 1
promptRules:
  global: []
html:
  requireVisibleRoot: true
  requireHeading: true
interaction:
  requireVisibleBehaviorForClickableElements: true
  clickableSelectors: []
  allowedVisibleBehaviors: []
  forbiddenNoopPatterns: []
navigation:
  allowInventedGlobalNavigation: false
  forbiddenInventedLabels: []
  sidebar:
    ifPresentMustBeConsistentAcrossPages: true
    canonicalSource: "blueprint.ui.navigation.globalNavItems"
    allowOnlyActiveStateDifference: true
postprocess:
  codexAllowedFixes: []
regeneration:
  stricterPromptRulesByIssueCode: {}
```

## Navigation and Sidebar Rules

```text
Do not invent global navigation.
If a sidebar appears across pages, labels, order, and destinations must remain consistent.
Only active state may differ.
```

## Output Artifacts

The Stitch2HTML stage should persist:

```text
stitch_prompt_plan
stitch_page_prompt
stitch_html
stitch_screenshot
```

The frozen blueprint remains immutable.
