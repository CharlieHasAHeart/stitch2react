import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

const stitchUiConstraintsSchema = z.object({
  version: z.number().int().positive(),
  promptRules: z.object({
    global: z.array(z.string())
  }),
  html: z.object({
    requireVisibleRoot: z.boolean(),
    requireHeading: z.boolean(),
    forbidPrimaryUiAsImage: z.boolean()
  }),
  interaction: z.object({
    requireVisibleBehaviorForClickableElements: z.boolean(),
    clickableSelectors: z.array(z.string()),
    allowedVisibleBehaviors: z.array(z.string()),
    forbiddenNoopPatterns: z.array(z.string())
  }),
  navigation: z.object({
    allowInventedGlobalNavigation: z.boolean(),
    forbiddenInventedLabels: z.array(z.string()),
    sidebar: z.object({
      ifPresentMustBeConsistentAcrossPages: z.boolean(),
      canonicalSource: z.string(),
      compare: z.array(z.string()),
      allowOnlyActiveStateDifference: z.boolean()
    })
  }),
  postprocess: z.object({
    codexAllowedFixes: z.array(z.string())
  }),
  regeneration: z.object({
    stricterPromptRulesByIssueCode: z.record(z.array(z.string()))
  })
});

export type StitchUiConstraints = z.infer<typeof stitchUiConstraintsSchema>;

let cachedConstraints: StitchUiConstraints | null = null;

function constraintsFilePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, "stitch-ui-constraints.yaml");
}

export function loadStitchUiConstraints(): StitchUiConstraints {
  if (cachedConstraints) {
    return cachedConstraints;
  }

  const raw = readFileSync(constraintsFilePath(), "utf8");
  cachedConstraints = stitchUiConstraintsSchema.parse(parse(raw));
  return cachedConstraints;
}

export function resetStitchUiConstraintsCache(): void {
  cachedConstraints = null;
}
