import { StitchToolClient, Stitch } from "@google/stitch-sdk";
import {
  stitchRuntimeValidationReportSchema,
  validatedStitchArtifactGateReportSchema,
  stitchCrossPageValidationReportSchema,
  stitchHtmlPostprocessReportSchema,
  stitchHtmlValidationReportSchema,
  stitchPagePromptArtifactSchema,
  stitchPromptPlanSchema
} from "../../blueprint/schemas/blueprint.js";
import type { BlueprintRepository } from "../../blueprint/persistence/repository.js";
import type { ProjectBundleManifest } from "../../blueprint/persistence/file-store.js";
import { readStitchEnv } from "../../blueprint/shared/env.js";
import { createId } from "../../blueprint/shared/ids.js";
import type {
  GenerationArtifact,
  ProductBlueprintV1,
  StitchGenerationInput,
  StitchHtmlValidationIssue,
  StitchPageGenerationReport,
  StitchPageGenerationResult,
  StitchPipelineResult,
  StitchRuntimeValidationReport,
  ValidatedStitchArtifactGateReport
} from "../../blueprint/types/blueprint.js";
import { buildStitchPromptPlan } from "../plan/build-stitch-prompt-plan.js";
import { postprocessStitchHtml } from "../postprocess/postprocess-stitch-html.js";
import { buildStitchPagePrompt } from "../prompts/build-stitch-page-prompt.js";
import {
  StubStitchRuntimeValidationClient,
  validateStitchRuntime,
  type StitchRuntimeValidationClient
} from "../runtime/validate-stitch-runtime.js";
import { validateStitchCrossPage } from "../validation/validate-stitch-cross-page.js";
import { validateStitchHtml } from "../validation/validate-stitch-html.js";

export type StitchHtmlStageClient = {
  generatePageHtml(input: {
    sessionId: string;
    blueprintId: string;
    pageId: string;
    prompt: string;
  }): Promise<{
    html: string;
    screenshotBase64?: string;
  }>;
};

export type GenerateStitchHtmlOptions = {
  repository: BlueprintRepository;
  stageClient: StitchHtmlStageClient;
  runtimeValidationClient?: StitchRuntimeValidationClient;
};

function persistPageGenerationReport(
  repository: BlueprintRepository,
  sessionId: string,
  report: StitchPageGenerationReport
): GenerationArtifact {
  return repository.saveArtifact(sessionId, "stitch_page_generation_report", report);
}

function projectRelativePath(...parts: string[]): string {
  return parts.join("/");
}

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
    staticReport,
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

