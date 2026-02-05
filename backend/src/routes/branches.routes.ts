import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireAdmin, requireBranchAccess } from "../middleware/auth.middleware.js";
import type { BranchInsert, BranchUpdate } from "../types/database.types.js";

const router = Router();

// All branch routes require authentication
router.use(requireAuth);

/**
 * GET /api/branches
 * Get all branches the current user has access to
 * Uses RLS to filter based on user's role and assignments
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // Use the user's authenticated Supabase client to respect RLS
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
 * Admin only
 */
router.post("/", requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

    res.status(201).json(branch);
  } catch (error) {
    console.error("Create branch error:", error);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

/**
 * PUT /api/branches/:branchId
 * Update a branch
 * Admin only
 */
router.put("/:branchId", requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

    res.json(branch);
  } catch (error) {
    console.error("Update branch error:", error);
    res.status(500).json({ error: "Failed to update branch" });
  }
});

/**
 * DELETE /api/branches/:branchId
 * Soft delete a branch (set is_active to false)
 * Admin only
 */
router.delete("/:branchId", requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
