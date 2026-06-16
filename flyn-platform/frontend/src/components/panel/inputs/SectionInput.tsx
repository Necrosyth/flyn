/**
 * SectionInput Component
 * ----------------------
 * Groups nested fields visually (e.g., Retry Policy, Timeout Config).
 */

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SchemaField } from '@/config/nodeSchemas';

// Import sibling inputs
import TextInput from './TextInput';
import SelectInput from './SelectInput';
import TextareaInput from './TextareaInput';
import ToggleInput from './ToggleInput';
import NumberInput from './NumberInput';
import SliderInput from './SliderInput';

interface SectionInputProps {
  name: string;
  label: string;
  fields: SchemaField[];
  value: Record<string, unknown>;
  onChange: (sectionName: string, fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

const SectionInput: React.FC<SectionInputProps> = ({
  name,
  label,
  fields,
  value = {},
  onChange,
  disabled,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Render a field based on its type
  const renderField = (field: SchemaField) => {
    const fieldValue = value[field.name];

    switch (field.type) {
      case 'text':
        return (
          <TextInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as string || ''}
            onChange={(fieldName, val) => onChange(name, fieldName, val)}
            placeholder={field.placeholder}
            required={field.required}
            disabled={disabled}
          />
        );

      case 'select':
        return (
          <SelectInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as string || ''}
            onChange={(fieldName, val) => onChange(name, fieldName, val)}
            options={field.options || []}
            required={field.required}
            disabled={disabled}
          />
        );

      case 'textarea':
        return (
          <TextareaInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as string || ''}
            onChange={(fieldName, val) => onChange(name, fieldName, val)}
            placeholder={field.placeholder}
            required={field.required}
            disabled={disabled}
          />
        );

      case 'toggle':
      case 'checkbox':
        return (
          <ToggleInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as boolean || false}
            onChange={(fieldName, val) => onChange(name, fieldName, val)}
            disabled={disabled}
          />
        );

      case 'number':
        return (
          <NumberInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as number}
            onChange={(fieldName, val) => onChange(name, fieldName, val)}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            required={field.required}
            disabled={disabled}
          />
        );

      case 'slider':
        return (
          <SliderInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as number || field.min || 0}
            onChange={(fieldName, val) => onChange(name, fieldName, val)}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={disabled}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-secondary/50 hover:bg-secondary transition-colors"
        disabled={disabled}
      >
        <Label className="text-sm font-medium text-muted-foreground cursor-pointer">{label}</Label>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        )}
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div className="p-3 space-y-4 bg-card">
          {fields.map((field) => renderField(field))}
        </div>
      )}
    </div>
  );
};

export default SectionInput;
