// frontend/src/components/builder/overlays/SEOSuite.tsx
import React, { useState } from 'react';

export const SEOSuite: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [seoScore, setSeoScore] = useState(87);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>🔍 SEO Suite</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="seo-form">
            <div className="form-group">
              <label>Meta Title</label>
              <input type="text" placeholder="Your page title" maxLength={60} />
              <small>0/60</small>
            </div>
            <div className="form-group">
              <label>Meta Description</label>
              <textarea placeholder="Your page description" maxLength={160}></textarea>
              <small>0/160</small>
            </div>
            <div className="seo-score">
              <h3>SEO Score: {seoScore}/100</h3>
              <div className="score-bar">
                <div style={{ width: `${seoScore}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
