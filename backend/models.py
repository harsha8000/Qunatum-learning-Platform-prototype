"""Shared request/response schemas."""
from pydantic import BaseModel
from typing import List, Optional, Literal, Dict, Any


# One-qubit gates take `qubit`; two-qubit gates take `control` + `target`
# (CZ and SWAP are symmetric, but the pair is still sent in that shape so the
# frontend and every engine share one gate format).
SINGLE_QUBIT_GATES = ("H", "X", "Y", "Z", "S", "Sdg", "T", "Tdg", "SX")
TWO_QUBIT_GATES = ("CNOT", "CZ", "SWAP")


class Gate(BaseModel):
    type: Literal["H", "X", "Y", "Z", "S", "Sdg", "T", "Tdg", "SX", "CNOT", "CZ", "SWAP"]
    qubit: Optional[int] = None      # one-qubit gates
    control: Optional[int] = None    # two-qubit gates
    target: Optional[int] = None     # two-qubit gates


class CircuitRequest(BaseModel):
    gates: List[Gate]
    shots: int = 200


class TutorRequest(BaseModel):
    question: str
    context: Optional[Dict[str, Any]] = None  # last /api/simulate response, if any
