// src/api/chatbot.js
import { api } from '../api/client.js';

function unwrap(res) {
  if (res?.success === false) {
    return { success: false, data: null, error: res.error ?? "Request failed." };
  }
  return { success: true, data: res?.data ?? res, error: null };
}

/**
 * Send a message to the Snap2Fix AI chatbot.
 * @param {string} message
 * @param {Array<{role:'user'|'assistant', content:string}>} history
 */
export async function sendChatMessage(message, history = []) {
  try {
    const res = await api.post("/chatbot", { message, history });
    return unwrap(res);
  } catch (err) {
    console.error("[Chatbot API]", err);
    return {
      success: false,
      data: null,
      error: err?.response?.data?.detail ?? "Chatbot is unavailable. Please try again later.",
    };
  }
}
