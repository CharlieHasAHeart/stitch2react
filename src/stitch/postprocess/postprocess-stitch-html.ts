import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  ProductBlueprintV1,
  StitchHtmlPostprocessReport,
  StitchHtmlValidationIssue
} from "../../blueprint/types/blueprint.js";
import { loadStitchUiConstraints } from "../constraints/load-stitch-ui-constraints.js";

function nowIso(): string {
  return new Date().toISOString();
}

function addToastToButtons(html: string): string {
  let updated = html;
  updated = updated.replace(/<button(?![^>]*type=)([^>]*)>/gi, '<button type="button" data-action="show_inline_feedback"$1>');
  if (!/data-feedback-surface=/i.test(updated)) {
    updated = updated.replace(/<\/main>/i, '  <div data-feedback-surface="inline">Action completed.</div>\n    </main>');
  }
  return updated;
}

function normalizeSidebar(html: string, blueprint: ProductBlueprintV1, page: PageContract): string {
  if (blueprint.ui.navigation.globalNavItems.length === 0) {
    return html;
  }

  const routeByLabel = new Map(blueprint.ui.pages.map((item) => [item.name, item.route]));
  const sidebar = `<aside data-sidebar="global"><nav><ul>${blueprint.ui.navigation.globalNavItems
    .map((label) => {
      const route = routeByLabel.get(label) ?? page.route;
      const active = route === page.route ? ' aria-current="page"' : "";
      return `<li><a href="${route}"${active}>${label}</a></li>`;
    })
    .join("")}</ul></nav></aside>`;

  if (/<(aside|nav)\b[\s\S]*?<\/(aside|nav)>/i.test(html)) {
    return html.replace(/<(aside|nav)\b[\s\S]*?<\/(aside|nav)>/i, sidebar);
  }

  return html.replace(/<main[^>]*>/i, `${sidebar}\n    $&`);
}

export function postprocessStitchHtml(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  page: PageContract;
  htmlArtifactId: string;
  html: string;
  issues: StitchHtmlValidationIssue[];
}): { html: string; report: StitchHtmlPostprocessReport } {
  const { sessionId, blueprintId, blueprint, page, htmlArtifactId, html, issues } = input;
  const constraints = loadStitchUiConstraints();
  let updatedHtml = html;
  const appliedFixes: string[] = [];
  const rejectedFixes: { fix: string; reason: string }[] = [];

  const issueCodes = new Set(issues.map((item) => item.code));
  for (const fix of constraints.postprocess.codexAllowedFixes) {
    if (fix === "add_toast_for_feedback_action" && issueCodes.has("missing_click_behavior")) {
      updatedHtml = addToastToButtons(updatedHtml);
      appliedFixes.push(fix);
      continue;
    }

    if (fix === "normalize_sidebar_across_pages" && issueCodes.has("sidebar_inconsistent_across_pages")) {
      updatedHtml = normalizeSidebar(updatedHtml, blueprint, page);
      appliedFixes.push(fix);
      continue;
    }

    if (fix === "remove_or_disable_invented_navigation" && issueCodes.has("invented_navigation")) {
      updatedHtml = updatedHtml.replace(/<(nav|aside)\b[\s\S]*?<\/(nav|aside)>/gi, "");
      appliedFixes.push(fix);
      continue;
    }

    if (fix === "convert_fake_link_to_button" && issueCodes.has("missing_click_behavior")) {
      updatedHtml = updatedHtml.replace(/<a\b([^>]*)href\s*=\s*["']#["']([^>]*)>([\s\S]*?)<\/a>/gi, '<button type="button" data-action="show_inline_feedback"$1$2>$3</button>');
      appliedFixes.push(fix);
      continue;
    }

    rejectedFixes.push({ fix, reason: "Not applicable for current issue set." });
  }

  return {
    html: updatedHtml,
    report: {
      id: createId("stitch_post"),
      sessionId,
      blueprintId,
      pageIds: [page.id],
      sourceIssueCodes: Array.from(issueCodes),
      appliedFixes,
      changedArtifacts: [htmlArtifactId],
      rejectedFixes,
      createdAt: nowIso()
    }
  };
}
