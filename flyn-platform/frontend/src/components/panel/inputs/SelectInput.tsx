/**
 * SelectInput Component
 * ---------------------
 * Dropdown select input for the PropertyPanel.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  name: string;
  label: string;
  value: string;
  onChange: (name: string, value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const SelectInput: React.FC<SelectInputProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  required,
  disabled,
}) => {
  // Radix Select crashes if any <SelectItem> has value="".
  // Filter them out and treat them as a visual placeholder instead.
  const safeOptions = options.filter((o) => o.value !== '');
  // If the current value is empty string, keep the Select in uncontrolled
  // "show placeholder" state by passing undefined.
  const safeValue = value || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Select
        value={safeValue}
        onValueChange={(val) => onChange(name, val)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full bg-secondary border-border text-foreground hover:bg-secondary/80 focus:border-primary focus:ring-primary/20">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {safeOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SelectInput;
