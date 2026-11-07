import { useEffect, useRef, useState } from "react";
import { officeActions, useOffice } from "../../store/office";
import { ui } from "../../store/ui";

/** The top bar's project name: opens a list of every project in HQ to switch between them. */
export function ProjectSwitcher() {
  const projects = useOffice((s) => s.projects) ?? [];
  const projectId = useOffice((s) => s.projectId);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const current = projects.find((p) => p.id === projectId);
  // Something is waiting on you in another project.
  const elsewhere = projects.reduce((n, p) => n + (p.id === projectId ? 0 : p.attention), 0);

  return (
    <div ref={box} className="relative min-w-0" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button className="btn flex max-w-[320px] min-w-0 items-center gap-2 text-[16px]" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}>
        <b className="min-w-0 truncate">{current?.name ?? "Projects"}</b>
        {elsewhere > 0 && <span className="shrink-0 border-2 border-ink bg-yellow px-1 text-[12px] leading-tight">{elsewhere}</span>}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="panel absolute left-0 top-[calc(100%+6px)] z-30 flex w-[340px] flex-col p-1.5" role="listbox" aria-label="Projects">
          <button
            className="px-2 py-1.5 text-left text-[15px] hover:bg-cream-2"
            onClick={() => {
              setOpen(false);
              ui.openHome();
            }}
          >
            All projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === projectId}
              className={`flex items-center gap-2 px-2 py-1.5 text-left hover:bg-cream-2 ${p.id === projectId ? "bg-cream-2" : ""}`}
              onClick={() => {
                setOpen(false);
                if (p.id !== projectId) officeActions.selectProject(p.id);
              }}
            >
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[16px]">{p.name}</b>
                <span className="block truncate font-term text-[15px] text-muted">{p.path}</span>
              </span>
              {p.running > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-[13px]" title={`${p.running} agent${p.running === 1 ? "" : "s"} running`}>
                  {p.running} <i className="led" />
                </span>
              )}
              {p.attention > 0 && (
                <span className="shrink-0 border-2 border-ink bg-yellow px-1 text-[12px] leading-tight" title="Waiting on you">
                  {p.attention}
                </span>
              )}
            </button>
          ))}
          <button
            className="btn mt-1 text-[14px]"
            onClick={() => {
              setOpen(false);
              ui.openAddProject();
            }}
          >
            + Add project
          </button>
        </div>
      )}
    </div>
  );
}
