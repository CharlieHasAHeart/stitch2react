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

Task ID: TASK-003
Status: completed
Summary of implementation: Added reusable candidate hard-gate utilities for documented hard-failure issue codes and deterministic soft-score helpers that rank only hard-gate-passing attempts. Added focused candidate-search tests proving hard-gate failures are ineligible and soft scores only affect already-eligible attempts.
Files changed:
- src/stitch/candidate-search/hard-gates.ts
- src/stitch/candidate-search/soft-scores.ts
- src/blueprint/index.ts
- tests/stitch-candidate-search.test.ts
Validation commands run:
- npm run build
- npm test
Validation result:
- Passed. `npm run build` completed successfully.
- Passed. `npm test` completed successfully with 69/69 tests passing.
Blockers or follow-up notes:
- Soft-score behavior is intentionally deterministic and rule-based at this stage; no visual or screenshot scoring was introduced.

Task ID: TASK-034
Status: completed
Summary of implementation: Tightened candidate ranking contracts by moving deterministic structural signal extraction and rule-based 0..1 scoring into `soft-scores.ts`, restricting soft score keys to the fixed seven-key contract, switching total score to an average, enforcing fail-fast ranking for ineligible attempts, and stabilizing tie-breakers by total score, candidateIndex, then attemptId. Also aligned candidate schemas/types so attempt softScores use the fixed candidate soft-score shape.
Files changed:
- src/stitch/candidate-search/soft-scores.ts
- src/stitch/candidate-search/hard-gates.ts
- src/blueprint/types/blueprint.ts
- src/blueprint/schemas/blueprint.ts
- tests/stitch-candidate-search.test.ts
Validation commands run:
- npm run build
- npm test
Validation result:
- Passed. `npm run build` completed successfully.
- Passed. `npm test` completed successfully with 71/71 tests passing.
Blockers or follow-up notes:
- This task was completed before TASK-004 because the updated execution spine and candidate-stage documentation expanded TASK-034 into the contract owner for deterministic HTML signal extraction and strict ranking behavior required by downstream candidate orchestration.

Task ID: TASK-035
Status: completed
Summary of implementation: Hardened candidate soft-score schemas and implementation details by constraining persisted score values to finite 0..1 numbers, removing ignored soft-score inputs, scoring navigation against resolved route targets only, preserving unresolved navigation as visible disallowed evidence, preventing component_clarity from reaching 1.0 without positive required-component evidence, and requiring exact bucket values 0/0.5/1 in deterministic score construction.
Files changed:
- src/stitch/candidate-search/soft-scores.ts
- src/blueprint/schemas/blueprint.ts
- tests/stitch-candidate-search.test.ts
Validation commands run:
- npm run build
- npm test
Validation result:
- passed (`npm run build`)
- passed (`npm test`, 75/75 tests)
Blockers or follow-up notes:
- Navigation soft scoring now treats slash-prefixed `targetPageId` values as resolved routes and keeps non-route targets visible as unresolved/disallowed evidence until a later task introduces explicit page-id-to-route resolution.
