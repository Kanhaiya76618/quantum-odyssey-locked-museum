"""
Runs the museum's experiments on whatever backend Qollab hands us, and turns
the counts into the numbers each room shows.

One press of Run sends ONE job:
  * local simulators: all 41 circuits in a single backend.run([...])
  * IonQ: one circuit only (that is what IonQ jobs on Qollab accept), so the
    headline experiments are packed side by side into one 29-qubit circuit
    and submitted in IonQ's native gates, which IonQ's compiler cannot
    optimise away.

Public functions (they return JSON strings for JavaScript):
  run_all(backend, shots, scope)   build, run and analyse
  load_recorded()                  runs recorded earlier, shipped with the project
  drawings()                       a text drawing of every circuit
  save_run(payload_json)           offer a run as a downloadable file
  backend_label(backend)           readable backend name
"""

import json
import math
from datetime import datetime, timezone

from qiskit import QuantumCircuit, transpile

from . import experiments as ex

RECORDED_RUNS = "data/recorded_runs.json"
TIMELINE = "data/timeline.json"


# --------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------

def backend_label(backend):
    """Readable backend name, including the IonQ noise model if one is set."""
    name = getattr(backend, "name", None)
    if callable(name):
        name = name()
    name = str(name or type(backend).__name__)
    try:
        noise = getattr(backend.options, "noise_model", None)
        if noise and str(noise).lower() != "ideal":
            name = f"{name} ({noise} noise model)"
    except Exception:
        pass
    return name


def _kind(backend):
    label = (backend_label(backend) + " " + type(backend).__name__).lower()
    if "ionq" in label:
        return "ionq"
    if any(k in label for k in ("fake", "ibm", "aer")):
        return "ibm"
    return "local"


def _ionq_native(backend):
    """
    The same IonQ backend, but taking IonQ's native gates (GPi, GPi2, ZZ/MS).
    IonQ compiles abstract gates itself and optimises away what it can;
    native gates are the documented way past that optimiser, so every gate
    of the experiment really runs and meets the noise model.
    """
    try:
        try:
            opts = dict(backend.options.items())
        except Exception:
            opts = dict(getattr(backend.options, "_fields", {}))
        opts.pop("shots", None)
        native = backend.with_name(backend.name, gateset="native")
        native.set_options(**{k: v for k, v in opts.items() if v is not None})
        client = getattr(backend, "_client", None)
        native._client = client if client is not None else backend.client
        return native
    except Exception as err:
        print(f"Native gates unavailable on this backend ({err}); using IonQ's compiler.")
        return None


def pack(circuits, name="packed"):
    """Place circuits side by side in one wide circuit. Returns (circuit, offsets)."""
    total = sum(c.num_qubits for c in circuits)
    big = QuantumCircuit(total, total, name=name)
    offsets, off = [], 0
    for c in circuits:
        offsets.append(off)
        big.compose(c, qubits=list(range(off, off + c.num_qubits)),
                    clbits=list(range(off, off + c.num_clbits)), inplace=True)
        off += c.num_qubits
    return big, offsets


def _normalise(counts, width):
    """Qiskit bitstrings put qubit 0 last; flip to qubit 0 first."""
    out = {}
    for key, c in counts.items():
        k = str(key).replace(" ", "")
        if k.startswith("0x"):
            k = format(int(k, 16), f"0{width}b")
        k = k.zfill(width)[::-1]
        out[k] = out.get(k, 0) + int(c)
    return out


def select(scope):
    circuits, meta = ex.build_all()
    if scope == "ionq":
        order = {cid: i for i, cid in enumerate(ex.IONQ_PACK)}
        pairs = sorted(((c, m) for c, m in zip(circuits, meta) if m["id"] in order),
                       key=lambda p: order[p[1]["id"]])
        return [p[0] for p in pairs], [p[1] for p in pairs]
    return circuits, meta


