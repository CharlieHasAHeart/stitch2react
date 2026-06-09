# Stitch HTML Postprocess Design

## 1. Purpose

Codex SDK postprocess fixes local, code-verifiable HTML issues after Stitch generation.

It is not LLM repair.

It must not reinterpret raw input or change the frozen blueprint.

## 2. Pipeline position

```text
Stitch HTML
  -> deterministic validation
  -> Codex SDK postprocess if code-fixable
  -> revalidation
  -> regeneration only if still failing and retry remains
```

## 3. Allowed fixes

Allowed fixes come from `stitch-ui-constraints.yaml`.

Examples:

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

## 4. Forbidden fixes

Postprocess must not:

```text
change product scope
add new user flows
add new pages
add auth/payment/collaboration/integrations
rewrite page for style preference
reinterpret raw input
modify frozen ProductBlueprintV1
```

## 5. Click behavior fixes

For safe unhandled click targets, Codex may add:

```text
modal behavior
drawer behavior
toggle panel behavior
toast behavior
inline success/error state
form submit/reset handler
data-action attributes
```

The chosen behavior should match the PageContract action purpose.

## 6. Sidebar normalization

If sidebars differ across pages and a canonical source exists, Codex may normalize them.

Canonical source preference:

```text
blueprint.ui.navigation.globalNavItems
declared page routes from PageContracts
```

Only active state may differ by page.

## 7. Postprocess report

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
  rejectedFixes: { fix: string; reason: string }[];
  createdAt: string;
};
```

## 8. Revalidation

Postprocess output must be revalidated.

If it still fails:

```text
try another allowed postprocess only if safe
otherwise regenerate page with stricter prompt if retry remains
otherwise fail with diagnostics
```
