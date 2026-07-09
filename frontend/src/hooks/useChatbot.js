import { useState, useCallback } from 'react';
import { sendChatMessage } from '../api/chatbot.js';

/**
 * Hook for the Snap2Fix AI chatbot widget.
 * Manages message history, loading state, and API calls.
 */
export function useChatbot() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I'm SnapBot, your Snap2Fix assistant. Ask me anything about submitting reports, tracking status, or using the app!",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim()) return;
      setLoading(true);
      setError(null);

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
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      } else {
        setError(apiError ?? "Something went wrong. Please try again.");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Oops, I couldn't get a response right now. Please try again in a moment!",
          },
        ]);
      }

      setLoading(false);
    },
    [messages]
  );

  const clearChat = useCallback(() => {
    setMessages([
      {
        role: "assistant",
        content:
          "Hi! I'm SnapBot, your Snap2Fix assistant. Ask me anything about submitting reports, tracking status, or using the app!",
      },
    ]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    isOpen,
    toggleOpen,
    open,
    close,
    sendMessage,
    clearChat,
  };
}
