import React, { forwardRef, useState } from 'react';
import './CanvasFrame.css';

interface CanvasFrameProps {
  project: any;
  page: any;
  component: any;
  onComponentSelect: (comp: any) => void;
  onComponentUpdate: (id: string, updates: any) => void;
  onPageUpdate: (updates: any) => void;
}

export const CanvasFrame = forwardRef<HTMLIFrameElement, CanvasFrameProps>(
  ({
    project,
    page,
    component,
    onComponentSelect,
    onComponentUpdate,
    onPageUpdate,
  }, ref) => {
    const [zoom, setZoom] = useState(100);
    const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

    const deviceSizes = {
      desktop: { width: '100%', height: '100%' },
      tablet: { width: '768px', height: '1024px' },
      mobile: { width: '375px', height: '812px' },
    };

    return (
      <div className="canvas-frame">
        <div className="canvas-toolbar">
          <div className="device-selector">
            {(['desktop', 'tablet', 'mobile'] as const).map(d => (
              <button
                key={d}
                className={device === d ? 'active' : ''}
                onClick={() => setDevice(d)}
              >
                {d === 'mobile' ? '📱' : d === 'tablet' ? '📊' : '🖥️'}
              </button>
            ))}
          </div>

          <div className="zoom-controls">
            <button onClick={() => setZoom(Math.max(40, zoom - 10))}>−</button>
            <span>{zoom}%</span>
            <button onClick={() => setZoom(Math.min(150, zoom + 10))}>+</button>
            <button onClick={() => setZoom(100)}>Reset</button>
          </div>
        </div>

        <div className="canvas-area">
          <iframe
            ref={ref}
            src={`/api/preview?projectId=${project?.id}&pageId=${page?.id}`}
            style={{
              width: deviceSizes[device].width,
              height: deviceSizes[device].height,
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              border: 'none',
              borderRadius: '8px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>
      </div>
    );
  }
);

CanvasFrame.displayName = 'CanvasFrame';
