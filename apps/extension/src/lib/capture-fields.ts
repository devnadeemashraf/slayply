export type JobFields = { title: string; company: string; location: string; salary: string };

export type FieldSource = {
  text: string;
  title?: string;
  ogTitle?: string;
  ogSiteName?: string;
  jsonLd?: readonly string[];
};

const FIELD_MAX = 120;
const CURRENCY = "(?:[$£€]|USD|EUR|GBP|CAD|AUD)";
const AMOUNT = String.raw`${CURRENCY}\s?\d[\d,.]*\s?[kK]?`;
const PERIOD = String.raw`(?:\s?(?:\/|per\s|a\s)\s?(?:yr|year|hour|hr|month|annum))?`;
const RANGE = new RegExp(
  String.raw`${AMOUNT}\s?(?:-|–|—|to)\s?(?:${CURRENCY})?\s?\d[\d,.]*\s?[kK]?${PERIOD}`,
  "i",
);
const SALARY_LINE = /(salary|compensation|pay|base|range)/i;
const LOCATION_LINE = /^\s*(?:location|where)\s*[:-]\s*(.{2,80}?)\s*$/im;

const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, FIELD_MAX) : "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function findJobPosting(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(node);
  if (!record) return null;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return record;
  return findJobPosting(record["@graph"], depth + 1);
}

function parseJobPosting(blocks: readonly string[]): Record<string, unknown> | null {
  for (const block of blocks) {
    try {
      const found = findJobPosting(JSON.parse(block));
      if (found) return found;
    } catch {
      // Malformed page data is ignored; the text heuristics still run.
    }
  }
  return null;
}

function structuredLocation(posting: Record<string, unknown>): string {
  const place = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
  const address = asRecord(asRecord(place)?.address);
  const parts = [address?.addressLocality, address?.addressRegion, address?.addressCountry]
    .map(clean)
    .filter((part) => part !== "");
  if (parts.length > 0) return parts.join(", ");
  return posting.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
}

function structuredSalary(posting: Record<string, unknown>): string {
  const salary = asRecord(posting.baseSalary);
  const value = asRecord(salary?.value);
  if (!salary || !value) return "";
  const min = Number(value.minValue);
  const max = Number(value.maxValue);
  const currency = clean(salary.currency);
  const format = (amount: number) => amount.toLocaleString("en-US");
  const unit = { YEAR: "per year", MONTH: "per month", HOUR: "per hour" }[
    clean(value.unitText).toUpperCase() as "YEAR"
  ];
  const range =
    Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0
      ? `${format(min)} – ${format(max)}`
      : Number.isFinite(max) && max > 0
        ? format(max)
        : "";
  return range === "" ? "" : [currency, range, unit].filter(Boolean).join(" ");
}

function salaryFromText(text: string): string {
  // A pay range on a line that talks about pay wins; a lone amount ("$5 million") never counts.
  for (const line of text.split("\n")) {
    const match = SALARY_LINE.test(line) ? RANGE.exec(line) : null;
    if (match) return clean(match[0]);
  }
  const anywhere = RANGE.exec(text);
  return anywhere ? clean(anywhere[0]) : "";
}

function splitTitle(pageTitle: string): { title: string; company: string } {
  const at = /^(.{2,100}?)\s+at\s+(.{2,60}?)(?:\s+[|–—-]\s+.*)?$/i.exec(pageTitle);
  if (at) return { title: clean(at[1]), company: clean(at[2]) };
  const parts = pageTitle
    .split(/\s[|–—-]\s/)
    .map(clean)
    .filter(Boolean);
  if (parts.length === 0) return { title: "", company: "" };
  // "Company - Title" and "Title - Company" are both common; the heading below settles it.
  return { title: parts[0] ?? "", company: parts[1] ?? "" };
}

/** Best-effort title, company, location and salary. Anything it cannot find stays empty. */
export function extractJobFields(source: FieldSource): JobFields {
  const posting = parseJobPosting(source.jsonLd ?? []);
  const fromTitle = splitTitle(clean(source.ogTitle) || clean(source.title));

  let title = clean(posting?.title) || fromTitle.title;
  let company =
    clean(asRecord(posting?.hiringOrganization)?.name) ||
    (fromTitle.company !== "" && !source.ogTitle ? fromTitle.company : "") ||
    clean(source.ogSiteName);

  // "Northwind - Staff Data Engineer": the first part is the company when it matches the site name.
  if (!posting && title !== "" && title === clean(source.ogSiteName) && fromTitle.company !== "") {
    title = fromTitle.company;
    company = clean(source.ogSiteName);
  }

  const location =
    (posting ? structuredLocation(posting) : "") || clean(LOCATION_LINE.exec(source.text)?.[1]);
  const salary = (posting ? structuredSalary(posting) : "") || salaryFromText(source.text);
  return { title, company, location, salary };
}
