import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  subtitle?: string;
  customTrigger?: React.ReactNode;
  isOpenControlled?: boolean;
  onCloseControlled?: () => void;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  className = '',
  placeholder,
  title,
  subtitle,
  customTrigger,
  isOpenControlled,
  onCloseControlled,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isControlled = isOpenControlled !== undefined;
  const isOpen = isControlled ? isOpenControlled : internalIsOpen;

  const setIsOpen = (val: boolean) => {
    if (isControlled) {
      if (!val && onCloseControlled) onCloseControlled();
    } else {
      setInternalIsOpen(val);
    }
  };

  const [typedInput, setTypedInput] = useState(value);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Parse YYYY-MM-DD to Date
  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed

  useEffect(() => {
    setTypedInput(value);
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Handle manual typed input
  const handleTypeChange = (text: string) => {
    setTypedInput(text);
    const match = text.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      const y = match[1];
      const m = match[2].padStart(2, '0');
      const d = match[3].padStart(2, '0');
      const formatted = `${y}-${m}-${d}`;
      onChange(formatted);
    }
  };

  const setPreset = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const formatted = d.toISOString().split('T')[0];
    onChange(formatted);
    setIsOpen(false);
  };

  // Calendar Grid Math
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const handleSelectDay = (day: number) => {
    const m = (viewMonth + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    const formatted = `${viewYear}-${m}-${d}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button or Custom Trigger */}
      {!isControlled && (
        customTrigger ? (
          <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer inline-block">
            {customTrigger}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between gap-2 bg-surface-soft border border-hairline hover:border-ink rounded-xl px-3 py-2 text-xs font-mono text-ink transition-all cursor-pointer shadow-sm min-h-[38px]"
          >
            <span className="flex items-center gap-1.5 font-bold truncate">
              <Calendar className="w-3.5 h-3.5 text-brand-blue shrink-0" />
              <span>{value || placeholder || 'Date'}</span>
            </span>
          </button>
        )
      )}

      {/* Centered Glass Screen Modal */}
      {isOpen && createPortal(
          <div
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="bg-surface-card/90 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-100 w-80 max-w-[92vw] ring-1 ring-white/10"
              onClick={e => e.stopPropagation()}
            >
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-purple" />
                <span>{title || 'Select Date'}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Subtitle Card Line */}
            {subtitle && (
              <div className="bg-brand-purple/10 border border-brand-purple/30 p-2.5 rounded-xl text-xs font-mono text-brand-purple font-semibold text-center leading-snug">
                {subtitle}
              </div>
            )}

            {/* Manual Type Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Type Date (YYYY-MM-DD)</label>
              <input
                type="text"
                value={typedInput}
                onChange={e => handleTypeChange(e.target.value)}
                placeholder="2026-08-06"
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink font-bold"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPreset(0)}
                className="flex-1 py-1 rounded-lg bg-surface-soft hover:bg-surface-card border border-hairline text-[10px] font-mono text-ink font-bold"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setPreset(1)}
                className="flex-1 py-1 rounded-lg bg-surface-soft hover:bg-surface-card border border-hairline text-[10px] font-mono text-ink font-bold"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setPreset(2)}
                className="flex-1 py-1 rounded-lg bg-surface-soft hover:bg-surface-card border border-hairline text-[10px] font-mono text-ink font-bold"
              >
                2 Days Ago
              </button>
            </div>

            {/* Month & Year Navigation */}
            <div className="flex items-center justify-between font-mono text-xs text-ink font-bold pt-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-lg hover:bg-surface-soft text-muted-custom hover:text-ink cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                {monthNames[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-surface-soft text-muted-custom hover:text-ink cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 text-center font-mono text-[10px] text-muted-custom uppercase font-bold pt-1">
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-xs">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const m = (viewMonth + 1).toString().padStart(2, '0');
                const d = day.toString().padStart(2, '0');
                const dayStr = `${viewYear}-${m}-${d}`;
                const isSelected = value === dayStr;
                const isToday = new Date().toISOString().split('T')[0] === dayStr;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-purple text-white shadow-md'
                        : isToday
                        ? 'border border-brand-purple text-brand-purple bg-brand-purple/10'
                        : 'hover:bg-surface-soft text-ink'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
