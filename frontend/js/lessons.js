/* =========================================================================
   lessons.js
   Chapter content ("Feynman-style: intuition first, math when it's needed")
   plus the rendering / navigation for the Lessons page. Content lives here
   as data so new chapters are just new entries in LESSONS — no HTML edits.
   A production build would instead fetch this from GET /api/lessons and
   let an instructor dashboard edit it; EntangleAPI.getLessons() is already
   wired for that swap (see boot() at the bottom).
   ========================================================================= */
/* ---- small helpers used by the lesson widgets ---- */
const cf = (x) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(2);
const cfmt = (a) => {
  const [re, im] = a;
  if (Math.abs(im) < 5e-4) return cf(re);
  if (Math.abs(re) < 5e-4) return cf(im) + "i";
  return `${cf(re)}${im < 0 ? "−" : "+"}${cf(Math.abs(im))}i`;
};
const matHTML = (rows) => `<span class="mat" style="grid-template-columns:repeat(${rows[0].length},auto)">` +
  rows.flat().map((v) => `<span>${typeof v === "string" ? v : cfmt(v)}</span>`).join("") + `</span>`;
const NAMED = {
  "|0⟩": [QM.C(1), QM.C(0)], "|1⟩": [QM.C(0), QM.C(1)],
  "|+⟩": [QM.C(Math.SQRT1_2), QM.C(Math.SQRT1_2)], "|−⟩": [QM.C(Math.SQRT1_2), QM.C(-Math.SQRT1_2)],
  "|+i⟩": [QM.C(Math.SQRT1_2), QM.C(0, Math.SQRT1_2)], "|−i⟩": [QM.C(Math.SQRT1_2), QM.C(0, -Math.SQRT1_2)],
};
const stateOptions = (sel) => Object.keys(NAMED).map((k) => `<option ${k === sel ? "selected" : ""}>${k}</option>`).join("");
const $l = (id) => document.getElementById(id);
/* one-qubit gates the lessons can offer in drop-downs: [key in QM.GATES, label shown] */
const LESSON_GATES = [["H", "H"], ["X", "X"], ["Y", "Y"], ["Z", "Z"], ["S", "S"], ["Sdg", "S†"], ["T", "T"], ["Tdg", "T†"], ["SX", "√X"]];
const gateOptions = (sel) => LESSON_GATES.map(([k, lbl]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${lbl}</option>`).join("");

const LESSONS = [
  /* ------------------------------------------------------------ 1 */
  {
    title: "What is a quantum state?",
    body: `
      <p>A classical bit is 0 or 1. A <b>qubit</b> is described by two numbers, called <b>amplitudes</b>, one for each outcome:</p>
      <p style="text-align:center"><code>|ψ⟩ = α|0⟩ + β|1⟩</code> &nbsp; or as a column: ${matHTML(["α", "β"].map((x) => [x]))}</p>
      <p><code>|0⟩</code> and <code>|1⟩</code> are just the two "pure" answers, written ${matHTML([["1"], ["0"]])} and ${matHTML([["0"], ["1"]])}.
      The amplitudes α, β are <em>complex numbers</em> (they can carry a sign or a phase, like −1 or i).</p>
      <div class="why"><b>The one rule:</b> |α|² + |β|² = 1. Squaring an amplitude gives the <em>probability</em> of that outcome, and probabilities must add to 100%. A state that obeys this is called <b>normalized</b> — its arrow has length 1.</div>
      <p><b>Bloch sphere:</b> since the length is fixed, only two knobs remain: an angle <b>θ</b> from the north pole and a rotation <b>φ</b> around it.
      <code>α = cos(θ/2)</code>, <code>β = e^{iφ} sin(θ/2)</code>. Every pure qubit state is one point on a sphere: north = |0⟩, south = |1⟩.
      φ is invisible to measurement in the 0/1 basis, but it changes where the point sits around the equator — and it matters when gates make paths interfere.</p>
      <div class="lesson-widget" id="w1">
        <h4>State explorer</h4>
        <div class="wrow"><span>θ</span><input type="range" id="w1t" min="0" max="180" value="90"><output id="w1to"></output></div>
        <div class="wrow"><span>φ</span><input type="range" id="w1p" min="0" max="360" value="0"><output id="w1po"></output></div>
        <div id="w1out"></div>
      </div>
      <div class="try-it">Try it: in the Simulator, the sphere for qubit 0 starts at |0⟩ (north, θ = 0). Put an <code>H</code> gate on it and press Run: θ becomes 90°.</div>`,
    init() {
      const upd = () => {
        const th = +$l("w1t").value, ph = +$l("w1p").value;
        $l("w1to").textContent = th + "°"; $l("w1po").textContent = ph + "°";
        const v = QM.fromAngles(th * Math.PI / 180, ph * Math.PI / 180);
        const b = QM.blochOfKet(v);
        const p0 = QM.abs2(v[0]), p1 = QM.abs2(v[1]);
        $l("w1out").innerHTML = `
          <div class="wrow">|ψ⟩ = ${matHTML(v.map((a) => [a]))} &nbsp; α = <span class="num">${cfmt(v[0])}</span>, β = <span class="num">${cfmt(v[1])}</span></div>
          <div class="wrow"><span style="width:60px">P(0)</span><div class="bar" style="flex:1"><i style="width:${p0 * 100}%"></i></div><span class="num">|α|² = ${p0.toFixed(3)}</span></div>
          <div class="wrow"><span style="width:60px">P(1)</span><div class="bar" style="flex:1"><i style="width:${p1 * 100}%"></i></div><span class="num">|β|² = ${p1.toFixed(3)}</span></div>
          <div class="wrow">Check: |α|² + |β|² = <span class="num ok">${(p0 + p1).toFixed(3)}</span> &nbsp;·&nbsp; Bloch vector (x, y, z) = <span class="num">(${cf(b.x)}, ${cf(b.y)}, ${cf(b.z)})</span></div>`;
      };
      $l("w1t").oninput = upd; $l("w1p").oninput = upd; upd();
    },
  },

  /* ------------------------------------------------------------ 2 */
  {
    title: "Products between states: the inner product",
    body: `
      <p>How similar are two states? The <b>inner product</b> ⟨a|b⟩ answers this with one (complex) number. Recipe: turn the column of <code>a</code> into a row and flip the sign of every <i>i</i> (that's the "bra" ⟨a|), then multiply and add:</p>
      <p style="text-align:center"><code>⟨a|b⟩ = a₀* b₀ + a₁* b₁</code></p>
      <div class="why"><b>Why it matters:</b> the probability of finding a qubit in state <code>b</code> when you test for state <code>a</code> is <code>|⟨a|b⟩|²</code>. That single formula is the whole rule for measurement.</div>
      <ul>
        <li>⟨a|b⟩ = 1 (in size): same state.</li>
        <li>⟨a|b⟩ = 0: <b>orthogonal</b> — perfectly distinguishable, like |0⟩ and |1⟩. On the Bloch sphere they are opposite points.</li>
        <li>In between: partial overlap. |0⟩ vs |+⟩ gives ½.</li>
      </ul>
      <div class="lesson-widget" id="w2">
        <h4>Inner product calculator</h4>
        <div class="wrow">⟨ <select id="w2a">${stateOptions("|0⟩")}</select> | <select id="w2b">${stateOptions("|+⟩")}</select> ⟩</div>
        <div id="w2out"></div>
      </div>`,
    init() {
      const upd = () => {
        const a = NAMED[$l("w2a").value], b = NAMED[$l("w2b").value];
        const ip = QM.inner(a, b), p = QM.abs2(ip);
        $l("w2out").innerHTML = `
          <div class="wrow">bra ⟨a| = ${matHTML([[QM.conj(a[0]), QM.conj(a[1])]])} &nbsp; ket |b⟩ = ${matHTML(b.map((x) => [x]))}</div>
          <div class="wrow">⟨a|b⟩ = <span class="num">${cfmt(ip)}</span> &nbsp;→&nbsp; probability |⟨a|b⟩|² = <span class="num">${p.toFixed(3)}</span> ${p < 1e-9 ? '<span class="ok">(orthogonal)</span>' : Math.abs(p - 1) < 1e-9 ? '<span class="ok">(same state)</span>' : ""}</div>`;
      };
      $l("w2a").onchange = upd; $l("w2b").onchange = upd; upd();
    },
  },

  /* ------------------------------------------------------------ 3 */
  {
    title: "Unitary operators: what a gate is",
    body: `
      <p>A quantum gate is a matrix <b>U</b> that turns one state into another: <code>|ψ'⟩ = U|ψ⟩</code>. Not every matrix is allowed. The gate must keep the total probability at 100%, which means it must preserve the length of the state. Matrices that do this are called <b>unitary</b>, and there's a one-line test:</p>
      <p style="text-align:center"><code>U†U = I</code></p>
      <p>U† ("U dagger") is U flipped over its diagonal with every <i>i</i> negated. The test says: undoing U is always possible (U† is the undo button), and nothing is lost.</p>
      <div class="why"><b>Geometric picture:</b> a unitary is a <em>rotation</em> of the Bloch sphere. X, Y, Z are half-turns around the x, y, z axes; H is a half-turn around the diagonal between x and z; S is a quarter turn around z (T an eighth of a turn, S† and T† the same turns backwards); √X is a quarter turn around x. A non-unitary matrix would stretch or squash the arrow off the sphere — which is not a valid quantum state.</div>
      <div class="lesson-widget" id="w3">
        <h4>Unitary checker</h4>
        <div class="wrow">Gate: <select id="w3g">${gateOptions("H")}<option value="BAD">not a gate: [[1,1],[0,1]]</option></select>
          &nbsp; Apply to: <select id="w3s">${stateOptions("|0⟩")}</select></div>
        <div id="w3out"></div>
      </div>
      <div class="try-it">Try it: in the Simulator, put <code>H</code> on qubit 0 and click "View this qubit's transform in Matrix Lab". The 3×3 matrix you see there is the same rotation, written for Bloch coordinates instead of amplitudes.</div>`,
    init() {
      const BAD = [[QM.C(1), QM.C(1)], [QM.C(0), QM.C(1)]];
      const upd = () => {
        const g = $l("w3g").value;
        const U = g === "BAD" ? BAD : QM.GATES[g];
        const Ud = QM.dagger(U), UdU = QM.matMul2(Ud, U);
        const uni = QM.isIdentity(UdU);
        const v = NAMED[$l("w3s").value], w = QM.applyGate1(U, v);
        const nb = QM.norm2(w);
        const b0 = QM.blochOfKet(v), b1 = QM.blochOfKet(w);
        $l("w3out").innerHTML = `
          <div class="wrow">U = ${matHTML(U)} &nbsp; U† = ${matHTML(Ud)}</div>
          <div class="wrow">U†U = ${matHTML(UdU)} &nbsp; ${uni ? '<b class="ok">= I → unitary ✓</b>' : '<b class="no">≠ I → not unitary ✗</b>'}</div>
          <div class="wrow">U|ψ⟩ = ${matHTML(w.map((x) => [x]))} &nbsp; total probability |α|²+|β|² = <span class="num ${Math.abs(nb - 1) < 1e-9 ? "ok" : "no"}">${nb.toFixed(3)}</span></div>
          ${uni ? `<div class="wrow">Bloch vector: (${cf(b0.x)}, ${cf(b0.y)}, ${cf(b0.z)}) → (${cf(b1.x)}, ${cf(b1.y)}, ${cf(b1.z)}) — rotated, same length</div>` : `<div class="wrow no">The probabilities no longer add to 1 — this "gate" can't exist physically.</div>`}`;
      };
      $l("w3g").onchange = upd; $l("w3s").onchange = upd; upd();
    },
  },

  /* ------------------------------------------------------------ 4 */
  {
    title: "Two qubits: the tensor product",
    body: `
      <p>To describe two independent qubits <code>a</code> and <code>b</code> together, multiply every amplitude of a by every amplitude of b. This is the <b>tensor product</b> a ⊗ b:</p>
      <p style="text-align:center">${matHTML([["a₀"], ["a₁"]])} ⊗ ${matHTML([["b₀"], ["b₁"]])} = ${matHTML([["a₀b₀"], ["a₀b₁"], ["a₁b₀"], ["a₁b₁"]])}</p>
      <p>Two qubits need <b>four</b> amplitudes, one for each outcome 00, 01, 10, 11. (Notation: we write |q0 q1⟩, with qubit 0 on the left.) Ten qubits need 1024 amplitudes, which is why quantum computers are hard to simulate.</p>
      <div class="why"><b>Key fact:</b> not every four-number list can be built this way. States that <em>can</em> are called <b>product states</b> (the qubits are independent). States that <em>can't</em> are <b>entangled</b>. That's the next chapter.</div>
      <p>Gates on two qubits are 4×4 unitaries. A gate on one qubit is <code>U ⊗ I</code> (do U to qubit 0, leave qubit 1 alone). CNOT is a 4×4 that flips qubit 1 only if qubit 0 is 1.</p>
      <div class="lesson-widget" id="w4">
        <h4>Tensor product builder</h4>
        <div class="wrow"><select id="w4a">${stateOptions("|+⟩")}</select> ⊗ <select id="w4b">${stateOptions("|0⟩")}</select></div>
        <div id="w4out"></div>
      </div>`,
    init() {
      const upd = () => {
        const a = NAMED[$l("w4a").value], b = NAMED[$l("w4b").value];
        const psi = [QM.mul(a[0], b[0]), QM.mul(a[0], b[1]), QM.mul(a[1], b[0]), QM.mul(a[1], b[1])];
        $l("w4out").innerHTML = `
          <div class="wrow">a ⊗ b = ${matHTML(psi.map((x) => [x]))} &nbsp; for |00⟩, |01⟩, |10⟩, |11⟩</div>
          <div class="wrow">Arranged as a grid (rows = qubit 0, columns = qubit 1): ${matHTML([[psi[0], psi[1]], [psi[2], psi[3]]])} &nbsp; det = <span class="num ok">${cfmt(QM.detC(psi))}</span> (always 0 for a product)</div>`;
      };
      $l("w4a").onchange = upd; $l("w4b").onchange = upd; upd();
    },
  },

  /* ------------------------------------------------------------ 5 */
  {
    title: "Entanglement and Correlation Space",
    body: `
      <p>Write the four amplitudes as a 2×2 grid <b>C</b>: rows are qubit 0's value, columns are qubit 1's. If the qubits are independent, the grid is a product: row 2 is just row 1 scaled. In matrix language, C has <b>rank 1</b>, equivalently <code>det C = 0</code>.</p>
      <p>For the Bell state (|00⟩ + |11⟩)/√2:</p>
      <p style="text-align:center">C = ${matHTML([["0.71", "0"], ["0", "0.71"]])}, &nbsp; det C = 0.5 ≠ 0</p>
      <p>No rows are multiples of each other, so no split into "qubit 0's state × qubit 1's state" exists. That's entanglement. The size of the determinant gives a number, the <b>concurrence</b> = 2|det C|, from 0 (independent) to 1 (maximally entangled).</p>
      <div class="why"><b>Correlation Space:</b> the Simulator's <b>Entanglement</b> tab (it appears once your circuit contains a two-qubit gate: CNOT, CZ or SWAP) shows a 3×3 heat-map T with entries ⟨σᵢ⊗σⱼ⟩: "if I measure qubit 0 along i and qubit 1 along j, do they agree (+1) or disagree (−1)?" For independent qubits, T is just (qubit 0's Bloch vector) × (qubit 1's Bloch vector)ᵀ, nothing new. The Bell state has T = diag(1, −1, 1) even though both Bloch vectors are zero, which means it's correlation that lives only <em>between</em> the qubits.</div>
      <p><b>The purity test again:</b> in an entangled pair each qubit's own Bloch arrow shrinks below length 1 — part of its information is stored in the correlations instead.</p>
      <div class="try-it">Try it: in the Simulator, run <code>H</code> alone (C has a zero column, T has just one bright cell, det = 0: not entangled). Then add <code>CNOT</code> and run again: det C jumps to 0.5, the heat-map lights up its diagonal, and both Bloch arrows collapse to the centre.</div>`,
  },

  /* ------------------------------------------------------------ 6 */
  {
    title: "Measurement, probabilities and trusting the pictures",
    body: `
      <p>Measuring applies the rule from chapter 2: the probability of outcome <code>k</code> is <code>|⟨k|ψ⟩|²</code>, i.e. the squared size of that amplitude. After the measurement the state <em>becomes</em> the outcome you saw.</p>
      <p>The Simulator shows two things for each outcome: the <b>exact</b> probability (computed from the amplitudes) and the number of <b>shots</b> (200 sampled measurements). Shots wobble a little around the exact value, just like 200 coin flips won't be exactly 100/100.</p>
      <div class="why"><b>How the site keeps every picture honest.</b>
        <ol style="margin:6px 0 0 18px">
          <li>Bloch vectors, probability bars, and the Correlation Space all come from the <em>same</em> four amplitudes.</li>
          <li>Bloch vector of a qubit = (⟨X⟩, ⟨Y⟩, ⟨Z⟩) for that qubit alone. For an entangled qubit this is shorter than 1.</li>
          <li>After each run, the site recomputes everything with its own small reference simulator (<code>qmath.js</code>) and compares against Qiskit. You'll see "✓ Verified" when they agree to 6 decimals.</li>
          <li>Naming trap avoided: Qiskit writes outcomes as |q1 q0⟩; this site always writes |q0 q1⟩ and converts for you.</li>
        </ol></div>
      <div class="try-it">Try it: run Bell (H + CNOT). You'll see only 00 and 11, each 50% exact, with shots close to but not exactly 100/100.</div>`,
  },

  /* ------------------------------------------------------------ 7 */
  {
    title: "Matrix Lab: does the vector move, or does space?",
    body: `
      <p>A matrix can be pictured two ways, and both are right:</p>
      <ul>
        <li><b>Vector moves</b> (default): the axes stay put, and the arrow v jumps to Mv. This matches the Bloch sphere: the sphere is fixed and the qubit's arrow rotates on it.</li>
        <li><b>Space moves</b>: the whole grid is dragged along, so you see where <em>every</em> point lands. The columns of M are where the basis arrows x̂, ŷ, ẑ end up.</li>
      </ul>
      <p>Use the toggle under "Transformation" in Matrix Lab. Press Play to watch the morph from identity into M.</p>
      <div class="why"><b>Reading a 3×3 gate matrix:</b> column 1 is where the x-axis arrow goes, column 2 where y goes, column 3 where z goes. For H: x→z, y→−y, z→x, which is the half-turn about the x/z diagonal from chapter 3.</div>
      <div class="try-it">Try it: open the Simulator, load the "Hadamard" preset in Matrix Lab, and flip the toggle while Play runs.</div>`,
  },

  /* ------------------------------------------------------------ 8 */
  {
    title: "More gates: phases, √X, CZ and SWAP",
    body: `
      <p>You now know H, X, Z and CNOT. The rest of the palette is built from the same idea: every one-qubit gate is a <b>rotation of the Bloch sphere</b>, and every gate is reversible. Only the axis and the angle change.</p>
      <table class="gate-table">
        <tr><th>Gate</th><th>On the Bloch sphere</th><th>Matrix</th></tr>
        <tr><td>X</td><td>half turn about x (the quantum NOT)</td><td>${matHTML([["0", "1"], ["1", "0"]])}</td></tr>
        <tr><td>Y</td><td>half turn about y</td><td>${matHTML([["0", "−i"], ["i", "0"]])}</td></tr>
        <tr><td>Z</td><td>half turn about z</td><td>${matHTML([["1", "0"], ["0", "−1"]])}</td></tr>
        <tr><td>S</td><td>quarter turn about z</td><td>${matHTML([["1", "0"], ["0", "i"]])}</td></tr>
        <tr><td>S†</td><td>quarter turn back (undoes S)</td><td>${matHTML([["1", "0"], ["0", "−i"]])}</td></tr>
        <tr><td>T</td><td>eighth of a turn about z</td><td>${matHTML([["1", "0"], ["0", "e<sup>iπ/4</sup>"]])}</td></tr>
        <tr><td>T†</td><td>eighth of a turn back (undoes T)</td><td>${matHTML([["1", "0"], ["0", "e<sup>−iπ/4</sup>"]])}</td></tr>
        <tr><td>√X</td><td>quarter turn about x</td><td>${matHTML([["(1+i)/2", "(1−i)/2"], ["(1−i)/2", "(1+i)/2"]])}</td></tr>
      </table>
      <p>Z, S and T all turn the sphere about the <em>same</em> axis, only by different amounts, and they don't change the measurement odds of |0⟩ and |1⟩ at all. Their effect only shows once a gate like H has tipped the arrow onto the equator, where the turn moves it around.</p>
      <div class="why"><b>Gates that build other gates.</b> Turning twice by a quarter is a half turn, so S·S = Z. Two eighths make a quarter, so T·T = S. Two √X make an X. And S followed by S† does nothing. (Gates that differ only by an overall factor, like −1 or e<sup>iπ/4</sup>, act identically on every measurement, so we count them as equal.)</div>
      <div class="lesson-widget" id="w8">
        <h4>Gate composer</h4>
        <div class="wrow">Apply <select id="w8a">${gateOptions("T")}</select> then <select id="w8b">${gateOptions("T")}</select></div>
        <div id="w8out"></div>
      </div>
      <p><b>Two-qubit gates.</b> <b>CZ</b> flips the sign of |11⟩ and leaves the other three outcomes alone. It is symmetric: it doesn't matter which qubit you call the control. CNOT is CZ sandwiched between two H gates on the target qubit. <b>SWAP</b> exchanges the two qubits' states. Both are 4×4 unitaries:</p>
      <p style="text-align:center">CZ = ${matHTML([["1", "0", "0", "0"], ["0", "1", "0", "0"], ["0", "0", "1", "0"], ["0", "0", "0", "−1"]])} &nbsp; SWAP = ${matHTML([["1", "0", "0", "0"], ["0", "0", "1", "0"], ["0", "1", "0", "0"], ["0", "0", "0", "1"]])}</p>
      <div class="why"><b>Entangling or not?</b> CNOT and CZ can create entanglement: try H on both qubits, then CZ, and read det C in the Entanglement tab. SWAP can't: it only moves each qubit's state to the other wire, so product states stay product states. (Three CNOTs in a row make one SWAP.)</div>
      <div class="try-it">Try it: put X on qubit 0, then a SWAP.</div>`,
    init() {
      const names = { I: "I (nothing at all)", H: "H", X: "X", Y: "Y", Z: "Z", S: "S", Sdg: "S†", T: "T", Tdg: "T†", SX: "√X" };
      const trace = (A, B) => {            // tr(A†B) for 2×2 matrices
        let t = [0, 0];
        for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) t = QM.add(t, QM.mul(QM.conj(A[k][i]), B[k][i]));
        return t;
      };
      const upd = () => {
        const a = $l("w8a").value, b = $l("w8b").value;
        const P = QM.matMul2(QM.GATES[b], QM.GATES[a]);                 // a first, then b
        const hit = Object.keys(names).find((k) => Math.abs(Math.hypot(...trace(QM.GATES[k], P)) - 2) < 1e-9);
        const nice = (k) => names[k] || k;
        $l("w8out").innerHTML = `
          <div class="wrow">${nice(b).split(" ")[0]}·${nice(a).split(" ")[0]} = ${matHTML(P)}</div>
          <div class="wrow">${hit ? `<b class="ok">Same as ${nice(hit)}</b> (up to an overall phase)` : `<span class="no">Not one of the named gates</span>: a new rotation, but still unitary.`}</div>`;
      };
      $l("w8a").onchange = upd; $l("w8b").onchange = upd; upd();
    },
  },
];

