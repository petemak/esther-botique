/**
 * Customer auth state. The session is a server-set httpOnly cookie; we never read it.
 * We just call GET /api/auth/me once and cache the result for the header + guards.
 */
import { api, ApiError } from './api.js';

let cached;
let inflight;

export async function currentUser() {
  if (cached !== undefined) return cached;
  if (!inflight) {
    inflight = api
      .me()
      .then((res) => {
        cached = (res && res.user) || null;
        return cached;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) cached = null;
        else cached = null;
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function setUser(user) {
  cached = user || null;
}

export async function login(email, password) {
  const res = await api.login(email, password);
  cached = (res && res.user) || null;
  return cached;
}

export async function register(body) {
  const res = await api.register(body);
  cached = (res && res.user) || null;
  return cached;
}

export async function logout() {
  try {
    await api.logout();
  } finally {
    cached = null;
  }
}

/** Redirect to sign-in, preserving where the user wanted to go. */
export function requireAuthRedirect() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/account/signin.html?next=${next}`;
}

export async function guardAccountPage() {
  const user = await currentUser();
  if (!user) {
    requireAuthRedirect();
    return null;
  }
  return user;
}
