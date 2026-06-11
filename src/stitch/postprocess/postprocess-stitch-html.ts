import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  ProductBlueprintV1,
  StitchHtmlPostprocessReport,
  StitchHtmlValidationIssue
} from "../../blueprint/types/blueprint.js";
import { loadStitchUiConstraints, type StitchUiConstraints } from "../constraints/load-stitch-ui-constraints.js";
import { parseStitchHtml } from "../html/parse-stitch-html.js";
import { findActionElements, findFeedbackSurfaces, findMainRoot } from "../html/html-contract.js";
import { visit } from "unist-util-visit";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import type { Element, Root, Text, Properties } from "hast";

function nowIso(): string {
  return new Date().toISOString();
}

type PostprocessContext = {
  blueprint: ProductBlueprintV1;
  page: PageContract;
  issueCodes: Set<string>;
};

type PostprocessFixResult = {
  html: string;
  applied: boolean;
  reason?: string;
};

type PostprocessFix = {
  id: string;
  apply: (html: string, context: PostprocessContext) => PostprocessFixResult;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function mergeConstraints(base: StitchUiConstraints, override?: DeepPartial<StitchUiConstraints>): StitchUiConstraints {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    promptRules: {
      ...base.promptRules,
      ...override.promptRules
    },
    html: {
      ...base.html,
      ...override.html
    },
    interaction: {
      ...base.interaction,
      ...override.interaction
    },
    navigation: {
      ...base.navigation,
      ...override.navigation,
      sidebar: {
        ...base.navigation.sidebar,
        ...override.navigation?.sidebar
      }
    },
    postprocess: {
      ...base.postprocess,
      ...override.postprocess
    },
    stitchGeneration: {
      ...base.stitchGeneration,
      ...override.stitchGeneration,
      experimentalCandidateSearch: {
        ...base.stitchGeneration.experimentalCandidateSearch,
        ...override.stitchGeneration?.experimentalCandidateSearch
      }
    }
  };
}

function stringify(tree: Root): string {
  return unified().use(rehypeStringify).stringify(tree);
}

function ensureMain(tree: Root): Element | undefined {
  return findMainRoot(tree)?.node;
}

function pushChild(parent: Element, child: Element): void {
  parent.children.push(child as never);
}

function findElement(tree: Root | Element, predicate: (node: Element) => boolean): Element | undefined {
  let found: Element | undefined;
  visit(tree, "element", (node) => {
    const element = node as Element;
    if (!found && predicate(element)) {
      found = element;
    }
  });
  return found;
}

function findAllElements(tree: Root | Element, predicate: (node: Element) => boolean): Element[] {
  const found: Element[] = [];
  visit(tree, "element", (node) => {
    const element = node as Element;
    if (predicate(element)) {
      found.push(element);
    }
  });
  return found;
}

