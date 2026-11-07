import { CLI_LABEL, type T3Thread } from "../../data/types";
import { selectTeam, useOffice, type AgentView } from "../../store/office";
import { ui, useUi } from "../../store/ui";
import { stateStyle, t3Style } from "../../theme/tokens";
import { ago, Portrait, StateChip, useNow, useT3Link } from "../kit";

export function AgentCard({ a, focused, n, now }: { a: AgentView; focused: boolean; n?: number; now: number }) {
  const snap = useOffice((s) => s.snap);
  const task = a.status.currentTaskId ? snap?.tasks.find((t) => t.id === a.status.currentTaskId) : null;
  const st = stateStyle[a.status.state];
  const needs = a.status.state === "needs-input";
  const blocked = useOffice((s) => s.snap?.sbx.agents[a.config.id]?.approvals?.length ?? 0);
  const items = useOffice((s) => (s.snap?.actionItems ?? []).filter((i) => i.status === "open" && i.fromId === a.config.id).length);
  return (
    <button
      className={`panel relative grid w-full cursor-pointer grid-cols-[40px_1fr] gap-x-2.5 gap-y-1 px-2.5 pb-2.5 pt-2 text-left transition-transform hover:-translate-x-px hover:-translate-y-px ${needs ? "outline-[3px] outline-red" : ""}`}
      style={needs ? { outlineStyle: "solid" } : undefined}
      onClick={() => ui.openAgent(a.config.id)}
      aria-label={`${a.config.name}, ${a.config.role}, ${st.label}`}
    >
      {focused && <span className="absolute -left-4 top-4 text-[14px]">▶</span>}
      <div className="row-span-2">
        <Portrait color={a.config.color} lead={a.config.isLead} />
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <b className="text-[17px]">{a.config.name}</b>
        <span className="truncate text-[13px] text-muted">
          {a.config.role} · {CLI_LABEL[a.config.cli]}{a.config.model ? ` · ${a.config.model}` : ""}
        </span>
        {n && <span className="kbd ml-auto px-1 text-[13px] leading-none">{n}</span>}
      </div>
      <div className="flex items-center gap-2">
        <StateChip state={a.status.state} />
        <span className="font-term text-[16px] text-muted">{ago(a.status.stateSince, now)}</span>
        {a.config.mode === "local" && <span className="chip text-[11px]">local</span>}
        {items > 0 && (
          <span className="chip text-[11px]" style={{ background: "#ffec27" }} title="Action items from this agent. Open Action items in the top bar.">
            {items} for you
          </span>
        )}
        {blocked > 0 && (
          <span className="chip text-[11px]" style={{ background: "#fff1d6" }} title="Requests the sandbox blocked. Open the agent to allow or dismiss them.">
            {blocked} blocked
          </span>
        )}
      </div>
      <div className={`col-span-2 mt-1 truncate text-[13px] ${task || needs ? "" : "text-muted"}`}>
        {needs ? (
          <span className="text-red">{a.status.note}</span>
        ) : task ? (
          <>
            <span className="mr-1 font-term text-[16px] text-muted">{task.id}</span>
            {task.title}
          </>
        ) : (
          a.status.note ?? "No task"
        )}
      </div>
    </button>
  );
}

/** One of your T3 Code chats; opens it in T3 Code. */
export function T3Card({ t, now }: { t: T3Thread; now: number }) {
  const st = t3Style(t.status);
  const needs = t.status === "waiting";
  const t3Link = useT3Link();
  return (
    <a
      {...t3Link(t.link)}
      className={`panel flex flex-col gap-1 px-2.5 py-2 transition-transform hover:-translate-x-px hover:-translate-y-px ${needs ? "outline-[3px] outline-red" : ""}`}
      style={needs ? { outlineStyle: "solid" } : undefined}
      title="Open in T3 Code"
    >
      <b className="truncate text-[15px]">{t.title}</b>
      <div className="flex items-center gap-2">
        <span className={`chip chip-dot ${needs ? "blink" : ""}`} style={{ ["--c" as string]: st.color }}>
          {st.label}
        </span>
        <span className="font-term text-[16px] text-muted">{ago(t.updatedAt, now)}</span>
        <span className="truncate text-[12px] text-muted">{t.model}</span>
      </div>
      {t.pullRequests.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[12px]">
          {t.pullRequests.slice(0, 4).map((p) => (
            <span key={p.number} className="chip text-[11px]">
              #{p.number} {p.state}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

export function TeamPanel() {
  const snap = useOffice((s) => s.snap);
  const drawer = useUi((s) => s.drawer);
  const now = useNow(1000);
  const team = selectTeam(snap);
  const needs = team.filter((a) => a.status.state === "needs-input").length;
  const t3 = snap?.t3Threads ?? [];

  return (
    <section aria-label="Team" className="fixed bottom-[250px] left-4 top-[74px] z-10 flex w-[280px] flex-col gap-2">
      <div className="flex items-center justify-between px-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-cream [text-shadow:0_2px_0_#241a2e]">
        <span>
          Team · {team.length}
          {needs > 0 && <span className="ml-2 text-yellow">{needs} need you</span>}
        </span>
        <button className="btn px-2 text-[12px] normal-case tracking-normal text-ink [text-shadow:none]" onClick={() => ui.openSettings("team")}>
          + Agent
        </button>
      </div>
      <div className="scroll-thin flex min-h-0 flex-col gap-2.5 overflow-y-auto pb-2 pl-4 -ml-4 pr-1">
        {team.map((a, i) => (
          <AgentCard key={a.config.id} a={a} n={i + 1} now={now} focused={drawer?.kind === "agent" && drawer.id === a.config.id} />
        ))}
        {t3.length > 0 && (
          <>
            <div className="mt-2 px-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-cream [text-shadow:0_2px_0_#241a2e]">T3 Code · {t3.length}</div>
            {t3.map((t) => (
              <T3Card key={t.id} t={t} now={now} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
