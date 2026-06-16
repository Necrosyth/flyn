// frontend/src/components/builder/overlays/DeploymentManager.tsx
import React, { useState } from 'react';

export const DeploymentManager: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [platform, setPlatform] = useState('cloudflare_pages');
  const [domain, setDomain] = useState('');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>🚀 Deployment Manager</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="deployment-form">
            <div className="form-group">
              <label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="cloudflare_pages">Cloudflare Pages</option>
                <option value="vercel">Vercel</option>
                <option value="aws_amplify">AWS Amplify</option>
                <option value="netlify">Netlify</option>
                <option value="docker">Docker</option>
              </select>
            </div>
            <div className="form-group">
              <label>Custom Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button className="btn-success">🚀 Deploy Now</button>
        </div>
      </div>
    </div>
  );
};
