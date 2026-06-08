import { defaultGenerationPolicy, defaultGlobalGenerationPolicySeed, defaultVisualPolicy } from "../defaults/policies.js";
import { assembleBlueprint } from "../assembly/assemble-blueprint.js";
import { FileBlueprintStore } from "../persistence/file-store.js";
import { BlueprintRepository } from "../persistence/repository.js";
import { stageInstructions, STAGE_PROMPT_VERSION } from "../prompts/stages.js";
import { reviewBlueprintQuality } from "../quality/review-blueprint.js";
import { repairBlueprint } from "../repair/repair-blueprint.js";
import { repairBlueprintQuality } from "../repair/quality-repair.js";
import {
  blueprintQualityReportSchema,
  globalGenerationPolicySeedSchema,
  productBlueprintSchema
} from "../schemas/blueprint.js";
import { OpenAIResponsesStageClient } from "../stages/openai-responses-client.js";
import { runBlueprintStage } from "../stages/stage-runner.js";
import type { StageEvent } from "../stages/stage-runner.js";
import type { BlueprintStageClient } from "../stages/openai-responses-client.js";
import type {
  BlueprintMeta,
  BlueprintQualityIssue,
  BlueprintQualityReport,
  FreezeEligibility,
  GateIssue,
  GateReport,
  GlobalGenerationPolicySeed,
  ProductBlueprintV1,
  RepairPlan,
  RepairRoute,
  ValidationIssue,
  ValidationReport
} from "../types/blueprint.js";
import { createId } from "../shared/ids.js";
import { validateBlueprint } from "../validation/validate-blueprint.js";

export type GenerateBlueprintOptions = {
  artifactsRoot?: string;
  model?: string;
  maxRepairAttempts?: number;
  maxQualityRepairAttempts?: number;
  repository?: BlueprintRepository;
  stageClient?: BlueprintStageClient;
  onStageEvent?: (event: StageEvent) => void;
};

export type GenerateBlueprintResult = {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  qualityReviewReportId: string;
  validationReportId: string;
  repository: BlueprintRepository;
};

function nowIso(): string {
  return new Date().toISOString();
}

function metaForInput(rawInput: string): BlueprintMeta {
  const hasChinese = /[\u3400-\u9FBF]/.test(rawInput);
  const language = hasChinese ? "zh-CN" : "en-US";

  return {
    version: "1.0",
    mode: "one_shot",
    inputLanguage: language,
    outputLanguage: language,
    downstreamTarget: "stitch_to_react",
    generatedAt: new Date().toISOString()
  };
}

function createGateReport(
  gate: GateReport["gate"],
  context: GateReport["context"],
  sessionId: string,
  inputArtifactIds: string[],
  issues: GateIssue[]
): GateReport {
  return {
    id: createId("gate"),
    gate,
    context,
    sessionId,
    inputArtifactIds,
    passed: issues.every((issue) => issue.severity !== "error"),
    issues,
    createdAt: nowIso()
  };
}

function persistGateReport(
  repository: BlueprintRepository,
  report: GateReport,
  sessionId: string
): string {
  repository.saveGateReport(report);
  repository.saveArtifact(sessionId, "gate_report", report);
  return report.id;
}

function persistValidationReport(
  repository: BlueprintRepository,
  report: ValidationReport,
  sessionId: string
): string {
  repository.saveValidationReport(report);
  repository.saveArtifact(sessionId, "validation_report", report);
  return report.id;
}

function persistQualityReview(
  repository: BlueprintRepository,
  report: BlueprintQualityReport,
  sessionId: string
): string {
  repository.saveQualityReviewReport(report);
  repository.saveArtifact(sessionId, "quality_review_report", report);
  return report.id;
}

function persistRepairPlan(
  repository: BlueprintRepository,
  plan: RepairPlan,
  sessionId: string
): string {
  repository.saveRepairPlan(plan);
  repository.saveArtifact(sessionId, "repair_plan", plan);
  return plan.id;
}

function failSession(repository: BlueprintRepository, sessionId: string, message: string): never {
  const fullMessage = `[${sessionId}] ${message}`;
  repository.updateSession(sessionId, {
    status: "failed",
    error: fullMessage
  });
  throw new Error(fullMessage);
}

function hasValidationFailure(report: ValidationReport): boolean {
  return !report.schemaValid || !report.semanticValid;
}

function makeIssue(code: string, path: string, message: string): GateIssue {
  return { severity: "error", code, path, message };
}

function formatGateContext(context: GateReport["context"]): string {
  const parts: string[] = [context.layer, context.kind];
  if (context.sourceStage) {
    parts.push(context.sourceStage);
  }
  return parts.join("/");
}

function describeGateFailure(report: GateReport): string {
  const codes = report.issues.map((issue) => issue.code).join(", ") || "unknown_issue";
  return `Gate ${report.gate} failed at ${formatGateContext(report.context)}: ${codes}`;
}

function describeRepairPlan(plan: RepairPlan): string {
  const source =
    plan.source === "gate_report"
      ? `${plan.source}:${plan.sourceGate ?? "unknown_gate"}:${plan.sourceGateContext ? formatGateContext(plan.sourceGateContext) : "unknown_context"}`
      : `${plan.source}:${plan.sourceReportId ?? "unknown_report"}`;
  const codes = plan.sourceIssueCodes.join(", ") || "unknown_issue";
  return `${source} -> ${plan.route} [${codes}]`;
}

function describeValidationFailure(report: ValidationReport): string {
  const codes = report.issues.map((issue) => issue.code).join(", ") || "unknown_issue";
  return `Validation ${report.id} failed: ${codes}`;
}

