# Stitch HTML Postprocess Design

## Purpose

Codex SDK postprocess applies deterministic local fixes to Stitch-generated HTML.

It uses static and Chrome DevTools MCP runtime validation reports as evidence.

Postprocess is not LLM repair.

## Pipeline position

```text
Stitch HTML
  -> static validation
  -> Chrome DevTools MCP runtime validation
  -> Codex SDK postprocess when code-fixable
  -> re-validation
  -> screenshot
  -> persist validated Stitch artifacts
```

## Allowed fixes

Codex SDK may apply only local, deterministic fixes.

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

## Disallowed fixes

Codex SDK must not:

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
```

## Runtime-evidence-driven fixes

Use validation issue codes to select fixes.

```text
missing_runtime_click_behavior -> add modal/toast/drawer/toggle/form behavior
click_only_changes_focus_or_hover -> add visible state change
sidebar_runtime_inconsistent -> normalize sidebar from canonical navigation model
invented_navigation -> remove or disable invented navigation
undeclared_navigation_destination -> remove, disable, or retarget to declared destination
console_runtime_error -> patch only when local and deterministic
broken_resource -> patch only when local and deterministic
```

## Postprocess report

Every postprocess run must persist:

```ts
type StitchHtmlPostprocessReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageIds: string[];
  sourceIssueCodes: string[];
  appliedFixes: string[];
  changedArtifacts: string[];
  rejectedFixes: {
    fix: string;
    reason: string;
  }[];
  createdAt: string;
};
```

## Re-validation

After postprocess, re-run:

```text
static validation
Chrome DevTools MCP runtime validation
cross-page navigation/sidebar validation
```

If the same issue remains, do not loop indefinitely.

Regenerate from the frozen `PageContract` when the retry budget allows.
