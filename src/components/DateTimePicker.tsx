import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from './ui/Input';

interface Props {
  /** Local time as "YYYY-MM-DDTHH:mm" (same shape as <Input type="datetime-local">), '' when unset. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parse(value: string): Date {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function format(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Two-digit number box: type freely, commits when the draft is a valid in-range number; arrow keys step. */
function TimeField({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= min && n <= max) onCommit(n);
  };
  return (
    <input
      inputMode="numeric"
      maxLength={2}
      value={draft ?? pad(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setDraft(v); commit(v); }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const n = value + (e.key === 'ArrowUp' ? 1 : -1);
        onCommit(n > max ? min : n < min ? max : n);
        setDraft(null);
      }} className="w-9 text-center"
    />
  );
}

export function DateTimePicker({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [view, setView] = useState(() => parse(value)); // month being shown
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const sel = value ? parse(value) : null;
  const base = sel ?? new Date();
  const h12 = base.getHours() % 12 || 12;
  const pm = base.getHours() >= 12;

  useEffect(() => {
    if (!open) return;
    const r = triggerRef.current!.getBoundingClientRect();
    const h = popRef.current?.offsetHeight ?? 340;
    const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
    const down = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setView(parse(value));
    setOpen(!open);
  };

  const pickDay = (day: Date) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes());
    onChange(format(d));
  };

  const setTime = (hour12: number, minute: number, isPm: boolean) => {
    const d = new Date(base);
    d.setHours((hour12 % 12) + (isPm ? 12 : 0), minute, 0, 0);
    onChange(format(d));
  };

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i));
  const today = new Date();
  const same = (a: Date, b: Date | null) => !!b && a.toDateString() === b.toDateString();
  const label = sel
    ? `${pad(sel.getDate())} ${MONTHS[sel.getMonth()].slice(0, 3)} ${sel.getFullYear()}, ${pad(h12)}:${pad(sel.getMinutes())} ${pm ? 'PM' : 'AM'}`
    : 'Pick date & time';

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-left focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        <span className={sel ? 'text-text-primary' : 'text-text-secondary'}>{label}</span>
        <CalendarClock size={13} className="text-text-secondary shrink-0" />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="fixed z-[99999] w-[260px] rounded-xl border border-border/40 popover-surface shadow-2xl p-3 font-sans text-xs text-text-primary"
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? 1 : 0 }}
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="p-1 rounded hover:bg-bg-primary/60" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
            <span className="font-medium">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" className="p-1 rounded hover:bg-bg-primary/60" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {DAYS.map((d, i) => <span key={i} className="text-[10px] text-text-secondary py-1">{d}</span>)}
            {cells.map((c) => {
              const inMonth = c.getMonth() === view.getMonth();
              const isSel = same(c, sel);
              return (
                <button
                  key={c.getTime()}
                  type="button"
                  onClick={() => pickDay(c)}
                  className={`h-7 rounded-md text-[11px] transition-colors ${
                    isSel ? 'bg-accent text-white font-semibold'
                      : same(c, today) ? 'border border-accent/60 text-text-primary'
                      : inMonth ? 'text-text-primary hover:bg-bg-primary/60' : 'text-text-secondary/40 hover:bg-bg-primary/40'
                  }`}
                >
                  {c.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2">
            <span className="text-text-secondary mr-auto">Time</span>
            <TimeField value={h12} min={1} max={12} onCommit={(h) => setTime(h, base.getMinutes(), pm)} />
            <span className="text-text-secondary">:</span>
            <TimeField value={base.getMinutes()} min={0} max={59} onCommit={(m) => setTime(h12, m, pm)} />
            <div className="flex rounded-md overflow-hidden border border-border/30">
              <button type="button" className={`px-2 h-7 text-[11px] ${!pm ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-primary/60'}`} onClick={() => setTime(h12, base.getMinutes(), false)}>AM</button>
              <button type="button" className={`px-2 h-7 text-[11px] ${pm ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-primary/60'}`} onClick={() => setTime(h12, base.getMinutes(), true)}>PM</button>
            </div>
          </div>
          <div className="mt-2 flex justify-between">
            <button type="button" className="text-text-secondary hover:text-text-primary" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
            <button type="button" className="text-accent hover:underline" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
