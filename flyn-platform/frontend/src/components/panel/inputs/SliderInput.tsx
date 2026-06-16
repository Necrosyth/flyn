/**
 * SliderInput Component
 * ---------------------
 * Visual slider for percentages (AI confidence threshold).
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface SliderInputProps {
  name: string;
  label: string;
  value: number;
  onChange: (name: string, value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showPercentage?: boolean;
  disabled?: boolean;
}

const SliderInput: React.FC<SliderInputProps> = ({
  name,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  showPercentage = true,
  disabled,
}) => {
  const currentValue = value ?? min;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor={name} className="text-sm font-medium text-muted-foreground">
          {label}
        </Label>
        <span className="text-sm font-semibold text-primary">
          {currentValue}{showPercentage ? '%' : ''}
        </span>
      </div>
      <Slider
        id={name}
        value={[currentValue]}
        onValueChange={(values) => onChange(name, values[0])}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground/60">
        <span>{min}{showPercentage ? '%' : ''}</span>
        <span>{max}{showPercentage ? '%' : ''}</span>
      </div>
    </div>
  );
};

export default SliderInput;
