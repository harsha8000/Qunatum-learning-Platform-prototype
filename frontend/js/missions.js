/* =========================================================================
   missions.js — simulator UI toggles + "Predict, then test" lesson challenges.

   Flow: a lesson asks a question -> the learner commits to a prediction ->
   one click loads the circuit into the Simulator, runs it, opens the right
   panel and shows a MISSION bar. "Show answer" compares prediction and result.
   ========================================================================= */
(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- simulator toggles ---------- */
  function showTab(name) {
    document.querySelectorAll("#simTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $("tab-explain").hidden = name !== "explain";
    $("tab-corr").hidden = name !== "corr";
  }
  function openLab(open, scroll) {
    $("matrixWrap").hidden = !open;
    $("labToggle").setAttribute("aria-expanded", String(open));
    $("labChevron").textContent = open ? "▾" : "▸";
    if (open) {
      window.dispatchEvent(new Event("resize"));
      if (scroll) setTimeout(() => $("labToggle").scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }
  /* Show the Entanglement tab only when the circuit has a two-qubit gate (CNOT, CZ, SWAP);
     with nothing to switch between, hide the tab bar entirely. `entangled` adds a badge. */
  function setEntanglement(hasCnot, entangled) {
    const btn = document.querySelector('#simTabs [data-tab="corr"]');
    btn.hidden = !hasCnot;
    btn.textContent = entangled ? "Entanglement ●" : "Entanglement";
    $("simTabs").hidden = !hasCnot;
    if (!hasCnot && !$("tab-corr").hidden) showTab("explain");
  }
  window.SimUI = { showTab, openLab, setEntanglement };

  function wire() {
    $("simTabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
    $("labToggle").addEventListener("click", () => openLab($("matrixWrap").hidden, true));
    $("hintBtn").addEventListener("click", () => { const h = $("paletteHint"); h.hidden = !h.hidden; });
    $("missionClose").addEventListener("click", () => { $("missionBar").hidden = true; });
    $("missionReveal").addEventListener("click", () => { $("missionAnswer").hidden = !$("missionAnswer").hidden; });
    $("missionBack").addEventListener("click", () => {
      $("missionBar").hidden = true;
      showPage("lessons");
      if (current) showChapter(current.chapter);
    });
  }
  window.addEventListener("DOMContentLoaded", wire);

  /* ---------- the challenges (one per chapter) ---------- */
  const H0 = { type: "H", qubit: 0 };
  const BELL = [H0, { type: "CNOT", control: 0, target: 1 }];
  const CHALLENGES = [
    { q: "You'll put an H gate on qubit 0, which starts at |0⟩ (north pole). Where will its Bloch arrow point?",
      options: ["North pole (|0⟩)", "On the equator, at |+⟩", "South pole (|1⟩)"], answer: 1,
      circuit: [H0], focus: "bloch",
      goal: "Look at the Qubit 0 sphere. Where is the white arrow, and what do z and length say?",
      explain: "H turns |0⟩ into (|0⟩+|1⟩)/√2: θ = 90°, so the arrow lies on the equator at |+⟩ (x = 1, z = 0). The arrow keeps length 1 because the state stays pure." },
    { q: "After H, you measure qubit 0. What's the chance you see 1?",
      options: ["0%", "50%", "100%"], answer: 1,
      circuit: [H0], focus: "bars",
      goal: "Qubit 0 = 1 means the outcomes |10⟩ and |11⟩ (qubit 0 is written on the left). Add those bars up.",
      explain: "P(1) = |⟨1|+⟩|² = (1/√2)² = ½. The bars show |00⟩ 50% and |10⟩ 50%; the |1x⟩ rows sum to 50%." },
    { q: "Apply H twice in a row. Where does the arrow end up?",
      options: ["Back at |0⟩ (north)", "Still on the equator", "At |1⟩ (south)"], answer: 0,
      circuit: [H0, H0], focus: "bloch",
      goal: "Two H gates on qubit 0. Check the arrow, and the bars: is anything left of the superposition?",
      explain: "H is unitary, so H†H = I. And H†= H, so H·H = I: the second H undoes the first. No information was lost — that's what 'reversible' means." },
    { q: "Put X on qubit 0 only. Which outcome do you get, written |q0 q1⟩?",
      options: ["|00⟩", "|01⟩", "|10⟩", "|11⟩"], answer: 2,
      circuit: [{ type: "X", qubit: 0 }], focus: "bars",
      goal: "Read the probability bars. Which outcome is at 100%?",
      explain: "X flips qubit 0 from 0 to 1 and leaves qubit 1 at 0: |1⟩⊗|0⟩ = |10⟩. The left digit is qubit 0." },
    { q: "Run H then CNOT (the Bell circuit). What happens to qubit 0's own Bloch arrow?",
      options: ["Stays on the equator", "Shrinks to the centre", "Flips to the south pole"], answer: 1,
      circuit: BELL, focus: "corr",
      goal: "Watch both spheres, then read the Entanglement tab: what is det C, and what does the T heat-map show?",
      explain: "The pair is entangled, so each qubit alone is maximally mixed: length 0, purity ½. The information is in the correlations: det C = 0.5, and T = diag(1, −1, 1)." },
    { q: "Measure both qubits of the Bell state. Which outcomes can ever appear?",
      options: ["All four, 25% each", "Only |00⟩ and |11⟩", "Only |01⟩ and |10⟩"], answer: 1,
      circuit: BELL, focus: "bars",
      goal: "Read the bars, then compare the shots (random, ~100 each) with the exact 50%.",
      explain: "Only |00⟩ and |11⟩, 50% each. Each qubit alone looks like a fair coin, but the two always agree. The shot counts wobble around 100/100; the exact probability doesn't." },
    { q: "H puts the arrow at +x. Then Z is applied. Where does the arrow go?",
      options: ["Stays at +x", "Opposite point on the equator (−x)", "North pole"], answer: 1,
      circuit: [H0, { type: "Z", qubit: 0 }], focus: "matrix",
      goal: "Matrix Lab opened with this qubit's composed matrix. Press ▶ Play, then flip 'Vector moves' ↔ 'Space moves'.",
      explain: "Z flips the sign of the |1⟩ amplitude, so |+⟩ → |−⟩: the arrow turns half-way round the vertical axis to −x. In Matrix Lab, 'Vector moves' shows just that arrow moving; 'Space moves' drags the whole grid with it." },
    { q: "Put X on qubit 0, then a SWAP between the two qubits. Which outcome do you get, written |q0 q1⟩?",
      options: ["|00⟩", "|01⟩", "|10⟩", "|11⟩"], answer: 1,
      circuit: [{ type: "X", qubit: 0 }, { type: "SWAP", control: 0, target: 1 }], focus: "bars",
      goal: "Read the probability bars. Which outcome is at 100%, and which qubit now holds the 1? Then open the Entanglement tab.",
      explain: "X makes |10⟩. SWAP exchanges the two qubits' states, so the 1 moves from qubit 0 to qubit 1: |01⟩. Both qubits are still pure and det C = 0: SWAP moves information around but can't create entanglement." },
  ];

  window.CHALLENGES = CHALLENGES;
  let current = null; // { chapter, pick }

  function pulse(el) {
    if (!el) return;
    el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
    setTimeout(() => el.classList.remove("pulse"), 3600);
  }

  window.startMission = startMission;
  async function startMission(i) {
    const c = CHALLENGES[i];
    showPage("simulator");
    loadCircuit(c.circuit);
    await runCircuit();
    showTab(c.focus === "corr" && document.querySelector('#simTabs [data-tab="corr"]').hidden === false ? "corr" : "explain");
    if (c.focus === "matrix") { openLab(true, true); sendQubitToMatrixLab(0); }
    else openLab(false);

    const pick = window.Progress && Progress.get(i) !== undefined ? Progress.get(i) : null;
    $("missionText").textContent = c.goal;
    const verdict = pick === null ? "" :
      (pick === c.answer ? `✓ You predicted "${c.options[pick]}" — correct! ` : `You predicted "${c.options[pick]}" — not quite. `);
    $("missionAnswer").textContent = verdict + c.explain;
    $("missionAnswer").hidden = true;
    $("missionBar").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    const target = { bloch: document.querySelector(".sphere-pair"), bars: $("bars"), corr: $("simTabs"), matrix: $("labToggle") }[c.focus];
    pulse(target && target.closest(".card, .lab-toggle-row") || target);
  }

  window.renderChallenge = function (i) {
    const c = CHALLENGES[i];
    const host = document.querySelector("#lessonContent .lesson-nav-btns");
    if (!c || !host) return;
    const box = document.createElement("div");
    box.className = "challenge";
    box.innerHTML = `
      <div class="ch-head">Predict, then test it</div>
      <div class="ch-q">${c.q}</div>
      <div class="ch-opts">${c.options.map((o, k) => `<button type="button" data-k="${k}">${o}</button>`).join("")}</div>
      <div class="ch-go"><button type="button" class="ch-test">Test it in the Simulator →</button><button type="button" class="ch-ask">Ask AI tutor</button><span class="ch-lock"></span></div>`;
    host.parentNode.insertBefore(box, host);
    const commit = (k) => {
      current = { chapter: i, pick: k };
      box.classList.add("committed");
      box.querySelectorAll(".ch-opts button").forEach((x) => { x.disabled = true; x.classList.toggle("picked", +x.dataset.k === k); });
      box.querySelector(".ch-lock").textContent = `You predicted: ${c.options[k]}. No peeking. Run it and see.`;
    };
    box.querySelector(".ch-opts").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || box.classList.contains("committed")) return;
      const k = +b.dataset.k;
      if (window.Progress) Progress.answer(i, k);
      commit(k);
    });
    if (window.Progress && Progress.get(i) !== undefined) commit(Progress.get(i)); // remembered for this session
    box.querySelector(".ch-test").addEventListener("click", () => startMission(i));
    box.querySelector(".ch-ask").addEventListener("click", () => window.Tutor && Tutor.ask(i));
  };
})();
