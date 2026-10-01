import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = path.resolve(__dirname, '../../data/build-status.json');

/** @type {Record<string, string>} */
const DEFAULT_STEPS = {
  baseqv: 'pending',
  anchor: 'pending',
  pharus: 'pending',
  normalization: 'pending',
  anchor_matching: 'pending',
  pharus_matching: 'pending',
  explicit_anchor_legacy: 'pending',
  deduplication: 'pending',
  mecanismos: 'pending',
  reunioes: 'pending',
  financial: 'pending',
  csv_export: 'pending',
};

/**
 * @param {Partial<{ stage: string; progress: number; message: string; steps: Record<string, string> }>} patch
 */
export async function updateBuildStatus(patch) {
  let current = {
    stage: 'idle',
    progress: 0,
    message: '',
    updatedAt: null,
    steps: { ...DEFAULT_STEPS },
  };

  try {
    const raw = await fs.readFile(STATUS_PATH, 'utf8');
    current = { ...current, ...JSON.parse(raw) };
  } catch {
    // fresh file
  }

  const next = {
    ...current,
    ...patch,
    steps: { ...DEFAULT_STEPS, ...current.steps, ...(patch.steps ?? {}) },
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true });
  await fs.writeFile(STATUS_PATH, JSON.stringify(next, null, 2), 'utf8');
}

export async function resetBuildStatus() {
  await updateBuildStatus({
    stage: 'starting',
    progress: 0,
    message: 'Iniciando construção da base',
    steps: Object.fromEntries(Object.keys(DEFAULT_STEPS).map((k) => [k, 'pending'])),
  });
}

/**
 * @param {string} stepKey
 * @param {'pending' | 'processing' | 'completed' | 'error'} status
 * @param {{ stage?: string; progress?: number; message?: string }} [meta]
 */
export async function setStep(stepKey, status, meta = {}) {
  await updateBuildStatus({
    stage: meta.stage ?? stepKey,
    progress: meta.progress,
    message: meta.message,
    steps: { [stepKey]: status },
  });
}
