import { useEffect, useRef, useState } from 'react';
import { MentionDropdown } from '../mentions/MentionDropdown';
import type { MentionItem } from '../../hooks/useMentionAutocomplete';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  mentionItems?: MentionItem[];
  'data-testid'?: string;
}

// ---------------------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------------------

export function ChatInput({
  onSend,
  disabled,
  mentionItems = [],
  ...props
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    ariaProps,
    dropdownId,
    filteredMentions,
    handleCaretChange,
    handleInputChange,
    handleMentionKeyDown,
    highlightedIndex,
    insertMention,
    isMentionOpen,
    setHighlightedIndex,
  } = useMentionAutocomplete({
    items: mentionItems,
    value,
    onValueChange: setValue,
    textareaRef,
  });

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
    resizeTextarea(textareaRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(e)) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e);
    resizeTextarea(e.target);
  };

  return (
    <div className="border-t border-eden-border px-4 py-3">
      <div className="relative flex items-end gap-2">
        {isMentionOpen && (
          <MentionDropdown
            dropdownId={dropdownId}
            items={filteredMentions}
            highlightedIndex={highlightedIndex}
            onHover={setHighlightedIndex}
            onSelect={insertMention}
          />
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleCaretChange}
          onKeyUp={handleCaretChange}
          onSelect={handleCaretChange}
          placeholder="Ask about the map or request changes. Use @mentions to reference items."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-eden-border bg-eden-bg px-4 py-2.5
                     text-sm text-eden-text placeholder:text-eden-text-2/50
                     focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                     disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid={props['data-testid']}
          {...ariaProps}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="flex-shrink-0 p-2.5 rounded-xl bg-eden-accent text-white
                     hover:bg-eden-accent/90 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
          data-testid="chat-send-btn"
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}
