import type { OfficeSnapshot } from "./types";

/** Everything waiting on the user: open action items, agents asking in the terminal, access requests, blocked requests, PRs ready to merge. */
export function selectAttention(snap: OfficeSnapshot | null) {
  if (!snap) return { items: [], asking: [], access: [], blocked: [], readyPrs: [], total: 0 };
  const items = (snap.actionItems ?? []).filter((i) => i.status === "open");
  const access = (snap.accessRequests ?? []).filter((r) => r.status === "pending");
  const asking = snap.agents.filter((a) => a.state === "needs-input" && !access.some((r) => r.agentId === a.agentId));
  const blocked = snap.config.team.map((a) => ({ agentId: a.id, count: snap.sbx.agents[a.id]?.approvals?.length ?? 0 })).filter((b) => b.count > 0);
  const readyPrs = snap.pullRequests.filter((p) => p.review === "passed" && p.mergeable && !p.merged && !p.closed);
  return { items, asking, access, blocked, readyPrs, total: items.length + asking.length + access.length + blocked.length + readyPrs.length };
}
