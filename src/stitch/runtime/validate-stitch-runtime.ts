import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createId } from "../../blueprint/shared/ids.js";
import type {
  PageContract,
  ProductBlueprintV1,
  StitchHtmlValidationIssue,
  StitchRuntimeValidationEvidence,
  StitchRuntimeValidationReport
} from "../../blueprint/types/blueprint.js";
import { loadRuntimeValidationConstraints, type RuntimeValidationConstraints } from "../constraints/load-runtime-validation-constraints.js";
import { LightweightCdpClient } from "./lightweight-cdp-client.js";

function issue(code: string, message: string, path?: string, suggestedFix?: string): StitchHtmlValidationIssue {
  return {
    severity: "error",
    code,
    message,
    path,
    suggestedFix
  };
}

type RuntimeValidationResult = {
  issues: StitchHtmlValidationIssue[];
  runtimeEvidence: StitchRuntimeValidationEvidence[];
};

type ClickableTarget = {
  selector: string;
  text: string;
  href?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tagName?: string;
  inputType?: string;
};

type PageSnapshot = {
  url: string;
  visibleTextHash: string;
  domHash: string;
  modalCount: number;
  dialogCount: number;
  drawerCount: number;
  toastCount: number;
  inlineFeedbackCount: number;
  activeTabValue: string;
  blockingOverlayCount: number;
  formStateHash: string;
};

type ClickObservation = {
  before: PageSnapshot;
  after: PageSnapshot;
  target: ClickableTarget;
};

type BrowserSession = {
  browserOrigin: string;
  targetId: string;
  cdp: LightweightCdpClient;
  cleanup: () => Promise<void>;
};

function cssList(selectors: string[]): string {
  return selectors.join(", ");
}

function buildSnapshotScript(constraints: RuntimeValidationConstraints): string {
  return `(() => {
  const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const visibleText = normalize(document.body?.innerText ?? "");
  const html = document.documentElement?.outerHTML ?? "";
  const activeTab = document.querySelector(${JSON.stringify(cssList(constraints.effects.detectors.activeTabSelectors))});
  const formState = Array.from(document.querySelectorAll('input, textarea, select')).map((el) => {
    const input = el;
    const type = input.getAttribute('type') ?? '';
    const key = input.getAttribute('name') || input.getAttribute('id') || input.outerHTML.slice(0, 80);
    let value = '';
    if (type === 'checkbox' || type === 'radio') {
      value = input.checked ? 'true' : 'false';
    } else {
      value = input.value ?? '';
    }
    return key + ':' + value;
  }).join('|');
  const countVisible = (selector) => Array.from(document.querySelectorAll(selector)).filter((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }).length;
  return {
    url: window.location.href,
    visibleText,
    html,
    modalCount: countVisible(${JSON.stringify(cssList(constraints.effects.detectors.modalSelectors))}),
    dialogCount: countVisible('[role="dialog"], dialog, [aria-modal="true"]'),
    drawerCount: countVisible(${JSON.stringify(cssList(constraints.effects.detectors.drawerSelectors))}),
    toastCount: countVisible(${JSON.stringify(cssList(constraints.effects.detectors.toastSelectors))}),
    inlineFeedbackCount: countVisible(${JSON.stringify(cssList(constraints.effects.detectors.inlineFeedbackSelectors))}),
    activeTabValue: activeTab ? normalize(activeTab.textContent || activeTab.getAttribute('data-tab') || activeTab.id) : '',
    blockingOverlayCount: countVisible(${JSON.stringify(cssList(constraints.effects.detectors.blockingOverlaySelectors))}),
    formState: formState
  };
})()`;
}

