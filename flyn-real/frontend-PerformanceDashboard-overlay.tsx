// frontend/src/components/builder/overlays/PerformanceDashboard.tsx
import React from 'react';

export const PerformanceDashboard: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content wide">
        <div className="modal-header">
          <h2>📊 Performance Dashboard</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="metrics-grid">
            <div className="metric">
              <label>Lighthouse Performance</label>
              <div className="score">87</div>
            </div>
            <div className="metric">
              <label>First Contentful Paint (FCP)</label>
              <div className="score">1.2s</div>
            </div>
            <div className="metric">
              <label>Largest Contentful Paint (LCP)</label>
              <div className="score">2.5s</div>
            </div>
            <div className="metric">
              <label>Cumulative Layout Shift (CLS)</label>
              <div className="score">0.1</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
