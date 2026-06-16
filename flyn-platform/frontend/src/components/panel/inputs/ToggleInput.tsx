/**
 * ToggleInput Component
 * ---------------------
 * Boolean switch/toggle for the PropertyPanel.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface ToggleInputProps {
  name: string;
  label: string;
  value: boolean;
  onChange: (name: string, value: boolean) => void;
  disabled?: boolean;
}

const ToggleInput: React.FC<ToggleInputProps> = ({
  name,
  label,
  value,
  onChange,
  disabled,
}) => {
  return (
    <div className="flex items-center justify-between py-2">
      <Label htmlFor={name} className="text-sm font-medium text-muted-foreground cursor-pointer">
        {label}
      </Label>
      <Switch
        id={name}
        checked={value || false}
        onCheckedChange={(checked) => onChange(name, checked)}
        disabled={disabled}
      />
    </div>
  );
};

export default ToggleInput;
