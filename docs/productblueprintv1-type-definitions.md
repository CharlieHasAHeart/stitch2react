# ProductBlueprintV1 Type Definitions Update

This short document records downstream type additions needed for Stitch HTML validation with Chrome DevTools MCP.

The core `ProductBlueprintV1` remains the source of truth. Stitch validation types are downstream artifacts and must not alter the frozen blueprint.

## Stitch Artifact Types

```ts
type StitchArtifactType =
  | "stitch_prompt_plan"
  | "stitch_page_prompt"
  | "stitch_html"
  | "stitch_screenshot"
  | "stitch_html_validation_report"
  | "stitch_html_postprocess_report"
  | "stitch_runtime_validation_evidence";
```

## Runtime Validation Evidence

```ts
type StitchValidationBackend = "static" | "chrome_devtools_mcp";

type StitchRuntimeValidationEvidence = {
  id: string;
  backend: StitchValidationBackend;
  sessionId: string;
  blueprintId: string;
  pageId: string;
  selector?: string;
  elementText?: string;
  action?: "click" | "render" | "navigation" | "sidebar_compare";
  before?: RuntimeObservation;
  after?: RuntimeObservation;
  notes?: string[];
  createdAt: string;
};

type RuntimeObservation = {
  url?: string;
  visibleTextHash?: string;
  domHash?: string;
  screenshotArtifactId?: string;
  consoleErrors?: string[];
  visibleStateSummary?: string;
};
```

## Stitch HTML Validation Report

```ts
type StitchHtmlValidationReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageId?: string;
  htmlArtifactIds: string[];
  passed: boolean;
  issues: StitchHtmlValidationIssue[];
  evidenceArtifactIds: string[];
  createdAt: string;
};

type StitchHtmlValidationIssue = {
  code:
    | "html_empty"
    | "html_missing_visible_root"
    | "html_missing_heading"
    | "ui_as_image_violation"
    | "missing_primary_action"
    | "missing_runtime_click_behavior"
    | "click_only_changes_focus_or_hover"
    | "invented_navigation"
    | "undeclared_navigation_destination"
    | "sidebar_inconsistent_across_pages"
    | "blank_rendered_page"
    | "blocking_overlay"
    | "console_runtime_error"
    | "broken_resource";
  severity: "error" | "warning";
  pageId?: string;
  selector?: string;
  message: string;
  suggestedFix?: string;
  evidenceArtifactIds?: string[];
};
```

## Postprocess Report

```ts
type StitchHtmlPostprocessReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageIds: string[];
  sourceIssueCodes: string[];
  appliedFixes: string[];
  changedArtifactIds: string[];
  rejectedFixes: {
    fix: string;
    reason: string;
  }[];
  createdAt: string;
};
```

## Type Boundary

- Runtime validation evidence and postprocess reports are downstream artifacts.
- They must reference the frozen `blueprintId`.
- They must not mutate `ProductBlueprintV1`.
