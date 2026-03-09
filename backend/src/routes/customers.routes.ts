import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();

// All customer routes require authentication
router.use(requireAuth);

/**
 * GET /api/customers
 * Get customers with filtering and pagination
 * HM sees all, others see only their branch-scoped customers
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        customer_type,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("customers")
        .select(
          `
          *,
          branches(id, name, code)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Branch scoping: HM sees all, others see their branches only
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      // Apply filters
      if (branch_id) {
        query = query.eq("branch_id", branch_id as string);
      }
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (customer_type) {
        query = query.eq("customer_type", customer_type as "individual" | "company");
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `full_name.ilike.${searchTerm},email.ilike.${searchTerm},contact_number.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: customers, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: customers,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get customers error:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  }
);

/**
 * GET /api/customers/:customerId
 * Get a single customer by ID
 */
router.get(
  "/:customerId",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = req.params.customerId as string;

      let query = supabaseAdmin
        .from("customers")
        .select(
          `
          *,
          branches(id, name, code)
        `
        )
        .eq("id", customerId)
        .single();

      const { data: customer, error } = await query;

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Customer not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(customer.branch_id)
      ) {
        res.status(403).json({ error: "No access to this customer's branch" });
        return;
      }

      res.json(customer);
    } catch (error) {
      console.error("Get customer error:", error);
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  }
);

/**
 * POST /api/customers
 * Create a new customer
 * HM, POC, JS, R can create
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        full_name,
        contact_number,
        email,
        customer_type,
        branch_id,
        status,
        address,
        notes,
      } = req.body;

      // Validation: full_name is required
      if (!full_name || !full_name.trim()) {
        res.status(400).json({ error: "Full name is required" });
        return;
      }

      // Validation: at least one contact method
      if (
        (!contact_number || !contact_number.trim()) &&
        (!email || !email.trim())
      ) {
        res
          .status(400)
          .json({ error: "At least one contact method (phone or email) is required" });
        return;
      }

      // Validation: customer_type
      if (!customer_type || !["individual", "company"].includes(customer_type)) {
        res.status(400).json({ error: "Customer type must be 'individual' or 'company'" });
        return;
      }

      // Validation: branch_id is required
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Validate phone if provided
      if (contact_number) {
        const phoneDigits = contact_number.replace(/[^0-9]/g, "");
        if (phoneDigits.length < 7 || phoneDigits.length > 20) {
          res.status(400).json({ error: "Phone number must be between 7 and 20 digits" });
          return;
        }
      }

      // Validate email if provided
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          res.status(400).json({ error: "Invalid email format" });
          return;
        }
      }

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .insert({
          full_name: full_name.trim(),
          contact_number: contact_number?.trim() || null,
          email: email?.trim() || null,
          customer_type,
          branch_id,
          status: status || "active",
          address: address?.trim() || null,
          notes: notes?.trim() || null,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          branches(id, name, code)
        `
        )
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("CUSTOMER", customer.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      res.status(201).json(customer);
    } catch (error) {
      console.error("Create customer error:", error);
      await logFailedAction(req, "CREATE", "CUSTOMER", null, error instanceof Error ? error.message : "Failed to create customer");
      res.status(500).json({ error: "Failed to create customer" });
    }
  }
);

/**
 * PUT /api/customers/:customerId
 * Update a customer
 * POC, JS, R, T can update
 */
