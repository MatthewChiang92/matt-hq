import { useState } from "react";
import { officeActions, useOffice } from "../../store/office";
import { ui } from "../../store/ui";

/** Adds a git repo to HQ. `required`: HQ has no projects yet, so it can't be closed. */
export function AddProjectModal({ required }: { required: boolean }) {
  const candidates = useOffice((s) => s.candidates);
  const error = useOffice((s) => s.projectError);
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const busy = adding !== null && !error;

  const add = (p: string) => {
    if (!p.trim() || busy) return;
    setAdding(p.trim());
    officeActions.addProject(p.trim());
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(36,26,46,0.55)] p-4" role="dialog" aria-modal="true" aria-label="Add a project">
      <div className="panel flex max-h-[calc(100dvh-2rem)] w-[min(560px,100%)] flex-col">
        <div className="flex items-center border-b-[3px] border-ink px-4 py-2">
          <h2 className="m-0 flex-1 text-[22px] font-bold">{required ? "Welcome to Matt HQ" : "Add a project"}</h2>
          {!required && (
            <button className="btn w-8 px-0" aria-label="Close" onClick={() => ui.closeAddProject()}>
              ×
            </button>
          )}
        </div>

        {candidates.length > 0 && (
          <div className="scroll-thin flex min-h-0 flex-col overflow-y-auto px-2 py-2">
            {candidates.map((c) => (
              <button key={c.path} className="flex items-baseline gap-2 px-2 py-1.5 text-left hover:bg-cream-2 disabled:opacity-50" disabled={busy} onClick={() => add(c.path)}>
                <b className="shrink-0 whitespace-nowrap text-[16px]">{c.name}</b>
                <span className="truncate font-term text-[15px] text-muted">{c.path}</span>
              </button>
            ))}
          </div>
        )}

        <form
          className="flex gap-2 border-t-[3px] border-ink px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            add(path);
          }}
        >
          <input
            className="field flex-1 font-term text-[17px]"
            placeholder="~/path/to/repo"
            aria-label="Path to a git repo"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            autoFocus
          />
          <button className="btn" type="submit" disabled={busy || !path.trim()}>
            Add
          </button>
        </form>

        {(busy || error) && (
          <p role="status" className={`m-0 border-t-[3px] border-ink px-4 py-2 text-[14px] ${error ? "bg-red text-white" : ""}`}>
            {error ?? `Adding ${adding}…`}
          </p>
        )}
      </div>
    </div>
  );
}