export async function generateStitchHtmlFromFrozenBlueprint(
  input: StitchGenerationInput,
  options: GenerateStitchHtmlOptions
): Promise<StitchPipelineResult> {
  const { sessionId, blueprintId, frozenBlueprint, targetPages } = input;
  const { repository, stageClient, runtimeValidationClient = new StubStitchRuntimeValidationClient() } = options;

  const blueprintVersion = repository.requireBlueprintVersion(blueprintId);
  if (blueprintVersion.status !== "frozen") {
    throw new Error(`Blueprint ${blueprintId} must be frozen before Stitch generation.`);
  }

  repository.setSessionStatus(sessionId, "stitch_prompt_planning");
  const promptPlan = stitchPromptPlanSchema.parse(
    buildStitchPromptPlan(sessionId, blueprintId, frozenBlueprint, targetPages)
  );
  const promptPlanArtifact = repository.saveArtifact(sessionId, "stitch_prompt_plan", promptPlan);
  const projectId = blueprintId;
  const blueprintJsonPath = repository.saveProjectBundleFile(projectId, projectRelativePath("blueprint", "frozen-blueprint.json"), frozenBlueprint);
  const stitchPromptPlanPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "prompt-plan.json"), promptPlan);

  const pageResults: StitchPageGenerationResult[] = [];
  const manifestPages: ProjectBundleManifest["pages"] = [];
  const crossPageInputs: Array<{ pageId: string; htmlArtifactId: string; html: string }> = [];

  for (const planPage of promptPlan.pages) {
    const page = frozenBlueprint.ui.pages.find((item) => item.id === planPage.pageId);
    if (!page) {
      throw new Error(`Missing PageContract for plan page ${planPage.pageId}`);
    }

    repository.setSessionStatus(sessionId, "stitch_generating");
    const promptArtifact = stitchPagePromptArtifactSchema.parse(
      buildStitchPagePrompt(sessionId, blueprintId, frozenBlueprint, planPage, page)
    );
    const persistedPrompt = repository.saveArtifact(sessionId, "stitch_page_prompt", promptArtifact);
    const projectPromptPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "pages", page.id, "prompt.json"), promptArtifact);

    const htmlResult = await stageClient.generatePageHtml({
      sessionId,
      blueprintId,
      pageId: page.id,
      prompt: promptArtifact.prompt
    });

    let currentHtml = htmlResult.html;
    let htmlArtifact = repository.saveArtifact(sessionId, "stitch_html", { pageId: page.id, html: currentHtml });
    repository.savePageHtmlFile(sessionId, page.id, currentHtml);

    let screenshotArtifactId: string | undefined;
    let projectScreenshotArtifactPath: string | undefined;
    if (htmlResult.screenshotBase64) {
      const screenshotArtifact = repository.saveArtifact(sessionId, "stitch_screenshot", {
        pageId: page.id,
        screenshotBase64: htmlResult.screenshotBase64
      });
      screenshotArtifactId = screenshotArtifact.id;
      projectScreenshotArtifactPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "pages", page.id, "screenshot.json"), {
        pageId: page.id,
        screenshotBase64: htmlResult.screenshotBase64
      });
    }

    repository.setSessionStatus(sessionId, "stitch_validating");
    let { runtimeReport, mergedReport } = await runMergedValidation({
      sessionId,
      blueprintId,
      blueprint: frozenBlueprint,
      page,
      htmlArtifactId: htmlArtifact.id,
      html: currentHtml,
      runtimeValidationClient
    });

    if (!mergedReport.passed) {
      const { html: postprocessedHtml, report } = postprocessStitchHtml({
        sessionId,
        blueprintId,
        blueprint: frozenBlueprint,
        page,
        htmlArtifactId: htmlArtifact.id,
        html: currentHtml,
        issues: mergedReport.issues
      });
      if (postprocessedHtml !== currentHtml) {
        currentHtml = postprocessedHtml;
        htmlArtifact = repository.saveArtifact(sessionId, "stitch_html", { pageId: page.id, html: currentHtml });
        repository.saveArtifact(sessionId, "stitch_html_postprocess_report", stitchHtmlPostprocessReportSchema.parse(report));
        repository.savePageHtmlFile(sessionId, page.id, currentHtml);
        ({ runtimeReport, mergedReport } = await runMergedValidation({
          sessionId,
          blueprintId,
          blueprint: frozenBlueprint,
          page,
          htmlArtifactId: htmlArtifact.id,
          html: currentHtml,
          runtimeValidationClient
        }));
      }
    }

    repository.saveArtifact(sessionId, "stitch_runtime_validation_report", runtimeReport);
    const persistedValidation = repository.saveArtifact(sessionId, "stitch_html_validation_report", mergedReport);
    const projectHtmlArtifactPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "pages", page.id, "html.json"), { pageId: page.id, html: currentHtml });
    const projectHtmlFilePath = repository.saveProjectBundleTextFile(projectId, projectRelativePath("stitch", "pages", page.id, "page.html"), currentHtml);
    const projectValidationArtifactPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "pages", page.id, "validation.json"), mergedReport);

    const pageReport: StitchPageGenerationReport = {
      id: createId("stitch_page"),
      sessionId,
      blueprintId,
      pageId: page.id,
      promptArtifactId: persistedPrompt.id,
      htmlArtifactId: htmlArtifact.id,
      screenshotArtifactId,
      validationReportId: persistedValidation.id,
      status: mergedReport.passed ? "validated" : "failed",
      createdAt: new Date().toISOString()
    };
    persistPageGenerationReport(repository, sessionId, pageReport);
    const projectGenerationReportPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "pages", page.id, "generation-report.json"), pageReport);

    pageResults.push({
      sessionId,
      blueprintId,
      pageId: page.id,
      promptArtifactId: persistedPrompt.id,
      htmlArtifactId: htmlArtifact.id,
      screenshotArtifactId,
      validationReportId: persistedValidation.id,
      status: pageReport.status
    });
    crossPageInputs.push({ pageId: page.id, htmlArtifactId: htmlArtifact.id, html: currentHtml });
    manifestPages.push({
      pageId: page.id,
      promptArtifactPath: projectPromptPath,
      htmlArtifactPath: projectHtmlArtifactPath,
      htmlFilePath: projectHtmlFilePath,
      screenshotArtifactPath: projectScreenshotArtifactPath,
      validationArtifactPath: projectValidationArtifactPath,
      generationReportPath: projectGenerationReportPath,
      status: pageReport.status
    });
  }

  const crossPageReport = stitchCrossPageValidationReportSchema.parse(
    validateStitchCrossPage({
      sessionId,
      blueprintId,
      blueprint: frozenBlueprint,
      pages: crossPageInputs
    })
  );
  const crossPageValidationArtifact = repository.saveArtifact(sessionId, "stitch_cross_page_validation_report", crossPageReport);
  repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "cross-page-validation.json"), crossPageReport);

  const finalPageResults = crossPageReport.passed
    ? pageResults
    : pageResults.map((page) => ({ ...page, status: "failed" as const }));

  const validatedArtifactGate = validatedStitchArtifactGateReportSchema.parse(
    buildValidatedArtifactGate({
      sessionId,
      blueprintId,
      pageResults: finalPageResults
    })
  );
  const validatedArtifactGateArtifact = repository.saveArtifact(sessionId, "validated_stitch_artifact_gate_report", validatedArtifactGate);
  repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "validated-artifacts-gate.json"), validatedArtifactGate);

  repository.setSessionStatus(sessionId, "stitch_completed");
  repository.saveProjectBundleManifest(projectId, {
    projectId,
    sessionId,
    blueprintId,
    blueprintArtifactId: blueprintVersion.artifactId,
    blueprintVersion: blueprintVersion.version,
    status: "stitch_completed",
    blueprintJsonPath,
    stitchPromptPlanPath,
    pages: manifestPages,
    updatedAt: new Date().toISOString()
  });

  return {
    sessionId,
    blueprintId,
    promptPlanArtifactId: promptPlanArtifact.id,
    pageResults: finalPageResults,
    crossPageValidationReportId: crossPageValidationArtifact.id,
    validatedArtifactGateReportId: validatedArtifactGateArtifact.id
  };
}

