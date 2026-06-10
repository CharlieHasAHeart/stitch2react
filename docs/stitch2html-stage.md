# Stitch2HTML Stage

## Purpose

This document defines the stage that converts a frozen `ProductBlueprintV1` into page-level Stitch HTML artifacts.

The output of this stage is generated HTML plus generation artifacts.

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

This keeps downstream validation scoped and traceable.

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

The prompt builder should not read scattered YAML fields directly.

Instead, YAML must first be compiled into a prompt contract.

It should stay focused on reusable behavior constraints for:

```text
real HTML
real click behavior
no invented navigation
consistent sidebar
safe deterministic postprocess
```

## Constraint Compilation

The Stitch prompt contract should be compiled from YAML before prompt assembly.

Recommended flow:

```text
stitch-ui-constraints.yaml
  -> compileStitchPromptConstraints(...)
  -> compiled prompt contract
  -> buildStitchPagePrompt(...)
```

This keeps YAML as the single source of truth while avoiding ad hoc field reads in the prompt builder.

The compiled prompt contract should contain:

```text
global rules
HTML contract
interaction contract
navigation contract
forbidden patterns
```

## Constraint Responsibilities

For stage ownership, the Stitch2HTML stage consumes this YAML only through prompt compilation. Validation and postprocess consume their own downstream contracts in the validation stage.

Recommended top-level shape:

```yaml
version: 1
promptRules:
  global: []
html:
  requireVisibleRoot: true
  requirePageIdAttribute: true
  requireHeading: true
  requireSemanticActionMarkers: true
  requireFeedbackSurfaceMarkers: true
  requireRecoverySurfaceMarkers: true
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
```

Prompt compilation should read:

```text
promptRules
html
interaction
navigation
```

Postprocess should read:

```text
postprocess.codexAllowedFixes
```

Do not expose internal postprocess fix ids directly in the Stitch prompt.

Translate them into output-facing requirements instead, such as:

```text
every declared action must have an observable visible behavior
navigation must only use declared routes
feedback and recovery surfaces must be rendered as real semantic HTML
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
```

The frozen blueprint remains immutable.
