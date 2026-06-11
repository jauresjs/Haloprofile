import jwt from "jsonwebtoken";

const getSecret = () => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("ADMIN_PASSWORD not set in .env");
    return null;
  }
  return password + ":haloprofile-admin-secret-salt";
};

/**
 * requireAdmin middleware
 * Reads Bearer token from Authorization header, validates it as a JWT
 * signed with the admin password. Returns 401 if invalid.
 */
export async function requireAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.split(" ")[1];
  const secret = getSecret();
  if (!secret) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.admin = decoded; // { role: 'admin' }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}
