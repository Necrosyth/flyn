// src/components/builder/AIPanel.tsx
/**
 * AI Panel Component
 * Agentic AI Assistant at bottom-right
 * Uses Anthropic API for code generation and component suggestions
 */

import React, { useState, useRef, useEffect } from 'react';
import type { BuilderProject, BuilderPage, BuilderComponent } from '@/types/builder';

interface AIPanelProps {
  project: BuilderProject;
  selectedPage: BuilderPage | null;
  selectedComponent: BuilderComponent | null;
  onGenerateComponent: (component: any) => void;
  onGenerateCode: (code: string) => void;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  project,
  selectedPage,
  selectedComponent,
  onGenerateComponent,
  onGenerateCode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: '👋 Hi! I\'m your AI assistant. I can help you generate components, write code, and optimize your designs. What would you like to do?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const quickActions = [
    { label: '✨ Generate Component', action: 'generate-component' },
    { label: '💻 Generate Code', action: 'generate-code' },
    { label: '🎨 Suggest Design', action: 'suggest-design' },
    { label: '⚡ Optimize Performance', action: 'optimize' },
  ];

  const handleQuickAction = async (action: string) => {
    setInput('');
    
    let userMessage = '';
    switch (action) {
      case 'generate-component':
        userMessage = 'Generate a beautiful hero section component for this page';
        break;
      case 'generate-code':
        userMessage = 'Generate the Next.js code for the current page';
        break;
      case 'suggest-design':
        userMessage = 'Suggest design improvements for this page';
        break;
      case 'optimize':
        userMessage = 'Optimize the performance of this page';
        break;
    }

    await handleSendMessage(userMessage);
  };

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim()) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: text,
          context: {
            projectName: project.name,
            pageName: selectedPage?.name,
            selectedComponent: selectedComponent?.name,
            components: selectedPage?.components.length || 0,
          },
        }),
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);

      // Handle special actions
      if (data.action === 'generate-component') {
        onGenerateComponent(data.component);
      } else if (data.action === 'generate-code') {
        onGenerateCode(data.code);
      }
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Sorry, I encountered an error. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* AI Panel Button */}
      <button
        className="ai-panel-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Open AI Assistant"
      >
        🤖
      </button>

      {/* AI Panel Floating Window */}
      {isOpen && (
        <div className="ai-panel">
          {/* Header */}
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span>🤖 AI Assistant</span>
              <span className="ai-status">Online</span>
            </div>
            <button
              className="ai-panel-close"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="ai-panel-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div className="message-icon">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-content">
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message assistant">
                <div className="message-icon">🤖</div>
                <div className="message-content loading">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length === 1 && (
            <div className="ai-quick-actions">
              {quickActions.map(action => (
                <button
                  key={action.action}
                  className="quick-action-btn"
                  onClick={() => handleQuickAction(action.action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="ai-panel-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSendMessage();
                }
              }}
              placeholder="Ask me anything..."
              disabled={loading}
            />
            <button
              className="ai-send-btn"
              onClick={() => handleSendMessage()}
              disabled={loading || !input.trim()}
            >
              📤
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ai-panel-toggle {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
          transition: all 0.3s;
          z-index: 999;
        }

        .ai-panel-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
        }

        .ai-panel-toggle:active {
          transform: scale(0.95);
        }

        .ai-panel {
          position: fixed;
          bottom: 100px;
          right: 24px;
          width: 380px;
          height: 600px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          z-index: 998;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ai-panel-header {
          padding: 16px;
          background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
          color: white;
          border-radius: 12px 12px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ai-panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }

        .ai-status {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
          color: #dcfce7;
        }

        .ai-panel-close {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .ai-panel-close:hover {
          opacity: 1;
        }

        .ai-panel-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #f8fafc;
        }

        .message {
          display: flex;
          gap: 8px;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .message.user {
          justify-content: flex-end;
        }

        .message-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .message-content {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
          max-width: 280px;
          word-wrap: break-word;
        }

        .message.user .message-content {
          background: #3b82f6;
          color: white;
        }

        .message.assistant .message-content {
          background: white;
          border: 1px solid #e2e8f0;
          color: #1e293b;
        }

        .message-content.loading {
          display: flex;
          gap: 4px;
          padding: 12px;
        }

        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #3b82f6;
          animation: bounce 1.4s infinite;
        }

        .dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes bounce {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-8px);
          }
        }

        .ai-quick-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
        }

        .quick-action-btn {
          padding: 8px 12px;
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .quick-action-btn:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .ai-panel-input {
          display: flex;
          gap: 6px;
          padding: 12px;
          background: white;
          border-top: 1px solid #e2e8f0;
          border-radius: 0 0 12px 12px;
        }

        .ai-panel-input input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 12px;
          font-family: inherit;
        }

        .ai-panel-input input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px #eff6ff;
        }

        .ai-panel-input input:disabled {
          background: #f1f5f9;
          color: #94a3b8;
        }

        .ai-send-btn {
          padding: 8px 12px;
          background: #3b82f6;
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ai-send-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .ai-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .ai-panel {
            width: 320px;
            height: 500px;
            bottom: 80px;
          }

          .message-content {
            max-width: 220px;
          }
        }
      `}</style>
    </>
  );
};
