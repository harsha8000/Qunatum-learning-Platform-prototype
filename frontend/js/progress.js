/* =========================================================================
   progress.js — session progress store + the Progress page.

   Answers to the practice questions (missions.js CHALLENGES) are kept in
   sessionStorage, so they survive page switches and reloads of the tab but
   are gone when the tab is closed. The lesson pages and this page share the
   same store: answer in either place and both show it.
   ========================================================================= */
(function () {
  const KEY = "eq-progress-v1";
  let mem = { answers: {} };
  try { const s = sessionStorage.getItem(KEY); if (s) mem = JSON.parse(s); } catch (e) { /* private mode: in-memory only */ }
  const $ = (id) => document.getElementById(id);
  const chall = () => window.CHALLENGES || [];
  const title = (i) => (typeof LESSONS !== "undefined" && LESSONS[i] ? LESSONS[i].title : `Question ${i + 1}`);

  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ }
    badge();
  }
  function get(i) { return mem.answers[i]; }
  function answer(i, pick) { if (mem.answers[i] === undefined) { mem.answers[i] = pick; save(); } }
  function reset() { mem = { answers: {} }; save(); render(); }

  function summary() {
    const C = chall();
    const results = C.map((c, i) => ({ chapter: title(i), answered: get(i) !== undefined, correct: get(i) === c.answer }));
    return {
      total: C.length,
      answered: results.filter((r) => r.answered).length,
      correct: results.filter((r) => r.answered && r.correct).length,
      results,
    };
  }
  function badge() {
    const s = summary(), el = $("progBadge");
    if (el) el.textContent = s.answered ? `${s.correct}/${s.total}` : "";
  }

  function card(i) {
    const c = chall()[i], p = get(i), done = p !== undefined, ok = p === c.answer;
    const opts = c.options.map((o, k) => {
      let cls = "";
      if (done) { if (k === c.answer) cls = "right"; else if (k === p) cls = "wrong"; }
      return `<button type="button" class="${cls}" data-q="${i}" data-k="${k}" ${done ? "disabled" : ""}>${o}</button>`;
    }).join("");
    const fb = done ? `
      <div class="prog-fb ${ok ? "ok" : "no"}"><b>${ok ? "Correct." : "Not quite."}</b> ${c.explain}</div>
      <div class="prog-actions">
        <button type="button" class="tutor-btn" data-act="ask" data-q="${i}">Ask AI tutor about this</button>
        <button type="button" data-act="sim" data-q="${i}">Try it in the Simulator</button>
        <button type="button" data-act="lesson" data-q="${i}">Open lesson</button>
      </div>` : "";
    return `<article class="prog-card ${done ? (ok ? "is-ok" : "is-no") : ""}">
      <div class="prog-ch">${i + 1}. ${title(i)}</div>
      <div class="prog-q">${c.q}</div>
      <div class="prog-opts">${opts}</div>${fb}</article>`;
  }

  function render() {
    const host = $("progressHost");
    if (!host) return;
    const s = summary();
    host.innerHTML = `
      <div class="prog-head">
        <div>
          <h2>Your progress</h2>
          <p class="prog-sub">Answer the questions below. Your answers are remembered while this tab stays open, and the AI tutor can help with any of them.</p>
        </div>
        <div class="prog-score"><b>${s.correct}</b> / ${s.total}<span>correct</span></div>
      </div>
      <div class="prog-bar"><i style="width:${s.total ? (s.answered / s.total) * 100 : 0}%"></i></div>
      <div class="prog-meta"><span>${s.answered} of ${s.total} answered</span>
        <span><button type="button" class="tutor-btn" data-act="ask-general">Ask AI tutor</button> <button type="button" class="ghost" data-act="reset">Reset</button></span></div>
      <div class="prog-list">${chall().map((_, i) => card(i)).join("")}</div>`;
    badge();
  }

  window.addEventListener("DOMContentLoaded", () => {
    badge();
    $("progressHost").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const i = +b.dataset.q;
      if (b.dataset.k !== undefined) { answer(i, +b.dataset.k); render(); return; }
      if (b.dataset.act === "ask") window.Tutor && Tutor.ask(i);
      else if (b.dataset.act === "ask-general") window.Tutor && Tutor.open();
      else if (b.dataset.act === "sim") window.startMission(i);
      else if (b.dataset.act === "lesson") { showPage("lessons"); showChapter(i); }
      else if (b.dataset.act === "reset" && confirm("Clear your answers for this session?")) reset();
    });
  });

  window.Progress = { get, answer, summary, render, reset, title };
})();
