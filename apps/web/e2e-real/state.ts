import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where the signed-in browser state lives: outside the repo, because it contains tokens. */
export const STATE_PATH = process.env.TASKAPP_E2E_STATE || join(homedir(), '.secrets', 'taskapp-e2e-state.json');
export const E2E_FOLDER = 'ALAI/TaskApp-e2e';
export const E2E_PORT = 5173;
