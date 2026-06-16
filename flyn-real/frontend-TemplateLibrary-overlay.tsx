// frontend/src/components/builder/overlays/TemplateLibrary.tsx
import React, { useState } from 'react';

export const TemplateLibrary: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [templates] = useState([
    { id: '1', name: 'Business Website', category: 'Business', rating: 4.5 },
    { id: '2', name: 'Portfolio', category: 'Portfolio', rating: 4.8 },
    { id: '3', name: 'Blog', category: 'Blog', rating: 4.6 },
  ]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>🎨 Template Library</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="templates-grid">
            {templates.map((template) => (
              <div key={template.id} className="template-card">
                <h4>{template.name}</h4>
                <p>{template.category}</p>
                <div className="rating">⭐ {template.rating}</div>
                <button className="btn-primary">Use Template</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
