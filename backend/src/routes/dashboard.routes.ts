import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// All dashboard routes require authentication
router.use(requireAuth);

// Helper: resolve branch scoping
function getBranchScope(req: Request): string[] | null {
  // HM sees all branches
  if (req.user!.roles.includes("HM")) return null;
  return req.user!.branchIds;
}

// GET /api/dashboard/summary
// Returns top-level KPI cards
router.get(
  "/summary",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { branch_id, date_from, date_to } = req.query;
      const branchScope = getBranchScope(req);

      // Total Sales (completed JOs)
      let salesQuery = supabaseAdmin
        .from("job_orders")
        .select("total_amount", { count: "exact" })
        .eq("status", "completed");

      if (branch_id) salesQuery = salesQuery.eq("branch_id", branch_id as string);
      else if (branchScope) salesQuery = salesQuery.in("branch_id", branchScope);
      if (date_from) salesQuery = salesQuery.gte("created_at", date_from as string);
      if (date_to) salesQuery = salesQuery.lte("created_at", date_to as string);

      const { data: salesData, count: completedCount } = await salesQuery;
      const totalSales = (salesData || []).reduce((sum, jo) => sum + (jo.total_amount || 0), 0);

      // Active Job Orders
      let activeQuery = supabaseAdmin
        .from("job_orders")
        .select("id", { count: "exact" })
        .eq("is_deleted", false)
        .in("status", ["draft", "pending_approval", "approved", "in_progress", "ready_for_release"]);

      if (branch_id) activeQuery = activeQuery.eq("branch_id", branch_id as string);
      else if (branchScope) activeQuery = activeQuery.in("branch_id", branchScope);
      if (date_from) activeQuery = activeQuery.gte("created_at", date_from as string);
      if (date_to) activeQuery = activeQuery.lte("created_at", date_to as string);

      const { count: activeCount } = await activeQuery;

      // Total Job Orders
      let totalJoQuery = supabaseAdmin
        .from("job_orders")
        .select("id", { count: "exact" })
        .eq("is_deleted", false);

      if (branch_id) totalJoQuery = totalJoQuery.eq("branch_id", branch_id as string);
      else if (branchScope) totalJoQuery = totalJoQuery.in("branch_id", branchScope);
      if (date_from) totalJoQuery = totalJoQuery.gte("created_at", date_from as string);
      if (date_to) totalJoQuery = totalJoQuery.lte("created_at", date_to as string);

      const { count: totalJoCount } = await totalJoQuery;

      // Customers
      let custQuery = supabaseAdmin
        .from("customers")
        .select("id", { count: "exact" })
        .eq("status", "active");

      if (branch_id) custQuery = custQuery.eq("branch_id", branch_id as string);
      else if (branchScope) custQuery = custQuery.in("branch_id", branchScope);

      const { count: customerCount } = await custQuery;

      // Low-Stock Inventory (items where on-hand <= reorder_threshold)
      let inventoryQuery = supabaseAdmin
        .from("inventory_on_hand")
        .select("*");

      if (branch_id) inventoryQuery = inventoryQuery.eq("branch_id", branch_id as string);
      else if (branchScope) inventoryQuery = inventoryQuery.in("branch_id", branchScope);

      const { data: invData } = await inventoryQuery;
      const allInv = invData || [];
      const totalInventoryItems = allInv.length;
      const activeInventoryItems = allInv.filter((item: any) => item.status === "active").length;
      const lowStockCount = allInv.filter(
        (item: any) => item.current_quantity <= item.reorder_threshold
      ).length;
      const outOfStockCount = allInv.filter(
        (item: any) => item.current_quantity <= 0
      ).length;

      res.json({
        total_sales: totalSales,
        completed_job_orders: completedCount || 0,
        active_job_orders: activeCount || 0,
        total_job_orders: totalJoCount || 0,
        customers: customerCount || 0,
        low_stock_count: lowStockCount,
        total_inventory_items: totalInventoryItems,
        active_inventory_items: activeInventoryItems,
        out_of_stock_count: outOfStockCount,
      });
    } catch (error) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
  }
);

