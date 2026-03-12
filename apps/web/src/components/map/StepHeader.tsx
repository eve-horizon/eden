import type { Step } from './types';

// ---------------------------------------------------------------------------
// StepHeader — accent-colored column header for a step within an activity
//
// Sits at the top of each step column with the step's display_id, name,
// and a task count badge. Uses the Eden accent orange for the top border.
// ---------------------------------------------------------------------------

interface StepHeaderProps {
  step: Step;
}

export function StepHeader({ step }: StepHeaderProps) {
  return (
    <div className="bg-white border-t-2 border-eden-accent rounded-t-lg px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-mono text-eden-accent font-semibold">
            {step.display_id}
          </span>
          <h3 className="text-sm font-semibold text-eden-text leading-snug truncate">
            {step.name}
          </h3>
        </div>

        <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-eden-bg text-[10px] font-semibold text-eden-text-2">
          {step.tasks.length}
        </span>
      </div>
    </div>
  );
}
