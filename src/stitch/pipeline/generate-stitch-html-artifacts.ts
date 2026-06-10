import { stitchPagePromptArtifactSchema, stitchPromptPlanSchema } from "../../blueprint/schemas/blueprint.js";
import type { BlueprintRepository } from "../../blueprint/persistence/repository.js";
import { readStitchEnv } from "../../blueprint/shared/env.js";
import { StitchToolClient, Stitch } from "@google/stitch-sdk";
import type { ProductBlueprintV1, StitchGenerationInput } from "../../blueprint/types/blueprint.js";
import { buildStitchPromptPlan } from "../plan/build-stitch-prompt-plan.js";
import { buildStitchPagePrompt } from "../prompts/build-stitch-page-prompt.js";
import type { GeneratedStitchHtmlArtifactsResult } from "./validate-repair-stitch-html-artifacts.js";

export type StitchHtmlStageClient = {
  generatePageHtml(input: {
    sessionId: string;
    blueprintId: string;
    pageId: string;
    prompt: string;
  }): Promise<{
    html: string;
  }>;
};

export type GenerateStitchHtmlArtifactsOptions = {
  repository: BlueprintRepository;
  stageClient: StitchHtmlStageClient;
};

function projectRelativePath(...parts: string[]): string {
  return parts.join("/");
}

export async function generateStitchHtmlArtifacts(
  input: StitchGenerationInput,
  options: GenerateStitchHtmlArtifactsOptions
): Promise<GeneratedStitchHtmlArtifactsResult> {
  const { sessionId, blueprintId, frozenBlueprint, targetPages } = input;
  const { repository, stageClient } = options;

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

  const pages: GeneratedStitchHtmlArtifactsResult["pages"] = [];

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

    const htmlArtifact = repository.saveArtifact(sessionId, "stitch_html", { pageId: page.id, html: htmlResult.html });
    repository.savePageHtmlFile(sessionId, page.id, htmlResult.html);
    const projectHtmlArtifactPath = repository.saveProjectBundleFile(projectId, projectRelativePath("stitch", "pages", page.id, "html.json"), { pageId: page.id, html: htmlResult.html });
    const projectHtmlFilePath = repository.saveProjectBundleTextFile(projectId, projectRelativePath("stitch", "pages", page.id, "page.html"), htmlResult.html);

    pages.push({
      sessionId,
      blueprintId,
      pageId: page.id,
      route: page.route,
      promptArtifactId: persistedPrompt.id,
      htmlArtifactId: htmlArtifact.id,
      html: htmlResult.html,
      promptArtifactPath: projectPromptPath,
      htmlArtifactPath: projectHtmlArtifactPath,
      htmlFilePath: projectHtmlFilePath
    });
  }

  return {
    sessionId,
    blueprintId,
    promptPlanArtifactId: promptPlanArtifact.id,
    blueprintJsonPath,
    stitchPromptPlanPath,
    pages
  };
}

export class StubStitchHtmlStageClient implements StitchHtmlStageClient {
  async generatePageHtml(input: { pageId: string; prompt: string }): Promise<{ html: string }> {
    const extractLineValue = (label: string): string => {
      const line = input.prompt.split("\n").find((item) => item.startsWith(`${label}: `));
      return line ? line.slice(`${label}: `.length) : "";
    };

    const primaryActionRaw = extractLineValue("- primaryAction");
    const primaryAction = primaryActionRaw && primaryActionRaw !== "none"
      ? (() => {
          const [id, ...labelParts] = primaryActionRaw.split(":");
          return { id: id.trim(), label: labelParts.join(":").trim() };
        })()
      : undefined;
    const secondaryActions = extractLineValue("- secondaryActions")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && item !== "none")
      .map((item) => {
        const [id, ...labelParts] = item.split(":");
        return { id: id.trim(), label: labelParts.join(":").trim() };
      });
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
    <main data-page-id="${input.pageId}">
      <h1>${input.pageId}</h1>
      ${requiredSections.map((section) => `<section><h2>${section}</h2></section>`).join("")}
      <form onsubmit="event.preventDefault(); const feedback = document.querySelector('[data-feedback-surface="inline"]'); if (feedback) { feedback.hidden = false; feedback.textContent = 'Submitted successfully.'; }" onreset="const feedback = document.querySelector('[data-feedback-surface="inline"]'); if (feedback) { feedback.hidden = false; feedback.textContent = 'Form reset.'; }">
        <label>Title<input type="text" name="title" value="Draft title" /></label>
        ${primaryAction ? `<button type="submit" data-action="submit_form" data-action-id="${primaryAction.id}" data-action-kind="primary">${primaryAction.label}</button>` : ""}
        ${secondaryActions.some((action) => /reset/i.test(action.label)) ? `<button type="reset" data-action="reset_form" data-action-id="action_reset_1" data-action-kind="recovery">Reset</button>` : ""}
      </form>
      ${secondaryActions.filter((action) => !/reset/i.test(action.label)).map((action) => `<button type="button" data-action="show_inline_feedback" data-action-id="${action.id}" data-action-kind="${/retry/i.test(action.label) ? "recovery" : "secondary"}" onclick="const feedback = document.querySelector('[data-feedback-surface="inline"]'); if (feedback) { feedback.hidden = false; feedback.textContent = 'Action completed.'; }">${action.label}</button>`).join("")}
      ${feedbackSurfaces && feedbackSurfaces !== "none" ? `<div class="feedback" data-feedback-surface="inline" role="status" aria-live="polite" hidden></div>` : ""}
      ${recoverySurfaces && recoverySurfaces !== "none" ? `<div class="recovery" data-recovery-surface="form_retry">Retry or edit the form.</div>` : ""}
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
  }): Promise<{ html: string }> {
    try {
      const project = this.projectId ? this.sdk.project(this.projectId) : await this.sdk.createProject(this.projectTitle);
      const screen = await project.generate(input.prompt, "DESKTOP");
      const htmlUrl = await screen.getHtml();

      const html = await fetch(htmlUrl).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to download Stitch HTML for ${input.pageId}: ${response.status} ${response.statusText}`);
        }
        return response.text();
      });

      return { html };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Stitch generation failed for ${input.pageId}: ${message}`);
    }
  }
}