function buildTargetsScript(constraints: RuntimeValidationConstraints): string {
  return `(() => {
  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
  const elements = Array.from(document.querySelectorAll(${JSON.stringify(cssList(constraints.targets.clickableSelectors))}));
  return elements.map((el, index) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const text = normalize(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('value') || (tag + '_' + index));
    const selector = id || (tag + ':nth-of-type(' + (index + 1) + ')');
    return {
      selector,
      text,
      href: el.getAttribute('href') || undefined,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      tagName: tag,
      inputType: el.getAttribute('type') || undefined
    };
  }).filter(Boolean);
})()`;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromeBinary(): string {
  return process.env.CHROME_BIN || "/usr/bin/google-chrome";
}

function classifyVisibleEffect(
  observation: ClickObservation,
  page: PageContract,
  blueprint: ProductBlueprintV1,
  constraints: RuntimeValidationConstraints
): string[] {
  const effects: string[] = [];
  const declaredRoutes = new Set(blueprint.ui.pages.map((item) => item.route));

  if (observation.after.url !== observation.before.url) {
    const afterUrl = new URL(observation.after.url);
    if (!constraints.navigation.requireDeclaredPageNavigation || declaredRoutes.has(afterUrl.pathname)) {
      effects.push("navigate_to_declared_page");
    }
  }
  if (observation.after.modalCount > observation.before.modalCount || observation.after.dialogCount > observation.before.dialogCount) {
    effects.push("open_modal");
  }
  if (observation.after.drawerCount > observation.before.drawerCount) {
    effects.push("open_drawer");
  }
  if (observation.after.toastCount > observation.before.toastCount) {
    effects.push("show_toast");
  }
  if (observation.after.inlineFeedbackCount > observation.before.inlineFeedbackCount) {
    effects.push("show_inline_feedback");
  }
  if (observation.after.activeTabValue !== observation.before.activeTabValue && observation.after.activeTabValue) {
    effects.push("switch_declared_tab");
  }
  if (observation.after.formStateHash !== observation.before.formStateHash) {
    if (observation.target.inputType === "reset") {
      effects.push("reset_form");
    } else if (observation.target.inputType === "submit" || observation.target.tagName === "button") {
      effects.push("submit_form");
    }
    effects.push("form_state_changed");
  }
  if (observation.after.domHash !== observation.before.domHash || observation.after.visibleTextHash !== observation.before.visibleTextHash) {
    effects.push("dom_changed");
  }

  return effects.filter((effect, index, all) => all.indexOf(effect) === index && (constraints.effects.meaningful.includes(effect) || constraints.effects.weakOnly.includes(effect)));
}

function makeConfiguredIssue(
  constraints: RuntimeValidationConstraints,
  code: keyof RuntimeValidationConstraints["issues"],
  message: string,
  path?: string
): StitchHtmlValidationIssue {
  return issue(code, message, path, constraints.issues[code].suggestedFix);
}

function toEvidence(pageId: string, target: ClickableTarget, before: PageSnapshot, after: PageSnapshot, notes: string[]): StitchRuntimeValidationEvidence {
  return {
    backend: "chrome_headless_cdp",
    pageId,
    selector: target.selector,
    text: target.text,
    before: {
      url: before.url,
      visibleTextHash: before.visibleTextHash,
      domHash: before.domHash
    },
    after: {
      url: after.url,
      visibleTextHash: after.visibleTextHash,
      domHash: after.domHash
    },
    notes
  };
}

function normalizeSnapshot(snapshot: any): PageSnapshot {
  return {
    url: String(snapshot.url ?? ""),
    visibleTextHash: sha(String(snapshot.visibleText ?? "")),
    domHash: sha(String(snapshot.html ?? "")),
    modalCount: Number(snapshot.modalCount ?? 0),
    dialogCount: Number(snapshot.dialogCount ?? 0),
    drawerCount: Number(snapshot.drawerCount ?? 0),
    toastCount: Number(snapshot.toastCount ?? 0),
    inlineFeedbackCount: Number(snapshot.inlineFeedbackCount ?? 0),
    activeTabValue: String(snapshot.activeTabValue ?? ""),
    blockingOverlayCount: Number(snapshot.blockingOverlayCount ?? 0),
    formStateHash: sha(String(snapshot.formState ?? ""))
  };
}

async function getOpenPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function createTempHtmlServer(html: string): Promise<{ url: string; cleanup: () => Promise<void> }> {
  const root = mkdtempSync(join(tmpdir(), "stitch-runtime-"));
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!request.url || request.url === "/" || request.url.startsWith("/index.html")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  const port = await getOpenPort();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    url: `http://127.0.0.1:${port}/index.html`,
    cleanup: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  };
}

