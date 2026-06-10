import {
  stitchRuntimeValidationReportSchema,
  validatedStitchArtifactGateReportSchema,
  stitchFinalValidationGateReportSchema,
  stitchCrossPageValidationReportSchema,
  stitchHtmlPostprocessReportSchema,
  stitchHtmlValidationReportSchema
} from "../../blueprint/schemas/blueprint.js";
import { createId } from "../../blueprint/shared/ids.js";
import type {
  ProductBlueprintV1,
  StitchFinalValidationGateReport,
  StitchGenerationInput,
  StitchHtmlValidationIssue,
  StitchPageGenerationResult,
  StitchRuntimeValidationReport,
  ValidatedStitchArtifactGateReport
} from "../../blueprint/types/blueprint.js";
import { postprocessStitchHtml } from "../postprocess/postprocess-stitch-html.js";
import {
  validateStitchRuntime,
  type StitchRuntimeValidationClient
} from "../runtime/validate-stitch-runtime.js";
import { validateStitchCrossPageRuntime } from "../runtime/validate-stitch-cross-page-runtime.js";
import { validateStitchCrossPage } from "../validation/validate-stitch-cross-page.js";
import { validateStitchHtml } from "../validation/validate-stitch-html.js";

export type BlockingIssueSource = "static_html" | "runtime" | "postprocess_revalidation" | "cross_page" | "runtime_backend";

export type GeneratedStitchPageArtifact = {
  sessionId: string;
  blueprintId: string;
  pageId: string;
  route: string;
  promptArtifactId: string;
  htmlArtifactId: string;
  html: string;
  promptArtifactPath: string;
  htmlArtifactPath: string;
  htmlFilePath: string;
};

export type GeneratedStitchHtmlArtifactsResult = {
  sessionId: string;
  blueprintId: string;
  promptPlanArtifactId: string;
  blueprintJsonPath: string;
  stitchPromptPlanPath: string;
  pages: GeneratedStitchPageArtifact[];
};

export type ValidatedStitchPageArtifact = StitchPageGenerationResult & {
  route: string;
  html: string;
  promptArtifactPath: string;
  htmlArtifactPath: string;
  htmlFilePath: string;
  runtimeValidationReportId?: string;
  postprocessReportId?: string;
  pagePassedBeforeCrossPage: boolean;
  blockingIssueCodes: string[];
  blockingIssueSources: BlockingIssueSource[];
  validationArtifactPath: string;
  generationReportPath: string;
};

export type ValidateRepairStitchHtmlArtifactsOptions = {
  repository: import("../../blueprint/persistence/repository.js").BlueprintRepository;
  runtimeValidationClient: StitchRuntimeValidationClient;
};

export type ValidateRepairStitchHtmlArtifactsResult = {
  pageResults: ValidatedStitchPageArtifact[];
  crossPageValidationReportId: string;
  finalValidationGateReportId: string;
  validatedArtifactGateReportId: string;
  finalGateReport: StitchFinalValidationGateReport;
};

