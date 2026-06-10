# Validation & Repair Stage

## Purpose

This document defines validation, runtime checking, deterministic HTML postprocess, and bounded regeneration for Stitch-generated HTML.

This stage consumes generated Stitch HTML and never mutates the frozen blueprint.

## Validation Layers

Validation has three layers:

```text
static HTML validation
runtime validation
cross-page validation
```

The final validation result should merge static issues, runtime issues, and cross-page issues.

## Static Validation

Static validation should check:

```text
html_empty
html_missing_visible_root
html_missing_heading
missing_primary_action
missing_secondary_action
missing_feedback_surface
missing_recovery_surface
invented_navigation
ui_as_image_violation
```

Static validation should not try to prove that a click has real behavior.

That belongs to runtime validation.

## Runtime Validation

Use Chrome DevTools MCP as the preferred runtime validation backend.

Runtime validation should:

```text
open the generated HTML page
collect clickable elements
click each declared click target
observe DOM, route, dialog, drawer, toast, inline feedback, form state, and active tab changes
capture relevant evidence
record console errors
record broken resources
```

A clickable element passes only when runtime validation observes a meaningful visible effect.

Acceptable effects:

```text
open_modal
open_drawer
toggle_panel
show_toast
show_inline_feedback
submit_form
reset_form
navigate_to_declared_page
switch_declared_tab
```

Not enough:

```text
focus change
hover state
active style only
no visible DOM or route change
```

Runtime issue codes:

```text
missing_runtime_click_behavior
click_only_changes_focus_or_hover
blank_rendered_page
blocking_overlay
console_runtime_error
broken_resource
```

## Cross-page Validation

Cross-page validation should check:

```text
navigation labels
declared destinations
route changes
hash changes
sidebar consistency
active state
```

Cross-page issue codes:

```text
invented_navigation
undeclared_navigation_destination
sidebar_runtime_inconsistent
```

## Runtime Evidence

Every runtime issue should include evidence.

```ts
type StitchRuntimeValidationEvidence = {
  backend: "chrome_devtools_mcp";
  pageId: string;
  selector?: string;
  text?: string;
  before?: {
    url?: string;
    visibleTextHash?: string;
    domHash?: string;
    screenshotArtifactId?: string;
  };
  after?: {
    url?: string;
    visibleTextHash?: string;
    domHash?: string;
    screenshotArtifactId?: string;
  };
  notes?: string[];
};
```

## Deterministic Postprocess

Codex SDK postprocess is not LLM repair.

It may apply only local deterministic fixes.

Allowed examples:

```text
add_modal_for_unhandled_button
add_drawer_for_secondary_details
add_toast_for_feedback_action
add_inline_error_or_success_state
add_form_submit_handler
add_reset_handler
add_toggle_panel_behavior
normalize_sidebar_across_pages
remove_or_disable_invented_navigation
convert_fake_link_to_button
add_data_action_attributes
```

Forbidden fixes:

```text
reinterpret raw input
change product scope
add new user flows
add new pages
add authentication
add payments
add collaboration features
add integrations
rewrite the whole page for style preference
modify the frozen blueprint
```

## Runtime-driven Fix Routing

Use issue codes to select fixes.

```text
missing_runtime_click_behavior -> add modal/toast/drawer/toggle/form behavior
click_only_changes_focus_or_hover -> add visible state change
sidebar_runtime_inconsistent -> normalize sidebar from canonical navigation model
invented_navigation -> remove or disable invented navigation
undeclared_navigation_destination -> remove, disable, or retarget to declared destination
console_runtime_error -> patch only when local and deterministic
broken_resource -> patch only when local and deterministic
```

## Re-validation

After postprocess, re-run:

```text
static validation
runtime validation
cross-page validation
```

If the same issue remains, do not loop indefinitely.

Regenerate from the same frozen `PageContract` when retry budget allows.

Do not ask an LLM to patch the existing HTML in the default path.

## Validation and Repair Artifacts

Persist:

```text
stitch_html_validation_report
stitch_runtime_validation_report
stitch_cross_page_validation_report
stitch_html_postprocess_report
validated_stitch_artifact_gate_report
```

These are downstream artifacts only.

They must reference the frozen `blueprintId` and must not mutate `ProductBlueprintV1`.
