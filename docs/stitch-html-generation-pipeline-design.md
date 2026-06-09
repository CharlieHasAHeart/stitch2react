# Stitch HTML Generation Pipeline Design

## Purpose

This pipeline converts a frozen `ProductBlueprintV1` into validated Stitch HTML artifacts and screenshots. React handoff is a future direction and is not part of the current required implementation scope.

## Default Pipeline

```text
frozen ProductBlueprintV1
  -> Stitch prompt plan
  -> page-level Stitch prompts
  -> page-level Stitch HTML
  -> static HTML validation
  -> Chrome DevTools MCP runtime validation
  -> cross-page navigation/sidebar validation
  -> Codex SDK postprocess when code-fixable
  -> re-validation
  -> screenshots
  -> persist validated Stitch artifacts
```

## Source of Truth

Stitch generation must consume only the frozen blueprint.

Do not use raw user input to generate or repair Stitch HTML.

## Page-by-page Generation

Default Stitch generation is page-level:

```text
one PageContract -> one Stitch prompt -> one Stitch HTML artifact
```

This keeps validation and postprocess scoped and traceable.

## Runtime Validation Requirement

Chrome DevTools MCP is required for runtime checks that static parsing cannot prove:

```text
real click behavior
rendered page is not blank
console/runtime errors
broken resources
modal/toast/drawer/toggle behavior
navigation destination validity
cross-page sidebar consistency
```

A clickable element passes only when runtime validation observes a meaningful visible effect.

Focus, hover, color change, or active style alone does not count.

## Codex SDK Postprocess

Codex SDK may perform local deterministic HTML fixes when validation evidence is clear.

Allowed examples:

```text
add modal behavior to an unhandled button
add toast or inline feedback for feedback actions
add form submit/reset behavior
normalize sidebars across pages
remove invented navigation
convert fake links to local buttons
```

Postprocess must write a report and must be followed by static and runtime re-validation.

## Regeneration Policy

If postprocess cannot safely fix the issue, regenerate the affected page from the same frozen PageContract using stricter prompt rules derived from validation issue codes.

Do not ask an LLM to patch the existing HTML in the default path.

## Future React Direction

React generation is a future downstream direction.

It must not shape the current implementation boundary.

For now, the required output of this pipeline is validated Stitch HTML artifacts, reports, and screenshots.
