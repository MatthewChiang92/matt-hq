// Your T3 Code chats in this project, read with T3 Code's own CLI (`t3 thread list --json`),
// and board tasks sent to T3 Code (`t3 thread start`).

import type { T3Thread, Task } from "../src/data/types";
import type { Hub } from "./hub";
import { run } from "./lib/exec";
import { log } from "./lib/log";

const POLL_MS = 15_000;
const ACTIVE = new Set(["preparing", "queued", "starting", "running", "waiting"]);
const RECENT_MS = 3 * 24 * 3_600_000; // finished chats stay listed this long
const MAX = 8;
// A project without a default model needs one named: the project's newest chat's, else this.
const FALLBACK = { provider: "claudeAgent", model: "claude-opus-5-5" };

interface RawThread {
  threadId: string;
  title: string;
  status: string;
  model: string;
  providerInstanceId: string;
  link: string;
  settled: boolean;
  snoozed: boolean;
  updatedAt: string;
  pullRequests?: { number: number; url: string; state: string }[];
}

export class T3Threads {
  private timer: NodeJS.Timeout | null = null;
  private last = "";

  constructor(private hub: Hub) {}

  start() {
    const tick = () => void this.tick().catch((e) => log.warn("t3:", e instanceof Error ? e.message : e));
    tick();
    this.timer = setInterval(tick, POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Starts a T3 Code chat for a board task, in a new worktree off the default branch. */
  async startTask(task: Task): Promise<{ id: string; link: string }> {
    const root = this.hub.repo.root;
    await run("git", ["fetch", "origin", "--quiet"], { cwd: root, timeoutMs: 30_000 });
    const head = await run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: root });
    const message = [
      `Matt HQ task ${task.id}: ${task.title}`,
      task.description,
      task.files?.length ? `Only edit these files: ${task.files.join(", ")}` : "",
      task.doneWhen ? `Done when: ${task.doneWhen}` : "",
      `When it's done, push your branch and open a pull request titled "[${task.id}] ${task.title}" so Matt HQ links it to this task.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const newest = (await this.list())[0];
    const model = newest ? { provider: newest.providerInstanceId, model: newest.model } : FALLBACK;
    const r = await run(
      "t3",
      ["thread", "start", root, "-", "--title", `${task.id} ${task.title}`, "--worktree", head.ok ? head.stdout.trim() : "HEAD", "--branch", `t3/${task.id.toLowerCase()}`, "--provider", model.provider, "--model", model.model, "--json"],
      { input: message, timeoutMs: 60_000 },
    );
    if (!r.ok) throw new Error(r.stderr.trim() || "T3 Code didn't start the chat. Is T3 Code open, with this repo added as a project?");
    const { threadId } = JSON.parse(r.stdout) as { threadId: string };
    const thread = (await this.list()).find((t) => t.threadId === threadId);
    if (!thread) throw new Error(`T3 Code started a chat but HQ couldn't find it: ${r.stdout.trim().slice(0, 200)}`);
    void this.tick();
    return { id: thread.threadId, link: thread.link };
  }

  private async list(): Promise<RawThread[]> {
    const r = await run("t3", ["thread", "list", "--project", this.hub.repo.root, "--json"], { timeoutMs: 10_000 });
    return r.ok ? (JSON.parse(r.stdout) as RawThread[]) : []; // T3 Code isn't installed or running: nothing to show
  }

  private async tick() {
    const now = Date.now();
    const threads: T3Thread[] = (await this.list())
      .filter((t) => !t.settled && !t.snoozed && (ACTIVE.has(t.status) || now - Date.parse(t.updatedAt) < RECENT_MS))
      .sort((a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX)
      .map((t) => ({
        id: t.threadId,
        title: t.title,
        status: t.status,
        model: t.model,
        link: t.link,
        updatedAt: t.updatedAt,
        pullRequests: (t.pullRequests ?? []).map((p) => ({ number: p.number, url: p.url, state: p.state })),
      }));
    const json = JSON.stringify(threads);
    if (json === this.last) return;
    this.last = json;
    this.hub.snap.t3Threads = threads;
    this.hub.emit({ type: "t3.updated", threads });
  }
}
