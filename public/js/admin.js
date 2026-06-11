/**
 * Admin JS Module
 * Handles authentication and API calls for the admin panel.
 */

const ADMIN_API = "/api/admin";
const TOKEN_KEY = "haloprofile_admin_token";

/**
 * Store the admin JWT token.
 */
export function setAdminToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

/**
 * Retrieve the stored admin JWT token.
 */
export function getAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Remove the stored admin JWT token (logout).
 */
export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Login with admin password.
 * @param {string} password
 * @returns {Promise<{token: string}>}
 */
export async function loginAdmin(password) {
  const res = await fetch(`${ADMIN_API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Invalid password" }));
    throw new Error(err.error || "Login failed");
  }

  const data = await res.json();
  if (data.token) {
    setAdminToken(data.token);
  }
  return data;
}

/**
 * Make an authenticated admin API request.
 * Automatically includes the Bearer token and handles 401 redirects.
 * @param {string} url - relative API path (e.g., "/stats")
 * @param {object} [options] - fetch options
 * @returns {Promise<any>}
 */
export async function adminFetch(url, options = {}) {
  const token = getAdminToken();
  if (!token) {
    window.location.href = "/admin.html";
    throw new Error("Not authenticated");
  }

  const res = await fetch(`${ADMIN_API}${url}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    clearAdminToken();
    window.location.href = "/admin.html";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Logout: clear token and redirect to login.
 */
export function logoutAdmin() {
  clearAdminToken();
  window.location.href = "/admin.html";
}
