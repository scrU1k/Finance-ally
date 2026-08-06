import React, { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface CustomTimePickerProps {
  value: string; // HH:mm
  onChange: (val: string) => void;
  className?: string;
}

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({ value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const presets = [
    { label: 'Morning', time: '09:00' },
    { label: 'Afternoon', time: '13:00' },
    { label: 'Evening', time: '19:00' },
    { label: 'Night', time: '22:00' },
  ];

  const handleNow = () => {
    const nowStr = new Date().toTimeString().split(' ')[0].substring(0, 5);
    onChange(nowStr);
    setIsOpen(false);
  };

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

  const [hourStr, minStr] = (value || '12:00').split(':');

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 bg-surface-soft border border-hairline hover:border-ink rounded-xl px-3 py-2 text-xs font-mono text-ink transition-all cursor-pointer shadow-sm min-h-[38px]"
      >
        <span className="flex items-center gap-1.5 font-bold truncate">
          <Clock className="w-3.5 h-3.5 text-brand-blue shrink-0" />
          <span>{value || '12:00'}</span>
        </span>
      </button>

      {/* Glass Popover Menu (Appears ABOVE selection area) */}
      {isOpen && (
        <div className="absolute left-0 right-0 bottom-full mb-1.5 z-[70] dotgui-glass border border-hairline rounded-2xl shadow-2xl p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100 bg-surface-card/95 backdrop-blur-xl w-60 sm:w-64">
          
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-custom uppercase font-bold">Select Time</span>
            <button
              type="button"
              onClick={handleNow}
              className="text-[10px] font-mono text-brand-blue font-bold hover:underline cursor-pointer"
            >
              Now
            </button>
          </div>

          {/* Quick Presets */}
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map(p => (
              <button
                key={p.time}
                type="button"
                onClick={() => {
                  onChange(p.time);
                  setIsOpen(false);
                }}
                className={`py-1 px-2 rounded-lg text-[10px] font-mono border text-center transition-all cursor-pointer ${
                  value === p.time
                    ? 'border-brand-blue text-brand-blue font-bold bg-surface-soft'
                    : 'border-hairline bg-surface-soft text-ink hover:border-ink'
                }`}
              >
                {p.label} ({p.time})
              </button>
            ))}
          </div>

          {/* Hour & Minute Picker Grid */}
          <div className="space-y-2 border-t border-hairline pt-2">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-muted-custom uppercase font-bold">Hour</span>
              <div className="grid grid-cols-6 gap-1 max-h-24 overflow-y-auto no-scrollbar">
                {Array.from({ length: 24 }).map((_, i) => {
                  const h = i.toString().padStart(2, '0');
                  const isSelected = h === hourStr;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onChange(`${h}:${minStr || '00'}`)}
                      className={`py-1 rounded-md text-[10px] font-mono text-center cursor-pointer ${
                        isSelected ? 'bg-brand-blue text-white font-bold' : 'hover:bg-surface-soft text-ink'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] font-mono text-muted-custom uppercase font-bold">Minute</span>
              <div className="grid grid-cols-6 gap-1">
                {['00', '10', '15', '30', '45', '50'].map(m => {
                  const isSelected = m === minStr;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onChange(`${hourStr || '12'}:${m}`)}
                      className={`py-1 rounded-md text-[10px] font-mono text-center cursor-pointer ${
                        isSelected ? 'bg-brand-blue text-white font-bold' : 'hover:bg-surface-soft text-ink'
                      }`}
                    >
                      :{m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
