// frontend/src/hooks/usePreview.ts
import { useCallback, useRef, useEffect, useState } from 'react';

export function usePreview() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connectPreview = useCallback((projectId: string, pageId: string) => {
    const wsUrl = import.meta.env.VITE_WS_URL?.replace('http', 'ws') || 
                  `ws://${window.location.host}`;

    try {
      const ws = new WebSocket(
        `${wsUrl}/ws?projectId=${projectId}&pageId=${pageId}`
      );

      ws.onopen = () => {
        console.log('✅ Preview WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 Preview update received:', message);
          
          // Notify iframe of update
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            iframe.contentWindow?.postMessage(message, '*');
          });
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('❌ WebSocket closed');
        setIsConnected(false);
        
        // Attempt reconnection
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = 1000 * Math.pow(2, reconnectAttempts.current - 1);
          console.log(`🔄 Reconnecting in ${delay}ms...`);
          setTimeout(() => connectPreview(projectId, pageId), delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, []);

  const sendPreviewUpdate = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectPreview,
    sendPreviewUpdate,
    disconnect,
  };
}
