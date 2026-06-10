import type { Element, Root, Text } from "hast";
import { visit } from "unist-util-visit";

export type HtmlElementSummary = {
  tagName: string;
  properties: Record<string, unknown>;
  text: string;
  node: Element;
};

function camelizeDataKey(key: string): string {
  return key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function textFromNode(node: Element): string {
  const chunks: string[] = [];
  visit(node, "text", (child) => {
    chunks.push(String((child as Text).value ?? ""));
  });
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function toSummary(node: Element): HtmlElementSummary {
  return {
    tagName: node.tagName,
    properties: { ...(node.properties ?? {}) },
    text: textFromNode(node),
    node
  };
}

export function findElements(root: Root, predicate: (node: Element) => boolean): HtmlElementSummary[] {
  const found: HtmlElementSummary[] = [];
  visit(root, "element", (node) => {
    const element = node as Element;
    if (predicate(element)) {
      found.push(toSummary(element));
    }
  });
  return found;
}

export function getStringProp(node: Element, key: string): string | undefined {
  const value = node.properties?.[key] ?? node.properties?.[camelizeDataKey(key)];
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

export function hasProp(node: Element, key: string): boolean {
  return node.properties ? (Object.prototype.hasOwnProperty.call(node.properties, key) || Object.prototype.hasOwnProperty.call(node.properties, camelizeDataKey(key))) : false;
}

export function hasClass(node: Element, className: string): boolean {
  const value = node.properties?.className;
  const classes = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/\s+/) : [];
  return classes.includes(className);
}