function textOf(node: Element): string {
  const chunks: string[] = [];
  visit(node, "text", (child) => chunks.push(String((child as Text).value ?? "")));
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function setProps(node: Element, props: Properties): void {
  node.properties = { ...(node.properties ?? {}), ...props } as Properties;
}

function makeDiv(text: string, props: Properties = {}): Element {
  return {
    type: "element",
    tagName: "div",
    properties: props,
    children: [{ type: "text", value: text } as Text]
  };
}

function ensureRuntimeScript(tree: Root): void {
  const existing = findElement(tree, (node) => node.tagName === "script" && node.properties?.["data-postprocess-runtime"] !== undefined);
  if (existing) {
    return;
  }
  const script: Element = {
    type: "element",
    tagName: "script",
    properties: { "data-postprocess-runtime": "true" },
    children: [{
      type: "text",
      value: `(() => {
  const root = document;
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'show_inline_feedback') {
      const surface = root.querySelector('[data-feedback-surface]');
      if (surface instanceof HTMLElement) {
        surface.hidden = false;
        surface.textContent = 'Action completed.';
      }
    }
    if (action === 'submit_form') {
      event.preventDefault();
      const form = target.closest('form');
      if (form instanceof HTMLFormElement) {
        form.setAttribute('data-submitted', 'true');
      }
      const surface = root.querySelector('[data-feedback-surface]');
      if (surface instanceof HTMLElement) {
        surface.hidden = false;
        surface.textContent = 'Submitted successfully.';
      }
    }
    if (action === 'reset_form') {
      const form = target.closest('form');
      if (form instanceof HTMLFormElement) {
        form.reset();
        form.setAttribute('data-reset', 'true');
      }
      const surface = root.querySelector('[data-feedback-surface]');
      if (surface instanceof HTMLElement) {
        surface.hidden = false;
        surface.textContent = 'Form reset.';
      }
    }
    if (action === 'toggle_panel') {
      const panel = root.querySelector('[data-toggle-panel]');
      if (panel instanceof HTMLElement) panel.hidden = !panel.hidden;
    }
    if (action === 'open_modal') {
      const modal = root.querySelector('[data-modal]');
      if (modal instanceof HTMLElement) modal.hidden = false;
    }
  });
})();`
    } as Text]
  };
  const body = findElement(tree, (node) => node.tagName === "body") ?? ensureMain(tree);
  if (body) {
    pushChild(body, script);
  }
}

function ensureInlineFeedbackSurface(tree: Root): boolean {
  if (findFeedbackSurfaces(tree).length > 0) {
    return false;
  }
  const main = ensureMain(tree);
  if (!main) {
    return false;
  }
  pushChild(main, makeDiv("Action completed.", {
    "data-feedback-surface": "inline",
    role: "status",
    "aria-live": "polite",
    hidden: true
  }));
  return true;
}

function applyInlineFeedbackFix(html: string): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const actions = findActionElements(tree);
  let patched = false;
  for (const action of actions) {
    if (!action.node.properties?.["data-action"]) {
      setProps(action.node, { "data-action": "show_inline_feedback" });
      patched = true;
    }
  }
  const addedSurface = ensureInlineFeedbackSurface(tree);
  if (!patched && !addedSurface) {
    return { html, applied: false, reason: "feedback_surface_already_present" };
  }
  ensureRuntimeScript(tree);
  return { html: stringify(tree), applied: true };
}

function applyToastFix(html: string): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const actions = findActionElements(tree);
  let patched = false;
  for (const action of actions) {
    if (!action.node.properties?.["data-action"] && action.type !== "submit" && action.type !== "reset") {
      setProps(action.node, { "data-action": "show_inline_feedback" });
      patched = true;
    }
  }
  const addedSurface = ensureInlineFeedbackSurface(tree);
  if (!patched) {
    return { html, applied: false, reason: addedSurface ? "surface_only_added" : "actions_already_have_runtime_behavior" };
  }
  ensureRuntimeScript(tree);
  return { html: stringify(tree), applied: true };
}

function applySubmitHandlerFix(html: string): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const submitButtons = findAllElements(tree, (node) => {
    const type = String(node.properties?.type ?? "").toLowerCase();
    return (node.tagName === "button" || node.tagName === "input") && type === "submit";
  });
  if (submitButtons.length === 0) {
    return { html, applied: false, reason: "no_submit_button_found" };
  }
  let patched = false;
  for (const button of submitButtons) {
    if (!button.properties?.["data-action"]) {
      setProps(button, { "data-action": "submit_form" });
      patched = true;
    }
  }
  ensureInlineFeedbackSurface(tree);
  ensureRuntimeScript(tree);
  return patched ? { html: stringify(tree), applied: true } : { html, applied: false, reason: "submit_button_already_patched" };
}

