import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCliArguments, validateCommandRequest } from "../src/command.js";
import { loadSessions, updateSession } from "../src/session-store.js";

test("validates commands and defaults to a persistent named session", () => {
  assert.deepEqual(validateCommandRequest({ command: "open", arguments: ["https://example.com"] }), {
    command: "open",
    session: "default",
    arguments: ["https://example.com"],
  });
  assert.deepEqual(buildCliArguments({ command: "open", session: "default", arguments: ["https://example.com"] }), [
    "-s=default", "--json", "open", "https://example.com", "--persistent",
  ]);
});

test("does not add a shell and preserves each argument", () => {
  const command = validateCommandRequest({ command: "fill", session: "living_room", arguments: ["e1", "hello; touch /tmp/nope"] });
  assert.deepEqual(buildCliArguments(command), ["-s=living_room", "--json", "fill", "e1", "hello; touch /tmp/nope"]);
});

test("global commands do not get a session selector", () => {
  assert.deepEqual(buildCliArguments({ command: "list", session: "default", arguments: [] }), ["--json", "list"]);
  assert.deepEqual(buildCliArguments({ command: "help", session: "default", arguments: ["open"] }), ["--help", "open"]);
  assert.deepEqual(buildCliArguments({ command: "version", session: "default", arguments: [] }), ["--version"]);
});

test("CLI config is applied only when opening a browser", () => {
  assert.deepEqual(
    buildCliArguments({ command: "open", session: "work", arguments: [] }, "/app/cli.config.json"),
    ["-s=work", "--json", "open", "--persistent", "--config", "/app/cli.config.json"],
  );
  assert.deepEqual(
    buildCliArguments({ command: "click", session: "work", arguments: ["e2"] }, "/app/cli.config.json"),
    ["-s=work", "--json", "click", "e2"],
  );
});

test("rejects malformed sessions, commands, and non-string arguments", () => {
  assert.throws(() => validateCommandRequest({ command: "open;rm", session: "default" }), TypeError);
  assert.throws(() => validateCommandRequest({ command: "open", session: "../other" }), TypeError);
  assert.throws(() => validateCommandRequest({ command: "open", arguments: ["https://example.com", 1] }), TypeError);
});

test("persistent session registry survives updates and filters invalid entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playwright-ha-test-"));
  try {
    await updateSession(directory, "work_profile", true);
    await updateSession(directory, "default", true);
    assert.deepEqual(await loadSessions(directory), ["default", "work_profile"]);
    await updateSession(directory, "work_profile", false);
    assert.deepEqual(await loadSessions(directory), ["default"]);
    await writeFile(join(directory, "persistent-sessions.json"), JSON.stringify(["default", "../escape", 7]));
    assert.deepEqual(await loadSessions(directory), ["default"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
