// backend/lib/preview-sync.ts & frontend/src/services/previewSync.ts
/**
 * Preview Sync System
 * Real-time synchronization between builder and iframe sandbox
 * Uses WebSocket for instant updates
 */

// ============================================================================
// BACKEND: lib/preview-sync.ts
// ============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PreviewClient {
  ws: WebSocket;
  projectId: string;
  pageId: string;
  userId: string;
}

interface PreviewUpdate {
  type: 'component-update' | 'page-update' | 'style-update' | 'full-render';
  projectId: string;
  pageId: string;
  componentId?: string;
  data: any;
  timestamp: number;
}

/**
 * WebSocket Server for real-time preview updates
 * Runs on: /api/ws (upgraded to WebSocket)
 */
export class PreviewSyncServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, PreviewClient[]> = new Map();

  /**
   * Initialize WebSocket server
   */
  init(server: any) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const { projectId, pageId, userId } = parseWebSocketURL(req.url);

      if (!projectId || !pageId) {
        ws.close(1008, 'Missing projectId or pageId');
        return;
      }

      const client: PreviewClient = { ws, projectId, pageId, userId };
      this.registerClient(client);

      console.log(`✅ Preview sync connected: ${projectId}/${pageId}`);

      // Send initial page state
      this.sendInitialState(client);

      // Handle messages from frontend
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      // Handle disconnect
      ws.on('close', () => {
        this.unregisterClient(client);
        console.log(`❌ Preview sync disconnected: ${projectId}/${pageId}`);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  /**
   * Register a client
   */
  private registerClient(client: PreviewClient) {
    const key = `${client.projectId}/${client.pageId}`;
    if (!this.clients.has(key)) {
      this.clients.set(key, []);
    }
    this.clients.get(key)!.push(client);
  }

  /**
   * Unregister a client
   */
  private unregisterClient(client: PreviewClient) {
    const key = `${client.projectId}/${client.pageId}`;
    const clients = this.clients.get(key);
    if (clients) {
      const index = clients.indexOf(client);
      if (index > -1) {
        clients.splice(index, 1);
      }
    }
  }

  /**
   * Send initial page state to new client
   */
  private async sendInitialState(client: PreviewClient) {
    try {
      const page = await prisma.builderPage.findUnique({
        where: { id: client.pageId },
        include: { components: true },
      });

      if (!page) return;

      client.ws.send(
        JSON.stringify({
          type: 'initial-state',
          data: {
            page,
            components: page.components,
          },
        })
      );
    } catch (error) {
      console.error('Failed to send initial state:', error);
    }
  }

  /**
   * Handle messages from frontend (builder)
   */
  private handleClientMessage(client: PreviewClient, message: any) {
    switch (message.type) {
      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'component-update':
        this.broadcastUpdate({
          type: 'component-update',
          projectId: client.projectId,
          pageId: client.pageId,
          componentId: message.componentId,
          data: message.data,
          timestamp: Date.now(),
        });
        break;

      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Broadcast update to all connected clients for a page
   */
  broadcastUpdate(update: PreviewUpdate) {
    const key = `${update.projectId}/${update.pageId}`;
    const clients = this.clients.get(key) || [];

    const payload = JSON.stringify(update);

    clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    });
  }

  /**
   * Broadcast to specific project across all pages
   */
  broadcastToProject(projectId: string, update: any) {
    this.clients.forEach((clients) => {
      clients.forEach((client) => {
        if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(update));
        }
      });
    });
  }
}

/**
 * Parse WebSocket URL query parameters
 */
function parseWebSocketURL(url: string): { projectId?: string; pageId?: string; userId?: string } {
  const params = new URL(url, 'ws://localhost').searchParams;
  return {
    projectId: params.get('projectId') || undefined,
    pageId: params.get('pageId') || undefined,
    userId: params.get('userId') || undefined,
  };
}

// Global instance
let previewServer: PreviewSyncServer | null = null;

export function getPreviewServer(): PreviewSyncServer {
  if (!previewServer) {
    previewServer = new PreviewSyncServer();
  }
  return previewServer;
}

// ============================================================================
// BACKEND: API ROUTE INTEGRATION - app/api/builder/[projectId]/pages/[pageId]/route.ts
// ============================================================================

