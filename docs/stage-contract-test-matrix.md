# Stage Contract Test Matrix

| Contract | Source doc | Test location |
|---|---|---|
| Default blueprint path does not use LLM repair | `docs/blueprint-stage.md` | `tests/blueprint.test.ts` (`does not use llm review or llm repair stages in the default pipeline`) |
| Stitch prompt does not use raw input directly | `docs/stitch2html-stage.md` | `tests/blueprint.test.ts` (`stitch prompt does not use raw input directly`) |
| Default Stitch generation remains single-candidate | `docs/stitch2html-stage.md` | `tests/blueprint.test.ts` (`default stitch generation creates one prompt per page`) |
| Candidate search is disabled by default | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`candidate search is disabled by default`) |
| Candidate search preserves frozen blueprint as sole product source | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`candidate search does not consume raw input`) |
| Candidate search creates bounded candidates from PromptPlan | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`candidate search creates bounded prompt plans`) |
| Candidate with hard gate failures cannot be selected | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`does not select candidate with hard gate failure`) |
| Soft visual score cannot override hard gate failure | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`soft score cannot override hard gate failure`) |
| Rejected candidates persist rejection reasons | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`persists rejected candidate diagnostics`) |
| Targeted reprompt uses issue codes, not raw input | `docs/stitch-candidate-search-stage.md` | `tests/stitch-candidate-search.test.ts` (`targeted reprompt uses issue codes only`) |
| No HTML regeneration after validation failure in default path | `docs/validation-repair-stage.md` | `tests/blueprint.test.ts` (`does not call Stitch again after postprocess validation failure`) |
| Deprecated issue codes are rejected at the contract boundary | `docs/validation-repair-stage.md` | `tests/blueprint.test.ts` (`rejects deprecated cross-page issue codes at the contract boundary`) |
| Postprocess fix requires issue routing and enabled allowlist | `docs/validation-repair-stage.md` | `tests/blueprint.test.ts` (`postprocess does not apply a routed fix when YAML disables it`) |
| Runtime evidence is structured and contains no screenshot artifact ids | `docs/validation-repair-stage.md` | `tests/blueprint.test.ts` (`runtime evidence is structured and does not include screenshot artifacts`) |
| Generation-only module does not perform validation/postprocess | `docs/stitch2html-stage.md` | `tests/blueprint.test.ts` (`generation-only module does not call validation or postprocess`) |
| Validation module does not call Stitch generation in default path | `docs/validation-repair-stage.md` | `tests/blueprint.test.ts` (`validation module does not call Stitch generation client`) |
