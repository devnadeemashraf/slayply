export type DetectedQuestion = {
  label: string;
  type: "text" | "longtext" | "choice";
  required: boolean;
  /** From the field's `maxlength` or a "(max 500 characters)" note in its label. */
  maxChars: number | null;
};

export type PageSnapshot = {
  title: string;
  ogTitle: string;
  ogSiteName: string;
  /** Raw `application/ld+json` blocks; parsed (and distrusted) by `extractJobFields`. */
  jsonLd: string[];
  text: string;
  /** Labels of the free-text and choice fields on the page. Field values are never read. */
  questions: DetectedQuestion[];
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

  const questions = detectQuestions();

  return {
    title: (doc.title ?? "").trim(),
    ogTitle: meta("og:title"),
    ogSiteName: meta("og:site_name"),
    jsonLd: Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => script.textContent ?? "")
      .filter((block) => block.length > 0 && block.length <= 200_000)
      .slice(0, 10),
    text: text.slice(0, maxChars),
    questions,
  };

  // Application questions: the labels of text, textarea, select and radio fields. This reads label,
  // legend and aria text and the `maxlength`, `required` and `type` attributes only, never a value,
  // and skips identity, upload, demographic, hidden and search fields.
  function detectQuestions(): DetectedQuestion[] {
    const maxQuestions = 40;
    const identity =
      /\b(first name|last name|full name|your name|legal name|preferred name|e-?mail|phone|mobile|resume|cv|cover letter|linkedin|github|twitter|website|portfolio|(?:home|mailing|street|current|residential|billing|your|email) address|address line|^address|^city|zip|postal|gender|race|ethnic\w*|veteran|disability|pronouns?|hispanic|sexual|birth|birthday|signature|passport|nationality|citizenship|marital|religion|social security|ssn)\b/i;
    // The field's own name or id betrays identity and contact fields even when the label is vague.
    const identityAttr =
      /(first|last|full|given|family|legal|preferred)[-_ ]?name|e-?mail|phone|mobile|resume|\bcv\b|linkedin|github|portfolio|website|address|zip|postal|gender|ethnic|race|veteran|disabilit|pronoun|\bssn\b|birth|nationality|citizenship|marital|religion/i;
    const searchHint = /search/i;
    const view = doc.defaultView;
    const textTypes = ["", "text", "radio"];
    const hiddenStyle = /display\s*:\s*none|visibility\s*:\s*hidden/i;

    // The page and every open shadow root, found by looking at the elements themselves.
    const roots: ParentNode[] = [];
    const queue: ParentNode[] = [doc];
    let scanned = 0;
    while (queue.length > 0 && roots.length < 20) {
      const root = queue.shift() as ParentNode;
      roots.push(root);
      for (const element of Array.from(root.querySelectorAll("*"))) {
        if (++scanned > 5000) break;
        const shadow = (element as Element).shadowRoot;
        if (shadow) queue.push(shadow as unknown as ParentNode);
      }
    }

    // Label text without anything inside a form control: a wrapped textarea's default text or a
    // select's options are values, not label.
    const skipInLabel = ["textarea", "select", "input", "option", "script", "style"];
    const gather = (node: Node, depth: number): string => {
      if (depth > 12) return "";
      if (node.nodeType === 3) return node.textContent ?? "";
      if (node.nodeType !== 1) return "";
      if (skipInLabel.includes((node as Element).tagName.toLowerCase())) return "";
      return Array.from(node.childNodes)
        .map((child) => gather(child, depth + 1))
        .join(" ");
    };
    const textOf = (node: Element | null | undefined): string =>
      node ? gather(node, 0).replace(/\s+/g, " ").trim() : "";
    const byId = (root: ParentNode, id: string): Element | null =>
      /^[^"\\\s]+$/.test(id) ? root.querySelector(`[id="${id}"]`) : null;

    const isHidden = (element: Element): boolean => {
      let node: Element | null = element;
      for (let depth = 0; node && depth < 25; depth++) {
        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute("role");
        let styled = false;
        try {
          const computed =
            typeof view?.getComputedStyle === "function" ? view.getComputedStyle(node) : null;
          styled = computed?.display === "none" || computed?.visibility === "hidden";
        } catch {
          // Not every environment can compute styles; the attribute checks below still apply.
        }
        if (
          styled ||
          node.hasAttribute("hidden") ||
          node.getAttribute("aria-hidden") === "true" ||
          hiddenStyle.test(node.getAttribute("style") ?? "") ||
          tag === "nav" ||
          tag === "header" ||
          tag === "footer" ||
          role === "search" ||
          role === "navigation"
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const labelOf = (control: Element, root: ParentNode, isRadio: boolean): string => {
      const group = control.closest("fieldset, [role=radiogroup], [role=group]");
      const groupLabel = (): string => {
        if (!group) return "";
        const legend = textOf(group.querySelector("legend"));
        if (legend) return legend;
        const ids = (group.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
        return (
          textOf(ids.map((id) => byId(root, id)).find(Boolean)) ||
          (group.getAttribute("aria-label") ?? "")
        );
      };
      if (isRadio) return groupLabel();
      const ids = (control.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const labelled = ids
        .map((id) => textOf(byId(root, id)))
        .filter(Boolean)
        .join(" ");
      if (labelled) return labelled;
      const aria = control.getAttribute("aria-label");
      if (aria?.trim()) return aria;
      const id = control.getAttribute("id") ?? "";
      const forLabel = /^[^"\\\s]+$/.test(id)
        ? textOf(root.querySelector(`label[for="${id}"]`))
        : "";
      return (
        forLabel ||
        textOf(control.closest("label")) ||
        groupLabel() ||
        (control.getAttribute("placeholder") ?? "")
      );
    };

    const found: DetectedQuestion[] = [];
    const seenLabels = new Set<string>();
    const seenRadios = new Set<string>();
    const forms: Element[] = [];
    for (const root of roots) {
      for (const control of Array.from(root.querySelectorAll("textarea, input, select"))) {
        if (found.length >= maxQuestions) return found;
        const tag = control.tagName.toLowerCase();
        const kind = (control.getAttribute("type") ?? "").toLowerCase();
        if (tag === "input" && !textTypes.includes(kind)) continue;
        const autocomplete = (control.getAttribute("autocomplete") ?? "").toLowerCase();
        if (autocomplete !== "" && autocomplete !== "on" && autocomplete !== "off") continue;
        if (isHidden(control)) continue;
        const role = control.getAttribute("role");
        const hint = `${control.getAttribute("name") ?? ""} ${control.getAttribute("id") ?? ""}`;
        if (
          kind === "search" ||
          role === "searchbox" ||
          role === "combobox" ||
          control.getAttribute("enterkeyhint") === "search" ||
          searchHint.test(hint) ||
          searchHint.test(control.getAttribute("placeholder") ?? "") ||
          identityAttr.test(hint)
        ) {
          continue;
        }

        const isRadio = tag === "input" && kind === "radio";
        if (isRadio) {
          const group = control.getAttribute("name") ?? "";
          // Two forms may reuse a group name, so the key includes which form the radio is in.
          const form = control.closest("form");
          let formIndex = form ? forms.indexOf(form) : -1;
          if (form && formIndex < 0) formIndex = forms.push(form) - 1;
          const groupKey = `${formIndex}:${group}`;
          if (group === "" || seenRadios.has(groupKey)) continue;
          seenRadios.add(groupKey);
        }

        let label = labelOf(control, root, isRadio).replace(/\s+/g, " ").trim();
        const required =
          control.hasAttribute("required") ||
          control.getAttribute("aria-required") === "true" ||
          /\*\s*$|\(\s*required\s*\)/i.test(label);
        label = label
          .replace(/\s*\(\s*(?:required|mandatory)\s*\)\s*/gi, " ")
          .replace(/\s*\*+\s*$/, "")
          .trim()
          .slice(0, 300);
        if (label === "" || (label.length <= 100 && identity.test(label))) continue;
        const key = label.toLowerCase();
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);

        const attr = Number.parseInt(control.getAttribute("maxlength") ?? "", 10);
        // "(max 500 characters)" and "500 characters maximum" are limits; "at least 100 characters" is not.
        const note =
          /(?:max(?:imum)?\.?|up to|limit(?: of)?|no more than|at most|within|under)\s*(?:of\s*)?(\d[\d,]{1,6})\s*(?:characters|chars)\b/i.exec(
            label,
          ) ?? /(\d[\d,]{1,6})\s*(?:characters|chars)\s*(?:max|maximum|limit)\b/i.exec(label);
        const limit =
          attr > 0 ? attr : note ? Number.parseInt(note[1]?.replace(/,/g, "") ?? "", 10) : 0;
        found.push({
          label,
          type: tag === "textarea" ? "longtext" : tag === "select" || isRadio ? "choice" : "text",
          required,
          maxChars: limit > 0 && limit <= 100_000 ? limit : null,
        });
      }
    }
    return found;
  }
}
