import { readSession, writeSession, SESSION_EXPIRED } from './session.js';

async function request(url, options = {}) {
  // Every call carries the session if there is one. The server decides what
  // it is allowed to do — this only saves it having to ask.
  const token = readSession()?.token;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  // A 401 anywhere but the sign-in call itself means the token we sent is
  // expired or no longer valid — the password may have changed under us. Drop
  // it and tell the app, so it puts the login screen back instead of leaving
  // a page that looks signed in and refuses every change.
  //
  // /api/auth/ is excluded because a wrong password is a 401 too, and
  // "your session expired" is the wrong thing to say to someone mistyping it.
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    writeSession(null);
    try { window.dispatchEvent(new Event(SESSION_EXPIRED)); } catch { /* no window */ }
    throw new Error('Your session has expired — please sign in again');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  // 204 has no body, and asking for one throws. Handled here so a route that
  // returns nothing cannot tempt the next caller into its own bare fetch.
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // One password for the team, or no password and read-only.
  health: () => request('/api/health'),
  login: (password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  guest: () => request('/api/auth/guest', { method: 'POST' }),

  meta: () => request('/api/meta'),
  // `season` is only read when type is 'collection': a collection belongs to a
  // season, and the table has required that all along.
  addMeta: (type, name, season = null) =>
    request(`/api/meta/${type}`, {
      method: 'POST', body: JSON.stringify(season ? { name, season } : { name }),
    }),

  listStyles: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null));
    return request(`/api/styles?${qs}`);
  },
  getStyle: (id) => request(`/api/styles/${id}`),
  // Every name this style and its colourways have gone by.
  nameHistory: (id) => request(`/api/styles/${id}/names`),
  costing: (id) => request(`/api/styles/${id}/costing`),

  // The same garment in other seasons, and the links that say so.
  related: (id) => request(`/api/styles/${id}/related`),
  linkStyle: (id, styleId) =>
    request(`/api/styles/${id}/link`, {
      method: 'POST', body: JSON.stringify({ style_id: styleId }),
    }),
  unlinkStyle: (id) => request(`/api/styles/${id}/unlink`, { method: 'POST' }),
  // Copy an existing style into a season as the same garment. `id` is the
  // style being imported FROM; the copy comes back.
  importStyle: (id, data) =>
    request(`/api/styles/${id}/import`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  createStyle: (data) =>
    request('/api/styles', { method: 'POST', body: JSON.stringify(data) }),
  updateStyle: (id, data) =>
    request(`/api/styles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStyle: (id) => request(`/api/styles/${id}`, { method: 'DELETE' }),

  // Matrix Master: what the garment is, and how the sheet is laid out.
  matrixFields: () => request('/api/matrix/fields'),
  yarnCodes: () => request('/api/matrix/yarn-codes'),
  colorwayTags: () => request('/api/matrix/colorway-tags'),
  // The design sheets: which yarn sits in each knit slot, per colourway.
  // Where the C1/C2/C3 markers sit on a style's photo. The whole map goes
  // at once: dragging one is a change to the arrangement, not to a field.
  setDesignMarks: (styleId, marks) =>
    request(`/api/matrix/design/${styleId}/marks`, {
      method: 'PUT', body: JSON.stringify({ marks }),
    }),
  design: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null));
    return request(`/api/matrix/design?${qs}`);
  },
  markColorway: (styleId, color, mark) =>
    request(`/api/matrix/${styleId}/colorway`, {
      method: 'PATCH', body: JSON.stringify({ color, mark }),
    }),
  // `zone` is the band it lands in — there is an add button under each.
  addColorway: (styleId, color, zone = 'main') =>
    request(`/api/matrix/${styleId}/colorway`, {
      method: 'POST', body: JSON.stringify({ color, zone }),
    }),
  deleteColorway: (styleId, color) =>
    request(`/api/matrix/${styleId}/colorway?color=${encodeURIComponent(color)}`,
      { method: 'DELETE' }),
  renameColorway: (styleId, color, name) =>
    request(`/api/matrix/${styleId}/colorway`, {
      method: 'PATCH', body: JSON.stringify({ color, name }),
    }),
  highlightColorway: (styleId, color, highlight) =>
    request(`/api/matrix/${styleId}/colorway`, {
      method: 'PATCH', body: JSON.stringify({ color, highlight }),
    }),
  updateMatrix: (styleId, fields) =>
    request(`/api/matrix/${styleId}`, {
      method: 'PATCH', body: JSON.stringify(fields),
    }),
  // The whole block is sent, first to last, so the server never has to work
  // out what the screen meant by "third".
  setMatrixOrder: (styleIds, clear = false) =>
    request('/api/matrix/order', {
      method: 'POST', body: JSON.stringify({ style_ids: styleIds, clear }),
    }),

  // The Color Table: the yarn colours as a swatch board, grouped by palette.
  colorTable: () => request('/api/colors'),
  colorStyles: (colorId) => request(`/api/colors/${colorId}/styles`),
  updateYarnColor: (colorId, fields) =>
    request(`/api/colors/${colorId}`, {
      method: 'PATCH', body: JSON.stringify(fields),
    }),
  createPalette: (name) =>
    request('/api/colors/palettes', {
      method: 'POST', body: JSON.stringify({ name }),
    }),
  // The import's open questions, and the answer to one. Confirming writes an
  // alias, so the next import places that row by itself.
  colorReview: (status = 'open') =>
    request(`/api/colors/review?status=${encodeURIComponent(status)}`),
  answerReview: (itemId, payload) =>
    request(`/api/colors/review/${itemId}`, {
      method: 'POST', body: JSON.stringify(payload),
    }),

  // Changes people propose: kilos of one colour covering another's
  // shortage, and yarn swaps per colourway. Neither touches the BOM.
  colorChanges: () => request('/api/colors/changes'),
  colorChangeHistory: () => request('/api/colors/changes/history'),
  colorColorways: (colorId) => request(`/api/colors/${colorId}/colorways`),
  colorCandidates: (colorId) => request(`/api/colors/${colorId}/candidates`),
  saveColorSub: (payload) =>
    request('/api/colors/subs', { method: 'POST', body: JSON.stringify(payload) }),
  withdrawColorSub: (id) =>
    request(`/api/colors/subs/${id}`, { method: 'DELETE' }),
  saveProposal: (payload) =>
    request('/api/colors/proposals', { method: 'POST', body: JSON.stringify(payload) }),
  withdrawProposal: (id) =>
    request(`/api/colors/proposals/${id}`, { method: 'DELETE' }),

  // CSAT — the Color Sequence Adjustment Table: colours laid out freely on
  // shared pages to compare them. Positions only.
  csatPages: () => request('/api/colors/csat'),
  csatPage: (name) => request(`/api/colors/csat/${name}`),
  saveCsat: (name, payload) =>
    request(`/api/colors/csat/${name}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCsat: (name) =>
    request(`/api/colors/csat/${name}`, { method: 'DELETE' }),

  // The operator's preparation checklist, read as a grid for a whole season.
  checklistSteps: () => request('/api/checklist/steps'),
  checklist: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null));
    return request(`/api/checklist?${qs}`);
  },
  setStep: (styleId, step, done, doneBy) =>
    request(`/api/checklist/${styleId}`, {
      method: 'POST',
      body: JSON.stringify({ step, done, done_by: doneBy }),
    }),

  // The printed review sheet: styles grouped by collection.
  matrix: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null));
    return request(`/api/styles/matrix?${qs}`);
  },

  // Place a style's colourways: which band each sits in, and in what order.
  arrangeColorways: (styleId, colorways) =>
    request(`/api/matrix/${styleId}/colorways/arrange`, {
      method: 'POST', body: JSON.stringify({ colorways }),
    }),

  // One row per garment: the seasons it ran in, under whatever names.
  lookup: (q) => request(`/api/styles/lookup?q=${encodeURIComponent(q || '')}`),

  // Ask Salesforce and Shopify for a window and store what comes back.
  // Both are live calls, so this can take a while.
  fetchSales: (season, start_date, end_date) =>
    request('/api/sales/fetch', {
      method: 'POST',
      body: JSON.stringify({ season, start_date, end_date }),
    }),

  // Which sales windows have been loaded.
  salesPeriods: (season) =>
    request(`/api/sales/periods${season ? `?season=${encodeURIComponent(season)}` : ''}`),

  // Reports: prepared, submitted, then approved or sent back.
  listReports: (status) =>
    request(`/api/reports${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  createReport: (data) =>
    request('/api/reports', { method: 'POST', body: JSON.stringify(data) }),
  updateReport: (id, data) =>
    request(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setReportStatus: (id, status, extra = {}) =>
    request(`/api/reports/${id}/status`, {
      method: 'POST', body: JSON.stringify({ status, ...extra }),
    }),
  // Through request(), like everything else. It used to call fetch directly
  // and so sent no Authorization header at all — the guard on writes refused
  // it every time, for everyone, which looked like a broken button rather
  // than a missing token.
  deleteReport: (id) => request(`/api/reports/${id}`, { method: 'DELETE' }),

  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return request(`/api/styles/${id}/image`, { method: 'POST', body: form });
  },
};
