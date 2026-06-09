# stitch-ui-constraints.yaml Design

## Purpose

`stitch-ui-constraints.yaml` is a small, reusable UI behavior constraint file for Stitch HTML generation and validation.

It is not an archetype library and must not be organized by app type.

## Minimal Shape

```yaml
version: 1

promptRules:
  global: []

html:
  requireVisibleRoot: true
  requireHeading: true
  forbidPrimaryUiAsImage: true

interaction:
  requireVisibleBehaviorForClickableElements: true
  clickableSelectors:
    - "button"
    - "a[href]"
    - "[role='button']"
    - "[data-action]"
  allowedVisibleBehaviors:
    - "open_modal"
    - "open_drawer"
    - "toggle_panel"
    - "show_toast"
    - "show_inline_feedback"
    - "submit_form"
    - "reset_form"
    - "navigate_to_declared_page"
    - "switch_declared_tab"
  forbiddenNoopPatterns:
    - "href=\"#\""
    - "href=\"javascript:void(0)\""
    - "empty_onclick"
    - "button_without_form_or_handler"

navigation:
  allowInventedGlobalNavigation: false
  forbiddenInventedLabels:
    - "dashboard"
    - "history"
    - "support"
    - "privacy policy"
    - "terms of service"
    - "contact"
    - "login"
    - "settings"
  sidebar:
    ifPresentMustBeConsistentAcrossPages: true
    canonicalSource: "blueprint.ui.navigation.globalNavItems"
    compare:
      - "labels"
      - "order"
      - "destinations"
    allowOnlyActiveStateDifference: true

runtimeValidation:
  enabled: true
  backend: "chrome_devtools_mcp"
  clickBehavior:
    requireVisibleDomChange: true
    ignoreChanges:
      - "focus"
      - "hover"
      - "active_style_only"
  navigation:
    validateDeclaredDestinations: true
  pageHealth:
    failOnBlankPage: true
    failOnBlockingOverlay: true
  console:
    failOnRuntimeErrors: true

postprocess:
  codexAllowedFixes:
    - "add_modal_for_unhandled_button"
    - "add_toast_for_feedback_action"
    - "add_inline_error_or_success_state"
    - "add_form_submit_handler"
    - "add_reset_handler"
    - "add_toggle_panel_behavior"
    - "normalize_sidebar_across_pages"
    - "remove_or_disable_invented_navigation"
    - "convert_fake_link_to_button"

regeneration:
  stricterPromptRulesByIssueCode: {}
```

## Runtime Validation Semantics

`runtimeValidation.backend = chrome_devtools_mcp` means validation must render HTML in a real browser before React handoff.

Use runtime validation for:

```text
click behavior
navigation behavior
sidebar consistency
blank page detection
blocking overlay detection
console/runtime errors
broken resources
```

## Click Rule

Every clickable element must produce a meaningful visible effect.

Allowed effects include:

```text
modal, drawer, panel toggle, toast, inline feedback, form submit/reset, declared page navigation, declared tab switch
```

Focus, hover, active styling, or color-only changes do not count.

## Navigation Rule

Do not invent global navigation. Navigation labels and destinations must come from the frozen blueprint or declared PageContract actions.

## Sidebar Rule

If multiple pages contain a sidebar, labels, order, and destinations must match across pages. Only active state may differ.
