/* =========================================================================
   api.js — single place the frontend talks to the backend from.
   Every other module calls window.EntangleAPI.* rather than fetch() directly,
   so swapping hosts, adding auth headers, or mocking the backend for a demo
   only ever means editing this one file.
   ========================================================================= */
const API_BASE = "https://qunatum-learning-platform-prototype-api.onrender.com";

window.EntangleAPI = {
  BASE: API_BASE,

  async simulate(gates, shots = 200, backend = "qiskit") {
    const res = await fetch(`${API_BASE}/api/simulate?backend=${backend}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gates, shots }),
    });
    if (!res.ok) throw new Error(`simulate() failed: ${res.status}`);
    return res.json();
  },

  async getLessons() {
    const res = await fetch(`${API_BASE}/api/lessons`);
    if (!res.ok) throw new Error(`getLessons() failed: ${res.status}`);
    return res.json();
  },

  // Free-form question to the AI tutor, grounded in whatever circuit result
  // (from simulate()) is passed in as `context` — see backend/ai_tutor.py.
  async askTutor(question, context, extra = {}) {
    const res = await fetch(`${API_BASE}/api/ask-tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context, ...extra }),
    });
    if (!res.ok) throw new Error("ask-tutor failed");
    return res.json();
  },

  /** 3 short, personalized follow-up questions for the current context. */
  async suggestQuestions(context, extra = {}) {
    const res = await fetch(`${API_BASE}/api/suggest-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, ...extra }),
    });
    if (!res.ok) throw new Error(`suggestQuestions() failed: ${res.status}`);
    return res.json();
  },

  async health() {
    const res = await fetch(`${API_BASE}/`);
    return res.json();
  },
};