function describeQualityFailure(report: BlueprintQualityReport): string {
  const codes = report.issues
    .filter((issue) => issue.severity === "blocker" || issue.severity === "high")
    .map((issue) => issue.code)
    .join(", ") || "unknown_issue";
  return `Quality review ${report.id} blocked: ${codes}`;
}

function checkInputContract(
  sessionId: string,
  rawInputArtifactId: string,
  globalPolicySeedArtifactId: string,
  policySeed: GlobalGenerationPolicySeed
): GateReport {
  const issues: GateIssue[] = [];
  if (!rawInputArtifactId) {
    issues.push(makeIssue("raw_input_missing", "rawInputArtifactId", "Raw input artifact must exist."));
  }
  if (!globalPolicySeedArtifactId) {
    issues.push(makeIssue("global_policy_seed_missing", "globalPolicySeedArtifactId", "Global policy seed artifact must exist."));
  }
  if (policySeed.noFollowUpQuestions !== true) {
    issues.push(makeIssue("policy_seed_follow_up_forbidden", "globalPolicySeed.noFollowUpQuestions", "Global policy seed must forbid follow-up questions."));
  }
  return createGateReport(
    "input_contract",
    { layer: "session", kind: "structural", sourceStage: "input_contract" },
    sessionId,
    [rawInputArtifactId, globalPolicySeedArtifactId],
    issues
  );
}

function checkIntentScope(
  sessionId: string,
  rawInput: string,
  artifactIds: string[],
  blueprint: Pick<ProductBlueprintV1, "input" | "product" | "users">
): GateReport {
  const issues: GateIssue[] = [];
  const explicitConstraints = blueprint.input.explicitConstraints.value.join(" ").toLowerCase();
  const rawLower = rawInput.toLowerCase();
  if ((rawLower.includes("no login") || rawInput.includes("无需登录")) && !/no login|无需登录/.test(explicitConstraints)) {
    issues.push(makeIssue("explicit_constraints_not_preserved", "input.explicitConstraints", "Explicit no-login constraint must be preserved during product framing."));
  }
  if (blueprint.product.outOfScope.value.some((item) => /payment|collaboration|integration/i.test(item))) {
    issues.push(makeIssue("scope_too_broad", "product.outOfScope", "Product frame should preserve conservative MVP scope boundaries."));
  }
  return createGateReport(
    "intent_scope",
    { layer: "product_frame", kind: "structural", sourceStage: "product_frame" },
    sessionId,
    artifactIds,
    issues
  );
}

function checkDomainFlowConsistency(
  sessionId: string,
  artifactIds: string[],
  blueprint: Pick<ProductBlueprintV1, "domain" | "flows" | "product">
): GateReport {
  const issues: GateIssue[] = [];
  const entityIds = new Set(blueprint.domain.entities.map((entity) => entity.id));
  if (blueprint.flows.coreUserFlows.length === 0) {
    issues.push(makeIssue("core_flow_missing", "flows.coreUserFlows", "At least one core user flow must exist before UI modeling."));
  }
  for (const flow of blueprint.flows.coreUserFlows) {
    for (const entityId of flow.involvedEntityIds) {
      if (!entityIds.has(entityId)) {
        issues.push(makeIssue("core_flow_unknown_entity", `flows.coreUserFlows.${flow.id}.involvedEntityIds`, `Core flow ${flow.id} references unknown entity ${entityId}.`));
      }
    }
    if (!flow.completionSignal.signal.trim()) {
      issues.push(makeIssue("core_flow_missing_completion_signal", `flows.coreUserFlows.${flow.id}.completionSignal`, "Core flow completion signal must be populated before UI modeling."));
    }
  }
  return createGateReport(
    "domain_flow_consistency",
    { layer: "flow", kind: "structural", sourceStage: "flow_modeling" },
    sessionId,
    artifactIds,
    issues
  );
}

function checkFlowUiCoverage(
  sessionId: string,
  artifactIds: string[],
  blueprint: Pick<ProductBlueprintV1, "flows" | "ui">
): GateReport {
  const issues: GateIssue[] = [];
  const pageFlowIds = new Set(blueprint.ui.pages.flatMap((page) => page.supportsFlowIds));
  for (const flow of blueprint.flows.coreUserFlows) {
    if (flow.uiSurfaceIds.length === 0) {
      issues.push(makeIssue("core_flow_missing_ui_surface", `flows.coreUserFlows.${flow.id}.uiSurfaceIds`, "Core flow must expose at least one UI surface before assembly."));
    }
    if (!pageFlowIds.has(flow.id)) {
      issues.push(makeIssue("core_flow_not_covered_by_page", `flows.coreUserFlows.${flow.id}`, "Each core flow must be supported by at least one page contract."));
    }
  }
  for (const page of blueprint.ui.pages) {
    if (page.supportsFlowIds.length === 0) {
      issues.push(makeIssue("page_missing_supported_flow", `ui.pages.${page.id}.supportsFlowIds`, "Every page must support at least one flow before assembly."));
    }
  }
  return createGateReport(
    "flow_ui_coverage",
    { layer: "ui", kind: "structural", sourceStage: "ui_modeling" },
    sessionId,
    artifactIds,
    issues
  );
}

function checkDeterministicValidation(
  sessionId: string,
  blueprintArtifactId: string,
  validationReport: ValidationReport
): GateReport {
  const issues = validationReport.issues.map<GateIssue>((item) => ({
    severity: item.severity,
    code: item.code,
    path: item.path,
    message: item.message,
    suggestedFix: item.suggestedFix
  }));
  return createGateReport(
    "full_deterministic_validation",
    { layer: "blueprint", kind: "deterministic_validation", sourceStage: "deterministic_validation" },
    sessionId,
    [blueprintArtifactId],
    issues
  );
}

