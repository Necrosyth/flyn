import React from 'react';
import './TopBar.css';

interface TopBarProps {
  project: any;
  mode: string;
  framework: string;
  onModeChange: (mode: string) => void;
  onFrameworkChange: (fw: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  mode,
  framework,
  onModeChange,
  onFrameworkChange,
}) => {
  const modes = [
    { id: 'website', label: '🌐 Website' },
    { id: 'community', label: '👥 Community' },
    { id: 'marketplace', label: '🛍 Marketplace' },
    { id: 'membership', label: '💳 Membership' },
    { id: 'blank', label: '⬜ Blank' },
    { id: 'app', label: '📱 App' },
  ];

  const frameworks = ['nextjs', 'vue', 'html', 'svelte', 'angular', 'php', 'python', 'go', 'ruby', 'react-native', 'ios', 'android'];

  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1>{project?.name || 'Untitled Project'}</h1>
        <div className="mode-buttons">
          {modes.map(m => (
            <button
              key={m.id}
              className={`mode-btn ${mode === m.id ? 'active' : ''}`}
              onClick={() => onModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar-center">
        <select value={framework} onChange={e => onFrameworkChange(e.target.value)}>
          {frameworks.map(fw => (
            <option key={fw} value={fw}>{fw}</option>
          ))}
        </select>
      </div>

      <div className="topbar-right">
        <button className="btn-primary">💻 Generate Code</button>
        <button className="btn-success">🚀 Deploy</button>
      </div>
    </div>
  );
};
