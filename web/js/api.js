export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const message = data.error || data.detail || 'Request failed';
    throw new Error(typeof message === 'string' ? message : 'Request failed');
  }
  return data;
}
