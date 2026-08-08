import { useState, useCallback } from 'react';
import { sendChatMessage } from '../api/chatbot.js';

const DEFAULT_SUGGESTIONS = [
  "How do I submit a report?",
  "What are the severity levels?",
  "How do I track my report status?",
  "How does AI detection work?",
];

const STATUS_SUGGESTIONS = [
  "What does Pending mean?",
  "What does Verified mean?",
  "What does In Progress mean?",
  "What does Resolved mean?",
];

/**
 * Hook for the Snap2Fix AI chatbot widget.
 * Manages message history, loading state, suggestion chips, and API calls.
 */
export function useChatbot(userName = null, pendingReportCount = null) {
  const buildGreeting = () => {
    if (userName && pendingReportCount !== null && pendingReportCount > 0) {
      return `Hi ${userName}! I'm SnapBot — your Snap2Fix assistant. You have **${pendingReportCount} pending report${pendingReportCount > 1 ? 's' : ''}**. Want to check their status or ask me anything about the app!`;
    }
    if (userName) {
      return `Hi ${userName}! I'm SnapBot — your Snap2Fix assistant. Ask me anything about submitting reports, tracking status, or using the app!`;
    }
    return "Hi! I'm SnapBot — your Snap2Fix assistant. Ask me anything about submitting reports, tracking status, or using the app!";
  };

  const [messages, setMessages] = useState([
    { role: "assistant", content: buildGreeting() },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim()) return;
      setLoading(true);
      setError(null);
      setSuggestions([]);

      const userMsg = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);

      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { success, data, error: apiError } = await sendChatMessage(
        text.trim(),
        history
      );

if (success && data?.reply) {
        const reply = data.reply;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reply, pageLinks: data.page_links ?? [] },
        ]);
        // Contextual follow-up chips based on response content
        if (reply.toLowerCase().includes("status")) {
          setSuggestions(STATUS_SUGGESTIONS);
        } else if (reply.toLowerCase().includes("severity")) {
          setSuggestions(["How is severity decided?", "Can I change severity?"]);
        } else if (reply.toLowerCase().includes("submit")) {
          setSuggestions(["What photo quality do I need?", "How do I pin location?"]);
        } else {
          setSuggestions(DEFAULT_SUGGESTIONS);
        }
      } else {
        setError(apiError ?? "Something went wrong. Please try again.");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Oops, I couldn't get a response right now. Please try again in a moment!",
            pageLinks: [],
          },
        ]);
        setSuggestions(DEFAULT_SUGGESTIONS);
      }

      setLoading(false);
    },
    [messages]
  );

  const clearChat = useCallback(() => {
    setMessages([
      { role: "assistant", content: buildGreeting() },
    ]);
    setError(null);
    setSuggestions(DEFAULT_SUGGESTIONS);
  }, []);

  return {
    messages,
    loading,
    error,
    isOpen,
    suggestions,
    toggleOpen,
    open,
    close,
    sendMessage,
    clearChat,
  };
}