// GET /api/dashboard/sales-over-time
// Returns daily sales aggregation for line chart
router.get(
  "/sales-over-time",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { branch_id, date_from, date_to, period = "daily" } = req.query;
      const branchScope = getBranchScope(req);

      // Determine date range — default last 30 days
      const endDate = date_to ? new Date(date_to as string) : new Date();
      const startDate = date_from
        ? new Date(date_from as string)
        : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      let query = supabaseAdmin
        .from("job_orders")
        .select("total_amount, created_at")
        .eq("status", "completed")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: true });

      if (branch_id) query = query.eq("branch_id", branch_id as string);
      else if (branchScope) query = query.in("branch_id", branchScope);

      const { data, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Aggregate by date
      const aggregated: Record<string, number> = {};
      (data || []).forEach((jo: any) => {
        let key: string;
        const d = new Date(jo.created_at);
        if (period === "monthly") {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        } else if (period === "weekly") {
          // ISO week — use Monday of that week
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d);
          monday.setDate(diff);
          key = monday.toISOString().split("T")[0] || "";
        } else {
          key = d.toISOString().split("T")[0] || "";
        }
        aggregated[key] = (aggregated[key] || 0) + (jo.total_amount || 0);
      });

      const result = Object.entries(aggregated)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(result);
    } catch (error) {
      console.error("Sales over time error:", error);
      res.status(500).json({ error: "Failed to fetch sales data" });
    }
  }
);

// GET /api/dashboard/top-labor
// Returns top labor by revenue for bar chart
const topLaborHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { branch_id, date_from, date_to, limit = "10" } = req.query;
    const branchScope = getBranchScope(req);

    // Get completed job order IDs first (for branch filtering)
    let joQuery = supabaseAdmin
      .from("job_orders")
      .select("id")
      .eq("status", "completed");

    if (branch_id) joQuery = joQuery.eq("branch_id", branch_id as string);
    else if (branchScope) joQuery = joQuery.in("branch_id", branchScope);
    if (date_from) joQuery = joQuery.gte("created_at", date_from as string);
    if (date_to) joQuery = joQuery.lte("created_at", date_to as string);

    const { data: joIds } = await joQuery;
    const ids = (joIds || []).map((j: any) => j.id);

    if (ids.length === 0) {
      res.json([]);
      return;
    }

    // Get line-based labor rows for those completed orders.
    const { data: lines } = await supabaseAdmin
      .from("job_order_lines")
      .select("job_order_id, name, total")
      .eq("line_type", "labor")
      .in("job_order_id", ids);

    // Aggregate by labor name, counting how many completed orders used each labor.
    const laborMap: Record<string, { revenue: number; orderIds: Set<string> }> = {};
    (lines || []).forEach((line: any) => {
      const name = line.name;
      if (!name) return;

      if (!laborMap[name]) laborMap[name] = { revenue: 0, orderIds: new Set<string>() };
      laborMap[name].revenue += line.total || 0;
      if (line.job_order_id) laborMap[name].orderIds.add(line.job_order_id);
    });

    const result = Object.entries(laborMap)
      .map(([name, { revenue, orderIds }]) => ({ name, revenue, count: orderIds.size }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, parseInt(limit as string));

    res.json(result);
  } catch (error) {
    console.error("Top labor error:", error);
    res.status(500).json({ error: "Failed to fetch top labor" });
  }
};

router.get("/top-labor", requireRoles("HM", "POC", "JS", "R"), topLaborHandler);

// Backward compatibility alias
router.get("/top-services", requireRoles("HM", "POC", "JS", "R"), topLaborHandler);

// GET /api/dashboard/job-status-distribution
// Returns job order counts grouped by status for pie chart
router.get(
  "/job-status-distribution",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { branch_id, date_from, date_to } = req.query;
      const branchScope = getBranchScope(req);

      let query = supabaseAdmin
        .from("job_orders")
        .select("status")
        .eq("is_deleted", false);

      if (branch_id) query = query.eq("branch_id", branch_id as string);
      else if (branchScope) query = query.in("branch_id", branchScope);
      if (date_from) query = query.gte("created_at", date_from as string);
      if (date_to) query = query.lte("created_at", date_to as string);

      const { data, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const statusMap: Record<string, number> = {};
      (data || []).forEach((jo: any) => {
        statusMap[jo.status] = (statusMap[jo.status] || 0) + 1;
      });

      const result = Object.entries(statusMap).map(([status, count]) => ({
        status,
        count,
      }));

      res.json(result);
    } catch (error) {
      console.error("Job status distribution error:", error);
      res.status(500).json({ error: "Failed to fetch job status distribution" });
    }
  }
);

