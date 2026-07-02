import type { PageLink } from "./types";
import { CONTENT_SELECTORS, NAV_SELECTORS, NOISE_CLASS_PATTERNS, MAX_CONTENT_WORDS } from "./constants";

type Page = { evaluate: (fn: Function, arg?: unknown) => Promise<unknown>; title: () => Promise<string> };

export async function extractContent(page: Page): Promise<{ text: string; wordCount: number }> {
  const text = (await page.evaluate(
    (args: { contentSelectors: string[]; navSelectors: string[]; noisePatterns: string[]; maxWords: number }) => {
      const { contentSelectors, navSelectors, noisePatterns, maxWords } = args;

      function isNoisy(el: any): boolean {
        const classAndId = `${el.className} ${el.id}`;
        return noisePatterns.some((p: string) => new RegExp(p, "i").test(classAndId));
      }

      function stripTags(root: any): void {
        const toRemove = root.querySelectorAll("script, style, noscript, svg, iframe, " + navSelectors.join(", "));
        toRemove.forEach((el: any) => el.remove());

        const allElements = root.querySelectorAll("*");
        allElements.forEach((el: any) => {
          if (isNoisy(el)) el.remove();
        });
      }

      // Try content-specific selectors first
      for (const selector of contentSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim().length > 200) {
          const clone = el.cloneNode(true);
          stripTags(clone);
          const text = clone.textContent?.trim() || "";
          const words = text.split(/\s+/);
          return words.slice(0, maxWords).join(" ");
        }
      }

      // Fallback: body with noise stripped
      const body = document.body.cloneNode(true);
      stripTags(body);
      const text = body.textContent?.trim() || "";
      const words = text.split(/\s+/);
      return words.slice(0, maxWords).join(" ");
    },
    {
      contentSelectors: CONTENT_SELECTORS,
      navSelectors: NAV_SELECTORS,
      noisePatterns: NOISE_CLASS_PATTERNS.map((p) => p.source),
      maxWords: MAX_CONTENT_WORDS,
    },
  )) as string;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { text, wordCount };
}

export async function extractLinks(page: Page, baseUrl: string): Promise<PageLink[]> {
  const rawLinks = (await page.evaluate(
    (args: { navSels: string[]; contentSels: string[] }) => {
      const { navSels, contentSels } = args;
      const results: Array<{ text: string; href: string; location: string }> = [];
      const seen = new Set<string>();

      const classifyBySelector = (current: any, navSels2: string[], contentSels2: string[]): string | null => {
        for (const sel of navSels2) {
          if (!current.matches?.(sel)) continue;
          if (sel.includes("footer") || sel.includes("contentinfo")) return "footer";
          if (sel.includes("nav") || sel.includes("banner")) return "nav";
          return "sidebar";
        }
        for (const sel of contentSels2) {
          if (current.matches?.(sel)) return "main";
        }
        return null;
      };

      const classifyByTag = (tag: string): string | null => {
        if (tag === "nav" || tag === "header") return "nav";
        if (tag === "footer") return "footer";
        if (tag === "aside") return "sidebar";
        return null;
      };

      const getLocation = (el: any): string => {
        let current = el;
        while (current) {
          const byTag = classifyByTag(current.tagName?.toLowerCase());
          if (byTag) return byTag;
          const bySel = classifyBySelector(current, navSels, contentSels);
          if (bySel) return bySel;
          current = current.parentElement;
        }
        return "main";
      };

      const anchors = document.querySelectorAll("a[href]");
      anchors.forEach((a: any) => {
        const href = a.href;
        const text = a.textContent?.trim() || "";
        if (!href || !text || text.length > 200 || seen.has(href)) return;
        if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("#")) return;
        seen.add(href);
        results.push({ text, href, location: getLocation(a) });
      });

      return results;
    },
    { navSels: NAV_SELECTORS, contentSels: CONTENT_SELECTORS },
  )) as Array<{ text: string; href: string; location: string }>;

  return rawLinks
    .filter((link) => {
      try {
        new globalThis.URL(link.href, baseUrl);
        return true;
      } catch {
        return false;
      }
    })
    .map((link) => ({
      text: link.text,
      url: new globalThis.URL(link.href, baseUrl).toString(),
      location: link.location as PageLink["location"],
    }));
}

export async function extractTitle(page: Page): Promise<string> {
  return await page.title();
}
