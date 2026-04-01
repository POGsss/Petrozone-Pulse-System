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
// R needs read access for PO supplier selection
const requireSupplierAccess = requireRoles("HM", "POC", "JS");
const requireSupplierRead = requireRoles("HM", "POC", "JS", "R");

async function getSupplierBranchIds(supplierId: string, fallbackBranchId?: string): Promise<string[]> {
  const { data: assignments } = await (supabaseAdmin as any)
    .from("supplier_branch_assignments")
    .select("branch_id")
    .eq("supplier_id", supplierId);

  const assignmentBranchIds = (assignments || []).map((a: any) => a.branch_id as string);
  const all = [...assignmentBranchIds, ...(fallbackBranchId ? [fallbackBranchId] : [])];
  return Array.from(new Set(all));
}

function canAccessSupplier(user: NonNullable<Request["user"]>, supplierBranchIds: string[]): boolean {
  if (user.roles.includes("HM")) return true;
  return supplierBranchIds.some((branchId) => user.branchIds.includes(branchId));
}

/**
 * GET /api/suppliers
 * Get suppliers with filtering and pagination
 * HM sees all, others see only their branch-scoped suppliers
 */
router.get(
  "/",
  requireSupplierRead,
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
          branches(id, name, code),
          supplier_branch_assignments(branch_id, branches(id, name, code))
        `
        )
        .order("created_at", { ascending: false });

      // Apply filters
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `supplier_name.ilike.${searchTerm},contact_person.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
        );
      }

      const { data: suppliers, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const requestedBranchId = branch_id as string | undefined;
      const filteredSuppliers = (suppliers || []).filter((supplier: any) => {
        const assignmentBranchIds = (supplier.supplier_branch_assignments || []).map((a: any) => a.branch_id as string);
        const supplierBranchIds = Array.from(new Set([supplier.branch_id, ...assignmentBranchIds]));

        if (!canAccessSupplier(req.user!, supplierBranchIds)) {
          return false;
        }

        if (requestedBranchId && !supplierBranchIds.includes(requestedBranchId)) {
          return false;
        }

        return true;
      });

      const offsetNum = parseInt(offset as string);
      const limitNum = parseInt(limit as string);
      const paginated = filteredSuppliers.slice(offsetNum, offsetNum + limitNum);

      res.json({
        data: paginated,
        pagination: {
          total: filteredSuppliers.length,
          limit: limitNum,
          offset: offsetNum,
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
  requireSupplierRead,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = req.params.supplierId as string;

      const { data: supplier, error } = await supabaseAdmin
        .from("suppliers")
        .select(`
          *,
          branches(id, name, code),
          supplier_branch_assignments(branch_id, branches(id, name, code))
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

      const supplierBranchIds = await getSupplierBranchIds(supplier.id, supplier.branch_id);

      if (!canAccessSupplier(req.user!, supplierBranchIds)) {
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
      const { supplier_name, contact_person, email, phone, address, status, branch_id, branch_ids, notes } = req.body;

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
      const requestedBranchIdsRaw: string[] = Array.isArray(branch_ids)
        ? (branch_ids as string[])
        : branch_id
          ? [branch_id as string]
          : [];
      const requestedBranchIds = Array.from(new Set(requestedBranchIdsRaw.filter(Boolean)));

      if (requestedBranchIds.length === 0) {
        res.status(400).json({ error: "At least one branch assignment is required" });
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
      if (!req.user!.roles.includes("HM")) {
        const unauthorizedBranch = requestedBranchIds.find((id) => !req.user!.branchIds.includes(id));
        if (unauthorizedBranch) {
          res.status(403).json({ error: "No access to one or more selected branches" });
          return;
        }
      }

      const primaryBranchId = (branch_id as string) || requestedBranchIds[0]!;

      const supplierData: SupplierInsert = {
        supplier_name: supplier_name.trim(),
        contact_person: contact_person.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        status: status || "active",
        branch_id: primaryBranchId,
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

      const assignmentRows = requestedBranchIds.map((assignedBranchId) => ({
        supplier_id: supplier.id,
        branch_id: assignedBranchId,
      }));

      const { error: assignmentError } = await (supabaseAdmin as any)
        .from("supplier_branch_assignments")
        .insert(assignmentRows);

      if (assignmentError) {
        await supabaseAdmin.from("suppliers").delete().eq("id", supplier.id);
        res.status(500).json({ error: "Failed to assign supplier branches" });
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

      const supplierBranchIds = await getSupplierBranchIds(existing.id, existing.branch_id);

      if (!canAccessSupplier(req.user!, supplierBranchIds)) {
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

      // Prevent blanking required fields
      if (supplier_name !== undefined && !supplier_name.trim()) {
        res.status(400).json({ error: "Supplier name cannot be empty" });
        return;
      }
      if (contact_person !== undefined && !contact_person.trim()) {
        res.status(400).json({ error: "Contact person cannot be empty" });
        return;
      }
      if (email !== undefined && !email.trim()) {
        res.status(400).json({ error: "Email cannot be empty" });
        return;
      }
      if (phone !== undefined && !phone.trim()) {
        res.status(400).json({ error: "Phone cannot be empty" });
        return;
      }
      if (address !== undefined && !address.trim()) {
        res.status(400).json({ error: "Address cannot be empty" });
        return;
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
 * PUT /api/suppliers/:supplierId/branches
 * Update supplier branch assignments
 */
router.put(
  "/:supplierId/branches",
  requireSupplierAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = req.params.supplierId as string;
      const { branch_ids, primary_branch_id } = req.body as { branch_ids?: string[]; primary_branch_id?: string | null };

      if (!Array.isArray(branch_ids) || branch_ids.length === 0) {
        res.status(400).json({ error: "At least one branch assignment is required" });
        return;
      }

      const normalizedBranchIds = Array.from(new Set(branch_ids.filter(Boolean)));
      const primaryBranchId = primary_branch_id && normalizedBranchIds.includes(primary_branch_id)
        ? primary_branch_id
        : normalizedBranchIds[0]!;

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("suppliers")
        .select("id, branch_id")
        .eq("id", supplierId)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      const existingBranchIds = await getSupplierBranchIds(supplierId, existing.branch_id);
      if (!canAccessSupplier(req.user!, existingBranchIds)) {
        res.status(403).json({ error: "No access to this supplier" });
        return;
      }

      if (!req.user!.roles.includes("HM")) {
        const unauthorizedBranch = normalizedBranchIds.find((id) => !req.user!.branchIds.includes(id));
        if (unauthorizedBranch) {
          res.status(403).json({ error: "No access to one or more selected branches" });
          return;
        }
      }

      const { error: updateSupplierError } = await supabaseAdmin
        .from("suppliers")
        .update({ branch_id: primaryBranchId })
        .eq("id", supplierId);

      if (updateSupplierError) {
        res.status(500).json({ error: updateSupplierError.message });
        return;
      }

      const { error: clearError } = await (supabaseAdmin as any)
        .from("supplier_branch_assignments")
        .delete()
        .eq("supplier_id", supplierId);

      if (clearError) {
        res.status(500).json({ error: clearError.message });
        return;
      }

      const assignmentRows = normalizedBranchIds.map((branchId) => ({
        supplier_id: supplierId,
        branch_id: branchId,
      }));

      const { error: assignError } = await (supabaseAdmin as any)
        .from("supplier_branch_assignments")
        .insert(assignmentRows);

      if (assignError) {
        res.status(500).json({ error: assignError.message });
        return;
      }

      res.json({ message: "Supplier branch assignments updated successfully", branch_ids: normalizedBranchIds, primary_branch_id: primaryBranchId });
    } catch (error) {
      console.error("Update supplier branches error:", error);
      res.status(500).json({ error: "Failed to update supplier branches" });
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

      const supplierBranchIds = await getSupplierBranchIds(existing.id, existing.branch_id);

      if (!canAccessSupplier(req.user!, supplierBranchIds)) {
        res.status(403).json({ error: "No access to this supplier" });
        return;
      }

      // Check if supplier is referenced by purchase orders (use supplier_id FK, not name)
      const { data: poRefs } = await supabaseAdmin
        .from("purchase_orders")
        .select("id")
        .eq("supplier_id", supplierId)
        .neq("status", "deactivated")
        .limit(1);

      // Check if supplier has linked supplier products
      const { data: spRefs } = await supabaseAdmin
        .from("supplier_products")
        .select("id")
        .eq("supplier_id", supplierId)
        .limit(1);

      const hasReferences = (poRefs && poRefs.length > 0) || (spRefs && spRefs.length > 0);

      if (hasReferences) {
        // Soft delete - deactivate
        const { error } = await supabaseAdmin
          .from("suppliers")
          .update({ status: "inactive" as const })
          .eq("id", supplierId);

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        // Also deactivate linked supplier products
        if (spRefs && spRefs.length > 0) {
          await supabaseAdmin
            .from("supplier_products")
            .update({ status: "inactive" as const })
            .eq("supplier_id", supplierId);
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

        const reason = (poRefs && poRefs.length > 0)
          ? "Supplier deactivated (referenced by purchase orders)"
          : "Supplier deactivated (has linked supplier products)";
        res.json({ message: reason });
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
