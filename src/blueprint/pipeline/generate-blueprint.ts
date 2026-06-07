import { assembleBlueprint } from "../assembly/assemble-blueprint.js";
import { FileBlueprintStore } from "../persistence/file-store.js";
import { BlueprintRepository } from "../persistence/repository.js";
import { stageInstructions, STAGE_PROMPT_VERSION } from "../prompts/stages.js";
import { reviewBlueprintQuality } from "../quality/review-blueprint.js";
import { repairBlueprint } from "../repair/repair-blueprint.js";
import { repairBlueprintQuality } from "../repair/quality-repair.js";
import { productBlueprintSchema } from "../schemas/blueprint.js";
import { OpenAIResponsesStageClient } from "../stages/openai-responses-client.js";
import { runBlueprintStage } from "../stages/stage-runner.js";
import type { BlueprintStageClient } from "../stages/openai-responses-client.js";
import type { BlueprintMeta, ProductBlueprintV1, QualityIssue, QualityReviewReport, ValidationReport } from "../types/blueprint.js";
import { validateBlueprint } from "../validation/validate-blueprint.js";

export type GenerateBlueprintOptions = {
  artifactsRoot?: string;
  model?: string;
  maxRepairAttempts?: number;
  maxQualityRepairAttempts?: number;
  repository?: BlueprintRepository;
  stageClient?: BlueprintStageClient;
};

export type GenerateBlueprintResult = {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  qualityReviewReportId: string;
  validationReportId: string;
  repository: BlueprintRepository;
};

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

function persistQualityReview(
  repository: BlueprintRepository,
  report: QualityReviewReport,
  sessionId: string
): string {
  repository.saveQualityReviewReport(report);
  repository.saveArtifact(sessionId, "quality_review_report", report);
  return report.id;
}

function hasValidationFailure(report: ValidationReport): boolean {
  return !report.schemaValid || !report.semanticValid;
}

function hasQualityBlocker(issues: QualityIssue[]): boolean {
  return issues.some((item) => item.severity === "blocker" || item.severity === "high");
}

