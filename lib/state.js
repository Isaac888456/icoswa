export const currentYear = new Date().getFullYear();
export const defaultState = () => ({
  version: 2,
  settings: { association: 'ICOSWA', school: 'Ideal College', monthlyDues: 50, effectiveFrom: `${currentYear}-01`, receiptPrefix: 'ICOSWA', nextReceipt: 1, treasurer: '', rates: [{ effectiveFrom: `${currentYear}-01`, amount: 50 }] },
  teachers: [], payments: [], allocations: [], audit: []
});
export function normalizeState(data) {
  const d = defaultState();
  const state = { ...d, ...(data || {}) };
  state.settings = { ...d.settings, ...(data?.settings || {}) };
  if (!Array.isArray(state.settings.rates) || !state.settings.rates.length) state.settings.rates = [{ effectiveFrom: state.settings.effectiveFrom || `${currentYear}-01`, amount: Number(state.settings.monthlyDues) || 50 }];
  for (const k of ['teachers','payments','allocations','audit']) if (!Array.isArray(state[k])) state[k] = [];
  return state;
}
