import type { PageResult, PageLink } from "./types";
import { acquirePage, releasePage, isBrowserAvailable } from "./playwright-pool";
import { extractContent, extractLinks, extractTitle } from "./content-extractor";
import { detectPaginationNext, detectPaginationNextFromHtml } from "./pagination-detector";
import { PAGE_LOAD_TIMEOUT_MS, MAX_CONTENT_WORDS, USER_AGENTS } from "./constants";
import { log } from "../../shared/logger";

export async function scrapePage(url: string, headless: boolean): Promise<PageResult> {
  // Try Playwright first if browser is available
  if (isBrowserAvailable()) {
    const result = await scrapeWithPlaywright(url, headless);
    if (result) return result;
  }

  // Fall back to fetch-based scraping
  return scrapeWithFetch(url);
}

async function scrapeWithPlaywright(url: string, headless: boolean): Promise<PageResult | null> {
  try {
    const { page, context } = await acquirePage(headless);

    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });

      if (!response) {
        return {
          url,
          title: "",
          content: "",
          wordCount: 0,
          links: [],
          paginationNext: null,
          success: false,
          error: "No response received",
        };
      }

      const status = response.status();
      if (status >= 400) {
        return {
          url,
          title: "",
          content: "",
          wordCount: 0,
          links: [],
          paginationNext: null,
          success: false,
          error: `HTTP ${status}`,
        };
      }

      await page.waitForSelector("body", { timeout: 5_000 }).catch(() => {});

      const title = await extractTitle(page);
      const { text, wordCount } = await extractContent(page);
      const links = await extractLinks(page, url);
      const paginationNext = await detectPaginationNext(page, url);

      log("[web-search-local] Page scraped (playwright)", { url, wordCount, linksFound: links.length });

      return { url, title, content: text, wordCount, links, paginationNext, success: true };
    } finally {
      await releasePage(context);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Browser launch failures trigger fetch fallback (return null)
    if (message.includes("Timeout") && message.includes("launch")) {
      log("[web-search-local] Browser launch failed, falling back to fetch", { url });
      return null;
    }
    if (message.includes("Failed to launch any browser")) {
      log("[web-search-local] No browser available, falling back to fetch", { url });
      return null;
    }
    log("[web-search-local] Page scrape failed (playwright)", { url, error: message });
    return {
      url,
      title: "",
      content: "",
      wordCount: 0,
      links: [],
      paginationNext: null,
      success: false,
      error: message,
    };
  }
}

async function scrapeWithFetch(url: string): Promise<PageResult> {
  try {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(PAGE_LOAD_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        url,
        title: "",
        content: "",
        wordCount: 0,
        links: [],
        paginationNext: null,
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const title = extractTitleFromHtml(html);
    const content = extractTextFromHtml(html);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const links = extractLinksFromHtml(html, url);
    const paginationNext = detectPaginationNextFromHtml(html, url);

    log("[web-search-local] Page scraped (fetch)", { url, wordCount, linksFound: links.length });

    return { url, title, content, wordCount, links, paginationNext, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("[web-search-local] Page scrape failed (fetch)", { url, error: message });
    return {
      url,
      title: "",
      content: "",
      wordCount: 0,
      links: [],
      paginationNext: null,
      success: false,
      error: message,
    };
  }
}

function extractTitleFromHtml(html: string): string {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? "";
}

function extractTextFromHtml(html: string): string {
  // Remove script, style, nav, header, footer, aside blocks
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Try to find main content area
  const mainMatch = /<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i.exec(cleaned);
  if (mainMatch && mainMatch[1].length > 200) {
    cleaned = mainMatch[1];
  }

  // Strip remaining tags and normalize whitespace
  const text = cleaned
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();

  const words = text.split(/\s+/);
  return words.slice(0, MAX_CONTENT_WORDS).join(" ");
}

function extractLinksFromHtml(html: string, baseUrl: string): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  const pattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null && links.length < 50) {
    const [, href, text] = match;
    const trimmedText = text.trim();
    if (!href || !trimmedText || trimmedText.length > 200) continue;
    if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("#")) continue;

    try {
      const resolved = new URL(href, baseUrl).toString();
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      links.push({ text: trimmedText, url: resolved, location: "main" });
    } catch {
      // invalid URL, skip
    }
  }

  return links;
}
