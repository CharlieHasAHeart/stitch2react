# One-shot Product Blueprint Generation Design

## 0. Purpose

This document defines the generation architecture for converting a single user input into a structured `ProductBlueprintV1`, which will later drive Stitch HTML/screenshot generation and React project generation.

The user is allowed to provide only one input. The input may be a one-line idea, a short brief, a workflow description, a screen request, a reference-product description, or a full PRD. The system must not ask follow-up questions. Instead, it must use LLM inference, conservative defaults, confidence tracking, and validation to produce a complete, traceable blueprint.

The design goal is to avoid ambiguity for Codex or any implementation agent. The system should not treat the original user input as an ongoing conversation. It should treat the original input as a single immutable source, normalize it into structured artifacts, validate those artifacts, freeze the final blueprint, and make all downstream generation consume the frozen blueprint only.

---

## 1. Core Product Goal

The product pipeline is:

```text
User one-shot input
  -> ProductBlueprintV1 generation
  -> Page contracts
  -> Stitch prompts
  -> Stitch HTML + screenshot
  -> HTML structure analysis
  -> React/JSX generation
  -> Component extraction
  -> Interaction enhancement
  -> Mock API / state / backend integration
  -> Complete React project
```

This document covers only the generation of `ProductBlueprintV1` and the immediate engineering architecture required to generate it reliably.

---

## 2. Non-negotiable Principles

### 2.1 One-shot input

The user provides exactly one input. The system must not ask follow-up questions.

If information is missing, the system must:

1. make a conservative MVP assumption;
2. mark the assumption explicitly;
3. assign confidence;
4. record the unresolved question;
5. provide a default decision.

### 2.2 Explicit beats inferred

User-confirmed facts always override inferred or defaulted content.

Example:

If the user says `do not include login`, the system must not generate login-related flows, pages, buttons, or account settings.

### 2.3 Every important field must be traceable

Key fields must distinguish:

```text
explicit  = directly stated by user
inferred  = inferred by the LLM from input and common product patterns
defaulted = filled by system policy
```

Each important field must include confidence and evidence/reason/risk where appropriate.

### 2.4 Flow before pages

The system must not model a web app as a collection of screens.

The system must first derive user flows, system effects, feedback, recovery, state transitions, and completion signals. Pages are UI surfaces that support those flows.

### 2.5 Completion signal required

Every Core User Flow must have a visible or verifiable completion signal. If a flow has no completion signal, it is probably not a valid flow.

### 2.6 UI surface required

Every user-visible Core User Flow must map to at least one UI surface/page/section.

### 2.7 Real HTML over visual illusion

Stitch output must be optimized for engineering conversion. The main interface must be real HTML elements. Images are allowed only as subtle decoration or content images. UI-as-image is forbidden.

### 2.8 Conservative MVP by default

When the user's input is ambiguous or short, default to a small but coherent MVP:

```text
max core flows: 1-3
max pages: 3-5
no complex roles unless explicitly requested
no payment unless explicitly requested
no team collaboration unless explicitly requested
no external integrations unless explicitly requested
```

---

## 3. Flow Concepts to Use

The flow model should follow these definitions.

### 3.1 Application experience is not screens

```text
Application Experience
= Core User Flow(s)
+ Side Effect Flow(s)
+ Supporting Interaction Flow(s)
+ Feedback Flow(s)
+ Recovery Flow(s)
+ State Transition(s)
+ Completion Signal(s)
```

Pages, API contracts, frontend responsibilities, backend responsibilities, and tasks should be derived from flows, not treated as independent lists.

### 3.2 Core User Flow

A Core User Flow is the user's intent path.

It describes the primary end-to-end path a user follows to accomplish a product goal.

It should answer:

```text
what the user is trying to accomplish
what starts the flow
what the user does
what the system returns or changes
what visible feedback the user receives
what result counts as completion
```

A Core User Flow must not be reduced to page navigation or button clicks.

### 3.3 Side Effect Flow

A Side Effect Flow is the system-effect path triggered by, caused by, or required to complete a Core User Flow.

It covers state changes, data writes, background work, artifact creation, status updates, validation effects, notifications, or downstream system results.

### 3.4 Interaction Effect

An Interaction Effect is an atomic result of a user or system action. It is smaller than a Side Effect Flow.

Examples:

```text
frontend validates form fields
API request is sent
backend validates request body
record is created
status changes from idle to submitting
success toast appears
error panel becomes visible
```

Do not use Interaction Effect as a substitute for end-to-end flow modeling.

### 3.5 Supporting Interaction Flow

A Supporting Interaction Flow helps the user complete or recover a Core User Flow.

Examples:

```text
open validation details
retry failed submission
replace uploaded file
copy a confirmation link
refresh status
expand artifact details
```

### 3.6 Feedback Flow

A Feedback Flow describes how the system communicates state to the user over time.

It includes pending, progress, success, failure, blocked, validation, empty, and completion feedback.

Critical feedback must include visible text and cannot rely on color alone.

### 3.7 Recovery Flow

A Recovery Flow describes how the user or system continues after failure, invalid input, blocked state, or interruption.

The system should not model only happy paths when failures affect product behavior.

### 3.8 State Transition

A State Transition describes how a user-visible, domain, runtime, or UI state changes during a flow.

Example:

```text
idle -> input_ready -> submitting -> succeeded
submitting -> validation_failed -> input_ready
running -> failed -> retry_available
```

### 3.9 Completion Signal

A Completion Signal is the visible or verifiable condition that indicates a flow has reached its intended end.

Examples:

```text
confirmation message is visible
created record appears in list
booking reference is visible
artifact download becomes available
validation error is visible and input remains editable
```

---

## 4. ProductBlueprintV1 Overview

`ProductBlueprintV1` is the frozen structured contract consumed by downstream generation.

It is not merely a human-readable PRD. It is the machine-consumable source of truth for:

```text
product intent
users
business/domain model
flows
UI surfaces/page contracts
visual policy
generation policy
uncertainty and default decisions
```

Top-level shape:

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

The full schema is documented separately in `ProductBlueprintV1.md`. This document focuses on how to generate it.

---

## 5. Required Field Traceability

Use this generic field wrapper for important fields:

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

Implementation rules:

1. If `source = explicit`, include user evidence when possible.
2. If `source = inferred`, include inference rationale in `evidence` or `risk`.
3. If `source = defaulted`, the value must follow system policy and should include a reason.
4. Do not mark inferred content as explicit.
5. Do not invent large product scope under `inferred` when a conservative default is enough.

