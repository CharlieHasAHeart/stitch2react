# stitch-ui-constraints.yaml Design

## Purpose

`stitch-ui-constraints.yaml` defines reusable Stitch HTML behavior constraints.

It is not an app archetype library.

It should stay small and should be consumed by:

```text
Stitch prompt builder
static HTML validator
Chrome DevTools MCP runtime validator
Codex SDK HTML postprocess
regeneration prompt builder
```

## Source of truth

The frozen `ProductBlueprintV1` remains the source of truth.

The YAML may constrain generated HTML behavior, but it must not introduce product scope, new pages, new flows, authentication, payments, collaboration features, or integrations.

## Recommended YAML shape

```yaml
version: 1

promptRules:
  global:
    - "Every clickable element must produce a visible interaction."
    - "Do not create decorative-only buttons or links."
    - "Do not invent navigation, pages, support links, legal links, authentication, payment, collaboration, dashboards, or integrations unless present in the frozen blueprint."
    - "If a sidebar appears on multiple pages, keep its labels, order, and destinations identical across pages."

html:
  requireVisibleRoot: true
  requireHeading: true

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
    - "role_button_without_handler"
    - "data_action_without_handler"

navigation:
  allowInventedGlobalNavigation: false

  forbiddenInventedLabels:
    - "dashboard"
    - "history"
    - "support"
    - "my quotes"
    - "privacy policy"
    - "terms of service"
    - "compliance"
    - "contact"
    - "account"
    - "settings"
    - "login"
    - "sign in"
    - "sign up"
    - "仪表盘"
    - "历史"
    - "支持"
    - "我的报价"
    - "隐私政策"
    - "使用条款"
    - "合规"
    - "联系支持"
    - "联系我们"
    - "登录"
    - "注册"
    - "账号"
    - "设置"

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

  console:
    failOnRuntimeErrors: true

postprocess:
  codexAllowedFixes:
    - "add_modal_for_unhandled_button"
    - "add_drawer_for_secondary_details"
    - "add_toast_for_feedback_action"
    - "add_inline_error_or_success_state"
    - "add_form_submit_handler"
    - "add_reset_handler"
    - "add_toggle_panel_behavior"
    - "normalize_sidebar_across_pages"
    - "remove_or_disable_invented_navigation"
    - "convert_fake_link_to_button"
    - "add_data_action_attributes"

regeneration:
  stricterPromptRulesByIssueCode:
    missing_runtime_click_behavior:
      - "Every button, link, and role=button element must visibly change the page state."
      - "Use a modal, drawer, toast, inline feedback, form submit state, reset state, or declared page navigation."
      - "Do not render inert decorative buttons."

    invented_navigation:
      - "Remove navigation labels that are not present in the frozen blueprint."

    sidebar_runtime_inconsistent:
      - "Use the same sidebar labels, order, and destinations on every page."
      - "Only the active state may differ between pages."
```

## Validation responsibilities

Static validation should catch obvious markup and contract issues.

Chrome DevTools MCP runtime validation should check:

```text
click behavior
declared navigation destinations
cross-page sidebar consistency
rendered page availability
console/runtime errors
```

A clickable element passes only if runtime validation observes a meaningful visible effect.

Focus, hover, or active styling alone is not enough.

## Codex SDK postprocess

Codex SDK may apply local deterministic fixes listed in `postprocess.codexAllowedFixes`.

It may not reinterpret raw input or rewrite product scope.

Every postprocess run must persist a report with:

```text
source issue codes
applied fixes
changed artifacts
rejected fixes with reasons
```

## Required issue codes

```text
html_empty
html_missing_visible_root
html_missing_heading
missing_primary_action
missing_secondary_action
missing_feedback_surface
missing_recovery_surface
missing_runtime_click_behavior
click_only_changes_focus_or_hover
invented_navigation
undeclared_navigation_destination
sidebar_runtime_inconsistent
blank_rendered_page
blocking_overlay
console_runtime_error
broken_resource
```

## Rule

Keep this YAML focused on behavior, navigation, runtime validation, and deterministic postprocess.
