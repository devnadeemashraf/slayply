export type PageSnapshot = {
  title: string;
  ogTitle: string;
  ogSiteName: string;
  /** Raw `application/ld+json` blocks; parsed (and distrusted) by `extractJobFields`. */
  jsonLd: string[];
  text: string;
};

/**
 * Reads what the user can see on a job page. It is injected into the tab with
 * `chrome.scripting.executeScript`, which serialises the function, so it must stay self-contained:
 * no imports and no module-level helpers; `doc` defaults to the page's own `document` because the browser
 * calls it with no arguments. It only reads; it never writes to the page.
 */
export function snapshotPage(doc: Document = document, maxChars = 60_000): PageSnapshot {
  const meta = (property: string): string =>
    doc.querySelector(`meta[property="${property}"]`)?.getAttribute("content")?.trim() ?? "";

  const readText = (element: Element): string => {
    // innerText keeps line breaks and skips hidden text; textContent is the fallback (and what tests see).
    // biome-ignore lint/performance/useDomNodeTextContent: layout-aware text is the point here
    const raw = (element as HTMLElement).innerText ?? element.textContent ?? "";
    return raw
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // Prefer the main landmark; a short one is likely a shell, so fall back to the whole body.
  let text = "";
  for (const element of Array.from(doc.querySelectorAll("main, [role=main], article"))) {
    const candidate = readText(element);
    if (candidate.length > text.length) text = candidate;
  }
  if (text.length < 200 && doc.body) {
    const body = readText(doc.body);
    if (body.length > text.length) text = body;
  }

  return {
    title: (doc.title ?? "").trim(),
    ogTitle: meta("og:title"),
    ogSiteName: meta("og:site_name"),
    jsonLd: Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => script.textContent ?? "")
      .filter((block) => block.length > 0 && block.length <= 200_000)
      .slice(0, 10),
    text: text.slice(0, maxChars),
  };
}
