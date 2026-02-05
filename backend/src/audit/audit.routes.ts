import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireManagement, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// All audit routes require authentication
router.use(requireAuth);

/**
 * GET /api/audit
 * Get audit logs with filtering
 * HM can view all logs
 * POC can view logs for their branches only
 */
router.get("/", requireRoles("HM", "POC"), async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      action, 
      entity_type, 
      entity_id, 
      user_id, 
      branch_id, 
      start_date, 
      end_date,
      limit = "50",
      offset = "0" 
    } = req.query;

    let query = supabaseAdmin
      .from("audit_logs")
      .select(`
        *,
        user_profiles(id, email, full_name),
        branches(id, name, code)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    // Apply filters
    if (action) {
      query = query.eq("action", action as string);
    }
    if (entity_type) {
      query = query.eq("entity_type", entity_type as string);
    }
    if (entity_id) {
      query = query.eq("entity_id", entity_id as string);
    }
    if (user_id) {
      query = query.eq("user_id", user_id as string);
    }
    if (branch_id) {
      query = query.eq("branch_id", branch_id as string);
    }
    if (start_date) {
      query = query.gte("created_at", start_date as string);
    }
    if (end_date) {
      query = query.lte("created_at", end_date as string);
    }

    // For POC users, filter by their branch assignments
    // HM has access to all audit logs
    if (!req.user!.roles.includes("HM")) {
      query = query.in("branch_id", req.user!.branchIds);
    }

    // Apply pagination
    query = query.range(
      parseInt(offset as string), 
      parseInt(offset as string) + parseInt(limit as string) - 1
    );

    const { data: logs, error, count } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      data: logs,
      pagination: {
        total: count,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Get audit history for a specific entity
 */
router.get(
  "/entity/:entityType/:entityId",
  requireManagement,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const entityType = req.params.entityType as string;
      const entityId = req.params.entityId as string;

      const { data: logs, error } = await supabaseAdmin
        .from("audit_logs")
        .select(`
          *,
          user_profiles(id, email, full_name)
        `)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(logs);
    } catch (error) {
      console.error("Get entity audit logs error:", error);
      res.status(500).json({ error: "Failed to fetch entity audit logs" });
    }
  }
);

/**
 * GET /api/audit/user/:userId
 * Get audit history for a specific user's actions
 */
router.get(
  "/user/:userId",
  requireManagement,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.userId as string;
      const { limit = "50" } = req.query;

      const { data: logs, error } = await supabaseAdmin
        .from("audit_logs")
        .select(`
          *,
          branches(id, name, code)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit as string));

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(logs);
    } catch (error) {
      console.error("Get user audit logs error:", error);
      res.status(500).json({ error: "Failed to fetch user audit logs" });
    }
  }
);

/**
 * GET /api/audit/stats
 * Get audit log statistics (for dashboard)
 */
router.get("/stats", requireManagement, async (req: Request, res: Response): Promise<void> => {
  try {
    const { days = "7" } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    // Get counts by action type
    const { data: actionCounts, error: actionError } = await supabaseAdmin
      .from("audit_logs")
      .select("action")
      .gte("created_at", startDate.toISOString());

    if (actionError) {
      res.status(500).json({ error: actionError.message });
      return;
    }

    // Count actions
    const actionStats = actionCounts?.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) ?? {};

    // Get recent login count
    const loginCount = actionStats["LOGIN"] || 0;

    // Get counts by entity type
    const entityStats = actionCounts?.reduce((acc, log) => {
      // We'd need entity_type here but it's not in the current query
      return acc;
    }, {} as Record<string, number>) ?? {};

    res.json({
      period_days: parseInt(days as string),
      total_events: actionCounts?.length ?? 0,
      actions: actionStats,
      logins: loginCount,
    });
  } catch (error) {
    console.error("Get audit stats error:", error);
    res.status(500).json({ error: "Failed to fetch audit statistics" });
  }
});

export default router;
