import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApiToken } from "../src/token.js";

test("uses a configured token without generating one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playwright-token-test-"));
  try {
    const token = "configured-token-configured-token-1234";
    assert.deepEqual(resolveApiToken(directory, token, () => assert.fail("generated")), {
      token,
      generated: false,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a short configured token", () => {
  assert.throws(() => resolveApiToken("/tmp", "short"), TypeError);
});

test("generates and persists a token, then reuses it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playwright-token-test-"));
  try {
    const generated = "generated-token-generated-token-123456";
    const first = resolveApiToken(directory, "", () => generated);
    assert.deepEqual(first, { token: generated, generated: true });
    assert.equal((await readFile(join(directory, "api-token"), "utf8")).trim(), generated);
    assert.deepEqual(resolveApiToken(directory, "", () => assert.fail("generated again")), {
      token: generated,
      generated: false,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("replaces an invalid saved token", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playwright-token-test-"));
  try {
    await writeFile(join(directory, "api-token"), "short\n");
    const result = resolveApiToken(directory, "", () => "replacement-token-replacement-token-123");
    assert.equal(result.generated, true);
    assert.equal(result.token, "replacement-token-replacement-token-123");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
