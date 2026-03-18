// ---------------------------------------------------------------------------
// WalkthroughTrigger — "?" button in the footer to replay the walkthrough.
//
// Positioned in the AppShell footer area. Clicking resets the walkthrough
// completion state and activates the overlay sequence.
// ---------------------------------------------------------------------------

interface WalkthroughTriggerProps {
  onClick: () => void;
}

export function WalkthroughTrigger({ onClick }: WalkthroughTriggerProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full
                 bg-eden-bg border border-eden-border text-eden-text-2
                 hover:bg-eden-accent hover:text-white hover:border-eden-accent
                 transition-colors text-xs font-bold"
      title="Replay walkthrough"
      data-testid="walkthrough-trigger"
    >
      ?
    </button>
  );
}