router.put(
  "/:customerId",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = req.params.customerId as string;
      const {
        full_name,
        contact_number,
        email,
        customer_type,
        status,
        address,
        notes,
      } = req.body;

      // Get existing customer first
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Customer not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this customer's branch" });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};

      if (full_name !== undefined) {
        if (!full_name.trim()) {
          res.status(400).json({ error: "Full name cannot be empty" });
          return;
        }
        updateData.full_name = full_name.trim();
      }

      if (contact_number !== undefined) {
        if (contact_number) {
          const phoneDigits = contact_number.replace(/[^0-9]/g, "");
          if (phoneDigits.length < 7 || phoneDigits.length > 20) {
            res.status(400).json({ error: "Phone number must be between 7 and 20 digits" });
            return;
          }
          updateData.contact_number = contact_number.trim();
        } else {
          updateData.contact_number = null;
        }
      }

      if (email !== undefined) {
        if (email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            res.status(400).json({ error: "Invalid email format" });
            return;
          }
          updateData.email = email.trim();
        } else {
          updateData.email = null;
        }
      }

      // Ensure at least one contact method remains after update
      const finalPhone =
        contact_number !== undefined ? contact_number?.trim() || null : existing.contact_number;
      const finalEmail =
        email !== undefined ? email?.trim() || null : existing.email;
      if (!finalPhone && !finalEmail) {
        res
          .status(400)
          .json({ error: "At least one contact method (phone or email) is required" });
        return;
      }

      if (customer_type !== undefined) {
        if (!["individual", "company"].includes(customer_type)) {
          res.status(400).json({ error: "Customer type must be 'individual' or 'company'" });
          return;
        }
        updateData.customer_type = customer_type;
      }

      if (status !== undefined) {
        if (!["active", "inactive"].includes(status)) {
          res.status(400).json({ error: "Status must be 'active' or 'inactive'" });
          return;
        }
        updateData.status = status;
      }

      if (address !== undefined) {
        updateData.address = address?.trim() || null;
      }
      if (notes !== undefined) {
        updateData.notes = notes?.trim() || null;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // Filter out fields that haven't actually changed
      const actualChanges = filterUnchangedFields(updateData, existing);
      if (Object.keys(actualChanges).length === 0) {
        // No real changes — return existing data without triggering an update
        const { data: current } = await supabaseAdmin
          .from("customers")
          .select(`*, branches(id, name, code)`)
          .eq("id", customerId)
          .single();
        res.json(current);
        return;
      }

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .update(actualChanges)
        .eq("id", customerId)
        .select(
          `
          *,
          branches(id, name, code)
        `
        )
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("CUSTOMER", customerId, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

      res.json(customer);
    } catch (error) {
      console.error("Update customer error:", error);
      await logFailedAction(req, "UPDATE", "CUSTOMER", (req.params.customerId as string) || null, error instanceof Error ? error.message : "Failed to update customer");
      res.status(500).json({ error: "Failed to update customer" });
    }
  }
);

/**
 * DELETE /api/customers/:customerId
 * Hard-delete if no job orders reference this customer.
 * Soft-delete (set status to inactive) if job orders exist.
 */
router.delete(
  "/:customerId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = req.params.customerId as string;

      // Get existing customer first
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Customer not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check (HM can access all branches)
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this customer's branch" });
        return;
      }

      // Check if any job orders reference this customer
      const { count: joCount, error: joError } = await supabaseAdmin
        .from("job_orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);

      if (joError) {
        res.status(500).json({ error: joError.message });
        return;
      }

      if ((joCount ?? 0) > 0) {
        // Soft delete: customer has job order references
        const { error } = await supabaseAdmin
          .from("customers")
          .update({ status: "inactive" as "active" | "inactive" })
          .eq("id", customerId);

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        // Log soft delete with correct user
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "UPDATE",
            p_entity_type: "CUSTOMER",
            p_entity_id: customerId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { status: "inactive", reason: "soft_delete" },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Customer deactivated (has existing job orders)" });
      } else {
        // Hard delete: no job order references
        // Delete associated vehicles first
        await supabaseAdmin
          .from("vehicles")
          .delete()
          .eq("customer_id", customerId);

        // Delete audit logs referencing this customer
        await supabaseAdmin
          .from("audit_logs")
          .delete()
          .eq("entity_type", "CUSTOMER")
          .eq("entity_id", customerId);

        const { error } = await supabaseAdmin
          .from("customers")
          .delete()
          .eq("id", customerId);

        if (error) {
          // FK constraint — fallback to soft delete
          if (error.code === "23503") {
            await supabaseAdmin
              .from("customers")
              .update({ status: "inactive" as "active" | "inactive" })
              .eq("id", customerId);

            res.json({ message: "Customer deactivated (referenced by other records)" });
            return;
          }
          res.status(500).json({ error: error.message });
          return;
        }

        // Log hard delete with correct user
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "DELETE",
            p_entity_type: "CUSTOMER",
            p_entity_id: customerId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { name: existing.full_name, deleted: true },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Customer deleted permanently" });
      }
    } catch (error) {
      console.error("Delete customer error:", error);
      await logFailedAction(req, "DELETE", "CUSTOMER", (req.params.customerId as string) || null, error instanceof Error ? error.message : "Failed to delete customer");
      res.status(500).json({ error: "Failed to delete customer" });
    }
  }
);

export default router;