function applyResetHandlerFix(html: string): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const resetButtons = findAllElements(tree, (node) => {
    const type = String(node.properties?.type ?? "").toLowerCase();
    return (node.tagName === "button" || node.tagName === "input") && type === "reset";
  });
  if (resetButtons.length === 0) {
    return { html, applied: false, reason: "no_reset_button_found" };
  }
  let patched = false;
  for (const button of resetButtons) {
    if (!button.properties?.["data-action"]) {
      setProps(button, { "data-action": "reset_form" });
      patched = true;
    }
  }
  ensureInlineFeedbackSurface(tree);
  ensureRuntimeScript(tree);
  return patched ? { html: stringify(tree), applied: true } : { html, applied: false, reason: "reset_button_already_patched" };
}

function applyConvertFakeLinkFix(html: string): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const links = findAllElements(tree, (node) => node.tagName === "a");
  let converted = false;
  for (const link of links) {
    const href = String(link.properties?.href ?? "").trim().toLowerCase();
    if (href === "#" || href === "javascript:void(0)") {
      link.tagName = "button";
      const props = { ...(link.properties ?? {}) } as Record<string, unknown>;
      delete props.href;
      link.properties = {
        ...props,
        type: "button",
        "data-action": typeof props["data-action"] === "string" ? props["data-action"] : "show_inline_feedback"
      };
      converted = true;
    }
  }
  if (!converted) {
    return { html, applied: false, reason: "no_fake_links_found" };
  }
  ensureInlineFeedbackSurface(tree);
  ensureRuntimeScript(tree);
  return { html: stringify(tree), applied: true };
}

function routeForNavLabel(blueprint: ProductBlueprintV1, label: string): string {
  const page = blueprint.ui.pages.find((item) => item.name.toLowerCase() === label.toLowerCase() || item.id.toLowerCase() === label.toLowerCase());
  return page?.route ?? "/";
}

function applySidebarNormalizationFix(html: string, context: PostprocessContext): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const body = findElement(tree, (node) => node.tagName === "body");
  const main = ensureMain(tree);
  if (!body && !main) {
    return { html, applied: false, reason: "missing_main_root" };
  }
  const existingSidebar = findElement(tree, (node) => node.tagName === "aside" && node.properties?.["data-sidebar"] === "global");
  if (existingSidebar) {
    return { html, applied: false, reason: "sidebar_already_normalized" };
  }
  const navLinks = context.blueprint.ui.navigation.globalNavItems.map((label) => ({
    type: "element",
    tagName: "a",
    properties: { href: routeForNavLabel(context.blueprint, label) },
    children: [{ type: "text", value: label } as Text]
  })) as Element[];
  const aside: Element = {
    type: "element",
    tagName: "aside",
    properties: { "data-sidebar": "global" },
    children: navLinks
  };
  const existingAside = findElement(tree, (node) => node.tagName === "aside");
  if (existingAside) {
    existingAside.properties = aside.properties;
    existingAside.children = aside.children;
  } else if (body) {
    body.children.unshift(aside as never);
  } else if (main) {
    main.children.unshift(aside as never);
  }
  return { html: stringify(tree), applied: true };
}

function applyTogglePanelFix(html: string): PostprocessFixResult {
  return { html, applied: false, reason: "no_safe_toggle_target_found" };
}

function applyModalFix(html: string): PostprocessFixResult {
  return { html, applied: false, reason: "no_safe_modal_target_found" };
}

function applyRemoveInventedNavigationFix(html: string, context: PostprocessContext): PostprocessFixResult {
  const tree = parseStitchHtml(html);
  const allowedLabels = new Set(context.blueprint.ui.navigation.globalNavItems.map((item) => item.toLowerCase()));
  const links = findAllElements(tree, (node) => node.tagName === "a");
  let mutated = false;
  for (const link of links) {
    const label = textOf(link).toLowerCase();
    if (label && !allowedLabels.has(label)) {
      link.tagName = "button";
      const props = { ...(link.properties ?? {}) } as Record<string, unknown>;
      delete props.href;
      link.properties = {
        ...props,
        type: "button",
        disabled: true,
        "aria-disabled": "true"
      };
      mutated = true;
    }
  }
  return mutated ? { html: stringify(tree), applied: true } : { html, applied: false, reason: "no_invented_navigation_found" };
}

