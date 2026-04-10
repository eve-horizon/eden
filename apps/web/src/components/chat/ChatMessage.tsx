import { linkifyDisplayIds } from './referenceTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  metadata?: { changeset_id?: string };
  onChangesetClick?: (changesetId: string) => void;
  onReferenceClick?: (displayId: string) => void;
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

export function ChatMessage({
  role,
  content,
  metadata,
  onChangesetClick,
  onReferenceClick,
}: ChatMessageProps) {
  const isUser = role === 'user';

  // Detect changeset references in content (e.g. "Changeset #abc123")
  const changesetMatch = content.match(/[Cc]hangeset\s+#?(\S+)/);
  const changesetId = metadata?.changeset_id || changesetMatch?.[1];

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`chat-message-${role}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-eden-accent text-white rounded-br-md'
            : 'bg-eden-bg text-eden-text rounded-bl-md'
        }`}
      >
        {isUser ? (
          <LinkifiedPlainText
            content={content}
            isUser={isUser}
            onReferenceClick={onReferenceClick}
          />
        ) : (
          <div className="text-sm prose prose-sm max-w-none prose-headings:text-[1em] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-xs prose-code:bg-black/[0.06] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/[0.06] prose-pre:text-xs prose-pre:rounded-lg prose-table:text-[11px] prose-table:border-collapse prose-blockquote:border-l-[3px] prose-blockquote:border-eden-text-2/30 prose-blockquote:text-eden-text-2">
            <MarkdownContent
              content={content}
              onReferenceClick={onReferenceClick}
            />
          </div>
        )}

        {changesetId && (
          <button
            onClick={() => onChangesetClick?.(changesetId)}
            className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isUser
                ? 'bg-white/20 text-white hover:bg-white/30'
                : 'bg-eden-accent/10 text-eden-accent hover:bg-eden-accent/20'
            }`}
            data-testid="review-changeset-btn"
          >
            <ReviewIcon className="w-3.5 h-3.5" />
            Review Changeset
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarkdownContent — lightweight markdown to HTML for assistant messages
// ---------------------------------------------------------------------------

function MarkdownContent({
  content,
  onReferenceClick,
}: {
  content: string;
  onReferenceClick?: (displayId: string) => void;
}) {
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  const withPlaceholders = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, language: string, code: string) => {
      const placeholder = `__EDEN_CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(
        `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`,
      );
      return placeholder;
    })
    .replace(/`([^`]+)`/g, (_, code: string) => {
      const placeholder = `__EDEN_INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
      return placeholder;
    });

  let html = withPlaceholders
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Unordered lists
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Line breaks to paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  html = linkifyDisplayIds(html, 'eden-reference');
  html = restorePlaceholders(html, codeBlocks, '__EDEN_CODE_BLOCK_');
  html = restorePlaceholders(html, inlineCodes, '__EDEN_INLINE_CODE_');

  return (
    <div
      onClick={(event) => handleReferenceClick(event, onReferenceClick)}
      dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
    />
  );
}

function LinkifiedPlainText({
  content,
  isUser,
  onReferenceClick,
}: {
  content: string;
  isUser: boolean;
  onReferenceClick?: (displayId: string) => void;
}) {
  const html = linkifyDisplayIds(
    escapeHtml(content).replace(/\n/g, '<br/>'),
    isUser ? 'eden-reference eden-reference-user' : 'eden-reference',
  );

  return (
    <p
      className="text-sm whitespace-pre-wrap"
      onClick={(event) => handleReferenceClick(event, onReferenceClick)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function handleReferenceClick(
  event: React.MouseEvent<HTMLElement>,
  onReferenceClick?: (displayId: string) => void,
) {
  const target = event.target as HTMLElement | null;
  const referenceTarget = target?.closest<HTMLElement>('[data-display-id]');
  const displayId = referenceTarget?.dataset.displayId;
  if (!displayId) return;

  event.preventDefault();
  onReferenceClick?.(displayId);
}

function restorePlaceholders(
  html: string,
  values: string[],
  prefix: string,
): string {
  return values.reduce(
    (current, value, index) => current.replace(`${prefix}${index}__`, value),
    html,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ReviewIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
