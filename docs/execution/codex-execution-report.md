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
