# ProductBlueprintV1 Generation Pipeline Design

## Scope

This document covers only the pipeline that turns one raw user input into a frozen `ProductBlueprintV1`.

Downstream Stitch HTML generation is defined in:

```text
docs/stitch-html-generation-pipeline-design.md
docs/stitch-html-validation-design.md
docs/stitch-html-postprocess-design.md
docs/stitch-ui-constraints-yaml-design.md
```

## Blueprint Default Path

```text
rawInput
  -> first-pass typed LLM generation
  -> deterministic validation
  -> local deterministic repair when code-verifiable
  -> local static quality checks
  -> freeze ProductBlueprintV1
```

## Non-negotiable Rules

1. The user gives one input only.
2. Do not ask follow-up questions.
3. Explicit user facts beat inferred/defaulted facts.
4. Flow modeling happens before page modeling.
5. The final frozen blueprint is the source of truth for downstream Stitch work. React remains a future direction, not current priority scope.
6. Default blueprint repair must not call LLM repair.
7. If deterministic repair cannot safely fix the blueprint, fail with diagnostics or regenerate the affected stage under a stricter generation contract.

## Downstream Handoff Contract

After freeze, downstream systems receive:

```ts
type BlueprintHandoff = {
  sessionId: string;
  blueprintId: string;
  frozenBlueprint: ProductBlueprintV1;
};
```

Downstream systems must not reinterpret raw input.

Correct:

```text
frozen ProductBlueprintV1 -> PageContract -> Stitch prompt -> Stitch HTML
```

Incorrect:

```text
rawInput -> Stitch prompt
rawInput -> future React project work
```

## Stitch Validation Boundary

The blueprint pipeline does not validate generated HTML.

HTML validation, runtime click validation, navigation/sidebar validation, and Codex SDK postprocess belong to the Stitch pipeline.

The only blueprint responsibility is to provide enough structured contract information for those downstream checks:

```text
ui.pages
ui.navigation
flows
feedback surfaces
recovery surfaces
completion signals
visualPolicy.imageUsage.forbidUiAsImage
generationPolicy.stitchGenerationRules
```

---

## Downstream Stitch validation note

After blueprint freeze, Stitch generation and validation are governed by the Stitch documentation.

The blueprint pipeline does not validate runtime HTML behavior.

Downstream Stitch validation should use:

```text
static HTML validation
Chrome DevTools MCP runtime validation
Codex SDK deterministic postprocess
cross-page navigation/sidebar validation
```

The frozen blueprint remains the source of truth.
