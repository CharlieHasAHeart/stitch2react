# ProductBlueprintV1 Type Definitions Overview

## 1. Purpose

`ProductBlueprintV1` is the frozen structured contract for downstream Stitch and React generation.

This document is intentionally short. Keep detailed implementation types in source code.

## 2. Top-level shape

```ts
export type ProductBlueprintV1 = {
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

## 3. Common field wrapper

Important fields should carry source and confidence.

```ts
export type FieldSource = "explicit" | "inferred" | "defaulted";
export type Confidence = "high" | "medium" | "low";

export type Field<T> = {
  value: T;
  source: FieldSource;
  confidence: Confidence;
  evidence?: string;
  risk?: string;
};
```

## 4. Flow model

Flows are the behavioral source of truth.

```ts
export type FlowModel = {
  coreUserFlows: CoreUserFlow[];
  sideEffectFlows: SideEffectFlow[];
  supportingInteractionFlows: SupportingInteractionFlow[];
  feedbackFlows: FeedbackFlow[];
  recoveryFlows: RecoveryFlow[];
  stateTransitions: StateTransition[];
};
```

Every `CoreUserFlow` should include:

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

## 5. UI model

Pages are generated from flows.

```ts
export type UIModel = {
  appStructure: AppStructure;
  navigation: NavigationModel;
  pages: PageContract[];
  globalComponents: GlobalComponent[];
  responsivePolicy: ResponsivePolicy;
};
```

Do not use app archetype as the central constraint model.

Stitch constraints are defined separately in:

```text
docs/stitch-ui-constraints-yaml-design.md
```

## 6. Page contract

Each page contract should define:

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

Every clickable action should map to one of:

```text
declared page navigation
form submit/reset
modal/drawer/toggle behavior
toast or inline feedback
recovery action
```

## 7. Generation policy

The generation policy must include:

```text
no follow-up questions
conservative MVP behavior
forbid UI-as-image
primary action policy
scope expansion restrictions
```

## 8. Stitch artifact types

Downstream Stitch generation should persist:

```text
stitch_prompt_plan
stitch_page_prompt
stitch_html
stitch_html_validation_report
stitch_cross_page_validation_report
stitch_html_postprocess_report
stitch_screenshot
```

## 9. Validation reports

Validation reports should be explicit and machine-readable.

Important report families:

```text
ValidationReport
GateReport
BlueprintQualityReport
StitchHtmlValidationReport
StitchCrossPageValidationReport
StitchHtmlPostprocessReport
```

## 10. Immutability rule

After freeze:

```text
ProductBlueprintV1 is read-only for downstream generation.
Stitch and React stages may not reinterpret raw input.
Postprocess may change generated HTML but not the frozen blueprint.
```
