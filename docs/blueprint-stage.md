# Blueprint Stage

## Purpose

This document defines the stage that converts one raw user input into a frozen `ProductBlueprintV1`.

The blueprint stage ends at freeze.

It does not generate HTML.

## Scope

The blueprint stage is responsible for:

```text
one-shot input understanding
product framing
domain modeling
flow modeling
page-contract-oriented UI modeling
policy and uncertainty assembly
deterministic validation
deterministic repair
freeze eligibility
freeze
```

The blueprint stage is not responsible for:

```text
Stitch prompt generation
Stitch HTML generation
runtime browser validation
HTML postprocess
future React work
```

## Non-negotiable Rules

```text
One user input only.
Do not ask follow-up questions.
Explicit user facts beat inferred/defaulted content.
Flows come before pages.
Frozen ProductBlueprintV1 is the downstream source of truth.
Default repair must be deterministic.
Do not use LLM repair in the default path.
```

## Default Pipeline

```text
rawInput
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
  -> freeze ProductBlueprintV1
```

## Blueprint Shape

`ProductBlueprintV1` is the frozen downstream contract.

```ts
type ProductBlueprintV1 = {
  meta: BlueprintMeta;
  input: InputUnderstanding;
  product: ProductIntent;
  users: UserModel;
  domain: DomainModel;
  flows: FlowModel;
  ui: UIModel;
  visualPolicy: VisualPolicy;
  generationPolicy: GenerationPolicy;
  uncertainty: UncertaintyModel;
};
```

Important fields should preserve source and confidence.

```ts
type FieldSource = "explicit" | "inferred" | "defaulted";
type Confidence = "high" | "medium" | "low";

type Field<T> = {
  value: T;
  source: FieldSource;
  confidence: Confidence;
  evidence?: string;
  risk?: string;
};
```

## Flow-first Modeling

Flows are the behavioral source of truth.

Every core flow must include:

```text
id
userGoal
trigger
steps
systemEffects
feedback
recovery
completionSignal
involvedEntityIds
uiSurfaceIds
```

## UI Modeling Contract

Pages are derived from flows.

Each `PageContract` should define:

```text
id
name
route
purpose
supportsFlowIds
sections
componentRequirements
primaryAction
secondaryActions
states
feedbackSurfaces
recoverySurfaces
readonly
confirmationOnly
```

The blueprint stage must provide enough information for downstream Stitch validation:

```text
ui.pages
ui.navigation
flows
feedback surfaces
recovery surfaces
completion signals
visualPolicy.imageUsage.forbidUiAsImage
generationPolicy.stitchGenerationRules
```

## Validation and Repair

The default blueprint path uses code as the authority for:

```text
schema validation
reference validation
policy invariants
flow completeness
UI contract completeness
freeze eligibility
```

Allowed deterministic repair examples:

```text
missing completionSignal
invalid flow id
invalid page id
missing defaultDecision
missing primary action on input page
forbidUiAsImage not true
noFollowUpQuestions not true
```

Do not route vague semantic preferences into LLM repair.

## Freeze Boundary

After freeze:

```text
frozen ProductBlueprintV1 -> PageContract -> Stitch prompt -> Stitch HTML
```

Incorrect:

```text
rawInput -> Stitch prompt
rawInput -> HTML
rawInput -> future React work
```

Downstream systems must not reinterpret raw input.
