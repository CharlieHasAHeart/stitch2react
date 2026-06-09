# ProductBlueprintV1 Generation Pipeline Design

## 1. Purpose

This document defines how one user input becomes a frozen `ProductBlueprintV1`.

It does not define Stitch HTML generation in detail. After freeze, control passes to:

```text
docs/stitch-html-generation-pipeline-design.md
```

## 2. Core rules

```text
One user input only.
Do not ask follow-up questions.
Explicit user facts beat inferred/defaulted content.
Flows come before pages.
Every core user flow needs a completion signal.
Every user-visible flow maps to UI surfaces and actions.
Default pipeline does not use LLM repair.
```

## 3. Default blueprint pipeline

```text
raw input
  -> input_understanding
  -> product_frame
  -> domain_modeling
  -> flow_modeling
  -> deterministic domain-flow gate
  -> ui_modeling
  -> deterministic flow-UI gate
  -> policy_uncertainty
  -> blueprint_assembly
  -> deterministic validation
  -> deterministic local repair if needed
  -> local static quality checks
  -> freeze
```

## 4. Stage responsibilities

### 4.1 `input_understanding`

Normalize the one-shot input.

Output:

```text
raw input
input type
input maturity
requested scope
explicit constraints
references
normalized summary
```

### 4.2 `product_frame`

Define product intent and users.

Output:

```text
product name
value proposition
success definition
in-scope / out-of-scope
primary users
user goals
```

### 4.3 `domain_modeling`

Define domain entities and state.

Output:

```text
entities
fields
relationships
runtime states
business rules
```

### 4.4 `flow_modeling`

Define behavior before pages.

Every core flow should include:

```text
user goal
trigger
steps
system effects
feedback
recovery
completion signal
involved entities
intended UI surfaces
```

### 4.5 `ui_modeling`

Create page contracts derived from flows.

Each page should include:

```text
page purpose
supported flow ids
sections
component requirements
primary action
secondary actions
states
feedback surfaces
recovery surfaces
```

### 4.6 `policy_uncertainty`

Set downstream generation policy.

Must include:

```text
no follow-up questions
forbid UI-as-image
conservative MVP defaults
unresolved questions with default decisions
```

### 4.7 `blueprint_assembly`

Assemble the final `ProductBlueprintV1`.

Assembly must preserve IDs and references from upstream artifacts.

## 5. Validation and deterministic repair

The default pipeline uses code as the authority for:

```text
schema validation
reference validation
policy invariants
flow completeness
UI contract completeness
freeze eligibility
```

Default repair may only fix code-verifiable defects.

Examples:

```text
missing completionSignal
invalid flow id
invalid page id
missing defaultDecision
missing primary action on input page
forbidUiAsImage not true
noFollowUpQuestions not true
```

Do not route vague semantic preferences into LLM repair by default.

## 6. Freeze rules

A blueprint can freeze only when:

```text
schema validation passes
reference validation passes
deterministic semantic validation passes
local static quality checks have no blocker/high issue
no explicit user constraint is violated
```

Frozen blueprint is immutable for downstream generation.

## 7. Downstream handoff

After freeze, downstream stages must consume only the frozen blueprint.

```text
frozen ProductBlueprintV1
  -> Stitch prompt plan
  -> Stitch page prompts
  -> Stitch HTML
  -> HTML validation
  -> Codex SDK postprocess
  -> screenshots
  -> React handoff
```

Downstream systems must not reinterpret raw input.

## 8. Related docs

```text
docs/productblueprintv1-type-definitions.md
docs/stitch-html-generation-pipeline-design.md
docs/stitch-ui-constraints-yaml-design.md
docs/stitch-html-validation-design.md
docs/stitch-html-postprocess-design.md
docs/current-pipeline-mermaid.md
```
