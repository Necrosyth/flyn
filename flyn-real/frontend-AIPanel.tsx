import React, { useState, useRef, useEffect } from 'react';
import './AIPanel.css';

interface AIPanelProps {
  project: any;
  selectedPage: any;
  selectedComponent: any;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  project,
  selectedPage,
  selectedComponent,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([
    { role: 'assistant', content: '👋 Hi! I can help you generate components, write code, and optimize your designs.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Simulate AI response (in real app, call Anthropic API)
      const response = `I'll help with: "${userMessage}". In a real implementation, this would call the Anthropic API.`;
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('AI error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className="ai-toggle" onClick={() => setIsOpen(!isOpen)}>🤖</button>
      
      {isOpen && (
        <div className="ai-panel">
          <div className="ai-header">
            <h3>🤖 AI Assistant</h3>
            <button onClick={() => setIsOpen(false)}>×</button>
          </div>

          <div className="ai-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <span className="icon">{msg.role === 'user' ? '👤' : '🤖'}</span>
                <span className="text">{msg.content}</span>
              </div>
            ))}
            {loading && <div className="message assistant"><span>⏳ Thinking...</span></div>}
            <div ref={messagesEnd} />
          </div>

          <div className="ai-input">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything..."
              disabled={loading}
            />
            <button onClick={handleSend} disabled={loading}>📤</button>
          </div>
        </div>
      )}
    </>
  );
};
