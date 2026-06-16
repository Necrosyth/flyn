// frontend/src/components/common/Form.tsx
import React, { useState, useCallback } from 'react';

interface FormProps {
  onSubmit: (values: Record<string, any>) => Promise<void>;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    required?: boolean;
  }>;
}

export const Form: React.FC<FormProps> = ({ onSubmit, fields }) => {
  const [values, setValues] = useState<Record<string, any>>(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  }, [values, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="form">
      {fields.map(field => (
        <div key={field.name} className="form-group">
          <label htmlFor={field.name}>{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              id={field.name}
              name={field.name}
              value={values[field.name]}
              onChange={handleChange}
              required={field.required}
            />
          ) : (
            <input
              id={field.name}
              type={field.type}
              name={field.name}
              value={values[field.name]}
              onChange={handleChange}
              required={field.required}
            />
          )}
        </div>
      ))}
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
};
