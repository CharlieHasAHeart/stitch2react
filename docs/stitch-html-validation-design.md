# Stitch HTML Validation Design

## Purpose

This document defines validation for Stitch-generated HTML.

Validation has two layers:

```text
static HTML validation
Chrome DevTools MCP runtime validation
```

Static validation is useful for obvious contract issues.

Runtime validation is required for click, navigation, render, and cross-page behavior.

## Static validation

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
```

Static validation should not try to prove that a click has real behavior.

That belongs to runtime validation.

## Runtime validation backend

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
compare navigation/sidebar models across pages
```

## Click behavior validation

A clickable element passes only when Chrome DevTools MCP observes a meaningful visible effect.

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

Issue codes:

```text
missing_runtime_click_behavior
click_only_changes_focus_or_hover
```

## Navigation validation

Runtime validation should check:

```text
navigation labels
declared destinations
route changes
hash changes
sidebar consistency
active state
```

Issue codes:

```text
invented_navigation
undeclared_navigation_destination
sidebar_runtime_inconsistent
```

## Whole-page runtime checks

Runtime validation should check:

```text
blank_rendered_page
blocking_overlay
console_runtime_error
broken_resource
```

## Evidence

Every runtime issue should include evidence:

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

## Report merge

The final validation report should merge:

```text
static issues
runtime issues
cross-page runtime issues
```

Do not duplicate issue codes for the same root cause.

## Retry policy

If a deterministic Codex SDK postprocess fix is available, apply it and re-run validation.

If no safe fix is available, regenerate the page from the same frozen `PageContract` with stricter prompt rules.
