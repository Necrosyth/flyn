// src/components/builder/RightPanel.tsx
/**
 * Right Panel Component
 * 5 tabs: Style, Content, Settings, SEO, Animations
 * Properties editor for selected component or page
 */

import React, { useState } from 'react';
import type { BuilderPage, BuilderComponent } from '@/types/builder';

interface RightPanelProps {
  selectedComponent: BuilderComponent | null;
  selectedPage: BuilderPage | null;
  onComponentUpdate: (componentId: string, updates: any) => void;
  onPageUpdate: (updates: any) => void;
  onShowSEO: () => void;
  onShowPerformance: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedComponent,
  selectedPage,
  onComponentUpdate,
  onPageUpdate,
  onShowSEO,
  onShowPerformance,
}) => {
  const [activeTab, setActiveTab] = useState<'style' | 'content' | 'settings' | 'seo' | 'animations'>('style');

  const handleStyleChange = (property: string, value: any) => {
    if (!selectedComponent) return;
    onComponentUpdate(selectedComponent.id, {
      styles: {
        ...selectedComponent.styles,
        [property]: value,
      },
    });
  };

  const handleContentChange = (key: string, value: any) => {
    if (!selectedComponent) return;
    onComponentUpdate(selectedComponent.id, {
      content: {
        ...selectedComponent.content,
        [key]: value,
      },
    });
  };

  const handlePropsChange = (key: string, value: any) => {
    if (!selectedComponent) return;
    onComponentUpdate(selectedComponent.id, {
      props: {
        ...selectedComponent.props,
        [key]: value,
      },
    });
  };

  return (
    <div className="right-panel">
      {/* Tab Navigation */}
      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
          title="Style Properties"
        >
          🎨
        </button>
        <button
          className={`tab-btn ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
          title="Content"
        >
          📝
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title="Settings"
        >
          ⚙️
        </button>
        <button
          className={`tab-btn ${activeTab === 'seo' ? 'active' : ''}`}
          onClick={() => setActiveTab('seo')}
          title="SEO"
        >
          🔍
        </button>
        <button
          className={`tab-btn ${activeTab === 'animations' ? 'active' : ''}`}
          onClick={() => setActiveTab('animations')}
          title="Animations"
        >
          ✨
        </button>
      </div>

      {/* Tab Content */}
      <div className="panel-content">
        {/* Style Tab */}
        {activeTab === 'style' && selectedComponent && (
          <div className="style-tab">
            <h4>Styling</h4>

            <div className="property-group">
              <label>Background Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={selectedComponent.styles?.backgroundColor || '#ffffff'}
                  onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                />
                <input
                  type="text"
                  value={selectedComponent.styles?.backgroundColor || '#ffffff'}
                  onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="property-group">
              <label>Text Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={selectedComponent.styles?.color || '#000000'}
                  onChange={(e) => handleStyleChange('color', e.target.value)}
                />
                <input
                  type="text"
                  value={selectedComponent.styles?.color || '#000000'}
                  onChange={(e) => handleStyleChange('color', e.target.value)}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="property-group">
              <label>Padding</label>
              <input
                type="number"
                value={parseInt(selectedComponent.styles?.padding as string) || 0}
                onChange={(e) => handleStyleChange('padding', `${e.target.value}px`)}
              />
            </div>

            <div className="property-group">
              <label>Margin</label>
              <input
                type="number"
                value={parseInt(selectedComponent.styles?.margin as string) || 0}
                onChange={(e) => handleStyleChange('margin', `${e.target.value}px`)}
              />
            </div>

            <div className="property-group">
              <label>Border Radius</label>
              <input
                type="number"
                value={parseInt(selectedComponent.styles?.borderRadius as string) || 0}
                onChange={(e) => handleStyleChange('borderRadius', `${e.target.value}px`)}
              />
            </div>

            <div className="property-group">
              <label>Width</label>
              <input
                type="text"
                value={selectedComponent.styles?.width || '100%'}
                onChange={(e) => handleStyleChange('width', e.target.value)}
                placeholder="100%, 500px, etc."
              />
            </div>

            <div className="property-group">
              <label>Height</label>
              <input
                type="text"
                value={selectedComponent.styles?.height || 'auto'}
                onChange={(e) => handleStyleChange('height', e.target.value)}
                placeholder="auto, 500px, etc."
              />
            </div>

            <div className="property-group">
              <label>Display</label>
              <select
                value={selectedComponent.styles?.display || 'block'}
                onChange={(e) => handleStyleChange('display', e.target.value)}
              >
                <option value="block">Block</option>
                <option value="flex">Flex</option>
                <option value="grid">Grid</option>
                <option value="inline">Inline</option>
                <option value="inline-block">Inline Block</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="property-group">
              <label>Opacity</label>
              <input
                type="range"
                min="0"
                max="100"
                value={(parseFloat(selectedComponent.styles?.opacity as string) || 1) * 100}
                onChange={(e) => handleStyleChange('opacity', parseFloat(e.target.value) / 100)}
              />
            </div>
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && selectedComponent && (
          <div className="content-tab">
            <h4>Content</h4>

            {selectedComponent.type.includes('Button') && (
              <div className="property-group">
                <label>Button Text</label>
                <input
                  type="text"
                  value={selectedComponent.props?.text || ''}
                  onChange={(e) => handlePropsChange('text', e.target.value)}
                  placeholder="Click me"
                />
              </div>
            )}

            {selectedComponent.type.includes('Input') && (
              <div className="property-group">
                <label>Placeholder</label>
                <input
                  type="text"
                  value={selectedComponent.props?.placeholder || ''}
                  onChange={(e) => handlePropsChange('placeholder', e.target.value)}
                  placeholder="Enter placeholder"
                />
              </div>
            )}

            {selectedComponent.type.includes('Image') && (
              <div className="property-group">
                <label>Image URL</label>
                <input
                  type="text"
                  value={selectedComponent.props?.src || ''}
                  onChange={(e) => handlePropsChange('src', e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}

            {selectedComponent.type.includes('Heading') && (
              <div className="property-group">
                <label>Heading Text</label>
                <input
                  type="text"
                  value={selectedComponent.content?.text || ''}
                  onChange={(e) => handleContentChange('text', e.target.value)}
                  placeholder="Your heading"
                />
              </div>
            )}

            {selectedComponent.type.includes('Paragraph') && (
              <div className="property-group">
                <label>Paragraph Text</label>
                <textarea
                  value={selectedComponent.content?.text || ''}
                  onChange={(e) => handleContentChange('text', e.target.value)}
                  placeholder="Your paragraph text"
                  rows={4}
                />
              </div>
            )}

            <div className="property-group">
              <label>Link</label>
              <input
                type="text"
                value={selectedComponent.props?.href || ''}
                onChange={(e) => handlePropsChange('href', e.target.value)}
                placeholder="/path or https://..."
              />
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="settings-tab">
            <h4>Component Settings</h4>

            {selectedComponent && (
              <>
                <div className="property-group">
                  <label>Component Name</label>
                  <input
                    type="text"
                    value={selectedComponent.name}
                    onChange={(e) =>
                      onComponentUpdate(selectedComponent.id, { name: e.target.value })
                    }
                  />
                </div>

                <div className="property-group">
                  <label>Component ID</label>
                  <input type="text" value={selectedComponent.id} disabled />
                </div>

                <div className="property-group">
                  <label>Type</label>
                  <input type="text" value={selectedComponent.type} disabled />
                </div>
              </>
            )}

            {selectedPage && (
              <>
                <div className="separator"></div>
                <h4>Page Settings</h4>

                <div className="property-group">
                  <label>Page Name</label>
                  <input
                    type="text"
                    value={selectedPage.name}
                    onChange={(e) => onPageUpdate({ name: e.target.value })}
                  />
                </div>

                <div className="property-group">
                  <label>Page Slug</label>
                  <input
                    type="text"
                    value={selectedPage.slug}
                    onChange={(e) => onPageUpdate({ slug: e.target.value })}
                  />
                </div>

                <div className="property-group">
                  <label>Status</label>
                  <select
                    value={selectedPage.status}
                    onChange={(e) => onPageUpdate({ status: e.target.value })}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* SEO Tab */}
        {activeTab === 'seo' && (
          <div className="seo-tab">
            <h4>SEO Settings</h4>
            <button className="btn-seo" onClick={onShowSEO}>
              🔍 Open SEO Suite
            </button>

            {selectedPage && (
              <>
                <div className="property-group">
                  <label>Meta Title</label>
                  <input
                    type="text"
                    value={selectedPage.seoMetadata?.title || ''}
                    onChange={(e) =>
                      onPageUpdate({
                        seoMetadata: { ...selectedPage.seoMetadata, title: e.target.value },
                      })
                    }
                  />
                </div>

                <div className="property-group">
                  <label>Meta Description</label>
                  <textarea
                    value={selectedPage.seoMetadata?.description || ''}
                    onChange={(e) =>
                      onPageUpdate({
                        seoMetadata: { ...selectedPage.seoMetadata, description: e.target.value },
                      })
                    }
                    rows={3}
                  />
                </div>

                <div className="property-group">
                  <label>Keywords</label>
                  <input
                    type="text"
                    value={selectedPage.seoMetadata?.keywords?.join(', ') || ''}
                    onChange={(e) =>
                      onPageUpdate({
                        seoMetadata: {
                          ...selectedPage.seoMetadata,
                          keywords: e.target.value.split(',').map(k => k.trim()),
                        },
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Animations Tab */}
        {activeTab === 'animations' && selectedComponent && (
          <div className="animations-tab">
            <h4>Animations</h4>

            <div className="property-group">
              <label>Animation Type</label>
              <select>
                <option>None</option>
                <option>Fade In</option>
                <option>Slide In</option>
                <option>Scale</option>
                <option>Rotate</option>
                <option>Bounce</option>
                <option>Custom</option>
              </select>
            </div>

            <div className="property-group">
              <label>Duration (ms)</label>
              <input type="number" placeholder="300" />
            </div>

            <div className="property-group">
              <label>Delay (ms)</label>
              <input type="number" placeholder="0" />
            </div>

            <div className="property-group">
              <label>Easing</label>
              <select>
                <option>ease-in-out</option>
                <option>ease-in</option>
                <option>ease-out</option>
                <option>linear</option>
                <option>cubic-bezier</option>
              </select>
            </div>

            <div className="preview-animation">
              <button>▶ Preview</button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!selectedComponent && activeTab !== 'seo' && (
          <div className="empty-state">
            <p>Select a component to edit its properties</p>
          </div>
        )}
      </div>

      <style>{`
        .right-panel {
          width: 300px;
          height: 100%;
          background: #f8fafc;
          border-left: 1px solid #e2e8f0;
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
          padding: 16px;
        }

        .style-tab,
        .content-tab,
        .settings-tab,
        .seo-tab,
        .animations-tab {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        h4 {
          margin: 0;
          font-size: 12px;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .property-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .property-group label {
          font-size: 11px;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 500;
        }

        .property-group input[type="text"],
        .property-group input[type="number"],
        .property-group input[type="color"],
        .property-group textarea,
        .property-group select {
          padding: 8px 12px;
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 12px;
          font-family: inherit;
        }

        .property-group input[type="range"] {
          cursor: pointer;
        }

        .property-group input[type="color"] {
          width: 40px;
          height: 32px;
          padding: 4px;
        }

        .color-input-group {
          display: flex;
          gap: 8px;
        }

        .color-input-group input[type="color"] {
          flex: 0 0 auto;
        }

        .color-input-group input[type="text"] {
          flex: 1;
        }

        .separator {
          height: 1px;
          background: #e2e8f0;
          margin: 8px 0;
        }

        .btn-seo {
          width: 100%;
          padding: 8px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-seo:hover {
          background: #2563eb;
        }

        .preview-animation {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .preview-animation button {
          padding: 8px 12px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preview-animation button:hover {
          background: #059669;
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #94a3b8;
          font-size: 12px;
          text-align: center;
        }
      `}</style>
    </div>
  );
};
