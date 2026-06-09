# AGENTS.md

## Purpose

This repository implements a one-shot product understanding and generation pipeline.

The system converts one user input into a frozen `ProductBlueprintV1`, then uses that frozen blueprint as the only source of truth for downstream Stitch HTML, screenshots, and validation work. React, mock data, API, and state-generation are future directions, not the current implementation priority.

## Required Reading Order

1. `docs/productblueprintv1-type-definitions.md`
2. `docs/productblueprintv1-generation-pipeline-design.md`
3. `docs/stitch-html-generation-pipeline-design.md`
4. `docs/stitch-ui-constraints-yaml-design.md`
5. `docs/stitch-html-validation-design.md`
6. `docs/stitch-html-postprocess-design.md`
7. `docs/current-pipeline-mermaid.md`

## Non-negotiable Rules

- One user input only.
- Frozen `ProductBlueprintV1` is the downstream source of truth.
- Do not generate Stitch directly from raw input. React is a future direction and is not part of the current required pipeline.
- Flow modeling happens before page modeling.
- Default blueprint repair must be deterministic; do not use LLM repair in the default path.

## Stitch HTML Rules

Stitch generation starts only after blueprint freeze.

```text
frozen ProductBlueprintV1
  -> PageContract
  -> Stitch prompt
  -> Stitch HTML
  -> static validation
  -> Chrome DevTools MCP runtime validation
  -> Codex SDK postprocess when code-fixable
  -> re-validation
  -> screenshot
  -> persist validated Stitch artifacts
```

## Chrome DevTools MCP Runtime Validation

Codex must use Chrome DevTools MCP, or a compatible runtime validation backend, for checks that static HTML parsing cannot prove.

Required runtime checks:

```text
page is not blank
main content is visible
console has no blocking runtime errors
resources are not broken in a UI-blocking way
every clickable element has a meaningful visible effect
navigation targets are declared
sidebars/global navigation are consistent across pages
```

A clickable element passes only if runtime validation observes a meaningful visible effect:

```text
modal opens
drawer opens
panel toggles
toast appears
inline feedback appears
form submits/resets
route changes to declared page
declared tab switches
```

Focus, hover, active styling, or color-only changes do not count.

## Codex SDK Postprocess

Codex SDK may fix local, code-verifiable HTML issues using validation evidence.

Allowed fixes:

```text
add modal/toast/drawer/toggle behavior
add form submit/reset behavior
normalize sidebar across pages
remove invented navigation
convert fake links to buttons
patch deterministic local script errors
```

Forbidden fixes:

```text
add new product scope
add new pages or flows
add login/payment/collaboration/integrations
reinterpret raw input
change the frozen blueprint
hide validation failures without fixing them
```

Postprocess must persist a report and must be followed by static and runtime re-validation.