---

## 6. Recommended Generation Strategy

Use Scheme B: multi-stage LLM generation with explicit upstream JSON artifacts.

Do not rely on implicit conversation history.

Do not use `conversation` or any API-level threaded context as the source of truth.

Each stage receives only the upstream JSON artifacts it needs. Each stage returns one or more strictly typed JSON artifacts. Each artifact is stored and validated before being used by the next stage.

High-level stage flow:

```text
Stage 1: Input + Product + Users
Stage 2: Domain
Stage 3: Flows
Stage 4: UI surfaces / Page contracts
Stage 5: Policy + Uncertainty
Stage 6: Blueprint assembly
Stage 7: Validation
Stage 8: Semantic quality review
Stage 9: Repair if needed
Stage 10: Freeze blueprint
```

---

## 7. Stage Definitions

### 7.1 Stage 1: Input Understanding, Product Intent, User Model

Input:

```ts
{
  sessionId: string;
  rawInput: string;
  generationMode: "one_shot";
  blueprintVersion: "1.0";
}
```

Output:

```ts
{
  input: InputUnderstanding;
  product: ProductIntent;
  users: UserModel;
}
```

Purpose:

```text
Understand the user's input type, maturity, scope, product goal, target users, constraints, references, and high-level product intent.
```

Rules:

1. Do not generate flows yet except as rough notes if required by schema.
2. Do not generate pages yet.
3. Detect explicit constraints and preserve them.
4. Determine whether the input is a one-line idea, short brief, structured PRD, workflow description, screen request, reference-product description, or mixed.
5. Default ambiguous product scope to a conservative MVP.

### 7.2 Stage 2: Domain Modeling

Input:

```ts
{
  sessionId: string;
  rawInput: string;
  upstreamArtifacts: {
    input: InputUnderstanding;
    product: ProductIntent;
    users: UserModel;
  };
}
```

Output:

```ts
{
  domain: DomainModel;
}
```

Purpose:

```text
Extract or infer core entities, fields, relationships, statuses, business rules, and mock data needs.
```

Rules:

1. Prefer entities implied by product goal and user roles.
2. Do not introduce complex entities unless necessary for the MVP.
3. Mark inferred entities and fields as inferred.
4. Do not generate backend API contracts here.
5. Do not generate UI pages here.

### 7.3 Stage 3: Flow Modeling

Input:

```ts
{
  sessionId: string;
  upstreamArtifacts: {
    input: InputUnderstanding;
    product: ProductIntent;
    users: UserModel;
    domain: DomainModel;
  };
  flowPrinciples: {
    flowBeforePages: true;
    requireCompletionSignal: true;
    requireFeedbackAndRecovery: true;
  };
}
```

Output:

```ts
{
  flows: FlowModel;
}
```

Purpose:

```text
Generate Core User Flows and related supporting, side-effect, feedback, recovery, state transition, and dependency flows.
```

Rules:

1. Core User Flows must not be page lists.
2. Each Core User Flow must include user goal, trigger, steps, system effects, feedback, recovery, completion signal, involved entities, and UI surface names.
3. A flow must have at least two meaningful steps.
4. Each Core User Flow must have a completion signal.
5. Each Core User Flow must have at least one UI surface name, even if the actual page contract is generated later.
6. Use conservative flow count when input is sparse.
7. Do not create payment, account, collaboration, or integration flows unless explicitly requested or essential.

### 7.4 Stage 4: UI Modeling and Page Contracts

Input:

```ts
{
  sessionId: string;
  upstreamArtifacts: {
    product: ProductIntent;
    users: UserModel;
    domain: DomainModel;
    flows: FlowModel;
  };
  uiRules: {
    everyPageSupportsFlow: true;
    everyCoreFlowHasSurface: true;
    everyPageHasPrimaryAction: true;
  };
}
```

Output:

```ts
{
  ui: UIModel;
}
```

Purpose:

```text
Derive application structure, navigation, page contracts, page sections, UI actions, states, feedback surfaces, recovery surfaces, completion signals, and Stitch prompt hints from the flow model.
```

Rules:

1. Derive pages from flows, not from visual imagination.
2. Every page must support at least one existing flow ID.
3. Every Core User Flow must be supported by at least one page.
4. Every page must have at least one primary action unless it is purely a confirmation or read-only result page.
5. Every primary action must have expected feedback.
6. Completion signals must be visible in at least one page.
7. Recovery paths must have UI surfaces if the related failure is user-visible.
8. Do not include decorative visual details here except Stitch prompt hints. Use VisualPolicy for visual rules.

### 7.5 Stage 5: Visual Policy, Generation Policy, Uncertainty

Input:

```ts
{
  sessionId: string;
  rawInput: string;
  upstreamArtifacts: {
    input: InputUnderstanding;
    product: ProductIntent;
    users: UserModel;
    domain: DomainModel;
    flows: FlowModel;
    ui: UIModel;
  };
  defaultPolicies: {
    noFollowUpQuestions: true;
    assumptionStrategy: "conservative_mvp";
    forbidUiAsImage: true;
  };
}
```

Output:

```ts
{
  visualPolicy: VisualPolicy;
  generationPolicy: GenerationPolicy;
  uncertainty: UncertaintyModel;
}
```

Purpose:

```text
Complete the generation constraints, Stitch visual constraints, and uncertainty/default decision model.
```

Rules:

1. `generationPolicy.noFollowUpQuestions` must be true.
2. Default assumption strategy should be `conservative_mvp` unless user explicitly asks for broad generation.
3. `visualPolicy.imageUsage.forbidUiAsImage` must be true.
4. Images may be used as subtle decorative backgrounds or content images only.
5. Every unresolved question must include a default decision.
6. High-impact unresolved questions should usually default to exclude from MVP or safe placeholder behavior.

### 7.6 Stage 6: Blueprint Assembly

Input:

```ts
{
  sessionId: string;
  artifacts: {
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
}
```

Output:

```ts
{
  blueprint: ProductBlueprintV1;
}
```

Purpose:

```text
Assemble previously validated artifacts into one ProductBlueprintV1 object without reinterpreting the raw input.
```

Rules:

1. Do not rewrite prior artifacts unless schema-level normalization is required.
2. Do not add new product scope.
3. Do not change explicit facts.
4. Preserve IDs and references.

### 7.7 Stage 7: Validation

