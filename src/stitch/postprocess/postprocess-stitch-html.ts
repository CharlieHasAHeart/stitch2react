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
import { visit, SKIP } from "unist-util-visit";
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
    }
  };
}

function stringify(tree: Root): string {
  return unified().use(rehypeStringify).stringify(tree);
}

function ensureMain(tree: Root): Element | undefined {
  const main = findMainRoot(tree);
  return main?.node;
}

function pushChild(parent: Element, child: Element): void {
  parent.children.push(child as never);
}

function ensurePageId(main: Element, page: PageContract): void {
  main.properties = { ...(main.properties ?? {}), "data-page-id": page.id };
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
      if (surface instanceof HTMLElement) surface.hidden = false;
    }
    if (action === 'toggle_panel') {
      const panel = root.querySelector('[data-toggle-panel]');
      if (panel instanceof HTMLElement) panel.hidden = !panel.hidden;
    }
    if (action === 'open_modal') {
      const modal = root.querySelector('[data-modal]');
      if (modal instanceof HTMLElement) modal.hidden = false;
    }
    if (action === 'submit_form') {
      event.preventDefault();
      const form = target.closest('form');
      const surface = root.querySelector('[data-feedback-surface]');
      if (form instanceof HTMLFormElement) form.setAttribute('data-submitted', 'true');
      if (surface instanceof HTMLElement) surface.hidden = false;
    }
    if (action === 'reset_form') {
      const form = target.closest('form');
      if (form instanceof HTMLFormElement) {
        form.reset();
        form.setAttribute('data-reset', 'true');
      }
    }
  });
})();`
    } as Text]
  };
  const htmlNode = findElement(tree, (node) => node.tagName === "body") ?? ensureMain(tree);
  if (htmlNode) {
    pushChild(htmlNode, script);
  }
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

function ensureInlineFeedback(tree: Root): boolean {
  if (findFeedbackSurfaces(tree).length > 0) {
    return false;
  }
  const main = ensureMain(tree);
  if (!main) {
    return false;
  }
  const surface: Element = {
    type: "element",
    tagName: "div",
    properties: {
      "data-feedback-surface": "inline",
      role: "status",
      "aria-live": "polite",
      hidden: true
    },
    children: []
  };
  pushChild(main, surface);
  return true;
}

function ensureRecoverySurface(tree: Root): boolean {
  if (findElement(tree, (node) => node.properties?.["data-recovery-surface"] !== undefined)) {
    return false;
  }
  const main = ensureMain(tree);
  if (!main) {
    return false;
  }
  const surface: Element = {
    type: "element",
    tagName: "div",
    properties: { "data-recovery-surface": "form_retry" },
    children: []
  };
  pushChild(main, surface);
  return true;
}

function routeCandidateFixes(issueCodes: Set<string>): string[] {
  const ordered = new Set<string>();
  if (issueCodes.has("missing_runtime_click_behavior")) {
    ordered.add("add_form_submit_handler");
    ordered.add("add_reset_handler");
    ordered.add("convert_fake_link_to_button");
    ordered.add("add_toast_for_feedback_action");
    ordered.add("add_toggle_panel_behavior");
    ordered.add("add_modal_for_unhandled_button");
  }
  if (issueCodes.has("click_only_changes_focus_or_hover")) {
    ordered.add("add_inline_error_or_success_state");
    ordered.add("convert_fake_link_to_button");
  }
  if (issueCodes.has("missing_feedback_surface")) {
    ordered.add("add_inline_error_or_success_state");
  }
  if (issueCodes.has("missing_recovery_surface")) {
    ordered.add("add_inline_error_or_success_state");
  }
  if (issueCodes.has("sidebar_inconsistent_across_pages")) {
    ordered.add("normalize_sidebar_across_pages");
  }
  if (issueCodes.has("invented_navigation") || issueCodes.has("undeclared_navigation_destination")) {
    ordered.add("remove_or_disable_invented_navigation");
  }
  return Array.from(ordered);
}

const fixImplementations: Record<string, PostprocessFix> = {
  add_toast_for_feedback_action: {
    id: "add_toast_for_feedback_action",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const main = ensureMain(tree);
      if (!main) return { html, applied: false, reason: "No main root found." };
      const button = findElement(tree, (node) => node.tagName === "button" && !node.properties?.type && !node.properties?.["data-action"]);
      if (!button) return { html, applied: false, reason: "No plain button available for toast feedback patch." };
      ensurePageId(main, context.page);
      setProps(button, { type: "button", "data-action": "show_inline_feedback" });
      setProps(button, { "data-action-id": context.page.primaryAction?.id ?? "postprocess_feedback", "data-action-kind": context.page.primaryAction?.kind ?? "primary" });
      ensureInlineFeedback(tree);
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: true };
    }
  },
  add_inline_error_or_success_state: {
    id: "add_inline_error_or_success_state",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const main = ensureMain(tree);
      if (!main) return { html, applied: false, reason: "No main root found." };
      ensurePageId(main, context.page);
      const changed = ensureInlineFeedback(tree) || ensureRecoverySurface(tree);
      const button = findElement(tree, (node) => node.tagName === "button" && node.properties?.["data-action"] === undefined);
      if (button) {
        setProps(button, { type: "button", "data-action": "show_inline_feedback" });
        setProps(button, { "data-action-id": context.page.primaryAction?.id ?? "postprocess_feedback", "data-action-kind": context.page.primaryAction?.kind ?? "primary" });
      }
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: changed || !!button };
    }
  },
  add_form_submit_handler: {
    id: "add_form_submit_handler",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const main = ensureMain(tree);
      if (!main) return { html, applied: false, reason: "No main root found." };
      const controls = findAllElements(tree, (node) => ["button", "input"].includes(node.tagName) && node.properties?.type === "submit");
      if (controls.length === 0) return { html, applied: false, reason: "No submit control available for deterministic submit handler patch." };
      ensurePageId(main, context.page);
      for (const control of controls) {
        setProps(control, { "data-action": "submit_form", "data-action-id": context.page.primaryAction?.id ?? "submit_form", "data-action-kind": context.page.primaryAction?.kind ?? "primary" });
      }
      ensureInlineFeedback(tree);
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: true };
    }
  },
  add_reset_handler: {
    id: "add_reset_handler",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const main = ensureMain(tree);
      if (!main) return { html, applied: false, reason: "No main root found." };
      const controls = findAllElements(tree, (node) => ["button", "input"].includes(node.tagName) && node.properties?.type === "reset");
      if (controls.length === 0) return { html, applied: false, reason: "No reset control available for deterministic reset handler patch." };
      ensurePageId(main, context.page);
      for (const control of controls) {
        setProps(control, { "data-action": "reset_form", "data-action-id": "reset_form", "data-action-kind": "recovery" });
      }
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: true };
    }
  },
  add_toggle_panel_behavior: {
    id: "add_toggle_panel_behavior",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const main = ensureMain(tree);
      if (!main) return { html, applied: false, reason: "No main root found." };
      const button = findElement(tree, (node) => node.tagName === "button" && !node.properties?.type && !node.properties?.["data-action"]);
      if (!button) return { html, applied: false, reason: "No plain button available for toggle patch." };
      ensurePageId(main, context.page);
      setProps(button, { type: "button", "data-action": "toggle_panel", "data-action-id": context.page.primaryAction?.id ?? "toggle_panel", "data-action-kind": context.page.primaryAction?.kind ?? "primary" });
      if (!findElement(tree, (node) => node.properties?.["data-toggle-panel"] !== undefined)) {
        const panel: Element = { type: "element", tagName: "section", properties: { "data-toggle-panel": "details", hidden: true }, children: [] };
        pushChild(main, panel);
      }
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: true };
    }
  },
  add_modal_for_unhandled_button: {
    id: "add_modal_for_unhandled_button",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const main = ensureMain(tree);
      if (!main) return { html, applied: false, reason: "No main root found." };
      const button = findElement(tree, (node) => node.tagName === "button" && !node.properties?.type && !node.properties?.["data-action"]);
      if (!button) return { html, applied: false, reason: "No plain button available for modal patch." };
      ensurePageId(main, context.page);
      setProps(button, { type: "button", "data-action": "open_modal", "data-action-id": context.page.primaryAction?.id ?? "open_modal", "data-action-kind": context.page.primaryAction?.kind ?? "primary" });
      if (!findElement(tree, (node) => node.properties?.["data-modal"] !== undefined)) {
        const modal: Element = { type: "element", tagName: "div", properties: { "data-modal": "details", hidden: true, role: "dialog", "aria-modal": "true" }, children: [] };
        pushChild(main, modal);
      }
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: true };
    }
  },
  normalize_sidebar_across_pages: {
    id: "normalize_sidebar_across_pages",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const body = findElement(tree, (node) => node.tagName === "body");
      const main = ensureMain(tree);
      if (!body || !main) return { html, applied: false, reason: "No body/main found for sidebar normalization." };
      const routeByLabel = new Map(context.blueprint.ui.pages.map((item) => [item.name, item.route]));
      const sidebar: Element = {
        type: "element",
        tagName: "aside",
        properties: { "data-sidebar": "global" },
        children: [{
          type: "element",
          tagName: "nav",
          properties: {},
          children: [{
            type: "element",
            tagName: "ul",
            properties: {},
            children: context.blueprint.ui.navigation.globalNavItems.map((label) => ({
              type: "element",
              tagName: "li",
              properties: {},
              children: [{
                type: "element",
                tagName: "a",
                properties: { href: routeByLabel.get(label) ?? context.page.route, ...(routeByLabel.get(label) === context.page.route ? { "aria-current": "page" } : {}) },
                children: [{ type: "text", value: label } as Text]
              } as Element]
            } as Element))
          } as Element]
        } as Element]
      };
      body.children = body.children.filter((child: any) => !(child.type === "element" && ["aside", "nav"].includes(child.tagName)));
      body.children.unshift(sidebar as never);
      return { html: stringify(tree), applied: true };
    }
  },
  remove_or_disable_invented_navigation: {
    id: "remove_or_disable_invented_navigation",
    apply(html) {
      const tree = parseStitchHtml(html);
      let removed = false;
      visit(tree, "element", (node: any, index: any, parent: any) => {
        if (parent && typeof index === "number" && ["nav", "aside"].includes(node.tagName)) {
          parent.children.splice(index, 1);
          removed = true;
          return [SKIP, index];
        }
      });
      return { html: stringify(tree), applied: removed, reason: removed ? undefined : "No navigation block found to remove." };
    }
  },
  convert_fake_link_to_button: {
    id: "convert_fake_link_to_button",
    apply(html, context) {
      const tree = parseStitchHtml(html);
      const links = findAllElements(tree, (node) => node.tagName === "a" && ["", "#"].includes(String(node.properties?.href ?? "")));
      if (links.length === 0) return { html, applied: false, reason: "No fake link available for button conversion." };
      for (const link of links) {
        link.tagName = "button";
        link.properties = { ...(link.properties ?? {}), type: "button", "data-action": "show_inline_feedback", "data-action-id": context.page.primaryAction?.id ?? "postprocess_feedback", "data-action-kind": context.page.primaryAction?.kind ?? "primary" };
        delete (link.properties as any).href;
      }
      ensureInlineFeedback(tree);
      ensureRuntimeScript(tree);
      return { html: stringify(tree), applied: true };
    }
  }
};

export function postprocessStitchHtml(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  page: PageContract;
  htmlArtifactId: string;
  html: string;
  issues: StitchHtmlValidationIssue[];
  constraints?: DeepPartial<StitchUiConstraints>;
}): { html: string; report: StitchHtmlPostprocessReport } {
  const { sessionId, blueprintId, blueprint, page, htmlArtifactId, html, issues } = input;
  const constraints = mergeConstraints(loadStitchUiConstraints(), input.constraints);
  let updatedHtml = html;
  const appliedFixes: string[] = [];
  const rejectedFixes: { fix: string; reason: string }[] = [];
  const issueCodes = new Set(issues.map((item) => item.code));
  const allowedFixes = new Set(constraints.postprocess.codexAllowedFixes);
  const context: PostprocessContext = { blueprint, page, issueCodes };

  for (const fixId of routeCandidateFixes(issueCodes)) {
    if (!allowedFixes.has(fixId)) {
      rejectedFixes.push({ fix: fixId, reason: "Disabled by YAML postprocess allowlist." });
      continue;
    }
    const fix = fixImplementations[fixId];
    if (!fix) {
      rejectedFixes.push({ fix: fixId, reason: "No deterministic implementation exists for this fix." });
      continue;
    }
    const result = fix.apply(updatedHtml, context);
    if (result.applied) {
      updatedHtml = result.html;
      appliedFixes.push(fixId);
    } else {
      rejectedFixes.push({ fix: fixId, reason: result.reason ?? "Safety/applicability check rejected this fix." });
    }
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
