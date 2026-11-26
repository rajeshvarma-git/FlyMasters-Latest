import React from 'react';
import { MapPin } from 'lucide-react';
import type { BranchOption } from '@student/lib/branchChoiceApi';

interface Props {
  options: BranchOption[];
  disabled?: boolean;
  onChoose: (option: BranchOption | null) => void;
}

/** The branch question in the first chat: tap a branch, or skip (skipping means Head Office). */
const BranchPicker: React.FC<Props> = ({ options, disabled, onChoose }) => (
  <div className="my-3 animate-scale-in" role="group" aria-label="Choose the branch easiest for you to visit">
    {options.length > 0 && (
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option)}
            className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none disabled:opacity-60"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">{option.name}</span>
              {option.area && <span className="block text-xs text-muted-foreground">{option.area}</span>}
            </span>
          </button>
        ))}
      </div>
    )}
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(null)}
      className="mt-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
    >
      Skip for now
    </button>
  </div>
);

export default BranchPicker;