function checkQualityRevalidation(
  sessionId: string,
  blueprintArtifactId: string,
  validationReport: ValidationReport,
  qualityReport: BlueprintQualityReport
): GateReport {
  const issues: GateIssue[] = [];
  if (hasValidationFailure(validationReport)) {
    issues.push(...validationReport.issues.map((item) => ({
      severity: item.severity,
      code: item.code,
      path: item.path,
      message: item.message,
      suggestedFix: item.suggestedFix
    })));
  }
  for (const issue of qualityReport.issues) {
    if (issue.severity === "blocker" || issue.severity === "high") {
      issues.push({
        severity: "error",
        code: issue.code,
        path: issue.path,
        message: issue.message,
        suggestedFix: issue.suggestedFix
      });
    }
  }
  return createGateReport(
    "quality_revalidation",
    { layer: "quality", kind: "quality_revalidation", sourceStage: "semantic_quality_review" },
    sessionId,
    [blueprintArtifactId],
    issues
  );
}

function createLayerQualityGate(
  gate: "domain_flow_consistency" | "flow_ui_coverage",
  context: GateReport["context"],
  sessionId: string,
  inputArtifactIds: string[],
  report: BlueprintQualityReport
): GateReport {
  const issues = report.issues
    .filter((issue) => issue.severity === "blocker" || issue.severity === "high")
    .map<GateIssue>((issue) => ({
      severity: "error",
      code: issue.code,
      path: issue.path,
      message: issue.message,
      suggestedFix: issue.suggestedFix
    }));

  return createGateReport(gate, context, sessionId, inputArtifactIds, issues);
}

function mergeQualityReports(
  sessionId: string,
  blueprintId: string,
  reports: BlueprintQualityReport[]
): BlueprintQualityReport {
  const issues = reports.flatMap((report) => report.issues);
  const passed = issues.every((issue) => issue.severity !== "blocker" && issue.severity !== "high");
  return {
    id: createId("qrev"),
    sessionId,
    blueprintId,
    passed,
    issues,
    createdAt: nowIso()
  };
}

function routeValidationIssues(issues: ValidationIssue[]): RepairRoute {
  if (issues.some((issue) => issue.code.includes("schema"))) {
    return "code_schema_repair";
  }
  if (issues.some((issue) => issue.code.includes("policy") || issue.path.includes("generationPolicy") || issue.path.includes("visualPolicy"))) {
    return "code_policy_repair";
  }
  if (issues.some((issue) => issue.code.includes("flow") || issue.code.includes("page") || issue.path.includes("supportsFlowIds") || issue.path.includes("triggersFlowId"))) {
    return "code_reference_repair";
  }
  return "llm_semantic_local_repair";
}

function routeQualityIssues(issues: BlueprintQualityIssue[]): RepairRoute {
  const blockers = issues.filter((issue) => issue.severity === "blocker" || issue.severity === "high");
  if (blockers.length === 0) {
    return "no_repair_needed";
  }
  if (blockers.some((issue) => issue.repairability === "non_repairable")) {
    return "manual_blocking_issue";
  }
  return "quality_repair";
}


async function resolveLayerQualityBlockers(
  repository: BlueprintRepository,
  stageClient: BlueprintStageClient,
  model: string,
  sessionId: string,
  blueprintVersionId: string,
  blueprintArtifactId: string,
  blueprint: ProductBlueprintV1,
  report: BlueprintQualityReport,
  sourceGate: GateReport,
  maxQualityRepairAttempts: number
): Promise<{ blueprint: ProductBlueprintV1; blueprintArtifactId: string; report: BlueprintQualityReport }> {
  let activeBlueprint = blueprint;
  let activeArtifactId = blueprintArtifactId;
  let activeReport = report;
  let attempts = 0;

  while (true) {
    const route = routeQualityIssues(activeReport.issues);
    if (route === "no_repair_needed") {
      return { blueprint: activeBlueprint, blueprintArtifactId: activeArtifactId, report: activeReport };
    }

    if (route === "manual_blocking_issue") {
      failSession(repository, sessionId, `${describeGateFailure(sourceGate)}; non-repairable layer quality blockers remain.`);
    }

    if (attempts >= maxQualityRepairAttempts) {
      failSession(
        repository,
        sessionId,
        `${describeGateFailure(sourceGate)}; quality repair attempts exhausted after ${attempts} attempts.`
      );
    }

    attempts += 1;
    repository.setSessionStatus(sessionId, "repair_routing");
    const repairPlan = makeRepairPlan(
      sessionId,
      blueprintVersionId,
      route,
      "gate_report",
      activeReport.issues.map((item) => item.code),
      activeReport.issues.flatMap((item) => item.affectedPaths ?? [item.path]),
      "Light semantic review gate found targeted-repairable quality issues that should be resolved before continuing downstream generation.",
      maxQualityRepairAttempts,
      {
        sourceReportId: sourceGate.id,
        sourceGate: sourceGate.gate,
        sourceGateContext: sourceGate.context
      }
    );
    persistRepairPlan(repository, repairPlan, sessionId);

    repository.setSessionStatus(sessionId, "quality_repairing");
    const locallyQualityRepaired = repairBlueprintQuality(activeBlueprint, activeReport);
    const qualityRepairStage = await runBlueprintStage(repository, {
      model,
      sessionId,
      stage: "quality_repair",
      promptVersion: STAGE_PROMPT_VERSION,
      instructions: stageInstructions.quality_repair,
      payload: {
        blueprintId: blueprintVersionId,
        validatedBlueprint: locallyQualityRepaired,
        qualityReviewReport: activeReport,
        targetedIssues: activeReport.issues.filter((item) => item.repairability === "targeted_repairable"),
        repairRules: {
          doNotChangeExplicitFacts: true,
          doNotExpandScope: true,
          fixOnlyTargetedQualityIssues: true,
          returnFullCorrectedBlueprint: true
        },
        repairPlan
      },
      schema: productBlueprintSchema,
      schemaName: "ProductBlueprintV1",
      execute: ({ payload, stageRunId }) =>
        stageClient.runStage({
          model,
          sessionId,
          stage: "quality_repair",
          stageRunId,
          promptVersion: STAGE_PROMPT_VERSION,
          instructions: stageInstructions.quality_repair,
          payload,
          schema: productBlueprintSchema,
          schemaName: "ProductBlueprintV1"
        }),
      artifactType: "blueprint",
      inputArtifactIds: [activeArtifactId]
    });

    activeBlueprint = qualityRepairStage.output;
    activeArtifactId = qualityRepairStage.artifactId;
    activeReport = {
      ...activeReport,
      passed: true,
      issues: []
    };
    repository.setSessionStatus(sessionId, "quality_repaired");
  }
}

