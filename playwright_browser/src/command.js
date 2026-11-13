import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SESSION_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const COMMAND_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const GLOBAL_COMMANDS = new Set(["help", "version", "list", "close-all", "kill-all"]);

export function validateCommandRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Request body must be an object");
  }
  const { command, session = "default", arguments: args = [] } = body;
  if (typeof command !== "string" || !COMMAND_PATTERN.test(command)) {
    throw new TypeError("command must be a CLI command name");
  }
  if (typeof session !== "string" || !SESSION_PATTERN.test(session)) {
    throw new TypeError("session must contain 1-64 letters, numbers, underscores, or hyphens");
  }
  if (!Array.isArray(args) || args.length > 100 || args.some((arg) => typeof arg !== "string" || arg.length > 8192)) {
    throw new TypeError("arguments must be an array of at most 100 strings (8192 characters each)");
  }
  return { command, session, arguments: args };
}

export function buildCliArguments({ command, session, arguments: args }, configPath = "") {
  const commandArgs = [...args];
  if (command === "help") {
    return ["--help", ...commandArgs];
  }
  if (command === "version") {
    return ["--version"];
  }
  if (command === "open" && !commandArgs.includes("--persistent")) {
    commandArgs.push("--persistent");
  }
  if (GLOBAL_COMMANDS.has(command)) {
    return ["--json", command, ...commandArgs];
  }
  return [
    `-s=${session}`,
    "--json",
    command,
    ...commandArgs,
    ...(command === "open" && configPath ? ["--config", configPath] : []),
  ];
}

export async function runCli(request, { timeoutMs = 120_000 } = {}) {
  const normalized = validateCommandRequest(request);
  try {
    const { stdout, stderr } = await execFileAsync(
      "playwright-cli",
      buildCliArguments(normalized, process.env.PLAYWRIGHT_CLI_CONFIG || ""),
      {
        cwd: process.env.HOME || "/data",
        env: {
          ...process.env,
          HOME: process.env.HOME || "/data",
          NO_UPDATE_NOTIFIER: "1",
        },
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      },
    );
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

export { SESSION_PATTERN, COMMAND_PATTERN };
