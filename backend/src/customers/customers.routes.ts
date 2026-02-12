import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles, requireBranchAccess } from "../middleware/auth.middleware.js";

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

      // Update audit log with user_id (the trigger sets user_id to NULL)
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "CUSTOMER")
        .eq("entity_id", customer.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.status(201).json(customer);
    } catch (error) {
      console.error("Create customer error:", error);
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

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .update(updateData)
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

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "CUSTOMER")
        .eq("entity_id", customerId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json(customer);
    } catch (error) {
      console.error("Update customer error:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  }
);

/**
 * DELETE /api/customers/:customerId
 * Delete a customer
 * POC, JS, R can delete
 */
router.delete(
  "/:customerId",
  requireRoles("POC", "JS", "R"),
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

      // Branch access check
      if (!req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this customer's branch" });
        return;
      }

      const { error } = await supabaseAdmin
        .from("customers")
        .delete()
        .eq("id", customerId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "CUSTOMER")
        .eq("entity_id", customerId)
        .eq("action", "DELETE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      console.error("Delete customer error:", error);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  }
);

export default router;
