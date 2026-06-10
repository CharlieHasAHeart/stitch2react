# Issue Code Inventory

## Purpose

This file records the validation and postprocess issue codes currently used by the repository.

Use it to review:

- which layer emits each issue code
- where each issue code is produced
- where each issue code is consumed
- which issue codes are report-only versus routed into deterministic postprocess

## Static HTML Validation

| Code | Produced by | Consumed by | Notes |
| --- | --- | --- | --- |
| `html_empty` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | static only |
| `html_missing_visible_root` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | static only |
| `html_missing_heading` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | static only |
| `missing_primary_action` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | static only |
| `missing_secondary_action` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | static only |
| `missing_feedback_surface` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | no deterministic postprocess branch today |
| `missing_recovery_surface` | `src/stitch/validation/validate-stitch-html.ts` | reporting only | no deterministic postprocess branch today |
| `invented_navigation` | `src/stitch/validation/validate-stitch-html.ts` | `src/stitch/postprocess/postprocess-stitch-html.ts` | routed to `remove_or_disable_invented_navigation` |

## Runtime Validation

| Code | Produced by | Consumed by | Notes |
| --- | --- | --- | --- |
| `blank_rendered_page` | `src/stitch/runtime/validate-stitch-runtime.ts` | reporting only | configured in `src/stitch/constraints/runtime-validation-constraints.yaml` |
| `blocking_overlay` | `src/stitch/runtime/validate-stitch-runtime.ts` | reporting only | configured in `src/stitch/constraints/runtime-validation-constraints.yaml` |
| `missing_runtime_click_behavior` | `src/stitch/runtime/validate-stitch-runtime.ts` | `src/stitch/postprocess/postprocess-stitch-html.ts` | routed to `add_toast_for_feedback_action` and `convert_fake_link_to_button` |
| `click_only_changes_focus_or_hover` | `src/stitch/runtime/validate-stitch-runtime.ts` | `src/stitch/postprocess/postprocess-stitch-html.ts` | routed to `add_toast_for_feedback_action` and `convert_fake_link_to_button` |
| `console_runtime_error` | `src/stitch/runtime/validate-stitch-runtime.ts` | reporting only | no deterministic postprocess branch today |
| `broken_resource` | `src/stitch/runtime/validate-stitch-runtime.ts` | reporting only | no deterministic postprocess branch today |

## Cross-page Validation

### Static Cross-page

| Code | Produced by | Consumed by | Notes |
| --- | --- | --- | --- |
| `sidebar_inconsistent_across_pages` | `src/stitch/validation/validate-stitch-cross-page.ts` | `src/stitch/postprocess/postprocess-stitch-html.ts` | authoritative sidebar consistency code for static cross-page validation |
| `undeclared_navigation_destination` | `src/stitch/validation/validate-stitch-cross-page.ts` via `runtime-validation-constraints.yaml` | `src/stitch/postprocess/postprocess-stitch-html.ts` | authoritative undeclared-destination code for cross-page validation |

### Runtime Cross-page

| Code | Produced by | Consumed by | Notes |
| --- | --- | --- | --- |
| `undeclared_navigation_destination` | `src/stitch/runtime/validate-stitch-cross-page-runtime.ts` via `runtime-validation-constraints.yaml` | `src/stitch/postprocess/postprocess-stitch-html.ts` | authoritative undeclared-destination code for runtime cross-page validation |

## Current Postprocess Routing

| Allowed fix | Triggering issue codes in current code | File |
| --- | --- | --- |
| `add_toast_for_feedback_action` | `missing_runtime_click_behavior`, `click_only_changes_focus_or_hover` | `src/stitch/postprocess/postprocess-stitch-html.ts` |
| `normalize_sidebar_across_pages` | `sidebar_inconsistent_across_pages` | `src/stitch/postprocess/postprocess-stitch-html.ts` |
| `remove_or_disable_invented_navigation` | `invented_navigation`, `undeclared_navigation_destination` | `src/stitch/postprocess/postprocess-stitch-html.ts` |
| `convert_fake_link_to_button` | `missing_runtime_click_behavior`, `click_only_changes_focus_or_hover` | `src/stitch/postprocess/postprocess-stitch-html.ts` |

## Report-only Codes

These issue codes are currently emitted and persisted, but they do not have deterministic postprocess routing today.

- `html_empty`
- `html_missing_visible_root`
- `html_missing_heading`
- `missing_primary_action`
- `missing_secondary_action`
- `missing_feedback_surface`
- `missing_recovery_surface`
- `blank_rendered_page`
- `blocking_overlay`
- `console_runtime_error`
- `broken_resource`
