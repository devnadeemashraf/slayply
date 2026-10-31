import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflow = fs.readFileSync(`${root}.github/workflows/release.yml`, "utf8");
const site = fs.readFileSync(`${root}apps/site/src/index.html`, "utf8");

// The two jobs, split on the line that starts the publish job.
const [buildJob, publishJob] = workflow.split("\n  publish:\n");

test("only a version tag triggers a release", () => {
  assert.match(workflow, /tags: \["v\*"\]/);
  assert.doesNotMatch(workflow, /branches:/);
});

test("the release is built against the live relay over https", () => {
  assert.match(workflow, /WXT_RELAY_URL: https:\/\/slayply-relay\.onrender\.com/);
});

test("the checks must pass before anything is published, and cannot be skipped", () => {
  assert.ok(buildJob.includes("- run: pnpm run check"));
  assert.ok(workflow.indexOf("pnpm run check") < workflow.indexOf("gh release create"));
  assert.match(publishJob, /needs: build/);
  assert.doesNotMatch(workflow, /continue-on-error|if: false|if: \$\{\{ false/);
});

test("the tag must match the extension version and be on main", () => {
  assert.match(buildJob, /merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(buildJob, /does not match the extension version/);
});

test("the asset name matches the site's download link and carries a checksum", () => {
  assert.match(workflow, /slayply-extension\.zip slayply-extension\.zip\.sha256 --title/);
  assert.match(buildJob, /sha256sum slayply-extension\.zip/);
  assert.ok(site.includes("releases/latest/download/slayply-extension.zip"));
});

test("only the publish job can write; install scripts and tests run read-only", () => {
  assert.match(workflow, /^permissions:\n {2}contents: read/m);
  assert.doesNotMatch(buildJob, /contents: write/);
  assert.match(publishJob, /permissions:\n {6}contents: write/);
  assert.doesNotMatch(workflow, /id-token|packages: write|pull-requests: write/);
  // The publish job runs no project code: no install, no scripts.
  assert.doesNotMatch(publishJob, /pnpm/);
});

test("release notes exist for the version the extension declares", () => {
  const { version } = JSON.parse(fs.readFileSync(`${root}apps/extension/package.json`, "utf8"));
  assert.ok(fs.existsSync(`${root}docs/RELEASE_NOTES_v${version}.md`), `v${version}`);
});
