import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Walkthrough — overlay tooltip sequence that highlights UI elements.
//
// Role-specific step sequences guide users through the interface. Each step
// targets a CSS selector, shows a tooltip anchored to that element, and
// highlights it with a spotlight cutout. Dismissible at any step.
// Completion tracked in localStorage by role.
// ---------------------------------------------------------------------------

export type WalkthroughRole = 'owner' | 'editor' | 'viewer';

interface WalkthroughStep {
  target: string;        // CSS selector for the highlighted element
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const OWNER_STEPS: WalkthroughStep[] = [
  {
    target: '[data-testid="story-map"]',
    title: 'Welcome to Eden',
    description: 'This is your story map — a living document of your product requirements organized as activities, steps, and tasks.',
    position: 'bottom',
  },
  {
    target: '.story-grid',
    title: 'The Map Grid',
    description: 'Activities flow left-to-right across the top. Steps sit below each activity. Tasks live in the cells beneath.',
    position: 'bottom',
  },
  {
    target: '[data-testid="persona-tabs"]',
    title: 'Persona Tabs',
    description: 'Filter the map by persona to focus on one user type at a time. Each persona has a unique color.',
    position: 'bottom',
  },
  {
    target: '[data-testid="chat-fab"]',
    title: 'Chat with Eve',
    description: 'Open the chat panel to converse with the AI expert panel. They can modify the map based on your instructions.',
    position: 'left',
  },
  {
    target: '[data-testid="cross-cutting-qs-btn"]',
    title: 'Changesets',
    description: 'All AI-proposed changes go through changesets. Review, accept, or reject individual items before they hit the map.',
    position: 'left',
  },
  {
    target: '[data-testid="pending-approvals-btn"]',
    title: 'Approval Queue',
    description: 'As an owner, new items land in your approval queue. Review and approve them to make them visible to the team.',
    position: 'left',
  },
  {
    target: '[data-testid="notification-bell"]',
    title: 'Members',
    description: 'Manage who has access to this project. Invite team members and assign roles (owner, editor, viewer).',
    position: 'bottom',
  },
  {
    target: '[data-testid="export-json-btn"]',
    title: 'Sources & Export',
    description: 'Upload documents for AI ingestion, and export your map as JSON or Markdown at any time.',
    position: 'left',
  },
];

const EDITOR_STEPS: WalkthroughStep[] = [
  {
    target: '[data-testid="story-map"]',
    title: 'Welcome to Eden',
    description: 'Your story map shows the product requirements as a grid of activities, steps, and tasks.',
    position: 'bottom',
  },
  {
    target: '.story-grid',
    title: 'The Map Grid',
    description: 'You can drag and drop to reorder activities, steps, and tasks. Double-click names to rename inline.',
    position: 'bottom',
  },
  {
    target: '[data-testid="chat-fab"]',
    title: 'Chat with Eve',
    description: 'Ask the AI expert panel to analyze requirements, suggest improvements, or generate new content.',
    position: 'left',
  },
  {
    target: '[data-testid="hide-proposed-btn"]',
    title: 'Drafts & Proposals',
    description: 'Toggle visibility of proposed (2.0) items. These are AI-suggested additions awaiting review.',
    position: 'bottom',
  },
  {
    target: '[data-testid="questions-only-btn"]',
    title: 'Open Questions',
    description: 'Filter to see only tasks with unresolved questions. Answer them to evolve the map.',
    position: 'bottom',
  },
  {
    target: '[data-testid="export-json-btn"]',
    title: 'Sources & Export',
    description: 'Upload source documents and export the map in various formats.',
    position: 'left',
  },
];

const VIEWER_STEPS: WalkthroughStep[] = [
  {
    target: '[data-testid="story-map"]',
    title: 'Welcome to Eden',
    description: 'This is a read-only view of the story map. Browse the requirements organized by activities and steps.',
    position: 'bottom',
  },
  {
    target: '.story-grid',
    title: 'Browse the Map',
    description: 'Click on task cards to expand them and see details like user stories, acceptance criteria, and questions.',
    position: 'bottom',
  },
  {
    target: '[data-testid="questions-only-btn"]',
    title: 'Open Questions',
    description: 'Check which tasks have unresolved questions that need attention from the team.',
    position: 'bottom',
  },
  {
    target: '[data-testid="export-json-btn"]',
    title: 'Export',
    description: 'Download the story map as JSON or Markdown for offline reference.',
    position: 'left',
  },
];

const STEPS_BY_ROLE: Record<WalkthroughRole, WalkthroughStep[]> = {
  owner: OWNER_STEPS,
  editor: EDITOR_STEPS,
  viewer: VIEWER_STEPS,
};

function storageKey(role: WalkthroughRole): string {
  return `eden_walkthrough_${role}_complete`;
}

interface WalkthroughProps {
  role: WalkthroughRole;
  active: boolean;
  onDismiss: () => void;
}

export function Walkthrough({ role, active, onDismiss }: WalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps = STEPS_BY_ROLE[role];
  const currentStep = steps[stepIndex];

  // Find and measure the target element
  useEffect(() => {
    if (!active || !currentStep) {
      setTargetRect(null);
      return;
    }

    const step = currentStep;
    function measure() {
      const el = document.querySelector(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    }

    measure();
    // Re-measure on resize/scroll
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, currentStep]);

  const handleNext = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // Complete
      try {
        localStorage.setItem(storageKey(role), 'true');
      } catch {
        // localStorage unavailable
      }
      setStepIndex(0);
      onDismiss();
    }
  }, [stepIndex, steps.length, role, onDismiss]);

  const handleSkip = useCallback(() => {
    try {
      localStorage.setItem(storageKey(role), 'true');
    } catch {
      // localStorage unavailable
    }
    setStepIndex(0);
    onDismiss();
  }, [role, onDismiss]);

  // Keyboard: Escape dismisses, Enter/Right advances
  useEffect(() => {
    if (!active) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleSkip();
      if (e.key === 'Enter' || e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft' && stepIndex > 0) setStepIndex(stepIndex - 1);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [active, handleSkip, handleNext, stepIndex]);

  if (!active || !currentStep) return null;

  // Tooltip positioning
  const tooltipStyle = computeTooltipPosition(targetRect, currentStep.position);

  return (
    <div className="fixed inset-0 z-[200]" data-testid="walkthrough-overlay">
      {/* Semi-transparent backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={handleSkip}
      />

      {/* Spotlight cutout over target */}
      {targetRect && (
        <div
          className="absolute bg-transparent ring-[9999px] ring-black/40 rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute w-80 bg-white rounded-eden shadow-modal border border-eden-border p-5 z-[201]"
        style={tooltipStyle}
        data-testid="walkthrough-tooltip"
      >
        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <button
            onClick={handleSkip}
            className="text-[10px] text-eden-text-2 hover:text-eden-text transition-colors"
          >
            Skip tour
          </button>
        </div>

        <h4 className="text-sm font-bold text-eden-text mb-1.5">
          {currentStep.title}
        </h4>
        <p className="text-xs text-eden-text-2 leading-relaxed mb-4">
          {currentStep.description}
        </p>

        {/* Progress dots + nav */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                  i === stepIndex ? 'bg-eden-accent' : i < stepIndex ? 'bg-eden-accent/40' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex(stepIndex - 1)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-eden-text-2
                           hover:bg-eden-bg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-eden-accent text-white
                         hover:opacity-90 transition-opacity"
              data-testid="walkthrough-next-btn"
            >
              {stepIndex === steps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check if walkthrough has been completed for a role
// ---------------------------------------------------------------------------

export function isWalkthroughComplete(role: WalkthroughRole): boolean {
  try {
    return localStorage.getItem(storageKey(role)) === 'true';
  } catch {
    return false;
  }
}

export function resetWalkthrough(role: WalkthroughRole): void {
  try {
    localStorage.removeItem(storageKey(role));
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Tooltip position calculator
// ---------------------------------------------------------------------------

function computeTooltipPosition(
  rect: DOMRect | null,
  position: 'top' | 'bottom' | 'left' | 'right',
): React.CSSProperties {
  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const gap = 16;

  switch (position) {
    case 'bottom':
      return {
        top: rect.bottom + gap,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
      };
    case 'top':
      return {
        bottom: window.innerHeight - rect.top + gap,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
      };
    case 'left':
      return {
        top: Math.max(16, rect.top),
        right: window.innerWidth - rect.left + gap,
      };
    case 'right':
      return {
        top: Math.max(16, rect.top),
        left: rect.right + gap,
      };
  }
}
