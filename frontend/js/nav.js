/* =========================================================================
   nav.js — top-level page switching (Lessons <-> Simulator) and boot order.
   Kept separate from lessons.js / circuit-builder.js / matrix-lab.js so the
   nav can be extended (e.g. an Analytics page) without touching them.
   ========================================================================= */
function showPage(name) {
  document.querySelectorAll(".app-page").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((el) => el.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");
  document.getElementById(`nav-${name}`).classList.add("active");
  // the board's CNOT connector lines are measured from layout, so redraw once it is visible
  if (name === "simulator" && typeof drawConnectors === "function") drawConnectors();
  if (name === "progress" && window.Progress) Progress.render();
  if (window.Tutor) Tutor.refresh();
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nav-lessons").addEventListener("click", () => showPage("lessons"));
  document.getElementById("nav-simulator").addEventListener("click", () => showPage("simulator"));
  document.getElementById("nav-progress").addEventListener("click", () => showPage("progress"));

  initLessons();      // lessons.js
  buildRows();         // circuit-builder.js
  preload();           // circuit-builder.js — loads the Bell-state demo
  runCircuit();        // shows the Bell state immediately (local math if backend is down)

  // Surface whether the backend has a real OpenAI key configured, so it's
  // obvious at a glance whether the tutor is templated or LLM-grounded.
  // Polls instead of checking once, so loading the page (or reloading it)
  // before uvicorn has finished booting doesn't leave "checking backend…"
  // stuck forever — it just catches up once the server comes online.
  const keyStatusEl = document.getElementById("keyStatus");
  const HEALTH_POLL_MS = 3000;
  function pollBackendHealth() {
    EntangleAPI.health()
      .then((h) => {
        keyStatusEl.textContent = h.ai_tutor_mode === "groq"
          ? "AI tutor: Groq"
          : "AI tutor: templated (no GROQ_API_KEY set)";
        setTimeout(pollBackendHealth, HEALTH_POLL_MS);
      })
      .catch(() => {
        keyStatusEl.textContent = "Backend not reachable — retrying…";
        setTimeout(pollBackendHealth, HEALTH_POLL_MS);
      });
  }
  pollBackendHealth();

  showPage("lessons");
});
