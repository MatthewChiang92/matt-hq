import type { ProjectSummary } from "../../data/types";
import { officeActions, useOffice } from "../../store/office";
import { ui } from "../../store/ui";
import { t3Style } from "../../theme/tokens";
import { Portrait, StateChip } from "../kit";
import { Logo } from "./TopBar";

function open(id: string) {
  ui.closeHome();
  if (id !== useOffice.getState().projectId) officeActions.selectProject(id);
}

function ProjectCard({ p, current }: { p: ProjectSummary; current: boolean }) {
  return (
    <article
      className={`panel relative flex min-w-0 flex-col gap-2 p-3 transition-transform hover:-translate-x-px hover:-translate-y-px ${p.attention ? "outline-[3px] outline-yellow" : ""}`}
      style={p.attention ? { outlineStyle: "solid" } : undefined}
      aria-current={current || undefined}
    >
      <button className="absolute inset-0 cursor-pointer" aria-label={`Open ${p.name}`} onClick={() => open(p.id)} />
      <div className="flex min-w-0 items-center gap-2">
        {current && <span className="text-[14px]">▶</span>}
        <b className="min-w-0 truncate text-[20px]">{p.name}</b>
        <span className="flex-1" />
        {p.openPrs > 0 && <span className="chip shrink-0 text-[12px]">{p.openPrs} PR{p.openPrs === 1 ? "" : "s"}</span>}
        {p.attention > 0 && <span className="shrink-0 border-2 border-ink bg-yellow px-1.5 text-[13px]">{p.attention} waiting</span>}
      </div>

      {p.agents.map((a) => (
        <div key={a.id} className={`flex min-w-0 items-center gap-2 ${a.on ? "" : "opacity-55"}`}>
          <Portrait color={a.color} lead={a.lead} size={28} />
          <b className="shrink-0 text-[15px]">{a.name}</b>
          {a.on ? <StateChip state={a.state} /> : <span className="chip shrink-0 text-[11px]">Off</span>}
          {a.on && a.doing && <span className={`min-w-0 truncate text-[13px] ${a.state === "needs-input" ? "text-red" : "text-muted"}`}>{a.doing}</span>}
        </div>
      ))}

      {p.t3.length > 0 && (
        <div className="flex flex-col gap-1 border-t-2 border-dashed border-ink/30 pt-2">
          {p.t3.map((t) => {
            const st = t3Style(t.status);
            return (
              <a key={t.id} href={t.link} target="_blank" rel="noreferrer" className="relative flex min-w-0 items-center gap-2 hover:underline" title="Open in T3 Code">
                <span className={`chip chip-dot shrink-0 ${t.status === "waiting" ? "blink" : ""}`} style={{ ["--c" as string]: st.color }}>
                  {st.label}
                </span>
                <span className="min-w-0 truncate text-[14px]">{t.title}</span>
              </a>
            );
          })}
        </div>
      )}
    </article>
  );
}

/** Every project in HQ at a glance: who's working, your T3 Code chats, and what's waiting on you. */
export function HomePage() {
  const projects = useOffice((s) => s.projects) ?? [];
  const projectId = useOffice((s) => s.projectId);
  const running = projects.reduce((n, p) => n + p.running, 0);

  return (
    <div className="home-page scroll-thin fixed inset-0 z-[45] overflow-y-auto bg-navy px-4 pb-6 pt-[10px]" role="dialog" aria-modal="true" aria-label="All projects">
      <header className="panel flex h-[50px] items-center gap-2.5 px-3">
        <Logo />
        <b className="hidden whitespace-nowrap text-[22px] font-bold tracking-[0.02em] sm:inline">Matt HQ</b>
        <span className="flex-1" />
        <div className="flex items-center gap-2 whitespace-nowrap border-[3px] border-ink bg-navy px-2.5 py-0.5 text-[15px] text-cream">
          <b>{running}</b> running
          <i className="led" style={running ? undefined : { background: "#83769c", animation: "none" }} />
        </div>
        <button className="btn whitespace-nowrap text-[14px]" onClick={() => ui.openAddProject()}>
          + Add<span className="hidden sm:inline"> project</span>
        </button>
        {projectId && (
          <button className="btn px-2.5" aria-label="Close" onClick={() => ui.closeHome()}>
            ✕
          </button>
        )}
      </header>
      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr))]">
        {projects.map((p) => (
          <ProjectCard key={p.id} p={p} current={p.id === projectId} />
        ))}
      </div>
    </div>
  );
}
