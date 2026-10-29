import { ANSWER_LIMITS, OPTION_LABELS, type PublicAnswers } from "./context-answers.js";
import type { CompiledContext, KeyedText } from "./context-pack.js";
import { LIMITS } from "./limits.js";

/**
 * Turns questionnaire answers into profile facts, stories and preferences (ADR-0008).
 *
 * Honesty rules: every sentence is built only from what the user typed. Nothing is computed
 * (no tenure, no totals) and nothing is inferred (no added verbs or adjectives). A sentence whose
 * required parts are missing is skipped with a warning instead of being guessed.
 *
 * This takes `PublicAnswers`, which has no `private` section, so contact details, address and
 * current pay cannot reach the output.
 */

export type CompileResult = CompiledContext & { warnings: string[] };

const squash = (value: string | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();
const squashAll = (values: readonly string[] | undefined): string[] =>
  (values ?? []).map(squash).filter((v) => v !== "");
const sentence = (value: string): string => `${value.replace(/[.\s]+$/, "")}.`;
const label = (map: Record<string, string>, value: string | undefined): string =>
  value === undefined ? "" : (map[value] ?? value);

const CANNED_LABELS: Record<string, string> = {
  noticePeriod: "notice period",
  relocation: "relocation",
  salary: "salary",
  visa: "visa",
  startDate: "start date",
  whyLeaving: "why I am leaving",
  whyThisRole: "why this role",
  strengthsWeaknesses: "strengths and weaknesses",
};

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_LIKE = /\bhttps?:\/\/|\bwww\./i;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

function looksLikeContactDetails(text: string): boolean {
  if (EMAIL.test(text) || URL_LIKE.test(text)) return true;
  return (text.match(PHONE) ?? []).some((m) => m.replace(/\D/g, "").length >= 9);
}

export function compileAnswers(answers: PublicAnswers): CompileResult {
  const warnings: string[] = [];
  let facts: KeyedText[] = [];
  const stories: KeyedText[] = [];

  const add = (key: string, text: string) => {
    if (text.length > LIMITS.factChars) {
      warnings.push(`Left out a sentence that is too long (${key}).`);
      return;
    }
    facts.push({ key, text });
  };

  // --- About you ---
  const p = answers.profile;
  const identity = [
    squash(p.name) && `Name: ${squash(p.name)}`,
    squash(p.headline) && `Headline: ${squash(p.headline)}`,
  ].filter(Boolean);
  if (identity.length > 0) add("profile:identity", sentence(identity.join("; ")));
  const place = [squash(p.city), squash(p.country)].filter(Boolean).join(", ");
  if (place) add("profile:location", sentence(`Based in ${place}`));
  if (squash(p.timezone)) add("profile:timezone", sentence(`Timezone: ${squash(p.timezone)}`));
  const auth = label(OPTION_LABELS.workAuthorization, p.workAuthorization);
  const authNote = squash(p.workAuthorizationNote);
  if (auth || authNote) {
    add(
      "profile:auth",
      sentence(
        `Work authorization: ${auth && authNote ? `${auth} (${authNote})` : auth || authNote}`,
      ),
    );
  }
  if (squash(p.noticePeriod))
    add("profile:notice", sentence(`Notice period: ${squash(p.noticePeriod)}`));
  if (p.relocation) {
    add(
      "profile:relocation",
      sentence(`Open to relocation: ${label(OPTION_LABELS.relocation, p.relocation)}`),
    );
  }
  if (p.workMode && p.workMode.length > 0) {
    const modes = p.workMode.map((m) => label(OPTION_LABELS.workMode, m)).join(", ");
    add("profile:workmode", sentence(`Preferred work mode: ${modes}`));
  }
  if (squash(p.travelWillingness)) {
    add("profile:travel", sentence(`Willing to travel: ${squash(p.travelWillingness)}`));
  }

  // --- What you are looking for ---
  const t = answers.targets;
  const targetLists: Array<[string, string, string[]]> = [
    ["roles", "Target roles", squashAll(t.roles)],
    ["industries", "Target industries", squashAll(t.industries)],
    ["companySizes", "Preferred company sizes", squashAll(t.companySizes)],
    ["mustHaves", "Must-haves in a role", squashAll(t.mustHaves)],
    ["dealbreakers", "Dealbreakers", squashAll(t.dealbreakers)],
  ];
  for (const [key, title, items] of targetLists) {
    if (items.length > 0) add(`targets:${key}`, sentence(`${title}: ${items.join(", ")}`));
  }
  if (t.seniority) {
    add(
      "targets:seniority",
      sentence(`Target seniority: ${label(OPTION_LABELS.seniority, t.seniority)}`),
    );
  }
  const hasMin = t.salaryMin !== undefined;
  const hasMax = t.salaryMax !== undefined;
  if (hasMin || hasMax) {
    const currency = squash(t.salaryCurrency);
    if (hasMin && hasMax && (t.salaryMin ?? 0) > (t.salaryMax ?? 0)) {
      warnings.push("Skipped the salary range: the minimum is above the maximum.");
    } else if (!currency) {
      warnings.push("Skipped the salary range: add a currency (for example INR or USD).");
    } else {
      const amount =
        hasMin && hasMax
          ? `${t.salaryMin} to ${t.salaryMax}`
          : hasMin
            ? `at least ${t.salaryMin}`
            : `up to ${t.salaryMax}`;
      const period = t.salaryPeriod
        ? ` per ${label(OPTION_LABELS.salaryPeriod, t.salaryPeriod)}`
        : "";
      add("targets:salary", sentence(`Expected salary: ${amount} ${currency}${period}`));
    }
  }

  // --- Work experience ---
  answers.experience.forEach((e, index) => {
    const n = index + 1;
    const company = squash(e.company);
    const title = squash(e.title);
    const start = e.start ?? "";
    const end = e.end ?? "";
    if (!company || !title || !start) {
      warnings.push(`Skipped Experience #${n}: company, title and start month are required.`);
      return;
    }
    if (end && end !== "present" && start > end) {
      warnings.push(`Experience #${n}: the start month is after the end month. Check the dates.`);
    }
    const id = `exp:${e.entryId}`;
    const type = e.employmentType
      ? ` (${label(OPTION_LABELS.employmentType, e.employmentType)})`
      : "";
    const where = squash(e.location) ? ` in ${squash(e.location)}` : "";
    const when = end ? `${start} to ${end}` : `from ${start}`;
    add(`${id}:role`, sentence(`Role: ${title} at ${company}${type}${where}, ${when}`));

    const team = [
      e.teamSize !== undefined && `team of ${e.teamSize}`,
      squash(e.reportingLine) && `reported to ${squash(e.reportingLine)}`,
      e.companyStage && `company stage: ${label(OPTION_LABELS.companyStage, e.companyStage)}`,
    ].filter(Boolean);
    if (team.length > 0) add(`${id}:team`, sentence(`At ${company}: ${team.join("; ")}`));
    if (squash(e.scopeOwned))
      add(`${id}:scope`, sentence(`At ${company} I owned: ${squash(e.scopeOwned)}`));
    const stack = squashAll(e.stack);
    if (stack.length > 0)
      add(`${id}:stack`, sentence(`At ${company} the stack was: ${stack.join(", ")}`));
    (e.scaleMetrics ?? []).forEach((metric, i) => {
      if (squash(metric))
        add(`${id}:scale:${i}`, sentence(`At ${company}, scale: ${squash(metric)}`));
    });
    (e.achievements ?? []).forEach((a, i) => {
      const action = squash(a.action);
      if (!action) {
        if (squash(a.metric) || squash(a.result)) {
          warnings.push(`Skipped Experience #${n}, achievement ${i + 1}: describe what you did.`);
        }
        return;
      }
      if (!squash(a.metric)) {
        warnings.push(
          `Experience #${n}, achievement ${i + 1} has no metric. A number makes it stronger.`,
        );
      }
      const parts = [action, squash(a.metric), squash(a.result)].filter(Boolean);
      add(`${id}:ach:${i}`, sentence(`At ${company} (${title}): ${parts.join("; ")}`));
    });
    if (squash(e.leadership))
      add(`${id}:lead`, sentence(`At ${company}, leadership: ${squash(e.leadership)}`));
    if (squash(e.reasonForLeaving)) {
      add(`${id}:leave`, sentence(`Reason for leaving ${company}: ${squash(e.reasonForLeaving)}`));
    }
  });

  // --- Projects ---
  answers.projects.forEach((pr, index) => {
    const name = squash(pr.name);
    if (!name) {
      warnings.push(`Skipped Project #${index + 1}: a name is required.`);
      return;
    }
    const id = `proj:${pr.entryId}`;
    const role = squash(pr.role) ? `, role ${squash(pr.role)}` : "";
    const period = squash(pr.period) ? ` (${squash(pr.period)})` : "";
    add(`${id}:summary`, sentence(`Project: ${name}${role}${period}`));
    if (squash(pr.description))
      add(`${id}:desc`, sentence(`Project ${name}: ${squash(pr.description)}`));
    const stack = squashAll(pr.stack);
    if (stack.length > 0) add(`${id}:stack`, sentence(`Project ${name} used: ${stack.join(", ")}`));
    if (squash(pr.outcome))
      add(`${id}:outcome`, sentence(`Project ${name} outcome: ${squash(pr.outcome)}`));
  });

  // --- Education ---
  answers.education.forEach((ed, index) => {
    const school = squash(ed.institution);
    if (!school) {
      warnings.push(`Skipped Education #${index + 1}: an institution is required.`);
      return;
    }
    const degree = squash(ed.degree);
    const field = squash(ed.field);
    const what = degree && field ? `${degree} in ${field}` : degree || field;
    const start = ed.start ?? "";
    const end = ed.end ?? "";
    const when =
      start && end
        ? ` (${start} to ${end})`
        : end
          ? ` (ended ${end})`
          : start
            ? ` (from ${start})`
            : "";
    add(
      `edu:${ed.entryId}`,
      sentence(`Education: ${what ? `${what} at ${school}` : school}${when}`),
    );
    if (squash(ed.notes))
      add(`edu:${ed.entryId}:notes`, sentence(`Education note (${school}): ${squash(ed.notes)}`));
  });

  // --- Skills ---
  answers.skills.forEach((s, index) => {
    const name = squash(s.name);
    if (!name) {
      warnings.push(`Skipped Skill #${index + 1}: a name is required.`);
      return;
    }
    const details = [
      s.years !== undefined && `${s.years} ${s.years === 1 ? "year" : "years"}`,
      s.lastUsed && `last used ${s.lastUsed}`,
    ].filter(Boolean);
    const level = s.proficiency ? ` (${label(OPTION_LABELS.proficiency, s.proficiency)})` : "";
    add(
      `skill:${s.entryId}`,
      sentence(`Skill: ${name}${level}${details.map((d) => `, ${d}`).join("")}`),
    );
  });

  // --- Standard answers ---
  for (const [key, title] of Object.entries(CANNED_LABELS)) {
    const value = squash((answers.canned as Record<string, string | undefined>)[key]);
    if (value) add(`canned:${key}`, sentence(`Standard answer on ${title}: ${value}`));
  }

  // --- Stories ---
  answers.stories.forEach((s, index) => {
    const title = squash(s.title);
    const action = squash(s.action);
    const result = squash(s.result);
    if (!title || !action || !result) {
      warnings.push(`Skipped Story #${index + 1}: title, action and result are required.`);
      return;
    }
    const heading = s.category
      ? `${title} (${label(OPTION_LABELS.storyCategory, s.category)})`
      : title;
    const lines = [
      heading,
      squash(s.situation) && `Situation: ${squash(s.situation)}`,
      squash(s.task) && `Task: ${squash(s.task)}`,
      `Action: ${action}`,
      `Result: ${result}`,
      squash(s.metric) && `Metric: ${squash(s.metric)}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (text.length > LIMITS.factChars) {
      warnings.push(`Left out Story #${index + 1}: it is too long.`);
      return;
    }
    stories.push({ key: `story:${s.entryId}`, text });
  });

  // --- Voice and rules ---
  const v = answers.voice;
  const prefs: Record<string, string> = {};
  const setPref = (key: string, value: string) => {
    if (value) prefs[key] = value;
  };
  setPref("Writing tone", label(OPTION_LABELS.tone, v.tone));
  setPref("Formality", label(OPTION_LABELS.formality, v.formality));
  setPref("Preferred answer length", label(OPTION_LABELS.length, v.length));
  setPref("Point of view", label(OPTION_LABELS.person, v.person));
  setPref("Phrases to avoid", squashAll(v.avoidPhrases).join(", "));
  setPref("Signature phrases", squashAll(v.signaturePhrases).join(", "));
  setPref("Language", squash(v.language));
  // A leading "-", "*" or "1." would be read as a list marker when the pack is exported and re-read.
  const rules = squashAll(answers.neverClaim.statements)
    .map((r) => r.replace(/^(?:[-*]|\d+[.)])\s+/, ""))
    .filter((r) => r !== "");

  // --- Safety nets ---
  if (facts.length > ANSWER_LIMITS.maxCompiledFacts) {
    warnings.push(`Only the first ${ANSWER_LIMITS.maxCompiledFacts} facts were kept.`);
    facts = facts.slice(0, ANSWER_LIMITS.maxCompiledFacts);
  }
  for (const fact of facts) {
    if (looksLikeContactDetails(fact.text)) {
      warnings.push(
        `A sentence (${fact.key}) looks like it contains contact details. Put those under Private so they are not sent.`,
      );
    }
  }

  return { facts, stories, prefs, rules, warnings };
}

/** The markdown form of a compiled context: what `parseContextPack` reads back (PROF-01). */
export function renderContextPack(context: CompiledContext): string {
  const blocks: string[] = ["# Slayply context pack"];
  if (context.facts.length > 0) {
    blocks.push(["## Facts", ...context.facts.map((f) => `- ${f.text}`)].join("\n"));
  }
  if (context.stories.length > 0) {
    const rendered = context.stories.map((s) => {
      const [title = "", ...body] = s.text.split("\n");
      return [`### ${title}`, ...body].join("\n");
    });
    blocks.push(["## Stories", ...rendered].join("\n\n"));
  }
  const prefs = Object.entries(context.prefs);
  if (prefs.length > 0) {
    blocks.push(["## Preferences", ...prefs.map(([k, val]) => `- ${k}: ${val}`)].join("\n"));
  }
  if (context.rules.length > 0) {
    blocks.push(["## Rules", ...context.rules.map((r) => `- ${r}`)].join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}
