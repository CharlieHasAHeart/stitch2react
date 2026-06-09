# `stitch-ui-constraints.yaml` Design Guide

## 1. Purpose

`stitch-ui-constraints.yaml` is the shared constraint contract for the Stitch HTML generation stage.

It is consumed by Codex to implement:

```text
Stitch prompt construction
HTML validation
cross-page validation
Codex SDK HTML postprocessing
regeneration prompt tightening
future React handoff checks
```

This file must not become an app-type or archetype library.

Do not organize this YAML by product type, software type, app archetype, or UI archetype.

The correct mental model is:

```text
frozen ProductBlueprintV1
  -> Stitch prompt
  -> Stitch HTML
  -> deterministic validation
  -> Codex SDK postprocess when code-fixable
  -> re-validation
  -> screenshot
  -> persist validated Stitch artifacts
```

`stitch-ui-constraints.yaml` describes the reusable UI behavior rules that apply across generated pages.

## 2. Core design principle

Use "less is more".

The YAML should contain a small set of constraints that are:

```text
general
stable
cross-product
deterministically checkable
safe for Codex SDK postprocessing
useful for Stitch prompt tightening
```

The YAML should not contain long, product-specific design instructions.

Avoid rules such as:

```text
CRM apps must have ...
booking apps must have ...
dashboard apps must have ...
wizard apps must have ...
quote tools must have ...
```

Prefer rules such as:

```text
Every clickable element must cause visible behavior.
Do not invent navigation that is not present in the frozen blueprint.
If a sidebar appears across pages, it must stay consistent.
Primary UI must be real HTML, not a raster image.
```

## 3. Non-goals

This YAML is not:

```text
a visual design system
a component library
an app archetype library
a replacement for ProductBlueprintV1
a place to encode product-specific business logic
a place to describe every possible UI layout
```

It must not decide the product flow.

It must not reinterpret raw user input.

It must not override the frozen blueprint.

It must not introduce new pages, flows, roles, authentication, payments, collaboration features, or integrations.

## 4. Source of truth hierarchy

Codex must follow this precedence order:

```text
1. frozen ProductBlueprintV1
2. page-level PageContract
3. stitch-ui-constraints.yaml
4. generated Stitch HTML
5. Codex SDK postprocess output
```

The YAML may constrain how HTML is generated or repaired, but it may not change the blueprint.

If YAML and blueprint conflict, the blueprint wins and Codex should report a configuration conflict.

## 5. Recommended YAML shape

Use this minimal top-level shape:

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

This shape is intentionally small.

Codex should add fields only when a validator or postprocessor actually consumes them.

## 6. Full suggested initial YAML

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
  primaryUiImageIndicators:
    - "single large image with no buttons"
    - "image-only form"
    - "image-only navigation"
    - "image-only card grid"

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
    missing_click_behavior:
      - "Every button, link, and role=button element must visibly change the page state."
      - "Use a modal, drawer, toast, inline feedback, form submit state, reset state, or declared page navigation."
      - "Do not render inert decorative buttons."

    invented_navigation:
      - "Remove navigation labels that are not present in the frozen blueprint."
      - "Do not add dashboard, history, support, account, legal, login, or settings navigation unless explicitly present."

    sidebar_inconsistent_across_pages:
      - "Use the same sidebar labels, order, and destinations on every page."
      - "Only the active state may differ between pages."

    ui_as_image_violation:
      - "Render forms, buttons, cards, navigation, labels, and important text as real HTML elements."
      - "Do not place the primary UI inside a raster image."
