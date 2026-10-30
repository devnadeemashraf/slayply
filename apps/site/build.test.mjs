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
    assert.doesNotMatch(html, /(?:href|src)="https?:/i, page);
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
