import React, { useState } from 'react';
import './LeftPanel.css';

interface LeftPanelProps {
  mode: string;
  project: any;
  selectedPage: any;
  selectedComponent: any;
  onPageSelect: (page: any) => void;
  onComponentSelect: (comp: any) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  mode,
  project,
  selectedPage,
  selectedComponent,
  onPageSelect,
  onComponentSelect,
}) => {
  const [activeTab, setActiveTab] = useState('elements');

  const elements = [
    { category: 'Layout', items: ['Container', 'Grid', 'Flex', 'Section'] },
    { category: 'Content', items: ['Heading', 'Paragraph', 'Card', 'Badge'] },
    { category: 'Forms', items: ['Input', 'Textarea', 'Select', 'Button'] },
    { category: 'Media', items: ['Image', 'Video', 'Carousel', 'Icon'] },
  ];

  return (
    <div className="left-panel">
      <div className="tabs">
        <button className={activeTab === 'elements' ? 'active' : ''} onClick={() => setActiveTab('elements')}>📦 Elements</button>
        <button className={activeTab === 'pages' ? 'active' : ''} onClick={() => setActiveTab('pages')}>📄 Pages</button>
        <button className={activeTab === 'layers' ? 'active' : ''} onClick={() => setActiveTab('layers')}>🧬 Layers</button>
      </div>

      <div className="tab-content">
        {activeTab === 'elements' && (
          <div className="elements">
            {elements.map(cat => (
              <div key={cat.category}>
                <h4>{cat.category}</h4>
                <div className="items">
                  {cat.items.map(item => (
                    <div key={item} className="element-item" draggable>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'pages' && (
          <div className="pages">
            {project?.pages?.map((page: any) => (
              <div
                key={page.id}
                className={`page-item ${selectedPage?.id === page.id ? 'active' : ''}`}
                onClick={() => onPageSelect(page)}
              >
                {page.name}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="layers">
            {selectedPage?.components?.map((comp: any) => (
              <div
                key={comp.id}
                className={`layer-item ${selectedComponent?.id === comp.id ? 'active' : ''}`}
                onClick={() => onComponentSelect(comp)}
              >
                {comp.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
