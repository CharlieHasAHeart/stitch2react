import { productBlueprintSchema } from "../schemas/blueprint.js";
import type {
  PageContract,
  PageRoleClassification,
  ProductBlueprintV1,
  QualityReviewReport
} from "../types/blueprint.js";

const desktopBreakpoints = ["1920x1080", "1440x900", "2560x1440"];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setOptionalContactQuoteRequestShape(repaired: ProductBlueprintV1): void {
  for (const entity of repaired.domain.entities) {
    if (entity.id !== "quote_request") {
      continue;
    }

    const requiredDetailField = entity.fields.find((field) => /request|detail|description/i.test(field.name));
    if (!requiredDetailField) {
      entity.fields.push({
        name: "requestDetails",
        type: "string",
        required: true,
        description: "Main quote request details required to produce a visible result."
      });
    }

    for (const field of entity.fields) {
      if (/contact|phone|mobile|email/i.test(field.name)) {
        field.required = false;
        field.description = "Optional contact information when the business later chooses to follow up.";
      }
    }
  }
}

function softenImmediateQuoteAssumption(repaired: ProductBlueprintV1): void {
  repaired.product.primaryValueProposition.value =
    "Submit a quote request without login and see a visible result after submission.";

  repaired.product.successDefinition.value =
    "User submits the request and sees a visible result after submission.";

  repaired.product.successDefinition.source = "defaulted";
  repaired.product.successDefinition.confidence = "medium";
  repaired.product.successDefinition.evidence =
    "The explicit requirement is only that the user submits and sees a result, not that the result must be an instant numeric quote.";

  repaired.domain.businessRules = repaired.domain.businessRules.map((rule) => {
    if (/立即|即时|预估|amount|金额|QuoteResult/i.test(rule)) {
      return "提交报价申请后，系统必须返回一个用户可见的报价结果或明确结果状态。";
    }
    return rule;
  });

  for (const flow of repaired.flows.coreUserFlows) {
    const enterStep = flow.steps[0];
    if (enterStep) {
      enterStep.detail =
        "访客在报价申请表单中填写生成可见结果所需的最小必要信息，例如报价对象或服务类型、数量或规格，以及必要的申请说明。联系方式仅在业务确有需要时作为可选补充信息。";
    }

    const resultGenerationStep = flow.steps.find((step) => step.id.includes("generate") || /生成报价结果/.test(step.label));
    if (resultGenerationStep) {
      resultGenerationStep.detail =
        "系统基于已提交的 QuoteRequest 生成并返回当前申请对应的可见结果；默认不把结果类型锁定为即时金额，可为预估结果、结果摘要或明确的结果状态说明。";
    }

    const resultFeedbackStep = flow.steps.find((step) => step.kind === "feedback");
    if (resultFeedbackStep) {
      resultFeedbackStep.label = "展示结果并保留再次调整入口";
      resultFeedbackStep.detail =
        "系统在结果区域清晰展示当前申请的可见结果；当用户已经看到结果时，本次主流程即视为完成。若用户希望调整参数，可通过次级动作“修改信息并重新计算”返回编辑态后再次提交。";
    }

    flow.completionSignal = {
      userVisible: true,
      signal: "用户已在页面中看到当前申请对应的结果"
    };

    flow.feedback = flow.feedback.map((item, index) => {
      if (index === 0) {
        return "若缺少生成结果所需的必填信息，系统会给出明确字段反馈；联系方式只有在被填写时才校验其格式。";
      }
      if (/报价金额|预估/.test(item)) {
        return "系统展示当前申请对应的结果内容与结果说明。";
      }
      return item;
    });
  }

  for (const feedbackFlow of repaired.flows.feedbackFlows) {
    feedbackFlow.name = feedbackFlow.name.replace("（含结果态修改重算入口）", "");
    feedbackFlow.states = feedbackFlow.states.map((state) => {
      if (/result_ready/.test(state)) {
        return "result_ready：结果已可见，用户可选择结束本次任务，或通过次级动作重新修改信息。";
      }
      return state;
    });
  }
}

function makeResultPageAction(pageId: string) {
  return {
    id: `${pageId}_next_action`,
    label: "Start over",
    kind: "secondary" as const,
    targetPageId: "quote_request_form",
    feedback: "Lets the user return to the request form and submit a new input"
  };
}

