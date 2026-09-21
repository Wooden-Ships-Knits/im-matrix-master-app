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
  createStyle: (data) =>
    request('/api/styles', { method: 'POST', body: JSON.stringify(data) }),
  updateStyle: (id, data) =>
    request(`/api/styles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStyle: (id) => request(`/api/styles/${id}`, { method: 'DELETE' }),

  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return request(`/api/styles/${id}/image`, { method: 'POST', body: form });
  },
};
