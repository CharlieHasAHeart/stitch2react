import { unified } from "unified";
import rehypeParse from "rehype-parse";
import type { Root } from "hast";

export function parseStitchHtml(html: string): Root {
  return unified().use(rehypeParse, { fragment: false }).parse(html) as Root;
}
