import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { URL } from "node:url";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";
import { runCliRequest, validateCommandRequest } from "./command.js";
import { ensureDefaultConfig } from "./default-config.js";
import { resolveApiToken } from "./token.js";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
let appOptions = {};
try {
  appOptions = JSON.parse(readFileSync("/data/options.json", "utf8"));
} catch {
  // Local development supplies PLAYWRIGHT_API_TOKEN directly.
}
const DATA_DIR = process.env.PLAYWRIGHT_DATA_DIR || process.env.HOME || "/data";
const ARTIFACT_DIR = resolve(DATA_DIR, ".playwright-cli");
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;
const EVENT_LIMIT = 200;
const EVENT_POLL_INTERVAL_MS = 3000;
const INSTANCE_ID = randomUUID();
const events = [];
const sockets = new Set();
const browserMonitors = new Map();
const monitorWarnings = new Map();
let commandQueue = Promise.resolve();
let sequence = 0;
let eventPollTimer;
let eventPollRunning = false;
let discoveryTimer;

let tokenResult;
try {
  tokenResult = resolveApiToken(
    DATA_DIR,
    process.env.PLAYWRIGHT_API_TOKEN || appOptions.api_token || "",
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (tokenResult.generated) {
  console.info("Generated a new API token and saved it to the app data directory");
}
const TOKEN = tokenResult.token;

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
  const boundedEvent = Object.fromEntries(
    Object.entries(event).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 8192) : value]),
  );
  const entry = { id: ++sequence, instance_id: INSTANCE_ID, timestamp: new Date().toISOString(), ...boundedEvent };
  events.push(entry);
  if (events.length > EVENT_LIMIT) events.shift();
  const message = JSON.stringify({ type: "playwright_event", event: entry });
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(message);
  }
  return entry;
}

function parseCliOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}

let discoverySent = false;
let discoveryAttempts = 0;

