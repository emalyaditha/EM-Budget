import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

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
  const calendarRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
    isMobile: boolean;
  }>({ top: 0, left: 0, placement: 'bottom', isMobile: false });

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

  // Smart Positioning Calculation
  const updatePosition = () => {
    if (!isOpen || !containerRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Mobile & Tablet Optimization (< 768px width)
    if (width < 768) {
      setCoords({
        top: 0,
        left: 0,
        placement: 'bottom',
        isMobile: true
      });
      return;
    }

    const triggerRect = containerRef.current.getBoundingClientRect();
    const calendarHeight = calendarRef.current ? calendarRef.current.offsetHeight : 340;
    const calendarWidth = 288; // w-72 is 288px

    // Check vertical space
    const spaceBelow = height - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    
    let placement: 'top' | 'bottom' = 'bottom';
    if (spaceBelow < calendarHeight && spaceAbove > spaceBelow) {
      placement = 'top';
    }

    // Calculate left with collision clamping (12px safety padding from screen edges)
    let left = triggerRect.left;
    const maxLeft = width - calendarWidth - 12;
    const minLeft = 12;
    if (left > maxLeft) left = maxLeft;
    if (left < minLeft) left = minLeft;

    // Calculate top based on fixed positioning
    let top = 0;
    if (placement === 'bottom') {
      top = triggerRect.bottom + 6;
    } else {
      top = triggerRect.top - calendarHeight - 6;
    }

    setCoords({
      top,
      left,
      placement,
      isMobile: false
    });
  };

  // Run position updates when open state changes or window events trigger
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      
      // Secondary update immediately after paint to ensure correct size-based layout
      const timer = setTimeout(() => {
        updatePosition();
      }, 0);

      window.addEventListener('resize', updatePosition);
      // Capture scrolls from any parent scroll container
      window.addEventListener('scroll', updatePosition, true);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  // Click outside to close handler (checks both input element container and the portal-rendered calendar)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideTrigger = containerRef.current && containerRef.current.contains(target);
      const isInsideCalendar = calendarRef.current && calendarRef.current.contains(target);

      if (!isInsideTrigger && !isInsideCalendar) {
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

  const handlePrevYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear(viewYear - 1);
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear(viewYear + 1);
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
          className="text-success absolute top-1/2 -translate-y-1/2 pointer-events-none z-10" 
        />
        <input
          type="text"
          readOnly
          value={getDisplayValue()}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`date-picker-input w-full bg-surface border text-primary rounded-2xl text-xs focus:outline-none font-semibold cursor-pointer transition-all select-none ${paddingClasses} ${
            error 
              ? 'border-rose-500 focus:border-rose-500' 
              : isOpen 
              ? 'border-emerald-500 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]' 
              : 'border-default hover:border-default/80'
          } ${className}`}
        />
      </div>

      {isOpen && typeof document !== 'undefined' && createPortal(
        coords.isMobile ? (
          // Mobile Screen Center-Modal Layout (Clean Backdrop Overlay & Centered Focus)
          <div 
            className="fixed inset-0 bg-black/75 z-[9999] flex items-center justify-center p-4 backdrop-blur-xs animate-brand-fade-in"
            onClick={() => setIsOpen(false)}
          >
            <div 
              ref={calendarRef}
              className="relative w-full max-w-sm bg-card border border-default rounded-2xl p-5 shadow-2xl flex flex-col justify-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevYear}
                    title="Previous Year"
                    className="p-1.5 hover:bg-surface rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                  >
                    <ChevronsLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    title="Previous Month"
                    className="p-1.5 hover:bg-surface rounded-lg text-secondary hover:text-primary transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                  </button>
                </div>
                
                <div className="text-sm font-bold font-mono text-primary tracking-wide">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    title="Next Month"
                    className="p-1.5 hover:bg-surface rounded-lg text-secondary hover:text-primary transition-colors cursor-pointer"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextYear}
                    title="Next Year"
                    className="p-1.5 hover:bg-surface rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                  >
                    <ChevronsRight size={18} />
                  </button>
                </div>
              </div>

              {/* Weekday labels */}
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="text-center text-[11px] font-bold font-mono text-muted uppercase py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((cell, index) => {
                  const isSelected = cell.dateString === value;
                  const isCurrentMonth = cell.month === 'current';
                  
                  return (
                    <button
                      key={`${cell.dateString}-${index}`}
                      type="button"
                      onClick={(e) => handleSelectDay(cell.dateString, e)}
                      className={`aspect-square text-xs font-mono rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20'
                          : isCurrentMonth
                          ? 'text-primary hover:bg-surface hover:text-primary'
                          : 'text-muted hover:bg-surface-40'
                      }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>

              {/* Quick Select Buttons */}
              <div className="mt-4 pt-3.5 border-t border-default grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    handleSelectDay(todayStr, e);
                  }}
                  className="py-2 px-3 text-xs font-mono bg-card hover:bg-card text-primary hover:text-primary rounded-xl transition-colors cursor-pointer text-center font-medium"
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
                  className="py-2 px-3 text-xs font-mono bg-card hover:bg-card text-primary hover:text-primary rounded-xl transition-colors cursor-pointer text-center font-medium"
                >
                  Yesterday
                </button>
              </div>

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mt-4 w-full py-2.5 bg-surface hover:bg-surface text-primary hover:text-primary text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close Picker
              </button>
            </div>
          </div>
        ) : (
          // Desktop Screen Smart Positioned Fixed-Overlay Layout
          <div 
            ref={calendarRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className="z-[9999] w-72 bg-card/95 backdrop-blur-md border border-subtle rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-4 select-none animate-brand-fade-up before:absolute before:top-0 before:left-6 before:right-6 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-emerald-500/60 before:to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevYear}
                  title="Previous Year"
                  className="p-1 hover:bg-surface-80 rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                >
                  <ChevronsLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  className="p-1 hover:bg-surface-80 rounded-md text-secondary hover:text-primary transition-colors cursor-pointer"
                >
                  <ChevronLeft size={15} />
                </button>
              </div>

              <div className="text-xs font-bold font-mono text-primary tracking-wide">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="Next Month"
                  className="p-1 hover:bg-surface-80 rounded-md text-secondary hover:text-primary transition-colors cursor-pointer"
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleNextYear}
                  title="Next Year"
                  className="p-1 hover:bg-surface-80 rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                >
                  <ChevronsRight size={15} />
                </button>
              </div>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="text-center text-[10px] font-bold font-mono text-muted uppercase py-1">
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
                        ? 'bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/10'
                        : isCurrentMonth
                        ? 'text-primary hover:bg-surface hover:text-primary'
                        : 'text-muted hover:bg-surface-50'
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            {/* Quick Select Buttons */}
            <div className="mt-3 pt-2.5 border-t border-default grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  handleSelectDay(todayStr, e);
                }}
                className="py-1 px-2 text-[10px] font-mono bg-card hover:bg-surface text-primary hover:text-primary rounded-lg transition-colors cursor-pointer"
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
                className="py-1 px-2 text-[10px] font-mono bg-card hover:bg-surface text-primary hover:text-primary rounded-lg transition-colors cursor-pointer"
              >
                Yesterday
              </button>
            </div>
          </div>
        ),
        document.body
      )}
    </div>
  );
};