Validation should be done programmatically, not primarily by the LLM.

Two validation layers are required:

1. schema validation;
2. semantic validation.

The output is a `ValidationReport` stored as an artifact. Only blueprints that pass deterministic validation may proceed to semantic quality review.

### 7.8 Stage 8: Semantic Quality Review

Semantic quality review runs after deterministic validation passes.

It is an LLM-assisted review stage, but it is not the final validity gate.
Programmatic validation remains the authority for schema validity and deterministic semantic validity.

Input:

```ts
{
  sessionId: string;
  validatedBlueprint: ProductBlueprintV1;
  validationReport: ValidationReport;
  reviewRules: {
    doNotChangeExplicitFacts: true;
    doNotExpandScope: true;
    reportIssuesOnly: true;
    focusOnSemanticConsistency: true;
  };
}
```

Output:

```ts
{
  review: SemanticQualityReviewReport;
}
```

Purpose:

```text
Find blueprint issues that are structurally valid but semantically weak, misleading, vague, or inconsistent enough to degrade downstream Stitch or React generation.
```

Review scope examples:

1. user-explicit result intent is weakened into generic submission confirmation;
2. a flow is formally valid but does not read like a real user task;
3. page purpose, supported flow IDs, and actions are only loosely aligned;
4. completion signals are technically present but too weak to guide downstream generation;
5. assumptions or default decisions are legal but misleadingly broad.

Rules:

1. The stage must return structured issues, not a repaired blueprint.
2. The stage must not decide final validity on its own.
3. The stage must not change explicit user facts.
4. The stage must not expand product scope.
5. The stage must classify issues by severity, repairability, affected paths, rationale, and suggested fix.
6. The stage must be used to inform repair routing, not to replace deterministic validation.

### 7.9 Stage 9: Repair

Repair runs only when validation fails or when semantic/quality review finds repairable issues.

Input:

```ts
{
  sessionId: string;
  invalidBlueprint: ProductBlueprintV1;
  validationErrors: ValidationIssue[];
  repairRules: {
    doNotChangeExplicitFacts: true;
    doNotExpandScope: true;
    fixOnlyInvalidOrInconsistentFields: true;
    returnFullCorrectedBlueprint: true;
  };
}
```

Output:

```ts
{
  blueprint: ProductBlueprintV1;
}
```

Rules:

1. Repair must be routed by issue type. Do not allow one broad repair step to rewrite the whole blueprint.
2. Use deterministic code repair first for structural, referential, policy, and other enumerable issues.
3. Use LLM-assisted repair only for targeted semantic, wording, or local consistency issues that are difficult to repair deterministically.
4. Fix only invalid, inconsistent, or explicitly reviewed fields.
5. Do not change explicit user facts.
6. Do not expand scope.
7. Return the full corrected blueprint.
8. Re-run validation after repair.
9. Re-run semantic quality review after LLM-assisted repair or any repair that affects semantic interpretation.
10. Limit repair attempts, for example max 2 attempts.

#### 7.9.1 Repair routing: code logic vs LLM

The system must explicitly separate what code repair is allowed to modify from what LLM-assisted repair is allowed to modify.

Use deterministic code repair for issues such as:

1. missing or empty required fields such as trigger, completionSignal, recoveryActions, or defaultDecision;
2. invalid or missing references such as unknown flow IDs, invalid action targets, or missing UI surface references;
3. structural constraints such as too few steps in a flow, a page with no supported flow, or a non-readonly page with no primary action;
4. policy enforcement such as noFollowUpQuestions, forbidUiAsImage, and strong primary-action policy requirements;
5. locally templateable quality fixes such as adding a useful secondary action to a result page or restoring required desktop breakpoints.

Use LLM-assisted repair only for issues such as:

1. preserving explicit user outcome semantics when wording became weak or ambiguous;
2. strengthening completion signals, feedback copy, page purpose text, or default decisions without changing product scope;
3. aligning domain, flow, UI, and uncertainty language when they are structurally legal but semantically inconsistent;
4. local field-specificity improvements that need judgment but do not require broad restructuring.

#### 7.9.2 LLM repair constraints

LLM-assisted repair must be bounded.

It must not:

1. modify raw input;
2. change any user-explicit fact into inferred or defaulted content;
3. add payments, authentication, team collaboration, complex permissions, or integrations unless explicitly requested;
4. add major new pages, major new flows, or major new entities just to make the blueprint feel more complete;
5. remove valid supporting, feedback, or recovery flows merely to simplify references;
6. reinterpret the product as a different product category;
7. replace the whole blueprint when a local repair is sufficient.

#### 7.9.3 Repair execution order

Recommended repair order:

```text
1. run deterministic validation
2. if validation fails -> code repair first
3. if deterministic validation passes -> run semantic_quality_review
4. if semantic_quality_review or quality review finds targeted semantic issues -> LLM-assisted repair
5. rerun deterministic validation
6. rerun semantic_quality_review
7. rerun code-driven quality review
8. freeze only when required gates pass
```

### 7.10 Stage 10: Freeze

After required validation and review gates pass, mark the blueprint as frozen.

Downstream stages must consume the frozen `blueprintId`, not the raw user input.

---

## 8. API Usage: Responses API Parameters

Use minimal, explicit, controllable Responses API calls.

Do not use implicit conversation history for core artifact generation.

### 8.1 Required parameters

Each LLM generation stage should use:

```ts
{
  model,
  instructions,
  input,
  text,
  reasoning,
  temperature,
  max_output_tokens,
  store,
  metadata
}
```

The strictly essential parameters are:

```text
model
instructions
input
text.format
```

### 8.2 Do not use these in the blueprint generation stage

Do not use:

```text
conversation
previous_response_id
tools
tool_choice
parallel_tool_calls
web_search_preview
file_search
code_interpreter
stream
top_p
```

Reason:

```text
conversation / previous_response_id introduce implicit context.
tools are not needed for structured blueprint generation.
stream makes strict JSON parsing and debugging harder.
top_p should not usually be tuned together with temperature.
```

### 8.3 Recommended call shape

```ts
const response = await openai.responses.create({
  model: process.env.BLUEPRINT_MODEL,

  instructions: stageInstructions,

  input: [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(stagePayload),
        },
      ],
    },
  ],

  text: {
    format: {
      type: "json_schema",
      name: stageSchemaName,
      strict: true,
      schema: stageJsonSchema,
    },
  },

  reasoning: {
    effort: stageReasoningEffort,
  },

  temperature: 0.2,
  max_output_tokens: stageMaxOutputTokens,

  store: false,

  metadata: {
    sessionId,
    stageRunId,
    stage,
    promptVersion,
  },
});
```

