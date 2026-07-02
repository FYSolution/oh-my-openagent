import { PAGINATION_SELECTORS, PAGINATION_NEXT_PATTERNS, PAGINATION_REGION_MAX_CHARS } from "./constants";

type Page = { evaluate: (fn: Function, arg?: unknown) => Promise<unknown> };

export async function detectPaginationNext(page: Page, currentUrl: string): Promise<string | null> {
  const result = await page.evaluate(
    (args: { selectors: string[]; nextPatterns: string[]; baseUrl: string }) => {
      const { selectors, nextPatterns, baseUrl } = args;

      const findRelNextLink = (): string | null => {
        const relNext = document.querySelector("link[rel='next']");
        return relNext?.href ?? null;
      };

      const findNextInPaginationContainers = (): string | null => {
        for (const selector of selectors) {
          const container = document.querySelector(selector);
          if (!container) continue;
          const links = container.querySelectorAll("a[href]");
          for (const link of links) {
            const combined = `${link.textContent?.trim() || ""} ${link.getAttribute("aria-label") || ""}`;
            for (const patternStr of nextPatterns) {
              if (new RegExp(patternStr, "i").test(combined)) return link.href as string;
            }
          }
        }
        return null;
      };

      const findNextByPageNumber = (): string | null => {
        const allLinks = document.querySelectorAll("a[href]");
        const currentUrlObj = new URL(baseUrl);
        const currentPage = Number.parseInt(currentUrlObj.searchParams.get("page") || currentUrlObj.searchParams.get("p") || "1");
        for (const link of allLinks) {
          try {
            const linkUrl = new URL(link.href, baseUrl);
            const linkPage = Number.parseInt(linkUrl.searchParams.get("page") || linkUrl.searchParams.get("p") || "0");
            if (linkPage === currentPage + 1 && linkUrl.origin === currentUrlObj.origin) return link.href as string;
          } catch {
            // invalid URL
          }
        }
        return null;
      };

      return findRelNextLink() ?? findNextInPaginationContainers() ?? findNextByPageNumber();
    },
    {
      selectors: PAGINATION_SELECTORS,
      nextPatterns: PAGINATION_NEXT_PATTERNS.map((p) => p.source),
      baseUrl: currentUrl,
    },
  );

  return result as string | null;
}

// Fetch-path equivalent of detectPaginationNext: works on a raw HTML string (no DOM).
// Mirrors the three browser strategies so pagination continuation also works in
// fetch-only mode (corporate environments where Playwright cannot launch).
export function detectPaginationNextFromHtml(html: string, currentUrl: string): string | null {
  return findRelNextInHtml(html, currentUrl) ?? findNextAnchorInHtml(html, currentUrl) ?? findNextByPageNumberInHtml(html, currentUrl);
}

function findRelNextInHtml(html: string, baseUrl: string): string | null {
  // <link rel="next" href="..."> or <a rel="next" href="..."> (rel may be "prev next" etc.)
  const tagPattern = /<(?:link|a)\b[^>]*\brel=["']?[^"'>]*\bnext\b[^"'>]*["']?[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const href = extractTagAttr(match[0], "href");
    const resolved = href ? resolveHref(href, baseUrl) : null;
    if (resolved) return resolved;
  }
  return null;
}

function findNextAnchorInHtml(html: string, baseUrl: string): string | null {
  // Only search inside pagination containers to avoid matching prose links like "next steps".
  for (const region of extractPaginationRegions(html)) {
    const found = findNextAnchorInRegion(region, baseUrl);
    if (found) return found;
  }
  return null;
}

function findNextAnchorInRegion(region: string, baseUrl: string): string | null {
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(region)) !== null) {
    const href = extractTagAttr(match[1], "href");
    if (!href) continue;
    const ariaLabel = extractTagAttr(match[1], "aria-label") ?? "";
    const combined = `${stripHtmlTags(match[2])} ${ariaLabel}`.trim();
    if (combined && PAGINATION_NEXT_PATTERNS.some((pattern) => pattern.test(combined))) {
      const resolved = resolveHref(href, baseUrl);
      if (resolved) return resolved;
    }
  }
  return null;
}

function findNextByPageNumberInHtml(html: string, baseUrl: string): string | null {
  let currentUrlObj: URL;
  try {
    currentUrlObj = new URL(baseUrl);
  } catch {
    return null;
  }
  const currentPage = Number.parseInt(currentUrlObj.searchParams.get("page") || currentUrlObj.searchParams.get("p") || "1", 10);
  const hrefPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    try {
      const linkUrl = new URL(match[1], baseUrl);
      const linkPage = Number.parseInt(linkUrl.searchParams.get("page") || linkUrl.searchParams.get("p") || "0", 10);
      if (linkPage === currentPage + 1 && linkUrl.origin === currentUrlObj.origin) return linkUrl.toString();
    } catch {
      // invalid URL, skip
    }
  }
  return null;
}

function extractPaginationRegions(html: string): string[] {
  const regions: string[] = [];
  const openTagPattern = /<(?:nav|ul|ol|div)\b[^>]*(?:class|id|aria-label)=["'][^"']*(?:pagination|pager|page-nav)[^"']*["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = openTagPattern.exec(html)) !== null) {
    regions.push(html.slice(match.index, match.index + PAGINATION_REGION_MAX_CHARS));
  }
  return regions;
}

function extractTagAttr(tag: string, name: string): string | null {
  const pattern = new RegExp(String.raw`\b${name}=["']([^"']*)["']`, "i");
  const match = pattern.exec(tag);
  return match ? match[1] : null;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHref(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("#")) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}
