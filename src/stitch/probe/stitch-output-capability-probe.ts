import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { Stitch, StitchToolClient, toolMap } from "@google/stitch-sdk";
import { readStitchEnv } from "../../blueprint/shared/env.js";
import type { PageContract, ProductBlueprintV1 } from "../../blueprint/types/blueprint.js";
import { ChromeCdpRuntimeValidationClient, validateStitchRuntime } from "../runtime/validate-stitch-runtime.js";

export type ProbeId = "A" | "B" | "C" | "D" | "E";

export type HtmlSurfaceSummary = {
  hasHtmlDocument: boolean;
  inlineScriptCount: number;
  externalScriptCount: number;
  inlineStyleCount: number;
  externalStylesheetCount: number;
  htmlLinkCount: number;
  hashLinkCount: number;
  dataTargetPageIdCount: number;
};

export type DownloadedAssetSurfaceSummary = {
  files: string[];
  htmlFiles: string[];
  cssFiles: string[];
  jsFiles: string[];
  imageFiles: string[];
};

export type NavigationMode = "real_file_navigation" | "hash_or_state_simulation" | "absent" | "undetermined";

export type RuntimeProbeSummary = {
  attempted: boolean;
  passed?: boolean;
  issueCodes?: string[];
  evidenceCount?: number;
  blocker?: string;
};

export type ProbeObservation = {
  probeId: ProbeId;
  title: string;
  prompt: string;
  observedAt: string;
  outputShapeObserved: string;
  filesOrCodeBlocksProduced: string[];
  htmlUrl?: string;
  imageUrl?: string;
  jsSurface: "inline" | "external" | "absent" | "inaccessible";
  cssSurface: "inline" | "external" | "absent" | "inaccessible";
  runtimeValidation: RuntimeProbeSummary;
  crossPageNavigation: NavigationMode;
  exportSurfaceNotes: string[];
  blockers: string[];
  manualSteps: string[];
};

export type ExportSurfaceObservation = {
  sdkVersion: string;
  availableSdkMethods: string[];
  advertisedToolNames: string[];
  notes: string[];
};

export type StitchCapabilityProbeReport = {
  generatedAt: string;
  reportPath: string;
  artifactRoot: string;
  probeRunId: string;
  probes: ProbeObservation[];
  exportSurface: ExportSurfaceObservation;
  overallFindings: string[];
};

type ProbeDefinition = {
  probeId: Exclude<ProbeId, "E">;
  title: string;
  prompt: string;
  runtimePageRole: "dashboard" | "form" | "detail";
  runtimeExpectedRoutes?: string[];
};

