import { useEffect } from "react";
import { officeActions, useOffice } from "../../store/office";
import { ui, useUi } from "../../store/ui";
import { t3Style } from "../../theme/tokens";
import { ago, useNow, useT3Link } from "../kit";

/** A T3 Code chat's status: where it's at, its PRs and latest messages, with a way into T3 Code. */
export function T3ChatModal() {
  const id = useUi((s) => s.t3Open);
  const thread = useOffice((s) => s.snap?.t3Threads?.find((t) => t.id === id));
  const detail = useOffice((s) => (id ? s.t3Detail[id] : undefined));
  const now = useNow(10_000);
  const t3Link = useT3Link();

  // Ask again whenever HQ's poll sees the chat change.
  useEffect(() => {
    if (id) officeActions.showT3Thread(id);
  }, [id, thread?.updatedAt]);

  if (!id) return null;
  const info = detail ?? thread;
  const st = t3Style(info?.status ?? "");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(36,26,46,0.55)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={info?.title ?? "T3 Code chat"}
      onMouseDown={(e) => e.target === e.currentTarget && ui.closeT3()}
    >
      <div className="panel flex max-h-[min(720px,calc(100dvh-2rem))] w-[min(640px,100%)] flex-col">
        <div className="flex items-center gap-2.5 border-b-[3px] border-ink px-3 py-2">
          <h3 className="m-0 min-w-0 flex-1 truncate text-[18px] font-bold">{info?.title ?? "T3 Code chat"}</h3>
          <button className="btn px-2.5" aria-label="Close" onClick={() => ui.closeT3()}>
            ✕
          </button>
        </div>

        <div className="scroll-thin flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          {info && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip chip-dot ${info.status === "waiting" ? "blink" : ""}`} style={{ ["--c" as string]: st.color }}>
                {st.label}
              </span>
              <span className="font-term text-[16px] text-muted">{ago(info.updatedAt, now)}</span>
              <span className="text-[12px] text-muted">{info.model}</span>
              {detail?.branch && <span className="chip font-term text-[14px]">{detail.branch}</span>}
            </div>
          )}

          {detail === undefined && <p className="blink m-0 font-term text-[18px]">Asking T3 Code…</p>}
          {detail === null && <p className="m-0 text-[14px] text-red">T3 Code couldn't show this chat. Is T3 Code open?</p>}

          {detail && detail.pending > 0 && (
            <p className="m-0 border-2 border-red bg-[#ffe1ea] px-2 py-1 text-[14px] font-semibold">
              {detail.pending === 1 ? "A question is" : `${detail.pending} questions are`} waiting for your answer in T3 Code.
            </p>
          )}

          {detail && detail.pullRequests.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {detail.pullRequests.map((p) => (
                <a key={p.number} className="chip text-[12px] hover:underline" href={p.url} target="_blank" rel="noreferrer">
                  #{p.number} {p.state} ↗
                </a>
              ))}
            </div>
          )}

          {detail && detail.messages.length > 0 && (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {[...detail.messages].reverse().map((m, i) => (
                <li key={i} className={`border-2 border-ink px-2 py-1.5 text-[13px] ${m.role === "user" ? "bg-[#fff6d6]" : "bg-white"}`}>
                  <b className="mb-0.5 block text-[11px] uppercase tracking-[0.1em] text-muted">{m.role === "user" ? "You" : "Agent"}</b>
                  <p className="m-0 whitespace-pre-wrap break-words">{m.text}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {info && (
          <div className="flex justify-end border-t-[3px] border-ink px-3 py-2">
            <a className="btn" {...t3Link(info.link)}>
              Open in T3 Code ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
