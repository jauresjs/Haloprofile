import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { supabase } from "./lib/supabase.js";
import { requireAuth } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import trainingRouter from "./routes/training.js";
import photosRouter from "./routes/photos.js";
import stripeRouter from "./routes/stripe.js";
import uploadRouter from "./routes/upload.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Rate Limiting ──────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 60,                    // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

// Apply rate limiters
app.use("/api/", apiLimiter);
app.use("/api/stripe/create-checkout", authLimiter);
app.use("/api/stripe/checkout-with-discount", authLimiter);
app.use("/api/photos/generate", authLimiter);

// ─── CORS — restrict to production domain ──────────────────────
const ALLOWED_ORIGINS = [
  "https://haloprofile.art",
  "https://www.haloprofile.art",
  "http://localhost:3000",
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use((req, res, next) => {
  if (req.originalUrl === "/api/stripe/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Serve static files from public/
app.use(express.static("public"));

// Health check
app.get("/health", async (_req, res) => {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error && error.code !== "42P01") {
      console.warn("Supabase check warning:", error.message);
    }
    res.json({ status: "ok", supabase: "connected" });
  } catch (err) {
    res.json({ status: "ok", supabase: "check failed", detail: err.message });
  }
});

// Protected: return current user info
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Auth routes (welcome email, etc.)
app.use("/api/auth", authRouter);

// Upload routes
app.use("/api/upload", uploadRouter);

// Training routes
app.use("/api/training", trainingRouter);

// Photos routes
app.use("/api/photos", photosRouter);

// Stripe routes
app.use("/api/stripe", stripeRouter);

app.listen(PORT, () => {
  console.log(`✨ HaloProfile server listening on http://localhost:${PORT}`);
});






















