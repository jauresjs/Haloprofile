import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./lib/supabase.js";
import { requireAuth } from "./middleware/auth.js";
import uploadRouter from "./routes/upload.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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

// Upload routes
app.use("/api/upload", uploadRouter);

// Training routes
import trainingRouter from "./routes/training.js";
app.use("/api/training", trainingRouter);

// Photos routes
import photosRouter from "./routes/photos.js";
app.use("/api/photos", photosRouter);

// Stripe routes
import stripeRouter from "./routes/stripe.js";
app.use("/api/stripe", stripeRouter);

app.listen(PORT, () => {
  console.log(`✨ HaloProfile server listening on http://localhost:${PORT}`);
});






















