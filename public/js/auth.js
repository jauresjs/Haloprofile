import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://pluksclbjkerwnbqfsue.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2dVcl2QEUtpLiIEbep5MCg_8FDJq4T2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Returns the current session's access token, or null if not logged in.
 */
export async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/**
 * Fetch wrapper that automatically injects the Authorization: Bearer header.
 * Usage: authFetch("/api/some-protected-route", { method: "POST", body: ... })
 */
export async function authFetch(url, options = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Log in with email and password.
 * Returns { user, session } on success or throws an error.
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Sign up with email and password.
 * Returns { user, session } on success or throws an error.
 */
export async function signup(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Log in with Google OAuth (redirects browser).
 */
export async function loginWithGoogle() {
  // Respect locale: if user is on a /fr/ page, redirect back to French upload
  const isFrench = window.location.pathname.startsWith("/fr/");
  const redirectPath = isFrench ? "/fr/upload.html" : "/upload.html";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${redirectPath}`,
    },
  });
  if (error) throw error;
}

/**
 * Log out the current user.
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Call at the top of every protected page.
 * Redirects to /auth.html if the user is not logged in.
 */
export async function requireLogin() {
  // If there's an error from OAuth, show it so we can debug!
  if (window.location.search.includes("error=") || window.location.hash.includes("error=")) {
    alert("OAuth Error: " + window.location.href);
    console.error("OAuth Error URL:", window.location.href);
    // Don't redirect immediately so user can read the alert/console
    return null;
  }

  // If returning from Google OAuth, wait for Supabase to process the URL tokens
  if (window.location.hash.includes("access_token=") || window.location.search.includes("code=")) {
    return new Promise((resolve) => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          subscription.unsubscribe();
          resolve(session);
        }
      });
      
      // Fallback timeout just in case it fails
      setTimeout(async () => {
        subscription.unsubscribe();
        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          alert("Timeout waiting for session. URL: " + window.location.href);
          window.location.href = "/auth.html";
        }
        resolve(data?.session);
      }, 5000);
    });
  }

  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = "/auth.html";
  }
  return data?.session;
}

/**
 * Updates the user's profile in the profiles table.
 */
export async function updateProfile(updates) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session");

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", session.user.id);

  if (error) throw error;
  return true;
}

/**
 * Fetches the current user's profile.
 */
export async function getProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
  return data;
}
