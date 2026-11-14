import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIN_TOKEN_LENGTH = 32;
const TOKEN_FILE = "api-token";

export function resolveApiToken(
  dataDir,
  configuredToken = "",
  generate = () => randomBytes(32).toString("base64url"),
) {
  const configured = String(configuredToken || "").trim();
  if (configured) {
    if (configured.length < MIN_TOKEN_LENGTH) {
      throw new TypeError(`Configured API token must contain at least ${MIN_TOKEN_LENGTH} characters`);
    }
    return { token: configured, generated: false };
  }

  const tokenFile = resolve(dataDir, TOKEN_FILE);
  try {
    const persisted = readFileSync(tokenFile, "utf8").trim();
    if (persisted.length >= MIN_TOKEN_LENGTH) {
      return { token: persisted, generated: false };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Could not read saved API token: ${error.message}`, { cause: error });
    }
  }

  const token = generate();
  if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) {
    throw new TypeError(`Generated API token must contain at least ${MIN_TOKEN_LENGTH} characters`);
  }
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  return { token, generated: true };
}

export { MIN_TOKEN_LENGTH, TOKEN_FILE };
