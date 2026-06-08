import { StitchToolClient, Stitch } from "@google/stitch-sdk";
import {
  stitchHtmlValidationReportSchema,
  stitchPagePromptArtifactSchema,
  stitchPromptPlanSchema
} from "../../blueprint/schemas/blueprint.js";
import { readStitchEnv } from "../../blueprint/shared/env.js";
import { createId } from "../../blueprint/shared/ids.js";
import type {
  ProductBlueprintV1,
  StitchGenerationInput,
  StitchPageGenerationReport,
  StitchPageGenerationResult,
  StitchPipelineResult
} from "../../blueprint/types/blueprint.js";
import type { GenerationArtifact } from "../../blueprint/types/blueprint.js";
import type { BlueprintRepository } from "../../blueprint/persistence/repository.js";
import type { ProjectBundleManifest } from "../../blueprint/persistence/file-store.js";
import { buildStitchPromptPlan } from "../plan/build-stitch-prompt-plan.js";
import { buildStitchPagePrompt } from "../prompts/build-stitch-page-prompt.js";
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

export async function generateStitchHtmlFromFrozenBlueprint(
  input: StitchGenerationInput,
  options: GenerateStitchHtmlOptions
): Promise<StitchPipelineResult> {
  const { sessionId, blueprintId, frozenBlueprint, targetPages } = input;
  const { repository, stageClient } = options;

  repository.setSessionStatus(sessionId, "stitch_prompt_planning");
  const promptPlan = stitchPromptPlanSchema.parse(
    buildStitchPromptPlan(sessionId, blueprintId, frozenBlueprint, targetPages)
  );
  const promptPlanArtifact = repository.saveArtifact(sessionId, "stitch_prompt_plan", promptPlan);
  const projectId = blueprintId;
  let blueprintArtifactId = "";
  let blueprintVersionNumber = 0;
  try {
    const blueprintVersion = repository.requireBlueprintVersion(blueprintId);
    blueprintArtifactId = blueprintVersion.artifactId;
    blueprintVersionNumber = blueprintVersion.version;
  } catch {
    blueprintVersionNumber = 0;
  }
  const blueprintJsonPath = repository.saveProjectBundleFile(
    projectId,
    projectRelativePath("blueprint", "frozen-blueprint.json"),
    frozenBlueprint
  );
  const stitchPromptPlanPath = repository.saveProjectBundleFile(
    projectId,
    projectRelativePath("stitch", "prompt-plan.json"),
    promptPlan
  );

  const pageResults: StitchPageGenerationResult[] = [];
  const manifestPages: ProjectBundleManifest["pages"] = [];

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
    const projectPromptPath = repository.saveProjectBundleFile(
      projectId,
      projectRelativePath("stitch", "pages", page.id, "prompt.json"),
      promptArtifact
    );

    const htmlResult = await stageClient.generatePageHtml({
      sessionId,
      blueprintId,
      pageId: page.id,
      prompt: promptArtifact.prompt
    });

    const htmlArtifact = repository.saveArtifact(sessionId, "stitch_html", {
      pageId: page.id,
      html: htmlResult.html
    });
    repository.savePageHtmlFile(sessionId, page.id, htmlResult.html);
    const projectHtmlArtifactPath = repository.saveProjectBundleFile(
      projectId,
      projectRelativePath("stitch", "pages", page.id, "html.json"),
      {
        pageId: page.id,
        html: htmlResult.html
      }
    );
    const projectHtmlFilePath = repository.saveProjectBundleTextFile(
      projectId,
      projectRelativePath("stitch", "pages", page.id, "page.html"),
      htmlResult.html
    );

    let screenshotArtifactId: string | undefined;
    let projectScreenshotArtifactPath: string | undefined;
    if (htmlResult.screenshotBase64) {
      const screenshotArtifact = repository.saveArtifact(sessionId, "stitch_screenshot", {
        pageId: page.id,
        screenshotBase64: htmlResult.screenshotBase64
      });
      screenshotArtifactId = screenshotArtifact.id;
      projectScreenshotArtifactPath = repository.saveProjectBundleFile(
        projectId,
        projectRelativePath("stitch", "pages", page.id, "screenshot.json"),
        {
          pageId: page.id,
          screenshotBase64: htmlResult.screenshotBase64
        }
      );
    }

    repository.setSessionStatus(sessionId, "stitch_validating");
    const validationReport = stitchHtmlValidationReportSchema.parse(
      validateStitchHtml({
        sessionId,
        blueprintId,
        page,
        htmlArtifactId: htmlArtifact.id,
        html: htmlResult.html,
        appShell: frozenBlueprint.ui.appStructure.shell,
        navigationType: frozenBlueprint.ui.navigation.type,
        pageCount: frozenBlueprint.ui.pages.length
      })
    );
    const persistedValidation = repository.saveArtifact(sessionId, "stitch_html_validation_report", validationReport);
    const projectValidationArtifactPath = repository.saveProjectBundleFile(
      projectId,
      projectRelativePath("stitch", "pages", page.id, "validation.json"),
      validationReport
    );

    const pageReport: StitchPageGenerationReport = {
      id: createId("stitch_page"),
      sessionId,
      blueprintId,
      pageId: page.id,
      promptArtifactId: persistedPrompt.id,
      htmlArtifactId: htmlArtifact.id,
      screenshotArtifactId,
      validationReportId: persistedValidation.id,
      status: validationReport.passed ? "validated" : "failed",
      createdAt: new Date().toISOString()
    };
    persistPageGenerationReport(repository, sessionId, pageReport);
    const projectGenerationReportPath = repository.saveProjectBundleFile(
      projectId,
      projectRelativePath("stitch", "pages", page.id, "generation-report.json"),
      pageReport
    );

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

  repository.setSessionStatus(sessionId, "stitch_completed");
  repository.saveProjectBundleManifest(projectId, {
    projectId,
    sessionId,
    blueprintId,
    blueprintArtifactId,
    blueprintVersion: blueprintVersionNumber,
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
    pageResults
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
      </form>
      ${secondaryActions.map((label) => `<button type="button">${label}</button>`).join("")}
      ${feedbackSurfaces && feedbackSurfaces !== "none" ? `<div class="feedback">Success message shown inline.</div>` : ""}
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
        const imageBuffer = await fetch(imageUrl).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to download Stitch screenshot for ${input.pageId}: ${response.status} ${response.statusText}`);
          }
          return Buffer.from(await response.arrayBuffer());
        });
        screenshotBase64 = imageBuffer.toString("base64");
      }

      return {
        html,
        screenshotBase64
      };
    } catch (error) {
      if (error instanceof Error && /(401|AUTH_FAILED|invalid authentication credentials)/i.test(error.message)) {
        throw new Error(
          "Stitch authentication failed. Provide either a valid STITCH_API_KEY, or STITCH_ACCESS_TOKEN together with GOOGLE_CLOUD_PROJECT."
        );
      }
      throw error;
    }
  }
}
