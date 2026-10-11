# Quantum Odyssey: The Locked Museum

**A museum game where every door can only be opened with quantum mechanics.** Climb a five-floor tower of quantum history, 71 milestones from Snell's law in 1621 to today's race for fault tolerance. The staircase out of every floor is locked by a puzzle that a classical strategy almost never solves: interference, a Bell test, Deutsch's algorithm, teleportation and Grover's search, each running as a real Qiskit circuit.

*This effort is supported by Qollab & IonQ.*

Theme: **Quantum Playground** (a game where superposition, interference, entanglement and measurement are the mechanics, not a source of randomness).

---

## The idea

Most quantum games use a qubit as a fancy coin flip. Here the quantum effect *is* the key. Each lock is a challenge with two strategies side by side: the best classical one and a quantum one. You can try both. The classical strategy almost always fails, and the page tells you exactly how often it would succeed. The quantum one opens the door because of interference, entanglement or teleportation, measured shot by shot.

| Floor | Era | Door | The lock | Best classical odds | Quantum odds (IBM Kingston noise model) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1621–1900 | Young's door, 1801 | Five photons in a row into the dark port | 3.1% (random slit) | 95.6% (interference) |
| 2 | 1900–1949 | Bell's door, 1964 | Win 80 of 100 CHSH rounds | 14.9% (hidden instructions) | 82.4% (entangled pair) |
| 3 | 1950–1979 | Deutsch's door, 1985 | Sort four sealed boxes with four questions | 25% (two asked twice, two guessed) | 97.8% (one quantum question each) |
| 4 | 1980–1993 | Bennett's door, 1993 | Get the key state across ten times in a row | 0.6% (measure and resend) | 86.3% (teleportation) |
| 5 | 1994–today | Grover's door, 1996 | Find the key card in one look, three times in a row | 1.6% (one card) | 93.1% (one Grover search) |

The roof is an observatory that shows this table for whichever data set you pick.

## How to play

1. Open the project in a recent **Chrome, Edge, Brave or Opera** (Safari cannot run Qollab projects yet).
2. Press **Run** and pick a backend in **Select QPU**:
   - **Built-in simulator**: free and instant. All 46 circuits run as one job.
   - **IonQ Forte 1 (remote simulator)**: free; IonQ's noise model of Forte. The circuits behind four doors (Young, Bell, Bennett, Grover) run side by side in **one 29-qubit circuit**, sent in IonQ's native gates; 200 shots take a few minutes. Deutsch's door falls back to a recorded data set, and says so.
   - **IBM noise models**: free; all 46 circuits at 200 shots, simulated in your browser.
3. The museum opens on floor 1. Read the plaques (each one turns blue on the tower), then beat the lock to climb. The **Data set** menu switches between this session's run and recorded runs (`data/recorded_runs.json`), so the game is playable before you run anything. A **visitor's pass** unlocks every floor at once, for judges in a hurry.

## The locks

**Young's door (interference).** One qubit is the photon: Hadamard, phase, Hadamard. Slide the path difference and send photons one at a time; five dark-port hits in a row open the door. The trick is destructive interference at 180°. Switch on the which-path detector (a second qubit copying the path) and interference vanishes: back to 50/50, back to 3%.

**Bell's door (entanglement).** Play 100 rounds of the CHSH game, either with the best hidden instructions (both always answer 0, wins 75% on average) or with an entangled pair measured at 0°/90° and ±45°. Winning 80 is a 1-in-7 fluke classically and routine with entanglement. The page shows the measured CHSH value S.

**Deutsch's door (superposition and interference).** Four sealed boxes, constant or balanced, and a budget of four questions. Classically one box costs two questions, so you must guess at least two. Deutsch's circuit asks about both inputs at once and costs one.

**Bennett's door (teleportation).** The key is a qubit tilted 60°, 90° or 120°. Measure-and-resend loses the tilt (fitting at most 62.5% of the time per try); teleportation, with one entangled pair and two classical bits, carries the state itself. Ten fits in a row open the door.

**Grover's door (amplitude amplification).** The key is under one of four cards. One classical look finds it 25% of the time; one Grover search points straight at it.

## How it works

```
main.js                  connects Qollab's `backend` to the page
museum/experiments.py    the 46 circuits behind the five doors, and the IonQ pack
museum/runner.py         one-job runner, IonQ packing and native gates, analysis, timeline loader
ui/tower.js              the 3D Paper & Ink tower (three.js), clickable floors
ui/locks.js              the five locks, their classical alternatives and their odds
ui/app.js                floors, plaques, navigation, observatory
data/timeline.json       the 71 milestones and 6 acts of the Quantum Odyssey timeline
data/recorded_runs.json  runs recorded earlier, so the museum opens instantly
```

- **One job per run.** On local simulators all 46 circuits go into a single `backend.run([...])`. IonQ jobs on Qollab take one job of **one circuit** per run, so the runner packs 15 experiments side by side into one 29-qubit circuit (the Forte simulator's limit) and splits the bitstrings back apart.
- **Native gates on IonQ.** IonQ compiles abstract gates itself and can optimise an experiment's gates, and their noise, away. The runner transpiles to IonQ's native **GPi, GPi2 and ZZ** gates (checked locally: every packed circuit gives exactly the same ideal output as the original).
- **No mid-circuit measurement.** Teleportation's corrections, and the classical measure-and-resend relay, use controlled gates (the deferred-measurement principle), which gives the same statistics as measuring first.
- **Best qubits on IBM.** IBM noise models are transpiled at optimisation level 3, which puts even one-qubit experiments on the device's best qubits.
- **Odds.** Classical odds are exact (0.5⁵, a binomial tail at p = 0.75, 1/4, the relay's measured or exact success to the tenth power, 1/4³). Quantum odds use the measured shots of each door's circuits. Every lock also shows the exact circuit behind it (Qiskit's text drawing).

## Accessibility

The 3D tower is a visual extra: every floor is also reachable from a list of buttons, and every lock is made of ordinary buttons, sliders and toggles with visible focus and spoken labels. Results are announced in a live region, the 3D canvas is hidden from screen readers, colour never carries meaning on its own (locks and odds are labelled "classical" and "quantum"), auto-rotation stops for people who ask for reduced motion, and the layout works on a phone.

## Replicate and extend

Add a door by adding circuits to `museum/experiments.py`, a summary in `museum/runner.py`, a lock in `ui/locks.js` and a floor in `ui/app.js`. Ideas: a Shor's-algorithm door that factors 15, a quantum-key-distribution door where an eavesdropper trips the alarm, a magic-square door that entangled players win every time.

## Disclosure

- **Starting points:** the 71 milestones (`data/timeline.json`) and the Paper & Ink visual style come from my earlier project **Quantum Odyssey** (github.com/Kanhaiya76618/Quantum-odyssey, MIT), built before this hackathon. Its React and three.js code is not reused; the tower here is new code. During the hackathon I also built an earlier, non-game version of these experiments ("A museum of experiments you can run"); this project reuses its circuits and runner. Everything here was written during the hackathon window (9 to 11 October 2026).
- **AI assistance:** I used an AI assistant (Claude) to help write the code and this page; I designed the game with it, ran it on Qollab and checked the results.
- **Libraries:** Qiskit 2.x (Apache 2.0), three.js (MIT, provided by Qollab), fonts from Google Fonts (OFL).

## License

MIT. See `LICENSE`.

*This effort is supported by Qollab & IonQ.*
