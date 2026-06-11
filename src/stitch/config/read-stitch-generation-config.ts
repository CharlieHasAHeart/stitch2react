import { loadStitchUiConstraints, type StitchUiConstraints } from "../constraints/load-stitch-ui-constraints.js";

export type StitchGenerationMode = "single" | "candidate-search";

export type StitchCandidateSearchConfig = {
  enabled: boolean;
  candidatesPerPage: number;
  maxRepromptAttempts: number;
  maxCandidatesPerReprompt: number;
};

export type StitchGenerationConfig = {
  mode: StitchGenerationMode;
  experimentalCandidateSearch: StitchCandidateSearchConfig;
};

export function readStitchGenerationConfig(
  constraints: StitchUiConstraints = loadStitchUiConstraints()
): StitchGenerationConfig {
  return constraints.stitchGeneration;
}

export function isCandidateSearchEnabled(
  constraints: StitchUiConstraints = loadStitchUiConstraints()
): boolean {
  const config = readStitchGenerationConfig(constraints);
  return config.mode === "candidate-search" && config.experimentalCandidateSearch.enabled;
}
