import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  StitchHtmlValidationIssue,
  StitchHtmlValidationReport
} from "../../blueprint/types/blueprint.js";

function issue(
  code: string,
  message: string,
  path?: string,
  suggestedFix?: string
): StitchHtmlValidationIssue {
  return {
    severity: "error",
    code,
    message,
    path,
    suggestedFix
  };
}

function containsAny(html: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(html));
}

export function validateStitchHtml(input: {
  sessionId: string;
  blueprintId: string;
  page: PageContract;
  htmlArtifactId?: string;
  html: string;
  appShell?: string;
  navigationType?: string;
  pageCount?: number;
}): StitchHtmlValidationReport {
  const { sessionId, blueprintId, page, htmlArtifactId, html, appShell, navigationType, pageCount } = input;
  const issues: StitchHtmlValidationIssue[] = [];
  const lowered = html.toLowerCase();

  if (!html.trim()) {
    issues.push(issue("html_empty", "Generated HTML is empty."));
  }

  if (!/<body[\s>]/i.test(html) && !/<main[\s>]/i.test(html) && !/<div/i.test(html)) {
    issues.push(issue("html_missing_visible_root", "HTML must contain a visible root container such as body, main, or div."));
  }

  if (!containsAny(lowered, [/<h1/i, /<h2/i, /<title/i])) {
    issues.push(issue("html_missing_heading", "Generated HTML should include a heading or title for the page."));
  }

  if (!page.readonly && !page.confirmationOnly && page.primaryAction) {
    const label = page.primaryAction.label.toLowerCase();
    if (!lowered.includes(label) && !/<button/i.test(html)) {
      issues.push(
        issue(
          "missing_primary_action",
          `Input page is missing the primary action "${page.primaryAction.label}".`,
          "primaryAction",
          "Render a visible button or equivalent control for the primary action."
        )
      );
    }
  }

  if ((page.readonly || page.confirmationOnly) && page.secondaryActions.length > 0) {
    const hasAnySecondary = page.secondaryActions.some((action) => lowered.includes(action.label.toLowerCase()));
    if (!hasAnySecondary) {
      issues.push(
        issue(
          "missing_secondary_action",
          "Readonly or confirmation page is missing its required secondary action(s).",
          "secondaryActions"
        )
      );
    }
  }

  if (page.feedbackSurfaces.length > 0 && !containsAny(lowered, [/success/i, /error/i, /toast/i, /banner/i, /message/i])) {
    issues.push(issue("missing_feedback_surface", "Page contract requires feedback surfaces but none are evident in the HTML.", "feedbackSurfaces"));
  }

  if (page.recoverySurfaces.length > 0 && !containsAny(lowered, [/retry/i, /error/i, /back/i, /edit/i])) {
    issues.push(issue("missing_recovery_surface", "Page contract requires recovery surfaces but none are evident in the HTML.", "recoverySurfaces"));
  }

  const isSinglePageTool = appShell === "single_page" && navigationType === "minimal" && pageCount === 1;
  const hasExplicitPageNavigation =
    Boolean(page.primaryAction?.targetPageId) || page.secondaryActions.some((action) => action.targetPageId);
  if (isSinglePageTool && !hasExplicitPageNavigation) {
    const hasNavContainer = /<nav[\s>]/i.test(html);
    const hasAnchorLinks = /<a[\s>][\s\S]*?href\s*=\s*["']#["']/i.test(html) || /<a[\s>][\s\S]*?href\s*=\s*["'][^"']+["']/i.test(html);
    const hasNavigationLikeText = containsAny(lowered, [
      />\s*dashboard\s*</i,
      />\s*history\s*</i,
      />\s*support\s*</i,
      />\s*privacy policy\s*</i,
      />\s*terms of service\s*</i,
      />\s*compliance\s*</i,
      />\s*contact\s*</i,
      />\s*my quotes\s*</i
    ]);

    if (hasNavContainer || hasAnchorLinks || hasNavigationLikeText) {
      issues.push(
        issue(
          "unexpected_navigation_ui",
          "Single-page tool HTML should not include clickable navigation or footer links when the blueprint has minimal navigation and no page-to-page flow.",
          "ui.navigation",
          "Remove nav bars, dashboard/history tabs, support links, and legal/footer anchor links. Keep only non-clickable brand/footer text or local inline controls."
        )
      );
    }
  }

  const oversizedImageOnly =
    /<img/i.test(html) &&
    !containsAny(lowered, [/<button/i, /<input/i, /<form/i, /<label/i, /<textarea/i, /<select/i, /<nav/i]);
  if (oversizedImageOnly) {
    issues.push(
      issue(
        "ui_as_image_violation",
        "Generated HTML appears to rely on images without sufficient real UI elements.",
        undefined,
        "Render forms, buttons, navigation, and key text as real HTML."
      )
    );
  }

  return {
    id: createId("stitch_val"),
    sessionId,
    blueprintId,
    pageId: page.id,
    htmlArtifactId,
    passed: issues.length === 0,
    issues,
    createdAt: new Date().toISOString()
  };
}