async function sendDiscovery() {
  const supervisorToken = process.env.SUPERVISOR_TOKEN;
  if (discoverySent || !supervisorToken || shuttingDown) return;
  discoveryAttempts += 1;

  const headers = {
    Authorization: `Bearer ${supervisorToken}`,
    "Content-Type": "application/json",
  };
  let appHost = hostname();
  try {
    const response = await fetch("http://supervisor/addons/self/info", {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const payload = await response.json();
      const slug = payload?.data?.slug;
      if (typeof slug === "string" && slug) appHost = slug.replaceAll("_", "-");
    }
  } catch (error) {
    console.warn(`Could not read the app slug from Supervisor: ${error.message}`);
  }

  try {
    const response = await fetch("http://supervisor/discovery", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        service: "playwright_cli",
        config: { host: appHost, port: String(PORT), token: TOKEN },
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    const result = await response.json().catch(() => ({}));
    discoverySent = true;
    console.info(`Sent Playwright CLI discovery${result.uuid ? ` (${result.uuid})` : ""}`);
  } catch (error) {
    console.warn(`Could not send discovery to Home Assistant: ${error.message}`);
    if (discoveryAttempts < 5 && !shuttingDown) {
      discoveryTimer = setTimeout(sendDiscovery, 30_000);
    }
  }
}

function pageEvent(session, type, detail = {}) {
  publish({ type, session, ...detail });
}

function observePage(session, page, monitor) {
  if (monitor.pages.has(page)) return;
  monitor.pages.add(page);
  pageEvent(session, "page_opened", { url: page.url() });

  page.on("console", (message) => {
    const location = message.location();
    pageEvent(session, "console_message", {
      level: message.type(),
      message: message.text(),
      url: location.url,
      line: location.lineNumber,
      column: location.columnNumber,
    });
  });
  page.on("pageerror", (error) => pageEvent(session, "page_error", { message: error.message }));
  page.on("request", (request) =>
    pageEvent(session, "network_request", {
      method: request.method(),
      url: request.url(),
      resource_type: request.resourceType(),
      navigation: request.isNavigationRequest(),
    }),
  );
  page.on("response", (response) =>
    pageEvent(session, "network_response", {
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
      status_text: response.statusText(),
    }),
  );
  page.on("requestfailed", (request) =>
    pageEvent(session, "network_request_failed", {
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  page.on("framenavigated", (frame) =>
    pageEvent(session, "navigation", { url: frame.url(), main_frame: frame === page.mainFrame() }),
  );
  page.on("frameattached", (frame) => pageEvent(session, "frame_attached", { url: frame.url() }));
  page.on("framedetached", (frame) => pageEvent(session, "frame_detached", { url: frame.url() }));
  page.on("domcontentloaded", () => pageEvent(session, "dom_content_loaded", { url: page.url() }));
  page.on("load", () => pageEvent(session, "page_load", { url: page.url() }));
  page.on("requestfinished", (request) =>
    pageEvent(session, "network_request_finished", {
      method: request.method(),
      url: request.url(),
      resource_type: request.resourceType(),
    }),
  );
  page.on("dialog", (dialog) =>
    pageEvent(session, "dialog", { dialog_type: dialog.type(), message: dialog.message(), default_value: dialog.defaultValue() }),
  );
  page.on("download", (download) =>
    pageEvent(session, "download", { url: download.url(), filename: download.suggestedFilename() }),
  );
  page.on("filechooser", (chooser) => pageEvent(session, "file_chooser", { multiple: chooser.isMultiple() }));
  page.on("popup", (popup) => {
    pageEvent(session, "popup_opened", { url: popup.url(), opener_url: page.url() });
    observePage(session, popup, monitor);
  });
  page.on("close", () => pageEvent(session, "page_closed", { url: page.url() }));
  page.on("crash", () => pageEvent(session, "page_crash", { url: page.url() }));
  page.on("worker", (worker) => pageEvent(session, "worker_created", { url: worker.url() }));
  page.on("websocket", (websocket) => {
    pageEvent(session, "websocket_opened", { url: websocket.url() });
    websocket.on("framesent", (payload) =>
      pageEvent(session, "websocket_frame", {
        url: websocket.url(),
        direction: "sent",
        bytes: Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload),
      }),
    );
    websocket.on("framereceived", (payload) =>
      pageEvent(session, "websocket_frame", {
        url: websocket.url(),
        direction: "received",
        bytes: Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload),
      }),
    );
    websocket.on("close", () => pageEvent(session, "websocket_closed", { url: websocket.url() }));
  });
}

async function connectBrowserMonitor(browserInfo) {
  const session = browserInfo.name;
  const existing = browserMonitors.get(session);
  if (existing?.browser.isConnected()) return;
  if (!browserInfo.userDataDir) {
    throw new Error("Session has no persistent profile; browser events require --persistent or --profile");
  }

  const dataRoot = await realpath(DATA_DIR);
  const userDataDir = await realpath(browserInfo.userDataDir);
  const relativeProfilePath = relative(dataRoot, userDataDir);
  if (
    !relativeProfilePath ||
    relativeProfilePath === ".." ||
    relativeProfilePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativeProfilePath)
  ) {
    throw new Error("CLI reported a browser profile outside the app data directory");
  }
  const portContents = await readFile(resolve(userDataDir, "DevToolsActivePort"), "utf8");
  const port = Number.parseInt(portContents.split(/\r?\n/, 1)[0], 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Chromium DevTools port");

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error("Chromium has no browser context to observe");
  const monitor = { browser, context, pages: new WeakSet(), userDataDir };
  browserMonitors.set(session, monitor);
  context.on("page", (page) => observePage(session, page, monitor));
  context.on("close", () => pageEvent(session, "browser_context_closed"));
  context.on("serviceworker", (worker) => pageEvent(session, "service_worker_created", { url: worker.url() }));
  context.on("weberror", (webError) => pageEvent(session, "web_error", { message: webError.error().message }));
  browser.on("disconnected", () => {
    if (browserMonitors.get(session) === monitor) browserMonitors.delete(session);
    pageEvent(session, "browser_disconnected");
  });
  for (const page of context.pages()) observePage(session, page, monitor);
  pageEvent(session, "browser_connected", { browser_type: browserInfo.browserType });
  monitorWarnings.delete(session);
}

async function pollBrowserEvents() {
  if (eventPollRunning || shuttingDown) return;
  eventPollRunning = true;
  try {
    await withCommandLock(async () => {
      const listResult = await runCliRequest({ argv: ["list", "--json"] }, { timeoutMs: 30_000 });
      if (!listResult.ok) return;
      const listing = parseCliOutput(listResult.stdout);
      const browsers = Array.isArray(listing?.browsers) ? listing.browsers : [];
      for (const browser of browsers.filter((item) => item.status === "open")) {
        // Ephemeral sessions have no profile directory, so there is no CDP port
        // to discover. This is expected, not an error.
        if (!browser.userDataDir) continue;
        try {
          await connectBrowserMonitor(browser);
        } catch (error) {
          const lastWarning = monitorWarnings.get(browser.name) || 0;
          if (Date.now() - lastWarning > 30_000) {
            console.warn(`Could not attach event monitor for ${browser.name}: ${error.message}`);
            monitorWarnings.set(browser.name, Date.now());
          }
        }
      }
    });
  } catch (error) {
    console.warn(`Browser event poll failed: ${error.message}`);
  } finally {
    eventPollRunning = false;
    if (!shuttingDown) eventPollTimer = setTimeout(pollBrowserEvents, EVENT_POLL_INTERVAL_MS);
  }
}

function artifactContentType(filePath) {
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".yml": "text/yaml",
    ".yaml": "text/yaml",
    ".html": "text/html",
    ".txt": "text/plain",
    ".webm": "video/webm",
  })[extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function readArtifact(filePath) {
  if (typeof filePath !== "string" || !filePath || filePath.length > 2048 || isAbsolute(filePath)) {
    throw Object.assign(new TypeError("path must be a relative artifact path"), { status: 400 });
  }
  const candidatePath = resolve(DATA_DIR, filePath);
  const lexicalPath = relative(ARTIFACT_DIR, candidatePath);
  const parentPrefix = `..${process.platform === "win32" ? "\\" : "/"}`;
  if (!lexicalPath || lexicalPath === ".." || lexicalPath.startsWith(parentPrefix) || isAbsolute(lexicalPath)) {
    throw Object.assign(new TypeError("path is outside the artifact directory"), { status: 403 });
  }
  const dataRoot = await realpath(DATA_DIR);
  const artifactRoot = await realpath(ARTIFACT_DIR);
  if (relative(dataRoot, artifactRoot) !== ".playwright-cli") {
    throw Object.assign(new TypeError("artifact directory resolved outside app data"), { status: 403 });
  }
  const resolvedPath = await realpath(candidatePath);
  const withinRoot = relative(artifactRoot, resolvedPath);
  if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(parentPrefix) || isAbsolute(withinRoot)) {
    throw Object.assign(new TypeError("path is outside the artifact directory"), { status: 403 });
  }
  const info = await stat(resolvedPath);
  if (!info.isFile()) throw Object.assign(new TypeError("artifact is not a regular file"), { status: 400 });
  if (info.size > MAX_ARTIFACT_BYTES) throw Object.assign(new RangeError("artifact exceeds 20 MiB"), { status: 413 });
  const bytes = await readFile(resolvedPath);
  return {
    name: withinRoot,
    content_type: artifactContentType(resolvedPath),
    bytes: info.size,
    data_base64: bytes.toString("base64"),
  };
}

async function withCommandLock(operation) {
  const previous = commandQueue;
  let release;
  commandQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { ok: true, service: "playwright-cli-haos" });
  }
  if (!url.pathname.startsWith("/api/v1/")) return send(response, 404, { error: "not_found" });
  if (!authorized(request)) return send(response, 401, { error: "unauthorized" });

  if (request.method === "GET" && url.pathname === "/api/v1/events") {
    let after = Number.parseInt(url.searchParams.get("after") || "0", 10);
    const requestedInstance = url.searchParams.get("instance_id");
    if (requestedInstance && requestedInstance !== INSTANCE_ID) after = 0;
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 100;
    if (!Number.isInteger(after) || after < 0) return send(response, 400, { error: "after must be a non-negative event id" });
    const available = events.filter((event) => event.id > after);
    const page = available.slice(0, limit);
    const cursor = page.length ? page.at(-1).id : Math.max(after, sequence);
    return send(response, 200, {
      events: page,
      sequence: cursor,
      latest_sequence: sequence,
      instance_id: INSTANCE_ID,
      has_more: available.length > page.length,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/artifact") {
    try {
      return send(response, 200, await readArtifact(url.searchParams.get("path")));
    } catch (error) {
      const status = error.status || (error.code === "ENOENT" ? 404 : 500);
      return send(response, status, { error: error.message || "Could not read artifact" });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/v1/command") {
    try {
      const command = validateCommandRequest(await readJson(request));
      const { result, event } = await withCommandLock(async () => {
        publish({ type: "command_started", command: command.command });
        const commandResult = await runCliRequest(command);
        const eventResult = {
          ...commandResult,
          stdout: commandResult.stdout.slice(0, 8192),
          stderr: commandResult.stderr.slice(0, 8192),
        };
        const commandEvent = publish({
          type: commandResult.ok ? "command_completed" : "command_failed",
          command: command.command,
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
  socket.send(JSON.stringify({ type: "ready", sequence, instance_id: INSTANCE_ID }));
});

try {
  await ensureDefaultConfig(DATA_DIR);
} catch (error) {
  console.error(`Could not create the default Playwright CLI config: ${error.message}`);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Playwright API listening on :${PORT}`);
  void sendDiscovery();
  void pollBrowserEvents();
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(eventPollTimer);
  clearTimeout(discoveryTimer);
  for (const socket of sockets) socket.close();
  const forceExit = setTimeout(() => process.exit(1), 8000);
  server.close(async () => {
    try {
      await withCommandLock(() =>
        runCliRequest({ argv: ["close-all"] }, { timeoutMs: 6000 }),
      );
    } catch (error) {
      console.warn(`Could not close browser sessions cleanly: ${error.message}`);
    }
    clearTimeout(forceExit);
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