### 8.4 `model`

Use the configured model for blueprint generation.

```ts
model: process.env.BLUEPRINT_MODEL
```

### 8.5 `instructions`

Use `instructions` for stable stage rules.

Example:

```text
You are generating the FlowModel section of ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Do not ask follow-up questions.
Do not reinterpret the raw user input beyond the provided artifacts.
Return valid JSON matching the provided schema.
```

### 8.6 `input`

Use `input` for explicit stage payloads.

Each stage should receive only the upstream artifacts it needs.

Do not pass an entire hidden conversation. Do not say `continue from previous stage`.

### 8.7 `text.format.json_schema`

Each stage must use strict JSON Schema structured output.

Example:

```ts
text: {
  format: {
    type: "json_schema",
    name: "FlowModel",
    strict: true,
    schema: FlowModelJsonSchema,
  },
}
```

Prefer one schema per stage rather than one giant schema for every call.

### 8.8 `reasoning.effort`

Recommended defaults:

```text
input_understanding: low
domain_modeling: low
flow_modeling: medium
ui_modeling: medium
policy_uncertainty: low
blueprint_assembly: low
semantic_quality_review: medium
blueprint_repair: medium
quality_repair: medium
```

### 8.9 `temperature`

Use low temperature for stable structured generation.

```ts
temperature: 0.2
```

### 8.10 `max_output_tokens`

Suggested initial limits:

```text
input_understanding: 3000
domain_modeling: 5000
flow_modeling: 8000
ui_modeling: 8000
policy_uncertainty: 5000
blueprint_assembly: 12000
semantic_quality_review: 6000
blueprint_repair: 12000
quality_repair: 12000
```

If output is truncated, increase the limit or split the schema further.

### 8.11 `store`

Use:

```ts
store: false
```

Reason: the application stores all artifacts and metadata explicitly. The application database/object store is the source of truth.

In development, `store: true` may be used temporarily for debugging, but production should not depend on stored OpenAI context.

### 8.12 `metadata`

Use metadata for traceability only.

Example:

```ts
metadata: {
  sessionId,
  stageRunId,
  stage,
  promptVersion,
}
```

Do not put full user input, private content, or large artifacts into metadata.

---

## 9. ID and Artifact Architecture

The system needs its own IDs. These are not the same as OpenAI `response.id`.

### 9.1 ID roles

```text
sessionId        = one full generation pipeline from one user input
stageRunId      = one LLM stage execution
artifactId      = one stored input/output artifact
blueprintId     = one ProductBlueprint version
validationId    = one validation report
response.id     = OpenAI response ID for observability only
```

### 9.2 Recommended prefixes

```text
sess_     Generation session
stage_    Stage run
art_      Artifact
bp_       Blueprint version
val_      Validation report
stitch_   Stitch artifact
react_    React project artifact
```

### 9.3 GenerationSession

```ts
type GenerationSession = {
  sessionId: string;
  userId?: string;
  status: SessionStatus;
  rawInputArtifactId: string;
  activeBlueprintId?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 9.4 SessionStatus

```ts
type SessionStatus =
  | "created"
  | "input_analyzed"
  | "domain_generated"
  | "flows_generated"
  | "ui_generated"
  | "policy_generated"
  | "blueprint_assembled"
  | "validating"
  | "repairing"
  | "blueprint_frozen"
  | "stitch_generating"
  | "stitch_generated"
  | "react_generating"
  | "completed"
  | "failed";
```

### 9.5 StageRun

```ts
type StageRun = {
  stageRunId: string;
  sessionId: string;
  stage:
    | "input_understanding"
    | "domain_modeling"
    | "flow_modeling"
    | "ui_modeling"
    | "policy_uncertainty"
    | "blueprint_assembly"
    | "blueprint_repair";

  model: string;
  promptVersion: string;

  inputArtifactIds: string[];
  outputArtifactId?: string;

  openaiResponseId?: string;

  status: "pending" | "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string;
  validationReportId?: string;
  error?: string;
};
```

### 9.6 ArtifactRef

```ts
type ArtifactRef = {
  artifactId: string;
  artifactType:
    | "raw_input"
    | "input_understanding"
    | "product_intent"
    | "user_model"
    | "domain_model"
    | "flow_model"
    | "ui_model"
    | "visual_policy"
    | "generation_policy"
    | "uncertainty_model"
    | "product_blueprint"
    | "validation_report"
    | "stitch_prompt"
    | "stitch_html"
    | "stitch_screenshot"
    | "react_project";

  uri?: string;
  json?: unknown;
  checksum?: string;
};
```

### 9.7 BlueprintVersion

```ts
type BlueprintVersion = {
  blueprintId: string;
  sessionId: string;
  version: number;
  status: "draft" | "repaired" | "validated" | "frozen" | "superseded";
  createdFromStageRunIds: string[];
  artifactId: string;
  validationReportId?: string;
  createdAt: string;
};
```

### 9.8 Important distinction from OpenAI response IDs

Do not use OpenAI `response.id` as the application `sessionId`.

Correct relationship:

```text
sessionId
  -> stageRunId
      -> openaiResponseId
  -> artifactId
  -> blueprintId
