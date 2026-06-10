import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  ProductBlueprintV1,
  StitchHtmlValidationIssue,
  StitchHtmlValidationReport
} from "../../blueprint/types/blueprint.js";
import { loadStitchUiConstraints } from "../constraints/load-stitch-ui-constraints.js";
import { findActionElements, findFeedbackSurfaces, findHeadings, findMainRoot, findNavigationLinks, findRecoverySurfaces, actionMatchesPageAction } from "../html/html-contract.js";
import { getStringProp } from "../html/html-ast-query.js";
import { parseStitchHtml } from "../html/parse-stitch-html.js";

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

function hasDeclaredNavLabel(text: string, page: PageContract, blueprint: ProductBlueprintV1): boolean {
  const normalized = text.toLowerCase();
  const declared = new Set([
    ...blueprint.ui.pages.map((item) => item.name.toLowerCase()),
    ...blueprint.ui.pages.map((item) => item.route.toLowerCase()),
    ...blueprint.ui.navigation.globalNavItems.map((item) => item.toLowerCase()),
    ...(page.primaryAction ? [page.primaryAction.label.toLowerCase()] : []),
    ...page.secondaryActions.map((action) => action.label.toLowerCase())
  ]);
  return declared.has(normalized);
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
  const constraints = loadStitchUiConstraints();

  if (!html.trim()) {
    issues.push(issue("html_empty", "Generated HTML is empty."));
  }

  const tree = parseStitchHtml(html);
  const mainRoot = findMainRoot(tree);
  const headings = findHeadings(tree);
  const actionElements = findActionElements(tree);
  const feedbackSurfaces = findFeedbackSurfaces(tree);
  const recoverySurfaces = findRecoverySurfaces(tree);
  const navLinks = findNavigationLinks(tree);

  if (constraints.html.requireVisibleRoot && !mainRoot) {
    issues.push(issue("html_missing_visible_root", "HTML must contain a main page root element."));
  }

  if (constraints.html.requirePageIdAttribute && (!mainRoot || getStringProp(mainRoot.node, "data-page-id") !== page.id)) {
    issues.push(issue("html_missing_page_root_marker", `Main page root must declare data-page-id="${page.id}".`));
  }

  if (constraints.html.requireHeading && headings.length === 0) {
    issues.push(issue("html_missing_heading", "Generated HTML should include a heading or title for the page."));
  }

  if (!page.readonly && !page.confirmationOnly && page.primaryAction) {
    const foundPrimary = actionElements.some((action) => actionMatchesPageAction(action, page.primaryAction));
    if (!foundPrimary) {
      issues.push(
        issue(
          "missing_primary_action",
          `Missing declared primary action "${page.primaryAction.label}".`,
          "primaryAction",
          "Render the declared primary action with data-action-id and data-action-kind markers."
        )
      );
    }
  }

  if (page.secondaryActions.length > 0) {
    const missingSecondary = page.secondaryActions.filter((declared) => !actionElements.some((action) => actionMatchesPageAction(action, declared)));
    if (missingSecondary.length > 0) {
      issues.push(issue("missing_secondary_action", `Missing declared secondary action(s): ${missingSecondary.map((item) => item.label).join(", ")}.`, "secondaryActions"));
    }
  }

  if (page.feedbackSurfaces.length > 0) {
    const validFeedback = feedbackSurfaces.filter((surface) => surface.surfaceKind && surface.role === "status" && !!surface.ariaLive);
    if (validFeedback.length === 0) {
      issues.push(issue("missing_feedback_surface", "Missing declared feedback surface marker or semantic status surface.", "feedbackSurfaces"));
    }
  }

  if (page.recoverySurfaces.length > 0 && recoverySurfaces.length === 0) {
    issues.push(issue("missing_recovery_surface", "Missing declared recovery surface marker.", "recoverySurfaces"));
  }

  const declaredRoutes = new Set(blueprint.ui.pages.map((item) => item.route));
  for (const link of navLinks) {
    if (link.href?.startsWith("/") && !declaredRoutes.has(link.href)) {
      issues.push(issue("undeclared_navigation_destination", `Navigation href ${link.href} is not declared by the frozen blueprint.`, "ui.navigation", "Use only declared PageContract routes in navigation links."));
    }
  }

  if (!constraints.navigation.allowInventedGlobalNavigation) {
    const hasInventedLabel = navLinks.some((link) => link.text && !hasDeclaredNavLabel(link.text, page, blueprint));
    const hasUnexpectedNav = navLinks.length > 0 && blueprint.ui.navigation.globalNavItems.length === 0;
    if (hasInventedLabel || hasUnexpectedNav) {
      issues.push(issue("invented_navigation", "Generated HTML adds navigation that is not declared in the frozen blueprint.", "ui.navigation", "Remove invented navigation and keep only blueprint-declared destinations."));
    }
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
