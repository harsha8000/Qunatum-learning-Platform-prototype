"""
Canonical-circuit layer (the "qBraid -> OpenQASM 3" box in the architecture
diagram: one representation, any backend).

For the prototype this builds the circuit once in Qiskit and exports it to
OpenQASM 3, which is the actual interchange format qBraid's transpiler uses
under the hood. Cirq and PennyLane engines below re-parse/re-derive from
this same gate list, so all three engines are guaranteed to see the same
circuit — swap this module for a real `qbraid.transpile(...)` call once you
add the qbraid-sdk dependency, without touching main.py or the engines.
"""
from typing import List
from qiskit import QuantumCircuit
from qiskit import qasm3
from models import Gate


def build_qiskit_circuit(gates: List[Gate], n_qubits: int = 2) -> QuantumCircuit:
    qc = QuantumCircuit(n_qubits)
    for g in gates:
        if g.type == "H":
            qc.h(g.qubit)
        elif g.type == "X":
            qc.x(g.qubit)
        elif g.type == "Y":
            qc.y(g.qubit)
        elif g.type == "Z":
            qc.z(g.qubit)
        elif g.type == "S":
            qc.s(g.qubit)
        elif g.type == "Sdg":
            qc.sdg(g.qubit)
        elif g.type == "T":
            qc.t(g.qubit)
        elif g.type == "Tdg":
            qc.tdg(g.qubit)
        elif g.type == "SX":
            qc.sx(g.qubit)
        elif g.type == "CNOT":
            qc.cx(g.control, g.target)
        elif g.type == "CZ":
            qc.cz(g.control, g.target)
        elif g.type == "SWAP":
            qc.swap(g.control, g.target)
        else:
            raise ValueError(f"Unknown gate type: {g.type}")
    return qc


def to_canonical_qasm3(gates: List[Gate], n_qubits: int = 2) -> str:
    """The canonical form every engine ultimately agrees on."""
    qc = build_qiskit_circuit(gates, n_qubits)
    try:
        return qasm3.dumps(qc)
    except Exception:
        # qasm3 export can fail on very old qiskit versions; canonical form
        # is informational only for the prototype, so degrade gracefully.
        return "// OpenQASM 3 export unavailable in this qiskit version"
