import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { resolveStitchProjectFile } from "../shared/resolve-stitch-project-file.js";

const issueMetadataSchema = z.object({
  suggestedFix: z.string()
});

const runtimeValidationConstraintsSchema = z.object({
  version: z.number().int().positive(),
  targets: z.object({
    clickableSelectors: z.array(z.string()).min(1)
  }),
  effects: z.object({
    meaningful: z.array(z.string()).min(1),
    weakOnly: z.array(z.string()),
    detectors: z.object({
      modalSelectors: z.array(z.string()).min(1),
      drawerSelectors: z.array(z.string()).min(1),
      toastSelectors: z.array(z.string()).min(1),
      inlineFeedbackSelectors: z.array(z.string()).min(1),
      activeTabSelectors: z.array(z.string()).min(1),
      blockingOverlaySelectors: z.array(z.string()).min(1)
    })
  }),
  console: z.object({
    blockingTypes: z.array(z.string()).min(1)
  }),
  resources: z.object({
    ignoreUrlSuffixes: z.array(z.string()),
    blockingStatusCodes: z.array(z.number().int())
  }),
  navigation: z.object({
    requireDeclaredPageNavigation: z.boolean(),
    issueCodeForUndeclaredDestination: z.string(),
    sidebar: z.object({
      requireConsistencyAcrossPages: z.boolean(),
      compare: z.array(z.enum(["labels", "order", "destinations"])).min(1),
      canonicalSource: z.string()
    })
  }),
  issues: z.object({
    blank_rendered_page: issueMetadataSchema,
    blocking_overlay: issueMetadataSchema,
    missing_runtime_click_behavior: issueMetadataSchema,
    click_only_changes_focus_or_hover: issueMetadataSchema,
    console_runtime_error: issueMetadataSchema,
    broken_resource: issueMetadataSchema
  })
});

export type RuntimeValidationConstraints = z.infer<typeof runtimeValidationConstraintsSchema>;

let cachedConstraints: RuntimeValidationConstraints | null = null;

function constraintsFilePath(): string {
  return resolveStitchProjectFile(import.meta.url, "src/stitch/constraints/runtime-validation-constraints.yaml");
}

export function loadRuntimeValidationConstraints(): RuntimeValidationConstraints {
  if (cachedConstraints) {
    return cachedConstraints;
  }

  const raw = readFileSync(constraintsFilePath(), "utf8");
  cachedConstraints = runtimeValidationConstraintsSchema.parse(parse(raw));
  return cachedConstraints;
}

export function resetRuntimeValidationConstraintsCache(): void {
  cachedConstraints = null;
}
