import { selectAttention } from "../../data/attention";
import { officeActions, selectTeam, useOffice } from "../../store/office";
import { ui, useUi } from "../../store/ui";
import { useNow } from "../kit";
import { AgentCard, T3Card } from "./TeamPanel";

const title = "px-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-cream";

/** A project on a phone: what's waiting on you, the team and your T3 Code chats, as a list. Panels open full screen. */
export function PhoneProject() {
  const snap = useOffice((s) => s.snap);
  const drawer = useUi((s) => s.drawer);
  const live = useOffice((s) => s.live);
  const now = useNow(1000);
  if (!snap) return null;
  const team = selectTeam(snap);
  const attention = selectAttention(snap).total;
  const openPrs = snap.pullRequests.filter((p) => !p.merged && !p.closed).length;
  const stopped = snap.agents.filter((a) => a.session.state === "stopped" || a.session.state === "failed");
  const t3 = snap.t3Threads ?? [];

  return (
    <div className="phone-page scroll-thin fixed inset-0 flex flex-col gap-3 overflow-y-auto bg-navy px-3 pb-6 pt-2.5">
      <header className="panel flex h-[50px] shrink-0 items-center gap-2 px-2">
        {live && (
          <button className="btn px-2.5 text-[18px] leading-none" aria-label="All projects" onClick={() => ui.openHome()}>
            ‹
          </button>
        )}
        <b className="min-w-0 flex-1 truncate text-[20px]">{snap.config.project.name}</b>
        {stopped.length > 0 && (
          <button className="btn shrink-0 text-[14px]" onClick={() => stopped.forEach((a) => officeActions.startAgent(a.agentId))}>
            Start {stopped.length === snap.agents.length ? "team" : stopped.length}
          </button>
        )}
      </header>

      <nav className="grid shrink-0 grid-cols-3 gap-2">
        <button className="btn text-[14px]" style={attention ? { background: "#ffec27" } : undefined} onClick={() => ui.openActions()}>
          Waiting{attention ? ` · ${attention}` : ""}
        </button>
        <button className="btn text-[14px]" onClick={() => ui.openPrs()}>
          PRs{openPrs ? ` · ${openPrs}` : ""}
        </button>
        <button className="btn text-[14px]" onClick={() => ui.openBoards()}>
          Boards
        </button>
      </nav>

      <div className={title}>Team · {team.length}</div>
      {team.map((a) => (
        <AgentCard key={a.config.id} a={a} now={now} focused={drawer?.kind === "agent" && drawer.id === a.config.id} />
      ))}

      {t3.length > 0 && (
        <>
          <div className={`mt-2 ${title}`}>T3 Code · {t3.length}</div>
          {t3.map((t) => (
            <T3Card key={t.id} t={t} now={now} />
          ))}
        </>
      )}
    </div>
  );
}
