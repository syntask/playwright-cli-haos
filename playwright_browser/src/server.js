import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { runCli, validateCommandRequest } from "./command.js";
import { loadSessions, updateSession } from "./session-store.js";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
let appOptions = {};
try {
  appOptions = JSON.parse(readFileSync("/data/options.json", "utf8"));
} catch {
  // Local development supplies PLAYWRIGHT_API_TOKEN directly.
}
const TOKEN = process.env.PLAYWRIGHT_API_TOKEN || appOptions.api_token || "";
const DATA_DIR = process.env.HOME || "/data";
const MAX_BODY_BYTES = 64 * 1024;
const EVENT_LIMIT = 200;
const events = [];
const sockets = new Set();
const commandLocks = new Map();
let sequence = 0;

if (TOKEN.length < 32) {
  console.error("Configure an API token with at least 32 characters; refusing to start");
  process.exit(1);
}

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(TOKEN);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publish(event) {
  const entry = { id: ++sequence, timestamp: new Date().toISOString(), ...event };
  events.push(entry);
  if (events.length > EVENT_LIMIT) events.shift();
  const message = JSON.stringify({ type: "playwright_event", event: entry });
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(message);
  }
  return entry;
}

async function withSessionLock(session, operation) {
  const previous = commandLocks.get(session) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  commandLocks.set(session, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (commandLocks.get(session) === current) commandLocks.delete(session);
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { ok: true, service: "playwright-ha-app" });
  }
  if (!url.pathname.startsWith("/api/v1/")) return send(response, 404, { error: "not_found" });
  if (!authorized(request)) return send(response, 401, { error: "unauthorized" });

  if (request.method === "GET" && url.pathname === "/api/v1/events") {
    const after = Number.parseInt(url.searchParams.get("after") || "0", 10);
    return send(response, 200, { events: events.filter((event) => event.id > after), sequence });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/sessions") {
    const result = await withSessionLock("__all_sessions__", () => runCli({ command: "list", arguments: [] }));
    return send(response, result.ok ? 200 : 502, { ...result, sessions: result.stdout });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/command") {
    try {
      const command = validateCommandRequest(await readJson(request));
      const { result, event } = await withSessionLock("__all_sessions__", async () => {
        publish({ type: "command_started", command: command.command, session: command.session });
        const commandResult = await runCli(command);
        if (commandResult.ok && command.command === "open") {
          await updateSession(DATA_DIR, command.session, true);
        } else if (commandResult.ok && command.command === "delete-data") {
          await updateSession(DATA_DIR, command.session, false);
        }
        const eventResult = {
          ...commandResult,
          stdout: commandResult.stdout.slice(0, 8192),
          stderr: commandResult.stderr.slice(0, 8192),
        };
        const commandEvent = publish({
          type: commandResult.ok ? "command_completed" : "command_failed",
          command: command.command,
          session: command.session,
          result: eventResult,
        });
        return { result: commandResult, event: commandEvent };
      });
      return send(response, result.ok ? 200 : 502, { ...result, event });
    } catch (error) {
      const status = error instanceof RangeError ? 413 : error instanceof SyntaxError || error instanceof TypeError ? 400 : 500;
      return send(response, status, { error: error.message || "internal_error" });
    }
  }
  return send(response, 404, { error: "not_found" });
});

const websocketServer = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/api/v1/events/ws" || !authorized(request)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => websocketServer.emit("connection", websocket));
});
websocketServer.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.send(JSON.stringify({ type: "ready", sequence }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Playwright API listening on :${PORT}`);
  void restorePersistentSessions();
});

async function restorePersistentSessions() {
  try {
    const sessions = await loadSessions(DATA_DIR);
    for (const session of sessions) {
      const result = await withSessionLock("__all_sessions__", () =>
        runCli({ command: "open", session, arguments: [] }),
      );
      if (result.ok) console.info(`Restored persistent browser session: ${session}`);
      else console.warn(`Could not restore browser session ${session}: ${result.stderr}`);
    }
  } catch (error) {
    console.error(`Could not restore persistent browser sessions: ${error.message}`);
  }
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const socket of sockets) socket.close();
  const forceExit = setTimeout(() => process.exit(1), 8000);
  server.close(async () => {
    try {
      await runCli({ command: "close-all", arguments: [] }, { timeoutMs: 6000 });
    } catch (error) {
      console.warn(`Could not close browser sessions cleanly: ${error.message}`);
    }
    clearTimeout(forceExit);
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
