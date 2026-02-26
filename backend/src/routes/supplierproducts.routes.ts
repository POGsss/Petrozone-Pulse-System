import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, filterUnchangedFields } from "../lib/auditLogger.js";
import type { SupplierProductInsert, SupplierProductUpdate } from "../types/database.types.js";

const router = Router();

// All supplier product routes require authentication
router.use(requireAuth);

// RBAC: HM, POC, JS for all supplier product operations (UC57–UC60)
const requireSupplierProductAccess = requireRoles("HM", "POC", "JS");

/**
 * GET /api/supplier-products
 * Get supplier products with filtering and pagination (UC58)
 */
router.get(
  "/",
  requireSupplierProductAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        supplier_id,
        status,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("supplier_products")
        .select(
          `
          *,
          suppliers(id, supplier_name),
          inventory_items(id, item_name, sku_code, unit_of_measure),
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
      if (supplier_id) {
        query = query.eq("supplier_id", supplier_id as string);
      }
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `product_name.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: products, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: products,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get supplier products error:", error);
      res.status(500).json({ error: "Failed to fetch supplier products" });
    }
  }
);

/**
 * GET /api/supplier-products/:id
 * Get a single supplier product by ID
 */
router.get(
  "/:id",
  requireSupplierProductAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = req.params.id as string;

      const { data: product, error } = await supabaseAdmin
        .from("supplier_products")
        .select(`
          *,
          suppliers(id, supplier_name),
          inventory_items(id, item_name, sku_code, unit_of_measure),
          branches(id, name, code)
        `)
        .eq("id", productId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Supplier product not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(product.branch_id)) {
        res.status(403).json({ error: "No access to this supplier product" });
        return;
      }

      res.json(product);
    } catch (error) {
      console.error("Get supplier product error:", error);
      res.status(500).json({ error: "Failed to fetch supplier product" });
    }
  }
);

/**
 * POST /api/supplier-products
 * Create a new supplier product (UC57)
 */
