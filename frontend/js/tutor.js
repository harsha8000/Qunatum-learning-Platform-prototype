/* =========================================================================
   tutor.js — floating AI tutor chat, available on every page.
   Each question is sent with: the last simulator result (so answers about
   "my circuit" use real numbers), the current chapter, the session quiz
   progress, and the last few chat turns. Chat history is kept per session.
   ========================================================================= */
(function () {
  const HKEY = "eq-tutor-chat-v1";
  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch (e) { hist = []; }
  let busy = false;
  const $ = (id) => document.getElementById(id);
  const persist = () => { try { sessionStorage.setItem(HKEY, JSON.stringify(hist.slice(-40))); } catch (e) { /* ignore */ } };
  const page = () => { const a = document.querySelector(".app-page.active"); return a ? a.id.replace("page-", "") : "lessons"; };

  const CHIPS = {
    lessons: ["Explain this chapter simply", "Give me an everyday analogy", "What should I learn next?"],
    simulator: ["Why does my circuit give these results?", "Is my circuit entangled?", "What should I try next?"],
    progress: ["Which topics should I revisit?", "Explain my wrong answers", "Quiz me with a new question"],
  };

  function build() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button id="tutorFab" class="tutor-fab" type="button" aria-expanded="false">Ask AI tutor</button>
      <aside id="tutorPanel" class="tutor-panel" hidden aria-label="AI tutor chat">
        <header><b>AI tutor</b><span><button type="button" class="ghost" id="tutorClear">Clear</button><button type="button" class="ghost" id="tutorClose" aria-label="Close">✕</button></span></header>
        <div class="tutor-msgs" id="tutorMsgs" aria-live="polite"></div>
        <div class="tutor-chips" id="tutorChips"></div>
        <div class="tutor-input"><textarea id="tutorIn" rows="2" placeholder="Ask about the lesson or your circuit…"></textarea><button type="button" id="tutorSend">Send</button></div>
      </aside>`;
    document.body.append(...wrap.children);
    $("tutorFab").addEventListener("click", () => toggle());
    $("tutorClose").addEventListener("click", () => toggle(false));
    $("tutorClear").addEventListener("click", () => { hist = []; persist(); drawAll(); });
    $("tutorSend").addEventListener("click", () => send());
    $("tutorIn").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    $("tutorChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
    drawAll();
  }

  function addMsg(role, text, pending) {
    const d = document.createElement("div");
    d.className = `tmsg ${role === "user" ? "user" : "bot"}${pending ? " pending" : ""}`;
    d.textContent = text;
    $("tutorMsgs").appendChild(d);
    $("tutorMsgs").scrollTop = $("tutorMsgs").scrollHeight;
    return d;
  }
  function drawAll() {
    $("tutorMsgs").innerHTML = "";
    if (!hist.length) addMsg("assistant", "Hi! I'm your quantum tutor. Ask me anything about the lessons, or run a circuit and ask why it behaves the way it does.");
    hist.forEach((m) => addMsg(m.role, m.content));
    refresh();
  }
  function refresh() {
    const c = $("tutorChips"); if (!c) return;
    c.innerHTML = (CHIPS[page()] || []).map((t) => `<button type="button">${t}</button>`).join("");
  }
  function toggle(open) {
    const p = $("tutorPanel"), show = open === undefined ? p.hidden : open;
    p.hidden = !show; $("tutorFab").setAttribute("aria-expanded", String(show));
    $("tutorFab").hidden = show && window.innerWidth < 640;
    if (show) { refresh(); $("tutorIn").focus(); $("tutorMsgs").scrollTop = $("tutorMsgs").scrollHeight; }
  }

  function simContext() {
    const d = window.lastSimResult; if (!d) return null;
    const probs = d.probabilities ? Object.fromEntries(Object.entries(d.probabilities).map(([k, v]) => [QM.flipKey(k), v])) : undefined;
    return { gates: d.gates, bloch_vectors: d.bloch_vectors, purities: d.purities, probabilities: probs };
  }
  function chapterTitle() {
    return typeof currentChapter === "number" && typeof LESSONS !== "undefined" && LESSONS[currentChapter] ? LESSONS[currentChapter].title : null;
  }

  async function send(text, focus) {
    text = (text || $("tutorIn").value).trim();
    if (!text || busy) return;
    toggle(true);
    $("tutorIn").value = "";
    const past = hist.slice(-8);
    hist.push({ role: "user", content: text });
    addMsg("user", text);
    busy = true; $("tutorSend").disabled = true;
    const pending = addMsg("assistant", "Thinking…", true);
    try {
      const s = window.Progress ? Progress.summary() : null;
      const r = await EntangleAPI.askTutor(text, simContext(), {
        history: past, page: page(), chapter: chapterTitle(), focus: focus || undefined,
        progress: s ? { answered: s.answered, correct: s.correct, total: s.total, results: s.results } : undefined,
      });
      const ans = (r.answer || "").trim() || "I couldn't come up with an answer. Try rephrasing your question.";
      pending.textContent = ans; pending.classList.remove("pending");
      hist.push({ role: "assistant", content: ans }); persist();
    } catch (err) {
      pending.textContent = "I couldn't reach the tutor backend. Make sure it is running (uvicorn main:app --port 8000, or the hosted API), then try again.";
      pending.classList.remove("pending"); pending.classList.add("err");
      hist.pop(); // don't keep an unanswered question in the history
    } finally {
      busy = false; $("tutorSend").disabled = false; $("tutorMsgs").scrollTop = $("tutorMsgs").scrollHeight;
    }
  }

  /* Ask about one practice question, including what the student picked. */
  function ask(i) {
    const c = window.CHALLENGES[i], p = Progress.get(i);
    const focus = {
      chapter: Progress.title(i), question: c.q, options: c.options,
      student_pick: p === undefined ? null : c.options[p],
      correct_answer: c.options[c.answer], explanation: c.explain,
    };
    const q = p === undefined ? "Can you give me a hint for this question without giving away the answer?"
      : p === c.answer ? `I picked "${c.options[p]}". Can you explain in simpler words why that is right?`
      : `I picked "${c.options[p]}". Why is that wrong, and how should I think about it?`;
    send(q, focus);
  }

  window.addEventListener("DOMContentLoaded", build);
  window.Tutor = { open: () => toggle(true), ask, send, refresh };
})();
