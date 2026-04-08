import type { Persona } from './types';

// ---------------------------------------------------------------------------
// PersonaTabs — sticky tab bar for server-side persona filtering
//
// Matches prototype: uppercase tab text, 3px accent bottom border for active,
// colored dots, task count badges with persona-colored background.
// ---------------------------------------------------------------------------

interface PersonaTabsProps {
  personas: Persona[];
  active: string | null; // null = overview (all)
  onSelect: (personaCode: string | null) => void;
  /** Task counts keyed by persona code — used for count badges */
  personaCounts?: Record<string, number>;
  /** Total task count across all personas — shown on Overview tab */
  totalTaskCount?: number;
}

export function PersonaTabs({
  personas,
  active,
  onSelect,
  personaCounts = {},
  totalTaskCount,
}: PersonaTabsProps) {
  return (
    <div
      data-testid="persona-tabs"
      style={{
        background: '#fff',
        borderBottom: '2px solid #e2e5e9',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        zIndex: 99,
        flexShrink: 0,
      }}
    >
      {/* Overview tab */}
      <Tab
        label="Overview"
        active={active === null}
        onClick={() => onSelect(null)}
        count={totalTaskCount}
        activeColor="#e65100"
      />

      {/* Per-persona tabs */}
      {personas.map((p) => {
        const isActive = active === p.code;
        const count = personaCounts[p.code];
        return (
          <Tab
            key={p.id}
            label={p.name}
            active={isActive}
            onClick={() => onSelect(p.code)}
            count={count}
            dotColor={p.color}
            activeColor={p.color}
          />
        );
      })}
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
  count,
  dotColor,
  activeColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  dotColor?: string;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        color: active ? '#1a1a2e' : '#6b7280',
        borderBottom: active ? `3px solid ${activeColor}` : '3px solid transparent',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#1a1a2e';
          e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#6b7280';
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {dotColor && (
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {label}
      {count != null && (
        <span
          style={{
            fontSize: '9px',
            fontWeight: 800,
            background: 'rgba(0,0,0,0.08)',
            padding: '1px 6px',
            borderRadius: '8px',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
