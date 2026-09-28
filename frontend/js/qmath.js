/* =========================================================================
   qmath.js — the single, tiny reference implementation of the quantum math
   used everywhere on the site (lessons, Bloch spheres, probability bars,
   Correlation Space). It is plain complex linear algebra, so a learner can
   read every line.  After each backend run, verifyAgainstBackend() checks
   that Qiskit and this file agree — that is how we know the pictures are true.

   CONVENTION (important): basis states are written |q0 q1>, qubit 0 on the
   LEFT.  Index = 2*q0 + q1.  Qiskit uses the opposite order (q1 q0), so
   backend results are converted with fromQiskitIndex().
   ========================================================================= */
const QM = (() => {
  const C = (re, im = 0) => [re, im];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const conj = (a) => [a[0], -a[1]];
  const abs2 = (a) => a[0] * a[0] + a[1] * a[1];
  const scale = (a, k) => [a[0] * k, a[1] * k];
  const R2 = Math.SQRT1_2;

  /* single-qubit gates as 2x2 complex matrices */
  const GATES = {
    H: [[C(R2), C(R2)], [C(R2), C(-R2)]],
    X: [[C(0), C(1)], [C(1), C(0)]],
    Y: [[C(0), C(0, -1)], [C(0, 1), C(0)]],
    Z: [[C(1), C(0)], [C(0), C(-1)]],
    S: [[C(1), C(0)], [C(0), C(0, 1)]],
    Sdg: [[C(1), C(0)], [C(0), C(0, -1)]],
    T: [[C(1), C(0)], [C(0), C(R2, R2)]],
    Tdg: [[C(1), C(0)], [C(0), C(R2, -R2)]],
    SX: [[C(0.5, 0.5), C(0.5, -0.5)], [C(0.5, -0.5), C(0.5, 0.5)]],   // √X
    I: [[C(1), C(0)], [C(0), C(1)]],
  };
  const TWO_QUBIT = ["CNOT", "CZ", "SWAP"];

  /* ---------- 2x2 helpers ---------- */
  const dagger = (U) => [[conj(U[0][0]), conj(U[1][0])], [conj(U[0][1]), conj(U[1][1])]];
  function matMul2(A, B) {
    const R = [[C(0), C(0)], [C(0), C(0)]];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++) R[i][j] = add(R[i][j], mul(A[i][k], B[k][j]));
    return R;
  }
  const isIdentity = (M, tol = 1e-9) =>
    [0, 1].every((i) => [0, 1].every((j) =>
      Math.abs(M[i][j][0] - (i === j ? 1 : 0)) < tol && Math.abs(M[i][j][1]) < tol));
  const isUnitary = (U) => isIdentity(matMul2(dagger(U), U));

  /* ---------- states ---------- */
  const ket = (alpha, beta) => [alpha, beta];
  const norm2 = (v) => v.reduce((s, a) => s + abs2(a), 0);
  /* inner product <a|b> : conjugate the first, multiply, sum */
  const inner = (a, b) => a.reduce((s, x, i) => add(s, mul(conj(x), b[i])), C(0));
  /* state from Bloch angles: cos(θ/2)|0> + e^{iφ} sin(θ/2)|1> */
  const fromAngles = (theta, phi) =>
    [C(Math.cos(theta / 2)), [Math.sin(theta / 2) * Math.cos(phi), Math.sin(theta / 2) * Math.sin(phi)]];
  const applyGate1 = (U, v) => [
    add(mul(U[0][0], v[0]), mul(U[0][1], v[1])),
    add(mul(U[1][0], v[0]), mul(U[1][1], v[1])),
  ];
  /* single-qubit state -> Bloch vector (pure state formulas) */
  function blochOfKet(v) {
    const [a, b] = v;
    const ab = mul(conj(a), b);
    return { x: 2 * ab[0], y: 2 * ab[1], z: abs2(a) - abs2(b) };
  }

  /* ---------- two-qubit simulation ---------- */
  function apply1(psi, U, q) {            // q = 0 acts on the left bit
    const out = psi.map((a) => a);
    for (let i = 0; i < 4; i++) {
      const bit = q === 0 ? (i >> 1) & 1 : i & 1;
      if (bit === 1) continue;            // handle each pair (bit=0, bit=1) once
      const j = q === 0 ? i | 2 : i | 1;
      out[i] = add(mul(U[0][0], psi[i]), mul(U[0][1], psi[j]));
      out[j] = add(mul(U[1][0], psi[i]), mul(U[1][1], psi[j]));
    }
    return out;
  }
  function applyCNOT(psi, control, target) {
    const out = psi.map((a) => a);
    for (let i = 0; i < 4; i++) {
      const c = control === 0 ? (i >> 1) & 1 : i & 1;
      if (!c) continue;
      const j = target === 0 ? i ^ 2 : i ^ 1;
      out[j] = psi[i];
    }
    return out;
  }
  /* CZ: flip the sign of |11>. Symmetric, so control/target order doesn't matter. */
  function applyCZ(psi) {
    const out = psi.map((a) => a);
    out[3] = scale(psi[3], -1);
    return out;
  }
  /* SWAP: exchange the amplitudes of |01> and |10>. */
  function applySWAP(psi) {
    const out = psi.map((a) => a);
    out[1] = psi[2]; out[2] = psi[1];
    return out;
  }
  function simulate(gateList) {
    let psi = [C(1), C(0), C(0), C(0)];   // |00>
    for (const g of gateList) {
      if (g.type === "CNOT") psi = applyCNOT(psi, g.control, g.target);
      else if (g.type === "CZ") psi = applyCZ(psi);
      else if (g.type === "SWAP") psi = applySWAP(psi);
      else psi = apply1(psi, GATES[g.type], g.qubit);
    }
    return psi;
  }

  const LABELS = ["00", "01", "10", "11"];  // |q0 q1>
  const probabilities = (psi) => Object.fromEntries(LABELS.map((l, i) => [l, abs2(psi[i])]));

  /* reduced 2x2 density matrix of qubit q (trace out the other) */
  function reduced(psi, q) {
    const rho = [[C(0), C(0)], [C(0), C(0)]];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let o = 0; o < 2; o++) {
      const ia = q === 0 ? a * 2 + o : o * 2 + a;
      const ib = q === 0 ? b * 2 + o : o * 2 + b;
      rho[a][b] = add(rho[a][b], mul(psi[ia], conj(psi[ib])));
    }
    return rho;
  }
  function blochOfRho(rho) {
    return { x: 2 * rho[0][1][0], y: -2 * rho[0][1][1], z: rho[0][0][0] - rho[1][1][0] };
  }
  const blochVectors = (psi) => [blochOfRho(reduced(psi, 0)), blochOfRho(reduced(psi, 1))];
  const purityOf = (b) => (1 + b.x * b.x + b.y * b.y + b.z * b.z) / 2;

  /* ---------- entanglement in "matrix form" ---------- */
  /* Coefficient matrix: |ψ> = Σ C[i][j] |i j>.  Rows = qubit 0, columns = qubit 1.
     Product state  <=>  C has rank 1  <=>  det C = 0. */
  const coeffMatrix = (psi) => [[psi[0], psi[1]], [psi[2], psi[3]]];
  const detC = (psi) => add(mul(psi[0], psi[3]), scale(mul(psi[1], psi[2]), -1));
  const concurrence = (psi) => 2 * Math.sqrt(abs2(detC(psi)));
  /* Schmidt coefficients = singular values of C */
  function schmidt(psi) {
    const c = Math.min(1, concurrence(psi));
    const r = Math.sqrt(Math.max(0, 1 - c * c));
    return [Math.sqrt((1 + r) / 2), Math.sqrt((1 - r) / 2)];
  }
  /* Correlation Space: T[i][j] = <ψ| σi ⊗ σj |ψ>, i,j ∈ {X,Y,Z}.
     For a product state T = a bᵀ (the two Bloch vectors multiplied).
     Anything beyond that is correlation that no local description contains. */
  function correlationMatrix(psi) {
    const P = [GATES.X, GATES.Y, GATES.Z];
    const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const phi = apply1(apply1(psi, P[i], 0), P[j], 1);
      T[i][j] = inner(psi, phi)[0];
    }
    return T;
  }
  const localOuter = (b) => {           // a bᵀ built from the two Bloch vectors
    const [a, c] = [b[0], b[1]], A = [a.x, a.y, a.z], B = [c.x, c.y, c.z];
    return A.map((ai) => B.map((bj) => ai * bj));
  };

  /* ---------- verification against the backend ---------- */
  const fromQiskitIndex = (i) => ((i & 1) << 1) | ((i >> 1) & 1);
  const flipKey = (k) => k.split("").reverse().join("");     // "01" (q1q0) -> "10" (q0q1)

  function verifyAgainstBackend(gateList, data, tol = 1e-6) {
    const psi = simulate(gateList);
    const problems = [];
    const mine = probabilities(psi);
    for (const [k, p] of Object.entries(data.probabilities || {})) {
      const key = flipKey(k);
      if (Math.abs(p - mine[key]) > tol) problems.push(`P(${key}) backend ${p.toFixed(4)} vs local ${mine[key].toFixed(4)}`);
    }
    const bv = blochVectors(psi);
    (data.bloch_vectors || []).forEach((b, q) => {
      ["x", "y", "z"].forEach((a) => {
        if (Math.abs(b[a] - bv[q][a]) > tol) problems.push(`qubit ${q} Bloch ${a}: backend ${b[a].toFixed(4)} vs local ${bv[q][a].toFixed(4)}`);
      });
    });
    return { ok: problems.length === 0, problems, psi };
  }

  return {
    C, add, mul, conj, abs2, GATES, TWO_QUBIT, dagger, matMul2, isUnitary, isIdentity,
    ket, norm2, inner, fromAngles, applyGate1, blochOfKet,
    simulate, probabilities, reduced, blochVectors, purityOf, LABELS,
    coeffMatrix, detC, concurrence, schmidt, correlationMatrix, localOuter,
    fromQiskitIndex, flipKey, verifyAgainstBackend,
  };
})();
window.QM = QM;
