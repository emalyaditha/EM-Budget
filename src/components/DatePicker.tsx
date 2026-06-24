import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string; // Expected in YYYY-MM-DD format
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  className = '',
  required = false,
  placeholder = 'Select Date',
  disabled = false,
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial date or default to today
  const getParsedDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return new Date();
    }
    return d;
  };

  const parsedDate = getParsedDate(value);
  const [viewYear, setViewYear] = useState(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedDate.getMonth()); // 0-11

  // Keep view in sync when value changes externally
  useEffect(() => {
    const d = getParsedDate(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [value]);

  // Click outside to close handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();

  // Create calendar cells (previous month padding + current month days + next month padding)
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  
  const cells: { day: number; month: 'prev' | 'current' | 'next'; dateString: string }[] = [];

  // Padding from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const pad = (num: number) => String(num).padStart(2, '0');
    cells.push({
      day: d,
      month: 'prev',
      dateString: `${prevYear}-${pad(prevMonth + 1)}-${pad(d)}`,
    });
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const pad = (num: number) => String(num).padStart(2, '0');
    cells.push({
      day: d,
      month: 'current',
      dateString: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`,
    });
  }

  // Padding from next month to make complete rows (multiple of 7)
  const totalCells = Math.ceil(cells.length / 7) * 7;
  const nextDaysCount = totalCells - cells.length;
  for (let d = 1; d <= nextDaysCount; d++) {
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const pad = (num: number) => String(num).padStart(2, '0');
    cells.push({
      day: d,
      month: 'next',
      dateString: `${nextYear}-${pad(nextMonth + 1)}-${pad(d)}`,
    });
  }

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelectDay = (dateString: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(dateString);
    setIsOpen(false);
  };

  // Format date for display (e.g. Jun 24, 2026)
  const getDisplayValue = () => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Determine paddings dynamically to prevent overlap by global input styles (which have high specificity)
  let paddingClasses = '!pl-10 !pr-3.5 !py-3.5';
  let iconLeft = '0.75rem';
  let iconSize = 13;

  if (className.includes('pl-9')) {
    paddingClasses = '!pl-9 !pr-2.5';
    iconLeft = '0.6rem';
    iconSize = 12;
  } else if (className.includes('pl-7')) {
    paddingClasses = '!pl-7 !pr-2';
    iconLeft = '0.45rem';
    iconSize = 11;
  } else if (className.includes('pl-8')) {
    paddingClasses = '!pl-8 !pr-2';
    iconLeft = '0.5rem';
    iconSize = 11;
  }

  if (className.includes('py-2.5')) {
    paddingClasses += ' !py-2.5';
  } else if (className.includes('py-3')) {
    paddingClasses += ' !py-3';
  } else if (className.includes('py-2')) {
    paddingClasses += ' !py-2';
  } else if (className.includes('py-1.5')) {
    paddingClasses += ' !py-1.5';
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className="relative flex items-center cursor-pointer"
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <CalendarIcon 
          size={iconSize} 
          style={{ left: iconLeft }}
          className="text-[var(--accent-primary)] absolute top-1/2 -translate-y-1/2 pointer-events-none z-10" 
        />
        <input
          type="text"
          readOnly
          value={getDisplayValue()}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`date-picker-input w-full bg-[#050510]/55 border text-white rounded-xl text-xs focus:outline-none font-mono cursor-pointer transition-all select-none ${paddingClasses} ${
            error 
              ? 'border-rose-500' 
              : isOpen 
              ? 'border-[var(--accent-primary)] shadow-[0_0_0_3px_rgba(0,163,255,0.2)]' 
              : 'border-zinc-850 hover:border-zinc-700'
          } ${className}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-72 bg-[#0A0A0C] border border-zinc-800 rounded-2xl shadow-2xl p-4 animate-brand-fade-up select-none left-0 md:left-auto md:right-0 lg:left-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-xs font-bold font-mono text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="text-center text-[10px] font-bold font-mono text-zinc-500 uppercase py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              const isSelected = cell.dateString === value;
              const isCurrentMonth = cell.month === 'current';
              
              return (
                <button
                  key={`${cell.dateString}-${index}`}
                  type="button"
                  onClick={(e) => handleSelectDay(cell.dateString, e)}
                  className={`aspect-square text-[11px] font-mono rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-primary)] text-white font-bold'
                      : isCurrentMonth
                      ? 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
                      : 'text-zinc-600 hover:bg-zinc-800/50'
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Quick Select Buttons */}
          <div className="mt-3 pt-2.5 border-t border-zinc-900 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={(e) => {
                const todayStr = new Date().toISOString().split('T')[0];
                handleSelectDay(todayStr, e);
              }}
              className="py-1 px-2 text-[10px] font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={(e) => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                handleSelectDay(yesterdayStr, e);
              }}
              className="py-1 px-2 text-[10px] font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              Yesterday
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