```

## 7. Field semantics

### 7.1 `version`

```yaml
version: 1
```

Required.

Used for migration and schema compatibility.

Codex must fail fast if the version is unsupported.

### 7.2 `promptRules.global`

General instructions injected into every Stitch page prompt.

These rules should be short and reusable.

They should not mention specific product categories.

Good:

```text
Every clickable element must produce a visible interaction.
```

Bad:

```text
A quote tool must show a quote result card with three vendor options.
```

### 7.3 `html.requireVisibleRoot`

When true, the HTML validator must require at least one visible root container.

Acceptable examples:

```html
<body>...</body>
<main>...</main>
<div class="app">...</div>
```

Issue code:

```text
html_missing_visible_root
```

### 7.4 `html.requireHeading`

When true, the validator must require a page-level heading or title.

Acceptable examples:

```html
<title>...</title>
<h1>...</h1>
<h2>...</h2>
```

Issue code:

```text
html_missing_heading
```

### 7.5 `html.forbidPrimaryUiAsImage`

When true, the validator must reject primary UI rendered as a raster image.

The validator should flag pages where images exist but expected real UI elements are missing.

Issue code:

```text
ui_as_image_violation
```

### 7.6 `interaction.requireVisibleBehaviorForClickableElements`

This is a core invariant.

When true, every clickable element must have at least one observable behavior.

Clickable elements include:

```text
button
a[href]
[role='button']
[data-action]
```

Observable behavior includes:

```text
opening a modal
opening a drawer
toggling a panel
showing a toast
showing inline feedback
submitting a form
resetting a form
navigating to a declared page
switching a declared tab
```

Pure visual hover, focus, highlight, or color change is not enough.

Issue code:

```text
missing_click_behavior
```

### 7.7 `interaction.clickableSelectors`

Selectors that the validator treats as clickable.

The default set should remain small:

```yaml
clickableSelectors:
  - "button"
  - "a[href]"
  - "[role='button']"
  - "[data-action]"
```

Codex may extend this list only if the validator supports the selector.

### 7.8 `interaction.allowedVisibleBehaviors`

A controlled vocabulary for valid click outcomes.

This list is used by:

```text
prompt builder
HTML validator
Codex SDK postprocessor
regeneration prompt builder
```

Allowed behavior names should be stable and implementation-facing.

Do not put prose here.

### 7.9 `interaction.forbiddenNoopPatterns`

Patterns that indicate fake or inert interactions.

Examples:

```text
href="#"
href="javascript:void(0)"
empty onclick
button without form or handler
role=button without handler
```

The validator should translate these into deterministic issues.

The postprocessor may repair them when safe.

### 7.10 `navigation.allowInventedGlobalNavigation`

When false, generated HTML must not add global navigation that is not present in the frozen blueprint.

The validator should compare visible navigation labels against:

```text
blueprint.ui.navigation.globalNavItems
page.primaryAction
page.secondaryActions
declared PageContract targets
```

Issue code:

```text
invented_navigation
```

### 7.11 `navigation.forbiddenInventedLabels`

A language-aware blacklist for commonly hallucinated navigation labels.

This is not a product taxonomy.

It is a guardrail against Stitch adding generic SaaS chrome.

Examples:

```text
dashboard
history
support
privacy policy
terms of service
contact
login
settings
```

If a label exists in the frozen blueprint, it is not considered invented.

Blueprint content overrides the blacklist.

### 7.12 `navigation.sidebar.ifPresentMustBeConsistentAcrossPages`

When true, cross-page validation must compare sidebar models across all generated pages.

The sidebar should be consistent in:

```text
labels
order
destinations
```

The only allowed difference is active state, if:

```yaml
allowOnlyActiveStateDifference: true
```

Issue code:

```text
sidebar_inconsistent_across_pages
```

### 7.13 `navigation.sidebar.canonicalSource`

The source used to normalize or validate sidebar content.

Default:

```text
blueprint.ui.navigation.globalNavItems
```

If the blueprint has no global nav items, Codex should derive the canonical sidebar from page routes only when the page contracts explicitly require page-to-page navigation.

Do not invent a sidebar merely because the HTML has multiple pages.

### 7.14 `postprocess.codexAllowedFixes`

A whitelist of local HTML modifications that Codex SDK may perform after Stitch generation.

These are code-level fixes, not LLM semantic repairs.

Allowed fixes should be:

```text
localized
deterministic
safe
revalidatable
traceable
```

Examples:

```text
add_modal_for_unhandled_button
normalize_sidebar_across_pages
remove_or_disable_invented_navigation
convert_fake_link_to_button
```

Codex must persist a postprocess report for every applied fix.

### 7.15 `regeneration.stricterPromptRulesByIssueCode`

Extra prompt rules used when page regeneration is needed.

These rules are indexed by deterministic validation issue code.

Example:

```yaml
missing_click_behavior:
  - "Every button, link, and role=button element must visibly change the page state."
