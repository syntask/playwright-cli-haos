import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SESSION_PATTERN } from "./command.js";

const STORE_NAME = "persistent-sessions.json";

export async function loadSessions(directory) {
  try {
    const value = JSON.parse(await readFile(join(directory, STORE_NAME), "utf8"));
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((session) => typeof session === "string" && SESSION_PATTERN.test(session)))];
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
      throw error;
    }
    return [];
  }
}

export async function updateSession(directory, session, present) {
  if (!SESSION_PATTERN.test(session)) throw new TypeError("Invalid session name");
  await mkdir(directory, { recursive: true });
  const sessions = new Set(await loadSessions(directory));
  if (present) sessions.add(session);
  else sessions.delete(session);
  const path = join(directory, STORE_NAME);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify([...sessions].sort(), null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}
