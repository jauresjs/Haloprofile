import { supabase } from "../lib/supabase.js";

/**
 * requireAuth middleware
 * Reads Bearer token from Authorization header, validates it with Supabase Auth,
 * and attaches the user object to req.user.
 * Returns 401 if token is missing or invalid.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = data.user;
  next();
}