```

Regeneration should use the same frozen blueprint and PageContract.

Do not regenerate from raw input.

## 8. Required TypeScript schema

Codex should define a Zod schema matching the YAML.

Recommended shape:

```ts
const stitchUiConstraintsSchema = z.object({
  version: z.literal(1),

  promptRules: z.object({
    global: z.array(z.string()).default([])
  }).default({ global: [] }),

  html: z.object({
    requireVisibleRoot: z.boolean().default(true),
    requireHeading: z.boolean().default(true),
    forbidPrimaryUiAsImage: z.boolean().default(true),
    primaryUiImageIndicators: z.array(z.string()).default([])
  }).default({}),

  interaction: z.object({
    requireVisibleBehaviorForClickableElements: z.boolean().default(true),
    clickableSelectors: z.array(z.string()).default(["button", "a[href]", "[role='button']", "[data-action]"]),
    allowedVisibleBehaviors: z.array(z.string()).default([]),
    forbiddenNoopPatterns: z.array(z.string()).default([])
  }),

  navigation: z.object({
    allowInventedGlobalNavigation: z.boolean().default(false),
    forbiddenInventedLabels: z.array(z.string()).default([]),
    sidebar: z.object({
      ifPresentMustBeConsistentAcrossPages: z.boolean().default(true),
      canonicalSource: z.string().default("blueprint.ui.navigation.globalNavItems"),
      compare: z.array(z.enum(["labels", "order", "destinations"])).default(["labels", "order", "destinations"]),
      allowOnlyActiveStateDifference: z.boolean().default(true)
    }).default({})
  }),

  postprocess: z.object({
    codexAllowedFixes: z.array(z.string()).default([])
  }).default({ codexAllowedFixes: [] }),

  regeneration: z.object({
    stricterPromptRulesByIssueCode: z.record(z.array(z.string())).default({})
  }).default({ stricterPromptRulesByIssueCode: {} })
});
```

## 9. Prompt builder consumption

Codex should inject only the relevant YAML rules into Stitch prompts.

Every prompt should include:

```text
promptRules.global
html.forbidPrimaryUiAsImage
interaction.requireVisibleBehaviorForClickableElements
navigation.allowInventedGlobalNavigation
navigation.sidebar consistency rule, when multiple pages exist or page navigation is present
```

Do not dump the entire YAML into the prompt.

Generate concise prompt sections such as:

```text
Global UI constraints:
- Use real HTML elements for all primary UI.
- Every clickable element must produce a visible interaction.
- Do not invent navigation, pages, support links, legal links, auth, payment, or dashboards.

Interaction constraints:
- Buttons and links must open a modal, drawer, toast, inline feedback state, submit/reset a form, navigate to a declared page, or switch a declared tab.
- Hover/focus/highlight alone does not count as interaction.