```

OpenAI `response.id` is only for observability/debugging. The product should not rely on it as the durable business session.

---

## 10. Persistence Model

Minimum database/storage model:

```text
generation_sessions
generation_stage_runs
generation_artifacts
blueprint_versions
validation_reports
```

### 10.1 generation_sessions

```ts
type GenerationSessionRecord = {
  id: string;
  status: SessionStatus;
  rawInputArtifactId: string;
  activeBlueprintId?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 10.2 generation_stage_runs

```ts
type GenerationStageRunRecord = {
  id: string;
  sessionId: string;
  stage: string;
  promptVersion: string;
  model: string;
  inputArtifactIds: string[];
  outputArtifactId?: string;
  openaiResponseId?: string;
  status: string;
  error?: string;
  createdAt: string;
  finishedAt?: string;
};
```

### 10.3 generation_artifacts

```ts
type GenerationArtifactRecord = {
  id: string;
  sessionId: string;
  type: string;
  version: number;
  uri?: string;
  json?: unknown;
  checksum?: string;
  createdAt: string;
};
```

### 10.4 blueprint_versions

```ts
type BlueprintVersionRecord = {
  id: string;
  sessionId: string;
  version: number;
  status: "draft" | "validated" | "frozen" | "superseded";
  artifactId: string;
  validationReportId?: string;
  createdAt: string;
};
```

---

## 11. Validation Requirements

Validation must be implemented outside the LLM where possible.

### 11.1 Schema validation

Use Zod, JSON Schema, or equivalent.

Schema validation checks:

```text
required fields exist
enum values are valid
arrays/objects are correctly typed
IDs are strings
Field<T> wrappers are structurally valid
```

### 11.2 Semantic validation

Semantic validation checks logical consistency.

Minimum required rules:

```text
1. Every CoreUserFlow has completionSignal.
2. Every CoreUserFlow has trigger.
3. Every CoreUserFlow has at least two steps.
4. Every CoreUserFlow has at least one uiSurface.
5. Every PageContract supports at least one flow.
6. Every supportsFlowId references an existing CoreUserFlow or relevant flow.
7. Every UIAction.triggersFlowId references an existing flow when present.
8. Every PageContract has primaryActions unless it is a confirmation/read-only result page.
9. Every user-visible flow has feedback.
10. Every RecoveryFlow has at least one recovery action.
11. Every unresolved question has defaultDecision.
12. visualPolicy.imageUsage.forbidUiAsImage is true.
13. generationPolicy.noFollowUpQuestions is true.
14. maxPages is within policy limits unless explicitly requested by user.
15. Inferred/defaulted critical fields include evidence, risk, or a reason.
16. No page references a missing flow.
17. No flow references a missing page/surface after UI generation.
18. Explicit constraints are not violated.
```

### 11.3 Validation report

```ts
type ValidationReport = {
  validationId: string;
  sessionId: string;
  blueprintId?: string;
  schemaValid: boolean;
  semanticValid: boolean;
  issues: ValidationIssue[];
  createdAt: string;
};

type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
  suggestedFix?: string;
};
```

### 11.4 Repair loop

Repair must be bounded.

Recommended:

```text
max repair attempts: 2
```

If validation still fails after repair attempts, mark the session failed and store all artifacts for debugging.

---

## 12. Stitch-specific Visual Policy

The blueprint must include a VisualPolicy that prevents Stitch from generating non-engineerable outputs.

Default requirements:

```ts
visualPolicy.imageUsage.allowDecorativeBackgrounds = true;
visualPolicy.imageUsage.allowContentImages = true;
visualPolicy.imageUsage.forbidUiAsImage = true;
visualPolicy.imageUsage.maxSingleImageDominanceRatio = 0.35;
```

Prompt-level rules for Stitch should include:

```text
The main interface must be built with real HTML elements.
Do not render the interface as a full-page image.
Do not put navigation, forms, tables, cards, buttons, or important text inside images.
Images are allowed only as subtle decorative backgrounds or content thumbnails.
Decorative images should be low opacity, soft, and non-dominant.
Use real text elements, real buttons, real forms, real navigation, and real data display sections.
```

Stitch generation should later be validated for:

```text
single-image dominance
real text count
real interaction element count
presence of primary CTA
presence of required flow labels/completion signals
absence of UI-as-image patterns
```

This validation is downstream of ProductBlueprint generation and is not implemented in this document, but the blueprint must provide the policy.

---

## 13. Recommended Stage Prompt Pattern

Each stage prompt should have this structure:

```text
Role:
You are generating <stage artifact> for ProductBlueprintV1.

Context:
The user has provided exactly one input. Do not ask follow-up questions.
Use only the provided JSON artifacts.

Generation rules:
- Explicit beats inferred.
- Mark source and confidence.
- Use conservative MVP assumptions.
- Do not expand scope unless explicit.
- Preserve explicit constraints.

Stage-specific rules:
<rules for this stage>

Output:
Return JSON only.
Return JSON matching the provided schema.
```

Do not use conversational prose in model output. All stage outputs must be parseable JSON.

---

## 14. Example: One-line Input Behavior

User input:

```text
做一个给健身教练管理会员预约的系统
```

Expected interpretation:

```text
Product category: booking / scheduling management system
Primary user: fitness coach
Secondary user: member/client
Core entities: Member, Booking, Session, Schedule
Default scope: conservative MVP
Likely pages: Dashboard, Schedule, Booking Create/Manage, Member List/Detail, Confirmation
```

Expected assumptions:

```text
Payment is excluded unless explicitly requested.
Multi-coach team management is excluded unless explicitly requested.
Member login is not required unless explicitly requested; use a lightweight booking/contact form if needed.
Notifications are optional or mocked unless explicitly requested.
```

Expected Core User Flows:

```text
CUF-001: Coach reviews upcoming bookings
CUF-002: Coach creates or edits availability
CUF-003: Member or coach creates a booking
```

Expected completion signals:

```text
Booking appears in schedule/list.
Availability slot is visible and editable.
Booking confirmation is visible with time/member/session information.
```

Expected visual policy:

```text
Real calendar or schedule UI.
Real booking cards/table.
Real form inputs and buttons.
Decorative fitness imagery may be subtle and low-opacity.
No UI-as-image.
```

---

## 15. Downstream Consumption Rule

After a blueprint is frozen:

```text
Downstream Stitch generation must consume:
- frozen blueprintId
- PageContract
- relevant CoreUserFlow context
- VisualPolicy
- Stitch prompt hints

Downstream React generation must consume:
- frozen blueprintId
- UIModel
- DomainModel
- FlowModel
- Stitch HTML/screenshot artifacts
```

Downstream stages must not reinterpret the raw user input independently.

Incorrect:

```text
rawInput -> Stitch
rawInput -> React
rawInput -> Mock API
```

Correct:

```text
rawInput -> ProductBlueprintV1 -> freeze -> Stitch/React/Mock API
```

---

## 16. Implementation Checklist for Codex

### 16.1 Build schemas

Implement JSON schemas or Zod schemas for:

```text
InputUnderstanding
ProductIntent
UserModel
DomainModel
FlowModel
UIModel
VisualPolicy
GenerationPolicy
UncertaintyModel
ProductBlueprintV1
ValidationReport
```

### 16.2 Build stage runners

Implement a reusable stage runner:

```ts
runBlueprintStage<T>({
  model,
  sessionId,
  stageRunId,
  stage,
  promptVersion,
  instructions,
  payload,
  jsonSchema,
  maxOutputTokens,
  reasoningEffort,
}): Promise<T>
```

### 16.3 Build persistence

Persist:

```text
sessions
stage runs
artifacts
blueprint versions
validation reports
```

### 16.4 Build validation

Implement schema and semantic validation.

### 16.5 Build repair

Implement bounded repair loop.

### 16.6 Freeze blueprint

Mark validated blueprint as frozen and set `session.activeBlueprintId`.

### 16.7 Enforce downstream rule

Do not let downstream generation read raw input as its primary source after blueprint freeze.

---

## 17. Final Architectural Summary

The system should be implemented as:

```text
One user input
  -> create sessionId
  -> store raw input artifact
  -> stage 1 input/product/users
  -> stage 2 domain
  -> stage 3 flows
  -> stage 4 UI/page contracts
  -> stage 5 policy/uncertainty
  -> stage 6 assemble blueprint
  -> schema validation
  -> semantic validation
  -> bounded repair if needed
  -> freeze blueprintId
  -> downstream generation consumes frozen blueprint only
```

The most important rule:

```text
LLM may infer, but every inference must be traceable, conservative, and validated.
```

The second most important rule:

```text
Flows are the product behavior model. Pages are only UI surfaces for those flows.
```

The third most important rule:

```text
The frozen ProductBlueprintV1 is the only source of truth for Stitch and React generation.
```

---

## Amendment: Flow Reference Validation Scope

### Why this amendment exists

Semantic validation must match the `ProductBlueprintV1` flow model.

`PageContract.supportsFlowIds` and `UIAction.triggersFlowId` must not be validated against `flows.coreUserFlows` only.

The blueprint flow model contains multiple flow categories:

```text
flows.coreUserFlows
flows.supportingInteractionFlows
flows.sideEffectFlows
flows.feedbackFlows
flows.recoveryFlows
```

A UI page may legitimately support not only core user flows, but also supporting interaction flows, feedback flows, recovery flows, and user-visible side effect flows.

If a referenced flow id exists in one of these flow collections, but the validator rejects it because it only collected `coreUserFlows`, that is a validator bug, not a blueprint repair problem.

### Required flow id collections

Semantic validators must build separate flow id sets for different validation purposes.

#### All defined flow ids

Use this set for broad existence checks and diagnostics.

```ts
function collectAllFlowIds(flows: FlowModel): Set<string> {
  return new Set([
    ...(flows.coreUserFlows ?? []).map((flow) => flow.id),
    ...(flows.supportingInteractionFlows ?? []).map((flow) => flow.id),
    ...(flows.sideEffectFlows ?? []).map((flow) => flow.id),
    ...(flows.feedbackFlows ?? []).map((flow) => flow.id),
    ...(flows.recoveryFlows ?? []).map((flow) => flow.id),
  ]);
}
```

Do not include `stateTransitions` or `dependencies` in this set. They are not flow definitions.

#### Page-supportable flow ids

Use this set when validating `PageContract.supportsFlowIds`.

A page may support:

```text
coreUserFlows
supportingInteractionFlows
feedbackFlows
recoveryFlows
sideEffectFlows only when visibleToUser or feedbackSurface is present
```

Recommended implementation:

```ts
function collectPageSupportableFlowIds(flows: FlowModel): Set<string> {
  return new Set([
    ...(flows.coreUserFlows ?? []).map((flow) => flow.id),
    ...(flows.supportingInteractionFlows ?? []).map((flow) => flow.id),
    ...(flows.feedbackFlows ?? []).map((flow) => flow.id),
    ...(flows.recoveryFlows ?? []).map((flow) => flow.id),
    ...(flows.sideEffectFlows ?? [])
      .filter((flow) => flow.visibleToUser || flow.feedbackSurface)
      .map((flow) => flow.id),
  ]);
}
```

#### Action-triggerable flow ids

Use this set when validating `UIAction.triggersFlowId`.

An action may trigger:

```text
coreUserFlows
supportingInteractionFlows
recoveryFlows
sideEffectFlows only when visibleToUser or feedbackSurface is present
```

Recommended implementation:

```ts
function collectActionTriggerableFlowIds(flows: FlowModel): Set<string> {
  return new Set([
    ...(flows.coreUserFlows ?? []).map((flow) => flow.id),
    ...(flows.supportingInteractionFlows ?? []).map((flow) => flow.id),
    ...(flows.recoveryFlows ?? []).map((flow) => flow.id),
    ...(flows.sideEffectFlows ?? [])
      .filter((flow) => flow.visibleToUser || flow.feedbackSurface)
      .map((flow) => flow.id),
  ]);
}
```

`UIAction.triggersFlowId` should not normally reference `feedbackFlows` directly.

Feedback flows should usually be connected through:

```text
UIAction.expectedFeedback
PageContract.feedbackSurfaces
UIState.visibleMessage
PageContract.supportsFlowIds
```

### Updated semantic validation rules

Replace any rule that implies "UI flow references must point only to `coreUserFlows`" with the following rules:

```text
Every PageContract.supportsFlowIds entry must reference a page-supportable flow id.
Every UIAction.triggersFlowId must reference an action-triggerable flow id.
Every referenced flow id should also exist in the all-defined-flow-id set for diagnostics.
```

Valid examples:

```text
PageContract.supportsFlowIds:
- core_submit_quote_request
- support_fill_and_correct_form_data
- support_inline_validation_feedback
- feedback_validation_messages
- feedback_submission_and_result
- recovery_fix_invalid_form_and_resubmit
- recovery_retry_after_submission_failure

UIAction.triggersFlowId:
- continue_editing -> support_fill_and_correct_form_data
- check_form_validity -> support_inline_validation_feedback
- retry_submit -> recovery_retry_after_submission_failure
```

These examples are valid when the referenced ids exist in their corresponding flow collections.

### Repair boundary

Do not send validator-scope mismatches to blueprint repair.

If a referenced id exists in the blueprint but is rejected because the validator collected only `coreUserFlows`, fix the validator.

Repair should be used for actual blueprint defects, such as:

```text
referencing a flow id that does not exist anywhere
missing completion signal
missing UI surface
broken action target
violating explicit user constraints
```

Repair must not flatten supporting, feedback, or recovery flow references into core flow ids merely to satisfy an overly narrow validator.

### Implementation note for Codex

When implementing semantic validation, avoid a single `validFlowIds` set unless it intentionally contains every supported category.

Prefer:

```ts
const allFlowIds = collectAllFlowIds(blueprint.flows);
const pageSupportableFlowIds = collectPageSupportableFlowIds(blueprint.flows);
const actionTriggerableFlowIds = collectActionTriggerableFlowIds(blueprint.flows);
```

Then validate each field with the correct set.

---

## Amendment: Blueprint Quality Review Rules

### Why this amendment exists

A blueprint can be schema-valid and semantically valid while still being weak or misleading for downstream generation.

The validation pipeline must therefore distinguish:

```text
Schema validation
= data shape is valid

Semantic validation
= internal references and required behavioral fields are valid

Blueprint quality review
= generated blueprint preserves product intent and gives downstream generators clear, non-misleading guidance
```

Blueprint quality review should run after schema and semantic validation and before freeze.

Quality issues may be classified as:

```text
blocker
high
medium
low
```

Recommended behavior:

```text
blocker -> must repair before freeze
high -> should repair before freeze unless explicitly accepted
medium -> warning, repair when cheap or when it affects downstream generation
low -> warning only
```

### Rule 1: AppStructure consistency

`UIModel.appStructure` must match the actual page and navigation structure.

If `appStructure.pattern` is `multi_step_wizard`, the UI model must include wizard evidence.

Wizard evidence includes at least one of:

```text
navigation.type = stepper
requiredComponents includes a stepper
multiple PageContracts represent ordered wizard steps
page sections include explicit step labels, progress, or step numbers
primary flow steps are distributed across multiple sequential step pages
```

If no wizard evidence exists, do not use `multi_step_wizard`.

Prefer a better-fitting pattern such as:

```text
form_to_result
single_page_flow
dashboard_app
admin_console
landing_plus_app
```

Example:

```text
Bad:
- appStructure.pattern = multi_step_wizard
- pages = quote_request_form, quote_result_view
- no stepper
- no step index
- no multi-step page sequence

Good:
- appStructure.pattern = form_to_result
- pages = quote_request_form, quote_result_view
```

Quality classification:

```text
If appStructure misleads Stitch/React shell selection -> high
If appStructure is slightly vague but not misleading -> medium
```

Repair guidance:

```text
Repair appStructure rather than inventing stepper pages.
Do not add wizard UI unless the product flow actually requires it.
```

### Rule 2: Explicit outcome preservation

The blueprint must preserve explicit user outcome language.

If the user explicitly asks to:

```text
see a result
get a result
receive a quote
see a quote
generate an output
view an answer
submit and see the result
```

then the primary Core User Flow completion signal must include that visible outcome.

Do not weaken explicit outcome intent into a generic submission confirmation.

Example:

```text
User input:
"submit and see the result"

Bad completion signal:
"The user sees either a quote result or request submitted feedback."

Good completion signal:
"The user sees an estimated quote/result after submitting the form."
```

When the exact calculation or real backend logic is unknown, preserve the outcome through an MVP default decision:

```text
Unresolved question:
- Whether the quote/result can be calculated using real production logic.

Default decision:
- For MVP generation, show an immediate estimated result using mock or deterministic placeholder calculation instead of degrading to a generic submission confirmation.
```

Quality classification:

```text
If explicit outcome is weakened or replaced by generic submission success -> blocker or high
If outcome is preserved but calculation details are uncertain -> medium warning with default decision
```

Repair guidance:

```text
Preserve the visible result in:
- ProductIntent.successDefinition
- primary CoreUserFlow.completionSignal
- result PageContract.purpose
- result PageContract.completionSignals
- relevant FeedbackFlow states
- UncertaintyModel.defaultDecision when calculation details are unknown
```

Do not rewrite the product as a lead-capture or application-submission flow when the user asked for an immediate visible result.

### Rule 3: Primary action policy strength

`generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage` should default to `true`.

This global rule tells downstream Stitch prompt generation to make key user actions visible and intentional.

Do not weaken the global policy merely because one page is readonly, result-only, confirmation-only, or terminal-state.

Instead, use page-level semantics as exceptions.

Acceptable page-level exceptions include pages that are clearly:

```text
readonly result pages
confirmation pages
terminal completion pages
static detail pages
passive dashboard overview pages
```

Even when such a page does not need a primary submit action, it should usually include meaningful secondary actions when appropriate, such as:

```text
edit details
start over
download result
copy result
share result
continue
go back
contact support
```

Example:

```text
Bad:
generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage = false

Better:
generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage = true
quote_result_view has no primary submit action because it is a readonly result page
quote_result_view includes secondary actions such as edit details or start over
```

Quality classification:

```text
Global requirePrimaryActionInEveryPage = false without a strong reason -> medium
Missing primary action on an input page -> blocker
Missing any meaningful next action on a result page -> medium or high depending on product flow
```

Repair guidance:

```text
Prefer setting the global policy to true.
Represent exceptions through PageContract.purpose, states, completionSignals, and secondaryActions.
Do not reduce the global policy to false just to allow result pages.
```

### Quality review output

Blueprint quality review should produce a report separate from schema and semantic validation when possible.

Recommended structure:

```ts
type BlueprintQualityIssue = {
  severity: "blocker" | "high" | "medium" | "low";
  code:
    | "app_structure_mismatch"
    | "explicit_outcome_weakened"
    | "primary_action_policy_weak"
    | "missing_result_page_action"
    | "other";
  path: string;
  message: string;
  suggestedFix?: string;
};

type BlueprintQualityReport = {
  sessionId: string;
  blueprintId: string;
  passed: boolean;
  issues: BlueprintQualityIssue[];
};
```

Quality review may be implemented as part of semantic validation if the codebase does not yet have a separate quality report.

However, the implementation should keep the distinction clear in issue codes and messages.

### Freeze rule update

A blueprint should not be frozen when:

```text
schema validation fails
semantic validation fails
blueprint quality review has blocker issues
blueprint quality review has unresolved high issues that would mislead downstream Stitch or React generation
```

Medium and low quality issues may be allowed through freeze, but they must be persisted in the validation or quality report.

### Repair boundary

Quality repair should be targeted.

For the three quality categories above, repair should only touch:

```text
UIModel.appStructure
ProductIntent.successDefinition
CoreUserFlow.completionSignal
PageContract.purpose
PageContract.completionSignals
FeedbackFlow messages
GenerationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage
UncertaintyModel assumptions/default decisions
```

Do not regenerate the entire blueprint unless references become inconsistent.

Do not add new product scope to satisfy a quality rule.

Do not convert a simple two-page form-to-result flow into a wizard unless the user input or flow model clearly requires a wizard.

---

## Amendment: Quality Blocker Handling and Targeted Quality Repair

### Why this amendment exists

Blueprint Quality Review may correctly identify blocker issues after schema validation and semantic validation both pass.

A quality blocker must prevent immediate freeze, but it should not always fail the session.

Many quality blockers are local, deterministic, and safe to repair without rerunning the full multi-stage LLM pipeline.

Example:

```text
schemaValid = true
semanticValid = true
qualityReview.passes = false
quality issue:
- code: app_structure_mismatch
- path: ui.appStructure.shell
- message: shell is wizard, but there is no stepper or multi-step structure
```

This should trigger targeted quality repair, not immediate session failure.

### Updated pipeline behavior

Replace this behavior:

```text
schema pass
semantic pass
quality blocker
-> session failed
```

With this behavior:

```text
schema pass
semantic pass
quality blocker
-> classify quality blocker
-> if targeted-repairable, run quality_repair
-> run schema validation again
-> run semantic validation again
-> run quality review again
-> freeze if all pass
-> fail only if repair is exhausted or blocker is non-repairable
```

### Quality blocker classification

Every quality blocker must be classified as one of:

```text
targeted_repairable
non_repairable
```

#### Targeted-repairable quality blockers

These should normally enter `quality_repair` before failing the session:

```text
app_structure_mismatch
explicit_outcome_weakened
primary_action_policy_weak
missing_result_page_action
```

A blocker is targeted-repairable when all of the following are true:

```text
the affected field path is clear
the required correction is local
the correction does not change explicit user facts
the correction does not expand product scope
the correction does not require regenerating unrelated stages
the correction can be revalidated through schema, semantic, and quality validation
```

#### Non-repairable quality blockers

These may fail the session immediately or require a broader regeneration strategy:

```text
core product intent is contradictory
explicit user requirements conflict with each other
primary core flow is missing and cannot be safely inferred
UI model is broadly disconnected from all flows
domain model and flow model are incompatible
repair would require adding major product scope
repair would require changing explicit user facts
multiple stage outputs are mutually inconsistent beyond a local patch
```

### Required quality repair stage

Add a distinct stage:

```text
quality_repair
```

This stage is separate from generic `blueprint_repair`.

`blueprint_repair` fixes schema or semantic defects.

`quality_repair` fixes quality review defects after schema and semantic validation have already passed.

Recommended stage record:

```ts
type QualityRepairStageRun = {
  stage: "quality_repair";
  inputArtifacts: [
    "product_blueprint",
    "quality_review_report"
  ];
  outputArtifact: "product_blueprint";
};
```

### Quality repair input

The quality repair stage should receive:

```ts
type QualityRepairInput = {
  sessionId: string;
  blueprintId: string;
  validatedBlueprint: ProductBlueprintV1;
  qualityReviewReport: BlueprintQualityReport;
  targetedIssues: BlueprintQualityIssue[];
  repairRules: {
    doNotChangeExplicitFacts: true;
    doNotExpandScope: true;
    fixOnlyTargetedQualityIssues: true;
    returnFullCorrectedBlueprint: true;
  };
};
```

### Quality repair output

The quality repair stage must return a full corrected `ProductBlueprintV1`.

It must not return a patch only.

Reason:

```text
The full corrected blueprint must be persisted as a new blueprint version,
then revalidated with the existing schema, semantic, and quality validators.
```

### Required post-repair validation

After quality repair:

```text
1. persist repaired blueprint as a new blueprint version
2. run schema validation
3. run semantic validation
4. run quality review
5. freeze only if all required checks pass
```

If quality repair introduces schema or semantic validation failures, route to the appropriate repair loop or fail after bounded attempts.

### Repair attempt limits

Default max attempts:

```text
blueprint_repair: 2
quality_repair: 2
```

A session should be marked failed only when:

```text
the blocker is non-repairable
quality repair attempts are exhausted
quality repair introduces unrepairable schema or semantic failures
quality review still has blocker issues after max attempts
```

### Required session status handling

Add or support the following statuses:

```text
quality_reviewing
quality_repairing
quality_repaired
blueprint_frozen
failed
```

Recommended state transitions:

```text
validated -> quality_reviewing
quality_reviewing -> quality_repairing, when targeted-repairable blockers exist
quality_repairing -> quality_repaired, when repair output is persisted
quality_repaired -> validating
quality_reviewing -> blueprint_frozen, when quality passes
quality_reviewing -> failed, only when blocker is non-repairable
quality_repairing -> failed, only when repair attempts are exhausted or repair is unsafe
```

### App structure mismatch repair guidance

For `app_structure_mismatch`:

```text
Prefer repairing appStructure to match the existing pages and navigation.
Do not invent new pages or stepper components merely to justify a wizard shell.
```

Example repair:

```text
Before:
ui.appStructure.shell = "wizard"
ui.navigation.type = "minimal"
ui.pageOrder = ["quote_request_form", "quote_result_view"]

After:
ui.appStructure.shell = "form_to_result"
ui.navigation.type = "minimal"
ui.pageOrder = ["quote_request_form", "quote_result_view"]
```

If `form_to_result` is not an allowed shell value in the implementation, use the closest existing non-wizard shell value and document the reason in the quality repair artifact.

### Explicit outcome repair guidance

For `explicit_outcome_weakened`:

```text
Preserve the explicit visible result in:
- ProductIntent.successDefinition
- primary CoreUserFlow.completionSignal
- result PageContract.purpose
- result PageContract.completionSignals
- FeedbackFlow messages
- UncertaintyModel default decisions
```

Do not convert an explicit "submit and see result" request into generic request-submitted feedback.

### Primary action policy repair guidance

For `primary_action_policy_weak`:

```text
Prefer:
generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage = true
```

Represent readonly/result/confirmation exceptions at page level through:

```text
PageContract.purpose
PageContract.states
PageContract.completionSignals
PageContract.secondaryActions
```

Do not weaken the global rule just to allow terminal or result pages.

### Freeze rule update

A blueprint can freeze only when:

```text
schema validation passes
semantic validation passes
quality review passes or has no blocker/high misleading issues
all targeted-repairable blockers have either been repaired or explicitly downgraded with persisted rationale
```

Do not freeze a blueprint with unresolved blocker quality issues.

Do not fail a session for targeted-repairable quality blockers until the quality repair loop has been attempted.