// After updating component in database:
// Trigger real-time preview update

export async function notifyPreviewUpdate(
  projectId: string,
  pageId: string,
  componentId: string,
  componentData: any
) {
  const server = getPreviewServer();
  server.broadcastUpdate({
    type: 'component-update',
    projectId,
    pageId,
    componentId,
    data: componentData,
    timestamp: Date.now(),
  });
}

// ============================================================================
// FRONTEND: services/previewSync.ts
// ============================================================================

export class PreviewSyncClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private projectId: string;
  private pageId: string;
  private onUpdate: (update: PreviewUpdate) => void;
  private onConnect: () => void;
  private onDisconnect: () => void;

  constructor(
    projectId: string,
    pageId: string,
    onUpdate: (update: PreviewUpdate) => void,
    onConnect?: () => void,
    onDisconnect?: () => void
  ) {
    this.projectId = projectId;
    this.pageId = pageId;
    this.onUpdate = onUpdate;
    this.onConnect = onConnect || (() => {});
    this.onDisconnect = onDisconnect || (() => {});
  }

  /**
   * Connect to preview sync server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.buildWSUrl();
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('✅ Preview sync connected');
          this.reconnectAttempts = 0;
          this.onConnect();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const update = JSON.parse(event.data);
            this.handleMessage(update);
          } catch (error) {
            console.error('Failed to parse preview update:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('❌ Preview sync disconnected');
          this.onDisconnect();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Build WebSocket URL with query parameters
   */
  private buildWSUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    return `${host}/api/ws?projectId=${this.projectId}&pageId=${this.pageId}`;
  }

  /**
   * Handle messages from server
   */
  private handleMessage(update: any) {
    switch (update.type) {
      case 'initial-state':
        // Initial page state received
        this.onUpdate(update);
        break;

      case 'component-update':
        // Component was updated, notify iframe
        this.onUpdate(update);
        break;

      case 'pong':
        // Response to ping
        break;

      default:
        console.log('Unknown preview update type:', update.type);
    }
  }

  /**
   * Send message to server
   */
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  /**
   * Send ping to keep connection alive
   */
  ping() {
    this.send({ type: 'ping' });
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect().catch(console.error), delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ============================================================================
// FRONTEND: REACT HOOK - hooks/usePreview.ts
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';

export function usePreviewSync(
  projectId: string,
  pageId: string,
  onUpdate: (update: any) => void
) {
  const clientRef = useRef<PreviewSyncClient | null>(null);

  useEffect(() => {
    // Create client
    const client = new PreviewSyncClient(projectId, pageId, onUpdate);

    // Connect
    client.connect().catch((error) => {
      console.error('Failed to connect preview sync:', error);
    });

    clientRef.current = client;

    // Cleanup
    return () => {
      client.disconnect();
    };
  }, [projectId, pageId, onUpdate]);

  const send = useCallback((message: any) => {
    clientRef.current?.send(message);
  }, []);

  const isConnected = useCallback(() => {
    return clientRef.current?.isConnected() || false;
  }, []);

  return { send, isConnected };
}

// ============================================================================
// FRONTEND: IFRAME COMPONENT - components/builder/CanvasFrame.tsx
// ============================================================================

// In CanvasFrame, use the hook:
/*
const { send, isConnected } = usePreviewSync(projectId, pageId, (update) => {
  if (update.type === 'component-update') {
    // Notify iframe of update
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'component-update',
        ...update,
      },
      '*'
    );
  }
});
*/

// When updating component:
/*
const handleComponentUpdate = async (componentId: string, updates: any) => {
  // Update backend
  const response = await fetch(`/api/builder/${projectId}/components/${componentId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

  // Backend auto-triggers preview update via WebSocket
  // Frontend receives via PreviewSync hook
  // iframe gets notified via postMessage
};
*/

// ============================================================================
// FRONTEND: PREVIEW IFRAME CONTENT - components/preview/PreviewFrame.tsx
// ============================================================================

/*
export function PreviewFrame() {
  useEffect(() => {
    // Listen for updates from parent window
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'component-update') {
        // Re-render component with new data
        const { componentId, data } = event.data;
        updateComponent(componentId, data);
      }
    });
  }, []);

  return (
    // Render page components
  );
}
*/

export default PreviewSyncClient;
