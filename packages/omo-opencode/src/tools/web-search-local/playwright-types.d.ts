/**
 * Type declarations for the web-search-local module.
 *
 * playwright-core is a peer/optional dependency that may not be installed.
 * These declarations provide the minimal types needed for compilation.
 * At runtime, playwright-core is dynamically imported and will throw a
 * descriptive error if not available.
 *
 * DOM types used inside page.evaluate() callbacks are also declared here
 * since the project tsconfig does not include lib "dom".
 * When bun-types is installed these are redundant but harmless (skipLibCheck:true).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "playwright-core" {
  interface Page {
    goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<Response | null>;
    evaluate(fn: Function, arg?: any): Promise<any>;
    waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
    title(): Promise<string>;
    url(): string;
  }

  interface Response {
    status(): number;
  }

  interface BrowserContext {
    newPage(): Promise<Page>;
    route(pattern: string, handler: (route: Route) => void): Promise<void>;
    close(): Promise<void>;
  }

  interface Route {
    request(): Request;
    abort(): Promise<void>;
    continue(): Promise<void>;
  }

  interface Request {
    resourceType(): string;
  }

  interface Browser {
    newContext(options?: Record<string, unknown>): Promise<BrowserContext>;
    close(): Promise<void>;
    isConnected(): boolean;
  }

  interface BrowserType {
    launch(options?: Record<string, unknown>): Promise<Browser>;
  }

  const chromium: BrowserType;

  export { Page, Response, BrowserContext, Route, Request, Browser, BrowserType, chromium };
}

// Browser-context globals for page.evaluate() callbacks + URL for budget-guard.
// bun-types provides URL at runtime; this fallback covers the case where
// bun-types is not installed (e.g. fresh checkout before `bun install`).
declare var document: any;
declare var Element: any;
declare var HTMLAnchorElement: any;
declare var HTMLLinkElement: any;

interface URLInstance {
  hostname: string;
  origin: string;
  pathname: string;
  hash: string;
  search: string;
  searchParams: {
    get(name: string): string | null;
    set(name: string, value: string): void;
    entries(): IterableIterator<[string, string]>;
  };
  toString(): string;
}

declare var URL: {
  new (url: string, base?: string): URLInstance;
  prototype: URLInstance;
};
