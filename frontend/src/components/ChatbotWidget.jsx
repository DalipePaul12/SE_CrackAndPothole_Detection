import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaComments, FaTimes, FaPaperPlane, FaRobot } from "react-icons/fa";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatbot } from "../hooks/useChatbot.js";
import "./ChatbotWidget.css";

/* Renders [Label](pagelink:N) as an inline clickable chip that navigates
   client-side. N indexes into that specific message's validated pageLinks
   array — the route itself is never read out of the markdown text, so a
   malformed or hallucinated href can't send the user anywhere unintended. */
function makeMarkdownComponents(pageLinks, navigate, onNavigate) {
  return {
    a: ({ href, children }) => {
      if (href?.startsWith("pagelink:")) {
        const idx = Number(href.slice("pagelink:".length));
        const link = pageLinks?.[idx];
        if (!link) return <strong>{children}</strong>;
        return (
          <button
            type="button"
            className="chatbot-inline-link"
            onClick={() => {
              navigate(link.route);
              onNavigate?.();
            }}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  };
}

export default function ChatbotWidget({ userName = null, pendingReportCount = null }) {
  const {
    messages,
    loading,
    isOpen,
    suggestions,
    toggleOpen,
    close,
    sendMessage,
    clearChat,
  } = useChatbot(userName, pendingReportCount);
  const [input, setInput] = useState("");
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

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

  // New suggestion set (fresh prompt/response) always starts visible again
  useEffect(() => {
    setSuggestionsDismissed(false);
  }, [suggestions]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleSuggestion = (text) => {
    sendMessage(text);
  };

  const handleDismissSuggestions = () => {
    setSuggestionsDismissed(true);
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
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={makeMarkdownComponents(msg.pageLinks, navigate, close)}
                      >
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
          {suggestions.length > 0 && !loading && !suggestionsDismissed && (
            <div className="chatbot-suggestions">
              <button
                type="button"
                className="chatbot-suggestions-dismiss"
                onClick={handleDismissSuggestions}
                aria-label="Dismiss suggestions"
                title="Dismiss suggestions"
              >
                <FaTimes />
              </button>
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