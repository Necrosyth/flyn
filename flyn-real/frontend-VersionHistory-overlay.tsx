// frontend/src/components/builder/overlays/VersionHistory.tsx
import React, { useState } from 'react';

export const VersionHistory: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [versions, setVersions] = useState([
    { id: '1', name: 'Initial version', date: new Date(), author: 'You' },
    { id: '2', name: 'Updated layout', date: new Date(), author: 'You' },
  ]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>⏱️ Version History</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="version-list">
            {versions.map((version) => (
              <div key={version.id} className="version-item">
                <div className="version-info">
                  <h4>{version.name}</h4>
                  <p>{version.date.toLocaleString()}</p>
                </div>
                <div className="version-actions">
                  <button className="btn-secondary">🔍 Compare</button>
                  <button className="btn-secondary">↩️ Restore</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
