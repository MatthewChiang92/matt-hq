// matt-hq — start HQ with every project you've added to it.
//
//   matt-hq [--repo <path>] [--port 7420] [--dev] [--no-open]
//
// --repo: also add that git repo to HQ and open it.
// --dev: the UI is served by Vite (pnpm dev:hq); HQ prints/opens the Vite URL.
// HQ_URL: another address that serves HQ, like a Tailscale serve URL; HQ accepts it and prints its link.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startHttp } from "./http";
import { sessionBackend } from "./backends";
import { run } from "./lib/exec";
import { log } from "./lib/log";
import { ensurePtyHelperExecutable } from "./lib/ptyFix";
import { browserToken } from "./paths";
import { Projects } from "./projects";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  ensurePtyHelperExecutable();
  const dev = flag("dev");
  const port = Number(arg("port") ?? process.env.HQ_PORT ?? 7420);
  const uiToken = browserToken(dev);

  log.info("starting projects…");
  const projects = new Projects(port);
  await projects.load();
  const repo = arg("repo") ?? process.env.HQ_REPO;
  const opened = repo ? (await projects.add(resolve(repo))).id : null;
  if (!projects.runtimes.size) log.info("No projects yet: add one in the browser.");

  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const distDir = join(root, "dist");
  const uiPort = Number(process.env.HQ_UI_PORT ?? 5173);
  const publicUrl = process.env.HQ_URL ? new URL(process.env.HQ_URL).origin : null;
  const uiOrigin = dev ? `http://localhost:${uiPort}` : (publicUrl ?? `http://127.0.0.1:${port}`);
  if (!dev && !existsSync(join(distDir, "index.html"))) log.warn("No built UI found. Run `pnpm build` first, or use `pnpm dev:hq`.");

  await startHttp({
    projects,
    port,
    browserToken: uiToken,
    distDir: dev ? null : distDir,
    allowedOrigins: [uiOrigin, `http://127.0.0.1:${uiPort}`, `http://localhost:${port}`, `http://127.0.0.1:${port}`, ...(publicUrl ? [publicUrl] : [])],
  });

  const url = `${uiOrigin}/?token=${uiToken}${opened ? `&project=${encodeURIComponent(opened)}` : ""}`;
  log.info(`\n\n  Matt HQ is running → ${url}\n`);
  if (!flag("no-open")) {
    // Windows: rundll32 hands the URL to the default browser without a shell (`&` would break cmd).
    const [opener, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
    // Give Vite a moment in dev.
    setTimeout(() => void run(opener, args), dev ? 1500 : 0);
  }

  const quit = () => {
    const backend = sessionBackend();
    log.info(backend.persistent ? "stopping HQ — agent sessions keep running in tmux" : "stopping HQ and its agents — sandboxes and folders are kept");
    projects.stopAll();
    backend.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
}

main().catch((err) => {
  if ((err as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
    log.error(`Port ${arg("port") ?? 7420} is in use — another HQ may be running. Stop it, or pick another port: matt-hq --port 7421`);
    process.exit(1);
  }
  if ((err as NodeJS.ErrnoException)?.code === "EACCES") {
    const port = arg("port") ?? 7420;
    log.error(
      process.platform === "win32"
        ? `Windows reserved port ${port} (Hyper-V, WSL and Docker reserve port ranges). Pick another: matt-hq --port 8420\n  See the reserved ranges with: netsh interface ipv4 show excludedportrange protocol=tcp`
        : `Not allowed to use port ${port}. Pick another: matt-hq --port 8420`,
    );
    process.exit(1);
  }
  log.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
