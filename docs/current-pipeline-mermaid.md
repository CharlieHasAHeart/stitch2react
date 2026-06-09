# Current Pipeline Mermaid

This document shows the current intended pipeline at a high level.

For detailed stage rules, read:

```text
docs/productblueprintv1-generation-pipeline-design.md
docs/stitch-html-generation-pipeline-design.md
docs/stitch-ui-constraints-yaml-design.md
docs/stitch-html-validation-design.md
docs/stitch-html-postprocess-design.md
```

## End-to-end pipeline

```mermaid
flowchart TD
  A["User one-shot input"] --> B["Generate ProductBlueprintV1"]
  B --> C["Deterministic blueprint validation"]
  C --> D{"Valid?"}
  D -->|No| E["Deterministic blueprint repair"]
  E --> C
  D -->|Yes| F["Local code-verifiable quality checks"]
  F --> G{"Freeze eligible?"}
  G -->|No| Z["Fail with diagnostics"]
  G -->|Yes| H["Freeze ProductBlueprintV1"]

  H --> I["Build Stitch prompt plan"]
  I --> J["Build page-level Stitch prompts"]
  J --> K["Generate Stitch HTML per page"]
  K --> L["Single-page HTML validation"]
  L --> M{"Code-fixable?"}
  M -->|Yes| N["Codex SDK HTML postprocess"]
  N --> L
  M -->|No and retry left| O["Regenerate page with stricter prompt"]
  O --> K
  M -->|No retry left| Z
  L -->|Passed| P["Cross-page validation"]
  P --> Q{"Cross-page valid?"}
  Q -->|No and code-fixable| R["Codex SDK cross-page postprocess"]
  R --> P
  Q -->|No and not fixable| Z
  Q -->|Yes| S["Capture screenshots"]
  S --> T["React handoff"]
```

## Default blueprint pipeline

```mermaid
flowchart TD
  A["rawInput"] --> B["input_understanding"]
  B --> C["product_frame"]
  C --> D["domain_modeling"]
  D --> E["flow_modeling"]
  E --> F["domain_flow_consistency gate"]
  F --> G["ui_modeling"]
  G --> H["flow_ui_coverage gate"]
  H --> I["policy_uncertainty"]
  I --> J["blueprint_assembly"]
  J --> K["validateBlueprint"]
  K --> L{"Validation failure?"}
  L -->|Yes| M["repairBlueprint deterministic local repair"]
  M --> K
  L -->|No| N["reviewBlueprintQuality local static checks"]
  N --> O{"Blocker/high issue?"}
  O -->|Yes| Z["Fail session"]
  O -->|No| P["Freeze blueprint"]
```

## Default Stitch HTML pipeline

```mermaid
flowchart TD
  A["Frozen ProductBlueprintV1"] --> B["Build StitchPromptPlan"]
  B --> C["For each PageContract"]
  C --> D["Build StitchPagePrompt"]
  D --> E["Generate Stitch HTML"]
  E --> F["Validate single-page HTML"]
  F --> G{"Issues?"}
  G -->|No| H["Persist validated page"]
  G -->|Yes and code-fixable| I["Codex SDK postprocess"]
  I --> F
  G -->|Yes and not fixable but retry left| J["Regenerate page with stricter prompt"]
  J --> E
  G -->|Yes and no retry| Z["Fail with diagnostics"]
  H --> K{"All pages done?"}
  K -->|No| C
  K -->|Yes| L["Cross-page validation"]
  L --> M{"Sidebar/navigation consistent?"}
  M -->|No and fixable| N["Normalize sidebar/navigation"]
  N --> L
  M -->|No and not fixable| Z
  M -->|Yes| O["Screenshot + React handoff"]
```

## Default disabled paths

By default, the pipeline does not run LLM repair.

Disabled unless explicitly experimental:

```text
flow_quality_review
ui_contract_review
semantic_quality_review
blueprint_repair LLM stage
quality_repair LLM stage
LLM HTML patch repair
```

Default repair is deterministic and code-verifiable.
