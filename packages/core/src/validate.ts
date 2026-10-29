import type { z } from "zod";
import { MAX_PAYLOAD_BYTES } from "./limits.js";
import {
  type GenerateRequest,
  type GenerateResponse,
  generateRequestSchema,
  generateResponseSchema,
} from "./schema.js";

export type ValidationIssue = {
  /** Dot-separated path to the offending field, or `$` for the document root. */
  path: string;
  message: string;
};

export type ValidationSuccess<T> = { success: true; data: T };

export type ValidationFailure = {
  success: false;
  issues: ValidationIssue[];
  /** The input exactly as received, so callers can fall back to showing raw text. */
  rawInput: unknown;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export type ResponseValidationFailure = ValidationFailure & {
  /** Ready-to-send message asking the model to repair its JSON (spec §6: retry once). */
  retryPrompt: string;
};

export type ResponseValidationResult =
  | ValidationSuccess<GenerateResponse>
  | ResponseValidationFailure;

function fail(rawInput: unknown, issues: ValidationIssue[]): ValidationFailure {
  return { success: false, issues, rawInput };
}

function parseJsonObject(input: unknown): { value: unknown } | { issue: ValidationIssue } {
  let value = input;

  if (typeof input === "string") {
    // String length is a lower bound on byte length, so this never rejects a valid payload.
    if (input.length > MAX_PAYLOAD_BYTES) {
      return { issue: { path: "$", message: `Input exceeds ${MAX_PAYLOAD_BYTES} bytes` } };
    }
    try {
      value = JSON.parse(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      return { issue: { path: "$", message: `Invalid JSON: ${message}` } };
    }
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { issue: { path: "$", message: "Expected a JSON object" } };
  }
  return { value };
}

function validateWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ValidationResult<z.infer<S>> {
  const parsed = parseJsonObject(input);
  if ("issue" in parsed) return fail(input, [parsed.issue]);

  const result = schema.safeParse(parsed.value);
  if (result.success) return { success: true, data: result.data };

  return fail(
    input,
    result.error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "$",
      message: issue.message,
    })),
  );
}

/** Validates a client request; accepts an object or a raw JSON string. */
export function validateGenerateRequest(input: unknown): ValidationResult<GenerateRequest> {
  return validateWith(generateRequestSchema, input);
}

/** Validates model output; on failure includes a prompt asking the model to repair it. */
export function validateGenerateResponse(input: unknown): ResponseValidationResult {
  const result = validateWith(generateResponseSchema, input);
  if (result.success) return result;
  return { ...result, retryPrompt: formatRetryPrompt(result.issues) };
}

/** Builds the one-shot repair message sent back to the model after a failed validation. */
export function formatRetryPrompt(issues: readonly ValidationIssue[]): string {
  const lines = issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  return [
    "Your previous reply failed schema validation.",
    "",
    "Problems:",
    ...lines,
    "",
    "Reply again with ONLY a valid JSON object matching the GenerateResponse schema.",
    "No markdown fences and no commentary.",
  ].join("\n");
}
