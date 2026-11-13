/** Small per-device UI preferences in localStorage (last view, filters, first-run hints). */
const KEY = 'vinyl.ui.v1';
export interface UiState { filter: 'all' | 'favorites' | 'recent'; view: 'room' | 'overhead' | 'detail'; hintsSeen: boolean; showPlayed: boolean }
const defaults: UiState = { filter: 'all', view: 'room', hintsSeen: false, showPlayed: false };
export function loadUi(): UiState {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; }
}
export function saveUi(patch: Partial<UiState>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadUi(), ...patch })); } catch { /* private mode: keep defaults */ }
}
