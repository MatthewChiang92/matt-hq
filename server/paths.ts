import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "project";

/** ~/.matthq/ — HQ's home: the project list, and a folder per project. */
export const hqHome = () => join(homedir(), ".matthq");

/** ~/.matthq/<project>/ — HQ's per-project home (agent folders, tokens). */
export function projectHome(projectSlug: string): string {
  const dir = join(hqHome(), projectSlug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function managedWorkspace(projectSlug: string, agentId: string): string {
  return join(projectHome(projectSlug), agentId);
}

/** Session names used for tmux and for the sandbox. */
export const sessionName = (projectSlug: string, agentId: string) => `hq-${projectSlug}-${agentId}`;

/**
 * Agent token: what hooks and the Team MCP send. Stable per project so agent
 * sessions that outlive an HQ restart keep working. Stored 0600 in HQ's home.
 */
export function agentToken(projectSlug: string): string {
  const file = join(projectHome(projectSlug), "agent-token");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const tok = randomBytes(24).toString("hex");
  writeFileSync(file, tok, { mode: 0o600 });
  return tok;
}

/**
 * Browser token, required by the UI's WebSocket. Kept in ~/.matthq/browser-token so HQ's link
 * (and a phone's Home Screen icon) keeps working across restarts. Delete the file to get a new one.
 */
export function browserToken(): string {
  mkdirSync(hqHome(), { recursive: true });
  const file = join(hqHome(), "browser-token");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const tok = randomBytes(24).toString("hex");
  writeFileSync(file, tok, { mode: 0o600 });
  return tok;
}
