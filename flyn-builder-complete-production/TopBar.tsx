// src/components/builder/TopBar.tsx
/**
 * Top Bar Component
 * Mode selector (6 tabs), framework selector, code/deploy buttons
 */

import React from 'react';
import type { BuilderProject } from '@/types/builder';

interface TopBarProps {
  project: BuilderProject;
  mode: 'website' | 'community' | 'marketplace' | 'membership' | 'blank' | 'app';
  framework: string;
  onModeChange: (mode: any) => void;
  onFrameworkChange: (framework: string) => void;
  onShowCodeEditor: () => void;
  onShowDeployment: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  mode,
  framework,
  onModeChange,
  onFrameworkChange,
  onShowCodeEditor,
  onShowDeployment,
}) => {
  const modes = [
    { id: 'website', name: '🌐 Website & Apps', icon: '🌐' },
    { id: 'community', name: '👥 Community & Charity', icon: '👥' },
    { id: 'marketplace', name: '🛍 Marketplace', icon: '🛍' },
    { id: 'membership', name: '💳 Membership', icon: '💳' },
    { id: 'blank', name: '⬜ Blank Canvas', icon: '⬜' },
    { id: 'app', name: '📱 App Builder', icon: '📱' },
  ];

  const webFrameworks = [
    'nextjs',
    'vue',
    'html',
    'svelte',
    'angular',
    'php',
    'python',
    'go',
    'ruby',
  ];

  const mobileFrameworks = ['react-native', 'ios', 'android'];

  const allFrameworks = [...webFrameworks, ...mobileFrameworks];

  return (
    <div className="top-bar">
      {/* Left: Project Name & Modes */}
      <div className="top-bar-left">
        <div className="project-name">
          <h1>{project.name}</h1>
          <span className="project-mode">{mode.toUpperCase()}</span>
        </div>

        {/* Mode Tabs */}
        <div className="mode-tabs">
          {modes.map(m => (
            <button
              key={m.id}
              className={`mode-tab ${mode === m.id ? 'active' : ''}`}
              onClick={() => onModeChange(m.id)}
              title={m.name}
            >
              <span className="mode-icon">{m.icon}</span>
              <span className="mode-label">{m.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Center: Framework Selector */}
      <div className="top-bar-center">
        <label>Framework:</label>
        <select
          className="framework-select"
          value={framework}
          onChange={(e) => onFrameworkChange(e.target.value)}
        >
          <optgroup label="Web Frameworks">
            {webFrameworks.map(fw => (
              <option key={fw} value={fw}>
                {fw === 'nextjs' ? 'Next.js' : fw.toUpperCase()}
              </option>
            ))}
          </optgroup>
          <optgroup label="Mobile Frameworks">
            {mobileFrameworks.map(fw => (
              <option key={fw} value={fw}>
                {fw === 'react-native' ? 'React Native' : fw.toUpperCase()}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Right: Action Buttons */}
      <div className="top-bar-right">
        <button
          className="btn-generate"
          onClick={onShowCodeEditor}
          title="Generate code for selected framework"
        >
          💻 Generate Code
        </button>

        <button
          className="btn-deploy"
          onClick={onShowDeployment}
          title="Deploy to Cloudflare, Vercel, AWS, etc."
        >
          🚀 Deploy
        </button>

        <div className="user-menu">
          <button className="btn-profile">👤</button>
        </div>
      </div>

      <style>{`
        .top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          border-bottom: 2px solid #3b82f6;
          color: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .top-bar-left {
          display: flex;
          align-items: center;
          gap: 20px;
          flex: 1;
        }

        .project-name {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .project-name h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .project-mode {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .mode-tabs {
          display: flex;
          gap: 8px;
          border-left: 2px solid #334155;
          padding-left: 20px;
        }

        .mode-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: transparent;
          border: 1px solid #475569;
          border-radius: 6px;
          color: #cbd5e1;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .mode-tab:hover {
          background: #334155;
          color: white;
          border-color: #64748b;
        }

        .mode-tab.active {
          background: #3b82f6;
          border-color: #2563eb;
          color: white;
        }

        .mode-icon {
          font-size: 14px;
        }

        .mode-label {
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .top-bar-center {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .top-bar-center label {
          font-size: 12px;
          color: #cbd5e1;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .framework-select {
          padding: 6px 10px;
          background: #1e293b;
          border: 1px solid #475569;
          border-radius: 4px;
          color: white;
          font-size: 12px;
          cursor: pointer;
        }

        .framework-select:hover {
          border-color: #64748b;
        }

        .top-bar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-generate,
        .btn-deploy {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .btn-generate {
          background: #10b981;
          color: white;
        }

        .btn-generate:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .btn-deploy {
          background: #f59e0b;
          color: white;
        }

        .btn-deploy:hover {
          background: #d97706;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        .user-menu {
          display: flex;
          align-items: center;
          gap: 8px;
          border-left: 2px solid #334155;
          padding-left: 12px;
        }

        .btn-profile {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #334155;
          border: 1px solid #475569;
          color: white;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .btn-profile:hover {
          background: #475569;
          border-color: #64748b;
        }

        @media (max-width: 1400px) {
          .mode-label {
            display: none;
          }

          .top-bar-center label {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};
