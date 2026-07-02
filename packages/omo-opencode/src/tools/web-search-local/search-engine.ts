import type { SearchResult } from "./types";
import { DUCKDUCKGO_LITE_URL, USER_AGENTS } from "./constants";
import { log } from "../../shared/logger";

/**
 * Fetch-based DuckDuckGo search (no browser needed).
 * DuckDuckGo HTML lite version returns plain HTML that we parse with regex.
 */
export async function searchDuckDuckGo(query: string, maxResults: number, _headless: boolean): Promise<SearchResult[]> {
  try {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    const response = await fetch(DUCKDUCKGO_LITE_URL, {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      log("[web-search-local] DuckDuckGo returned non-OK status", { status: response.status });
      return [];
    }

    const html = await response.text();
    const results = parseDuckDuckGoLiteHtml(html, maxResults);

    log("[web-search-local] DuckDuckGo search completed", {
      query,
      resultCount: results.length,
    });

    return results;
  } catch (error) {
    log("[web-search-local] DuckDuckGo search failed", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function parseDuckDuckGoLiteHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG HTML version uses <a class="result__a" href="URL">TITLE</a>
  // and <a class="result__snippet" ...>SNIPPET</a>
  const linkPattern = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1].replaceAll("&amp;", "&");
    const title = match[2].trim();
    if (title && href && !href.includes("duckduckgo.com")) {
      links.push({ url: href, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || "",
    });
  }

  // Fallback: extract links from table rows if class-based parsing fails
  if (results.length === 0) {
    const hrefPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{5,200})<\/a>/gi;
    const seen = new Set<string>();

    while ((match = hrefPattern.exec(html)) !== null && results.length < maxResults) {
      const href = match[1].replaceAll("&amp;", "&");
      const title = match[2].trim();
      if (seen.has(href) || href.includes("duckduckgo.com")) continue;
      seen.add(href);
      results.push({ title, url: href, snippet: "" });
    }
  }

  return results;
}
