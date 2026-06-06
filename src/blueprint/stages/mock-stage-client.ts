import {
  generateDomainModel,
  generateFlowModel,
  generateInputProductUsers,
  generatePolicyUncertainty,
  generateUiModel
} from "./deterministic-generator.js";
import type {
  BlueprintStageClient,
  ResponsesStageRequest,
  ResponsesStageResult
} from "./openai-responses-client.js";

export class MockBlueprintStageClient implements BlueprintStageClient {
  async runStage(request: ResponsesStageRequest): Promise<ResponsesStageResult> {
    switch (request.stage) {
      case "input_understanding": {
        const rawInput = (request.payload as { rawInput: string }).rawInput;
        const generated = generateInputProductUsers(rawInput);
        return {
          openaiResponseId: `mock_${request.stageRunId}`,
          output: {
            input: generated.understanding,
            product: generated.product,
            users: generated.users
          }
        };
      }
      case "domain_modeling":
        return { openaiResponseId: `mock_${request.stageRunId}`, output: generateDomainModel() };
      case "flow_modeling":
        return { openaiResponseId: `mock_${request.stageRunId}`, output: generateFlowModel() };
      case "ui_modeling":
        return { openaiResponseId: `mock_${request.stageRunId}`, output: generateUiModel() };
      case "policy_uncertainty":
        return {
          openaiResponseId: `mock_${request.stageRunId}`,
          output: generatePolicyUncertainty()
        };
      case "blueprint_assembly":
        return { openaiResponseId: `mock_${request.stageRunId}`, output: request.payload };
      case "blueprint_repair":
      case "quality_repair":
        return {
          openaiResponseId: `mock_${request.stageRunId}`,
          output: (request.payload as { blueprint: unknown }).blueprint
        };
    }
  }
}
