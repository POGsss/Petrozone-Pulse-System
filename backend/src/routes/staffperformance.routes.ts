import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();
const ON_TIME_THRESHOLD_HOURS = 8;

// All routes require authentication
router.use(requireAuth);

function getBranchScope(req: Request): string[] | null {
  if (req.user!.roles.includes("HM")) return null;
  return req.user!.branchIds;
}

function toIsoOrNull(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function recomputeStaffPerformanceMetrics(
  req: Request,
  options?: { branch_id?: string; period_start?: string; period_end?: string }
): Promise<{ inserted: number; period_start: string; period_end: string }> {
  const branchScope = getBranchScope(req);
  const rangeEnd = toIsoOrNull(options?.period_end) || new Date().toISOString();
  const rangeStart =
    toIsoOrNull(options?.period_start) ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let joQuery = supabaseAdmin
    .from("job_orders")
    .select("id, assigned_technician_id, branch_id, total_amount, start_time, completion_time, created_at")
    .eq("status", "completed")
    .gte("created_at", rangeStart)
    .lte("created_at", rangeEnd);

  if (options?.branch_id) {
    joQuery = joQuery.eq("branch_id", options.branch_id);
  } else if (branchScope) {
    joQuery = joQuery.in("branch_id", branchScope);
  }

  const { data: completedOrders, error: joError } = await joQuery;
  if (joError) throw new Error(joError.message);

  const rows = completedOrders || [];
  const grouped: Record<
    string,
    {
      staff_id: string;
      branch_id: string;
      jobs: number;
      revenue: number;
      completionHours: number[];
      onTimeCount: number;
    }
  > = {};

  for (const jo of rows as Array<{
    assigned_technician_id: string | null;
    branch_id: string;
    total_amount: number | null;
    start_time: string | null;
    completion_time: string | null;
  }>) {
    if (!jo.assigned_technician_id) continue;
    const key = `${jo.assigned_technician_id}::${jo.branch_id}`;
    if (!grouped[key]) {
      grouped[key] = {
        staff_id: jo.assigned_technician_id,
        branch_id: jo.branch_id,
        jobs: 0,
        revenue: 0,
        completionHours: [],
        onTimeCount: 0,
      };
    }

    const g = grouped[key]!;
    g.jobs += 1;
    g.revenue += jo.total_amount || 0;

    if (jo.start_time && jo.completion_time) {
      const start = new Date(jo.start_time).getTime();
      const end = new Date(jo.completion_time).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        const hours = (end - start) / (1000 * 60 * 60);
        g.completionHours.push(hours);
        if (hours <= ON_TIME_THRESHOLD_HOURS) {
          g.onTimeCount += 1;
        }
      }
    }
  }

  let deleteQuery = supabaseAdmin
    .from("staff_performance")
    .delete()
    .gte("period_start", rangeStart)
    .lte("period_end", rangeEnd);
  if (options?.branch_id) {
    deleteQuery = deleteQuery.eq("branch_id", options.branch_id);
  } else if (branchScope) {
    deleteQuery = deleteQuery.in("branch_id", branchScope);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(deleteError.message);

  const toInsert: Array<{
    staff_id: string;
    metric_type: "jobs_completed" | "revenue_generated" | "avg_completion_time" | "on_time_completion_rate";
    metric_value: number;
    period_start: string;
    period_end: string;
    branch_id: string;
    is_deleted: boolean;
  }> = [];

  for (const g of Object.values(grouped)) {
    const avgCompletion =
      g.completionHours.length > 0
        ? g.completionHours.reduce((sum, h) => sum + h, 0) / g.completionHours.length
        : 0;
    const onTimeRate = g.jobs > 0 ? (g.onTimeCount / g.jobs) * 100 : 0;

    toInsert.push(
      {
        staff_id: g.staff_id,
        metric_type: "jobs_completed",
        metric_value: g.jobs,
        period_start: rangeStart,
        period_end: rangeEnd,
        branch_id: g.branch_id,
        is_deleted: false,
      },
      {
        staff_id: g.staff_id,
        metric_type: "revenue_generated",
        metric_value: g.revenue,
        period_start: rangeStart,
        period_end: rangeEnd,
        branch_id: g.branch_id,
        is_deleted: false,
      },
      {
        staff_id: g.staff_id,
        metric_type: "avg_completion_time",
        metric_value: Number(avgCompletion.toFixed(2)),
        period_start: rangeStart,
        period_end: rangeEnd,
        branch_id: g.branch_id,
        is_deleted: false,
      },
      {
        staff_id: g.staff_id,
        metric_type: "on_time_completion_rate",
        metric_value: Number(onTimeRate.toFixed(2)),
        period_start: rangeStart,
        period_end: rangeEnd,
        branch_id: g.branch_id,
        is_deleted: false,
      }
    );
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("staff_performance")
      .insert(toInsert);
    if (insertError) throw new Error(insertError.message);
  }

  return {
    inserted: toInsert.length,
    period_start: rangeStart,
    period_end: rangeEnd,
  };
}

/**
 * POST /api/staff-performance/recompute
 * Recompute staff performance snapshots from completed job orders
 * Roles: HM, POC, JS
 */
router.post(
  "/recompute",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { branch_id, period_start, period_end } = req.body || {};
      const branchScope = getBranchScope(req);

      if (branch_id && branchScope && !branchScope.includes(branch_id)) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const result = await recomputeStaffPerformanceMetrics(req, {
        branch_id,
        period_start,
        period_end,
      });

      res.json({
        message: "Staff performance metrics recomputed successfully",
        ...result,
      });
    } catch (error) {
      console.error("Recompute staff performance error:", error);
      res.status(500).json({ error: "Failed to recompute staff performance metrics" });
    }
  }
);

/**
 * GET /api/staff-performance
 * List staff performance records with filtering and pagination
 * View: HM, POC, JS, R, T
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        staff_id,
        branch_id,
        metric_type,
        period_start,
        period_end,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("staff_performance")
        .select(
          "*, user_profiles!staff_performance_staff_id_fkey(id, full_name, email), branches!staff_performance_branch_id_fkey(id, name, code)",
          { count: "exact" }
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (staff_id) query = query.eq("staff_id", staff_id as string);
      if (branch_id) query = query.eq("branch_id", branch_id as string);
      if (metric_type) {
        query = query.eq(
          "metric_type",
          metric_type as "jobs_completed" | "avg_completion_time" | "revenue_generated" | "on_time_completion_rate"
        );
      }
      if (period_start) query = query.gte("period_start", period_start as string);
      if (period_end) query = query.lte("period_end", period_end as string);

      // Search by staff name (join filter)
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `user_profiles.full_name.ilike.${searchTerm},user_profiles.email.ilike.${searchTerm}`
        );
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get staff performance error:", error);
      res.status(500).json({ error: "Failed to fetch staff performance records" });
    }
  }
);



/**
 * GET /api/staff-performance/:id
 * Get a single staff performance record
 * View: HM, POC, JS, R, T
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const { data, error } = await supabaseAdmin
        .from("staff_performance")
        .select(
          "*, user_profiles!staff_performance_staff_id_fkey(id, full_name, email), branches!staff_performance_branch_id_fkey(id, name, code)"
        )
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Staff performance record not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error) {
      console.error("Get staff performance record error:", error);
      res.status(500).json({ error: "Failed to fetch staff performance record" });
    }
  }
);



export default router;
