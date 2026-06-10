import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  ProductBlueprintV1,
  StitchHtmlValidationIssue,
  StitchHtmlValidationReport
} from "../../blueprint/types/blueprint.js";
import { loadStitchUiConstraints } from "../constraints/load-stitch-ui-constraints.js";

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

function collectDeclaredNavigationLabels(page: PageContract, blueprint: ProductBlueprintV1): string[] {
  const pageNames = blueprint.ui.pages.map((item) => item.name.toLowerCase());
  const pageRoutes = blueprint.ui.pages.map((item) => item.route.toLowerCase());
  const actionLabels = [
    ...(page.primaryAction ? [page.primaryAction.label.toLowerCase()] : []),
    ...page.secondaryActions.map((action) => action.label.toLowerCase())
  ];
  return [...new Set([...pageNames, ...pageRoutes, ...actionLabels, ...blueprint.ui.navigation.globalNavItems.map((i) => i.toLowerCase())])];
}

export function validateStitchHtml(input: {
  sessionId: string;
  blueprintId: string;
  page: PageContract;
  blueprint: ProductBlueprintV1;
  htmlArtifactId?: string;
  html: string;
}): StitchHtmlValidationReport {
  const { sessionId, blueprintId, page, blueprint, htmlArtifactId, html } = input;
  const issues: StitchHtmlValidationIssue[] = [];
  const lowered = html.toLowerCase();
  const constraints = loadStitchUiConstraints();

  if (!html.trim()) {
    issues.push(issue("html_empty", "Generated HTML is empty."));
  }

  if (constraints.html.requireVisibleRoot && !/<body[\s>]/i.test(html) && !/<main[\s>]/i.test(html) && !/<div/i.test(html)) {
    issues.push(issue("html_missing_visible_root", "HTML must contain a visible root container such as body, main, or div."));
  }

  if (constraints.html.requireHeading && !containsAny(lowered, [/<h1/i, /<h2/i, /<title/i])) {
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

  if (page.secondaryActions.length > 0) {
    const hasAnySecondary = page.secondaryActions.some((action) => lowered.includes(action.label.toLowerCase()));
    if (!hasAnySecondary) {
      issues.push(issue("missing_secondary_action", "Page is missing its required secondary action(s).", "secondaryActions"));
    }
  }

  if (page.feedbackSurfaces.length > 0 && !containsAny(lowered, [/success/i, /error/i, /toast/i, /banner/i, /message/i])) {
    issues.push(issue("missing_feedback_surface", "Page contract requires feedback surfaces but none are evident in the HTML.", "feedbackSurfaces"));
  }

  if (page.recoverySurfaces.length > 0 && !containsAny(lowered, [/retry/i, /error/i, /back/i, /edit/i])) {
    issues.push(issue("missing_recovery_surface", "Page contract requires recovery surfaces but none are evident in the HTML.", "recoverySurfaces"));
  }

  if (!constraints.navigation.allowInventedGlobalNavigation) {
    const declaredLabels = collectDeclaredNavigationLabels(page, blueprint);
    const forbiddenLabels = constraints.navigation.forbiddenInventedLabels.filter((label) => !declaredLabels.includes(label.toLowerCase()));
    const hasInventedLabel = forbiddenLabels.some((label) => lowered.includes(label.toLowerCase()));
    const hasUnexpectedNav = /<nav[\s>]/i.test(html) && blueprint.ui.navigation.globalNavItems.length === 0;
    if (hasInventedLabel || hasUnexpectedNav) {
      issues.push(
        issue(
          "invented_navigation",
          "Generated HTML adds navigation that is not declared in the frozen blueprint.",
          "ui.navigation",
          "Remove invented navigation and keep only blueprint-declared destinations."
        )
      );
    }
  }

  const oversizedImageOnly =
    constraints.html.forbidPrimaryUiAsImage &&
    /<img/i.test(html) &&
    !containsAny(lowered, [/<button/i, /<input/i, /<form/i, /<label/i, /<textarea/i, /<select/i, /<main/i]);
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
