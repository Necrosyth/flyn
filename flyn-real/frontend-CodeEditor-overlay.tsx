// frontend/src/components/builder/overlays/CodeEditor.tsx
import React, { useState } from 'react';

export const CodeEditor: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [code, setCode] = useState('// Your code here\n');
  const [language, setLanguage] = useState('typescript');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>📝 Code Editor</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="code-editor-toolbar">
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="typescript">TypeScript</option>
              <option value="jsx">JSX</option>
              <option value="css">CSS</option>
              <option value="html">HTML</option>
            </select>
          </div>
          <textarea
            className="code-editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              fontFamily: 'monospace',
              padding: '12px',
              height: '400px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button className="btn-primary">💾 Save</button>
        </div>
      </div>
    </div>
  );
};
