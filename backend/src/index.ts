// Load environment variables FIRST - this must be the first import
import "./config/env.js";
import { verifyEnv } from "./config/env.js";
verifyEnv();

import express from "express";
import cors from "cors";

// Import routes (these will now have access to env vars)
import authRoutes from "./routes/auth.routes.js";
import rbacRoutes from "./routes/rbac.routes.js";
import branchRoutes from "./routes/branches.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import customerRoutes from "./routes/customers.routes.js";
import vehicleRoutes from "./routes/vehicles.routes.js";
import packagesRoutes from "./routes/packages.routes.js";
import pricingRoutes from "./routes/pricing.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import jobOrderRoutes from "./routes/joborders.routes.js";
import thirdPartyRepairRoutes from "./routes/thirdpartyrepairs.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import purchaseOrderRoutes from "./routes/purchaseorders.routes.js";
import supplierRoutes from "./routes/suppliers.routes.js";
import supplierProductRoutes from "./routes/supplierproducts.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import serviceReminderRoutes from "./routes/servicereminders.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import staffPerformanceRoutes from "./routes/staffperformance.routes.js";
import reportsRoutes from "./routes/reports.routes.js";

const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());

// Root endpoint
app.get("/", (_req, res) => {
  res.send("Backend Working");
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/rbac", rbacRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/packages", packagesRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/job-orders", jobOrderRoutes);
app.use("/api/third-party-repairs", thirdPartyRepairRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/supplier-products", supplierProductRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/service-reminders", serviceReminderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/staff-performance", staffPerformanceRoutes);
app.use("/api/reports", reportsRoutes);

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
