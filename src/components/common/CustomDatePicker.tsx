import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  className?: string;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Handle manual typed input
  const handleTypeChange = (text: string) => {
    setTypedInput(text);
    // If text matches YYYY-MM-DD or YYYY/MM/DD
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
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 bg-surface-soft border border-hairline hover:border-ink rounded-xl px-3 py-2 text-xs font-mono text-ink transition-all cursor-pointer shadow-sm min-h-[38px]"
      >
        <span className="flex items-center gap-1.5 font-bold truncate">
          <Calendar className="w-3.5 h-3.5 text-brand-blue shrink-0" />
          <span>{value || 'Select Date'}</span>
        </span>
      </button>

      {/* Glass Popover Menu (Appears ABOVE selection area) */}
      {isOpen && (
        <div className="absolute left-0 right-0 bottom-full mb-1.5 z-[70] dotgui-glass border border-hairline rounded-2xl shadow-2xl p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100 bg-surface-card/95 backdrop-blur-xl w-64 sm:w-72">
          
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
              className="flex-1 py-1 rounded-lg text-[10px] font-mono border border-hairline bg-surface-soft text-ink font-bold hover:border-ink cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPreset(1)}
              className="flex-1 py-1 rounded-lg text-[10px] font-mono border border-hairline bg-surface-soft text-ink font-bold hover:border-ink cursor-pointer"
            >
              Yesterday
            </button>
          </div>

          {/* Month / Year Controls */}
          <div className="flex items-center justify-between border-t border-hairline pt-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 text-muted-custom hover:text-ink rounded-lg cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-ink">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 text-muted-custom hover:text-ink rounded-lg cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Calendar Day Matrix */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono text-muted-custom">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const mStr = (viewMonth + 1).toString().padStart(2, '0');
              const dStr = dayNum.toString().padStart(2, '0');
              const dayFormatted = `${viewYear}-${mStr}-${dStr}`;
              const isSelected = dayFormatted === value;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-brand-blue text-white font-bold shadow-sm'
                      : 'hover:bg-surface-soft text-ink'
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
};
