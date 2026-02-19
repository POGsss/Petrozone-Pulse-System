import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// All third-party repair routes require authentication
router.use(requireAuth);

/**
 * GET /api/third-party-repairs
 * List third-party repairs with filtering and pagination
 * Optionally filter by job_order_id
 * HM sees all; others see only their branch-scoped repairs
 * Roles: HM, POC, JS, R, T
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        job_order_id,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("third_party_repairs")
        .select(
          `
          *,
          job_orders(id, order_number, branch_id, customers(id, full_name), vehicles(id, plate_number, model))
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Filter by job order
      if (job_order_id) {
        query = query.eq("job_order_id", job_order_id as string);
      } else {
        // When not filtering by specific job order, apply branch scoping
        // Get job order IDs visible to this user
        if (!req.user!.roles.includes("HM")) {
          const { data: visibleOrders } = await supabaseAdmin
            .from("job_orders")
            .select("id")
            .in("branch_id", req.user!.branchIds);

          const visibleIds = visibleOrders?.map((o) => o.id) || [];
          if (visibleIds.length === 0) {
            res.json({
              data: [],
              pagination: { total: 0, limit: parseInt(limit as string), offset: parseInt(offset as string) },
            });
            return;
          }
          query = query.in("job_order_id", visibleIds);
        }
      }

      // Search by provider name or description
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `provider_name.ilike.${searchTerm},description.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: repairs, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: repairs,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get third-party repairs error:", error);
      res.status(500).json({ error: "Failed to fetch third-party repairs" });
    }
  }
);

/**
 * GET /api/third-party-repairs/:id
 * Get a single third-party repair by ID
 * Roles: HM, POC, JS, R, T
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const repairId = req.params.id as string;

      const { data: repair, error } = await supabaseAdmin
        .from("third_party_repairs")
        .select(
          `
          *,
          job_orders(id, order_number, branch_id, customers(id, full_name), vehicles(id, plate_number, model))
        `
        )
        .eq("id", repairId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Third-party repair not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check for non-HM users
      const jobOrder = repair.job_orders as { branch_id: string } | null;
      if (
        jobOrder &&
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(jobOrder.branch_id)
      ) {
        res.status(403).json({ error: "No access to this repair's branch" });
        return;
      }

      res.json(repair);
    } catch (error) {
      console.error("Get third-party repair error:", error);
      res.status(500).json({ error: "Failed to fetch third-party repair" });
    }
  }
);

/**
 * POST /api/third-party-repairs
 * Create a new third-party repair
 * Roles: HM, POC, JS, R, T
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { job_order_id, provider_name, description, cost, repair_date, notes } = req.body;

      // Validation
      if (!job_order_id) {
        res.status(400).json({ error: "Job order is required" });
        return;
      }
      if (!provider_name || !provider_name.trim()) {
        res.status(400).json({ error: "Provider name is required" });
        return;
      }
      if (!description || !description.trim()) {
        res.status(400).json({ error: "Description is required" });
        return;
      }
      if (cost === undefined || cost === null || isNaN(Number(cost)) || Number(cost) < 0) {
        res.status(400).json({ error: "Valid cost is required" });
        return;
      }
      if (!repair_date) {
        res.status(400).json({ error: "Repair date is required" });
        return;
      }

      // Verify job order exists and check branch access
      const { data: jobOrder, error: joError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id")
        .eq("id", job_order_id)
        .single();

      if (joError || !jobOrder) {
        res.status(400).json({ error: "Job order not found" });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(jobOrder.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      const { data: repair, error: createError } = await supabaseAdmin
        .from("third_party_repairs")
        .insert({
          job_order_id,
          provider_name: provider_name.trim(),
          description: description.trim(),
          cost: Number(cost),
          repair_date,
          notes: notes?.trim() || null,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          job_orders(id, order_number, branch_id, customers(id, full_name), vehicles(id, plate_number, model))
        `
        )
        .single();

      if (createError) {
        res.status(500).json({ error: createError.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "THIRD_PARTY_REPAIR")
        .eq("entity_id", repair.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.status(201).json(repair);
    } catch (error) {
      console.error("Create third-party repair error:", error);
      res.status(500).json({ error: "Failed to create third-party repair" });
    }
  }
);

/**
 * PUT /api/third-party-repairs/:id
 * Update a third-party repair
 * Roles: HM, POC, JS, R, T
 */
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const repairId = req.params.id as string;
      const { provider_name, description, cost, repair_date, notes } = req.body;

      // Get existing repair
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("third_party_repairs")
        .select("id, job_order_id")
        .eq("id", repairId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Third-party repair not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Verify branch access via parent job order
      const { data: jobOrder, error: joError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id")
        .eq("id", existing.job_order_id)
        .single();

      if (joError || !jobOrder) {
        res.status(400).json({ error: "Parent job order not found" });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(jobOrder.branch_id)
      ) {
        res.status(403).json({ error: "No access to this repair's branch" });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};
      if (provider_name !== undefined) updateData.provider_name = provider_name.trim();
      if (description !== undefined) updateData.description = description.trim();
      if (cost !== undefined) updateData.cost = Number(cost);
      if (repair_date !== undefined) updateData.repair_date = repair_date;
      if (notes !== undefined) updateData.notes = notes?.trim() || null;

      const { error: updateError } = await supabaseAdmin
        .from("third_party_repairs")
        .update(updateData)
        .eq("id", repairId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fetch updated record
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("third_party_repairs")
        .select(
          `
          *,
          job_orders(id, order_number, branch_id, customers(id, full_name), vehicles(id, plate_number, model))
        `
        )
        .eq("id", repairId)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "THIRD_PARTY_REPAIR")
        .eq("entity_id", repairId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json(updated);
    } catch (error) {
      console.error("Update third-party repair error:", error);
      res.status(500).json({ error: "Failed to update third-party repair" });
    }
  }
);

/**
 * DELETE /api/third-party-repairs/:id
 * Delete a third-party repair
 * Roles: HM, POC, JS, R, T
 */
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const repairId = req.params.id as string;

      // Get existing repair
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("third_party_repairs")
        .select("id, job_order_id, provider_name")
        .eq("id", repairId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Third-party repair not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Verify branch access via parent job order
      const { data: jobOrder, error: joError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id")
        .eq("id", existing.job_order_id)
        .single();

      if (joError || !jobOrder) {
        res.status(400).json({ error: "Parent job order not found" });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(jobOrder.branch_id)
      ) {
        res.status(403).json({ error: "No access to this repair's branch" });
        return;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("third_party_repairs")
        .delete()
        .eq("id", repairId);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      res.json({ message: `Third-party repair "${existing.provider_name}" deleted successfully` });

      // Log deletion
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "THIRD_PARTY_REPAIR",
          p_entity_id: repairId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { provider_name: existing.provider_name, job_order_id: existing.job_order_id },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }
    } catch (error) {
      console.error("Delete third-party repair error:", error);
      res.status(500).json({ error: "Failed to delete third-party repair" });
    }
  }
);

export default router;
