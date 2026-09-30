async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  meta: () => request('/api/meta'),
  addMeta: (type, name) =>
    request(`/api/meta/${type}`, { method: 'POST', body: JSON.stringify({ name }) }),

  listStyles: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null));
    return request(`/api/styles?${qs}`);
  },
  getStyle: (id) => request(`/api/styles/${id}`),
  costing: (id) => request(`/api/styles/${id}/costing`),

  // The same garment in other seasons, and the links that say so.
  related: (id) => request(`/api/styles/${id}/related`),
  linkStyle: (id, styleId) =>
    request(`/api/styles/${id}/link`, {
      method: 'POST', body: JSON.stringify({ style_id: styleId }),
    }),
  unlinkStyle: (id) => request(`/api/styles/${id}/unlink`, { method: 'POST' }),
  createStyle: (data) =>
    request('/api/styles', { method: 'POST', body: JSON.stringify(data) }),
  updateStyle: (id, data) =>
    request(`/api/styles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStyle: (id) => request(`/api/styles/${id}`, { method: 'DELETE' }),

  // Matrix Master: what the garment is, and how the sheet is laid out.
  matrixFields: () => request('/api/matrix/fields'),
  yarnCodes: () => request('/api/matrix/yarn-codes'),
  markColorway: (styleId, color, mark) =>
    request(`/api/matrix/${styleId}/colorway`, {
      method: 'PATCH', body: JSON.stringify({ color, mark }),
    }),
  addColorway: (styleId, color) =>
    request(`/api/matrix/${styleId}/colorway`, {
      method: 'POST', body: JSON.stringify({ color }),
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
  deleteReport: (id) =>
    fetch(`/api/reports/${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
    }),

  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return request(`/api/styles/${id}/image`, { method: 'POST', body: form });
  },
};
