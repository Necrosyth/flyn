// src/components/builder/overlays/CodeEditor.tsx
import React from 'react';

export const CodeEditor: React.FC<any> = ({ project, framework, onClose, onDownload }) => (
  <div className="overlay code-editor">
    <div className="overlay-content">
      <h2>💻 Code Editor - {framework.toUpperCase()}</h2>
      <div className="editor-area">
        <pre><code>{`// Generated ${framework} code for ${project.name}
// Framework: ${framework}
// Generated: ${new Date().toISOString()}

// Your code here...`}</code></pre>
      </div>
      <div className="overlay-actions">
        <button onClick={() => onDownload('code')}>📥 Download</button>
        <button onClick={() => { /* copy */ }}>📋 Copy</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  </div>
);

// src/components/builder/overlays/DeploymentManager.tsx
export const DeploymentManager: React.FC<any> = ({ project, onClose, onDeploy }) => (
  <div className="overlay deployment-manager">
    <div className="overlay-content">
      <h2>🚀 Deployment Manager</h2>
      <div className="deployment-targets">
        {[
          { name: 'Cloudflare Pages', icon: '☁️' },
          { name: 'Vercel', icon: '▲' },
          { name: 'AWS Amplify', icon: '📦' },
          { name: 'Netlify', icon: '🌐' },
          { name: 'Docker', icon: '🐳' },
          { name: 'Static HTML', icon: '📄' },
          { name: 'App Store', icon: '🍎' },
          { name: 'Google Play', icon: '🤖' },
        ].map(target => (
          <div key={target.name} className="deployment-card">
            <span className="target-icon">{target.icon}</span>
            <span className="target-name">{target.name}</span>
            <button onClick={() => onDeploy(target.name)}>Deploy</button>
          </div>
        ))}
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// src/components/builder/overlays/CMSManager.tsx
export const CMSManager: React.FC<any> = ({ project, onClose, onSync }) => (
  <div className="overlay cms-manager">
    <div className="overlay-content">
      <h2>🗄️ CMS Manager</h2>
      <div className="cms-sections">
        <div className="cms-section">
          <h4>Collections</h4>
          <button>➕ Create Collection</button>
          <div className="collections-list">
            {['Projects', 'Pages', 'Components'].map(col => (
              <div key={col} className="collection-item">{col}</div>
            ))}
          </div>
        </div>
        <div className="cms-section">
          <h4>Sync Status</h4>
          <button onClick={onSync}>🔄 Sync Now</button>
          <p>Last synced: {new Date().toLocaleString()}</p>
        </div>
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// src/components/builder/overlays/PerformanceDashboard.tsx
export const PerformanceDashboard: React.FC<any> = ({ project, onClose }) => (
  <div className="overlay performance-dashboard">
    <div className="overlay-content">
      <h2>⚡ Performance Dashboard</h2>
      <div className="metrics-grid">
        <div className="metric">
          <span className="metric-label">Lighthouse Score</span>
          <span className="metric-value">92/100</span>
        </div>
        <div className="metric">
          <span className="metric-label">FCP</span>
          <span className="metric-value">1.2s</span>
        </div>
        <div className="metric">
          <span className="metric-label">LCP</span>
          <span className="metric-value">2.4s</span>
        </div>
        <div className="metric">
          <span className="metric-label">CLS</span>
          <span className="metric-value">0.08</span>
        </div>
        <div className="metric">
          <span className="metric-label">TTFB</span>
          <span className="metric-value">0.3s</span>
        </div>
        <div className="metric">
          <span className="metric-label">Page Size</span>
          <span className="metric-value">245KB</span>
        </div>
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// src/components/builder/overlays/SEOSuite.tsx
export const SEOSuite: React.FC<any> = ({ page, onClose, onUpdate }) => (
  <div className="overlay seo-suite">
    <div className="overlay-content">
      <h2>🔍 SEO Suite</h2>
      <div className="seo-sections">
        <div className="seo-section">
          <h4>Meta Tags</h4>
          <input placeholder="Meta Title" />
          <textarea placeholder="Meta Description" rows={3}></textarea>
          <input placeholder="Keywords (comma-separated)" />
        </div>
        <div className="seo-section">
          <h4>Open Graph</h4>
          <input placeholder="OG Title" />
          <input placeholder="OG Image URL" />
          <textarea placeholder="OG Description" rows={2}></textarea>
        </div>
        <div className="seo-section">
          <h4>Structured Data</h4>
          <button>📋 JSON-LD</button>
          <button>🗺️ Sitemap</button>
          <button>🤖 Robots.txt</button>
        </div>
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// src/components/builder/overlays/AssetManager.tsx
export const AssetManager: React.FC<any> = ({ project, onClose, onAssetSelect }) => (
  <div className="overlay asset-manager">
    <div className="overlay-content">
      <h2>🖼️ Asset Manager</h2>
      <div className="asset-sections">
        <div className="asset-section">
          <h4>Unsplash Library</h4>
          <input type="search" placeholder="Search images..." />
          <div className="assets-grid">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="asset-item" onClick={() => onAssetSelect({ id: i })}>
                <div className="asset-placeholder">Image {i + 1}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="asset-section">
          <h4>Upload Custom</h4>
          <button>📤 Upload File</button>
          <p>Max 10MB, supports JPG, PNG, WebP, AVIF</p>
        </div>
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// src/components/builder/overlays/VersionHistory.tsx
export const VersionHistory: React.FC<any> = ({ project, onClose, onRestore }) => (
  <div className="overlay version-history">
    <div className="overlay-content">
      <h2>⏱️ Version History</h2>
      <div className="versions-list">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="version-item">
            <span className="version-time">
              {new Date(Date.now() - i * 3600000).toLocaleString()}
            </span>
            <span className="version-action">Updated component</span>
            <button onClick={() => onRestore(i)}>Restore</button>
          </div>
        ))}
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// src/components/builder/overlays/TemplateLibrary.tsx
export const TemplateLibrary: React.FC<any> = ({ mode, onClose, onSelectTemplate }) => (
  <div className="overlay template-library">
    <div className="overlay-content">
      <h2>📚 Template Library</h2>
      <div className="templates-grid">
        {[
          'Landing Page',
          'E-commerce',
          'SaaS',
          'Portfolio',
          'Blog',
          'Community',
          'Marketplace',
          'Membership',
        ].map(template => (
          <div key={template} className="template-card" onClick={() => onSelectTemplate(template)}>
            <div className="template-preview"></div>
            <span className="template-name">{template}</span>
            <button>Use Template</button>
          </div>
        ))}
      </div>
      <button className="overlay-close" onClick={onClose}>Close</button>
    </div>
  </div>
);

// Shared styles for all overlays
export const overlayStyles = `
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .overlay-content {
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .overlay-content h2 {
    margin: 0 0 20px 0;
    font-size: 20px;
    color: #1e293b;
  }

  .overlay-content h4 {
    margin: 0 0 12px 0;
    font-size: 12px;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .overlay-actions,
  .overlay-close {
    margin-top: 20px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .overlay-actions button,
  .overlay-close {
    padding: 8px 16px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .overlay-actions button:hover,
  .overlay-close:hover {
    background: #2563eb;
  }

  .editor-area {
    background: #1e293b;
    border-radius: 6px;
    padding: 16px;
    margin: 16px 0;
    overflow-x: auto;
  }

  .editor-area code {
    color: #e2e8f0;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
    line-height: 1.6;
  }

  .deployment-targets,
  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    margin: 16px 0;
  }

  .deployment-card,
  .template-card {
    padding: 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .deployment-card:hover,
  .template-card:hover {
    border-color: #3b82f6;
    background: #eff6ff;
    transform: translateY(-2px);
  }

  .target-icon,
  .template-preview {
    font-size: 28px;
    width: 48px;
    height: 48px;
    background: white;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .template-preview {
    background: linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%);
  }

  .target-name {
    font-size: 12px;
    font-weight: 500;
    color: #1e293b;
  }

  .deployment-card button,
  .template-card button {
    padding: 6px 12px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 20px 0;
  }

  .metric {
    padding: 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .metric-label {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metric-value {
    font-size: 20px;
    font-weight: 600;
    color: #3b82f6;
  }

  .cms-sections,
  .seo-sections,
  .asset-sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
    margin: 20px 0;
  }

  .cms-section,
  .seo-section,
  .asset-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .collections-list,
  .assets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }

  .collection-item,
  .asset-item {
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .collection-item:hover,
  .asset-item:hover {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .asset-placeholder {
    width: 100%;
    aspect-ratio: 1;
    background: #e0e7ff;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #64748b;
  }

  .versions-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 20px 0;
  }

  .version-item {
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .version-time {
    font-size: 11px;
    color: #64748b;
  }

  .version-action {
    flex: 1;
    font-size: 12px;
    color: #1e293b;
  }

  .version-item button {
    padding: 4px 8px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  input[type="text"],
  input[type="search"],
  textarea {
    padding: 8px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
  }

  input[type="text"]:focus,
  input[type="search"]:focus,
  textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px #eff6ff;
  }

  button {
    font-family: inherit;
  }
`;