let currentChapter = 0;

function renderChapterList() {
  const list = document.getElementById("chapterList");
  list.innerHTML = "";
  LESSONS.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "chapter-item" + (i === currentChapter ? " active" : "");
    btn.innerHTML = `<span class="ch-num">${i + 1}.</span>${ch.title}`;
    btn.addEventListener("click", () => showChapter(i));
    list.appendChild(btn);
  });
}

function showChapter(i) {
  currentChapter = i;
  if (window.Tutor) Tutor.invalidate("lessons"); // stale suggestions once the chapter changes
  const ch = LESSONS[i];
  // the old plain-text "Try it" notes are replaced by the interactive challenge card
  const body = ch.body.replace(/<div class="try-it">[\s\S]*?<\/div>/, "");
  document.getElementById("lessonContent").innerHTML = `
    <h2>${i + 1}. ${ch.title}</h2>
    ${body}
    <div class="lesson-nav-btns">
      <button id="prevChBtn" ${i === 0 ? "disabled" : ""}>← Previous</button>
      <button id="nextChBtn" ${i === LESSONS.length - 1 ? "disabled" : ""}>Next →</button>
    </div>`;
  renderChapterList();
  if (ch.init) ch.init();
  if (window.renderChallenge) window.renderChallenge(i);
  document.getElementById("prevChBtn")?.addEventListener("click", () => showChapter(i - 1));
  document.getElementById("nextChBtn")?.addEventListener("click", () => showChapter(i + 1));
}

function initLessons() {
  renderChapterList();
  showChapter(0);
}
