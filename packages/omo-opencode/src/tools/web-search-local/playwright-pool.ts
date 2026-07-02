import { log } from "../../shared/logger";
import { BLOCKED_RESOURCE_TYPES, USER_AGENTS } from "./constants";

interface Route {
  request(): { resourceType(): string };
  abort(): Promise<void>;
  continue(): Promise<void>;
}

interface Page {
  evaluate: (fn: Function, arg?: unknown) => Promise<unknown>;
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<{ status(): number } | null>;
  title: () => Promise<string>;
  waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<unknown>;
}

interface BrowserContext {
  newPage(): Promise<Page>;
  route(pattern: string, handler: (route: Route) => Promise<void> | void): Promise<void>;
  close(): Promise<void>;
}

interface Browser {
  isConnected(): boolean;
  newContext(opts?: Record<string, unknown>): Promise<BrowserContext>;
  close(): Promise<void>;
}

let browserInstance: Browser | null = null;
let idleTimeout: ReturnType<typeof setTimeout> | null = null;
let browserUnavailable = false;
let forceFetchOnly = false;

const IDLE_CLOSE_MS = 5 * 60 * 1000;
const BROWSER_LAUNCH_TIMEOUT_MS = 10_000;

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

type PlaywrightModule = { chromium: { launch: (opts?: Record<string, unknown>) => Promise<Browser> } };

async function getPlaywright(): Promise<PlaywrightModule> {
  try {
    const mod: PlaywrightModule = await import("playwright-core");
    return mod;
  } catch {
    throw new Error("playwright-core is not installed. Install it with: bun add playwright-core");
  }
}

function resetIdleTimer(): void {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
  }
  idleTimeout = setTimeout(async () => {
    await closeBrowser();
  }, IDLE_CLOSE_MS);
}

async function getBrowser(headless: boolean): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    resetIdleTimer();
    return browserInstance;
  }

  const pw = await getPlaywright();
  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

  // Try system browsers first (more reliable on Windows), fall back to bundled chromium
  const channels = process.platform === "win32" ? ["msedge", "chrome", undefined] : ["chrome", undefined];
  for (const channel of channels) {
    try {
      browserInstance = await pw.chromium.launch({
        headless,
        channel,
        args: launchArgs,
        timeout: BROWSER_LAUNCH_TIMEOUT_MS,
      });
      resetIdleTimer();
      log("[web-search-local] Browser launched", { headless, channel: channel ?? "bundled-chromium" });
      return browserInstance;
    } catch (err) {
      log("[web-search-local] Browser launch failed, trying next", { channel, error: String(err) });
    }
  }

  browserUnavailable = true;
  throw new Error("Failed to launch any browser. Install Edge, Chrome, or run: bunx playwright install chromium");
}

/** Returns false if all browser launch attempts have failed or fetch-only mode is set. */
export function isBrowserAvailable(): boolean {
  return !browserUnavailable && !forceFetchOnly;
}

/** Set fetch-only mode (skips all Playwright attempts). */
export function setFetchOnlyMode(enabled: boolean): void {
  forceFetchOnly = enabled;
  if (enabled) {
    log("[web-search-local] fetch-only mode enabled, skipping Playwright");
  }
}

async function closeBrowser(): Promise<void> {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // ignore close errors
    }
    browserInstance = null;
    log("[web-search-local] Browser closed (idle timeout)");
  }
}

export async function acquireContext(headless: boolean): Promise<BrowserContext> {
  const browser = await getBrowser(headless);
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  await context.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if ((BLOCKED_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
      return route.abort();
    }
    return route.continue();
  });

  return context;
}

export async function acquirePage(headless: boolean): Promise<{ page: Page; context: BrowserContext }> {
  const context = await acquireContext(headless);
  const page = await context.newPage();
  return { page, context };
}

export async function releasePage(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    // ignore
  }
}

export async function disposePool(): Promise<void> {
  await closeBrowser();
}