function makeRepairPlan(
  sessionId: string,
  blueprintId: string,
  route: RepairRoute,
  source: RepairPlan["source"],
  sourceIssueCodes: string[],
  affectedPaths: string[],
  rationale: string,
  maxAttempts: number,
  metadata: Pick<RepairPlan, "sourceReportId" | "sourceGate" | "sourceGateContext"> = {}
): RepairPlan {
  return {
    id: createId("plan"),
    sessionId,
    blueprintId,
    route,
    source,
    sourceReportId: metadata.sourceReportId,
    sourceGate: metadata.sourceGate,
    sourceGateContext: metadata.sourceGateContext,
    sourceIssueCodes,
    affectedPaths,
    rationale,
    maxAttempts,
    createdAt: nowIso()
  };
}

function computeFreezeEligibility(
  sessionId: string,
  blueprintId: string,
  validationReport: ValidationReport,
  qualityReport: BlueprintQualityReport
): FreezeEligibility {
  const unresolvedBlockers = qualityReport.issues.filter((issue) => issue.severity === "blocker");
  const unresolvedHighMisleadingIssues = qualityReport.issues.filter((issue) => issue.severity === "high");
  const canFreeze =
    validationReport.schemaValid &&
    validationReport.semanticValid &&
    unresolvedBlockers.length === 0 &&
    unresolvedHighMisleadingIssues.length === 0;

  return {
    sessionId,
    blueprintId,
    schemaValid: validationReport.schemaValid,
    semanticValid: validationReport.semanticValid,
    qualityPassed: qualityReport.passed,
    unresolvedBlockers,
    unresolvedHighMisleadingIssues,
    canFreeze,
    rationale: canFreeze
      ? "Schema validation, deterministic semantic validation, and quality review all passed required freeze conditions."
      : "Freeze blocked because deterministic validation or high-severity quality review issues remain unresolved."
  };
}

async function runLayerQualityReview(
  repository: BlueprintRepository,
  stageClient: BlueprintStageClient,
  model: string,
  sessionId: string,
  stage: "flow_quality_review" | "ui_contract_review",
  blueprintId: string,
  artifactId: string,
  payload: unknown,
  onStageEvent?: (event: StageEvent) => void
): Promise<BlueprintQualityReport> {
  const result = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage,
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions[stage],
    payload,
    schema: blueprintQualityReportSchema,
    schemaName: "BlueprintQualityReport",
    execute: ({ payload: stagePayload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage,
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions[stage],
        payload: stagePayload,
        schema: blueprintQualityReportSchema,
        schemaName: "BlueprintQualityReport"
      }),
    artifactType: "quality_review_report",
    inputArtifactIds: [artifactId],
    onStageEvent
  });

  return {
    ...result.output,
    sessionId,
    blueprintId,
    id: result.output.id || createId("qrev")
  };
}

async function runFullSemanticQualityReview(
  repository: BlueprintRepository,
  stageClient: BlueprintStageClient,
  model: string,
  sessionId: string,
  blueprintId: string,
  blueprintArtifactId: string,
  blueprint: ProductBlueprintV1,
  validationReport: ValidationReport,
  priorReports: BlueprintQualityReport[],
  onStageEvent?: (event: StageEvent) => void
): Promise<BlueprintQualityReport> {
  const semanticStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "semantic_quality_review",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.semantic_quality_review,
    payload: {
      validatedBlueprint: blueprint,
      validationReport,
      priorLayerQualityReports: priorReports,
      reviewRules: {
        doNotChangeExplicitFacts: true,
        doNotExpandScope: true,
        reportIssuesOnly: true,
        focusOnSemanticConsistency: true
      }
    },
    schema: blueprintQualityReportSchema,
    schemaName: "BlueprintQualityReport",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "semantic_quality_review",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.semantic_quality_review,
        payload,
        schema: blueprintQualityReportSchema,
        schemaName: "BlueprintQualityReport"
      }),
    artifactType: "quality_review_report",
    inputArtifactIds: [blueprintArtifactId],
    onStageEvent
  });

  const localReport = reviewBlueprintQuality(sessionId, blueprintId, blueprint);
  return mergeQualityReports(sessionId, blueprintId, [...priorReports, semanticStage.output, localReport]);
}

