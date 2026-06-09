# AGENTS.md

## Purpose

This repository implements a one-shot product-to-Stitch-to-React pipeline.

Codex must treat this file as the repository-level operating guide.

## Required reading order

Read these documents before implementation:

```text
docs/productblueprintv1-type-definitions.md
docs/productblueprintv1-generation-pipeline-design.md
docs/stitch-html-generation-pipeline-design.md
docs/stitch-ui-constraints-yaml-design.md
docs/stitch-html-validation-design.md
docs/stitch-html-postprocess-design.md
docs/current-pipeline-mermaid.md
```

## Non-negotiable rules

```text
One user input only.
Do not ask follow-up questions.
Frozen ProductBlueprintV1 is the downstream source of truth.
Do not reinterpret raw input after freeze.
Flows come before pages.
Main UI must be real HTML.
Default pipeline does not use LLM repair.
```

## Blueprint generation rules

Generate the blueprint through explicit artifacts:

```text
input_understanding
product_frame
domain_modeling
flow_modeling
ui_modeling
policy_uncertainty
blueprint_assembly
```

Use code for:

```text
schema validation
reference validation
policy invariants
flow completeness
UI contract completeness
deterministic repair
freeze eligibility
```

Default repair is deterministic only.

Do not route vague semantic preferences into LLM repair.

## Stitch generation rules

Stitch generation starts only after blueprint freeze.

Correct:

```text
frozen ProductBlueprintV1 -> PageContract -> Stitch prompt -> Stitch HTML
```

Incorrect:

```text
raw input -> Stitch prompt
raw input -> HTML
```

Generate page by page.

Each prompt must be derived from a PageContract.

## Stitch UI constraints

Use:

```text
src/stitch/constraints/stitch-ui-constraints.yaml
```

Do not use app archetype as the YAML organizing model.

The YAML is a small behavior constraint library for:

```text
real HTML
real click behavior
no invented navigation
consistent sidebar
safe Codex SDK postprocess
bounded regeneration
```

## Click behavior rule

Every clickable element must have a visible effect.

Valid effects include:

```text
open modal
open drawer
toggle panel
show toast
show inline feedback
submit form
reset form
navigate to declared page
switch declared tab
```

Hover, focus, highlight, or color change alone is not enough.

## Navigation and sidebar rules

Do not invent global navigation.

If a sidebar appears across pages, labels, order, and destinations must remain consistent.

Only active state may differ.

## Codex SDK postprocess rules

Codex SDK may fix local code-verifiable HTML issues.

Allowed examples:

```text
add modal for unhandled button
add toast/inline feedback
add form submit/reset handler
normalize sidebar across pages
remove invented navigation
convert fake link to button
```

Postprocess must not:

```text
change product scope
add new flows
add new pages
add auth/payment/collaboration/integrations
reinterpret raw input
rewrite the whole page for style reasons
```

Every postprocess run must persist a report and must be followed by validation.

## Testing requirements

Add tests for:

```text
default pipeline does not call LLM repair
frozen blueprint is required before Stitch generation
Stitch prompt does not use raw input
HTML validator flags missing click behavior
HTML validator flags invented navigation
cross-page validator flags inconsistent sidebar
postprocess adds visible behavior to safe unhandled buttons
postprocess normalizes sidebar from canonical source
React handoff consumes validated HTML only
```
