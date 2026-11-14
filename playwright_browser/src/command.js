import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCommandLine } from "./command-line.js";

const execFileAsync = promisify(execFile);

export function validateCommandRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Request body must be an object");
  }
  if (body.session !== undefined) {
    throw new TypeError("Include the session in the command line, for example -s=kitchen open https://example.com");
  }
  if (body.command_line !== undefined || body.arguments !== undefined) {
    throw new TypeError("Send command as a single CLI command line");
  }
  if (typeof body.command !== "string") {
    throw new TypeError("command must be a CLI command line");
  }
  return { command: body.command, argv: parseCommandLine(body.command) };
}

export async function runCliRequest({ argv }, { timeoutMs = 120_000 } = {}) {
  if (!Array.isArray(argv) || !argv.length) throw new TypeError("command must include a CLI command");
  const dataDir = process.env.PLAYWRIGHT_DATA_DIR || process.env.HOME || "/data";
  try {
    const { stdout, stderr } = await execFileAsync("playwright-cli", argv, {
      cwd: dataDir,
      env: {
        ...process.env,
        HOME: dataDir,
        NO_UPDATE_NOTIFIER: "1",
      },
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || error.message || "CLI command failed").trim(),
      code: error.code ?? null,
    };
  }
}
