import { createId } from "../../blueprint/shared/ids.js";
import type {
  ProductBlueprintV1,
  StitchCrossPageValidationReport,
  StitchHtmlValidationIssue
} from "../../blueprint/types/blueprint.js";
import { loadRuntimeValidationConstraints } from "../constraints/load-runtime-validation-constraints.js";

function issue(code: string, message: string, path?: string, suggestedFix?: string): StitchHtmlValidationIssue {
  return {
    severity: "error",
    code,
    message,
    path,
    suggestedFix
  };
}

function extractSidebarModel(html: string): { labels: string[]; destinations: string[] } | null {
  const navMatch = html.match(/<(aside|nav)\b[\s\S]*?<\/\1>/i);
  if (!navMatch) {
    return null;
  }
  const block = navMatch[0];
  const anchorMatches = [...block.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const buttonMatches = [...block.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
  const labels = [
    ...anchorMatches.map((match) => match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
    ...buttonMatches.map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
  ].filter(Boolean);
  const destinations = anchorMatches.map((match) => match[1].trim());
  if (labels.length === 0 && destinations.length === 0) {
    return null;
  }
  return { labels, destinations };
}

export function validateStitchCrossPage(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  pages: Array<{ pageId: string; htmlArtifactId: string; html: string }>;
}): StitchCrossPageValidationReport {
  const { sessionId, blueprintId, blueprint, pages } = input;
  const constraints = loadRuntimeValidationConstraints();
  const issues: StitchHtmlValidationIssue[] = [];
  const sidebarModels = pages.map((page) => ({ pageId: page.pageId, model: extractSidebarModel(page.html) }));
  const presentModels = sidebarModels.filter((item) => item.model);

  if (constraints.navigation.sidebar.requireConsistencyAcrossPages && presentModels.length > 1) {
    const canonicalLabels = blueprint.ui.navigation.globalNavItems;
    const baseline = presentModels[0].model!;
    for (const { pageId, model } of presentModels.slice(1)) {
      const labelsDiffer = constraints.navigation.sidebar.compare.includes("labels") && JSON.stringify(model!.labels) !== JSON.stringify(baseline.labels);
      const destinationsDiffer = constraints.navigation.sidebar.compare.includes("destinations") && JSON.stringify(model!.destinations) !== JSON.stringify(baseline.destinations);
      if (labelsDiffer || destinationsDiffer) {
        issues.push(
          issue(
            "sidebar_inconsistent_across_pages",
            `Sidebar labels/order/destinations differ on page ${pageId}.`,
            `pages.${pageId}.sidebar`,
            "Normalize sidebar labels, order, and destinations from the canonical blueprint navigation source."
          )
        );
      }
    }

    if (canonicalLabels.length > 0) {
      for (const { pageId, model } of presentModels) {
        if (JSON.stringify(model!.labels) !== JSON.stringify(canonicalLabels)) {
          issues.push(
            issue(
              "sidebar_inconsistent_across_pages",
              `Sidebar labels on page ${pageId} do not match ${constraints.navigation.sidebar.canonicalSource}.`,
              `pages.${pageId}.sidebar`,
              "Use blueprint.ui.navigation.globalNavItems as the canonical sidebar labels, order, and destinations."
            )
          );
        }
      }
    }
  }

  const declaredRoutes = new Set(blueprint.ui.pages.map((page) => page.route));
  for (const page of pages) {
    for (const match of page.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      const href = match[1].trim();
      if (href.startsWith("/") && !declaredRoutes.has(href)) {
        issues.push(
          issue(
            constraints.navigation.issueCodeForUndeclaredDestination,
            `HTML on page ${page.pageId} links to undeclared destination ${href}.`,
            `pages.${page.pageId}.links`,
            "Only navigate to routes declared by PageContracts in the frozen blueprint."
          )
        );
      }
    }
  }

  return {
    id: createId("stitch_cross_val"),
    sessionId,
    blueprintId,
    kind: "static",
    pageIds: pages.map((page) => page.pageId),
    htmlArtifactIds: pages.map((page) => page.htmlArtifactId),
    passed: issues.length === 0,
    issues,
    createdAt: new Date().toISOString()
  };
}
