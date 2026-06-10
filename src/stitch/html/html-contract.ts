import type { Element, Root } from "hast";
import type { PageContract } from "../../blueprint/types/blueprint.js";
import { findElements, getStringProp, hasProp, type HtmlElementSummary } from "./html-ast-query.js";

export type ActionElement = HtmlElementSummary & {
  actionId?: string;
  actionKind?: string;
  href?: string;
  type?: string;
};

export type FeedbackSurfaceElement = HtmlElementSummary & {
  surfaceKind?: string;
  role?: string;
  ariaLive?: string;
};

export type RecoverySurfaceElement = HtmlElementSummary & {
  surfaceId?: string;
};

export type NavigationLinkElement = HtmlElementSummary & {
  href?: string;
};

export function findMainRoot(tree: Root): HtmlElementSummary | undefined {
  return findElements(tree, (node) => node.tagName === "main")[0];
}

export function findHeadings(tree: Root): HtmlElementSummary[] {
  return findElements(tree, (node) => ["h1", "h2", "title"].includes(node.tagName));
}

export function findActionElements(tree: Root): ActionElement[] {
  return findElements(tree, (node) => {
    if (["button", "a"].includes(node.tagName)) {
      return true;
    }
    return node.tagName === "input" && ["button", "submit", "reset"].includes(getStringProp(node, "type") ?? "");
  }).map((item) => ({
    ...item,
    actionId: getStringProp(item.node, "data-action-id"),
    actionKind: getStringProp(item.node, "data-action-kind"),
    href: getStringProp(item.node, "href"),
    type: getStringProp(item.node, "type")
  }));
}

export function findFeedbackSurfaces(tree: Root): FeedbackSurfaceElement[] {
  return findElements(tree, (node) => hasProp(node, "data-feedback-surface")).map((item) => ({
    ...item,
    surfaceKind: getStringProp(item.node, "data-feedback-surface"),
    role: getStringProp(item.node, "role"),
    ariaLive: getStringProp(item.node, "aria-live") ?? getStringProp(item.node, "ariaLive")
  }));
}

export function findRecoverySurfaces(tree: Root): RecoverySurfaceElement[] {
  return findElements(tree, (node) => hasProp(node, "data-recovery-surface")).map((item) => ({
    ...item,
    surfaceId: getStringProp(item.node, "data-recovery-surface")
  }));
}

export function findNavigationLinks(tree: Root): NavigationLinkElement[] {
  return findElements(tree, (node) => node.tagName === "a" && hasProp(node, "href")).map((item) => ({
    ...item,
    href: getStringProp(item.node, "href")
  }));
}

export function actionMatchesPageAction(action: ActionElement, declared: PageContract["primaryAction"] | PageContract["secondaryActions"][number]): boolean {
  if (!declared) {
    return false;
  }
  const normalizedText = action.text.toLowerCase();
  return (
    action.actionId === declared.id ||
    (action.actionKind === declared.kind && normalizedText === declared.label.toLowerCase()) ||
    normalizedText === declared.label.toLowerCase()
  );
}
