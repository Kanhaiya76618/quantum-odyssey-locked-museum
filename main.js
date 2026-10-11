// Quantum Odyssey: The Locked Museum. Qollab entry point.
//
// The circuits live in Python (museum/), the game lives in ui/. This file
// connects the two and hands the page the backend chosen in Select QPU.
// `backend` is created by Qollab before this file runs.
import { start } from './ui/app.js';
import * as runner from 'museum.runner';

const label = String(await runner.backend_label.callPromising(backend));
const lower = label.toLowerCase();
const isIonQ = lower.includes('ionq');
const isIBM = lower.includes('fake') || lower.includes('ibm') || lower.includes('aer');

const bridge = {
  backendName: label,
  // Real IonQ hardware spends credits: never send a job without a click.
  isHardware: isIonQ && lower.includes('qpu'),
  // IonQ accepts one job per press of Qollab's Run button.
  oneJob: isIonQ,
  // The job goes out while the run starts up, as Qollab expects.
  autoScope: isIonQ && lower.includes('qpu') ? null : (isIonQ ? 'ionq' : 'all'),
  // IonQ simulates every shot separately; IBM noise models run in the browser.
  defaultShots: isIonQ || isIBM ? 200 : 1000,
  // Runs on noisy backends are worth keeping: offer them as a file at once.
  autoSave: isIonQ || isIBM,

  async run(scope, shots) {
    return JSON.parse(String(await runner.run_all.callPromising(backend, shots, scope)));
  },
  async recorded() {
    return JSON.parse(String(await runner.load_recorded.callPromising()));
  },
  async drawings() {
    return JSON.parse(String(await runner.drawings.callPromising()));
  },
  async timeline() {
    return JSON.parse(String(await runner.timeline.callPromising()));
  },
  async save(run) {
    return String(await runner.save_run.callPromising(JSON.stringify(run)));
  },
};

await start(document.getElementById('app'), bridge);
