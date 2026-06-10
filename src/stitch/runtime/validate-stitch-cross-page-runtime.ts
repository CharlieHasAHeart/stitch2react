import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createId } from "../../blueprint/shared/ids.js";
import type {
  ProductBlueprintV1,
  StitchCrossPageValidationReport,
  StitchHtmlValidationIssue,
  StitchRuntimeValidationEvidence
} from "../../blueprint/types/blueprint.js";
import { loadRuntimeValidationConstraints } from "../constraints/load-runtime-validation-constraints.js";
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

type NavTarget = {
  selector: string;
  text: string;
  href: string;
  x: number;
  y: number;
};

type NavSnapshot = {
  url: string;
  visibleTextHash: string;
  domHash: string;
  activeNavLabel: string;
};

const NAV_TARGETS_JS = `(() => {
  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const blocks = Array.from(document.querySelectorAll('aside, nav'));
  const targets = [];
  for (const block of blocks) {
    const links = Array.from(block.querySelectorAll('a[href]'));
    for (const [index, el] of links.entries()) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const id = el.id ? '#' + el.id : 'a:nth-of-type(' + (index + 1) + ')';
      targets.push({
        selector: id,
        text: normalize(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || id),
        href: el.getAttribute('href') || '',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
  }
  return targets;
})()`;

const NAV_SNAPSHOT_JS = `(() => {
  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const active = document.querySelector('aside a[aria-current="page"], nav a[aria-current="page"], [role="tab"][aria-selected="true"], .active');
  return {
    url: window.location.href,
    visibleText: normalize(document.body?.innerText ?? ''),
    html: document.documentElement?.outerHTML ?? '',
    activeNavLabel: active ? normalize(active.textContent || active.getAttribute('aria-label') || active.id) : ''
  };
})()`;

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSnapshot(snapshot: any): NavSnapshot {
  return {
    url: String(snapshot.url ?? ""),
    visibleTextHash: sha(String(snapshot.visibleText ?? "")),
    domHash: sha(String(snapshot.html ?? "")),
    activeNavLabel: String(snapshot.activeNavLabel ?? "")
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromeBinary(): string {
  return process.env.CHROME_BIN || "/usr/bin/google-chrome";
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
  const root = mkdtempSync(join(tmpdir(), "stitch-cross-runtime-"));
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!request.url || request.url === "/" || request.url.startsWith("/index.html") || request.url.startsWith("/")) {
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
      // retry
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Chrome remote debugging endpoint at ${browserOrigin}`);
}

async function launchBrowserSession() {
  const chromePath = findChromeBinary();
  const debugPort = await getOpenPort();
  const profileDir = mkdtempSync(join(tmpdir(), "stitch-cross-chrome-profile-"));
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
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  try {
    await waitForChromeDebugging(browserOrigin);
    const target = await LightweightCdpClient.createIsolatedTarget(browserOrigin);
    const cdp = await LightweightCdpClient.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    return {
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
    throw error;
  }
}

export async function validateStitchCrossPageRuntime(input: {
  sessionId: string;
  blueprintId: string;
  blueprint: ProductBlueprintV1;
  pages: Array<{ pageId: string; htmlArtifactId: string; html: string }>;
}): Promise<StitchCrossPageValidationReport> {
  const { sessionId, blueprintId, blueprint, pages } = input;
  const constraints = loadRuntimeValidationConstraints();
  const issues: StitchHtmlValidationIssue[] = [];
  const runtimeEvidence: StitchRuntimeValidationEvidence[] = [];
  const declaredRoutes = new Set(blueprint.ui.pages.map((page) => page.route));

  for (const pageInput of pages) {
    const page = blueprint.ui.pages.find((item) => item.id === pageInput.pageId);
    if (!page) {
      continue;
    }

    const pageServer = await createTempHtmlServer(pageInput.html);
    const browser = await launchBrowserSession();
    try {
      const loadEvent = browser.cdp.once("Page.loadEventFired", 10_000);
      await browser.cdp.navigate(pageServer.url);
      await loadEvent;
      await delay(300);

      const targets = (await browser.cdp.evaluate<NavTarget[]>(NAV_TARGETS_JS)) ?? [];
      for (const target of targets) {
        const resetLoadEvent = browser.cdp.once("Page.loadEventFired", 10_000);
        await browser.cdp.navigate(pageServer.url);
        await resetLoadEvent;
        await delay(300);

        const before = normalizeSnapshot(await browser.cdp.evaluate<any>(NAV_SNAPSHOT_JS));
        await browser.cdp.clickAt(target.x, target.y);
        try {
          await browser.cdp.once("Page.loadEventFired", 1_000);
        } catch {
          // hash links and tabs may not trigger a full page load
        }
        await delay(300);
        const after = normalizeSnapshot(await browser.cdp.evaluate<any>(NAV_SNAPSHOT_JS));

        runtimeEvidence.push({
          backend: "chrome_headless_cdp",
          pageId: page.id,
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
          notes: [`href=${target.href}`, `activeNavLabel=${after.activeNavLabel}`]
        });

        const afterUrl = new URL(after.url);
        if (target.href.startsWith("/") && !declaredRoutes.has(afterUrl.pathname) && !declaredRoutes.has(target.href)) {
          issues.push(
            issue(
              constraints.navigation.issueCodeForUndeclaredDestination,
              `Runtime navigation from page ${page.id} reached undeclared destination ${afterUrl.pathname || target.href}.`,
              `pages.${page.id}.runtimeNavigation`,
              "Only navigate to routes declared by PageContracts in the frozen blueprint."
            )
          );
        }
      }
    } finally {
      await browser.cleanup().catch(() => undefined);
      await pageServer.cleanup().catch(() => undefined);
    }
  }

  return {
    id: createId("stitch_cross_runtime_val"),
    sessionId,
    blueprintId,
    kind: "runtime",
    pageIds: pages.map((page) => page.pageId),
    htmlArtifactIds: pages.map((page) => page.htmlArtifactId),
    passed: issues.length === 0,
    issues,
    runtimeEvidence,
    createdAt: new Date().toISOString()
  };
}
