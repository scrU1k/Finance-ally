import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOpt = options.find(o => o.value === value);

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

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Select Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 bg-surface-soft border border-hairline hover:border-ink rounded-xl px-3 py-2 text-xs font-mono text-ink transition-all cursor-pointer shadow-sm min-h-[38px]"
      >
        <span className="truncate flex items-center gap-1.5 font-semibold">
          {selectedOpt?.icon}
          <span className="truncate">{selectedOpt ? selectedOpt.label : placeholder}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-custom transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Glass Popover Menu (Appears ABOVE selection area) */}
      {isOpen && (
        <div className="absolute left-0 right-0 bottom-full mb-1.5 z-[70] dotgui-glass border border-hairline rounded-xl shadow-2xl p-1 max-h-56 overflow-y-auto space-y-0.5 animate-in fade-in zoom-in-95 duration-100 bg-surface-card/95 backdrop-blur-xl">
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border border-brand-blue text-brand-blue font-bold bg-surface-soft'
                    : 'text-body-custom hover:bg-surface-soft hover:text-ink'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.icon}
                  <div className="truncate">
                    <div className="truncate font-semibold">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-muted-custom truncate">{opt.sublabel}</div>
                    )}
                  </div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-brand-blue shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