function repairUiContractAmbiguity(repaired: ProductBlueprintV1): void {
  const formPage = repaired.ui.pages.find((page) => !page.readonly && !page.confirmationOnly);
  const resultPage = repaired.ui.pages.find((page) => page.readonly || /result/i.test(page.id));

  if (formPage?.primaryAction) {
    formPage.primaryAction.targetPageId = resultPage?.id ?? formPage.primaryAction.targetPageId;
    formPage.primaryAction.feedback =
      "提交成功后进入当前申请对应的结果页；若校验失败或提交失败，则停留在当前页并显示明确反馈，允许用户修正或重试。";
  }

  if (resultPage) {
    if (resultPage.route === "/result") {
      resultPage.route = "/result/:resultToken";
    }

    resultPage.purpose =
      "Show the visible result for the current submission, or a structured fallback state when the result token is missing or the result cannot be loaded.";

    const hasRetryCurrentResult = resultPage.secondaryActions.some((action) => /重试|retry/i.test(action.label));
    if (!hasRetryCurrentResult) {
      resultPage.secondaryActions.push({
        id: `${resultPage.id}_retry_current_result`,
        label: "重试加载当前结果",
        kind: "secondary",
        triggersFlowId: "recovery_result_page_missing_or_load_failed",
        feedback: "在结果加载失败时重试获取当前 resultToken 对应的结果。"
      });
    }

    const hasReturnToForm = resultPage.secondaryActions.some((action) => action.targetPageId === formPage?.id);
    if (!hasReturnToForm && formPage) {
      resultPage.secondaryActions.push({
        id: `${resultPage.id}_return_to_form`,
        label: "返回报价申请页",
        kind: "secondary",
        targetPageId: formPage.id,
        feedback: "当当前结果无法展示时，返回报价申请页重新发起申请。"
      });
    }

    if (!resultPage.supportsFlowIds.includes("recovery_result_page_missing_or_load_failed")) {
      resultPage.supportsFlowIds.push("recovery_result_page_missing_or_load_failed");
    }

    if (!repaired.flows.recoveryFlows.some((flow) => flow.id === "recovery_result_page_missing_or_load_failed")) {
      repaired.flows.recoveryFlows.push({
        id: "recovery_result_page_missing_or_load_failed",
        name: "结果页缺少上下文或加载失败时恢复",
        sourceFlowId: repaired.flows.coreUserFlows[0]?.id ?? "core_flow",
        failureCondition:
          "结果页缺少有效 resultToken，或存在 resultToken 但当前提交对应的结果加载失败。",
        recoveryActions: [
          "若缺少或无效 resultToken，则提示当前没有可展示的结果，并允许返回报价申请页重新发起申请。",
          "若存在 resultToken 但结果加载失败，则允许重试加载当前结果。",
          "在任一异常态下，都提供返回报价申请页的明确入口。"
        ]
      });
    }
  }
}

function classifyPageRole(page: PageContract): PageRoleClassification {
  const haystack = [page.id, page.name, page.route, page.purpose].join(" ").toLowerCase();
  const evidence: string[] = [];

  if (page.readonly) {
    evidence.push("readonly=true");
  }
  if (page.confirmationOnly) {
    evidence.push("confirmationOnly=true");
  }
  if (/result|success|confirmation|complete|completed/.test(haystack)) {
    evidence.push("result-like-role-word");
  }
  if (/show|display/.test(page.purpose.toLowerCase()) && /result|confirmation|output/.test(page.purpose.toLowerCase())) {
    evidence.push("purpose-shows-result");
  }
  if (page.primaryAction?.kind === "primary" && page.primaryAction.triggersFlowId) {
    evidence.push("input-primary-action");
  }
  if (/collect|enter|edit|request|create|submit|configure/.test(page.purpose.toLowerCase())) {
    evidence.push("input-purpose");
  }
  if (page.componentRequirements.some((component) => /form|input/.test(component.type))) {
    evidence.push("has-form-components");
  }

  if (page.readonly || page.confirmationOnly || evidence.includes("purpose-shows-result")) {
    return {
      pageId: page.id,
      role: "result",
      evidence,
      confidence: "high"
    };
  }

  if (evidence.includes("input-purpose") || evidence.includes("has-form-components") || evidence.includes("input-primary-action")) {
    return {
      pageId: page.id,
      role: "input",
      evidence,
      confidence: "high"
    };
  }

  return {
    pageId: page.id,
    role: "unknown",
    evidence,
    confidence: "low"
  };
}

