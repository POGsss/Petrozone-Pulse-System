import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireAdmin, requireManagement } from "../middleware/auth.middleware.js";
import type { UserRole } from "../types/database.types.js";

const router = Router();

// All RBAC routes require authentication
router.use(requireAuth);

/**
 * GET /api/rbac/roles
 * Get all available roles (for management UI)
 */
router.get("/roles", requireManagement, async (_req: Request, res: Response): Promise<void> => {
  // Return the list of available roles with descriptions
  // Note: ADMIN role has been merged into HM
  const roles = [
    { code: "HM", name: "Head Manager", description: "Full system access, user and branch management, multi-branch oversight" },
    { code: "POC", name: "POC Supervisor", description: "Branch operations, approvals, and staff management" },
    { code: "JS", name: "Junior Supervisor", description: "Daily operations and technician supervision" },
    { code: "R", name: "Receptionist", description: "Customer intake, quotations, and daily reports" },
    { code: "T", name: "Technician", description: "Job execution and status updates" },
  ];

  res.json(roles);
});

/**
 * GET /api/rbac/users
 * Get all users with their roles and branch assignments
 * HM only
 */
router.get("/users", requireManagement, async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from("user_profiles")
      .select(`
        *,
        user_roles(role),
        user_branch_assignments(
          branch_id,
          is_primary,
          branches(id, name, code)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Transform the data for easier consumption
    const transformedUsers = users?.map((user) => ({
      ...user,
      roles: user.user_roles?.map((r: { role: UserRole }) => r.role) ?? [],
      branches: user.user_branch_assignments ?? [],
      user_roles: undefined,
      user_branch_assignments: undefined,
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/**
 * POST /api/rbac/users
 * Create a new user with roles and branch assignments
 * Admin only
 */
router.post("/users", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, phone, roles, branch_ids } = req.body;

    // Validation
    if (!email || !password || !full_name) {
      res.status(400).json({ error: "Email, password, and full name are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      res.status(400).json({ error: "At least one role is required" });
      return;
    }

    // Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      res.status(400).json({ error: authError.message });
      return;
    }

    // Update profile (created automatically by trigger, but we update with full info)
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .update({ full_name, phone })
      .eq("id", authUser.user.id);

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    // Assign roles
    const roleInserts = roles.map((role: UserRole) => ({
      user_id: authUser.user.id,
      role,
    }));

    const { error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .insert(roleInserts);

    if (rolesError) {
      console.error("Roles insert error:", rolesError);
    }

    // Assign branches
    if (branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0) {
      const branchInserts = branch_ids.map((branch_id: string, index: number) => ({
        user_id: authUser.user.id,
        branch_id,
        is_primary: index === 0, // First branch is primary
      }));

      const { error: branchError } = await supabaseAdmin
        .from("user_branch_assignments")
        .insert(branchInserts);

      if (branchError) {
        console.error("Branch assignment error:", branchError);
      }
    }

    // Fetch the complete user data
    const { data: user } = await supabaseAdmin
      .from("user_profiles")
      .select(`
        *,
        user_roles(role),
        user_branch_assignments(
          branch_id,
          is_primary,
          branches(id, name, code)
        )
      `)
      .eq("id", authUser.user.id)
      .single();

    res.status(201).json({
      ...user,
      roles: user?.user_roles?.map((r: { role: UserRole }) => r.role) ?? [],
      branches: user?.user_branch_assignments ?? [],
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

/**
 * PUT /api/rbac/users/:userId/roles
 * Update a user's roles
 * Admin only
 */
router.put("/users/:userId/roles", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId as string;
    const { roles } = req.body;

    if (!roles || !Array.isArray(roles)) {
      res.status(400).json({ error: "Roles array is required" });
      return;
    }

    // Prevent removing all roles
    if (roles.length === 0) {
      res.status(400).json({ error: "User must have at least one role" });
      return;
    }

    // Delete existing roles
    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    // Insert new roles
    const roleInserts = roles.map((role: UserRole) => ({
      user_id: userId,
      role,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert(roleInserts);

    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }

    res.json({ message: "Roles updated successfully", roles });
  } catch (error) {
    console.error("Update roles error:", error);
    res.status(500).json({ error: "Failed to update roles" });
  }
});

/**
 * PUT /api/rbac/users/:userId/branches
 * Update a user's branch assignments
 * Admin only
 */
router.put("/users/:userId/branches", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId as string;
    const { branch_ids, primary_branch_id } = req.body;

    if (!branch_ids || !Array.isArray(branch_ids)) {
      res.status(400).json({ error: "Branch IDs array is required" });
      return;
    }

    // Delete existing assignments
    const { error: deleteError } = await supabaseAdmin
      .from("user_branch_assignments")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    // Insert new assignments
    if (branch_ids.length > 0) {
      const branchInserts = branch_ids.map((branch_id: string) => ({
        user_id: userId,
        branch_id,
        is_primary: branch_id === primary_branch_id || (branch_ids.indexOf(branch_id) === 0 && !primary_branch_id),
      }));

      const { error: insertError } = await supabaseAdmin
        .from("user_branch_assignments")
        .insert(branchInserts);

      if (insertError) {
        res.status(500).json({ error: insertError.message });
        return;
      }
    }

    res.json({ message: "Branch assignments updated successfully", branch_ids });
  } catch (error) {
    console.error("Update branches error:", error);
    res.status(500).json({ error: "Failed to update branch assignments" });
  }
});

/**
 * PUT /api/rbac/users/:userId/status
 * Activate or deactivate a user
 * Admin only
 */
router.put("/users/:userId/status", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId as string;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      res.status(400).json({ error: "is_active boolean is required" });
      return;
    }

    // Prevent deactivating yourself
    if (req.user!.id === userId && !is_active) {
      res.status(400).json({ error: "Cannot deactivate your own account" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update({ is_active })
      .eq("id", userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ message: `User ${is_active ? "activated" : "deactivated"} successfully` });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ error: "Failed to update user status" });
  }
});

/**
 * PUT /api/rbac/users/:userId
 * Update a user's profile (full_name, phone, is_active)
 * Admin only
 */
router.put("/users/:userId", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId as string;
    const { full_name, phone, is_active } = req.body;

    // Build update object
    const updateData: { full_name?: string; phone?: string; is_active?: boolean } = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone !== undefined) updateData.phone = phone;
    if (is_active !== undefined) {
      // Prevent deactivating yourself
      if (req.user!.id === userId && !is_active) {
        res.status(400).json({ error: "Cannot deactivate your own account" });
        return;
      }
      updateData.is_active = is_active;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const { data: user, error } = await supabaseAdmin
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

/**
 * DELETE /api/rbac/users/:userId
 * Delete a user (removes auth user and cascades to profile/roles/branches)
 * Admin only
 */
router.delete("/users/:userId", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId as string;

    // Prevent deleting yourself
    if (req.user!.id === userId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    // Delete the auth user (this cascades to user_profiles via trigger/RLS)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      res.status(500).json({ error: authError.message });
      return;
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
