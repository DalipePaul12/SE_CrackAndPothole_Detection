import { useState, useRef, useEffect } from "react";
import { FaComments, FaTimes, FaPaperPlane, FaRobot } from "react-icons/fa";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatbot } from "../hooks/useChatbot.js";
import "./ChatbotWidget.css";

export default function ChatbotWidget({ userName = null, pendingReportCount = null }) {
  const {
    messages,
    loading,
    isOpen,
    suggestions,
    toggleOpen,
    sendMessage,
    clearChat,
  } = useChatbot(userName, pendingReportCount);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleSuggestion = (text) => {
    sendMessage(text);
  };

  return (
    <div className="chatbot-widget">
      {/* Floating toggle button */}
      <button
        className="chatbot-toggle"
        onClick={toggleOpen}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        title={isOpen ? "Close chat" : "Chat with SnapBot"}
      >
        {isOpen ? <FaTimes /> : <FaComments />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="chatbot-panel">
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <FaRobot className="chatbot-avatar" />
              <div>
                <span className="chatbot-name">SnapBot</span>
                <span className="chatbot-status">AI Assistant</span>
              </div>
            </div>
            <div className="chatbot-header-actions">
              <button
                className="chatbot-action-btn"
                onClick={clearChat}
                aria-label="Clear chat"
                title="Clear chat"
              >
                ↻
              </button>
              <button
                className="chatbot-action-btn"
                onClick={toggleOpen}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chatbot-messages" ref={scrollRef}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chatbot-msg chatbot-msg--${msg.role}`}
              >
                <div className="chatbot-bubble">
                  {msg.role === "assistant" ? (
                    <div className="chatbot-markdown">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </Markdown>
                    </div>
                  ) : (
                    <p className="chatbot-text">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="chatbot-msg chatbot-msg--assistant">
                <div className="chatbot-bubble chatbot-bubble--typing">
                  <span className="chatbot-typing-label">SnapBot is typing</span>
                  <span className="chatbot-typing-dot" />
                  <span className="chatbot-typing-dot" />
                  <span className="chatbot-typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* Suggestion chips */}
          {suggestions.length > 0 && !loading && (
            <div className="chatbot-suggestions">
              {suggestions.map((text, idx) => (
                <button
                  key={idx}
                  className="chatbot-chip"
                  onClick={() => handleSuggestion(text)}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form className="chatbot-input-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              className="chatbot-input"
              placeholder="Ask about Snap2Fix..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              disabled={loading}
            />
            <button
              type="submit"
              className="chatbot-send"
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <FaPaperPlane />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
