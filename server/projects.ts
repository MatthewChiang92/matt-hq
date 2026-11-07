// Every project in HQ. Saved as a list of repo paths in ~/.matthq/projects.json;
// each one runs its own ProjectRuntime on the same server.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { selectAttention } from "../src/data/attention";
import type { OfficeEvent } from "../src/data/source";
import type { ProjectCandidate, ProjectSummary } from "../src/data/types";
import { log } from "./lib/log";
import { hqHome } from "./paths";
import { projectId, startProject, type ProjectRuntime } from "./project";
import { detectRepo } from "./repo";

const HQ_BUDGET = 1200; // GraphQL points per hour HQ may use across all projects; the rest of the 5,000 is left for the agents' gh commands

/** Where "Add project" looks for repos. */
const projectsDir = () => process.env.HQ_PROJECTS_DIR ?? join(homedir(), "code");

type ProjectsEvent = Extract<OfficeEvent, { type: "projects" }>;

export class Projects {
  readonly runtimes = new Map<string, ProjectRuntime>();
  private starting = new Set<string>();
  private listeners = new Set<(e: ProjectsEvent) => void>();
  private candidateList: ProjectCandidate[] = [];
  private last = "";
  private timer: NodeJS.Timeout | null = null;
  private readonly file = join(hqHome(), "projects.json");

  constructor(private port: number) {}

  /** Starts every saved project. One that fails to start is logged and dropped from the list. */
  async load() {
    const saved = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as { paths: string[] }).paths : [];
    await Promise.all(
      [...new Set(saved)].map((path) =>
        this.add(path, false).catch((err) => log.warn(`Couldn't start ${path}: ${err instanceof Error ? err.message : err}`)),
      ),
    );
    this.save();
    this.refreshCandidates();
  }

  /** Adds the repo at `path` (or returns it if it's already in HQ). */
  async add(path: string, save = true): Promise<ProjectRuntime> {
    const repo = await detectRepo(resolve(path.replace(/^~(?=$|\/)/, homedir())));
    const existing = [...this.runtimes.values()].find((r) => r.hub.repo.root === repo.root);
    if (existing) return existing;
    const id = projectId(repo, this.port);
    // The id names sandboxes, tmux sessions and ~/.matthq/<id>, so two projects can't share one.
    if (this.runtimes.has(id) || this.starting.has(id))
      throw new Error(`Another project in HQ already uses the id "${id}". Change "id" in ${repo.root}/.matthq/config.json, or rename the folder.`);
    this.starting.add(id);
    try {
      const rt = await startProject(repo, this.port, () => HQ_BUDGET / Math.max(1, this.runtimes.size));
      this.runtimes.set(id, rt);
      rt.hub.subscribe((e) => e.type !== "terminal.output" && this.changed());
      if (save) {
        this.save();
        this.refreshCandidates();
      }
      return rt;
    } finally {
      this.starting.delete(id);
    }
  }

  /** Takes a project out of HQ. Its repo, agent folders and sandboxes stay. */
  remove(id: string) {
    const rt = this.runtimes.get(id);
    if (!rt) return;
    const running = rt.hub.snap.agents.filter((a) => a.session.state === "running" || a.session.state === "starting");
    if (running.length) throw new Error(`Stop ${running.map((a) => rt.hub.name(a.agentId)).join(", ")} before removing ${rt.hub.snap.config.project.name}.`);
    rt.stop();
    this.runtimes.delete(id);
    this.save();
    this.refreshCandidates();
  }

  /** The agent token identifies the project a hook or Team MCP call is for. */
  byAgentToken(match: (token: string) => boolean): ProjectRuntime | null {
    for (const rt of this.runtimes.values()) if (match(rt.agentToken)) return rt;
    return null;
  }

  summaries(): ProjectSummary[] {
    return [...this.runtimes.values()]
      .map((rt) => {
        const s = rt.hub.snap;
        return {
          id: rt.id,
          name: s.config.project.name,
          path: rt.hub.repo.root,
          running: s.agents.filter((a) => a.session.state === "running").length,
          attention: selectAttention(s).total,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  event(): ProjectsEvent {
    return { type: "projects", projects: this.summaries(), candidates: this.candidateList };
  }

  subscribe(fn: (e: ProjectsEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  stopAll() {
    for (const rt of this.runtimes.values()) rt.stop();
  }

  /** Something in a project changed: tell browsers if the list (names, counts) did. */
  private changed() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const e = this.event();
      const json = JSON.stringify(e);
      if (json === this.last) return;
      this.last = json;
      for (const fn of this.listeners) fn(e);
    }, 300);
  }

  /** Git repos directly inside the projects folder that aren't in HQ yet. */
  private refreshCandidates() {
    const dir = projectsDir();
    // realpath: on macOS ~/code and ~/Code are one folder; git reports its real name.
    const root = existsSync(dir) ? realpathSync.native(dir) : null;
    const added = new Set([...this.runtimes.values()].map((r) => r.hub.repo.root));
    this.candidateList = root
      ? readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory() && existsSync(join(root, d.name, ".git")) && !added.has(join(root, d.name)))
          .map((d) => ({ name: d.name, path: join(root, d.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    this.changed();
  }

  private save() {
    mkdirSync(hqHome(), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ paths: [...this.runtimes.values()].map((r) => r.hub.repo.root) }, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
}
