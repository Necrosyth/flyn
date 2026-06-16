// src/components/builder/LeftPanel.tsx
/**
 * Left Panel Component
 * 6 tabs: Elements (80+), Pages, Media (Unsplash), Layers (DOM), Backend, Integrations
 */

import React, { useState } from 'react';
import type { BuilderProject, BuilderPage, BuilderComponent } from '@/types/builder';

interface LeftPanelProps {
  mode: string;
  project: BuilderProject;
  selectedPage: BuilderPage | null;
  selectedComponent: BuilderComponent | null;
  onPageSelect: (page: BuilderPage) => void;
  onComponentSelect: (component: BuilderComponent) => void;
  onShowCMSManager: () => void;
  onShowAssetManager: () => void;
  onShowTemplateLibrary: () => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  mode,
  project,
  selectedPage,
  selectedComponent,
  onPageSelect,
  onComponentSelect,
  onShowCMSManager,
  onShowAssetManager,
  onShowTemplateLibrary,
}) => {
  const [activeTab, setActiveTab] = useState<'elements' | 'pages' | 'media' | 'layers' | 'backend' | 'integrations'>('elements');
  const [searchQuery, setSearchQuery] = useState('');

  const webElements = [
    { category: 'Layout', items: ['Container', 'Grid', 'Flex', 'Stack', 'Section', 'Navbar', 'Footer', 'Hero'] },
    { category: 'Navigation', items: ['Menu', 'Breadcrumb', 'Tabs', 'Sidebar', 'Pagination', 'Link'] },
    { category: 'Hero Sections', items: ['Hero-1', 'Hero-2', 'Hero-3', 'Hero-4', 'Hero-5', 'Hero-6'] },
    { category: 'Content', items: ['Heading', 'Paragraph', 'Rich Text', 'Card', 'Badge', 'Alert', 'Divider'] },
    { category: 'Forms', items: ['Input', 'Textarea', 'Select', 'Checkbox', 'Radio', 'Toggle', 'Slider', 'DatePicker'] },
    { category: 'Buttons', items: ['Button-Primary', 'Button-Secondary', 'Button-Ghost', 'Button-Icon', 'Button-Loading'] },
    { category: 'Commerce', items: ['Product Card', 'Product Grid', 'Cart', 'Pricing Table', 'Review'] },
    { category: 'Media', items: ['Image', 'Video', 'Carousel', 'Gallery', 'Icon', 'SVG'] },
    { category: 'Auth', items: ['Login', 'Signup', 'Password Reset', 'OAuth', 'MFA'] },
    { category: 'Widgets', items: ['Calendar', 'Clock', 'Weather', 'Map', 'Chart', 'Stat Block'] },
  ];

  const mobileElements = [
    { category: 'Layout', items: ['View', 'ScrollView', 'FlatList', 'SectionList'] },
    { category: 'UI', items: ['Button', 'Text', 'TextInput', 'Image', 'Switch', 'Picker', 'Slider'] },
    { category: 'Forms', items: ['Form', 'CheckBox', 'RadioButton', 'DatePicker', 'TimePicker'] },
    { category: 'Modals', items: ['Modal', 'Alert', 'Toast', 'ActionSheet'] },
    { category: 'Media', items: ['Camera', 'Video', 'Audio', 'ImagePicker'] },
    { category: 'Maps', items: ['Map', 'LocationPicker'] },
    { category: 'Navigation', items: ['StackNav', 'TabNav', 'DrawerNav'] },
  ];

  const elements = mode === 'app' ? mobileElements : webElements;

  const integrations = [
    { name: 'Stripe', icon: '🏦', connected: false },
    { name: 'PayPal', icon: '💳', connected: false },
    { name: 'Sendgrid', icon: '📧', connected: false },
    { name: 'Slack', icon: '💬', connected: false },
    { name: 'Zapier', icon: '⚡', connected: false },
    { name: 'Shopify', icon: '🛒', connected: false },
    { name: 'Google Analytics', icon: '📊', connected: false },
    { name: 'Firebase', icon: '🔥', connected: false },
    { name: 'Auth0', icon: '🔐', connected: false },
    { name: 'Supabase', icon: '🗄️', connected: false },
    { name: 'AWS', icon: '☁️', connected: false },
    { name: 'OpenAI', icon: '🤖', connected: false },
  ];

  const dragStart = (e: React.DragEvent, elementType: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('elementType', elementType);
  };

  return (
    <div className="left-panel">
      {/* Tab Navigation */}
      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'elements' ? 'active' : ''}`}
          onClick={() => setActiveTab('elements')}
          title="Elements Library"
        >
          📦
        </button>
        <button
          className={`tab-btn ${activeTab === 'pages' ? 'active' : ''}`}
          onClick={() => setActiveTab('pages')}
          title="Pages"
        >
          📄
        </button>
        <button
          className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
          title="Media"
        >
          🖼️
        </button>
        <button
          className={`tab-btn ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => setActiveTab('layers')}
          title="Layers"
        >
          🧬
        </button>
        <button
          className={`tab-btn ${activeTab === 'backend' ? 'active' : ''}`}
          onClick={() => setActiveTab('backend')}
          title="Backend"
        >
          ⚙️
        </button>
        <button
          className={`tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
          title="Integrations"
        >
          🔌
        </button>
      </div>

      {/* Tab Content */}
      <div className="panel-content">
        {/* Elements Tab */}
        {activeTab === 'elements' && (
          <div className="elements-tab">
            <input
              type="search"
              placeholder="Search elements..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {elements.map(category => (
              <div key={category.category} className="element-category">
                <h4>{category.category}</h4>
                <div className="element-grid">
                  {category.items
                    .filter(item => item.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(item => (
                      <div
                        key={item}
                        className="element-item"
                        draggable
                        onDragStart={(e) => dragStart(e, item)}
                      >
                        {item}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pages Tab */}
        {activeTab === 'pages' && (
          <div className="pages-tab">
            <button className="add-page-btn">➕ Add Page</button>
            <div className="pages-list">
              {project.pages.map(page => (
                <div
                  key={page.id}
                  className={`page-item ${selectedPage?.id === page.id ? 'active' : ''}`}
                  onClick={() => onPageSelect(page)}
                >
                  <span className="page-icon">📄</span>
                  <span className="page-name">{page.name}</span>
                  <span className="page-status">{page.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Media Tab */}
        {activeTab === 'media' && (
          <div className="media-tab">
            <button className="btn-unsplash" onClick={onShowAssetManager}>
              🖼️ Browse Unsplash
            </button>
            <div className="media-sections">
              <div className="media-section">
                <h4>Recent</h4>
                <div className="media-grid">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="media-item">
                      <div className="media-placeholder">Image</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Layers Tab */}
        {activeTab === 'layers' && (
          <div className="layers-tab">
            {selectedPage && selectedPage.components && (
              <div className="layer-tree">
                <div className="layer-item" style={{ paddingLeft: '0px' }}>
                  <span className="layer-name">📄 {selectedPage.name}</span>
                </div>
                {selectedPage.components.map(comp => (
                  <div
                    key={comp.id}
                    className={`layer-item ${selectedComponent?.id === comp.id ? 'active' : ''}`}
                    onClick={() => onComponentSelect(comp)}
                    style={{ paddingLeft: '16px' }}
                  >
                    <span className="layer-visibility">👁️</span>
                    <span className="layer-name">{comp.name}</span>
                    <span className="layer-type">{comp.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Backend Tab */}
        {activeTab === 'backend' && (
          <div className="backend-tab">
            <div className="backend-section">
              <h4>API Routes</h4>
              <button className="btn-backend">➕ Add API Route</button>
            </div>
            <div className="backend-section">
              <h4>Authentication</h4>
              <select className="backend-select">
                <option>None</option>
                <option>JWT</option>
                <option>OAuth</option>
                <option>MFA</option>
              </select>
            </div>
            <div className="backend-section">
              <h4>Database</h4>
              <button className="btn-cms" onClick={onShowCMSManager}>
                🗄️ Manage CMS
              </button>
            </div>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="integrations-tab">
            <div className="integrations-grid">
              {integrations.map(integration => (
                <div key={integration.name} className="integration-card">
                  <span className="integration-icon">{integration.icon}</span>
                  <span className="integration-name">{integration.name}</span>
                  <button className={`integration-btn ${integration.connected ? 'connected' : ''}`}>
                    {integration.connected ? '✓ Connected' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .left-panel {
          width: 300px;
          height: 100%;
          background: #f8fafc;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .panel-tabs {
          display: flex;
          gap: 0;
          padding: 8px;
          background: #eef2f7;
          border-bottom: 1px solid #cbd5e1;
        }

        .tab-btn {
          flex: 1;
          padding: 8px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          color: #64748b;
        }

        .tab-btn:hover {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .tab-btn.active {
          background: white;
          border: 1px solid #cbd5e1;
          color: #3b82f6;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 12px;
        }

        .element-category {
          margin-bottom: 16px;
        }

        .element-category h4 {
          font-size: 12px;
          color: #475569;
          text-transform: uppercase;
          margin: 8px 0;
          font-weight: 600;
        }

        .element-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .element-item {
          padding: 8px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 11px;
          cursor: grab;
          transition: all 0.2s;
          text-align: center;
        }

        .element-item:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          transform: translateY(-2px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .element-item:active {
          cursor: grabbing;
        }

        .add-page-btn,
        .btn-unsplash,
        .btn-backend,
        .btn-cms {
          width: 100%;
          padding: 8px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          margin-bottom: 12px;
          transition: all 0.2s;
        }

        .add-page-btn:hover,
        .btn-unsplash:hover,
        .btn-backend:hover,
        .btn-cms:hover {
          background: #2563eb;
        }

        .pages-list,
        .layer-tree {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .page-item,
        .layer-item {
          padding: 8px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          transition: all 0.2s;
        }

        .page-item:hover,
        .layer-item:hover {
          background: #eff6ff;
          border-color: #3b82f6;
        }

        .page-item.active,
        .layer-item.active {
          background: #dbeafe;
          border-color: #3b82f6;
        }

        .page-icon,
        .layer-visibility {
          font-size: 14px;
        }

        .page-name,
        .layer-name {
          flex: 1;
        }

        .page-status,
        .layer-type {
          font-size: 10px;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .backend-section {
          margin-bottom: 16px;
        }

        .backend-section h4 {
          font-size: 12px;
          color: #475569;
          text-transform: uppercase;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .backend-select {
          width: 100%;
          padding: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 12px;
        }

        .integrations-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .integration-card {
          padding: 12px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .integration-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
        }

        .integration-icon {
          font-size: 20px;
        }

        .integration-name {
          font-size: 11px;
          font-weight: 500;
          text-align: center;
        }

        .integration-btn {
          width: 100%;
          padding: 4px;
          background: #f0f9ff;
          color: #3b82f6;
          border: 1px solid #bfdbfe;
          border-radius: 3px;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .integration-btn:hover {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .integration-btn.connected {
          background: #dcfce7;
          color: #16a34a;
          border-color: #86efac;
        }

        .media-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }

        .media-item {
          aspect-ratio: 1;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .media-item:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .media-placeholder {
          font-size: 10px;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
};
