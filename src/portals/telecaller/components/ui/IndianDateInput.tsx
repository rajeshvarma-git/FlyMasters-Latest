import { useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { cn, formatIndianDate, parseIndianDate } from "@telecaller/lib/utils";

type Props = {
  name: string;
  defaultValue?: string | null;
  className?: string;
};

export function IndianDateInput({ name, defaultValue, className }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const isoDefault = defaultValue?.slice(0, 10) || "";
  const [display, setDisplay] = useState(() => formatIndianDate(isoDefault));
  const [iso, setIso] = useState(isoDefault);

  const syncFromDisplay = (text: string) => {
    setDisplay(text);
    const parsed = parseIndianDate(text);
    if (parsed) setIso(parsed);
    else if (!text.trim()) setIso("");
  };

  const syncFromPicker = (value: string) => {
    setIso(value);
    setDisplay(formatIndianDate(value));
  };

  return (
    <div className={cn("relative", className)}>
      <input type="hidden" name={name} value={iso} />
      <input
        type="text"
        inputMode="numeric"
        placeholder="DD-MM-YYYY"
        value={display}
        onChange={(e) => syncFromDisplay(e.target.value)}
        onBlur={() => {
          if (iso) setDisplay(formatIndianDate(iso));
        }}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
      <div className="absolute right-0 top-0 flex h-full w-10 items-center justify-center">
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          value={iso}
          onChange={(e) => syncFromPicker(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick date"
        />
        <Calendar className="pointer-events-none h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
}
