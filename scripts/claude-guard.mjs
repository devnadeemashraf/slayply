#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Policy hooks for Claude Code (.claude/settings.json). AGENTS.md is the source of truth for the
// rules; this file only enforces the ones a tool can check mechanically.

const PROTECTED_PATHS = [
  {
    test: (p) => p === "docs/SPEC.md",
    reason: "docs/SPEC.md changes only via an approved Spec change proposal (docs/ROADMAP.md §6).",
  },
  {
    test: (p) => p === "pnpm-lock.yaml",
    reason: "Lockfiles are generated. Change dependencies with pnpm instead of editing the file.",
  },
  {
    test: (p) => /(^|\/)(dist|\.output|\.wxt|\.turbo|coverage)\//.test(p),
    reason: "Generated build output must not be edited by hand.",
  },
  {
    test: (p) => p === "temp" || p.startsWith("temp/"),
    reason: "temp/ is off limits (AGENTS.md Never list).",
  },
  {
    test: (p) => /(^|\/)\.env(\..*)?$/.test(p) && !p.endsWith(".env.example"),
    reason: "Environment files hold secrets and must not be read or edited by agents.",
  },
  {
    test: (p) => p.endsWith(".pem"),
    reason: "Key material must not be read or edited by agents.",
  },
];

const FORMATTABLE = /\.(ts|tsx|js|mjs|cjs|json)$/;
const MAIN_BRANCHES = new Set(["main", "master"]);

export function normalizePath(filePath, cwd = process.cwd()) {
  // Treat backslashes as separators on every OS: on POSIX they are legal filename characters,
  // so without this `docs\SPEC.md` would not resolve to the protected file.
  const absolute = path.resolve(cwd, String(filePath).replaceAll("\\", "/"));
  return path.relative(cwd, absolute).split(path.sep).join("/");
}

export function checkFilePath(filePath, cwd = process.cwd()) {
  const relative = normalizePath(filePath, cwd);
  if (relative.startsWith("../")) return null; // outside the repo: not ours to police
  const rule = PROTECTED_PATHS.find((candidate) => candidate.test(relative));
  return rule ? `Blocked: ${relative}. ${rule.reason}` : null;
}

function splitSegments(command) {
  return String(command)
    .split(/&&|\|\||;|\n/)
    .map((segment) => segment.trim().replace(/^\(+/, "").trim())
    .filter(Boolean);
}

function targetsMain(tokens) {
  return tokens.some((token) => /^(\+?[^:\s]*:)?(refs\/heads\/)?(main|master)$/.test(token));
}

export function checkBashCommand(command, context = {}) {
  const currentBranch = context.currentBranch ?? "";
  const onMain = MAIN_BRANCHES.has(currentBranch);

  for (const segment of splitSegments(command)) {
    const tokens = segment.split(/\s+/);

    if (/^git\s+push\b/.test(segment)) {
      if (tokens.some((t) => t === "-f" || t.startsWith("--force"))) {
        return "Blocked: force-push is not allowed.";
      }
      if (targetsMain(tokens.slice(2)))
        return "Blocked: never push to main. Push a branch and open a PR.";
      const hasRefspec = tokens.slice(2).filter((t) => !t.startsWith("-")).length >= 2;
      if (onMain && !hasRefspec)
        return "Blocked: you are on main. Create a <type>/<ID>-<slug> branch.";
    }

    if (/^git\s+commit\b/.test(segment) && onMain) {
      return "Blocked: never commit to main. Create a <type>/<ID>-<slug> branch first.";
    }

    if (/^gh\s+pr\s+merge\b/.test(segment)) {
      return "Blocked: agents never merge PRs. The maintainer merges.";
    }
    if (/^git\s+merge\b/.test(segment) && onMain) {
      return "Blocked: never merge into main. The maintainer merges PRs.";
    }

    if (/^gh\s+pr\s+create\b/.test(segment)) {
      const changed = context.changedFiles ?? [];
      if (!changed.includes("docs/POINTER.md")) {
        return "Blocked: update docs/POINTER.md before opening a PR (PR loop step 10).";
      }
    }
  }
  return null;
}

export function evaluateToolCall(input, context = {}) {
  const toolInput = input?.tool_input ?? {};
  const cwd = input?.cwd ?? process.cwd();

  if (input?.tool_name === "Bash") {
    return checkBashCommand(toolInput.command, context);
  }

  const filePath = toolInput.file_path ?? toolInput.path ?? toolInput.notebook_path;
  if (typeof filePath === "string" && filePath) return checkFilePath(filePath, cwd);
  return null;
}

function git(command, cwd) {
  try {
    return execSync(`git ${command}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function gatherContext(input) {
  const cwd = input?.cwd ?? process.cwd();
  const command = input?.tool_input?.command ?? "";
  const context = { currentBranch: git("rev-parse --abbrev-ref HEAD", cwd) };
  if (/gh\s+pr\s+create/.test(command)) {
    context.changedFiles = git("diff --name-only origin/main...HEAD", cwd)
      .split(/\r?\n/)
      .filter(Boolean);
  }
  return context;
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function preTool() {
  const input = readStdin();
  const reason = evaluateToolCall(input, gatherContext(input));
  if (reason) {
    console.error(reason);
    process.exit(2); // exit code 2 blocks the tool call and feeds stderr back to the agent
  }
}

function sessionStart() {
  const pointer = path.resolve(process.cwd(), "docs/POINTER.md");
  if (!fs.existsSync(pointer)) return;
  console.log("Slayply session start. Follow AGENTS.md. Current docs/POINTER.md:\n");
  console.log(fs.readFileSync(pointer, "utf8"));
}

function postFormat() {
  const input = readStdin();
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || !FORMATTABLE.test(filePath)) return;
  spawnSync(`pnpm exec biome format --write "${filePath}"`, {
    cwd: input.cwd ?? process.cwd(),
    shell: true,
    stdio: "ignore",
  });
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === "pre-tool") preTool();
  else if (mode === "session-start") sessionStart();
  else if (mode === "post-format") postFormat();
  else {
    console.error("usage: claude-guard.mjs <pre-tool|session-start|post-format>");
    process.exit(1);
  }
}
