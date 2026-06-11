Task ID: TASK-001
Status: completed
Summary of implementation: Added narrow Stitch generation runtime configuration under `stitchGeneration` in Stitch UI constraints, added a small config reader exposing default `single` mode and explicit opt-in gating for `candidate-search`, and added contract tests covering default disablement, explicit experimental gating, and bounded budget fields.
Files changed:
- src/stitch/constraints/stitch-ui-constraints.yaml
- src/stitch/constraints/load-stitch-ui-constraints.ts
- src/stitch/config/read-stitch-generation-config.ts
- src/blueprint/index.ts
- src/stitch/postprocess/postprocess-stitch-html.ts
- tests/stitch-candidate-search.test.ts
Validation commands run:
- npm run build
- npm test
Validation result:
- Passed. `npm run build` completed successfully.
- Passed. `npm test` completed successfully with 64/64 tests passing.
Blockers or follow-up notes:
- The default sandbox helper failed repeatedly with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`, so file edits and validation commands were rerun with escalated permissions. This did not block repository validation once rerun outside that helper.

Task ID: TASK-002
Status: completed
Summary of implementation: Added schema-backed candidate prompt plan, candidate attempt, candidate run, candidate selection report, rejected candidate report, and selected candidate manifest contracts. Extended artifact type support so these candidate lineage artifacts can be persisted through the existing repository. Updated local candidate-search validation tests to match the current generation config contract (`mode: "candidate"`, `postprocess.allowedFixes`).
Files changed:
- src/blueprint/types/blueprint.ts
- src/blueprint/schemas/blueprint.ts
- src/stitch/postprocess/postprocess-stitch-html.ts
- tests/blueprint.test.ts
- tests/stitch-candidate-search.test.ts
Validation commands run:
- npm run build
- npm test
Validation result:
- Passed. `npm run build` completed successfully.
- Passed. `npm test` completed successfully with 66/66 tests passing.
Blockers or follow-up notes:
- After `git pull`, the execution spine changed the generation-config contract from the earlier `experimentalCandidateSearch.enabled` shape to `mode: "candidate"` in `src/stitch/config/stitch-generation-config.yaml`, and the postprocess allowlist field is now `postprocess.allowedFixes`. The implementation and tests were aligned to the updated contract only.
