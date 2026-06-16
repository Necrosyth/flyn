/**
 * VariableInput Component
 * -----------------------
 * Text input with dynamic variable suggestions dropdown.
 * Shows available variables from upstream nodes in the flow.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useFlowStore, useSelectedNode } from '@/hooks/useFlowStore';
import { getVariableSuggestions, groupSuggestionsByCategory, VariableSuggestion } from '@/utils/variableSuggestions';
import { ChevronDown, Variable, Zap } from 'lucide-react';

interface VariableInputProps {
  name: string;
  label: string;
  value: string;
  onChange: (name: string, value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const VariableInput: React.FC<VariableInputProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<VariableSuggestion[]>([]);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedNode = useSelectedNode();
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);

  // Calculate fixed dropdown position based on the wrapper element
  const updateDropdownPosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 256; // max-h-64 = 16rem = 256px
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(showAbove
        ? { bottom: viewportHeight - rect.top + 4, top: 'auto' }
        : { top: rect.bottom + 4, bottom: 'auto' }),
    });
  }, []);

  // Get suggestions when dropdown opens
  useEffect(() => {
    if (showDropdown && selectedNode) {
      const suggestions = getVariableSuggestions(selectedNode.id, nodes, edges);
      setFilteredSuggestions(suggestions);
      updateDropdownPosition();
    }
  }, [showDropdown, selectedNode, nodes, edges, updateDropdownPosition]);

  // Update position on scroll / resize while open
  useEffect(() => {
    if (!showDropdown) return;
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [showDropdown, updateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(name, newValue);

    if (selectedNode) {
      const suggestions = getVariableSuggestions(selectedNode.id, nodes, edges);
      const searchTerm = newValue.toLowerCase();
      
      // If there's a searchTerm, filter; otherwise show all
      const filtered = searchTerm 
        ? suggestions.filter(
            (s) =>
              s.value.toLowerCase().includes(searchTerm) ||
              s.label.toLowerCase().includes(searchTerm)
          )
        : suggestions;
        
      setFilteredSuggestions(filtered);
      setShowDropdown(true);
    }
  };

  // Insert selected variable
  const handleSelectVariable = (suggestion: VariableSuggestion) => {
    // If the current value contains {{, replace the last partial variable
    const currentValue = value || '';
    const lastBraceIndex = currentValue.lastIndexOf('{{');
    
    // Check if the last {{ is actually a partial variable being typed
    // (i.e., no closing }} after it)
    const lastClosingIndex = currentValue.lastIndexOf('}}');
    
    if (lastBraceIndex !== -1 && lastBraceIndex > lastClosingIndex) {
      const newValue = currentValue.slice(0, lastBraceIndex) + suggestion.value;
      onChange(name, newValue);
    } else {
      // Append to current value
      const space = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
      onChange(name, currentValue + space + suggestion.value);
    }
    
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const groupedSuggestions = groupSuggestionsByCategory(filteredSuggestions);

  const dropdownContent = showDropdown && (
    <div ref={dropdownRef} style={dropdownStyle}>
      <div className="bg-popover border border-border rounded-lg shadow-xl max-h-72 overflow-y-auto custom-scrollbar flex flex-col">
        {filteredSuggestions.length > 0 ? (
          Object.entries(groupedSuggestions).map(([category, suggestions]) => {
            const isGlobal = category === 'Global';
            const isEnv = category === 'Environment';
            
            return (
              <div key={category} className="flex flex-col">
                <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 sticky top-0 z-10 ${
                  isGlobal ? 'bg-blue-500/10 text-blue-400' : 
                  isEnv ? 'bg-purple-500/10 text-purple-400' :
                  'bg-card/80 text-muted-foreground backdrop-blur-sm'
                }`}>
                  <Zap className="h-3 w-3" />
                  {category}
                </div>
                <div className="flex flex-col py-1">
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={`${suggestion.value}-${idx}`}
                      type="button"
                      onClick={() => handleSelectVariable(suggestion)}
                      className="w-full px-3 py-2 text-left hover:bg-accent/10 transition-colors flex flex-col gap-0.5 group"
                    >
                      <span className="font-mono text-xs text-primary group-hover:text-primary-foreground transition-colors">
                        {suggestion.value}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground/90 transition-colors">
                        {suggestion.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">No matching variables</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      
      <div className="relative" ref={wrapperRef}>
        <Input
          ref={inputRef}
          id={name}
          type="text"
          value={value || ''}
          onChange={handleInputChange}
          onFocus={() => {
            if (selectedNode) {
              const suggestions = getVariableSuggestions(selectedNode.id, nodes, edges);
              setFilteredSuggestions(suggestions);
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pr-8 font-mono text-xs bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-primary/20 h-9"
        />
        <div className="absolute right-0 top-0 h-full flex items-center pr-1.5 gap-1">
          <Badge 
            variant="outline" 
            className="h-5 px-1 bg-primary/5 text-[9px] text-primary/70 border-primary/20 cursor-help"
            title="Dynamic variables supported"
          >
            <Variable className="h-2.5 w-2.5" />
          </Badge>
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {dropdownContent && ReactDOM.createPortal(dropdownContent, document.body)}
    </div>
  );
};

export default VariableInput;
