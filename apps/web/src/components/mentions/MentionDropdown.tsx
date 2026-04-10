import type { MentionItem } from '../../hooks/useMentionAutocomplete';

interface MentionDropdownProps {
  dropdownId: string;
  items: MentionItem[];
  highlightedIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: MentionItem) => void;
}

export function MentionDropdown({
  dropdownId,
  items,
  highlightedIndex,
  onHover,
  onSelect,
}: MentionDropdownProps) {
  return (
    <div
      id={dropdownId}
      role="listbox"
      className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-eden-border bg-white shadow-2xl"
      data-testid="mention-dropdown"
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-sm text-eden-text-2">
          No matching items
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {items.map((item, index) => {
            const selected = index === highlightedIndex;
            return (
              <li key={`${item.type}:${item.entityId}`} role="presentation">
                <button
                  id={`${dropdownId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    selected ? 'bg-eden-accent/10' : 'hover:bg-eden-bg'
                  }`}
                  onMouseEnter={() => onHover(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(item);
                  }}
                  data-testid={`mention-option-${item.id}`}
                >
                  <MentionTypeBadge type={item.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-eden-text">
                        {item.id}
                      </span>
                      <span className="truncate text-sm font-medium text-eden-text">
                        {item.title}
                      </span>
                    </div>
                    {item.parentLabel && (
                      <div className="truncate text-xs text-eden-text-2">
                        {item.parentLabel}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MentionTypeBadge({ type }: { type: MentionItem['type'] }) {
  const palette =
    type === 'activity'
      ? 'bg-indigo-50 text-indigo-700'
      : type === 'step'
        ? 'bg-orange-50 text-orange-700'
        : type === 'task'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700';

  return (
    <span
      className={`inline-flex h-6 w-10 items-center justify-center rounded-full text-[10px] font-bold uppercase tracking-wide ${palette}`}
    >
      {type === 'activity'
        ? 'ACT'
        : type === 'step'
          ? 'STP'
          : type === 'task'
            ? 'TSK'
            : 'Q'}
    </span>
  );
}
