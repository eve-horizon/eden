import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, RefObject, TextareaHTMLAttributes } from 'react';
import type { MapResponse } from '../components/map/types';

export interface MentionItem {
  type: 'activity' | 'step' | 'task' | 'question';
  entityId: string;
  id: string;
  title: string;
  parentLabel?: string;
}

export interface MentionQuestion {
  id: string;
  display_id: string;
  question: string;
}

interface MentionRange {
  query: string;
  start: number;
  end: number;
}

interface UseMentionAutocompleteOptions {
  items: MentionItem[];
  value: string;
  onValueChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

interface MentionAriaProps
  extends Pick<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'aria-activedescendant' | 'aria-autocomplete' | 'aria-controls' | 'aria-expanded'
  > {
  role: 'combobox';
}

export function buildMentionItems(
  mapData: MapResponse | null,
  questions: MentionQuestion[],
): MentionItem[] {
  if (!mapData) return buildQuestionMentionItems(questions);

  const items: MentionItem[] = [];

  for (const activity of mapData.activities) {
    items.push({
      type: 'activity',
      entityId: activity.id,
      id: activity.display_id,
      title: activity.name,
    });

    for (const step of activity.steps) {
      items.push({
        type: 'step',
        entityId: step.id,
        id: step.display_id,
        title: step.name,
        parentLabel: activity.display_id,
      });

      for (const task of step.tasks) {
        items.push({
          type: 'task',
          entityId: task.id,
          id: task.display_id,
          title: task.title,
          parentLabel: `${activity.display_id} > ${step.display_id}`,
        });
      }
    }
  }

  return dedupeMentionItems([...items, ...buildQuestionMentionItems(questions)]);
}

export function useMentionAutocomplete({
  items,
  value,
  onValueChange,
  textareaRef,
}: UseMentionAutocompleteOptions) {
  const dropdownId = useId();
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [activeRange, setActiveRange] = useState<MentionRange | null>(null);

  const filteredMentions = useMemo(() => {
    if (!activeRange) return [];
    return rankMentions(items, activeRange.query).slice(0, 10);
  }, [activeRange, items]);

  useEffect(() => {
    if (filteredMentions.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    if (highlightedIndex > filteredMentions.length - 1) {
      setHighlightedIndex(filteredMentions.length - 1);
    }
  }, [filteredMentions, highlightedIndex]);

  const syncActiveMention = useCallback(
    (nextValue: string, caretOverride?: number | null) => {
      const textarea = textareaRef.current;
      const caret =
        caretOverride ?? textarea?.selectionStart ?? nextValue.length;
      setActiveRange(findMentionRange(nextValue, caret));
    },
    [textareaRef],
  );

  useEffect(() => {
    syncActiveMention(value);
  }, [syncActiveMention, value]);

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (!activeRange) return false;

      const before = value.slice(0, activeRange.start);
      const after = value.slice(activeRange.end).replace(/^\s*/, '');
      const insertedValue = `${before}@${item.id} ${after}`;
      const nextCaret = before.length + item.id.length + 2;

      onValueChange(insertedValue);
      setActiveRange(null);
      setHighlightedIndex(0);

      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      });

      return true;
    },
    [activeRange, onValueChange, textareaRef, value],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      onValueChange(nextValue);
      syncActiveMention(nextValue, event.target.selectionStart);
    },
    [onValueChange, syncActiveMention],
  );

  const handleCaretChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    syncActiveMention(textarea.value, textarea.selectionStart);
  }, [syncActiveMention, textareaRef]);

  const handleMentionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const isOpen = activeRange !== null;
      const count = filteredMentions.length;

      if (!isOpen) return false;

      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveRange(null);
        return true;
      }

      if (count === 0) return false;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % count);
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + count) % count);
        return true;
      }

      if (event.key === 'PageDown') {
        event.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 5, count - 1));
        return true;
      }

      if (event.key === 'PageUp') {
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 5, 0));
        return true;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = filteredMentions[highlightedIndex];
        if (!selected) return false;
        event.preventDefault();
        return insertMention(selected);
      }

      return false;
    },
    [activeRange, filteredMentions, highlightedIndex, insertMention],
  );

  const ariaProps: MentionAriaProps = {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': activeRange !== null,
    'aria-controls': activeRange ? dropdownId : undefined,
    'aria-activedescendant':
      activeRange && filteredMentions[highlightedIndex]
        ? `${dropdownId}-option-${highlightedIndex}`
        : undefined,
  };

  return {
    ariaProps,
    dropdownId,
    filteredMentions,
    handleCaretChange,
    handleInputChange,
    handleMentionKeyDown,
    highlightedIndex,
    insertMention,
    isMentionOpen: activeRange !== null,
    mentionQuery: activeRange?.query ?? null,
    setHighlightedIndex,
  };
}

function buildQuestionMentionItems(questions: MentionQuestion[]): MentionItem[] {
  return questions.map((question) => ({
    type: 'question',
    entityId: question.id,
    id: question.display_id,
    title: question.question,
  }));
}

function dedupeMentionItems(items: MentionItem[]): MentionItem[] {
  const seen = new Set<string>();
  const deduped: MentionItem[] = [];

  for (const item of items) {
    const key = `${item.type}:${item.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function findMentionRange(value: string, caret: number): MentionRange | null {
  if (caret == null || caret < 0) return null;

  const prefix = value.slice(0, caret);
  const triggerIndex = prefix.lastIndexOf('@');
  if (triggerIndex === -1) return null;

  const beforeTrigger = triggerIndex === 0 ? '' : prefix[triggerIndex - 1];
  if (beforeTrigger && /[\w/]/.test(beforeTrigger)) {
    return null;
  }

  const query = prefix.slice(triggerIndex + 1);
  if (/[\s@]/.test(query)) {
    return null;
  }

  return {
    query,
    start: triggerIndex,
    end: caret,
  };
}

function rankMentions(items: MentionItem[], query: string): MentionItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const ranked = items
    .map((item) => ({
      item,
      score: scoreMention(item, normalizedQuery),
    }))
    .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const typeCompare =
        mentionTypeOrder(left.item.type) - mentionTypeOrder(right.item.type);
      if (typeCompare !== 0) {
        return typeCompare;
      }

      const idCompare = left.item.id.localeCompare(right.item.id);
      if (idCompare !== 0) {
        return idCompare;
      }

      return left.item.title.localeCompare(right.item.title);
    });

  return ranked.map((entry) => entry.item);
}

function scoreMention(item: MentionItem, query: string): number {
  if (query.length === 0) {
    return mentionTypeOrder(item.type) * 10;
  }

  const id = item.id.toLowerCase();
  const title = item.title.toLowerCase();

  if (id.startsWith(query)) return 0;
  if (title.startsWith(query)) return 1;
  if (id.includes(query)) return 2;
  if (title.includes(query)) return 3;
  if (isSubsequence(query, id)) return 4;
  if (isSubsequence(query, title)) return 5;

  return Number.POSITIVE_INFINITY;
}

function mentionTypeOrder(type: MentionItem['type']): number {
  switch (type) {
    case 'activity':
      return 0;
    case 'step':
      return 1;
    case 'task':
      return 2;
    case 'question':
      return 3;
  }
}

function isSubsequence(query: string, candidate: string): boolean {
  let queryIndex = 0;

  for (const char of candidate) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}
