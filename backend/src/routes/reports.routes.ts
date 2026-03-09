import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser } from "../lib/auditLogger.js";

const router = Router();

router.use(requireAuth);

const VALID_REPORT_TYPES = ["sales", "inventory", "job_order", "staff_performance"];

/**
 * GET /api/reports
 * List reports with filtering and pagination
 * RBAC: HM, POC, JS, R
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        report_type,
        branch_id,
        is_template,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("reports")
        .select(
          "*, user_profiles!reports_generated_by_fkey(id, full_name, email), branches!reports_branch_id_fkey(id, name, code)",
          { count: "exact" }
        )
        .eq("is_deleted", false)
        .order("generated_at", { ascending: false });

      if (report_type && VALID_REPORT_TYPES.includes(report_type as string)) {
        query = query.eq("report_type", report_type as "sales" | "inventory" | "job_order" | "staff_performance");
      }
      if (branch_id) query = query.eq("branch_id", branch_id as string);
      if (is_template === "true") query = query.eq("is_template", true);
      if (is_template === "false") query = query.eq("is_template", false);
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.ilike("report_name", searchTerm);
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
      console.error("Get reports error:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  }
);

/**
 * GET /api/reports/:id
 * Get a single report
 * RBAC: HM, POC, JS, R
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const { data, error } = await supabaseAdmin
        .from("reports")
        .select(
          "*, user_profiles!reports_generated_by_fkey(id, full_name, email), branches!reports_branch_id_fkey(id, name, code)"
        )
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (error) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      res.json({ data });
    } catch (error) {
      console.error("Get report error:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  }
);

/**
 * POST /api/reports
 * Create a new report (save configuration)
 * RBAC: HM, POC, JS, R
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { report_name, report_type, filters, branch_id, is_template } = req.body;

      if (!report_name || !report_type) {
        res.status(400).json({ error: "report_name and report_type are required" });
        return;
      }

      if (!VALID_REPORT_TYPES.includes(report_type)) {
        res.status(400).json({ error: `Invalid report_type. Must be one of: ${VALID_REPORT_TYPES.join(", ")}` });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("reports")
        .insert({
          report_name,
          report_type,
          filters: filters || {},
          generated_by: userId,
          branch_id: branch_id || null,
          is_template: is_template || false,
        })
        .select(
          "*, user_profiles!reports_generated_by_fkey(id, full_name, email), branches!reports_branch_id_fkey(id, name, code)"
        )
        .single();

      if (error) {
        await logFailedAction(req, "CREATE", "report", null, error.message);
        res.status(500).json({ error: error.message });
        return;
      }

      await fixAuditLogUser("report", data.id, "INSERT", userId, branch_id || null);

      res.status(201).json({ data });
    } catch (error) {
      console.error("Create report error:", error);
      await logFailedAction(req, "CREATE", "report", null, String(error));
      res.status(500).json({ error: "Failed to create report" });
    }
  }
);

/**
 * PUT /api/reports/:id
 * Update a report's configuration
 * RBAC: HM, POC, JS, R
 */
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const reportId = req.params.id as string;
      const { report_name, report_type, filters, branch_id, is_template } = req.body;

      // Check existence
      const { data: existing, error: findError } = await supabaseAdmin
        .from("reports")
        .select("id")
        .eq("id", reportId)
        .eq("is_deleted", false)
        .single();

      if (findError || !existing) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      if (report_type && !VALID_REPORT_TYPES.includes(report_type)) {
        res.status(400).json({ error: `Invalid report_type. Must be one of: ${VALID_REPORT_TYPES.join(", ")}` });
        return;
      }

      const updateData: Record<string, unknown> = {};
      if (report_name !== undefined) updateData.report_name = report_name;
      if (report_type !== undefined) updateData.report_type = report_type;
      if (filters !== undefined) updateData.filters = filters;
      if (branch_id !== undefined) updateData.branch_id = branch_id || null;
      if (is_template !== undefined) updateData.is_template = is_template;

      const { data, error } = await supabaseAdmin
        .from("reports")
        .update(updateData)
        .eq("id", reportId)
        .select(
          "*, user_profiles!reports_generated_by_fkey(id, full_name, email), branches!reports_branch_id_fkey(id, name, code)"
        )
        .single();

      if (error) {
        await logFailedAction(req, "UPDATE", "report", reportId, error.message);
        res.status(500).json({ error: error.message });
        return;
      }

      await fixAuditLogUser("report", reportId, "UPDATE", userId);

      res.json({ data });
    } catch (error) {
      console.error("Update report error:", error);
      await logFailedAction(req, "UPDATE", "report", req.params.id as string, String(error));
      res.status(500).json({ error: "Failed to update report" });
    }
  }
);

