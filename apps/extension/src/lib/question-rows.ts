import { LIMITS } from "@slayply/core";
import type { DetectedQuestion } from "./page-snapshot.js";

export type QuestionRow = {
  id: string;
  text: string;
  maxChars: number | null;
  checked: boolean;
};

export type SendQuestion = { id: string; text: string; maxChars?: number };

/** Row ids are `q<number>`, one above the highest in the list, so a new row never collides with a kept one. */
export function highestId(rows: readonly QuestionRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id.slice(1)) || 0), 0);
}

/** `floor` is the highest number ever used in this session, so a removed row's id is not handed out again. */
function nextId(rows: readonly QuestionRow[], floor = 0): string {
  return `q${Math.max(highestId(rows), floor) + 1}`;
}

const clampText = (text: string): string => text.slice(0, LIMITS.questionChars);

/** Free-text questions start checked; choices (yes/no, dropdowns) start unchecked, since they rarely need drafting. */
export function replaceWithDetected(
  detected: readonly DetectedQuestion[],
  floor = 0,
): QuestionRow[] {
  const rows: QuestionRow[] = [];
  for (const question of detected.slice(0, LIMITS.maxQuestions)) {
    rows.push({
      id: nextId(rows, floor),
      text: clampText(question.label),
      maxChars: question.maxChars,
      checked: question.type !== "choice",
    });
  }
  return rows;
}

export function addRow(rows: readonly QuestionRow[], text = "", floor = 0): QuestionRow[] {
  if (rows.length >= LIMITS.maxQuestions) return [...rows];
  return [
    ...rows,
    { id: nextId(rows, floor), text: clampText(text), maxChars: null, checked: true },
  ];
}

/** Adds a captured question unless the same text is already listed. */
export function appendRow(rows: readonly QuestionRow[], text: string, floor = 0): QuestionRow[] {
  const wanted = text.trim().toLowerCase();
  if (wanted === "" || rows.some((row) => row.text.trim().toLowerCase() === wanted))
    return [...rows];
  return addRow(rows, text.trim(), floor);
}

export function updateRow(
  rows: readonly QuestionRow[],
  id: string,
  patch: Partial<Omit<QuestionRow, "id">>,
): QuestionRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function removeRow(rows: readonly QuestionRow[], id: string): QuestionRow[] {
  return rows.filter((row) => row.id !== id);
}

const validLimit = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value > 0 && value <= LIMITS.questionMaxChars;

/** The questions to send: all checked, non-empty rows, or just `onlyId` (even if unchecked). */
export function rowsToQuestions(rows: readonly QuestionRow[], onlyId?: string): SendQuestion[] {
  return rows
    .filter((row) => (onlyId === undefined ? row.checked : row.id === onlyId))
    .map((row) => ({ id: row.id, text: row.text.trim(), maxChars: row.maxChars }))
    .filter((row) => row.text !== "")
    .map((row) => ({
      id: row.id,
      text: row.text,
      ...(validLimit(row.maxChars) ? { maxChars: row.maxChars } : {}),
    }));
}
