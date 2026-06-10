# Validation & Repair Stage

## Purpose

This document defines validation, runtime checking, and deterministic HTML postprocess for Stitch-generated HTML.

This stage consumes generated Stitch HTML artifacts and never mutates the frozen blueprint. It owns validation, deterministic postprocess, cross-page checks, and final gate decisions.

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
```

Static validation should not try to prove that a click has real behavior.

That belongs to runtime validation.

## Runtime Validation

Use the project runtime validation backend: Node temporary local server + Chrome headless remote debugging + direct CDP client.

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
sidebar_inconsistent_across_pages
```

## Runtime Evidence

Every runtime issue should include evidence.

```ts
type StitchRuntimeValidationEvidence = {
  backend: "chrome_headless_cdp";
  pageId: string;
  selector?: string;
  text?: string;
  before?: {
    url?: string;
    visibleTextHash?: string;
    domHash?: string;
  };
  after?: {
    url?: string;
    visibleTextHash?: string;
    domHash?: string;
  };
  notes?: string[];
};
```

## Deterministic Postprocess

Codex SDK postprocess is not LLM repair.

It may apply only local deterministic fixes.

Postprocess decision flow is:

```text
validator
  -> issue code
  -> candidate fixes
  -> YAML allowlist
  -> per-fix safety/applicability check
  -> deterministic postprocess
  -> re-validation
  -> pass or fail
```

The contract is:

- issue codes select candidate fixes
- `src/stitch/constraints/stitch-ui-constraints.yaml` decides which fixes are enabled
- each fix must decide for itself whether the current HTML is safe and applicable to patch
- a candidate fix may be rejected even when its issue code is present
- postprocess must record both `appliedFixes` and `rejectedFixes`

Allowed deterministic fixes currently implemented:

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

Use issue codes to select candidate fixes, not to force a single unconditional patch.

Current candidate routing is:

```text
missing_runtime_click_behavior -> form submit/reset, fake-link conversion, toast feedback, toggle behavior, modal behavior
click_only_changes_focus_or_hover -> inline feedback state, fake-link conversion
missing_feedback_surface -> inline feedback state
sidebar_inconsistent_across_pages -> normalize sidebar from canonical navigation model
invented_navigation -> remove or disable invented navigation
undeclared_navigation_destination -> remove, disable, or retarget to declared destination
```

Final application still depends on:

- YAML allowlist enablement
- fix-specific safety checks
- fix-specific applicability checks against the current HTML

## Re-validation

After postprocess, re-run:

```text
static validation
runtime validation
cross-page validation
```

If the same issue remains, do not loop indefinitely.

Do not ask an LLM to patch the existing HTML in the default path.

## Validation and Repair Artifacts

Artifact layers are:

```text
Page-level artifacts:
- stitch_page_prompt
- stitch_html
- stitch_runtime_validation_report
- stitch_html_validation_report
- stitch_html_postprocess_report

Bundle-level artifacts:
- stitch_cross_page_validation_report
- project_bundle_manifest

Final gate artifact:
- stitch_final_validation_gate_report
```

Persist:

```text
stitch_html_validation_report
stitch_runtime_validation_report
stitch_cross_page_validation_report
stitch_html_postprocess_report
validated_stitch_artifact_gate_report
stitch_final_validation_gate_report
```

These are downstream artifacts only.

They must reference the frozen `blueprintId` and must not mutate `ProductBlueprintV1`.

## Final Validation Gate

The final validation gate is the only stage that decides whether the generated Stitch HTML bundle is deliverable.

It consumes:

- page-level static/runtime validation reports
- runtime backend authority status
- postprocess reports
- bundle-level cross-page validation report

It produces:

- `stitch_final_validation_gate_report`

The final gate must not:

- mutate HTML
- regenerate HTML
- call Stitch
- reinterpret raw input
- mutate the frozen blueprint

A page can pass page-level validation but still fail the final gate if cross-page validation fails.
