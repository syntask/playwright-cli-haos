import { access, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG = fileURLToPath(new URL("../cli.config.json", import.meta.url));

/**
 * Install the app's default Playwright CLI config on first start. The CLI
 * loads `.playwright/cli.config.json` from the working directory (HOME is
 * /data), so no --config injection is needed. An existing file is left alone.
 */
export async function ensureDefaultConfig(dataDir) {
  const target = join(dataDir, ".playwright", "cli.config.json");
  try {
    await access(target);
    return target;
  } catch {
    // Fall through and create the default.
  }
  await mkdir(join(dataDir, ".playwright"), { recursive: true });
  await copyFile(DEFAULT_CONFIG, target);
  return target;
}