def run_all(backend, shots=1000, scope="all"):
    """Run the chosen experiments as ONE job and return the analysed payload as JSON."""
    shots = int(shots)
    kind = _kind(backend)
    if kind == "ionq":
        scope = "ionq"
    circuits, meta = select(scope)
    counts = {}
    gateset = "abstract"

    if kind == "ionq":
        big, offsets = pack(circuits, name="odyssey_pack")
        target = backend
        native = _ionq_native(backend)
        if native is not None:
            try:
                big = transpile(big, backend=native, optimization_level=0)
                target, gateset = native, "native"
            except Exception as err:
                print(f"Could not compile to native gates ({err}); using IonQ's compiler.")
        job = target.run(big, shots=shots)
        wide = _normalise(job.result().get_counts(), sum(c.num_qubits for c in circuits))
        for info, off in zip(meta, offsets):
            part = {}
            for key, c in wide.items():
                k = key[off:off + info["n_qubits"]]
                part[k] = part.get(k, 0) + c
            counts[info["id"]] = part
    else:
        runnable = circuits
        if kind == "ibm":
            # Level 3 picks the device's best qubits even for one-qubit
            # experiments; lower levels can land on a qubit with poor readout.
            runnable = transpile(circuits, backend=backend, optimization_level=3, seed_transpiler=7)
        result = backend.run(runnable, shots=shots).result()
        for i, info in enumerate(meta):
            counts[info["id"]] = _normalise(result.get_counts(i), info["n_qubits"])

    payload = {
        "source": "live",
        "backend": backend_label(backend),
        "shots": shots,
        "n_circuits": len(circuits),
        "scope": scope,
        "gateset": gateset,
        "recorded_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "counts": counts,
    }
    return json.dumps(analyse(payload))


# --------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------

def _total(c):
    return sum(c.values())


def _frac(c, pred):
    n = _total(c)
    return sum(v for k, v in c.items() if pred(k)) / n if n else 0.0


def _wilson(k, n, z=1.96):
    if n == 0:
        return [0.0, 0.0]
    p = k / n
    den = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [max(0.0, mid - half), min(1.0, mid + half)]


def _young(counts):
    free = {p: _frac(counts[f"young_free_{p}"], lambda k: k[0] == "0")
            for p in ex.YOUNG_PHASES if f"young_free_{p}" in counts}
    watch = {p: _frac(counts[f"young_watch_{p}"], lambda k: k[0] == "0")
             for p in ex.YOUNG_PHASES if f"young_watch_{p}" in counts}
    if not free:
        return None

    def visibility(d):
        if 0 not in d or 180 not in d:
            return None
        hi, lo = d[0], d[180]
        return (hi - lo) / (hi + lo) if hi + lo else 0.0

    return {
        "free": {str(k): v for k, v in free.items()},
        "watch": {str(k): v for k, v in watch.items()},
        "visibility": visibility(free),
        "visibility_watch": visibility(watch) if watch else None,
    }


def _bell(counts):
    ids = [f"bell_{a}{b}" for a in (0, 1) for b in (0, 1)]
    if not all(i in counts for i in ids):
        return None
    E, var = {}, 0.0
    for i in ids:
        c = counts[i]
        n = _total(c)
        e = _frac(c, lambda k: k[0] == k[1]) - _frac(c, lambda k: k[0] != k[1])
        E[i[-2:]] = e
        var += (1 - e * e) / n if n else 0.0
    S = E["00"] + E["01"] + E["10"] - E["11"]
    sigma = math.sqrt(var)
    return {
        "E": E,
        "S": S,
        "sigma": sigma,
        "sigmas_above_2": (S - 2) / sigma if sigma else None,
        "win": 0.5 + S / 8,
    }


