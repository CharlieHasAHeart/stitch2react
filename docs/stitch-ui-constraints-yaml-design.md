# stitch-ui-constraints.yaml Design

## 1. Purpose

`stitch-ui-constraints.yaml` is a small UI behavior constraint library for Stitch HTML generation.

It is not an app archetype library.

Do not organize it by software type, product type, or app type.

## 2. What it controls

The YAML controls only universal, code-verifiable UI behavior rules:

```text
real HTML
real click behavior
no invented navigation
consistent sidebar
safe Codex SDK postprocess
bounded regeneration
```

## 3. Recommended file path

```text
src/stitch/constraints/stitch-ui-constraints.yaml
```

## 4. Minimal YAML shape

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
  clickableSelectors: []
  allowedVisibleBehaviors: []
  forbiddenNoopPatterns: []

navigation:
  allowInventedGlobalNavigation: false
  forbiddenInventedLabels: []
  sidebar:
    ifPresentMustBeConsistentAcrossPages: true
    canonicalSource: "blueprint.ui.navigation.globalNavItems"
    allowOnlyActiveStateDifference: true

postprocess:
  codexAllowedFixes: []

regeneration:
  stricterPromptRulesByIssueCode: {}
```

## 5. Initial recommended content

```yaml
version: 1

promptRules:
  global:
    - "Use real HTML elements for all primary UI."
    - "Every clickable element must produce a visible interaction."
    - "Do not create decorative-only buttons or links."
    - "Do not invent navigation, pages, support links, legal links, authentication, payment, collaboration, dashboards, or integrations unless present in the frozen blueprint."
    - "If a sidebar appears on multiple pages, keep its labels, order, and destinations identical across pages."

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
    - "href=#"
    - "javascript:void(0)"
    - "empty_onclick"
    - "button_without_form_or_handler"

navigation:
  allowInventedGlobalNavigation: false
  forbiddenInventedLabels:
    - "dashboard"
    - "history"
    - "support"
    - "my quotes"
    - "privacy policy"
    - "terms of service"
    - "contact"
    - "login"
    - "settings"
    - "仪表盘"
    - "历史"
    - "支持"
    - "我的报价"
    - "隐私政策"
    - "使用条款"
    - "联系我们"
  sidebar:
    ifPresentMustBeConsistentAcrossPages: true
    canonicalSource: "blueprint.ui.navigation.globalNavItems"
    compare:
      - "labels"
      - "order"
      - "destinations"
    allowOnlyActiveStateDifference: true

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
  stricterPromptRulesByIssueCode:
    missing_click_behavior:
      - "Every button, link, and role=button element must visibly change page state."
      - "Hover, focus, highlight, or color change alone is not enough."
    invented_navigation:
      - "Remove navigation labels that are not present in the frozen blueprint."
    sidebar_inconsistent_across_pages:
      - "Use the same sidebar labels, order, and destinations on every page."
    ui_as_image_violation:
      - "Render forms, buttons, cards, navigation, labels, and important text as real HTML."
```

## 6. Consumption rules

The YAML is consumed by:

```text
Stitch prompt builder
single-page HTML validator
cross-page validator
Codex SDK postprocessor
regeneration prompt builder
```

Do not dump the entire YAML into prompts.

Inject concise relevant rules.

## 7. Blueprint override rule

If a forbidden label is explicitly present in the frozen blueprint, it is allowed.

The YAML may guard against hallucinated UI, but it may not override explicit blueprint content.
