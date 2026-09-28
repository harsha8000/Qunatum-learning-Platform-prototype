/* =========================================================================
   correlation.js — "Correlation Space": entanglement shown as matrices.
   Two views of the same fact:
     1. Coefficient matrix C (2x2):  |ψ> = Σ C[i][j] |i j>.
        Product state <=> C is "rank 1" (one row is a multiple of the other).
     2. Correlation matrix T (3x3):  T[i][j] = <σi ⊗ σj>, a heat-map.
        If the qubits were independent, T would equal (Bloch vector 0)(Bloch vector 1)ᵀ.
   ========================================================================= */
(function () {
  const f = (x) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(2);
  function fmtC(a) {
    const [re, im] = a;
    if (Math.abs(im) < 5e-4) return f(re);
    if (Math.abs(re) < 5e-4) return f(im) + "i";
    return `${f(re)}${im < 0 ? "−" : "+"}${f(Math.abs(im))}i`;
  }
  const heat = (v) => {               // -1 rust ... 0 pale ... +1 green
    const a = Math.min(1, Math.abs(v));
    return v >= 0 ? `rgba(31,92,74,${0.06 + 0.55 * a})` : `rgba(181,82,43,${0.06 + 0.55 * a})`;
  };
  const AX = ["X", "Y", "Z"];

  window.renderCorrelation = function (psi) {
    const el = document.getElementById("corrPanel");
    if (!el) return;
    const Cm = QM.coeffMatrix(psi);
    const T = QM.correlationMatrix(psi);
    const conc = QM.concurrence(psi);
    const [s1, s2] = QM.schmidt(psi);
    const entangled = conc > 1e-6;
    const bv = QM.blochVectors(psi);
    const L = QM.localOuter(bv);
    let gap = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) gap = Math.max(gap, Math.abs(T[i][j] - L[i][j]));

    el.innerHTML = `
      <div class="corr-grid">
        <div>
          <div class="corr-title">Coefficient matrix C</div>
          <div class="mgrid mg2"><span></span><span class="mh">q1=0</span><span class="mh">q1=1</span>
            ${Cm.map((row, i) => `<span class="mh">q0=${i}</span>` + row.map((a, j) =>
              `<div class="mcell" style="background:rgba(31,92,74,${0.06 + 0.55 * QM.abs2(a)})" title="amplitude of |${i}${j}⟩">${fmtC(a)}</div>`).join("")).join("")}</div>
          <div class="corr-sub">det C = ${fmtC(QM.detC(psi))}</div>
        </div>
        <div>
          <div class="corr-title">Correlation matrix T &nbsp;<small>⟨σᵢ⊗σⱼ⟩</small></div>
          <div class="mgrid mg3"><span></span>${AX.map((a) => `<span class="mh">${a}₁</span>`).join("")}
            ${T.map((row, i) => `<span class="mh">${AX[i]}₀</span>` + row.map((v, j) => `<div class="mcell" style="background:${heat(v)}" title="⟨σ${AX[i]}⊗σ${AX[j]}⟩ = ${v.toFixed(3)}">${f(v)}</div>`).join("")).join("")}</div>
          <div class="corr-sub">gap from independent guess: ${gap.toFixed(2)}</div>
        </div>
      </div>
      <div class="corr-verdict ${entangled ? "ent" : "prod"}">
        ${entangled
          ? `<b>Entangled</b> — det C ≠ 0, so C can't be split into (qubit 0 part) × (qubit 1 part). Entanglement (concurrence) = <b>${conc.toFixed(2)}</b>; Schmidt weights ${s1.toFixed(2)} / ${s2.toFixed(2)}.`
          : `<b>Not entangled</b> — det C = 0, so C = (qubit 0 amplitudes) × (qubit 1 amplitudes), and T is exactly the product of the two Bloch vectors.`}
      </div>`;
  };
})();
