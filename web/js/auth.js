import { api } from './api.js';

let sessionUser = null;

export function getSessionUser() {
  return sessionUser;
}

export function setSessionUser(user) {
  sessionUser = user;
}

export async function refreshSession() {
  try {
    const data = await api('/api/auth/me');
    sessionUser = data.authenticated ? data.user : null;
  } catch {
    sessionUser = null;
  }
  return sessionUser;
}

export async function requestOtp(email) {
  return api('/api/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyOtp(email, code) {
  const data = await api('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  sessionUser = data.user;
  return sessionUser;
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  sessionUser = null;
}

export function ensureSignedIn(openAuthDialog) {
  if (sessionUser) return Promise.resolve(sessionUser);
  return openAuthDialog();
}
