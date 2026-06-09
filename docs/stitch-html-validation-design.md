# Stitch HTML Validation Design

## 1. Purpose

This document defines deterministic validation for Stitch-generated HTML.

Validation consumes:

```text
frozen ProductBlueprintV1
PageContract
Stitch HTML artifact
stitch-ui-constraints.yaml
```

## 2. Single-page validation

Run after each page HTML is generated.

Required issue codes:

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

## 3. Click behavior validation

Every clickable element must produce visible behavior.

Clickable elements:

```text
button
a[href]
[role='button']
[data-action]
```

Valid behavior:

```text
form submit/reset
modal/drawer/toggle
toast or inline feedback
declared page navigation
declared tab switch
```

Invalid behavior:

```text
href="#"
javascript:void(0)
empty onclick
button without form or handler
role=button without handler
visual highlight only
```

Issue code:

```text
missing_click_behavior
```

## 4. Invented navigation validation

Generated HTML must not add global navigation absent from the frozen blueprint.

Compare visible navigation labels against:

```text
blueprint.ui.navigation.globalNavItems
PageContract primary/secondary actions
declared page targets
```

Issue code:

```text
invented_navigation
```

Blueprint override rule:

```text
If a label appears explicitly in the frozen blueprint, it is allowed.
```

## 5. UI-as-image validation

Primary UI must not be an image.

Flag when the page relies on images but lacks expected real UI elements:

```text
button
input
form
label
textarea
select
main text sections
```

Issue code:

```text
ui_as_image_violation
```

## 6. Cross-page validation

Run after all page HTML artifacts exist.

Required issue codes:

```text
sidebar_inconsistent_across_pages
global_navigation_inconsistent_across_pages
declared_page_destination_missing
```

## 7. Sidebar consistency

Extract from each page:

```text
labels
order
destinations
active state
```

Validation rule:

```text
labels must match
order must match
destinations must match
only active state may differ
```

If a canonical sidebar exists in `blueprint.ui.navigation.globalNavItems`, validate against it.

If no canonical source exists, do not invent one.

## 8. Validation output

Persist reports:

```text
StitchHtmlValidationReport
StitchCrossPageValidationReport
```

Reports must include:

```text
id
sessionId
blueprintId
pageId or pageIds
htmlArtifactId or htmlArtifactIds
passed
issues
createdAt
```
