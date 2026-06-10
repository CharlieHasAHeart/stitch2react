import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  ProductBlueprintV1,
  StitchHtmlValidationIssue,
  StitchRuntimeValidationEvidence,
  StitchRuntimeValidationReport
} from "../../blueprint/types/blueprint.js";

function issue(code: string, message: string, path?: string, suggestedFix?: string): StitchHtmlValidationIssue {
  return {
    severity: "error",
    code,
    message,
    path,
    suggestedFix
  };
}

export type StitchRuntimeValidationClient = {
  validatePage(input: {
    sessionId: string;
    blueprintId: string;
    blueprint: ProductBlueprintV1;
    page: PageContract;
    htmlArtifactId?: string;
    html: string;
  }): Promise<{
    issues: StitchHtmlValidationIssue[];
    runtimeEvidence: StitchRuntimeValidationEvidence[];
  }>;
};

export class StubStitchRuntimeValidationClient implements StitchRuntimeValidationClient {
  async validatePage(input: {
    sessionId: string;
    blueprintId: string;
    blueprint: ProductBlueprintV1;
    page: PageContract;
    htmlArtifactId?: string;
    html: string;
  }): Promise<{ issues: StitchHtmlValidationIssue[]; runtimeEvidence: StitchRuntimeValidationEvidence[] }> {
    const { page, html } = input;
    const lowered = html.toLowerCase();
    const issues: StitchHtmlValidationIssue[] = [];
    const runtimeEvidence: StitchRuntimeValidationEvidence[] = [];

    if (!/<main[\s>]/i.test(html) || !/<h1/i.test(html)) {
      issues.push(issue("blank_rendered_page", "Runtime validation found no visible main content.", page.id));
      runtimeEvidence.push({
        backend: "stub_runtime_validator",
        pageId: page.id,
        notes: ["No visible main content detected by stub runtime validator."]
      });
    }

    const clickableMatches = [...html.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/(button|a)>/gi)];
    for (const match of clickableMatches) {
      const tag = match[0];
      const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const selector = `${match[1]}:${label || "unnamed"}`;
      const hasVisibleBehavior = /type\s*=\s*["'](submit|reset)["']/i.test(tag) || /(data-action|aria-controls|aria-expanded|onclick)/i.test(tag);
      const hasNoopHref = /href\s*=\s*["']#?["']/i.test(tag) || /javascript:void\(0\)/i.test(tag);
      if (!hasVisibleBehavior || hasNoopHref) {
        issues.push(
          issue(
            hasNoopHref ? "click_only_changes_focus_or_hover" : "missing_runtime_click_behavior",
            `Runtime validation could not observe a meaningful visible effect for clickable element \"${label || selector}\".`,
            selector,
            "Attach modal/drawer/toggle/toast/inline feedback/submit/reset/declared navigation behavior."
          )
        );
        runtimeEvidence.push({
          backend: "stub_runtime_validator",
          pageId: page.id,
          selector,
          text: label,
          notes: ["Stub runtime validator found no observable visible behavior metadata on this click target."]
        });
      }
    }

    if (/console-error/i.test(lowered)) {
      issues.push(issue("console_runtime_error", "Runtime validation detected a blocking console error marker.", page.id));
      runtimeEvidence.push({
        backend: "stub_runtime_validator",
        pageId: page.id,
        notes: ["HTML contained synthetic console-error marker."]
      });
    }

    if (/broken-resource/i.test(lowered)) {
      issues.push(issue("broken_resource", "Runtime validation detected a broken resource marker.", page.id));
      runtimeEvidence.push({
        backend: "stub_runtime_validator",
        pageId: page.id,
        notes: ["HTML contained synthetic broken-resource marker."]
      });
    }

    return { issues, runtimeEvidence };
  }
}

export async function validateStitchRuntime(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  page: PageContract;
  htmlArtifactId?: string;
  html: string;
  runtimeClient: StitchRuntimeValidationClient;
}): Promise<StitchRuntimeValidationReport> {
  const { sessionId, blueprintId, page, htmlArtifactId, runtimeClient } = input;
  const result = await runtimeClient.validatePage(input);
  return {
    id: createId("stitch_runtime_val"),
    sessionId,
    blueprintId,
    pageId: page.id,
    htmlArtifactId,
    passed: result.issues.length === 0,
    issues: result.issues,
    runtimeEvidence: result.runtimeEvidence,
    createdAt: new Date().toISOString()
  };
}