/**
 * DELETE /api/reports/:id
 * Soft delete a report
 * RBAC: HM, POC, JS, R
 */
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const reportId = req.params.id as string;

      // Check existence
      const { data: existing, error: findError } = await supabaseAdmin
        .from("reports")
        .select("id")
        .eq("id", reportId)
        .eq("is_deleted", false)
        .single();

      if (findError || !existing) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const { error } = await supabaseAdmin
        .from("reports")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq("id", reportId);

      if (error) {
        await logFailedAction(req, "DELETE", "report", reportId, error.message);
        res.status(500).json({ error: error.message });
        return;
      }

      await fixAuditLogUser("report", reportId, "UPDATE", userId);

      res.json({ message: "Report deleted successfully" });
    } catch (error) {
      console.error("Delete report error:", error);
      await logFailedAction(req, "DELETE", "report", req.params.id as string, String(error));
      res.status(500).json({ error: "Failed to delete report" });
    }
  }
);

/**
 * POST /api/reports/:id/generate
 * Generate report data dynamically based on filters
 * RBAC: HM, POC, JS, R
 */
router.post(
  "/:id/generate",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const { data: report, error: findError } = await supabaseAdmin
        .from("reports")
        .select("*")
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (findError || !report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const reportData = await generateReportData(report.report_type, report.filters as Record<string, string>, report.branch_id);

      await fixAuditLogUser("report", report.id, "GENERATE", req.user!.id, report.branch_id);

      res.json({ data: reportData });
    } catch (error) {
      console.error("Generate report error:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

/**
 * POST /api/reports/generate-preview
 * Generate report data from filters without saving
 * RBAC: HM, POC, JS, R
 */
router.post(
  "/generate-preview",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { report_type, filters, branch_id } = req.body;

      if (!report_type || !VALID_REPORT_TYPES.includes(report_type)) {
        res.status(400).json({ error: "Valid report_type is required" });
        return;
      }

      const reportData = await generateReportData(report_type, filters || {}, branch_id || null);

      res.json({ data: reportData });
    } catch (error) {
      console.error("Generate preview error:", error);
      res.status(500).json({ error: "Failed to generate report preview" });
    }
  }
);

/**
 * GET /api/reports/:id/export/:format
 * Export report data as CSV or PDF
 * RBAC: HM, POC, JS, R
 */
router.get(
  "/:id/export/:format",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const format = req.params.format;
      if (format !== "csv" && format !== "pdf") {
        res.status(400).json({ error: "Format must be csv or pdf" });
        return;
      }

      const id = req.params.id as string;

      const { data: report, error: findError } = await supabaseAdmin
        .from("reports")
        .select("*")
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (findError || !report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const reportData = await generateReportData(report.report_type, report.filters as Record<string, string>, report.branch_id);

      if (format === "csv") {
        const csv = convertToCSV(report.report_type, reportData);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(report.report_name)}.csv"`);
        res.send(csv);
      } else {
        // PDF generation - text-based format
        const pdfContent = generateTextPDF(report.report_name, report.report_type, reportData, report.filters as Record<string, string>);
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(report.report_name)}.txt"`);
        res.send(pdfContent);
      }

      await fixAuditLogUser("report", report.id, "EXPORT", req.user!.id, report.branch_id);
    } catch (error) {
      console.error("Export report error:", error);
      res.status(500).json({ error: "Failed to export report" });
    }
  }
);

async function generateReportData(
  reportType: string,
  filters: Record<string, string>,
  branchId: string | null
): Promise<Record<string, unknown>> {
  switch (reportType) {
    case "sales":
      return generateSalesReport(filters, branchId);
    case "inventory":
      return generateInventoryReport(filters, branchId);
    case "job_order":
      return generateJobOrderReport(filters, branchId);
    case "staff_performance":
      return generateStaffPerformanceReport(filters, branchId);
    default:
      return { error: "Unknown report type" };
  }
}

async function generateSalesReport(
  filters: Record<string, string>,
  branchId: string | null
): Promise<Record<string, unknown>> {
  let query = supabaseAdmin
    .from("job_orders")
    .select("id, order_number, total_amount, status, created_at, branches!job_orders_branch_id_fkey(name), customers!job_orders_customer_id_fkey(full_name)")
    .eq("is_deleted", false)
    .in("status", ["completed", "pending_payment", "ready_for_release"]);

  if (branchId) query = query.eq("branch_id", branchId);
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);

  query = query.order("created_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return { error: error.message, rows: [], summary: {} };

  const rows = data || [];
  const totalRevenue = rows.reduce((sum, r) => sum + (r.total_amount || 0), 0);
  const avgOrderValue = rows.length > 0 ? totalRevenue / rows.length : 0;

  return {
    rows,
    summary: {
      total_orders: rows.length,
      total_revenue: totalRevenue,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
    },
  };
}

async function generateInventoryReport(
  filters: Record<string, string>,
  branchId: string | null
): Promise<Record<string, unknown>> {
  let query = supabaseAdmin
    .from("inventory_on_hand")
    .select("*");

  if (branchId) query = query.eq("branch_id", branchId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);

  query = query.order("item_name", { ascending: true }).limit(500);

  const { data, error } = await query;
  if (error) return { error: error.message, rows: [], summary: {} };

  const rows = data || [];
  const lowStock = rows.filter(r => r.current_quantity <= r.reorder_threshold);
  const totalValue = rows.reduce((sum, r) => sum + (r.cost_price * r.current_quantity), 0);

  return {
    rows,
    summary: {
      total_items: rows.length,
      low_stock_items: lowStock.length,
      total_inventory_value: Math.round(totalValue * 100) / 100,
    },
  };
}

