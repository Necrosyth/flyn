import React, { useState } from 'react';
import './RightPanel.css';

interface RightPanelProps {
  selectedComponent: any;
  selectedPage: any;
  onComponentUpdate: (id: string, updates: any) => void;
  onPageUpdate: (updates: any) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedComponent,
  selectedPage,
  onComponentUpdate,
  onPageUpdate,
}) => {
  const [activeTab, setActiveTab] = useState('style');

  if (!selectedComponent) {
    return <div className="right-panel empty">Select a component to edit</div>;
  }

  return (
    <div className="right-panel">
      <div className="tabs">
        <button className={activeTab === 'style' ? 'active' : ''} onClick={() => setActiveTab('style')}>🎨 Style</button>
        <button className={activeTab === 'content' ? 'active' : ''} onClick={() => setActiveTab('content')}>📝 Content</button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>⚙️ Settings</button>
      </div>

      <div className="tab-content">
        {activeTab === 'style' && (
          <div className="style-tab">
            <div className="property">
              <label>Background Color</label>
              <input type="color" defaultValue={selectedComponent?.styles?.backgroundColor || '#ffffff'} />
            </div>
            <div className="property">
              <label>Padding</label>
              <input type="number" placeholder="0" />
            </div>
            <div className="property">
              <label>Display</label>
              <select>
                <option>Block</option>
                <option>Flex</option>
                <option>Grid</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="content-tab">
            <div className="property">
              <label>Text</label>
              <input type="text" defaultValue={selectedComponent?.content?.text || ''} />
            </div>
            <div className="property">
              <label>Image URL</label>
              <input type="text" placeholder="https://..." />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-tab">
            <div className="property">
              <label>Component Name</label>
              <input type="text" defaultValue={selectedComponent?.name || ''} />
            </div>
            <div className="property">
              <label>Component ID</label>
              <input type="text" value={selectedComponent?.id || ''} disabled />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
