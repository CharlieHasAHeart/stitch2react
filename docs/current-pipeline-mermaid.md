# Current Pipeline Mermaid

This document shows the current default pipeline at a high level.

The default blueprint path remains deterministic after first-pass generation. Stitch HTML generation now adds Chrome DevTools MCP runtime validation before React handoff.

## Full Default Pipeline

```mermaid
flowchart TD
  A["One-shot raw input"] --> B["Generate ProductBlueprintV1"]
  B --> C["Deterministic validation"]
  C --> D{"Valid?"}
  D -->|No| E["Local deterministic repair"]
  E --> C
  D -->|Yes| F["Local static quality checks"]
  F --> G{"Freeze eligible?"}
  G -->|No| Z["Fail with diagnostics"]
  G -->|Yes| H["Freeze ProductBlueprintV1"]

  H --> I["Build Stitch prompt plan"]
  I --> J["Build page-level Stitch prompts"]
  J --> K["Generate Stitch HTML per page"]
  K --> L["Static HTML validation"]
  L --> M["Chrome DevTools MCP runtime validation"]
  M --> N["Cross-page navigation/sidebar validation"]
  N --> O{"HTML valid?"}
  O -->|Yes| P["Capture screenshots"]
  P --> Q["React handoff"]
  O -->|Code-fixable| R["Codex SDK HTML postprocess"]
  R --> L
  O -->|Not code-fixable| S["Regenerate page from frozen PageContract"]
  S --> K
  O -->|Attempts exhausted| Z
```

## Stitch HTML Runtime Validation Detail

```mermaid
flowchart TD
  A["stitch_html artifact"] --> B["Open page in Chrome DevTools MCP"]
  B --> C["Collect visible DOM, URL, console, resources"]
  C --> D["Find clickable elements"]
  D --> E["Click each allowed target"]
  E --> F{"Meaningful visible effect?"}
  F -->|No| G["missing_runtime_click_behavior"]
  F -->|Yes| H["Record interaction evidence"]
  C --> I["Extract nav/sidebar model"]
  I --> J["Compare with frozen blueprint and other pages"]
  J --> K{"Navigation valid?"}
  K -->|No| L["navigation/sidebar issue"]
  K -->|Yes| M["Runtime validation passed"]
```

## Default Behavior

- Default blueprint generation does not use LLM repair.
- Stitch generation is page-by-page from the frozen blueprint.
- Static HTML validation catches obvious structure issues.
- Chrome DevTools MCP validates real click behavior, rendered page health, console/runtime errors, and navigation behavior.
- Codex SDK postprocess may fix code-verifiable HTML issues, then validation must run again.

## Stitch HTML Runtime Validation Path

```mermaid
flowchart TD
  A["Frozen ProductBlueprintV1"] --> B["Build page-level Stitch prompt"]
  B --> C["Generate Stitch HTML"]
  C --> D["Static HTML validation"]
  D --> E["Chrome DevTools MCP runtime validation"]
  E --> F["Cross-page navigation/sidebar validation"]
  F --> G{"Code-fixable issues?"}
  G -->|Yes| H["Codex SDK postprocess"]
  H --> D
  G -->|No issues| I["Persist validated Stitch artifacts"]
  G -->|Not fixable| J{"Retry budget left?"}
  J -->|Yes| B
  J -->|No| K["Fail with diagnostics"]
```
