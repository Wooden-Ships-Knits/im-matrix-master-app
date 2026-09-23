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

  // The printed review sheet: styles grouped by collection.
  matrix: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null));
    return request(`/api/styles/matrix?${qs}`);
  },

  // One row per garment: the seasons it ran in, under whatever names.
  lookup: (q) => request(`/api/styles/lookup?q=${encodeURIComponent(q || '')}`),

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
