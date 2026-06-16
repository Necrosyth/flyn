// frontend/src/components/builder/overlays/CMSManager.tsx
import React, { useState } from 'react';

export const CMSManager: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [collections, setCollections] = useState<any[]>([]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>📂 CMS Manager</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="cms-toolbar">
            <button className="btn-primary">+ Create Collection</button>
            <button className="btn-secondary">🔄 Sync Now</button>
          </div>
          <div className="collections-list">
            {collections.length === 0 ? (
              <p>No collections yet. Create one to get started.</p>
            ) : (
              collections.map((c) => (
                <div key={c.id} className="collection-item">
                  {c.name}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