export async function generateBlueprintFromInput(
  rawInput: string,
  options: GenerateBlueprintOptions = {}
): Promise<GenerateBlueprintResult> {
  const repository =
    options.repository ?? new BlueprintRepository(new FileBlueprintStore(options.artifactsRoot));
  const stageClient = options.stageClient ?? new OpenAIResponsesStageClient();
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.4";
  const maxRepairAttempts = options.maxRepairAttempts ?? 2;
  const maxQualityRepairAttempts = options.maxQualityRepairAttempts ?? 2;
  const session = repository.createSession();
  const sessionId = session.id;
  const onStageEvent = options.onStageEvent;

  const rawInputArtifact = repository.saveArtifact(sessionId, "raw_input", { rawInput });
  const policySeed = globalGenerationPolicySeedSchema.parse(defaultGlobalGenerationPolicySeed);
  const policySeedArtifact = repository.saveArtifact(sessionId, "global_policy_seed", policySeed);
  repository.updateSession(sessionId, {
    rawInputArtifactId: rawInputArtifact.id,
    globalPolicySeedArtifactId: policySeedArtifact.id
  });
  const inputContractGate = checkInputContract(sessionId, rawInputArtifact.id, policySeedArtifact.id, policySeed);
  persistGateReport(repository, inputContractGate, sessionId);
  if (!inputContractGate.passed) {
    failSession(repository, sessionId, describeGateFailure(inputContractGate));
  }
  repository.setSessionStatus(sessionId, "input_contract_checked");

  const productFrameSchema = productBlueprintSchema.pick({
    input: true,
    product: true,
    users: true
  });

  const inputStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "input_understanding",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.input_understanding,
    payload: { rawInput, globalPolicySeed: policySeed },
    schema: productFrameSchema,
    schemaName: "InputUnderstandingProductIntentUserModel",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "input_understanding",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.input_understanding,
        payload,
        schema: productFrameSchema,
        schemaName: "InputUnderstandingProductIntentUserModel"
      }),
    artifactType: "input_understanding",
    inputArtifactIds: [rawInputArtifact.id, policySeedArtifact.id],
    onStageEvent
  });

  const productFrameStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "product_frame",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.product_frame,
    payload: {
      rawInput,
      globalPolicySeed: policySeed,
      input: inputStage.output.input,
      product: inputStage.output.product,
      users: inputStage.output.users
    },
    schema: productFrameSchema,
    schemaName: "ProductFrame",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "product_frame",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.product_frame,
        payload,
        schema: productFrameSchema,
        schemaName: "ProductFrame"
      }),
    artifactType: "product_intent",
    inputArtifactIds: [inputStage.artifactId, policySeedArtifact.id],
    onStageEvent
  });

  repository.saveArtifact(sessionId, "input_understanding", productFrameStage.output.input);
  repository.saveArtifact(sessionId, "product_intent", productFrameStage.output.product);
  repository.saveArtifact(sessionId, "user_model", productFrameStage.output.users);
  repository.setSessionStatus(sessionId, "product_frame_generated");

  const intentGate = checkIntentScope(sessionId, rawInput, [productFrameStage.artifactId], productFrameStage.output);
  persistGateReport(repository, intentGate, sessionId);
  if (!intentGate.passed) {
    failSession(repository, sessionId, describeGateFailure(intentGate));
  }
  repository.setSessionStatus(sessionId, "intent_scope_checked");

  const domainStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "domain_modeling",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.domain_modeling,
    payload: {
      rawInput,
      globalPolicySeed: policySeed,
      input: productFrameStage.output.input,
      product: productFrameStage.output.product,
      users: productFrameStage.output.users
    },
    schema: productBlueprintSchema.shape.domain,
    schemaName: "DomainModel",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "domain_modeling",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.domain_modeling,
        payload,
        schema: productBlueprintSchema.shape.domain,
        schemaName: "DomainModel"
      }),
    artifactType: "domain_model",
    inputArtifactIds: [productFrameStage.artifactId],
    onStageEvent
  });
  repository.setSessionStatus(sessionId, "domain_generated");

  const flowStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "flow_modeling",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.flow_modeling,
    payload: {
      globalPolicySeed: policySeed,
      input: productFrameStage.output.input,
      product: productFrameStage.output.product,
      users: productFrameStage.output.users,
      domain: domainStage.output
    },
    schema: productBlueprintSchema.shape.flows,
    schemaName: "FlowModel",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "flow_modeling",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.flow_modeling,
        payload,
        schema: productBlueprintSchema.shape.flows,
        schemaName: "FlowModel"
      }),
    artifactType: "flow_model",
    inputArtifactIds: [productFrameStage.artifactId, domainStage.artifactId],
    onStageEvent
  });
  repository.setSessionStatus(sessionId, "flows_generated");

  const flowBlueprintSnapshot = assembleBlueprint({
    meta: metaForInput(rawInput),
    understanding: productFrameStage.output.input,
    product: productFrameStage.output.product,
    users: productFrameStage.output.users,
    domain: domainStage.output,
    flows: flowStage.output,
    ui: {
      appStructure: { shell: "single_page", pageOrder: [] },
      navigation: { type: "minimal", globalNavItems: [] },
      pages: [],
      globalComponents: [],
      responsivePolicy: { mobileFirst: false, breakpoints: [] }
    },
    visualPolicy: defaultVisualPolicy,
    generationPolicy: defaultGenerationPolicy,
    uncertainty: { assumptions: [], unresolvedQuestions: [], notableRisks: [] }
  });
  let flowQualityReport = await runLayerQualityReview(
    repository,
    stageClient,
    model,
    sessionId,
    "flow_quality_review",
    "flow_layer",
    flowStage.artifactId,
    {
      input: productFrameStage.output.input,
      product: productFrameStage.output.product,
      users: productFrameStage.output.users,
      domain: domainStage.output,
      flows: flowStage.output
    },
    onStageEvent
  );
  persistQualityReview(repository, flowQualityReport, sessionId);
  const flowLayerInitialGate = createLayerQualityGate(
    "domain_flow_consistency",
    { layer: "flow", kind: "light_review", sourceStage: "flow_quality_review" },
    sessionId,
    [flowStage.artifactId],
    flowQualityReport
  );
  persistGateReport(repository, flowLayerInitialGate, sessionId);
  const resolvedFlowReview = await resolveLayerQualityBlockers(
    repository,
    stageClient,
    model,
    sessionId,
    "flow_layer",
    flowStage.artifactId,
    flowBlueprintSnapshot,
    flowQualityReport,
    flowLayerInitialGate,
    maxQualityRepairAttempts
  );
  flowQualityReport = resolvedFlowReview.report;
  const flowLayerResolvedGate = createLayerQualityGate(
    "domain_flow_consistency",
    { layer: "flow", kind: "light_review", sourceStage: "quality_repair" },
    sessionId,
    [resolvedFlowReview.blueprintArtifactId],
    flowQualityReport
  );
  persistGateReport(repository, flowLayerResolvedGate, sessionId);

  const domainFlowGate = checkDomainFlowConsistency(sessionId, [domainStage.artifactId, flowStage.artifactId], {
    domain: domainStage.output,
    flows: flowStage.output,
    product: productFrameStage.output.product
  });
  persistGateReport(repository, domainFlowGate, sessionId);
  if (!domainFlowGate.passed) {
    failSession(repository, sessionId, describeGateFailure(domainFlowGate));
  }
  repository.setSessionStatus(sessionId, "domain_flow_checked");

  const uiStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "ui_modeling",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.ui_modeling,
    payload: {
      globalPolicySeed: policySeed,
      product: productFrameStage.output.product,
      users: productFrameStage.output.users,
      domain: domainStage.output,
      flows: flowStage.output
    },
    schema: productBlueprintSchema.shape.ui,
    schemaName: "UIModel",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "ui_modeling",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.ui_modeling,
        payload,
        schema: productBlueprintSchema.shape.ui,
        schemaName: "UIModel"
      }),
    artifactType: "ui_model",
    inputArtifactIds: [domainStage.artifactId, flowStage.artifactId],
    onStageEvent
  });
  repository.setSessionStatus(sessionId, "ui_generated");

  let uiContractReviewReport = await runLayerQualityReview(
    repository,
    stageClient,
    model,
    sessionId,
    "ui_contract_review",
    "ui_layer",
    uiStage.artifactId,
    {
      product: productFrameStage.output.product,
      users: productFrameStage.output.users,
      domain: domainStage.output,
      flows: flowStage.output,
      ui: uiStage.output
    },
    onStageEvent
  );
  persistQualityReview(repository, uiContractReviewReport, sessionId);
  const uiLayerInitialGate = createLayerQualityGate(
    "flow_ui_coverage",
    { layer: "ui", kind: "light_review", sourceStage: "ui_contract_review" },
    sessionId,
    [uiStage.artifactId],
    uiContractReviewReport
  );
  persistGateReport(repository, uiLayerInitialGate, sessionId);
  const uiBlueprintSnapshot = assembleBlueprint({
    meta: metaForInput(rawInput),
    understanding: productFrameStage.output.input,
    product: productFrameStage.output.product,
    users: productFrameStage.output.users,
    domain: domainStage.output,
    flows: flowStage.output,
    ui: uiStage.output,
    visualPolicy: defaultVisualPolicy,
    generationPolicy: defaultGenerationPolicy,
    uncertainty: { assumptions: [], unresolvedQuestions: [], notableRisks: [] }
  });
  const resolvedUiReview = await resolveLayerQualityBlockers(
    repository,
    stageClient,
    model,
    sessionId,
    "ui_layer",
    uiStage.artifactId,
    uiBlueprintSnapshot,
    uiContractReviewReport,
    uiLayerInitialGate,
    maxQualityRepairAttempts
  );
  uiContractReviewReport = resolvedUiReview.report;
  const uiLayerResolvedGate = createLayerQualityGate(
    "flow_ui_coverage",
    { layer: "ui", kind: "light_review", sourceStage: "quality_repair" },
    sessionId,
    [resolvedUiReview.blueprintArtifactId],
    uiContractReviewReport
  );
  persistGateReport(repository, uiLayerResolvedGate, sessionId);

  const flowUiGate = checkFlowUiCoverage(sessionId, [flowStage.artifactId, uiStage.artifactId], {
    flows: flowStage.output,
    ui: uiStage.output
  });
  persistGateReport(repository, flowUiGate, sessionId);
  if (!flowUiGate.passed) {
    failSession(repository, sessionId, describeGateFailure(flowUiGate));
  }
  repository.setSessionStatus(sessionId, "flow_ui_checked");

  const policySchema = productBlueprintSchema.pick({
    visualPolicy: true,
    generationPolicy: true,
    uncertainty: true
  });

  const policyStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "policy_uncertainty",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.policy_uncertainty,
    payload: {
      globalPolicySeed: policySeed,
      understanding: productFrameStage.output.input,
      product: productFrameStage.output.product,
      users: productFrameStage.output.users,
      domain: domainStage.output,
      flows: flowStage.output,
      ui: uiStage.output
    },
    schema: policySchema,
    schemaName: "PolicyUncertaintyStageOutput",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "policy_uncertainty",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.policy_uncertainty,
        payload,
        schema: policySchema,
        schemaName: "PolicyUncertaintyStageOutput"
      }),
    artifactType: "visual_policy",
    inputArtifactIds: [productFrameStage.artifactId, domainStage.artifactId, flowStage.artifactId, uiStage.artifactId],
    onStageEvent
  });
  repository.saveArtifact(sessionId, "generation_policy", policyStage.output.generationPolicy);
  repository.saveArtifact(sessionId, "uncertainty_model", policyStage.output.uncertainty);
  repository.setSessionStatus(sessionId, "policy_generated");

  const assembled = assembleBlueprint({
    meta: metaForInput(rawInput),
    understanding: productFrameStage.output.input,
    product: productFrameStage.output.product,
    users: productFrameStage.output.users,
    domain: domainStage.output,
    flows: flowStage.output,
    ui: uiStage.output,
    visualPolicy: policyStage.output.visualPolicy,
    generationPolicy: policyStage.output.generationPolicy,
    uncertainty: policyStage.output.uncertainty
  });

  const blueprintStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "blueprint_assembly",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.blueprint_assembly,
    payload: assembled,
    schema: productBlueprintSchema,
    schemaName: "ProductBlueprintV1",
    execute: ({ payload, stageRunId }) =>
      stageClient.runStage({
        model,
        sessionId,
        stage: "blueprint_assembly",
        stageRunId,
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.blueprint_assembly,
        payload,
        schema: productBlueprintSchema,
        schemaName: "ProductBlueprintV1"
      }),
    artifactType: "blueprint",
    inputArtifactIds: [productFrameStage.artifactId, domainStage.artifactId, flowStage.artifactId, uiStage.artifactId],
    onStageEvent
  });

  let activeBlueprint = blueprintStage.output;
  let blueprintArtifactId = blueprintStage.artifactId;
  let blueprintVersion = repository.createBlueprintVersion(sessionId, blueprintArtifactId, "draft");
  repository.setSessionStatus(sessionId, "blueprint_assembled");

  repository.setSessionStatus(sessionId, "validating");
  let validationReport = validateBlueprint(sessionId, blueprintVersion.id, activeBlueprint);
  let validationReportId = persistValidationReport(repository, validationReport, sessionId);
  repository.updateBlueprintVersion(blueprintVersion.id, { validationReportId });
  const deterministicGate = checkDeterministicValidation(sessionId, blueprintArtifactId, validationReport);
  persistGateReport(repository, deterministicGate, sessionId);

  let repairAttempts = 0;
  while (hasValidationFailure(validationReport) && repairAttempts < maxRepairAttempts) {
    repairAttempts += 1;
    repository.setSessionStatus(sessionId, "repair_routing");
    const route = routeValidationIssues(validationReport.issues);
    const repairPlan = makeRepairPlan(
      sessionId,
      blueprintVersion.id,
      route,
      "validation_report",
      validationReport.issues.map((item) => item.code),
      validationReport.issues.map((item) => item.path),
      "Deterministic validation failed and requires routed repair before semantic quality review.",
      maxRepairAttempts,
      {
        sourceReportId: validationReport.id
      }
    );
    persistRepairPlan(repository, repairPlan, sessionId);

    repository.setSessionStatus(sessionId, "repairing");
    const locallyRepaired = repairBlueprint(activeBlueprint, validationReport);
    const repairStage = await runBlueprintStage(repository, {
      model,
      sessionId,
      stage: "blueprint_repair",
      promptVersion: STAGE_PROMPT_VERSION,
      instructions: stageInstructions.blueprint_repair,
      payload: {
        blueprint: locallyRepaired,
        issues: validationReport.issues,
        repairPlan
      },
      schema: productBlueprintSchema,
      schemaName: "ProductBlueprintV1",
      execute: ({ payload, stageRunId }) =>
        stageClient.runStage({
          model,
          sessionId,
          stage: "blueprint_repair",
          stageRunId,
          promptVersion: STAGE_PROMPT_VERSION,
          instructions: stageInstructions.blueprint_repair,
          payload,
          schema: productBlueprintSchema,
          schemaName: "ProductBlueprintV1"
        }),
      artifactType: "blueprint",
      inputArtifactIds: [blueprintArtifactId],
      onStageEvent
    });

    activeBlueprint = repairStage.output;
    blueprintArtifactId = repairStage.artifactId;
    blueprintVersion = repository.createBlueprintVersion(sessionId, blueprintArtifactId, "repaired");
    repository.setSessionStatus(sessionId, "validating");
    validationReport = validateBlueprint(sessionId, blueprintVersion.id, activeBlueprint);
    validationReportId = persistValidationReport(repository, validationReport, sessionId);
    repository.updateBlueprintVersion(blueprintVersion.id, { validationReportId });
  }

  if (hasValidationFailure(validationReport)) {
    failSession(
      repository,
      sessionId,
      `${describeValidationFailure(validationReport)}; repair attempts exhausted after ${repairAttempts} attempts.`
    );
  }

  repository.updateBlueprintVersion(blueprintVersion.id, {
    status: "validated",
    validationReportId
  });
  repository.setSessionStatus(sessionId, "validated");

  let qualityReviewReportId = "";
  let semanticReport: BlueprintQualityReport;
  let qualityAttempts = 0;

  while (true) {
    repository.setSessionStatus(sessionId, "quality_reviewing");
    semanticReport = await runFullSemanticQualityReview(
      repository,
      stageClient,
      model,
      sessionId,
      blueprintVersion.id,
      blueprintArtifactId,
      activeBlueprint,
      validationReport,
      [flowQualityReport, uiContractReviewReport],
      onStageEvent
    );
    qualityReviewReportId = persistQualityReview(repository, semanticReport, sessionId);
    repository.updateBlueprintVersion(blueprintVersion.id, { qualityReviewReportId });

    const route = routeQualityIssues(semanticReport.issues);
    if (route === "no_repair_needed") {
      break;
    }

    if (route === "manual_blocking_issue") {
      failSession(repository, sessionId, `${describeQualityFailure(semanticReport)}; non-repairable blockers remain.`);
    }

    if (qualityAttempts >= maxQualityRepairAttempts) {
      failSession(
        repository,
        sessionId,
        `${describeQualityFailure(semanticReport)}; quality repair attempts exhausted after ${qualityAttempts} attempts.`
      );
    }

    qualityAttempts += 1;
    repository.setSessionStatus(sessionId, "repair_routing");
    const repairPlan = makeRepairPlan(
      sessionId,
      blueprintVersion.id,
      route,
      "quality_review_report",
      semanticReport.issues.map((item) => item.code),
      semanticReport.issues.flatMap((item) => item.affectedPaths ?? [item.path]),
      "Quality review found targeted-repairable semantic or UX issues requiring local quality repair.",
      maxQualityRepairAttempts,
      {
        sourceReportId: semanticReport.id
      }
    );
    persistRepairPlan(repository, repairPlan, sessionId);

    repository.setSessionStatus(sessionId, "quality_repairing");
    const locallyQualityRepaired = repairBlueprintQuality(activeBlueprint, semanticReport);
    const qualityRepairStage = await runBlueprintStage(repository, {
      model,
      sessionId,
      stage: "quality_repair",
      promptVersion: STAGE_PROMPT_VERSION,
      instructions: stageInstructions.quality_repair,
      payload: {
        blueprintId: blueprintVersion.id,
        validatedBlueprint: locallyQualityRepaired,
        qualityReviewReport: semanticReport,
        targetedIssues: semanticReport.issues.filter((item) => item.repairability === "targeted_repairable"),
        repairRules: {
          doNotChangeExplicitFacts: true,
          doNotExpandScope: true,
          fixOnlyTargetedQualityIssues: true,
          returnFullCorrectedBlueprint: true
        },
        repairPlan
      },
      schema: productBlueprintSchema,
      schemaName: "ProductBlueprintV1",
      execute: ({ payload, stageRunId }) =>
        stageClient.runStage({
          model,
          sessionId,
          stage: "quality_repair",
          stageRunId,
          promptVersion: STAGE_PROMPT_VERSION,
          instructions: stageInstructions.quality_repair,
          payload,
          schema: productBlueprintSchema,
          schemaName: "ProductBlueprintV1"
        }),
      artifactType: "blueprint",
      inputArtifactIds: [blueprintArtifactId],
      onStageEvent
    });

    activeBlueprint = qualityRepairStage.output;
    blueprintArtifactId = qualityRepairStage.artifactId;
    blueprintVersion = repository.createBlueprintVersion(sessionId, blueprintArtifactId, "quality_repaired");
    repository.setSessionStatus(sessionId, "quality_repaired");

    repository.setSessionStatus(sessionId, "validating");
    validationReport = validateBlueprint(sessionId, blueprintVersion.id, activeBlueprint);
    validationReportId = persistValidationReport(repository, validationReport, sessionId);
    repository.updateBlueprintVersion(blueprintVersion.id, { validationReportId });
    if (hasValidationFailure(validationReport)) {
      if (repairAttempts >= maxRepairAttempts) {
        failSession(
          repository,
          sessionId,
          `${describeRepairPlan(repairPlan)}; quality repair introduced validation failures beyond bounded repair attempts.`
        );
      }
      repairAttempts += 1;
      repository.setSessionStatus(sessionId, "repairing");
      const locallyRepaired = repairBlueprint(activeBlueprint, validationReport);
      const repairStage = await runBlueprintStage(repository, {
        model,
        sessionId,
        stage: "blueprint_repair",
        promptVersion: STAGE_PROMPT_VERSION,
        instructions: stageInstructions.blueprint_repair,
        payload: {
          blueprint: locallyRepaired,
          issues: validationReport.issues
        },
        schema: productBlueprintSchema,
        schemaName: "ProductBlueprintV1",
        execute: ({ payload, stageRunId }) =>
          stageClient.runStage({
            model,
            sessionId,
            stage: "blueprint_repair",
            stageRunId,
            promptVersion: STAGE_PROMPT_VERSION,
            instructions: stageInstructions.blueprint_repair,
            payload,
            schema: productBlueprintSchema,
            schemaName: "ProductBlueprintV1"
          }),
        artifactType: "blueprint",
        inputArtifactIds: [blueprintArtifactId]
      });
      activeBlueprint = repairStage.output;
      blueprintArtifactId = repairStage.artifactId;
      blueprintVersion = repository.createBlueprintVersion(sessionId, blueprintArtifactId, "repaired");
      repository.setSessionStatus(sessionId, "validating");
      validationReport = validateBlueprint(sessionId, blueprintVersion.id, activeBlueprint);
      validationReportId = persistValidationReport(repository, validationReport, sessionId);
      repository.updateBlueprintVersion(blueprintVersion.id, { validationReportId });
      if (hasValidationFailure(validationReport)) {
        failSession(
          repository,
          sessionId,
          `${describeValidationFailure(validationReport)}; ${describeRepairPlan(repairPlan)} introduced unrepairable deterministic validation failures.`
        );
      }
    }
  }

  const qualityGate = checkQualityRevalidation(sessionId, blueprintArtifactId, validationReport, semanticReport);
  persistGateReport(repository, qualityGate, sessionId);
  const freezeEligibility = computeFreezeEligibility(sessionId, blueprintVersion.id, validationReport, semanticReport);
  if (!freezeEligibility.canFreeze) {
    failSession(repository, sessionId, freezeEligibility.rationale);
  }

  repository.supersedeNonFrozenBlueprints(sessionId, blueprintVersion.id);
  blueprintVersion = repository.updateBlueprintVersion(blueprintVersion.id, {
    status: "frozen",
    validationReportId,
    qualityReviewReportId
  });
  repository.setSessionStatus(sessionId, "blueprint_frozen");
  repository.updateSession(sessionId, { activeBlueprintId: blueprintVersion.id });

  return {
    sessionId,
    blueprintId: blueprintVersion.id,
    blueprint: activeBlueprint,
    qualityReviewReportId,
    validationReportId,
    repository
  };
}
