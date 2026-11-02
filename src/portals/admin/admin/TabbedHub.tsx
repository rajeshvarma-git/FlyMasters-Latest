import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

export interface HubTab {
  key: string;
  label: string;
  count?: number;
  element: ReactNode;
}

/** One page, several views. The active view lives in ?view= so links and the back button work. */
export default function TabbedHub({ tabs, param = "view" }: { tabs: HubTab[]; param?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = tabs.find((tab) => tab.key === searchParams.get(param)) || tabs[0];

  const select = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === tabs[0].key) next.delete(param);
    else next.set(param, key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => select(tab.key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active.key === tab.key ? "border-sky-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
      {active.element}
    </div>
  );
}
