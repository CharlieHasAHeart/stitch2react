import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import type { ProductBlueprintV1, UIModel } from "../../blueprint/types/blueprint.js";

const appArchetypeConstraintSchema = z.object({
  promptRules: z.array(z.string()),
  forbiddenNavigationLabels: z.array(z.string()),
  forbidClickableGlobalNavigation: z.boolean(),
  forbidClickableFooterLinks: z.boolean()
});

const appArchetypeLibrarySchema = z.record(appArchetypeConstraintSchema);

export type AppArchetypeConstraintSet = z.infer<typeof appArchetypeConstraintSchema>;

let cachedLibrary: Record<string, AppArchetypeConstraintSet> | null = null;

function constraintsFilePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, "app-archetypes.yaml");
}

function loadLibrary(): Record<string, AppArchetypeConstraintSet> {
  if (cachedLibrary) {
    return cachedLibrary;
  }

  const raw = readFileSync(constraintsFilePath(), "utf8");
  cachedLibrary = appArchetypeLibrarySchema.parse(parse(raw));
  return cachedLibrary;
}

export function inferAppArchetype(blueprint: ProductBlueprintV1): UIModel["appArchetype"] {
  const shell = blueprint.ui.appStructure.shell;
  const pageCount = blueprint.ui.pages.length;
  const navigationType = blueprint.ui.navigation.type;

  if (shell === "wizard") {
    return "wizard_flow";
  }
  if (shell === "dashboard") {
    return "dashboard_app";
  }
  if (pageCount === 1 && navigationType === "minimal") {
    return "single_page_tool";
  }
  if (pageCount <= 2 && navigationType === "minimal") {
    return "form_to_result_tool";
  }
  return "multi_page_app";
}

export function resolveAppArchetype(blueprint: ProductBlueprintV1): UIModel["appArchetype"] {
  return blueprint.ui.appArchetype ?? inferAppArchetype(blueprint);
}

export function getAppArchetypeConstraints(
  archetype: UIModel["appArchetype"]
): AppArchetypeConstraintSet | null {
  const library = loadLibrary();
  return library[archetype] ?? null;
}
