"""Qiskit Aer engine — exact statevector simulation, no aer install needed
(uses qiskit.quantum_info.Statevector directly)."""
from typing import List
import numpy as np
from qiskit.quantum_info import Statevector, DensityMatrix, partial_trace, Pauli
from circuit_canon import build_qiskit_circuit
from models import Gate


def _bloch_vector_and_purity(rho: DensityMatrix):
    x = np.real(np.trace(rho.data @ Pauli("X").to_matrix()))
    y = np.real(np.trace(rho.data @ Pauli("Y").to_matrix()))
    z = np.real(np.trace(rho.data @ Pauli("Z").to_matrix()))
    r2 = x * x + y * y + z * z
    purity = float((1 + r2) / 2)
    return {"x": float(x), "y": float(y), "z": float(z)}, purity


def run(gates: List[Gate], shots: int = 200) -> dict:
    qc = build_qiskit_circuit(gates, n_qubits=2)
    sv = Statevector.from_instruction(qc)

    rho0 = partial_trace(sv, [1])
    rho1 = partial_trace(sv, [0])
    bv0, pur0 = _bloch_vector_and_purity(rho0)
    bv1, pur1 = _bloch_vector_and_purity(rho1)

    probs = sv.probabilities_dict()
    outcomes = list(probs.keys())
    weights = list(probs.values())
    samples = np.random.choice(outcomes, size=shots, p=weights)
    counts = {o: int((samples == o).sum()) for o in outcomes}

    return {
        "engine": "qiskit",
        "statevector": [{"re": c.real, "im": c.imag} for c in sv.data],
        "probabilities": probs,
        "counts": counts,
        "bloch_vectors": [bv0, bv1],
        "purities": [pur0, pur1],
    }
