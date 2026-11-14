import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateCommandRequest } from "../src/command.js";
import { ensureDefaultConfig } from "../src/default-config.js";
import { parseCommandLine } from "../src/command-line.js";

test("passes a complete CLI line through unchanged", () => {
  assert.deepEqual(
    validateCommandRequest({ command: "-s=todomvc open https://demo.playwright.dev/todomvc" }),
    {
      command: "-s=todomvc open https://demo.playwright.dev/todomvc",
      argv: ["-s=todomvc", "open", "https://demo.playwright.dev/todomvc"],
    },
  );
  assert.deepEqual(parseCommandLine("list --json"), ["list", "--json"]);
  assert.deepEqual(parseCommandLine("--help"), ["--help"]);
  assert.deepEqual(parseCommandLine("--config=/data/custom.json open example.com"), [
    "--config=/data/custom.json",
    "open",
    "example.com",
  ]);
});

test("does not add flags, sessions, or a shell", () => {
  const command = validateCommandRequest({ command: 'fill e1 "hello; touch /tmp/nope"' });
  assert.deepEqual(command.argv, ["fill", "e1", "hello; touch /tmp/nope"]);
  assert.deepEqual(validateCommandRequest({ command: "open https://example.com" }).argv, [
    "open",
    "https://example.com",
  ]);
});

test("accepts quoted arguments and a copied playwright-cli prefix", () => {
  assert.deepEqual(validateCommandRequest({ command: 'fill e1 "hello world"' }).argv, [
    "fill",
    "e1",
    "hello world",
  ]);
  assert.deepEqual(validateCommandRequest({ command: 'type "say \\"hello\\""' }).argv, [
    "type",
    'say "hello"',
  ]);
  assert.deepEqual(validateCommandRequest({ command: "playwright-cli help open" }).argv, [
    "help",
    "open",
  ]);
  assert.deepEqual(validateCommandRequest({ command: "playwright-cli -s=work snapshot" }).argv, [
    "-s=work",
    "snapshot",
  ]);
});

test("rejects the removed split-field interface", () => {
  assert.throws(
    () => validateCommandRequest({ command: "open https://example.com", session: "default" }),
    /Include the session in the command line/,
  );
  assert.throws(
    () => validateCommandRequest({ command: "open", arguments: ["https://example.com"] }),
    TypeError,
  );
  assert.throws(
    () => validateCommandRequest({ command_line: "open https://example.com" }),
    TypeError,
  );
  assert.throws(() => validateCommandRequest({ command: 3 }), TypeError);
  assert.throws(() => validateCommandRequest(null), TypeError);
});

test("rejects malformed command lines", () => {
  assert.throws(() => validateCommandRequest({ command: "open\nrm" }), TypeError);
  assert.throws(() => validateCommandRequest({ command: 'fill e1 "unterminated' }), TypeError);
  assert.throws(() => validateCommandRequest({ command: "   " }), TypeError);
  assert.throws(() => validateCommandRequest({ command: "playwright-cli" }), TypeError);
});

test("installs the default CLI config once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playwright-ha-test-"));
  try {
    const path = await ensureDefaultConfig(directory);
    const config = JSON.parse(await readFile(path, "utf8"));
    assert.equal(config.browser.browserName, "chromium");
    assert.equal(config.timeouts.idle, 1800000);
    assert.ok(config.browser.launchOptions.args.includes("--no-sandbox"));

    await writeFile(path, '{"browser":{"browserName":"firefox"}}');
    await ensureDefaultConfig(directory);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      browser: { browserName: "firefox" },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
