// Load environment variables FIRST - this must be the first import
import "./config/env.js";

import express from "express";
import cors from "cors";

// Import routes (these will now have access to env vars)
import authRoutes from "./auth/auth.routes.js";
import rbacRoutes from "./rbac/rbac.routes.js";
import branchRoutes from "./routes/branches.routes.js";
import auditRoutes from "./audit/audit.routes.js";

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));

app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/rbac", rbacRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/audit", auditRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Export app for Vercel serverless deployment
export default app;

// Only start listening when not in Vercel (local dev)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}
