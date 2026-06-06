import { defaultGenerationPolicy, defaultVisualPolicy } from "../defaults/policies.js";
import type {
  DomainModel,
  FlowModel,
  GenerationPolicy,
  InputUnderstanding,
  ProductBlueprintV1,
  ProductIntent,
  UIModel,
  UncertaintyModel,
  UserModel,
  VisualPolicy
} from "../types/blueprint.js";

function inferName(rawInput: string): string {
  const cleaned = rawInput.trim().replace(/[.。!！?？]+$/, "");
  if (cleaned.length <= 36) {
    return cleaned;
  }
  return cleaned.slice(0, 36);
}

function contains(raw: string, text: string): boolean {
  return raw.toLowerCase().includes(text.toLowerCase());
}

export function generateInputProductUsers(rawInput: string): {
  understanding: InputUnderstanding;
  product: ProductIntent;
  users: UserModel;
} {
  const noLogin = contains(rawInput, "no login") || contains(rawInput, "不要登录") || contains(rawInput, "无需登录");
  const normalizedSummary = rawInput.trim();
  const productName = inferName(rawInput);

  return {
    understanding: {
      raw: rawInput,
      type: {
        value: rawInput.length < 120 ? "one_sentence_idea" : "short_brief",
        source: "inferred",
        confidence: "medium",
        evidence: "Input length and structure"
      },
      maturity: {
        value: rawInput.length < 120 ? "idea" : "rough_brief",
        source: "inferred",
        confidence: "medium"
      },
      requestedScope: {
        value: "single_flow",
        source: "defaulted",
        confidence: "medium",
        evidence: "Conservative MVP default"
      },
      explicitConstraints: {
        value: noLogin ? ["no login"] : [],
        source: noLogin ? "explicit" : "defaulted",
        confidence: noLogin ? "high" : "medium",
        evidence: noLogin ? rawInput : "No explicit constraints provided"
      },
      references: {
        value: [],
        source: "defaulted",
        confidence: "medium"
      },
      normalizedSummary: {
        value: normalizedSummary,
        source: "inferred",
        confidence: "high",
        evidence: "Normalized from one-shot input"
      }
    },
    product: {
      name: {
        value: productName,
        source: "inferred",
        confidence: "medium",
        evidence: rawInput
      },
      category: {
        value: "productivity_tool",
        source: "defaulted",
        confidence: "low"
      },
      oneSentenceSummary: {
        value: normalizedSummary,
        source: "inferred",
        confidence: "high"
      },
      targetProblem: {
        value: "Users need a simple way to complete the primary task described in the one-shot input.",
        source: "inferred",
        confidence: "medium"
      },
      primaryValueProposition: {
        value: "Reduce friction in completing the core user task with a minimal MVP.",
        source: "defaulted",
        confidence: "medium"
      },
      successDefinition: {
        value: "A user can complete the primary flow and see clear confirmation.",
        source: "defaulted",
        confidence: "medium"
      },
      outOfScope: {
        value: noLogin ? ["authentication", "team collaboration", "payments", "integrations"] : ["team collaboration", "payments", "integrations"],
        source: "defaulted",
        confidence: "medium"
      },
      platform: {
        value: ["web"],
        source: "defaulted",
        confidence: "medium"
      },
      complexity: {
        value: "simple",
        source: "defaulted",
        confidence: "medium"
      }
    },
    users: {
      primaryPersona: {
        value: {
          id: "persona_primary",
          label: "Primary user",
          type: "end_user",
          goals: ["Complete the main product task quickly"],
          painPoints: ["Current process is unclear or manual"]
        },
        source: "defaulted",
        confidence: "medium"
      },
      secondaryPersonas: {
        value: [],
        source: "defaulted",
        confidence: "medium"
      },
      userSegmentsSummary: {
        value: "Single primary end-user persona for a conservative MVP.",
        source: "defaulted",
        confidence: "medium"
      }
    }
  };
}

export function generateDomainModel(): DomainModel {
  return {
    entities: [
      {
        id: "entity_record",
        name: "Record",
        description: "Primary business record created or updated by the core flow.",
        fields: [
          { name: "id", type: "string", required: true, description: "Unique identifier" },
          { name: "title", type: "string", required: true, description: "Primary label" },
          { name: "status", type: "string", required: true, description: "Workflow status" }
        ]
      }
    ],
    relationships: [],
    businessRules: ["A user-visible result must exist after the core flow completes."]
  };
}