async function generateJobOrderReport(
  filters: Record<string, string>,
  branchId: string | null
): Promise<Record<string, unknown>> {
  let query = supabaseAdmin
    .from("job_orders")
    .select("id, order_number, total_amount, status, created_at, start_time, completion_time, branches!job_orders_branch_id_fkey(name), customers!job_orders_customer_id_fkey(full_name)")
    .eq("is_deleted", false);

  if (branchId) query = query.eq("branch_id", branchId);
  if (filters.status) query = query.eq("status", filters.status as "draft" | "pending_approval" | "approved" | "in_progress" | "ready_for_release" | "pending_payment" | "completed" | "rejected" | "cancelled");
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);

  query = query.order("created_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return { error: error.message, rows: [], summary: {} };

  const rows = data || [];
  const statusCounts: Record<string, number> = {};
  rows.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });
  const totalRevenue = rows.reduce((sum, r) => sum + (r.total_amount || 0), 0);

  return {
    rows,
    summary: {
      total_orders: rows.length,
      total_revenue: totalRevenue,
      status_breakdown: statusCounts,
    },
  };
}

async function generateStaffPerformanceReport(
  filters: Record<string, string>,
  branchId: string | null
): Promise<Record<string, unknown>> {
  let query = supabaseAdmin
    .from("staff_performance")
    .select("*, user_profiles!staff_performance_staff_id_fkey(full_name, email)")
    .eq("is_deleted", false);

  if (branchId) query = query.eq("branch_id", branchId);
  if (filters.metric_type) query = query.eq("metric_type", filters.metric_type);
  if (filters.date_from) query = query.gte("period_start", filters.date_from);
  if (filters.date_to) query = query.lte("period_end", filters.date_to);

  query = query.order("created_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return { error: error.message, rows: [], summary: {} };

  const rows = data || [];
  const uniqueStaff = new Set(rows.map(r => r.staff_id));

  return {
    rows,
    summary: {
      total_records: rows.length,
      unique_staff: uniqueStaff.size,
    },
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
}

function convertToCSV(reportType: string, reportData: Record<string, unknown>): string {
  const rows = (reportData.rows as Record<string, unknown>[]) || [];
  if (rows.length === 0) return "No data";

  // Flatten nested objects for CSV
  const flatRows = rows.map(row => flattenObject(row));
  if (flatRows.length === 0) return "No data";
  const headers = Object.keys(flatRows[0]!);
  const csvLines = [headers.join(",")];

  for (const row of flatRows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape CSV values with commas/quotes/newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvLines.push(values.join(","));
  }

  // Add summary section
  const summary = reportData.summary as Record<string, unknown> | undefined;
  if (summary) {
    csvLines.push("");
    csvLines.push("Summary");
    for (const [key, value] of Object.entries(summary)) {
      if (typeof value === "object" && value !== null) {
        csvLines.push(`${key},${JSON.stringify(value)}`);
      } else {
        csvLines.push(`${key},${value}`);
      }
    }
  }

  return csvLines.join("\n");
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function generateTextPDF(
  reportName: string,
  reportType: string,
  reportData: Record<string, unknown>,
  filters: Record<string, string>
): string {
  const lines: string[] = [];
  const divider = "=".repeat(60);

  lines.push(divider);
  lines.push(`REPORT: ${reportName}`);
  lines.push(`TYPE: ${reportType.replace(/_/g, " ").toUpperCase()}`);
  lines.push(`GENERATED: ${new Date().toISOString()}`);
  lines.push(divider);

  // Filters section
  if (filters && Object.keys(filters).length > 0) {
    lines.push("");
    lines.push("FILTERS:");
    for (const [key, value] of Object.entries(filters)) {
      if (value) lines.push(`  ${key}: ${value}`);
    }
  }

  // Summary section
  const summary = reportData.summary as Record<string, unknown> | undefined;
  if (summary) {
    lines.push("");
    lines.push("SUMMARY:");
    lines.push("-".repeat(40));
    for (const [key, value] of Object.entries(summary)) {
      const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (typeof value === "object" && value !== null) {
        lines.push(`  ${label}:`);
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          lines.push(`    ${k}: ${v}`);
        }
      } else {
        lines.push(`  ${label}: ${value}`);
      }
    }
  }

  // Data rows section
  const rows = (reportData.rows as Record<string, unknown>[]) || [];
  lines.push("");
  lines.push(`DATA (${rows.length} records):`);
  lines.push("-".repeat(40));

  const maxRows = Math.min(rows.length, 100);
  for (let i = 0; i < maxRows; i++) {
    const flat = flattenObject(rows[i]!);
    const parts = Object.entries(flat)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(" | ");
    lines.push(`  ${i + 1}. ${parts}`);
  }

  if (rows.length > maxRows) {
    lines.push(`  ... and ${rows.length - maxRows} more records`);
  }

  lines.push("");
  lines.push(divider);
  lines.push("END OF REPORT");

  return lines.join("\n");
}

export default router;