Navigation constraints:
- Do not add global navigation unless present in the frozen blueprint.
- If a sidebar appears across pages, keep labels, order, and destinations identical.
```

## 10. HTML validator consumption

The validator should split checks into:

```text
single-page checks
cross-page checks
```

### 10.1 Single-page checks

Single-page validation should check:

```text
html_empty
html_missing_visible_root
html_missing_heading
missing_primary_action
missing_secondary_action
missing_feedback_surface
missing_recovery_surface
ui_as_image_violation
missing_click_behavior
invented_navigation
```

### 10.2 Cross-page checks

Cross-page validation should check:

```text
sidebar_inconsistent_across_pages
global_navigation_inconsistent_across_pages
declared_page_destination_missing
```

Cross-page validation should run only after all page HTML artifacts are available.

## 11. Click behavior validation

Codex should not accept decorative-only click targets.

A clickable element passes when one of these is true:

```text
inside a form and type=submit
has a non-empty event handler
has a data-action that the postprocessor or runtime recognizes
targets a declared page route
controls a modal/dialog/drawer via aria-controls or data-target
toggles an element via data-toggle or equivalent
```

A clickable element fails when:

```text
href="#"
href="javascript:void(0)"
empty onclick
button has no form context and no handler
role=button has no handler
link points to invented route
only visual hover/highlight behavior exists
```

Issue code:

```text
missing_click_behavior
```

## 12. Codex SDK postprocess responsibilities

Codex SDK postprocess should be allowed to fix code-verifiable HTML issues.

It may:

```text
add modal behavior to unhandled buttons
add toast behavior to feedback actions
add inline success/error states
add form submit/reset behavior
add toggle behavior for expandable panels
normalize sidebar markup across pages
remove invented navigation
convert fake links to buttons
add data-action attributes
```

It must not:

```text
change product scope
add new user flows
add new pages
add auth/payment/collaboration/integrations
reinterpret raw input
rewrite the entire page for style reasons
```

Every postprocess run must produce a report:

```ts
type StitchHtmlPostprocessReport = {
  id: string;
  sessionId: string;
  blueprintId: string;
  pageIds: string[];
  sourceIssueCodes: string[];
  appliedFixes: string[];
  changedFilesOrArtifacts: string[];
  rejectedFixes: {
    fix: string;
    reason: string;
  }[];
  createdAt: string;
};
```

## 13. Sidebar consistency

Sidebar consistency must be validated across pages.

Codex should extract a sidebar model:

```ts
type ExtractedSidebarModel = {
  pageId: string;
  labels: string[];
  destinations: string[];
  activeLabel?: string;
};
```

Validation rule:

```text
labels must match
order must match
destinations must match
only activeLabel may differ
```

If inconsistent, Codex may normalize all sidebars using the canonical source.

If no canonical source exists, Codex should fail with diagnostics rather than inventing one.

Issue code:

```text
sidebar_inconsistent_across_pages
```

## 14. Navigation invention policy

Generated HTML must not invent generic SaaS chrome.

Examples of commonly invented navigation:

```text
Dashboard
History
Support
My Quotes
Privacy Policy
Terms of Service
Contact
Login
Settings
```

These labels are allowed only if they appear in the frozen blueprint.

Blueprint override rule:

```text
If a forbiddenInventedLabel is explicitly present in frozen ProductBlueprintV1,
it is not considered invented.
```

## 15. Regeneration policy

Regeneration is allowed only when deterministic validation fails and Codex SDK postprocess cannot safely fix the issue.

Regeneration must use:

```text
same frozen ProductBlueprintV1
same PageContract
same source pageId
additional stricterPromptRulesByIssueCode
```

Regeneration must not use raw input.

Regeneration must not ask the LLM to patch an existing page.

Preferred flow:

```text
Stitch generate
  -> validate
  -> Codex SDK postprocess if allowed and safe
  -> revalidate
  -> regenerate from PageContract if still failing and retry budget remains
  -> fail with diagnostics
```

## 16. File naming

Use:

```text
src/stitch/constraints/stitch-ui-constraints.yaml
```

Do not use:

```text
app-archetypes.yaml
```

The name should reflect behavior constraints, not app categories.

## 17. Implementation checklist for Codex

Codex should implement in this order:

```text
1. Rename or replace app-archetypes.yaml with stitch-ui-constraints.yaml.
2. Remove archetype-specific YAML shape.
3. Add stitch-ui-constraints loader with Zod schema.
4. Update Stitch prompt builder to consume promptRules/global, interaction, navigation, and html rules.
5. Update single-page HTML validator to consume html and interaction constraints.
6. Add invented navigation validation.
7. Add click behavior validation.
8. Add cross-page sidebar consistency validation.
9. Add Codex SDK postprocess stage.
10. Add postprocess reports.
11. Add regeneration prompt tightening by issue code.
12. Add tests for each deterministic issue code.
```

## 18. Required tests

Add tests for:

```text
YAML schema parses valid constraints
unsupported YAML version fails
prompt builder includes global clickable behavior rule
prompt builder includes no invented navigation rule
HTML validator flags href="#"
HTML validator flags button without form or handler
HTML validator accepts form submit button
HTML validator accepts button with modal behavior
HTML validator flags invented dashboard/history/support navigation
HTML validator allows forbidden label when it exists in frozen blueprint
cross-page validator flags inconsistent sidebar labels
cross-page validator flags inconsistent sidebar order
cross-page validator allows active state difference
postprocessor adds modal behavior for safe unhandled button
postprocessor normalizes sidebar across pages from canonical source
regeneration prompt includes stricter rules by issue code
```

## 19. Summary

`stitch-ui-constraints.yaml` should stay small.

Its job is to enforce universal, code-verifiable UI behavior constraints:

```text
real HTML
real click behavior
no invented navigation
consistent sidebar
safe Codex SDK postprocessing
bounded regeneration
```

Do not reintroduce app archetypes.

Do not grow the file into a product-specific design system.

The best version of this YAML is not the most descriptive one.

The best version is the one that Codex can reliably load, validate, enforce, repair, and test.
