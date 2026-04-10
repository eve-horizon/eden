import { useState, useRef, useEffect, useCallback } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  disabled?: boolean;
  editTrigger?: 'click' | 'doubleClick';
  className?: string;
  inputClassName?: string;
  style?: React.CSSProperties;
  /** Use lighter hover highlight for dark backgrounds (e.g. StepHeader, ActivityHeader) */
  darkBackground?: boolean;
}

export function InlineEdit({
  value,
  onSave,
  disabled = false,
  editTrigger = 'click',
  className = '',
  inputClassName = '',
  style,
  darkBackground = false,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!editing) setEditValue(value);
  }, [value, editing]);

  // Focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    if (disabled) return;
    setEditing(true);
    setEditValue(value);
  }, [disabled, value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setEditValue(value);
  }, [value]);

  const save = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === value) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      // Revert on error
      setEditValue(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [editValue, value, onSave, cancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={inputClassName}
        style={{
          ...style,
          outline: 'none',
          background: 'transparent',
          border: '1px solid rgba(59, 130, 246, 0.5)',
          borderRadius: '3px',
          padding: '1px 4px',
          margin: '-2px -5px',
          width: 'calc(100% + 10px)',
        }}
      />
    );
  }

  const hoverBg = darkBackground ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  return (
    <span
      onClick={(e) => {
        if (editTrigger !== 'click') return;
        e.stopPropagation();
        startEdit();
      }}
      onDoubleClick={(e) => {
        if (editTrigger !== 'doubleClick') return;
        e.stopPropagation();
        startEdit();
      }}
      className={className}
      style={{
        ...style,
        cursor: disabled ? 'default' : 'text',
        borderRadius: '3px',
        padding: '1px 4px',
        margin: '-1px -4px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = '';
      }}
      title={
        disabled
          ? undefined
          : editTrigger === 'doubleClick'
            ? 'Double-click to edit'
            : 'Click to edit'
      }
    >
      {value}
    </span>
  );
}