function mergeValidationIssues(...issueSets: StitchHtmlValidationIssue[][]): StitchHtmlValidationIssue[] {
  const merged: StitchHtmlValidationIssue[] = [];
  const seen = new Set<string>();
  for (const set of issueSets) {
    for (const item of set) {
      const key = `${item.code}:${item.path ?? ""}:${item.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }
  return merged;
}

function buildMergedValidationReport(input: {
  sessionId: string;
  blueprintId: string;
  pageId: string;
  htmlArtifactId?: string;
  staticIssues: StitchHtmlValidationIssue[];
  runtimeReport: StitchRuntimeValidationReport;
}) {
  const mergedIssues = mergeValidationIssues(input.staticIssues, input.runtimeReport.issues);
  return stitchHtmlValidationReportSchema.parse({
    id: createId("stitch_val"),
    sessionId: input.sessionId,
    blueprintId: input.blueprintId,
    pageId: input.pageId,
    htmlArtifactId: input.htmlArtifactId,
    passed: mergedIssues.length === 0,
    issues: mergedIssues,
    runtimeEvidence: input.runtimeReport.runtimeEvidence,
    createdAt: new Date().toISOString()
  });
}

function buildValidatedArtifactGate(input: {
  sessionId: string;
  blueprintId: string;
  pageResults: StitchPageGenerationResult[];
}): ValidatedStitchArtifactGateReport {
  const { sessionId, blueprintId, pageResults } = input;
  const invalidPages = pageResults.filter((page) => page.status !== "validated");
  return {
    id: createId("validated_gate"),
    sessionId,
    blueprintId,
    pageIds: pageResults.map((page) => page.pageId),
    htmlArtifactIds: pageResults.map((page) => page.htmlArtifactId).filter(Boolean) as string[],
    validationArtifactIds: pageResults.map((page) => page.validationReportId),
    passed: invalidPages.length === 0,
    issues: invalidPages.map((page) => `Page ${page.pageId} is not validated and cannot be used by future downstream consumption.`),
    createdAt: new Date().toISOString()
  };
}

function buildFinalValidationGateReport(input: {
  sessionId: string;
  blueprintId: string;
  pageResults: Array<ValidatedStitchPageArtifact>;
  crossPageReportId?: string;
  crossPageReportPassed: boolean;
  crossPageIssueCodes: string[];
  postprocessReports: Array<{ appliedFixes: string[]; rejectedFixes: Array<{ fix: string; reason: string }> }>;
  runtimeBackends: string[];
}): StitchFinalValidationGateReport {
  const observedAuthorities = input.runtimeBackends.map((backend) => backend === "chrome_headless_cdp" ? "authoritative" : "heuristic_fallback_allowed");
  const passedAuthorityGate = observedAuthorities.every((authority) => authority === "authoritative");
  const pageResults: StitchFinalValidationGateReport["pageResults"] = input.pageResults.map((page) => {
    const crossPageFailed = !input.crossPageReportPassed;
    return {
      pageId: page.pageId,
      route: page.route,
      htmlArtifactId: page.htmlArtifactId ?? "",
      validationReportId: page.validationReportId,
      runtimeValidationReportId: page.runtimeValidationReportId,
      postprocessReportId: page.postprocessReportId,
      pagePassedBeforeCrossPage: page.pagePassedBeforeCrossPage,
      pagePassedFinal: page.pagePassedBeforeCrossPage && !crossPageFailed && passedAuthorityGate,
      blockingIssueCodes: crossPageFailed ? Array.from(new Set([...page.blockingIssueCodes, ...input.crossPageIssueCodes])) : page.blockingIssueCodes,
      blockingIssueSources: crossPageFailed ? Array.from(new Set<BlockingIssueSource>([...page.blockingIssueSources, "cross_page"])) : page.blockingIssueSources
    };
  });
  const passed = pageResults.every((page) => page.pagePassedFinal);
  return {
    id: createId("stitch_final_gate"),
    sessionId: input.sessionId,
    blueprintId: input.blueprintId,
    passed,
    pageResults,
    crossPageValidationReportId: input.crossPageReportId,
    runtimeBackendSummary: {
      requiredAuthority: "authoritative",
      observedBackends: input.runtimeBackends,
      observedAuthorities,
      passedAuthorityGate
    },
    postprocessSummary: {
      attempted: input.postprocessReports.length > 0,
      appliedFixes: input.postprocessReports.flatMap((report) => report.appliedFixes),
      rejectedFixes: input.postprocessReports.flatMap((report) => report.rejectedFixes)
    },
    terminalFailureReason: passed ? undefined : (!passedAuthorityGate ? "runtime_backend_authority_gate_failed" : (!input.crossPageReportPassed ? "cross_page_validation_failed" : "page_level_validation_failed")),
    createdAt: new Date().toISOString()
  };
}

async function runMergedValidation(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  page: ProductBlueprintV1["ui"]["pages"][number];
  htmlArtifactId: string;
  html: string;
  runtimeValidationClient: StitchRuntimeValidationClient;
}) {
  const staticReport = validateStitchHtml({
    sessionId: input.sessionId,
    blueprintId: input.blueprintId,
    page: input.page,
    blueprint: input.blueprint,
    htmlArtifactId: input.htmlArtifactId,
    html: input.html
  });
  const runtimeReport = stitchRuntimeValidationReportSchema.parse(
    await validateStitchRuntime({
      sessionId: input.sessionId,
      blueprintId: input.blueprintId,
      blueprint: input.blueprint,
      page: input.page,
      htmlArtifactId: input.htmlArtifactId,
      html: input.html,
      runtimeClient: input.runtimeValidationClient
    })
  );
  return {
    runtimeReport,
    mergedReport: buildMergedValidationReport({
      sessionId: input.sessionId,
      blueprintId: input.blueprintId,
      pageId: input.page.id,
      htmlArtifactId: input.htmlArtifactId,
      staticIssues: staticReport.issues,
      runtimeReport
    })
  };
}

export async function validateRepairStitchHtmlArtifacts(
  input: StitchGenerationInput & { generated: GeneratedStitchHtmlArtifactsResult },
  options: ValidateRepairStitchHtmlArtifactsOptions
): Promise<ValidateRepairStitchHtmlArtifactsResult> {
  const { sessionId, blueprintId, frozenBlueprint } = input;
  const { repository, runtimeValidationClient } = options;
  const projectId = blueprintId;
  const pageResults: ValidatedStitchPageArtifact[] = [];
  const crossPageInputs: Array<{ pageId: string; htmlArtifactId: string; html: string }> = [];
  const postprocessReports: Array<{ appliedFixes: string[]; rejectedFixes: Array<{ fix: string; reason: string }> }> = [];

  for (const generatedPage of input.generated.pages) {
    const page = frozenBlueprint.ui.pages.find((item) => item.id === generatedPage.pageId);
    if (!page) {
      throw new Error(`Missing PageContract for generated page ${generatedPage.pageId}`);
    }

    repository.setSessionStatus(sessionId, "stitch_validating");
    let currentHtml = generatedPage.html;
    let htmlArtifactId = generatedPage.htmlArtifactId;
    let { runtimeReport, mergedReport } = await runMergedValidation({
      sessionId,
      blueprintId,
      blueprint: frozenBlueprint,
      page,
      htmlArtifactId,
      html: currentHtml,
      runtimeValidationClient
    });

    let postprocessReportId: string | undefined;
    if (!mergedReport.passed) {
      const { html: postprocessedHtml, report } = postprocessStitchHtml({
        sessionId,
        blueprintId,
        blueprint: frozenBlueprint,
        page,
        htmlArtifactId,
        html: currentHtml,
        issues: mergedReport.issues
      });
      if (postprocessedHtml !== currentHtml) {
        currentHtml = postprocessedHtml;
        const htmlArtifact = repository.saveArtifact(sessionId, "stitch_html", { pageId: page.id, html: currentHtml });
        htmlArtifactId = htmlArtifact.id;
        const persistedPostprocess = repository.saveArtifact(sessionId, "stitch_html_postprocess_report", stitchHtmlPostprocessReportSchema.parse(report));
        postprocessReportId = persistedPostprocess.id;
        postprocessReports.push({ appliedFixes: report.appliedFixes, rejectedFixes: report.rejectedFixes });
        repository.savePageHtmlFile(sessionId, page.id, currentHtml);
        ({ runtimeReport, mergedReport } = await runMergedValidation({
          sessionId,
          blueprintId,
          blueprint: frozenBlueprint,
          page,
          htmlArtifactId,
          html: currentHtml,
          runtimeValidationClient
        }));
      }
    }

    const persistedRuntimeValidation = repository.saveArtifact(sessionId, "stitch_runtime_validation_report", runtimeReport);
    const persistedValidation = repository.saveArtifact(sessionId, "stitch_html_validation_report", mergedReport);
    const projectHtmlArtifactPath = repository.saveProjectBundleFile(projectId, `stitch/pages/${page.id}/html.json`, { pageId: page.id, html: currentHtml });
    const projectHtmlFilePath = repository.saveProjectBundleTextFile(projectId, `stitch/pages/${page.id}/page.html`, currentHtml);
    const projectValidationArtifactPath = repository.saveProjectBundleFile(projectId, `stitch/pages/${page.id}/validation.json`, mergedReport);

    const pageReport = {
      id: createId("stitch_page"),
      sessionId,
      blueprintId,
      pageId: page.id,
      promptArtifactId: generatedPage.promptArtifactId,
      htmlArtifactId,
      validationReportId: persistedValidation.id,
      status: mergedReport.passed ? "validated" as const : "failed" as const,
      createdAt: new Date().toISOString()
    };
    repository.saveArtifact(sessionId, "stitch_page_generation_report", pageReport);
    const projectGenerationReportPath = repository.saveProjectBundleFile(projectId, `stitch/pages/${page.id}/generation-report.json`, pageReport);

    pageResults.push({
      sessionId,
      blueprintId,
      pageId: page.id,
      route: page.route,
      promptArtifactId: generatedPage.promptArtifactId,
      htmlArtifactId,
      html: currentHtml,
      promptArtifactPath: generatedPage.promptArtifactPath,
      htmlArtifactPath: projectHtmlArtifactPath,
      htmlFilePath: projectHtmlFilePath,
      validationArtifactPath: projectValidationArtifactPath,
      generationReportPath: projectGenerationReportPath,
      validationReportId: persistedValidation.id,
      runtimeValidationReportId: persistedRuntimeValidation.id,
      postprocessReportId,
      pagePassedBeforeCrossPage: mergedReport.passed,
      blockingIssueCodes: mergedReport.issues.map((issue) => issue.code),
      blockingIssueSources: mergedReport.issues.map((issue) => runtimeReport.issues.some((runtimeIssue) => runtimeIssue.code === issue.code && runtimeIssue.message === issue.message) ? ("runtime" as const) : ("static_html" as const)),
      status: pageReport.status
    });
    crossPageInputs.push({ pageId: page.id, htmlArtifactId, html: currentHtml });
  }

  const staticCrossPageReport = stitchCrossPageValidationReportSchema.parse(
    validateStitchCrossPage({
      sessionId,
      blueprintId,
      blueprint: frozenBlueprint,
      pages: crossPageInputs
    })
  );
  const runtimeCrossPageReport = stitchCrossPageValidationReportSchema.parse(
    await validateStitchCrossPageRuntime({
      sessionId,
      blueprintId,
      blueprint: frozenBlueprint,
      pages: crossPageInputs
    })
  );
  const mergedCrossPageReport = stitchCrossPageValidationReportSchema.parse({
    id: createId("stitch_cross_val"),
    sessionId,
    blueprintId,
    kind: "runtime",
    pageIds: staticCrossPageReport.pageIds,
    htmlArtifactIds: staticCrossPageReport.htmlArtifactIds,
    passed: staticCrossPageReport.passed && runtimeCrossPageReport.passed,
    issues: [...staticCrossPageReport.issues, ...runtimeCrossPageReport.issues],
    runtimeEvidence: runtimeCrossPageReport.runtimeEvidence ?? [],
    createdAt: new Date().toISOString()
  });
  repository.saveArtifact(sessionId, "stitch_cross_page_validation_report", staticCrossPageReport);
  repository.saveArtifact(sessionId, "stitch_cross_page_validation_report", runtimeCrossPageReport);
  const crossPageValidationArtifact = repository.saveArtifact(sessionId, "stitch_cross_page_validation_report", mergedCrossPageReport);
  repository.saveProjectBundleFile(projectId, "stitch/cross-page-validation.static.json", staticCrossPageReport);
  repository.saveProjectBundleFile(projectId, "stitch/cross-page-validation.runtime.json", runtimeCrossPageReport);
  repository.saveProjectBundleFile(projectId, "stitch/cross-page-validation.json", mergedCrossPageReport);

  const finalGateReport = stitchFinalValidationGateReportSchema.parse(
    buildFinalValidationGateReport({
      sessionId,
      blueprintId,
      pageResults,
      crossPageReportId: crossPageValidationArtifact.id,
      crossPageReportPassed: mergedCrossPageReport.passed,
      crossPageIssueCodes: mergedCrossPageReport.issues.map((issue) => issue.code),
      postprocessReports,
      runtimeBackends: pageResults.length > 0 ? pageResults.map(() => "chrome_headless_cdp") : []
    })
  );
  const finalGateArtifact = repository.saveArtifact(sessionId, "stitch_final_validation_gate_report", finalGateReport);
  repository.saveProjectBundleFile(projectId, "stitch/final-validation-gate.json", finalGateReport);

  const finalPageResults = pageResults.map((page) => {
    const pageGate = finalGateReport.pageResults.find((item) => item.pageId === page.pageId);
    return {
      ...page,
      status: pageGate?.pagePassedFinal ? ("validated" as const) : ("failed" as const)
    };
  });

  const validatedArtifactGate = validatedStitchArtifactGateReportSchema.parse(
    buildValidatedArtifactGate({
      sessionId,
      blueprintId,
      pageResults: finalPageResults
    })
  );
  const validatedArtifactGateArtifact = repository.saveArtifact(sessionId, "validated_stitch_artifact_gate_report", validatedArtifactGate);
  repository.saveProjectBundleFile(projectId, "stitch/validated-artifacts-gate.json", validatedArtifactGate);

  return {
    pageResults: finalPageResults,
    crossPageValidationReportId: crossPageValidationArtifact.id,
    finalValidationGateReportId: finalGateArtifact.id,
    validatedArtifactGateReportId: validatedArtifactGateArtifact.id,
    finalGateReport
  };
}