// GET /api/dashboard/revenue-per-branch
// Returns total revenue per branch
router.get(
  "/revenue-per-branch",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { date_from, date_to } = req.query;
      const branchScope = getBranchScope(req);

      let query = supabaseAdmin
        .from("job_orders")
        .select("branch_id, total_amount, branches(id, name, code)")
        .eq("status", "completed");

      if (branchScope) query = query.in("branch_id", branchScope);
      if (date_from) query = query.gte("created_at", date_from as string);
      if (date_to) query = query.lte("created_at", date_to as string);

      const { data, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const branchMap: Record<string, { name: string; revenue: number }> = {};
      (data || []).forEach((jo: any) => {
        const bid = jo.branch_id;
        if (!branchMap[bid]) {
          branchMap[bid] = {
            name: jo.branches?.name || "Unknown",
            revenue: 0,
          };
        }
        branchMap[bid].revenue += jo.total_amount || 0;
      });

      const result = Object.entries(branchMap).map(([branch_id, { name, revenue }]) => ({
        branch_id,
        name,
        revenue,
      }));

      res.json(result);
    } catch (error) {
      console.error("Revenue per branch error:", error);
      res.status(500).json({ error: "Failed to fetch revenue per branch" });
    }
  }
);

// GET /api/dashboard/recent-orders
// Returns recent job orders for the "Recent Orders" card
router.get(
  "/recent-orders",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { branch_id, limit = "10" } = req.query;
      const branchScope = getBranchScope(req);

      let query = supabaseAdmin
        .from("job_orders")
        .select(
          `id, order_number, status, total_amount, created_at,
           customers(id, full_name),
           vehicles(id, plate_number, model),
           job_order_items(package_item_name, quantity, line_total)`
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit as string));

      if (branch_id) query = query.eq("branch_id", branch_id as string);
      else if (branchScope) query = query.in("branch_id", branchScope);

      const { data, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data || []);
    } catch (error) {
      console.error("Recent orders error:", error);
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  }
);

// POST /api/dashboard/chat
// AI chatbot powered by Gemini — answers questions based on current dashboard data
router.post(
  "/chat",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: "AI chat is not configured. Set GEMINI_API_KEY in environment." });
        return;
      }

      const { message, context } = req.body;
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
      const model = genAI.getGenerativeModel({ model: modelName });

      // Build system context from dashboard data
      const systemPrompt = 
        `
          You are a helpful AI assistant for Petrozone Pulse System, an auto-repair management system.
          You can ONLY answer questions based on the dashboard data provided below. Do NOT make up information or use external knowledge.
          If the user asks something not answerable from the data, politely say you can only help with questions about the current dashboard data.
          If the user asks for trends or insights, analyze the data to provide them, but do not invent any numbers or facts not present in the data.
          If the user asks for suggestions and recommendations, analyze the data to provide them a realistic assessment.
          Keep answers concise and professional. Use Philippine Peso (₱) for currency values.

          Current Dashboard Data:
          ${JSON.stringify(context, null, 2)}
        `
      ;

      const result = await model.generateContent({
        contents: [
          { role: "user", parts: [{ text: systemPrompt + "\n\nUser question: " + message }] },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });

      const response = result.response;
      const text = response.text();

      res.json({ reply: text });
    } catch (error: any) {
      console.error("Dashboard chat error:", error);
      const statusCode = error.status || 500;
      const errorMessage = error.message || "Failed to generate AI response";
      if (statusCode === 429) {
        res.status(429).json({ error: "AI rate limit reached. Please wait a moment and try again." });
      } else {
        res.status(statusCode).json({ error: errorMessage });
      }
    }
  }
);

export default router;