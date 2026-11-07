// One project's runtime: its Hub, agent sessions, inbox, sandboxes and GitHub sync.
// The server runs one of these per repo in HQ (see projects.ts).

import { existsSync } from "node:fs";
import { makeCommands } from "./commands";
import { Hub } from "./hub";
import { GitHubSync } from "./githubSync";
import { Inbox } from "./inbox";
import { Planner } from "./planner";
import { ActionItems } from "./actionItems";
import { Sbx } from "./sbx";
import { SbxMcp } from "./sbxMcp";
import { log } from "./lib/log";
import { agentToken } from "./paths";
import type { RepoInfo } from "./repo";
import { Sessions } from "./sessions";
import { T3Threads } from "./t3";
import { runSetupChecks } from "./setup";
import { loadConfig, loadPlan } from "./store";

export interface ProjectRuntime {
  id: string;
  hub: Hub;
  inbox: Inbox;
  planner: Planner;
  agentToken: string;
  commands: Record<string, (...args: unknown[]) => unknown>;
  /** Stops HQ's work for this project. tmux keeps its agents running. */
  stop(): void;
}

/** The project's id, read from its saved config (or made from the folder name). */
export const projectId = (repo: RepoInfo, port: number) => loadConfig(repo, port).config.project.id;

export async function startProject(repo: RepoInfo, port: number, githubBudget: () => number): Promise<ProjectRuntime> {
  const { config, isNew } = loadConfig(repo, port);
  config.project.hqPort = port;
  const slug = config.project.id;

  const setup = await runSetupChecks(repo, config.team);
  const missing = setup.checks.filter((c) => c.status !== "ok");
  log.info(`${slug}: ${repo.root}${repo.github ? ` (github.com/${repo.github})` : ""}${missing.length ? ` · setup: ${missing.map((c) => c.label).join(", ")}` : ""}`);

  const hub = new Hub(repo, slug, config, loadPlan(repo.root), setup);
  hub.snap.welcome = isNew;
  const token = agentToken(slug);
  const sessions = new Sessions(hub, token);
  const inbox = new Inbox(hub, { type: (id, text) => sessions.typeInto(id, text), enter: (id) => sessions.pressEnter(id) });
  sessions.onSessionDown = (id) => inbox.sessionDown(id);
  sessions.onSessionReattached = (id) => inbox.sessionReattached(id);
  sessions.lastHookAt = (id) => inbox.lastHookAt(id);
  const sbx = new Sbx(hub);
  sessions.envFileFor = (id) => (existsSync(sbx.envFile(id)) ? sbx.envFile(id) : null);
  const mcp = new SbxMcp(hub, (id, file, args, onExit) => sessions.runTerminal(id, file, args, onExit));
  sessions.onSandboxReady = (id) => {
    void sbx.syncRules(id);
    void mcp.attachAll(id);
    void sbx.refreshPorts(id);
  };
  sessions.onSessionDown = ((down) => (id: string) => {
    down(id);
    void sbx.refreshPorts(id);
  })(sessions.onSessionDown);
  sessions.onSandboxRemoved = (id) => {
    mcp.forget(id);
    void sbx.refreshPorts(id);
  };
  void sbx.refresh();
  void mcp.refresh();
  const planner = new Planner(hub, inbox);
  planner.actions = new ActionItems(hub, planner);
  const t3 = new T3Threads(hub);

  sessions.startPolling();
  sbx.startApprovalPolling();
  const github = new GitHubSync(hub, planner, repo.github, githubBudget);
  github.start();
  t3.start();

  return {
    id: slug,
    hub,
    inbox,
    planner,
    agentToken: token,
    commands: makeCommands(hub, sessions, planner, inbox, sbx, mcp, t3),
    stop() {
      sessions.shutdown();
      sbx.stopApprovalPolling();
      inbox.stop();
      github.stop();
      t3.stop();
    },
  };
}
