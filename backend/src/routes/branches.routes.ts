import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireBranchManager, requireBranchAccess } from "../middleware/auth.middleware.js";
import type { BranchInsert, BranchUpdate } from "../types/database.types.js";

const router = Router();

// All branch routes require authentication
router.use(requireAuth);

/**
 * GET /api/branches
 * Get all branches the current user has access to
 * HM users get all branches, others get branches based on assignments
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // HM users have access to all branches - use supabaseAdmin for faster query
    const isHM = req.user?.roles.includes("HM");
    
    if (isHM) {
      const { data: branches, error } = await supabaseAdmin
        .from("branches")
        .select("*")
        .order("name");

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(branches);
      return;
    }

    // For other users, use RLS to filter based on assignments
    const { data: branches, error } = await req.supabase!
      .from("branches")
      .select("*")
      .order("name");

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(branches);
  } catch (error) {
    console.error("Get branches error:", error);
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

/**
 * GET /api/branches/:branchId
 * Get a specific branch by ID
 */
router.get(
  "/:branchId",
  requireBranchAccess((req) => req.params.branchId as string),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const branchId = req.params.branchId as string;

      const { data: branch, error } = await req.supabase!
        .from("branches")
        .select("*")
        .eq("id", branchId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Branch not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(branch);
    } catch (error) {
      console.error("Get branch error:", error);
      res.status(500).json({ error: "Failed to fetch branch" });
    }
  }
);

/**
 * POST /api/branches
 * Create a new branch
 * HM, POC, JS, R can create (US1)
 */
router.post("/", requireBranchManager, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, code, address, phone, email } = req.body;

    // Validation
    if (!name || !code) {
      res.status(400).json({ error: "Name and code are required" });
      return;
    }

    // Check for duplicate code
    const { data: existing } = await supabaseAdmin
      .from("branches")
      .select("id")
      .eq("code", code)
      .single();

    if (existing) {
      res.status(400).json({ error: "Branch code already exists" });
      return;
    }

    const branchData: BranchInsert = {
      name,
      code: code.toUpperCase(),
      address,
      phone,
      email,
    };

    const { data: branch, error } = await supabaseAdmin
      .from("branches")
      .insert(branchData)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Log audit: CREATE branch (performed by admin)
    const adminPrimaryBranch = req.user!.branchIds[0] || null;
    await supabaseAdmin.rpc("log_admin_action", {
      p_action: "CREATE",
      p_entity_type: "BRANCH",
      p_entity_id: branch.id,
      p_performed_by_user_id: req.user!.id,
      p_performed_by_branch_id: adminPrimaryBranch,
      p_new_values: { name, code, address, phone, email },
    });

    res.status(201).json(branch);
  } catch (error) {
    console.error("Create branch error:", error);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

/**
 * PUT /api/branches/:branchId
 * Update a branch
 * HM, POC, JS, R can update (US2)
 */
router.put("/:branchId", requireBranchManager, async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = req.params.branchId as string;
    const { name, code, address, phone, email, is_active } = req.body;

    // Check if branch exists
    const { data: existing } = await supabaseAdmin
      .from("branches")
      .select("id, code")
      .eq("id", branchId)
      .single();

    if (!existing) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }

    // Check for duplicate code if code is being changed
    if (code && code !== existing.code) {
      const { data: duplicateCode } = await supabaseAdmin
        .from("branches")
        .select("id")
        .eq("code", code)
        .neq("id", branchId)
        .single();

      if (duplicateCode) {
        res.status(400).json({ error: "Branch code already exists" });
        return;
      }
    }

    const updateData: BranchUpdate = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code.toUpperCase();
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: branch, error } = await supabaseAdmin
      .from("branches")
      .update(updateData)
      .eq("id", branchId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Log audit: UPDATE branch (performed by admin)
    const adminPrimaryBranch = req.user!.branchIds[0] || null;
    await supabaseAdmin.rpc("log_admin_action", {
      p_action: "UPDATE",
      p_entity_type: "BRANCH",
      p_entity_id: branchId,
      p_performed_by_user_id: req.user!.id,
      p_performed_by_branch_id: adminPrimaryBranch,
      p_new_values: updateData,
    });

    res.json(branch);
  } catch (error) {
    console.error("Update branch error:", error);
    res.status(500).json({ error: "Failed to update branch" });
  }
});

/**
 * DELETE /api/branches/:branchId
 * Soft delete a branch (set is_active to false)
 * HM, POC, JS, R can delete (US3)
 */
router.delete("/:branchId", requireBranchManager, async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = req.params.branchId as string;

    // Check if branch has assigned users
    const { data: assignments } = await supabaseAdmin
      .from("user_branch_assignments")
      .select("id")
      .eq("branch_id", branchId)
      .limit(1);

    if (assignments && assignments.length > 0) {
      // Soft delete instead of hard delete
      const { error } = await supabaseAdmin
        .from("branches")
        .update({ is_active: false })
        .eq("id", branchId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Log soft delete
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "BRANCH",
          p_entity_id: branchId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { is_active: false, reason: "soft_delete" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Branch deactivated (has assigned users)" });
      return;
    }

    // Hard delete if no users assigned
    const { error } = await supabaseAdmin
      .from("branches")
      .delete()
      .eq("id", branchId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Log hard delete
    try {
      await supabaseAdmin.rpc("log_admin_action", {
        p_action: "DELETE",
        p_entity_type: "BRANCH",
        p_entity_id: branchId,
        p_performed_by_user_id: req.user!.id,
        p_performed_by_branch_id: req.user!.branchIds[0] || null,
        p_new_values: { deleted: true },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
    }

    res.json({ message: "Branch deleted successfully" });
  } catch (error) {
    console.error("Delete branch error:", error);
    res.status(500).json({ error: "Failed to delete branch" });
  }
});

/**
 * GET /api/branches/:branchId/users
 * Get all users assigned to a specific branch
 */
router.get(
  "/:branchId/users",
  requireBranchAccess((req) => req.params.branchId as string),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const branchId = req.params.branchId as string;

      const { data: assignments, error } = await supabaseAdmin
        .from("user_branch_assignments")
        .select(`
          user_id,
          is_primary,
          user_profiles(id, email, full_name, phone, is_active),
          user_roles:user_profiles(user_roles(role))
        `)
        .eq("branch_id", branchId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fetch roles separately for each user
      const userIds = assignments?.map(a => a.user_id) ?? [];
      const { data: userRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      // Group roles by user
      const rolesByUser = userRoles?.reduce((acc, ur) => {
        if (!acc[ur.user_id]) acc[ur.user_id] = [];
        acc[ur.user_id]!.push(ur.role);
        return acc;
      }, {} as Record<string, string[]>) ?? {};

      const users = assignments?.map((a) => ({
        ...a.user_profiles,
        is_primary: a.is_primary,
        roles: rolesByUser[a.user_id] ?? [],
      }));

      res.json(users);
    } catch (error) {
      console.error("Get branch users error:", error);
      res.status(500).json({ error: "Failed to fetch branch users" });
    }
  }
);

export default router;
