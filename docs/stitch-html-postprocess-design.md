# Stitch HTML Postprocess Design

## Purpose

Codex SDK postprocess fixes local, code-verifiable HTML issues after validation.

It is not LLM repair and must not rewrite the product.

## Inputs

```text
frozen ProductBlueprintV1
Stitch HTML artifacts
static validation report
Chrome DevTools MCP runtime evidence
stitch-ui-constraints.yaml
```

## Postprocess Flow

```text
validation issue
  -> check if issue is code-fixable
  -> apply allowed Codex SDK fix
  -> persist postprocess report
  -> re-run static validation
  -> re-run Chrome DevTools MCP runtime validation
```

## Runtime Evidence Driven Fixes

Use MCP evidence to decide exact fixes.

Examples:

```text
missing_runtime_click_behavior -> add modal/toast/toggle/form handler
click_only_changes_focus_or_hover -> replace decorative behavior with visible state change
sidebar_inconsistent_across_pages -> normalize sidebar from canonical blueprint navigation
undeclared_navigation_destination -> remove link or convert to local button
console_runtime_error -> patch local deterministic script error
```

## Allowed Fixes

```text
add_modal_for_unhandled_button
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

## Forbidden Fixes

Codex SDK postprocess must not:

```text
add new pages
add new flows
add login/payment/collaboration/integration scope
reinterpret raw input
rewrite entire page for style
change the frozen blueprint
hide validation failures without fixing them
```

## Sidebar Normalization

If sidebars differ across pages, Codex may normalize them using:

```text
blueprint.ui.navigation.globalNavItems
or declared page routes when the blueprint explicitly supports page navigation
```

Labels, order, and destinations must match. Active state may differ.

## Report

Every postprocess run must persist:

```ts
type StitchHtmlPostprocessReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageIds: string[];
  sourceIssueCodes: string[];
  appliedFixes: string[];
  changedArtifactIds: string[];
  rejectedFixes: { fix: string; reason: string }[];
  createdAt: string;
};
```

## Re-validation

Postprocess is not complete until the updated HTML passes both static and Chrome DevTools MCP runtime validation.
