import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build.mjs";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "src");
const out = buildSite(src, fs.mkdtempSync(path.join(os.tmpdir(), "slayply-site-")));
const read = (name) => fs.readFileSync(path.join(out, name), "utf8");
const pages = ["index.html", "privacy.html"];
// The only absolute links the site may carry: its own repository.
const REPO_URL = "https://github.com/devnadeemashraf/slayply/";

test("build copies every page and the stylesheet", () => {
  for (const file of [...pages, "style.css"]) assert.ok(fs.existsSync(path.join(out, file)), file);
});

test("a rebuild removes stale files", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "slayply-site-"));
  fs.writeFileSync(path.join(target, "stale.html"), "x");
  buildSite(src, target);
  assert.equal(fs.existsSync(path.join(target, "stale.html")), false);
});

test("every local link and stylesheet points at a built file", () => {
  for (const page of pages) {
    for (const [, target] of read(page).matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      assert.ok(fs.existsSync(path.join(out, target)), `${page} links to missing ${target}`);
    }
  }
});

test("pages load no scripts and no third-party resources", () => {
  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /<script/i, page);
    for (const [, target] of html.matchAll(/(?:href|src)="(https?:[^"]+)"/gi)) {
      assert.ok(target.startsWith(REPO_URL), `${page}: ${target}`);
    }
  }
});

test("privacy page states the key facts", () => {
  const text = read("privacy.html").replace(/\s+/g, " ");
  for (const phrase of [
    "only in your browser",
    "does not log or store",
    "may train",
    "Direct Mode",
    "no accounts",
  ]) {
    assert.ok(text.includes(phrase), `missing: ${phrase}`);
  }
});

test("install steps name the real build command and unpacked folder", () => {
  const html = read("index.html");
  assert.match(html, /pnpm --filter @slayply\/extension build/);
  assert.match(html, /apps\/extension\/\.output\/chrome-mv3/);
});

test("the download button points at the stable release asset the workflow publishes", () => {
  const html = read("index.html");
  assert.ok(html.includes(`href="${REPO_URL}releases/latest/download/slayply-extension.zip"`));
});

test("the disclaimer covers affiliation, accuracy, costs, liability and the relay", () => {
  const text = read("index.html").replace(/\s+/g, " ");
  for (const phrase of [
    "as is",
    "Downloads are unsigned",
    "Not affiliated",
    "AI can be wrong",
    "charges on your API key",
    "not legal, career or professional advice",
    "not liable",
    "no uptime promise",
  ]) {
    assert.ok(text.includes(phrase), `missing: ${phrase}`);
  }
});
