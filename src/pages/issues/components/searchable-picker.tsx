import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React, { useState, useRef } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Option {
  label: string;
  value: string | number;
}

interface SearchablePickerProps {
  options: Option[];
  value: string | number | (string | number)[];
  onSelect: (value: string | number | (string | number)[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  portalContainer?: any;
  allOption?: { label: string; value: string | number };
  multiple?: boolean;
  onSearchChange?: (search: string) => void;
  shouldFilter?: boolean;
}

export const SearchablePicker: React.FC<SearchablePickerProps> = ({
  options,
  value,
  onSelect,
  placeholder,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  portalContainer,
  allOption,
  multiple,
  onSearchChange,
  shouldFilter = true,
}) => {
  const [open, setOpen] = useState(false);
  const isClosingRef = useRef(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      isClosingRef.current = true;
      setTimeout(() => {
        isClosingRef.current = false;
      }, 150);
    }
    setOpen(newOpen);
  };

  const isSelected = (val: string | number) => {
    if (multiple && Array.isArray(value)) {
      return value.some(v => String(v) === String(val));
    }
    return String(value) === String(val);
  };

  const handleSelect = (val: string | number) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      const isValSelected = currentValues.some(v => String(v) === String(val));

      let newValues: (string | number)[];
      if (val === allOption?.value) {
        newValues = [val];
      } else {
        const withoutAll = currentValues.filter(v => v !== allOption?.value);
        if (isValSelected) {
          newValues = withoutAll.filter(v => String(v) !== String(val));
        } else {
          newValues = [...withoutAll, val];
        }

        if (newValues.length === 0 && allOption) {
          newValues = [allOption.value];
        }
      }
      onSelect(newValues);
    } else {
      onSelect(val);
      setOpen(false);
    }
  };

  const getLabel = () => {
    if (multiple && Array.isArray(value)) {
      if (allOption && value.includes(allOption.value)) return allOption.label;
      if (value.length === 0) return allOption?.label || placeholder;
      if (value.length === 1) {
        const opt = options.find(o => String(o.value) === String(value[0]));
        return opt ? opt.label : placeholder;
      }
      return `${value.length} selected`;
    }

    const selectedOption =
      allOption && value === allOption.value
        ? allOption
        : options.find(opt => String(opt.value) === String(value));

    return selectedOption ? selectedOption.label : placeholder;
  };

  const label = getLabel();
  const isTruncated = label.length > 20;
  const truncatedLabel = isTruncated ? `${label.slice(0, 20)}...` : label;

  const TriggerButton = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn(
        'w-[200px] justify-between bg-white border-gray-200 rounded-xl text-gray-700 font-normal hover:bg-gray-50',
        className
      )}
    >
      <span className="truncate">{truncatedLabel}</span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-[200px] justify-between bg-white border-gray-200 rounded-xl text-gray-700 font-normal hover:bg-gray-50',
            className
          )}
          onClick={e => {
            if (isClosingRef.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onPointerDown={e => {
            if (isClosingRef.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {isTruncated ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between w-full h-full overflow-hidden">
                  <span className="truncate">{truncatedLabel}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </div>
              </TooltipTrigger>
              <TooltipPrimitive.Portal container={portalContainer}>
                <TooltipContent className="z-[99999999]">
                  <p>{label}</p>
                </TooltipContent>
              </TooltipPrimitive.Portal>
            </Tooltip>
          ) : (
            <div className="flex items-center justify-between w-full h-full overflow-hidden">
              <span className="truncate">{label}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        container={portalContainer}
        onCloseAutoFocus={e => e.preventDefault()}
      >
        <Command shouldFilter={shouldFilter}>
          <CommandInput
            placeholder={searchPlaceholder}
            onValueChange={onSearchChange}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {allOption && (
                <CommandItem
                  value={allOption.label}
                  onSelect={() => handleSelect(allOption.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      isSelected(allOption.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {allOption.label}
                </CommandItem>
              )}
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => handleSelect(opt.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      isSelected(opt.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
