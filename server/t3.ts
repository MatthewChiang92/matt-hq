// Your T3 Code chats in this project, read with T3 Code's own CLI (`t3 thread list --json`). Read-only.

import type { T3Thread } from "../src/data/types";
import type { Hub } from "./hub";
import { run } from "./lib/exec";
import { log } from "./lib/log";

const POLL_MS = 15_000;
const ACTIVE = new Set(["preparing", "queued", "starting", "running", "waiting"]);
const RECENT_MS = 3 * 24 * 3_600_000; // finished chats stay listed this long
const MAX = 8;

interface RawThread {
  threadId: string;
  title: string;
  status: string;
  model: string;
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

  private async tick() {
    const r = await run("t3", ["thread", "list", "--project", this.hub.repo.root, "--json"], { timeoutMs: 10_000 });
    if (!r.ok) return; // T3 Code isn't installed or running: nothing to show
    const now = Date.now();
    const threads: T3Thread[] = (JSON.parse(r.stdout) as RawThread[])
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
