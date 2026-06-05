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
Stage 8: Repair if needed
Stage 9: Freeze blueprint
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

The output is a `ValidationReport` stored as an artifact.

### 7.8 Stage 8: Repair

Repair only runs when validation fails.

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

1. Fix only invalid or inconsistent fields.
2. Do not change explicit user facts.
3. Do not expand scope.
4. Return the full corrected blueprint.
5. Re-run validation after repair.
6. Limit repair attempts, for example max 2 attempts.

### 7.9 Stage 9: Freeze

After validation passes, mark the blueprint as frozen.

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
blueprint_repair: medium
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
blueprint_repair: 12000
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
