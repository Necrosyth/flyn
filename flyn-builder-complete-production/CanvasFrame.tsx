// src/components/builder/CanvasFrame.tsx
/**
 * Canvas Frame Component
 * Live website/app preview with drag-drop, device modes, zoom controls
 */

import React, { forwardRef, useState } from 'react';
import type { BuilderProject, BuilderPage, BuilderComponent } from '@/types/builder';

interface CanvasFrameProps {
  project: BuilderProject;
  page: BuilderPage | null;
  component: BuilderComponent | null;
  onComponentSelect: (component: BuilderComponent) => void;
  onPageUpdate: (updates: any) => void;
  onComponentUpdate: (componentId: string, updates: any) => void;
}

export const CanvasFrame = forwardRef<HTMLIFrameElement, CanvasFrameProps>(
  (
    {
      project,
      page,
      component,
      onComponentSelect,
      onPageUpdate,
      onComponentUpdate,
    },
    ref
  ) => {
    const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
    const [zoom, setZoom] = useState(100);

    const deviceSizes = {
      desktop: { width: '100%', height: '100%' },
      tablet: { width: '768px', height: '1024px' },
      mobile: { width: '375px', height: '812px' },
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      const elementType = e.dataTransfer.getData('elementType');

      if (!page) return;

      // Add component to page
      const newComponent = {
        name: elementType,
        type: elementType,
        props: {},
        styles: {
          position: 'absolute',
          left: `${e.clientX}px`,
          top: `${e.clientY}px`,
        },
        content: {},
      };

      // Call API to add component
      try {
        const response = await fetch(
          `/api/builder/${project.id}/components`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({
              pageId: page.id,
              ...newComponent,
            }),
          }
        );

        if (!response.ok) throw new Error('Failed to add component');

        const component = await response.json();
        onComponentSelect(component);
      } catch (error) {
        console.error('Failed to add component:', error);
      }
    };

    return (
      <div className="canvas-frame">
        {/* Toolbar */}
        <div className="canvas-toolbar">
          {/* Device Mode Selector */}
          <div className="device-selector">
            <button
              className={`device-btn ${deviceMode === 'mobile' ? 'active' : ''}`}
              onClick={() => setDeviceMode('mobile')}
              title="Mobile (375x812)"
            >
              📱
            </button>
            <button
              className={`device-btn ${deviceMode === 'tablet' ? 'active' : ''}`}
              onClick={() => setDeviceMode('tablet')}
              title="Tablet (768x1024)"
            >
              📊
            </button>
            <button
              className={`device-btn ${deviceMode === 'desktop' ? 'active' : ''}`}
              onClick={() => setDeviceMode('desktop')}
              title="Desktop (100%)"
            >
              🖥️
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button
              className="zoom-btn"
              onClick={() => setZoom(Math.max(40, zoom - 10))}
            >
              −
            </button>
            <span className="zoom-value">{zoom}%</span>
            <button
              className="zoom-btn"
              onClick={() => setZoom(Math.min(150, zoom + 10))}
            >
              +
            </button>
            <button
              className="zoom-btn"
              onClick={() => setZoom(100)}
            >
              Reset
            </button>
          </div>

          {/* Info */}
          <div className="canvas-info">
            {page ? (
              <span>{page.name} • {deviceMode} • {zoom}%</span>
            ) : (
              <span>No page selected</span>
            )}
          </div>
        </div>

        {/* Canvas Area */}
        <div
          className="canvas-area"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {page ? (
            <div
              className="canvas-viewport"
              style={{
                width: deviceSizes[deviceMode].width,
                height: deviceSizes[deviceMode].height,
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
              }}
            >
              {/* Device Frame for Mobile/Tablet */}
              {deviceMode !== 'desktop' && (
                <div className={`device-frame ${deviceMode}`}>
                  <div className="device-notch"></div>
                  <div className="device-content">
                    <Canvas
                      page={page}
                      component={component}
                      onComponentSelect={onComponentSelect}
                      onComponentUpdate={onComponentUpdate}
                    />
                  </div>
                  <div className="device-home"></div>
                </div>
              )}

              {/* Web Canvas */}
              {deviceMode === 'desktop' && (
                <Canvas
                  page={page}
                  component={component}
                  onComponentSelect={onComponentSelect}
                  onComponentUpdate={onComponentUpdate}
                />
              )}
            </div>
          ) : (
            <div className="canvas-empty">
              <p>Select a page to start editing</p>
            </div>
          )}
        </div>

        <style>{`
          .canvas-frame {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: white;
            border-right: 1px solid #e2e8f0;
            overflow: hidden;
          }

          .canvas-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 12px 16px;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
          }

          .device-selector,
          .zoom-controls {
            display: flex;
            gap: 4px;
            padding: 4px;
            background: white;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
          }

          .device-btn,
          .zoom-btn {
            padding: 6px 10px;
            background: transparent;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            color: #64748b;
          }

          .device-btn:hover,
          .zoom-btn:hover {
            background: #f1f5f9;
            color: #3b82f6;
          }

          .device-btn.active {
            background: #3b82f6;
            color: white;
          }

          .zoom-value {
            padding: 6px 8px;
            font-size: 12px;
            color: #475569;
            font-weight: 500;
          }

          .canvas-info {
            flex: 1;
            text-align: right;
            font-size: 12px;
            color: #94a3b8;
          }

          .canvas-area {
            flex: 1;
            overflow: auto;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 24px;
            background: linear-gradient(135deg, #f0f4f8 0%, #f8fafc 100%);
          }

          .canvas-viewport {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            position: relative;
          }

          .device-frame {
            width: 100%;
            height: 100%;
            background: black;
            border-radius: 30px;
            padding: 12px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
          }

          .device-frame.mobile {
            aspect-ratio: 375 / 812;
          }

          .device-frame.tablet {
            aspect-ratio: 768 / 1024;
          }

          .device-notch {
            height: 24px;
            background: black;
            border-radius: 0 0 20px 20px;
            margin: 0 auto;
            width: 150px;
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
          }

          .device-content {
            flex: 1;
            background: white;
            border-radius: 20px;
            overflow: auto;
            margin-top: 8px;
          }

          .device-home {
            height: 5px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 100px;
            margin: 8px auto 0;
            width: 120px;
          }

          .canvas-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            color: #94a3b8;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }
);

CanvasFrame.displayName = 'CanvasFrame';

/**
 * Canvas Component - Renders the actual page content
 */
interface CanvasProps {
  page: BuilderPage;
  component: BuilderComponent | null;
  onComponentSelect: (component: BuilderComponent) => void;
  onComponentUpdate: (componentId: string, updates: any) => void;
}

const Canvas: React.FC<CanvasProps> = ({
  page,
  component,
  onComponentSelect,
  onComponentUpdate,
}) => {
  return (
    <div className="canvas-content">
      <div className="page-content">
        {page.components && page.components.length > 0 ? (
          page.components.map(comp => (
            <div
              key={comp.id}
              className={`canvas-component ${component?.id === comp.id ? 'selected' : ''}`}
              onClick={() => onComponentSelect(comp)}
              style={{
                padding: '12px',
                margin: '8px',
                background: '#f8fafc',
                border: component?.id === comp.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 500 }}>
                {comp.name}
                <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '8px' }}>
                  ({comp.type})
                </span>
              </div>
              {comp.content && Object.keys(comp.content).length > 0 && (
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                  {Object.entries(comp.content)
                    .slice(0, 2)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' • ')}
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
            Drag elements from the left panel to add components
          </div>
        )}
      </div>

      <style>{`
        .canvas-content {
          width: 100%;
          height: 100%;
          overflow: auto;
          padding: 16px;
          background: white;
        }

        .page-content {
          max-width: 1200px;
          margin: 0 auto;
        }

        .canvas-component {
          transition: all 0.2s;
        }

        .canvas-component:hover {
          border-color: #3b82f6 !important;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
        }

        .canvas-component.selected {
          box-shadow: 0 0 0 2px #eff6ff, 0 0 0 4px #3b82f6;
        }
      `}</style>
    </div>
  );
};

export default CanvasFrame;
