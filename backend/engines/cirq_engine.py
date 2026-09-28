"""
Cirq engine — same gate list, run through Cirq's simulator instead of
Qiskit, so the platform can show "the same circuit, identical result,
different SDK" as promised in the architecture diagram.

Optional dependency: only imported when this engine is actually selected
(?backend=cirq), so the prototype still runs with just qiskit installed.
Install with: pip install cirq
"""
from typing import List
import numpy as np
from models import Gate


def run(gates: List[Gate], shots: int = 200) -> dict:
    import cirq  # local import: optional dependency

    q0, q1 = cirq.LineQubit.range(2)
    wire = (q0, q1)
    one_qubit = {
        "H": cirq.H, "X": cirq.X, "Y": cirq.Y, "Z": cirq.Z,
        "S": cirq.S, "Sdg": cirq.S ** -1,
        "T": cirq.T, "Tdg": cirq.T ** -1,
        "SX": cirq.X ** 0.5,
    }
    two_qubit = {"CNOT": cirq.CNOT, "CZ": cirq.CZ, "SWAP": cirq.SWAP}
    circuit = cirq.Circuit()
    for g in gates:
        if g.type in one_qubit:
            circuit.append(one_qubit[g.type](wire[g.qubit]))
        elif g.type in two_qubit:
            circuit.append(two_qubit[g.type](wire[g.control], wire[g.target]))

    sim = cirq.Simulator()
    result = sim.simulate(circuit)
    sv = result.final_state_vector  # same ordering convention issue qBraid's
    # canonical layer exists to resolve — Cirq's qubit ordering is the
    # reverse of Qiskit's, which is exactly the "backend-specific quirk"
    # the OpenQASM 3 canonical layer is there to iron out for the frontend.

    n = 2
    dm = np.outer(sv, np.conj(sv))
    probs = {}
    for i, amp in enumerate(sv):
        bits = format(i, f"0{n}b")
        p = float(np.abs(amp) ** 2)
        if p > 1e-12:
            probs[bits] = probs.get(bits, 0.0) + p

    outcomes = list(probs.keys())
    weights = list(probs.values())
    samples = np.random.choice(outcomes, size=shots, p=weights) if outcomes else []
    counts = {o: int((np.array(samples) == o).sum()) for o in outcomes}

    return {
        "engine": "cirq",
        "statevector": [{"re": float(c.real), "im": float(c.imag)} for c in sv],
        "probabilities": probs,
        "counts": counts,
        # Bloch vectors / purity are intentionally left to the Qiskit engine
        # in this prototype; wire up cirq's DensityMatrixTrialResult /
        # partial-trace helpers here to fill these in for real.
        "bloch_vectors": None,
        "purities": None,
    }
