import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";
import type { SupplierInsert, SupplierUpdate } from "../types/database.types.js";

const router = Router();

// All supplier routes require authentication
router.use(requireAuth);

// RBAC: HM, POC, JS for all supplier operations (UC53–UC56)
const requireSupplierAccess = requireRoles("HM", "POC", "JS");

/**
 * GET /api/suppliers
 * Get suppliers with filtering and pagination
 * HM sees all, others see only their branch-scoped suppliers
 */
router.get(
  "/",
  requireSupplierAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("suppliers")
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
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `supplier_name.ilike.${searchTerm},contact_person.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: suppliers, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: suppliers,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get suppliers error:", error);
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  }
);

/**
 * GET /api/suppliers/:supplierId
 * Get a single supplier by ID
 */
router.get(
  "/:supplierId",
  requireSupplierAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = req.params.supplierId as string;

      const { data: supplier, error } = await supabaseAdmin
        .from("suppliers")
        .select(`
          *,
          branches(id, name, code)
        `)
        .eq("id", supplierId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Supplier not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(supplier.branch_id)) {
        res.status(403).json({ error: "No access to this supplier" });
        return;
      }

      res.json(supplier);
    } catch (error) {
      console.error("Get supplier error:", error);
      res.status(500).json({ error: "Failed to fetch supplier" });
    }
  }
);

/**
 * POST /api/suppliers
 * Create a new supplier profile (UC53)
 */
router.post(
  "/",
  requireSupplierAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplier_name, contact_person, email, phone, address, status, branch_id, notes } = req.body;

      // Mandatory field validation
      if (!supplier_name?.trim()) {
        res.status(400).json({ error: "Supplier name is required" });
        return;
      }
      if (!contact_person?.trim()) {
        res.status(400).json({ error: "Contact person is required" });
        return;
      }
      if (!email?.trim()) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      if (!phone?.trim()) {
        res.status(400).json({ error: "Phone is required" });
        return;
      }
      if (!address?.trim()) {
        res.status(400).json({ error: "Address is required" });
        return;
      }
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({ error: "Invalid email format" });
        return;
      }

      // Phone validation (7-20 digits)
      const phoneDigits = phone.replace(/[^0-9]/g, "");
      if (phoneDigits.length < 7 || phoneDigits.length > 20) {
        res.status(400).json({ error: "Phone number must be between 7 and 20 digits" });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(branch_id)) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const supplierData: SupplierInsert = {
        supplier_name: supplier_name.trim(),
        contact_person: contact_person.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        status: status || "active",
        branch_id,
        notes: notes?.trim() || null,
        created_by: req.user!.id,
      };

      const { data: supplier, error } = await supabaseAdmin
        .from("suppliers")
        .insert(supplierData)
        .select(`
          *,
          branches(id, name, code)
        `)
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log: CREATE supplier
      try {
        const userBranch = req.user!.branchIds[0] || null;
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "CREATE",
          p_entity_type: "SUPPLIER",
          p_entity_id: supplier.id,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: userBranch,
          p_new_values: supplierData,
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.status(201).json(supplier);
    } catch (error) {
      console.error("Create supplier error:", error);
      await logFailedAction(req, "CREATE", "SUPPLIER", null, error instanceof Error ? error.message : "Failed to create supplier");
      res.status(500).json({ error: "Failed to create supplier" });
    }
  }
);

/**
 * PUT /api/suppliers/:supplierId
 * Update a supplier profile (UC55)
 */
router.put(
  "/:supplierId",
  requireSupplierAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = req.params.supplierId as string;
      const { supplier_name, contact_person, email, phone, address, status, notes } = req.body;

      // Check if supplier exists
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this supplier" });
        return;
      }

      // Email format validation if provided
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          res.status(400).json({ error: "Invalid email format" });
          return;
        }
      }

      // Phone validation if provided
      if (phone) {
        const phoneDigits = phone.replace(/[^0-9]/g, "");
        if (phoneDigits.length < 7 || phoneDigits.length > 20) {
          res.status(400).json({ error: "Phone number must be between 7 and 20 digits" });
          return;
        }
      }

      const updateData: SupplierUpdate = {};
      if (supplier_name !== undefined) updateData.supplier_name = supplier_name.trim();
      if (contact_person !== undefined) updateData.contact_person = contact_person.trim();
      if (email !== undefined) updateData.email = email.trim().toLowerCase();
      if (phone !== undefined) updateData.phone = phone.trim();
      if (address !== undefined) updateData.address = address.trim();
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes?.trim() || null;

      // Filter out fields that haven't actually changed
      const changedData = filterUnchangedFields(updateData, existing as unknown as Record<string, unknown>);
      if (Object.keys(changedData).length === 0) {
        res.json(existing);
        return;
      }

      const { data: supplier, error } = await supabaseAdmin
        .from("suppliers")
        .update(changedData)
        .eq("id", supplierId)
        .select(`
          *,
          branches(id, name, code)
        `)
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log: UPDATE supplier
      try {
        const userBranch = req.user!.branchIds[0] || null;
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "SUPPLIER",
          p_entity_id: supplierId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: userBranch,
          p_old_values: existing as unknown as Record<string, string>,
          p_new_values: changedData as unknown as Record<string, string>,
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(supplier);
    } catch (error) {
      console.error("Update supplier error:", error);
      await logFailedAction(req, "UPDATE", "SUPPLIER", req.params.supplierId as string || null, error instanceof Error ? error.message : "Failed to update supplier");
      res.status(500).json({ error: "Failed to update supplier" });
    }
  }
);

/**
 * DELETE /api/suppliers/:supplierId
 * Delete a supplier profile (UC56)
 * Soft-delete by setting status to inactive if referenced, otherwise hard delete
 */
router.delete(
  "/:supplierId",
  requireSupplierAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = req.params.supplierId as string;

      // Check if supplier exists
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this supplier" });
        return;
      }

      // Check if supplier is referenced by purchase orders
      const { data: poRefs } = await supabaseAdmin
        .from("purchase_orders")
        .select("id")
        .eq("supplier_name", existing.supplier_name)
        .limit(1);

      if (poRefs && poRefs.length > 0) {
        // Soft delete - deactivate
        const { error } = await supabaseAdmin
          .from("suppliers")
          .update({ status: "inactive" as const })
          .eq("id", supplierId);

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        // Audit log soft delete
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "UPDATE",
            p_entity_type: "SUPPLIER",
            p_entity_id: supplierId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { status: "inactive", reason: "soft_delete" },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Supplier deactivated (referenced by purchase orders)" });
        return;
      }

      // Hard delete
      const { error } = await supabaseAdmin
        .from("suppliers")
        .delete()
        .eq("id", supplierId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log hard delete
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "SUPPLIER",
          p_entity_id: supplierId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { deleted: true },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Supplier deleted successfully" });
    } catch (error) {
      console.error("Delete supplier error:", error);
      await logFailedAction(req, "DELETE", "SUPPLIER", req.params.supplierId as string || null, error instanceof Error ? error.message : "Failed to delete supplier");
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  }
);

export default router;
