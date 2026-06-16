// frontend/src/components/builder/BuilderApp.tsx
// REAL, WORKING PRODUCTION CODE
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { CanvasFrame } from './CanvasFrame';
import { RightPanel } from './RightPanel';
import { AIPanel } from './AIPanel';
import { useBuilder } from '../../hooks/useBuilder';
import { usePreview } from '../../hooks/usePreview';
import { api } from '../../services/api';
import './BuilderApp.css';

interface BuilderAppProps {
  projectId?: string;
}

export const BuilderApp: React.FC<BuilderAppProps> = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { 
    project, 
    selectedPage, 
    selectedComponent, 
    mode, 
    framework,
    setProject,
    setSelectedPage,
    setSelectedComponent,
    setMode,
    setFramework 
  } = useBuilder();

  const { connectPreview, sendPreviewUpdate } = usePreview();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load project on mount
  useEffect(() => {
    if (!projectId) return;

    const loadProject = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.get(`/api/builder/projects/${projectId}`);
        setProject(data);
        if (data.pages?.length > 0) {
          setSelectedPage(data.pages[0]);
        }
        
        // Connect preview WebSocket
        connectPreview(projectId, data.pages[0]?.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
        console.error('Load project error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId, setProject, setSelectedPage, connectPreview]);

  // Handle page update
  const handlePageUpdate = useCallback(async (updates: any) => {
    if (!project || !selectedPage) return;

    try {
      setError(null);
      const response = await api.put(
        `/api/builder/projects/${project.id}/pages/${selectedPage.id}`,
        updates
      );
      setSelectedPage(response);
      
      // Auto-sync to CMS happens on backend
      console.log('✅ Page updated and CMS synced automatically');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      console.error('Page update error:', err);
    }
  }, [project, selectedPage, setSelectedPage]);

  // Handle component update
  const handleComponentUpdate = useCallback(async (componentId: string, updates: any) => {
    if (!project || !selectedPage) return;

    try {
      setError(null);
      const response = await api.put(
        `/api/builder/projects/${project.id}/components/${componentId}`,
        updates
      );
      setSelectedComponent(response);
      
      // Send to preview WebSocket
      sendPreviewUpdate({
        type: 'component-update',
        componentId,
        data: response
      });
      
      console.log('✅ Component updated and preview synced');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      console.error('Component update error:', err);
    }
  }, [project, selectedPage, setSelectedComponent, sendPreviewUpdate]);

  if (loading) {
    return (
      <div className="builder-loading">
        <div className="spinner"></div>
        <p>Loading project...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="builder-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="builder-empty">
        <h2>No project loaded</h2>
        <p>Create a new project or select an existing one</p>
      </div>
    );
  }

  return (
    <div className="builder-app">
      {/* Top Navigation */}
      <TopBar
        project={project}
        mode={mode}
        framework={framework}
        onModeChange={setMode}
        onFrameworkChange={setFramework}
      />

      {/* Main Content */}
      <div className="builder-main">
        {/* Left Sidebar */}
        <LeftPanel
          mode={mode}
          project={project}
          selectedPage={selectedPage}
          selectedComponent={selectedComponent}
          onPageSelect={setSelectedPage}
          onComponentSelect={setSelectedComponent}
        />

        {/* Center Canvas */}
        <CanvasFrame
          ref={iframeRef}
          project={project}
          page={selectedPage}
          component={selectedComponent}
          onComponentSelect={setSelectedComponent}
          onComponentUpdate={handleComponentUpdate}
          onPageUpdate={handlePageUpdate}
        />

        {/* Right Panel */}
        <RightPanel
          selectedComponent={selectedComponent}
          selectedPage={selectedPage}
          onComponentUpdate={handleComponentUpdate}
          onPageUpdate={handlePageUpdate}
        />
      </div>

      {/* AI Assistant */}
      <AIPanel
        project={project}
        selectedPage={selectedPage}
        selectedComponent={selectedComponent}
      />

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
};

export default BuilderApp;