export class StubStitchHtmlStageClient implements StitchHtmlStageClient {
  async generatePageHtml(input: { pageId: string; prompt: string }): Promise<{ html: string; screenshotBase64?: string }> {
    const extractLineValue = (label: string): string => {
      const line = input.prompt.split("\n").find((item) => item.startsWith(`${label}: `));
      return line ? line.slice(`${label}: `.length) : "";
    };

    const primaryAction = extractLineValue("- primaryAction");
    const secondaryActions = extractLineValue("- secondaryActions")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && item !== "none");
    const requiredSections = extractLineValue("- requiredSections")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && item !== "none");
    const feedbackSurfaces = extractLineValue("- feedbackSurfaces");
    const recoverySurfaces = extractLineValue("- recoverySurfaces");

    return {
      html: `<!DOCTYPE html>
<html>
  <head>
    <title>${input.pageId}</title>
  </head>
  <body>
    <main>
      <h1>${input.pageId}</h1>
      ${requiredSections.map((section) => `<section><h2>${section}</h2></section>`).join("")}
      <form>
        <label>Title<input type="text" name="title" /></label>
        ${primaryAction && primaryAction !== "none" ? `<button type="submit">${primaryAction}</button>` : ""}
        ${secondaryActions.some((label) => /reset/i.test(label)) ? `<button type="reset">Reset</button>` : ""}
      </form>
      ${secondaryActions.filter((label) => !/reset/i.test(label)).map((label) => `<button type="button" data-action="show_inline_feedback">${label}</button>`).join("")}
      ${feedbackSurfaces && feedbackSurfaces !== "none" ? `<div class="feedback" data-feedback-surface="inline">Success message shown inline.</div>` : ""}
      ${recoverySurfaces && recoverySurfaces !== "none" ? `<div class="recovery">Retry or edit the form.</div>` : ""}
    </main>
  </body>
</html>`
    };
  }
}

export type GoogleStitchSdkStageClientOptions = {
  apiKey?: string;
  accessToken?: string;
  googleCloudProject?: string;
  baseUrl?: string;
  projectTitle?: string;
  projectId?: string;
  timeoutMs?: number;
};

export class GoogleStitchSdkStageClient implements StitchHtmlStageClient {
  private readonly sdk: Stitch;
  private readonly projectTitle: string;
  private readonly projectId?: string;

  constructor(options: GoogleStitchSdkStageClientOptions = {}) {
    const env = readStitchEnv();
    const client = new StitchToolClient({
      apiKey: options.apiKey ?? env.STITCH_API_KEY,
      accessToken: options.accessToken ?? env.STITCH_ACCESS_TOKEN,
      projectId: options.googleCloudProject ?? env.GOOGLE_CLOUD_PROJECT,
      baseUrl: options.baseUrl ?? env.STITCH_HOST,
      timeout: options.timeoutMs ?? 300_000
    });
    this.sdk = new Stitch(client);
    this.projectTitle = options.projectTitle ?? "stitch2react";
    this.projectId = options.projectId;
  }

  async generatePageHtml(input: {
    sessionId: string;
    blueprintId: string;
    pageId: string;
    prompt: string;
  }): Promise<{ html: string; screenshotBase64?: string }> {
    try {
      const project = this.projectId ? this.sdk.project(this.projectId) : await this.sdk.createProject(this.projectTitle);
      const screen = await project.generate(input.prompt, "DESKTOP");
      const htmlUrl = await screen.getHtml();
      const imageUrl = await screen.getImage();

      const html = await fetch(htmlUrl).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to download Stitch HTML for ${input.pageId}: ${response.status} ${response.statusText}`);
        }
        return response.text();
      });

      let screenshotBase64: string | undefined;
      if (imageUrl) {
        const imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) {
          const buffer = Buffer.from(await imageResponse.arrayBuffer());
          screenshotBase64 = buffer.toString("base64");
        }
      }

      return { html, screenshotBase64 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Stitch generation failed for ${input.pageId}: ${message}`);
    }
  }
}