export function repairBlueprintQuality(
  blueprint: ProductBlueprintV1,
  report: QualityReviewReport
): ProductBlueprintV1 {
  const repaired = clone(blueprint);

  for (const issue of report.issues) {
    switch (issue.code) {
      case "explicit_outcome_weakened": {
        softenImmediateQuoteAssumption(repaired);

        const primaryFlow = repaired.flows.coreUserFlows[0];
        if (primaryFlow) {
          primaryFlow.completionSignal = {
            userVisible: true,
            signal: "A visible result for the current submission is shown after submission"
          };
        }

        for (const page of repaired.ui.pages) {
          const pageRole = classifyPageRole(page);
          if (pageRole.role === "result") {
            page.purpose = "Show the immediate estimated result after submission.";
          }
          if (pageRole.role === "input") {
            page.purpose = "Collect the user's required input and submit it to generate the visible result.";
          }
        }

        repaired.uncertainty.assumptions = repaired.uncertainty.assumptions.map((item) => {
          if (/结果/.test(item.defaultDecision) || /反馈/.test(item.defaultDecision)) {
            return {
              ...item,
              defaultDecision:
                "Show a visible result after submission without assuming the result must be an immediate numeric quote."
            };
          }
          return item;
        });

        repaired.uncertainty.unresolvedQuestions = repaired.uncertainty.unresolvedQuestions.map((item) => {
          if (/结果/.test(item.defaultDecision) || /反馈/.test(item.defaultDecision)) {
            return {
              ...item,
              defaultDecision:
                "Show a visible result after submission without assuming the result must be an immediate numeric quote."
            };
          }
          return item;
        });
        break;
      }
      case "primary_action_policy_weak": {
        repaired.generationPolicy.stitchGenerationRules.requirePrimaryActionInEveryPage = true;
        break;
      }
      case "missing_result_page_action": {
        repairUiContractAmbiguity(repaired);
        for (const page of repaired.ui.pages) {
          const isResultLike = page.readonly || page.confirmationOnly;
          if (isResultLike && page.secondaryActions.length === 0) {
            page.secondaryActions = [makeResultPageAction(page.id)];
          }
        }
        break;
      }
      case "desktop_resolution_policy_missing": {
        repaired.ui.responsivePolicy.mobileFirst = false;
        repaired.ui.responsivePolicy.breakpoints = desktopBreakpoints;

        if (!repaired.generationPolicy.inferenceRules.some((rule) => rule.includes("1920x1080"))) {
          repaired.generationPolicy.inferenceRules.push(
            "Treat 1920x1080 as the primary desktop layout baseline, then adapt the same interface for 1440x900 and 2560x1440 without changing the core flow."
          );
        }

        if (!repaired.uncertainty.assumptions.some((item) => item.id === "assumption_desktop_resolution_strategy")) {
          repaired.uncertainty.assumptions.push({
            id: "assumption_desktop_resolution_strategy",
            question: "Which screen resolutions should guide responsive behavior?",
            defaultDecision:
              "Design first for 1920x1080 desktop, then adapt the layout for 1440x900 and 2560x1440 without prioritizing mobile display.",
            rationale:
              "The product is primarily used on desktop screens, and these three resolutions define the required adaptation targets."
          });
        }
        break;
      }
      case "generic_field_specificity": {
        for (const entity of repaired.domain.entities) {
          if (entity.id === "quote_request") {
            const hasFormData = entity.fields.some((field) => field.name === "formData" && field.type === "object");
            if (hasFormData && !entity.fields.some((field) => field.name === "contactName")) {
              entity.fields = [
                { name: "contactName", type: "string", required: true, description: "Primary contact name" },
                { name: "requestDetails", type: "string", required: true, description: "Main quote request details" },
                { name: "email", type: "string", required: false, description: "Optional contact email" }
              ];
            }
          }
        }
        break;
      }
      case "flow_quality_weak": {
        setOptionalContactQuoteRequestShape(repaired);
        for (const flow of repaired.flows.coreUserFlows) {
          const entryStep = flow.steps.find((step) => step.kind === "action");
          if (entryStep) {
            entryStep.detail =
              "访客填写生成可见结果所需的最小必要信息，例如报价对象或服务类型、数量或规格，以及必要的申请说明；联系方式如出现，仅作为可选补充字段。";
          }
          const validationStep = flow.steps.find((step) => step.kind === "validation");
          if (validationStep) {
            validationStep.detail =
              "系统校验生成结果所需的必填信息是否完整；若用户填写了联系方式，再额外检查其格式是否合法。";
          }
          if (flow.feedback[0]) {
            flow.feedback[0] =
              "若缺少生成结果所需的必填信息，系统会给出明确反馈；联系方式只有在填写时才校验其格式。";
          }
          const resultFeedbackStep = flow.steps.find((step) => step.kind === "feedback");
          if (resultFeedbackStep) {
            resultFeedbackStep.detail =
              "系统展示当前申请对应的可见结果；“修改信息并重新计算”仅作为次级动作，不覆盖当前结果已可见的完成态。";
          }
        }
        break;
      }
      case "uncertainty_default_misleading": {
        setOptionalContactQuoteRequestShape(repaired);
        softenImmediateQuoteAssumption(repaired);
        break;
      }
      case "ui_contract_ambiguous": {
        repairUiContractAmbiguity(repaired);
        for (const page of repaired.ui.pages) {
          const pageRole = classifyPageRole(page);
          if (pageRole.role === "input") {
            page.purpose = "Collect the user's required input and submit it to generate the visible result.";
          }
          if (pageRole.role === "result") {
            page.purpose = "Show the immediate estimated result after submission.";
          }
        }
        break;
      }
    }
  }

  return productBlueprintSchema.parse(repaired);
}