router.post(
  "/",
  requireSupplierProductAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplier_id, inventory_item_id, product_name, unit_cost, lead_time_days, branch_id } = req.body;

      // Mandatory field validation
      if (!supplier_id) {
        res.status(400).json({ error: "Supplier is required" });
        return;
      }
      if (!product_name?.trim()) {
        res.status(400).json({ error: "Product name is required" });
        return;
      }
      if (unit_cost === undefined || unit_cost === null || unit_cost < 0) {
        res.status(400).json({ error: "Unit cost is required and must be non-negative" });
        return;
      }
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Validate lead_time_days if provided
      if (lead_time_days !== undefined && lead_time_days !== null && lead_time_days < 0) {
        res.status(400).json({ error: "Lead time days must be non-negative" });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(branch_id)) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Verify supplier exists and belongs to same branch
      const { data: supplier, error: supplierError } = await supabaseAdmin
        .from("suppliers")
        .select("id, branch_id")
        .eq("id", supplier_id)
        .single();

      if (supplierError || !supplier) {
        res.status(400).json({ error: "Supplier not found" });
        return;
      }

      // Enforce one-to-one constraint at API level if inventory_item_id is provided
      if (inventory_item_id) {
        // Verify inventory item exists
        const { data: invItem, error: invError } = await supabaseAdmin
          .from("inventory_items")
          .select("id")
          .eq("id", inventory_item_id)
          .single();

        if (invError || !invItem) {
          res.status(400).json({ error: "Inventory item not found" });
          return;
        }

        // Check one-to-one: no other active supplier product should reference this inventory item
        const { data: existingLink } = await supabaseAdmin
          .from("supplier_products")
          .select("id, suppliers(supplier_name)")
          .eq("inventory_item_id", inventory_item_id)
          .eq("status", "active")
          .limit(1);

        if (existingLink && existingLink.length > 0) {
          res.status(400).json({
            error: "This inventory item is already linked to another active supplier product. One product can only belong to one supplier.",
          });
          return;
        }
      }

      const productData: SupplierProductInsert = {
        supplier_id,
        inventory_item_id: inventory_item_id || null,
        product_name: product_name.trim(),
        unit_cost: parseFloat(unit_cost),
        lead_time_days: lead_time_days !== undefined && lead_time_days !== null ? parseInt(lead_time_days) : null,
        status: "active",
        branch_id,
        created_by: req.user!.id,
      };

      const { data: product, error } = await supabaseAdmin
        .from("supplier_products")
        .insert(productData)
        .select(`
          *,
          suppliers(id, supplier_name),
          inventory_items(id, item_name, sku_code, unit_of_measure),
          branches(id, name, code)
        `)
        .single();

      if (error) {
        // Handle unique constraint violation
        if (error.code === "23505") {
          res.status(400).json({
            error: "This inventory item is already linked to another active supplier product.",
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log: CREATE supplier product
      try {
        const userBranch = req.user!.branchIds[0] || null;
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "CREATE",
          p_entity_type: "SUPPLIER_PRODUCT",
          p_entity_id: product.id,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: userBranch,
          p_new_values: productData,
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.status(201).json(product);
    } catch (error) {
      console.error("Create supplier product error:", error);
      await logFailedAction(req, "CREATE", "SUPPLIER_PRODUCT", null, error instanceof Error ? error.message : "Failed to create supplier product");
      res.status(500).json({ error: "Failed to create supplier product" });
    }
  }
);

/**
 * PUT /api/supplier-products/:id
 * Update a supplier product (UC59)
 */
router.put(
  "/:id",
  requireSupplierProductAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = req.params.id as string;
      const { supplier_id, inventory_item_id, product_name, unit_cost, lead_time_days, status } = req.body;

      // Check if product exists
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("supplier_products")
        .select("*")
        .eq("id", productId)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Supplier product not found" });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this supplier product" });
        return;
      }

      // Validate unit_cost if provided
      if (unit_cost !== undefined && unit_cost < 0) {
        res.status(400).json({ error: "Unit cost must be non-negative" });
        return;
      }

      // Validate lead_time_days if provided
      if (lead_time_days !== undefined && lead_time_days !== null && lead_time_days < 0) {
        res.status(400).json({ error: "Lead time days must be non-negative" });
        return;
      }

      // One-to-one constraint check if inventory_item_id is being changed
      if (inventory_item_id !== undefined && inventory_item_id !== existing.inventory_item_id) {
        if (inventory_item_id) {
          // Verify inventory item exists
          const { data: invItem, error: invError } = await supabaseAdmin
            .from("inventory_items")
            .select("id")
            .eq("id", inventory_item_id)
            .single();

          if (invError || !invItem) {
            res.status(400).json({ error: "Inventory item not found" });
            return;
          }

          // Check one-to-one constraint
          const { data: existingLink } = await supabaseAdmin
            .from("supplier_products")
            .select("id")
            .eq("inventory_item_id", inventory_item_id)
            .eq("status", "active")
            .neq("id", productId)
            .limit(1);

          if (existingLink && existingLink.length > 0) {
            res.status(400).json({
              error: "This inventory item is already linked to another active supplier product.",
            });
            return;
          }
        }
      }

      const updateData: SupplierProductUpdate = {};
      if (supplier_id !== undefined) updateData.supplier_id = supplier_id;
      if (inventory_item_id !== undefined) updateData.inventory_item_id = inventory_item_id || null;
      if (product_name !== undefined) updateData.product_name = product_name.trim();
      if (unit_cost !== undefined) updateData.unit_cost = parseFloat(unit_cost);
      if (lead_time_days !== undefined) updateData.lead_time_days = lead_time_days !== null ? parseInt(lead_time_days) : null;
      if (status !== undefined) updateData.status = status;

      // Filter out unchanged fields
      const changedData = filterUnchangedFields(updateData, existing as unknown as Record<string, unknown>);
      if (Object.keys(changedData).length === 0) {
        res.json(existing);
        return;
      }

      const { data: product, error } = await supabaseAdmin
        .from("supplier_products")
        .update(changedData)
        .eq("id", productId)
        .select(`
          *,
          suppliers(id, supplier_name),
          inventory_items(id, item_name, sku_code, unit_of_measure),
          branches(id, name, code)
        `)
        .single();

      if (error) {
        if (error.code === "23505") {
          res.status(400).json({
            error: "This inventory item is already linked to another active supplier product.",
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log: UPDATE supplier product
      try {
        const userBranch = req.user!.branchIds[0] || null;
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "SUPPLIER_PRODUCT",
          p_entity_id: productId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: userBranch,
          p_old_values: existing as unknown as Record<string, string>,
          p_new_values: changedData as unknown as Record<string, string>,
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(product);
    } catch (error) {
      console.error("Update supplier product error:", error);
      await logFailedAction(req, "UPDATE", "SUPPLIER_PRODUCT", req.params.id as string || null, error instanceof Error ? error.message : "Failed to update supplier product");
      res.status(500).json({ error: "Failed to update supplier product" });
    }
  }
);

/**
 * DELETE /api/supplier-products/:id
 * Hard-delete a supplier product (UC60)
 */
router.delete(
  "/:id",
  requireSupplierProductAccess,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = req.params.id as string;

      // Check if product exists
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("supplier_products")
        .select("*")
        .eq("id", productId)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Supplier product not found" });
        return;
      }

      // Branch access check for non-HM users
      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this supplier product" });
        return;
      }

      // Hard delete: permanently remove from database
      const { error } = await supabaseAdmin
        .from("supplier_products")
        .delete()
        .eq("id", productId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Audit log: DELETE supplier product (capture details before removal)
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "SUPPLIER_PRODUCT",
          p_entity_id: productId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            product_name: existing.product_name,
            unit_cost: existing.unit_cost,
            supplier_id: existing.supplier_id,
            inventory_item_id: existing.inventory_item_id,
            deleted: true,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Supplier product deleted successfully" });
    } catch (error) {
      console.error("Delete supplier product error:", error);
      await logFailedAction(req, "DELETE", "SUPPLIER_PRODUCT", req.params.id as string || null, error instanceof Error ? error.message : "Failed to delete supplier product");
      res.status(500).json({ error: "Failed to delete supplier product" });
    }
  }
);

export default router;