const fixRegistry: PostprocessFix[] = [
  { id: "add_inline_error_or_success_state", apply: (html) => applyInlineFeedbackFix(html) },
  { id: "add_toast_for_feedback_action", apply: (html) => applyToastFix(html) },
  { id: "add_form_submit_handler", apply: (html) => applySubmitHandlerFix(html) },
  { id: "add_reset_handler", apply: (html) => applyResetHandlerFix(html) },
  { id: "add_toggle_panel_behavior", apply: (html) => applyTogglePanelFix(html) },
  { id: "add_modal_for_unhandled_button", apply: (html) => applyModalFix(html) },
  { id: "normalize_sidebar_across_pages", apply: (html, context) => applySidebarNormalizationFix(html, context) },
  { id: "remove_or_disable_invented_navigation", apply: (html, context) => applyRemoveInventedNavigationFix(html, context) },
  { id: "convert_fake_link_to_button", apply: (html) => applyConvertFakeLinkFix(html) }
];

const issueToFixes: Record<string, string[]> = {
  missing_feedback_surface: ["add_inline_error_or_success_state"],
  missing_runtime_click_behavior: [
    "add_form_submit_handler",
    "add_reset_handler",
    "add_toast_for_feedback_action",
    "add_toggle_panel_behavior",
    "add_modal_for_unhandled_button",
    "convert_fake_link_to_button"
  ],
  click_only_changes_focus_or_hover: ["add_inline_error_or_success_state", "convert_fake_link_to_button"],
  sidebar_inconsistent_across_pages: ["normalize_sidebar_across_pages"],
  invented_navigation: ["remove_or_disable_invented_navigation"],
  undeclared_navigation_destination: ["remove_or_disable_invented_navigation"]
};

export function postprocessStitchHtml(input: {
  sessionId: string;
  blueprintId: string;
  page: PageContract;
  blueprint: ProductBlueprintV1;
  htmlArtifactId?: string;
  html: string;
  issues: StitchHtmlValidationIssue[];
  constraints?: DeepPartial<StitchUiConstraints>;
  constraintsOverride?: DeepPartial<StitchUiConstraints>;
}): {
  html: string;
  report: StitchHtmlPostprocessReport;
} {
  const constraints = mergeConstraints(loadStitchUiConstraints(), input.constraintsOverride ?? input.constraints);
  const allowedFixes = new Set(constraints.postprocess.codexAllowedFixes);
  const issueCodes = [...new Set(input.issues.map((issue) => issue.code))];
  const routedFixes = [...new Set(issueCodes.flatMap((code) => issueToFixes[code] ?? []))];
  let html = input.html;
  const appliedFixes: string[] = [];
  const rejectedFixes: Array<{ fix: string; reason: string }> = [];

  for (const fixId of routedFixes) {
    if (!allowedFixes.has(fixId)) {
      rejectedFixes.push({ fix: fixId, reason: "disabled_in_constraints_allowlist" });
      continue;
    }
    const fix = fixRegistry.find((entry) => entry.id === fixId);
    if (!fix) {
      rejectedFixes.push({ fix: fixId, reason: "fix_not_implemented" });
      continue;
    }
    const result = fix.apply(html, {
      blueprint: input.blueprint,
      page: input.page,
      issueCodes: new Set(issueCodes)
    });
    if (!result.applied) {
      rejectedFixes.push({ fix: fixId, reason: result.reason ?? "not_applicable" });
      continue;
    }
    html = result.html;
    appliedFixes.push(fixId);
  }

  const report: StitchHtmlPostprocessReport = {
    id: createId("stitch_html_postprocess_report"),
    sessionId: input.sessionId,
    blueprintId: input.blueprintId,
    pageIds: [input.page.id],
    sourceIssueCodes: issueCodes,
    appliedFixes,
    changedArtifacts: input.htmlArtifactId ? [input.htmlArtifactId] : [],
    rejectedFixes,
    createdAt: nowIso()
  };

  return { html, report };
}