export function generateFlowModel(): FlowModel {
  return {
    coreUserFlows: [
      {
        id: "flow_primary",
        name: "Complete primary task",
        userGoal: "Finish the main task successfully",
        trigger: "User starts the main task from the entry page",
        steps: [
          {
            id: "flow_primary_step_1",
            label: "Provide input",
            actor: "user",
            kind: "action",
            detail: "User enters the minimum information required for the task"
          },
          {
            id: "flow_primary_step_2",
            label: "Submit and process",
            actor: "system",
            kind: "state_change",
            detail: "System validates input and creates or updates the record"
          }
        ],
        systemEffects: ["Record is saved", "Status changes to succeeded"],
        feedback: ["Progress indicator while submitting", "Visible success confirmation"],
        recovery: ["Fix validation errors and retry"],
        completionSignal: {
          userVisible: true,
          signal: "Success confirmation is visible and the resulting record is shown"
        },
        involvedEntityIds: ["entity_record"],
        uiSurfaceIds: ["page_home", "page_result"]
      }
    ],
    supportingInteractionFlows: [
      {
        id: "support_retry",
        name: "Retry submission",
        supportsCoreFlowId: "flow_primary",
        trigger: "Submission fails or validation blocks progress",
        steps: [
          {
            id: "support_retry_step_1",
            label: "Review issue",
            actor: "user",
            kind: "feedback",
            detail: "User sees the error or validation state"
          },
          {
            id: "support_retry_step_2",
            label: "Retry",
            actor: "user",
            kind: "action",
            detail: "User corrects input and resubmits"
          }
        ]
      }
    ],
    sideEffectFlows: [
      {
        id: "side_save",
        name: "Persist record",
        sourceCoreFlowId: "flow_primary",
        effects: ["Primary record is written to storage"]
      }
    ],
    feedbackFlows: [
      {
        id: "feedback_primary",
        name: "Submission feedback",
        sourceFlowId: "flow_primary",
        states: ["idle", "submitting", "succeeded", "failed"],
        surfaces: ["page_home_feedback", "page_result_success"]
      }
    ],
    recoveryFlows: [
      {
        id: "recovery_primary",
        name: "Recover from failed submission",
        sourceFlowId: "flow_primary",
        failureCondition: "Validation error or failed submission",
        recoveryActions: ["Review error details", "Edit the input", "Retry submission"]
      }
    ],
    stateTransitions: [
      {
        flowId: "flow_primary",
        from: "idle",
        to: "submitting",
        condition: "User submits the main action"
      },
      {
        flowId: "flow_primary",
        from: "submitting",
        to: "succeeded",
        condition: "System accepts the request"
      }
    ],
    dependencies: []
  };
}

export function generateUiModel(): UIModel {
  return {
    appStructure: {
      shell: "single_page",
      pageOrder: ["page_home", "page_result"]
    },
    navigation: {
      type: "minimal",
      globalNavItems: []
    },
    pages: [
      {
        id: "page_home",
        name: "Task entry",
        route: "/",
        purpose: "Collect the minimum input for the primary task",
        supportsFlowIds: ["flow_primary"],
        primaryAction: {
          id: "page_home_primary",
          label: "Submit",
          kind: "primary",
          triggersFlowId: "flow_primary",
          feedback: "Shows validation, progress, and result feedback"
        },
        secondaryActions: [],
        sections: [
          {
            id: "page_home_form",
            name: "Task form",
            purpose: "Capture the required task inputs"
          }
        ],
        componentRequirements: [
          {
            type: "form",
            purpose: "Collect user input using real HTML form controls",
            required: true
          }
        ],
        states: [
          { name: "idle", description: "Ready for input" },
          { name: "submitting", description: "Submission is in progress" },
          { name: "validation_error", description: "Errors are shown inline" }
        ],
        feedbackSurfaces: [
          {
            id: "page_home_feedback",
            type: "inline",
            purpose: "Show validation and submission status"
          }
        ],
        recoverySurfaces: [
          {
            id: "page_home_recovery",
            type: "editable_form",
            purpose: "Keep input editable after failure"
          }
        ],
        stitchPromptHints: ["Use real form controls and an obvious primary action."],
        readonly: false,
        confirmationOnly: false
      },
      {
        id: "page_result",
        name: "Result confirmation",
        route: "/result",
        purpose: "Show completion signal and created result",
        supportsFlowIds: ["flow_primary"],
        secondaryActions: [
          {
            id: "page_result_back",
            label: "Create another",
            kind: "navigation",
            targetPageId: "page_home",
            feedback: "Returns to the input page"
          }
        ],
        sections: [
          {
            id: "page_result_summary",
            name: "Result summary",
            purpose: "Show the record and success confirmation"
          }
        ],
        componentRequirements: [
          {
            type: "success_panel",
            purpose: "Show visible confirmation that the core flow completed",
            required: true
          }
        ],
        states: [{ name: "success", description: "Completion state" }],
        feedbackSurfaces: [
          {
            id: "page_result_success",
            type: "success_panel",
            purpose: "Show the completion signal"
          }
        ],
        recoverySurfaces: [],
        stitchPromptHints: ["Show the completion signal as real text, not an image."],
        readonly: true,
        confirmationOnly: true
      }
    ],
    globalComponents: [],
    responsivePolicy: {
      mobileFirst: true,
      breakpoints: ["640px", "1024px"]
    }
  };
}

export function generatePolicyUncertainty(): {
  visualPolicy: VisualPolicy;
  generationPolicy: GenerationPolicy;
  uncertainty: UncertaintyModel;
} {
  return {
    visualPolicy: defaultVisualPolicy,
    generationPolicy: defaultGenerationPolicy,
    uncertainty: {
      assumptions: [
        {
          id: "assumption_primary_flow",
          question: "What is the minimum coherent MVP scope?",
          defaultDecision: "Implement one primary flow with one entry page and one result page.",
          rationale: "The repository requires conservative MVP assumptions for ambiguous input."
        }
      ],
      unresolvedQuestions: [
        {
          id: "question_field_shape",
          question: "What exact domain-specific fields are required for the user's task?",
          defaultDecision: "Use a minimal generic form and keep domain shape simple until explicit details exist.",
          rationale: "The one-shot input may not specify detailed form fields."
        }
      ],
      notableRisks: ["Generic domain assumptions may need refinement when a real downstream generator is added."]
    }
  };
}

export function passthroughBlueprint(blueprint: ProductBlueprintV1): ProductBlueprintV1 {
  return blueprint;
}
