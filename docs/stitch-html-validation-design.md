# Stitch HTML Validation Design

## Purpose

Validation proves that Stitch HTML is structurally valid, renderable, interactive, and safe for React handoff.

Validation has three layers:

```text
static HTML validation
Chrome DevTools MCP runtime validation
cross-page navigation/sidebar validation
```

## Static Validation

Static validation catches obvious source-level issues:

```text
empty HTML
missing visible root
missing heading
missing primary/secondary action text
UI-as-image risk
obvious fake links such as href="#"
invented navigation labels
```

## Runtime Validation with Chrome DevTools MCP

Runtime validation opens the generated HTML in Chrome and records evidence.

Required checks:

```text
page renders and is not blank
main content is visible
console has no blocking runtime errors
resources are not broken in a way that hides UI
clickable elements produce meaningful visible effects
navigation targets are declared
modals/toasts/drawers/toggles actually appear when clicked
```

## Click Validation

For each clickable element:

```text
1. record URL, visible text hash, DOM hash, screenshot when needed
2. click the element
3. record URL, visible text hash, DOM hash, screenshot when needed
4. decide whether a meaningful visible effect occurred
```

Pass examples:

```text
modal appears
drawer opens
panel expands/collapses
toast appears
inline success/error appears
form moves to submitted state
route changes to declared page
active declared tab changes
```

Fail examples:

```text
only focus changed
only hover/active style changed
no DOM change
href="#" does nothing
link navigates to undeclared page
button has no form, handler, or data-action
```

Issue codes:

```text
missing_runtime_click_behavior
click_only_changes_focus_or_hover
undeclared_navigation_destination
```

## Cross-page Validation

After all page HTML artifacts exist, run cross-page checks.

Required checks:

```text
sidebar labels match across pages
sidebar order matches across pages
sidebar destinations match across pages
only active state differs
header/global navigation is consistent when present
```

Issue codes:

```text
sidebar_inconsistent_across_pages
global_navigation_inconsistent_across_pages
```

## Evidence

Every runtime issue should include evidence:

```ts
type StitchValidationEvidence = {
  backend: "chrome_devtools_mcp";
  pageId: string;
  selector?: string;
  elementText?: string;
  before?: RuntimeObservation;
  after?: RuntimeObservation;
  notes?: string[];
};
```

## Validation Result

Validation passes only when:

```text
static validation passes
runtime validation passes
cross-page validation passes, when multiple pages exist
```