def _deutsch(counts):
    if not all(f"deutsch_q_{b}" in counts for b in ex.DEUTSCH_BOXES):
        return None
    out = {"quantum": {}, "classical": {}}
    for box, info in ex.DEUTSCH_BOXES.items():
        want = "0" if info["kind"] == "constant" else "1"
        out["quantum"][box] = _frac(counts[f"deutsch_q_{box}"], lambda k: k[0] == want)
        f = {"c0": (0, 0), "c1": (1, 1), "b0": (0, 1), "b1": (1, 0)}[box]
        right = []
        for x in (0, 1):
            cid = f"deutsch_c_{box}_{x}"
            if cid in counts:
                right.append(_frac(counts[cid], lambda k, fx=f[x]: k[1] == str(fx)))
        if len(right) == 2:
            out["classical"][box] = right[0] * right[1]
    q = list(out["quantum"].values())
    out["quantum_avg"] = sum(q) / len(q)
    cl = list(out["classical"].values())
    out["classical_avg"] = sum(cl) / len(cl) if cl else None
    return out


def _teleport(counts):
    fid, ci, alice, relay = {}, {}, {"00": 0, "01": 0, "10": 0, "11": 0}, {}
    for t in ex.TELEPORT_ANGLES:
        c = counts.get(f"teleport_{t}")
        if not c:
            continue
        n = _total(c)
        k = sum(v for key, v in c.items() if key[2] == "0")
        fid[str(t)] = k / n if n else 0.0
        ci[str(t)] = _wilson(k, n)
        for key, v in c.items():
            alice[key[:2]] += v
    for t in ex.TELEPORT_ANGLES:
        r = counts.get(f"relay_{t}")
        if r:
            relay[str(t)] = _frac(r, lambda k: k[1] == "0")
    if not fid:
        return None
    total = sum(alice.values())
    return {
        "fidelity": fid,
        "ci": ci,
        "avg": sum(fid.values()) / len(fid),
        "alice": {k: v / total for k, v in alice.items()} if total else alice,
        "relay": relay,
    }


def _grover(counts):
    found = {m: _frac(counts[f"grover_{m}"], lambda k, m=m: k == m)
             for m in ex.GROVER_MARKS if f"grover_{m}" in counts}
    if not found:
        return None
    return {"found": found, "avg": sum(found.values()) / len(found)}


def analyse(payload):
    c = payload["counts"]
    payload["summary"] = {
        "young": _young(c),
        "bell": _bell(c),
        "deutsch": _deutsch(c),
        "teleport": _teleport(c),
        "grover": _grover(c),
    }
    return payload


# --------------------------------------------------------------------------
# Recorded runs, drawings, saving
# --------------------------------------------------------------------------

def load_recorded():
    """Recorded runs shipped in data/recorded_runs.json, analysed."""
    try:
        with open(RECORDED_RUNS) as fh:
            runs = json.load(fh)
    except (OSError, ValueError):
        return json.dumps([])
    return json.dumps([analyse(r) for r in runs])


def timeline():
    """The 71 milestones and 6 acts of the Quantum Odyssey timeline."""
    try:
        with open(TIMELINE) as fh:
            return fh.read()
    except OSError:
        return json.dumps({"acts": [], "events": []})


def drawings():
    """A text drawing of every circuit, keyed by circuit id."""
    circuits, meta = ex.build_all()
    out = {}
    for qc, info in zip(circuits, meta):
        try:
            out[info["id"]] = str(qc.draw(output="text", fold=-1))
        except Exception:
            out[info["id"]] = str(qc)
    return json.dumps(out)


def save_run(payload_json):
    """Offer a run as a JSON download in the Qollab console."""
    data = json.loads(payload_json)
    keep = ("source", "backend", "shots", "n_circuits", "scope", "gateset", "recorded_at", "counts")
    slim = {k: data[k] for k in keep if k in data}
    slim["source"] = "recorded"
    text = json.dumps(slim, separators=(",", ":"))
    try:
        from js import sendFile
        sendFile("locked_museum_run.json", "application/json", text)
        return "sent"
    except Exception:
        print(text)
        return "printed"
