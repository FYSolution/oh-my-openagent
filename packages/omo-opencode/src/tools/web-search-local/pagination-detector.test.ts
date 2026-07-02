import { describe, expect, it } from "bun:test";
import { detectPaginationNextFromHtml } from "./pagination-detector";

describe("detectPaginationNextFromHtml", () => {
  describe("#given a page with a <link rel='next'> tag", () => {
    it("#when detecting #then returns the declared absolute url regardless of pattern", () => {
      // given
      const html = `<html><head><link rel="next" href="/articles?after=abc123"></head><body></body></html>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/articles");
      // then
      expect(next).toBe("https://example.com/articles?after=abc123");
    });
  });

  describe("#given an anchor with rel='prev next'", () => {
    it("#when detecting #then still resolves the next href", () => {
      // given
      const html = `<a rel="prev next" href="https://example.com/page/2">More</a>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/page/1");
      // then
      expect(next).toBe("https://example.com/page/2");
    });
  });

  describe("#given a pagination container with a next-labeled anchor", () => {
    it("#when detecting #then returns the container's next link", () => {
      // given
      const html = `
        <nav class="pagination">
          <a href="/list?page=1">1</a>
          <a href="/list?page=2" aria-label="Next page">›</a>
        </nav>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/list?page=1");
      // then
      expect(next).toBe("https://example.com/list?page=2");
    });
  });

  describe("#given a 'next steps' prose link outside any pagination container", () => {
    it("#when detecting #then does not falsely match it", () => {
      // given
      const html = `<article><a href="/next-steps">next steps</a></article>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/guide");
      // then
      expect(next).toBeNull();
    });
  });

  describe("#given only a numeric ?page anchor and no rel/container", () => {
    it("#when detecting #then infers current page + 1 on the same origin", () => {
      // given
      const html = `<a href="?page=4">4</a><a href="?page=5">5</a>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/blog?page=4");
      // then
      expect(next).toBe("https://example.com/blog?page=5");
    });
  });

  describe("#given a next anchor pointing to a different origin", () => {
    it("#when detecting via page-number inference #then ignores the cross-origin link", () => {
      // given
      const html = `<a href="https://other.com/blog?page=2">2</a>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/blog?page=1");
      // then
      expect(next).toBeNull();
    });
  });

  describe("#given a page with no pagination signals", () => {
    it("#when detecting #then returns null", () => {
      // given
      const html = `<html><body><p>just content</p><a href="/about">about</a></body></html>`;
      // when
      const next = detectPaginationNextFromHtml(html, "https://example.com/");
      // then
      expect(next).toBeNull();
    });
  });
});