function classifyQualityBlockers(issues: QualityIssue[]): {
  targetedRepairable: QualityIssue[];
  nonRepairable: QualityIssue[];
} {
  const blockers = issues.filter((item) => item.severity === "blocker" || item.severity === "high");
  return {
    targetedRepairable: blockers.filter((item) => item.repairability === "targeted_repairable"),
    nonRepairable: blockers.filter((item) => item.repairability === "non_repairable")
  };
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

  const actualRawInputArtifact = repository.saveArtifact(sessionId, "raw_input", { rawInput });
  repository.updateSession(sessionId, { rawInputArtifactId: actualRawInputArtifact.id });

  const inputSchema = productBlueprintSchema.pick({
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
    payload: { rawInput },
    schema: inputSchema,
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
        schema: inputSchema,
        schemaName: "InputUnderstandingProductIntentUserModel"
      }),
    artifactType: "input_understanding",
    inputArtifactIds: [actualRawInputArtifact.id]
  });

  repository.saveArtifact(sessionId, "product_intent", inputStage.output.product);
  repository.saveArtifact(sessionId, "user_model", inputStage.output.users);

  const domainSchema = productBlueprintSchema.shape.domain;
  const domainStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "domain_modeling",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.domain_modeling,
    payload: {
      rawInput,
      input: inputStage.output.input,
      product: inputStage.output.product,
      users: inputStage.output.users
    },
    schema: domainSchema,
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
        schema: domainSchema,
        schemaName: "DomainModel"
      }),
    artifactType: "domain_model",
    inputArtifactIds: [actualRawInputArtifact.id, inputStage.artifactId]
  });

  const flowSchema = productBlueprintSchema.shape.flows;
  const flowStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "flow_modeling",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.flow_modeling,
    payload: {
      input: inputStage.output.input,
      product: inputStage.output.product,
      users: inputStage.output.users,
      domain: domainStage.output
    },
    schema: flowSchema,
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
        schema: flowSchema,
        schemaName: "FlowModel"
      }),
    artifactType: "flow_model",
    inputArtifactIds: [inputStage.artifactId, domainStage.artifactId]
  });

  const uiSchema = productBlueprintSchema.shape.ui;
  const uiStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "ui_modeling",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.ui_modeling,
    payload: {
      product: inputStage.output.product,
      users: inputStage.output.users,
      domain: domainStage.output,
      flows: flowStage.output
    },
    schema: uiSchema,
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
        schema: uiSchema,
        schemaName: "UIModel"
      }),
    artifactType: "ui_model",
    inputArtifactIds: [domainStage.artifactId, flowStage.artifactId]
  });

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
      understanding: inputStage.output.input,
      product: inputStage.output.product,
      users: inputStage.output.users,
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
    inputArtifactIds: [inputStage.artifactId, domainStage.artifactId, flowStage.artifactId, uiStage.artifactId]
  });

  repository.saveArtifact(sessionId, "generation_policy", policyStage.output.generationPolicy);
  repository.saveArtifact(sessionId, "uncertainty_model", policyStage.output.uncertainty);

  const assembled = assembleBlueprint({
    meta: metaForInput(rawInput),
    understanding: inputStage.output.input,
    product: inputStage.output.product,
    users: inputStage.output.users,
    domain: domainStage.output,
    flows: flowStage.output,
    ui: uiStage.output,
    visualPolicy: policyStage.output.visualPolicy,
    generationPolicy: policyStage.output.generationPolicy,
    uncertainty: policyStage.output.uncertainty
  });

  const blueprintSchema = productBlueprintSchema;
  const blueprintStage = await runBlueprintStage(repository, {
    model,
    sessionId,
    stage: "blueprint_assembly",
    promptVersion: STAGE_PROMPT_VERSION,
    instructions: stageInstructions.blueprint_assembly,
    payload: assembled,
    schema: blueprintSchema,
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
        schema: blueprintSchema,
        schemaName: "ProductBlueprintV1"
      }),
    artifactType: "blueprint",
    inputArtifactIds: [inputStage.artifactId, domainStage.artifactId, flowStage.artifactId, uiStage.artifactId]
  });

  let activeBlueprint = blueprintStage.output;
  let blueprintArtifactId = blueprintStage.artifactId;
  let blueprintVersion = repository.createBlueprintVersion(sessionId, blueprintArtifactId, "draft");

  repository.setSessionStatus(sessionId, "validating");
  let validationReport = validateBlueprint(sessionId, blueprintVersion.id, activeBlueprint);
  repository.saveValidationReport(validationReport);
  repository.updateBlueprintVersion(blueprintVersion.id, {
    validationReportId: validationReport.id
  });

  let attempts = 0;

  while (hasValidationFailure(validationReport) && attempts < maxRepairAttempts) {
    attempts += 1;
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
      schema: blueprintSchema,
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
          schema: blueprintSchema,
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
    repository.saveValidationReport(validationReport);
    repository.updateBlueprintVersion(blueprintVersion.id, {
      validationReportId: validationReport.id
    });
  }

  if (hasValidationFailure(validationReport)) {
    repository.setSessionStatus(sessionId, "failed");
    throw new Error(`Blueprint validation failed after ${attempts} repair attempts.`);
  }

  blueprintVersion = repository.updateBlueprintVersion(blueprintVersion.id, {
    status: "validated",
    validationReportId: validationReport.id
  });
  repository.setSessionStatus(sessionId, "validated");

  let qualityReviewReport: QualityReviewReport;
  let qualityReviewReportId = "";
  let qualityAttempts = 0;

  while (true) {
    repository.setSessionStatus(sessionId, "quality_reviewing");
    qualityReviewReport = reviewBlueprintQuality(sessionId, blueprintVersion.id, activeBlueprint);
    qualityReviewReportId = persistQualityReview(repository, qualityReviewReport, sessionId);
    blueprintVersion = repository.updateBlueprintVersion(blueprintVersion.id, {
      qualityReviewReportId
    });

    if (!hasQualityBlocker(qualityReviewReport.issues)) {
      break;
    }

    const classified = classifyQualityBlockers(qualityReviewReport.issues);
    if (classified.nonRepairable.length > 0) {
      repository.setSessionStatus(sessionId, "failed");
      throw new Error(`Blueprint quality review failed with non-repairable blocker/high issues.`);
    }

    if (classified.targetedRepairable.length === 0 || qualityAttempts >= maxQualityRepairAttempts) {
      repository.setSessionStatus(sessionId, "failed");
      throw new Error(`Blueprint quality review failed after ${qualityAttempts} quality repair attempts.`);
    }

    qualityAttempts += 1;
    repository.setSessionStatus(sessionId, "quality_repairing");
    const locallyQualityRepaired = repairBlueprintQuality(activeBlueprint, qualityReviewReport);
    const qualityRepairStage = await runBlueprintStage(repository, {
      model,
      sessionId,
      stage: "quality_repair",
      promptVersion: STAGE_PROMPT_VERSION,
      instructions: stageInstructions.quality_repair,
      payload: {
        blueprint: locallyQualityRepaired,
        qualityReviewReport,
        targetedQualityIssues: classified.targetedRepairable,
        repairRules: {
          doNotChangeExplicitFacts: true,
          doNotExpandScope: true,
          fixOnlyTargetedQualityIssues: true,
          returnFullCorrectedBlueprint: true
        }
      },
      schema: blueprintSchema,
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
          schema: blueprintSchema,
          schemaName: "ProductBlueprintV1"
        }),
      artifactType: "blueprint",
      inputArtifactIds: [blueprintArtifactId]
    });

    activeBlueprint = qualityRepairStage.output;
    blueprintArtifactId = qualityRepairStage.artifactId;
    blueprintVersion = repository.createBlueprintVersion(sessionId, blueprintArtifactId, "repaired");
    repository.setSessionStatus(sessionId, "quality_repaired");

    repository.setSessionStatus(sessionId, "validating");
    validationReport = validateBlueprint(sessionId, blueprintVersion.id, activeBlueprint);
    repository.saveValidationReport(validationReport);
    repository.updateBlueprintVersion(blueprintVersion.id, {
      validationReportId: validationReport.id
    });

    if (hasValidationFailure(validationReport)) {
      if (attempts >= maxRepairAttempts) {
        repository.setSessionStatus(sessionId, "failed");
        throw new Error(`Quality repair introduced validation failures after ${attempts} repair attempts.`);
      }

      attempts += 1;
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
        schema: blueprintSchema,
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
            schema: blueprintSchema,
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
      repository.saveValidationReport(validationReport);
      repository.updateBlueprintVersion(blueprintVersion.id, {
        validationReportId: validationReport.id
      });

      if (hasValidationFailure(validationReport)) {
        repository.setSessionStatus(sessionId, "failed");
        throw new Error(`Quality repair introduced unrepairable schema or semantic failures.`);
      }
    }

    blueprintVersion = repository.updateBlueprintVersion(blueprintVersion.id, {
      status: "validated",
      validationReportId: validationReport.id
    });
  }

  repository.supersedeNonFrozenBlueprints(sessionId, blueprintVersion.id);
  blueprintVersion = repository.updateBlueprintVersion(blueprintVersion.id, {
    status: "frozen",
    qualityReviewReportId
  });
  repository.updateSession(sessionId, {
    activeBlueprintId: blueprintVersion.id,
    status: "frozen"
  });

  return {
    sessionId,
    blueprintId: blueprintVersion.id,
    blueprint: activeBlueprint,
    qualityReviewReportId,
    validationReportId: validationReport.id,
    repository
  };
}