async function waitForChromeDebugging(browserOrigin: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${browserOrigin}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Chrome remote debugging endpoint at ${browserOrigin}`);
}

async function launchBrowserSession(): Promise<BrowserSession> {
  const chromePath = findChromeBinary();
  const debugPort = await getOpenPort();
  const profileDir = mkdtempSync(join(tmpdir(), "stitch-chrome-profile-"));
  const browserOrigin = `http://127.0.0.1:${debugPort}`;
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank"
    ],
    {
      stdio: ["ignore", "ignore", "pipe"]
    }
  );

  let stderr = "";
  chrome.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForChromeDebugging(browserOrigin);
    const target = await LightweightCdpClient.createIsolatedTarget(browserOrigin);
    const cdp = await LightweightCdpClient.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Network.enable");
    await cdp.send("Log.enable");

    return {
      browserOrigin,
      targetId: target.targetId,
      cdp,
      cleanup: async () => {
        await cdp.close().catch(() => undefined);
        await LightweightCdpClient.closeTarget(browserOrigin, target.targetId).catch(() => undefined);
        chrome.kill("SIGKILL");
        rmSync(profileDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    chrome.kill("SIGKILL");
    rmSync(profileDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(stderr ? `${message}\n${stderr}` : message);
  }
}

export type StitchRuntimeValidationClient = {
  validatePage(input: {
    sessionId: string;
    blueprintId: string;
    blueprint: ProductBlueprintV1;
    page: PageContract;
    htmlArtifactId?: string;
    html: string;
  }): Promise<RuntimeValidationResult>;
};

export class ChromeCdpRuntimeValidationClient implements StitchRuntimeValidationClient {
  constructor(private readonly constraints: RuntimeValidationConstraints = loadRuntimeValidationConstraints()) {}

  async validatePage(input: {
    sessionId: string;
    blueprintId: string;
    blueprint: ProductBlueprintV1;
    page: PageContract;
    htmlArtifactId?: string;
    html: string;
  }): Promise<RuntimeValidationResult> {
    const { page, blueprint, html } = input;
    const issues: StitchHtmlValidationIssue[] = [];
    const runtimeEvidence: StitchRuntimeValidationEvidence[] = [];
    const consoleErrors: string[] = [];
    const brokenResources: string[] = [];

    const snapshotScript = buildSnapshotScript(this.constraints);
    const targetsScript = buildTargetsScript(this.constraints);
    const pageServer = await createTempHtmlServer(html);
    const browser = await launchBrowserSession();

    const recordConsole = browser.cdp.on("Runtime.consoleAPICalled", (params) => {
      const type = String(params?.type ?? "log");
      if (this.constraints.console.blockingTypes.includes(type)) {
        const args = Array.isArray(params?.args) ? params.args.map((arg: any) => arg?.value ?? arg?.description ?? "").join(" ") : "";
        consoleErrors.push(`${type}: ${args}`.trim());
      }
    });
    const recordException = browser.cdp.on("Runtime.exceptionThrown", (params) => {
      const text = String(params?.exceptionDetails?.text ?? "Runtime exception");
      consoleErrors.push(text);
    });
    const recordNetwork = browser.cdp.on("Network.loadingFailed", (params) => {
      const url = String(params?.url ?? "");
      if (this.constraints.resources.ignoreUrlSuffixes.some((suffix) => url.endsWith(suffix))) {
        return;
      }
      brokenResources.push(String(params?.errorText ?? "resource failed to load"));
    });
    const recordResponse = browser.cdp.on("Network.responseReceived", (params) => {
      const status = Number(params?.response?.status ?? 200);
      const url = String(params?.response?.url ?? "");
      if (this.constraints.resources.ignoreUrlSuffixes.some((suffix) => url.endsWith(suffix))) {
        return;
      }
      if (this.constraints.resources.blockingStatusCodes.includes(status)) {
        brokenResources.push(`${status} ${url}`.trim());
      }
    });

    try {
      const loadEvent = browser.cdp.once("Page.loadEventFired", 10_000);
      await browser.cdp.navigate(pageServer.url);
      await loadEvent;
      await delay(300);

      const initialSnapshot = normalizeSnapshot(await browser.cdp.evaluate<any>(snapshotScript));
      if (!initialSnapshot.visibleTextHash || initialSnapshot.visibleTextHash === sha("")) {
        issues.push(makeConfiguredIssue(this.constraints, "blank_rendered_page", "Runtime validation found no visible main content.", page.id));
      }
      if (initialSnapshot.blockingOverlayCount > 0) {
        issues.push(makeConfiguredIssue(this.constraints, "blocking_overlay", "Runtime validation found a blocking overlay covering the page.", page.id));
      }

      const targets = (await browser.cdp.evaluate<ClickableTarget[]>(targetsScript)) ?? [];
      for (const target of targets) {
        const before = normalizeSnapshot(await browser.cdp.evaluate<any>(snapshotScript));
        await browser.cdp.clickAt(target.x, target.y);
        await delay(300);
        const after = normalizeSnapshot(await browser.cdp.evaluate<any>(snapshotScript));
        const observation: ClickObservation = { before, after, target };
        const effects = classifyVisibleEffect(observation, page, blueprint, this.constraints);

        if (effects.length === 0) {
          issues.push(
            issue(
              "missing_runtime_click_behavior",
              `Runtime validation did not observe a meaningful visible effect for clickable element \"${target.text || target.selector}\".`,
              target.selector,
              "Attach modal/drawer/toggle/toast/inline feedback/submit/reset/declared navigation behavior."
            )
          );
          runtimeEvidence.push(toEvidence(page.id, target, before, after, ["No visible runtime effect observed after click."]));
          continue;
        }

        const weakOnly = effects.every((effect) => this.constraints.effects.weakOnly.includes(effect));
        runtimeEvidence.push(toEvidence(page.id, target, before, after, [`Observed effects: ${effects.join(", ")}`]));
        if (weakOnly) {
          issues.push(
            issue(
              "click_only_changes_focus_or_hover",
              `Runtime validation observed only weak state changes for clickable element \"${target.text || target.selector}\".`,
              target.selector,
              "Make the click produce a clearer visible effect such as modal, drawer, toast, inline feedback, submit/reset, or declared navigation."
            )
          );
        }
      }

      if (consoleErrors.length > 0) {
        issues.push(makeConfiguredIssue(this.constraints, "console_runtime_error", `Runtime validation detected console/runtime errors: ${consoleErrors[0]}`, page.id));
        runtimeEvidence.push({
          backend: "chrome_headless_cdp",
          pageId: page.id,
          notes: consoleErrors.slice(0, 5)
        });
      }

      if (brokenResources.length > 0) {
        issues.push(makeConfiguredIssue(this.constraints, "broken_resource", `Runtime validation detected broken resources: ${brokenResources[0]}`, page.id));
        runtimeEvidence.push({
          backend: "chrome_headless_cdp",
          pageId: page.id,
          notes: brokenResources.slice(0, 5)
        });
      }
    } finally {
      recordConsole();
      recordException();
      recordNetwork();
      recordResponse();
      await browser.cleanup().catch(() => undefined);
      await pageServer.cleanup().catch(() => undefined);
    }

    return { issues, runtimeEvidence };
  }
}

export async function validateStitchRuntime(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  page: PageContract;
  htmlArtifactId?: string;
  html: string;
  runtimeClient: StitchRuntimeValidationClient;
}): Promise<StitchRuntimeValidationReport> {
  const { sessionId, blueprintId, page, htmlArtifactId, runtimeClient } = input;
  const result = await runtimeClient.validatePage(input);
  return {
    id: createId("stitch_runtime_val"),
    sessionId,
    blueprintId,
    pageId: page.id,
    htmlArtifactId,
    passed: result.issues.length === 0,
    issues: result.issues,
    runtimeEvidence: result.runtimeEvidence,
    createdAt: new Date().toISOString()
  };
}
