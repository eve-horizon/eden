import { useEffect, useState } from 'react';

interface TypingIndicatorProps {
  startTime?: number | null;
}

const PHRASES = [
  'Analyzing map...',
  'Considering changes...',
  'Drafting response...',
];

export function TypingIndicator({ startTime }: TypingIndicatorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startTime) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [startTime]);

  const phrase = PHRASES[Math.floor(elapsedSeconds / 3) % PHRASES.length];

  return (
    <div className="flex justify-start" data-testid="typing-indicator">
      <div className="rounded-2xl rounded-bl-md bg-eden-bg px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-eden-text-2/40 animate-bounce [animation-delay:-0.3s]" />
          <div className="h-2 w-2 rounded-full bg-eden-text-2/40 animate-bounce [animation-delay:-0.15s]" />
          <div className="h-2 w-2 rounded-full bg-eden-text-2/40 animate-bounce" />
          <span className="ml-2 text-xs font-medium text-eden-text-2">
            Eve is thinking... {elapsedSeconds}s
          </span>
        </div>
        <div className="mt-2 text-[11px] text-eden-text-2/70">{phrase}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-eden-text-2/40">
          Waiting for coordinator response
        </div>
      </div>
    </div>
  );
}