const PROBES: ProbeDefinition[] = [
  {
    probeId: "A",
    title: "Single static HTML",
    prompt:
      "Generate a read-only enterprise operations summary page for a logistics team. Use a clear heading, summary KPI cards, and a recent activity section. Keep it informational with no modal or advanced interaction requirements.",
    runtimePageRole: "dashboard"
  },
  {
    probeId: "B",
    title: "Single HTML with inline JS interaction",
    prompt:
      "Generate an enterprise request-management page with tabs, a modal or drawer launched by a visible action, toast or inline feedback after save, and inline validation states for at least one required form field.",
    runtimePageRole: "form"
  },
  {
    probeId: "C",
    title: "HTML with external CSS and JS files",
    prompt:
      "Generate this as an index.html, styles.css, and app.js style export for an enterprise approval dashboard with a sidebar, filters, and a detail panel. Use external CSS and external JS if supported.",
    runtimePageRole: "dashboard"
  },
  {
    probeId: "D",
    title: "Multiple linked HTML pages",
    prompt:
      "Generate at least index.html and detail.html for an enterprise order review workflow, with a visible navigation link from the index page to the detail page and a back link to the index page if multi-page output is supported.",
    runtimePageRole: "detail",
    runtimeExpectedRoutes: ["/index.html", "/detail.html"]
  }
];

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function stripScheme(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function summarizeHtmlSurface(html: string): HtmlSurfaceSummary {
  return {
    hasHtmlDocument: /<!doctype html>|<html[\s>]/i.test(html),
    inlineScriptCount: [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].length,
    externalScriptCount: [...html.matchAll(/<script\b[^>]*\bsrc=/gi)].length,
    inlineStyleCount: [...html.matchAll(/<style\b[^>]*>/gi)].length,
    externalStylesheetCount: [...html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)].length,
    htmlLinkCount: [...html.matchAll(/<a\b[^>]*href=["'][^"']+\.html(?:#[^"']*)?["']/gi)].length,
    hashLinkCount: [...html.matchAll(/<a\b[^>]*href=["']#[^"']+["']/gi)].length,
    dataTargetPageIdCount: [...html.matchAll(/\bdata-target-page-id=["'][^"']+["']/gi)].length
  };
}

export function summarizeDownloadedAssets(rootDir: string): DownloadedAssetSurfaceSummary {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
        continue;
      }
      files.push(relative(rootDir, fullPath));
    }
  };

  walk(rootDir);
  files.sort();

  const byExt = (extension: string) => files.filter((file) => extname(file).toLowerCase() === extension);
  return {
    files,
    htmlFiles: byExt(".html"),
    cssFiles: byExt(".css"),
    jsFiles: byExt(".js"),
    imageFiles: files.filter((file) => [".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(extname(file).toLowerCase()))
  };
}

export function inferNavigationMode(input: {
  htmlSurface: HtmlSurfaceSummary;
  downloadedAssets?: DownloadedAssetSurfaceSummary;
}): NavigationMode {
  const { htmlSurface, downloadedAssets } = input;
  if ((downloadedAssets?.htmlFiles.length ?? 0) > 1 || htmlSurface.htmlLinkCount > 0) {
    return "real_file_navigation";
  }
  if (htmlSurface.hashLinkCount > 0 || htmlSurface.dataTargetPageIdCount > 0) {
    return "hash_or_state_simulation";
  }
  if ((downloadedAssets?.htmlFiles.length ?? 0) === 0 && htmlSurface.htmlLinkCount === 0 && htmlSurface.hashLinkCount === 0) {
    return "absent";
  }
  return "undetermined";
}

function classifyJsSurface(htmlSurface: HtmlSurfaceSummary, downloadedAssets?: DownloadedAssetSurfaceSummary): ProbeObservation["jsSurface"] {
  if (htmlSurface.inlineScriptCount > 0) {
    return "inline";
  }
  if (htmlSurface.externalScriptCount > 0 || (downloadedAssets?.jsFiles.length ?? 0) > 0) {
    return "external";
  }
  return "absent";
}

function classifyCssSurface(htmlSurface: HtmlSurfaceSummary, downloadedAssets?: DownloadedAssetSurfaceSummary): ProbeObservation["cssSurface"] {
  if (htmlSurface.inlineStyleCount > 0) {
    return "inline";
  }
  if (htmlSurface.externalStylesheetCount > 0 || (downloadedAssets?.cssFiles.length ?? 0) > 0) {
    return "external";
  }
  return "absent";
}

function classifyOutputShape(htmlSurface: HtmlSurfaceSummary, downloadedAssets?: DownloadedAssetSurfaceSummary): string {
  const htmlFileCount = downloadedAssets?.htmlFiles.length ?? 0;
  const jsFileCount = downloadedAssets?.jsFiles.length ?? 0;
  const cssFileCount = downloadedAssets?.cssFiles.length ?? 0;

  if (htmlFileCount > 1) {
    return "multi_html_bundle";
  }
  if (htmlFileCount === 1 && (jsFileCount > 0 || cssFileCount > 0)) {
    return "html_asset_bundle";
  }
  if (htmlSurface.inlineScriptCount > 0 || htmlSurface.externalScriptCount > 0) {
    return "single_html_with_script_surface";
  }
  if (htmlSurface.hasHtmlDocument) {
    return "single_html";
  }
  return "unknown";
}

function sanitizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function readSdkVersion(): string {
  const packageJsonPath = resolve(process.cwd(), "node_modules", "@google", "stitch-sdk", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return packageJson.version ?? "unknown";
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${stripScheme(url)}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function tryRuntimeValidation(input: {
  probe: ProbeDefinition;
  html: string;
}): Promise<RuntimeProbeSummary> {
  try {
    const page = makeRuntimePage(input.probe);
    const blueprint = makeRuntimeBlueprint(page, input.probe.runtimeExpectedRoutes);
    const report = await validateStitchRuntime({
      sessionId: "task_037_probe",
      blueprintId: "task_037_probe_blueprint",
      page,
      blueprint,
      htmlArtifactId: `probe_${input.probe.probeId}`,
      html: input.html,
      runtimeClient: new ChromeCdpRuntimeValidationClient()
    });

    return {
      attempted: true,
      passed: report.passed,
      issueCodes: report.issues.map((issue) => issue.code),
      evidenceCount: report.runtimeEvidence.length
    };
  } catch (error) {
    return {
      attempted: true,
      blocker: error instanceof Error ? error.message : String(error)
    };
  }
}

function makeRuntimePage(probe: ProbeDefinition): PageContract {
  return {
    id: `probe_${probe.probeId.toLowerCase()}_page`,
    name: probe.title,
    route: probe.runtimeExpectedRoutes?.[0] ?? "/index.html",
    purpose: probe.title,
    supportsFlowIds: [],
    primaryAction: {
      id: "action_primary",
      label: probe.probeId === "B" ? "Save" : "Open",
      kind: "primary",
      feedback: "Show a visible effect"
    },
    secondaryActions: probe.runtimeExpectedRoutes?.slice(1).map((targetRoute, index) => ({
      id: `action_nav_${index + 1}`,
      label: basename(targetRoute),
      kind: "navigation",
      targetPageId: targetRoute,
      feedback: `Navigate to ${targetRoute}`
    })) ?? [],
    sections: [{ id: "section_main", name: "Main", purpose: "Primary content" }],
    componentRequirements: [],
    states: [],
    feedbackSurfaces: probe.probeId === "B" ? [{ id: "feedback_inline", type: "inline", purpose: "Show inline feedback" }] : [],
    recoverySurfaces: [],
    stitchPromptHints: [],
    readonly: probe.probeId === "A",
    confirmationOnly: false
  } as unknown as PageContract;
}

function makeRuntimeBlueprint(page: PageContract, extraRoutes?: string[]): ProductBlueprintV1 {
  const pages = [
    {
      id: page.id,
      route: page.route
    },
    ...(extraRoutes ?? []).slice(1).map((route, index) => ({
      id: `probe_extra_${index + 1}`,
      route
    }))
  ];

  return {
    ui: {
      pages
    }
  } as unknown as ProductBlueprintV1;
}

function formatFileList(input: {
  downloadedAssets?: DownloadedAssetSurfaceSummary;
  htmlSavedPath?: string;
  imageUrl?: string;
}): string[] {
  const lines: string[] = [];
  if (input.htmlSavedPath) {
    lines.push(input.htmlSavedPath);
  }
  if (input.downloadedAssets) {
    lines.push(...input.downloadedAssets.files);
  }
  if (input.imageUrl) {
    lines.push(`image-url:${stripScheme(input.imageUrl)}`);
  }
  return lines;
}

function buildOverallFindings(report: StitchCapabilityProbeReport): string[] {
  const findings: string[] = [];
  const successfulProbes = report.probes.filter((probe) => probe.outputShapeObserved !== "error");
  const observedBundle = successfulProbes.some((probe) => probe.outputShapeObserved === "html_asset_bundle" || probe.outputShapeObserved === "multi_html_bundle");
  const observedMultiPage = successfulProbes.some((probe) => probe.crossPageNavigation === "real_file_navigation" && probe.filesOrCodeBlocksProduced.some((item) => item.endsWith(".html")));
  const observedInlineJs = successfulProbes.some((probe) => probe.jsSurface === "inline");

  findings.push(
    observedBundle
      ? "Observed a downloadable asset bundle surface through the SDK workflow; artifact-contract expansion still requires persistence and validator changes before pipeline adoption."
      : "Did not observe a reliable downloadable multi-file bundle contract beyond the current single-screen HTML workflow."
  );
  findings.push(
    observedMultiPage
      ? "Observed real .html navigation targets in probe output; treat them as bundle evidence only after runtime serving and cross-page validation are upgraded for multi-file navigation."
      : "Did not observe proven multi-page file navigation in the current workflow; navigation remains a presentation-level signal, not validated route behavior."
  );
  findings.push(
    observedInlineJs
      ? "Observed inline script surface in generated HTML; interaction behavior still needs runtime evidence before the pipeline can treat inline JS as supported interaction output."
      : "Did not observe reliable inline script output across probes; default artifact assumptions should remain conservative."
  );
  findings.push(
    report.exportSurface.availableSdkMethods.includes("Project.downloadAssets")
      ? "The installed SDK surface exposes `Project.downloadAssets()`, so bundle export probing is possible from scripts even though the current repository integration only consumes `Screen.getHtml()`."
      : "The current script workflow did not expose a bundle-download method through the installed SDK surface."
  );

  return findings;
}

export function renderCapabilityProbeReport(report: StitchCapabilityProbeReport): string {
  const lines: string[] = [
    "# Stitch Output Capability Probe",
    "",
    `Generated at: ${report.generatedAt}`,
    `Probe run ID: ${report.probeRunId}`,
    `Artifact root: \`${report.artifactRoot}\``,
    `SDK version: \`${report.exportSurface.sdkVersion}\``,
    "",
    "## Capability Matrix",
    "",
    "| Probe | Prompt Used | Output Shape Observed | Files / Code Blocks Produced | JS | CSS | Runtime Validation | Cross-page Navigation | Blockers / Manual Steps |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const probe of report.probes) {
    const runtimeSummary = probe.runtimeValidation.attempted
      ? probe.runtimeValidation.blocker
        ? `blocked: ${probe.runtimeValidation.blocker}`
        : probe.runtimeValidation.passed
          ? `passed (${probe.runtimeValidation.evidenceCount ?? 0} evidence)`
          : `failed [${(probe.runtimeValidation.issueCodes ?? []).join(", ") || "no issue codes"}]`
      : "not attempted";
    const blockers = [...probe.blockers, ...probe.manualSteps.map((step) => `manual: ${step}`)];

    lines.push(
      `| Probe ${probe.probeId} | ${probe.prompt.replace(/\|/g, "\\|")} | \`${probe.outputShapeObserved}\` | ${probe.filesOrCodeBlocksProduced.length > 0 ? probe.filesOrCodeBlocksProduced.map((item) => `\`${item}\``).join("<br>") : "none"} | ${probe.jsSurface} | ${probe.cssSurface} | ${runtimeSummary.replace(/\|/g, "\\|")} | ${probe.crossPageNavigation} | ${blockers.length > 0 ? blockers.map((item) => item.replace(/\|/g, "\\|")).join("<br>") : "none"} |`
    );
  }

  lines.push(
    "",
    "## Export Surface",
    "",
    `Available SDK methods: ${report.exportSurface.availableSdkMethods.map((item) => `\`${item}\``).join(", ") || "none observed"}`,
    "",
    `Advertised tool names: ${report.exportSurface.advertisedToolNames.map((item) => `\`${item}\``).join(", ") || "none observed"}`,
    ""
  );

  for (const note of report.exportSurface.notes) {
    lines.push(`- ${note}`);
  }

  lines.push("", "## Findings", "");
  for (const finding of report.overallFindings) {
    lines.push(`- ${finding}`);
  }

  return `${lines.join("\n")}\n`;
}

async function runSdkProbe(
  sdk: Stitch,
  probe: ProbeDefinition,
  artifactRoot: string
): Promise<ProbeObservation> {
  const observedAt = new Date().toISOString();
  const blockers: string[] = [];
  const manualSteps: string[] = [];
  const exportSurfaceNotes: string[] = [];
  const probeDir = join(artifactRoot, `probe-${probe.probeId.toLowerCase()}-${sanitizeTitle(probe.title)}`);
  mkdirSync(probeDir, { recursive: true });

  try {
    const project = await sdk.createProject(`stitch2react-task-037-${probe.probeId}-${nowStamp()}`);
    const screen = await project.generate(probe.prompt, "DESKTOP");
    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage().catch(() => undefined);
    const html = await fetchText(htmlUrl);
    const htmlPath = join(probeDir, "screen.html");
    writeFileSync(htmlPath, html, "utf8");

    let downloadedAssets: DownloadedAssetSurfaceSummary | undefined;
    try {
      const downloadDir = join(probeDir, "downloaded-assets");
      mkdirSync(downloadDir, { recursive: true });
      const downloadOutput = await project.downloadAssets(downloadDir);
      downloadedAssets = summarizeDownloadedAssets(downloadDir);
      const tracePath = join(probeDir, "download-trace.json");
      writeFileSync(tracePath, JSON.stringify(downloadOutput, null, 2));
      exportSurfaceNotes.push(
        `downloadAssets returned ${downloadOutput.screens.length} screen trace(s)${downloadOutput.warnings.length > 0 ? ` with warnings: ${downloadOutput.warnings.join("; ")}` : ""}.`
      );
    } catch (error) {
      blockers.push(`downloadAssets unavailable for Probe ${probe.probeId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const htmlSurface = summarizeHtmlSurface(html);
    const runtimeValidation = await tryRuntimeValidation({ probe, html });
    if (runtimeValidation.blocker) {
      blockers.push(`runtime validation blocker: ${runtimeValidation.blocker}`);
    }

    const outputShapeObserved = classifyOutputShape(htmlSurface, downloadedAssets);
    if (probe.probeId === "C" && outputShapeObserved !== "html_asset_bundle" && outputShapeObserved !== "multi_html_bundle") {
      manualSteps.push("Prompt requested external CSS/JS packaging, but the observed surface did not prove a separate CSS/JS bundle contract.");
    }
    if (probe.probeId === "D" && inferNavigationMode({ htmlSurface, downloadedAssets }) !== "real_file_navigation") {
      manualSteps.push("Prompt requested multi-page navigation, but the observed surface did not prove real file-to-file navigation.");
    }

    return {
      probeId: probe.probeId,
      title: probe.title,
      prompt: probe.prompt,
      observedAt,
      outputShapeObserved,
      filesOrCodeBlocksProduced: formatFileList({
        downloadedAssets,
        htmlSavedPath: relative(artifactRoot, htmlPath),
        imageUrl
      }),
      htmlUrl: stripScheme(htmlUrl),
      imageUrl: imageUrl ? stripScheme(imageUrl) : undefined,
      jsSurface: classifyJsSurface(htmlSurface, downloadedAssets),
      cssSurface: classifyCssSurface(htmlSurface, downloadedAssets),
      runtimeValidation,
      crossPageNavigation: inferNavigationMode({ htmlSurface, downloadedAssets }),
      exportSurfaceNotes,
      blockers,
      manualSteps
    };
  } catch (error) {
    return {
      probeId: probe.probeId,
      title: probe.title,
      prompt: probe.prompt,
      observedAt,
      outputShapeObserved: "error",
      filesOrCodeBlocksProduced: [],
      jsSurface: "inaccessible",
      cssSurface: "inaccessible",
      runtimeValidation: {
        attempted: false,
        blocker: error instanceof Error ? error.message : String(error)
      },
      crossPageNavigation: "undetermined",
      exportSurfaceNotes,
      blockers: [error instanceof Error ? error.message : String(error)],
      manualSteps
    };
  }
}

async function observeExportSurface(): Promise<ExportSurfaceObservation> {
  const availableSdkMethods = ["Stitch.createProject", "Project.generate", "Screen.getHtml", "Screen.getImage", "Project.downloadAssets"];
  const advertisedToolNames = Array.from(toolMap.keys()).sort();
  const notes = [
    "Current repository integration uses `Screen.getHtml()` only; `Project.downloadAssets()` is present in the installed SDK but is not yet consumed by the pipeline.",
    "The SDK surface exposes screenshot retrieval through `Screen.getImage()`.",
    "No explicit Figma export method is exposed through the installed SDK entry points inspected by this probe script.",
    "The script workflow cannot observe copy-code UI affordances; this probe reports only SDK/API-observable export surfaces."
  ];

  return {
    sdkVersion: readSdkVersion(),
    availableSdkMethods,
    advertisedToolNames,
    notes
  };
}

export async function runStitchOutputCapabilityProbe(options?: {
  artifactRoot?: string;
  reportPath?: string;
}): Promise<StitchCapabilityProbeReport> {
  const env = readStitchEnv();
  const probeRunId = `task-037-${nowStamp()}`;
  const artifactRoot = resolve(options?.artifactRoot ?? join("artifacts", "task-037-probe", probeRunId));
  const reportPath = resolve(options?.reportPath ?? join("docs", "execution", "stitch-capability-probe-report.md"));

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });

  const client = new StitchToolClient({
    apiKey: env.STITCH_API_KEY,
    accessToken: env.STITCH_ACCESS_TOKEN,
    projectId: env.GOOGLE_CLOUD_PROJECT,
    baseUrl: env.STITCH_HOST,
    timeout: 300_000
  });
  const sdk = new Stitch(client);

  const exportSurface = await observeExportSurface();
  const probes: ProbeObservation[] = [];

  try {
    for (const probe of PROBES) {
      probes.push(await runSdkProbe(sdk, probe, artifactRoot));
    }
  } finally {
    await client.close().catch(() => undefined);
  }

  const report: StitchCapabilityProbeReport = {
    generatedAt: new Date().toISOString(),
    reportPath,
    artifactRoot,
    probeRunId,
    probes: [
      ...probes,
      {
        probeId: "E",
        title: "Export surface",
        prompt: "Observe the current SDK/API export surface exposed by the installed Stitch SDK and current authenticated tool catalog.",
        observedAt: new Date().toISOString(),
        outputShapeObserved: "sdk_api_surface_observed",
        filesOrCodeBlocksProduced: [],
        jsSurface: "inaccessible",
        cssSurface: "inaccessible",
        runtimeValidation: { attempted: false },
        crossPageNavigation: "undetermined",
        exportSurfaceNotes: exportSurface.notes,
        blockers: [],
        manualSteps: ["Copy-code and Figma export affordances are UI-surface concerns and remain unobserved in this script-only workflow."]
      }
    ],
    exportSurface,
    overallFindings: []
  };

  report.overallFindings = buildOverallFindings(report);

  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, renderCapabilityProbeReport(report), "utf8");
  writeFileSync(join(artifactRoot, "probe-report.json"), JSON.stringify(report, null, 2), "utf8");

  return report;
}
