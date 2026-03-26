import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';

// ---------------------------------------------------------------------------
// Types — mapped from Eve's thread/message API
// ---------------------------------------------------------------------------

interface EveThread {
  id: string;
  key: string;
  created_at: string;
}

interface EveMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  actor_type: string;
  body: string;
  created_at: string;
}

interface SimulateResponse {
  thread_id: string;
  job_ids: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: { changeset_id?: string };
}

interface ChatPanelProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onReviewChangeset?: (changesetId: string) => void;
}

/** Strip the "@eve pm [eden-project:UUID] " routing prefix the gateway prepends */
function stripRoutePrefix(body: string): string {
  return body
    .replace(/^@eve\s+\w+\s+/i, '')
    .replace(/^\[eden-project:[^\]]+\]\s*/i, '');
}

/** Convert Eve messages to our display format */
function toMessages(msgs: EveMessage[]): Message[] {
  return msgs.map((m) => ({
    id: m.id,
    role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: m.direction === 'inbound' ? stripRoutePrefix(m.body) : m.body,
    created_at: m.created_at,
  }));
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel({ projectId, open, onClose, onReviewChangeset }: ChatPanelProps) {
  const [_threads, setThreads] = useState<EveThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load threads when panel opens — auto-select the most recent one
  useEffect(() => {
    if (!open) return;
    api.get<EveThread[]>(`/projects/${projectId}/chat/threads`)
      .then((threads) => {
        const list = threads ?? [];
        setThreads(list);
        // Auto-select the most recent thread (if any) and we don't already have one
        if (list.length > 0 && !activeThread) {
          setActiveThread(list[0].id);
        }
      })
      .catch(() => setError('Failed to load threads'));
  }, [projectId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when thread selected
  useEffect(() => {
    if (!activeThread) return;
    api.get<EveMessage[]>(`/chat/threads/${activeThread}/messages`)
      .then((msgs) => setMessages(toMessages(msgs)))
      .catch(() => setError('Failed to load messages'));
  }, [activeThread]);

  // Poll for new messages after sending
  const startPolling = useCallback((threadId: string, knownCount: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(true);

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max polling

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const msgs = await api.get<EveMessage[]>(`/chat/threads/${threadId}/messages`);
        const converted = toMessages(msgs);
        if (converted.length > knownCount) {
          setMessages(converted);
          setPolling(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore poll errors
      }

      if (attempts >= maxAttempts) {
        setPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 5000);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSend = async (message: string) => {
    if (!message.trim()) return;

    setError(null);
    setLoading(true);

    try {
      // Optimistically add user message
      const userMsg: Message = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      };

      if (!activeThread) {
        // Create new thread (pass new_thread flag if user explicitly clicked "New thread")
        const result = await api.post<SimulateResponse>(
          `/projects/${projectId}/chat/threads`,
          { message, new_thread: forceNew || undefined },
        );
        setActiveThread(result.thread_id);
        setForceNew(false);
        setMessages([userMsg]);
        startPolling(result.thread_id, 1); // Poll for AI response (> 1 message)
      } else {
        // Send to existing thread
        setMessages((prev) => [...prev, userMsg]);
        await api.post(`/chat/threads/${activeThread}/messages`, { message, projectId });
        startPolling(activeThread, messages.length + 1); // Poll for response
      }
    } catch {
      setError('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleNewThread = () => {
    setActiveThread(null);
    setMessages([]);
    setPolling(false);
    setForceNew(true);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleChangesetClick = (changesetId: string) => {
    onReviewChangeset?.(changesetId);
  };

  if (!open) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full z-[200] flex"
      data-testid="chat-panel"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="w-[560px] h-full bg-eden-surface border-l border-eden-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-eden-border">
          <div className="flex items-center gap-3">
            <ChatBubbleIcon className="w-5 h-5 text-eden-accent" />
            <h2 className="text-sm font-bold text-eden-text">Map Chat</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewThread}
              className="p-1.5 rounded-lg text-eden-text-2 hover:bg-eden-bg hover:text-eden-text transition-colors"
              title="New thread"
              aria-label="New thread"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-eden-text-2 hover:bg-eden-bg hover:text-eden-text transition-colors"
              title="Close"
              aria-label="Close chat panel"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 eden-scroll">
          {messages.length === 0 && !polling && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <ChatBubbleIcon className="w-12 h-12 text-eden-text-2/30 mx-auto mb-3" />
                <p className="text-sm text-eden-text-2">
                  Ask me to edit the story map
                </p>
                <p className="text-xs text-eden-text-2/60 mt-1">
                  "Add an admin approval step" or "What tasks are in onboarding?"
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.id || i}
              role={msg.role}
              content={msg.content}
              metadata={msg.metadata}
              onChangesetClick={handleChangesetClick}
            />
          ))}

          {polling && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={loading || polling}
          data-testid="chat-input"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
