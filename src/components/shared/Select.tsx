'use client';

import {
  type FocusEventHandler,
  type KeyboardEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from '@phosphor-icons/react';

export type SelectOption = {
  value: string | number;
  label: ReactNode;
  disabled?: boolean;
};

export type SelectChangeEvent = {
  target: { value: string };
  currentTarget: { value: string };
};

type SelectProps = {
  options: readonly SelectOption[];
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  onValueChange?: (value: string) => void;
  label?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  title?: string;
  className?: string;
  wrapperClassName?: string;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true';
};

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function stringValue(value: string | number | undefined) {
  return value === undefined ? '' : String(value);
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      options,
      value,
      defaultValue,
      onChange,
      onValueChange,
      label,
      placeholder,
      disabled = false,
      required = false,
      id,
      name,
      title,
      className = '',
      wrapperClassName = '',
      onFocus,
      onBlur,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
    },
    forwardedRef,
  ) => {
    const generatedId = useId();
    const triggerId = id ?? `select-${generatedId.replace(/:/g, '')}`;
    const listboxId = `${triggerId}-listbox`;
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [internalValue, setInternalValue] = useState(stringValue(defaultValue));
    const [activeIndex, setActiveIndex] = useState(-1);
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
    const controlled = value !== undefined;
    const currentValue = controlled ? stringValue(value) : internalValue;

    const selectableOptions = useMemo<SelectOption[]>(() => {
      const result = [...options];
      if (placeholder && !result.some((option) => stringValue(option.value) === '')) {
        result.unshift({ value: '', label: placeholder });
      }
      return result;
    }, [options, placeholder]);

    const selectedIndex = selectableOptions.findIndex(
      (option) => stringValue(option.value) === currentValue,
    );
    const selectedOption = selectedIndex >= 0 ? selectableOptions[selectedIndex] : undefined;

    const setTriggerRef = (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const updateMenuPosition = useCallback(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 7;
      const preferredHeight = Math.min(280, selectableOptions.length * 42 + 12);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
      const spaceAbove = rect.top - viewportPadding - gap;
      const placeAbove = spaceBelow < Math.min(preferredHeight, 180) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(preferredHeight, placeAbove ? spaceAbove : spaceBelow));
      const width = Math.max(rect.width, 180);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      setMenuPosition({
        left,
        top: placeAbove
          ? Math.max(viewportPadding, rect.top - maxHeight - gap)
          : rect.bottom + gap,
        width,
        maxHeight,
      });
    }, [selectableOptions.length]);

    const openMenu = () => {
      if (disabled) return;
      updateMenuPosition();
      setActiveIndex(
        selectedIndex >= 0 && !selectableOptions[selectedIndex]?.disabled
          ? selectedIndex
          : selectableOptions.findIndex((option) => !option.disabled),
      );
      setOpen(true);
    };

    const selectOption = (option: SelectOption) => {
      if (option.disabled) return;
      const nextValue = stringValue(option.value);
      if (!controlled) setInternalValue(nextValue);
      const event = {
        target: { value: nextValue },
        currentTarget: { value: nextValue },
      };
      onChange?.(event);
      onValueChange?.(nextValue);
      setOpen(false);
    };

    const moveActive = (direction: 1 | -1) => {
      if (selectableOptions.length === 0) return;
      let next = activeIndex;
      for (let attempts = 0; attempts < selectableOptions.length; attempts += 1) {
        next = (next + direction + selectableOptions.length) % selectableOptions.length;
        if (!selectableOptions[next]?.disabled) {
          setActiveIndex(next);
          return;
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!open) openMenu();
          else moveActive(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (!open) openMenu();
          else moveActive(-1);
          break;
        case 'Home': {
          if (!open) return;
          event.preventDefault();
          setActiveIndex(selectableOptions.findIndex((option) => !option.disabled));
          break;
        }
        case 'End': {
          if (!open) return;
          event.preventDefault();
          for (let index = selectableOptions.length - 1; index >= 0; index -= 1) {
            if (!selectableOptions[index]?.disabled) {
              setActiveIndex(index);
              break;
            }
          }
          break;
        }
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!open) openMenu();
          else if (activeIndex >= 0) selectOption(selectableOptions[activeIndex]);
          break;
        case 'Escape':
          if (!open) return;
          event.preventDefault();
          setOpen(false);
          break;
        case 'Tab':
          setOpen(false);
          break;
      }
    };

    useEffect(() => {
      if (!open) return;
      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
          setOpen(false);
        }
      };
      const reposition = () => updateMenuPosition();
      document.addEventListener('mousedown', handlePointerDown);
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      };
    }, [open, updateMenuPosition]);

    useEffect(() => {
      if (!open || activeIndex < 0) return;
      const activeOption = document.getElementById(`${listboxId}-option-${activeIndex}`);
      activeOption?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex, listboxId, open]);

    return (
      <div ref={rootRef} className={`relative flex min-w-0 flex-col gap-1.5 ${wrapperClassName}`}>
        {label && (
          <label htmlFor={triggerId} className="text-xs font-semibold text-text-secondary">
            {label}
          </label>
        )}
        {name && <input type="hidden" name={name} value={currentValue} />}
        <button
          ref={setTriggerRef}
          id={triggerId}
          title={title}
          type="button"
          value={currentValue}
          role="combobox"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={required || undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          className={`field-control flex h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm ${
            selectedOption ? 'text-text-primary' : 'text-text-secondary'
          } ${className}`}
        >
          <span className="min-w-0 flex-1 truncate">
            {selectedOption?.label ?? placeholder ?? '请选择'}
          </span>
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden="true"
            className={`shrink-0 text-text-secondary transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {open && menuPosition && createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ?? (typeof label === 'string' ? label : '选择选项')}
            className="fixed z-[100] overflow-y-auto rounded-[14px] border border-border bg-surface-solid p-1.5 shadow-[0_18px_50px_rgba(25,32,52,0.16)]"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
              width: menuPosition.width,
              maxHeight: menuPosition.maxHeight,
            }}
          >
            {selectableOptions.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-text-secondary">暂无可选项</div>
            ) : (
              selectableOptions.map((option, index) => {
                const optionValue = stringValue(option.value);
                const selected = optionValue === currentValue;
                const active = index === activeIndex;
                return (
                  <button
                    key={`${optionValue}-${index}`}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    value={optionValue}
                    role="option"
                    aria-selected={selected}
                    disabled={option.disabled}
                    onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOption(option)}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-accent/8 text-text-primary' : 'text-text-secondary'
                    } ${selected ? 'font-semibold text-accent' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <Check
                      size={15}
                      weight="bold"
                      aria-hidden="true"
                      className={selected ? 'text-accent' : 'invisible'}
                    />
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
