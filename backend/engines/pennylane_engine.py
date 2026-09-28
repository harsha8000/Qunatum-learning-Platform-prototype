"""
PennyLane engine — same gate list, run on PennyLane's default.qubit device.
Optional dependency, only imported when selected (?backend=pennylane).
Install with: pip install pennylane
"""
from typing import List
import numpy as np
from models import Gate


def run(gates: List[Gate], shots: int = 200) -> dict:
    import pennylane as qml

    dev = qml.device("default.qubit", wires=2)

    one_qubit = {
        "H": qml.Hadamard, "X": qml.PauliX, "Y": qml.PauliY, "Z": qml.PauliZ,
        "S": qml.S, "Sdg": lambda wires: qml.adjoint(qml.S)(wires=wires),
        "T": qml.T, "Tdg": lambda wires: qml.adjoint(qml.T)(wires=wires),
        "SX": qml.SX,
    }
    two_qubit = {"CNOT": qml.CNOT, "CZ": qml.CZ, "SWAP": qml.SWAP}

    @qml.qnode(dev)
    def circuit():
        for g in gates:
            if g.type in one_qubit:
                one_qubit[g.type](wires=g.qubit)
            elif g.type in two_qubit:
                two_qubit[g.type](wires=[g.control, g.target])
        return qml.state()

    sv = np.array(circuit())

    probs = {}
    for i, amp in enumerate(sv):
        bits = format(i, "02b")
        p = float(np.abs(amp) ** 2)
        if p > 1e-12:
            probs[bits] = probs.get(bits, 0.0) + p

    outcomes = list(probs.keys())
    weights = list(probs.values())
    samples = np.random.choice(outcomes, size=shots, p=weights) if outcomes else []
    counts = {o: int((np.array(samples) == o).sum()) for o in outcomes}

    return {
        "engine": "pennylane",
        "statevector": [{"re": float(c.real), "im": float(c.imag)} for c in sv],
        "probabilities": probs,
        "counts": counts,
        "bloch_vectors": None,
        "purities": None,
    }
