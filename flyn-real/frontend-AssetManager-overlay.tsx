// frontend/src/components/builder/overlays/AssetManager.tsx
import React, { useState } from 'react';

export const AssetManager: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [assets, setAssets] = useState<any[]>([]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>🖼️ Asset Manager</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="asset-toolbar">
            <input type="file" multiple accept="image/*" />
            <button className="btn-primary">📤 Upload</button>
          </div>
          <div className="assets-grid">
            {assets.length === 0 ? (
              <p>No assets yet. Upload some images to get started.</p>
            ) : (
              assets.map((asset) => (
                <div key={asset.id} className="asset-item">
                  <img src={asset.url} alt={asset.name} />
                  <p>{asset.name}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
