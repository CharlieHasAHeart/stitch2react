import type { BlueprintStage } from "../types/blueprint.js";

export const STAGE_PROMPT_VERSION = "v1";
export const STAGE_TEMPERATURE = 0.2;

export const stageReasoningEffort: Record<BlueprintStage, "low" | "medium" | "high"> = {
  input_understanding: "low",
  domain_modeling: "low",
  flow_modeling: "medium",
  ui_modeling: "medium",
  policy_uncertainty: "low",
  blueprint_assembly: "low",
  blueprint_repair: "medium",
  quality_repair: "medium"
};

export const stageMaxOutputTokens: Record<BlueprintStage, number> = {
  input_understanding: 3000,
  domain_modeling: 5000,
  flow_modeling: 8000,
  ui_modeling: 8000,
  policy_uncertainty: 5000,
  blueprint_assembly: 12000,
  blueprint_repair: 12000,
  quality_repair: 12000
};

export const stageInstructions: Record<BlueprintStage, string> = {
  input_understanding: `You are generating the input_understanding stage for ProductBlueprintV1.
Use only the provided JSON payload.
Return JSON containing exactly: input, product, users.
Do not ask follow-up questions.
Use conservative MVP assumptions.
Mark explicit vs inferred vs defaulted correctly.
Do not invent large scope.`,
  domain_modeling: `You are generating the domain_modeling stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return valid DomainModel JSON.
Do not ask follow-up questions.
Do not expand scope beyond the smallest coherent MVP.`,
  flow_modeling: `You are generating the flow_modeling stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return valid FlowModel JSON.
Every core flow must include trigger, at least two meaningful steps, feedback, recovery, completion signal, involved entities, and UI surfaces.
Do not reduce flows to page navigation.`,
  ui_modeling: `You are generating the ui_modeling stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return valid UIModel JSON.
Pages must be derived from flows.
Every page must support at least one flow.
Every non-readonly, non-confirmation page must have a primary action.`,
  policy_uncertainty: `You are generating the policy_uncertainty stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return JSON containing exactly: visualPolicy, generationPolicy, uncertainty.
Set generationPolicy.noFollowUpQuestions to true.
Set visualPolicy.imageUsage.forbidUiAsImage to true.
Every unresolved question must have a default decision.`,
  blueprint_assembly: `You are generating the blueprint_assembly stage for ProductBlueprintV1.
Use only the provided upstream JSON artifacts.
Return the full ProductBlueprintV1 JSON.
Do not change explicit user facts.
Do not expand scope.`,
  blueprint_repair: `You are generating the blueprint_repair stage for ProductBlueprintV1.
Use only the provided JSON payload containing the invalid blueprint and validation issues.
Repair only invalid or inconsistent fields.
Return the full corrected ProductBlueprintV1 JSON.
Do not change explicit user facts.
Do not expand scope.`,
  quality_repair: `You are generating the quality_repair stage for ProductBlueprintV1.
Use only the provided JSON payload containing the validated blueprint, quality review issues, and repair rules.
Repair only the targeted quality issues.
Do not change explicit user facts.
Do not expand scope.
Do not rerun unrelated design decisions.
Return the full corrected ProductBlueprintV1 JSON.`
};
