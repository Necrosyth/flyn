/**
 * NumberInput Component
 * ---------------------
 * Numeric input with optional min/max for the PropertyPanel.
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NumberInputProps {
  name: string;
  label: string;
  value: number | undefined;
  onChange: (name: string, value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = ({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  required,
  disabled,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = parseFloat(e.target.value);
    if (!isNaN(numValue)) {
      // Clamp value between min and max if provided
      let clampedValue = numValue;
      if (min !== undefined && clampedValue < min) clampedValue = min;
      if (max !== undefined && clampedValue > max) clampedValue = max;
      onChange(name, clampedValue);
    } else if (e.target.value === '') {
      onChange(name, 0);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
        {min !== undefined && max !== undefined && (
          <span className="text-xs text-muted-foreground/60 ml-2">
            ({min} - {max})
          </span>
        )}
      </Label>
      <Input
        id={name}
        type="number"
        value={value ?? ''}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-primary/20"
      />
    </div>
  );
};

export default NumberInput;
