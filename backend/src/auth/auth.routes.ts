import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Frontend URL for password reset redirect
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
router.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    // Check if user exists in our system
    const { data: userExists } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (!userExists) {
      // Return success even if user doesn't exist (security - don't reveal if email exists)
      res.json({ message: "If an account exists with this email, a reset link will be sent." });
      return;
    }

    // Send password reset email via Supabase
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${FRONTEND_URL}/reset-password`,
    });

    if (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ error: "Failed to send reset email" });
      return;
    }

    res.json({ message: "If an account exists with this email, a reset link will be sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using the token from the email link
 */
router.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
  try {
    const { access_token, new_password } = req.body;

    if (!access_token || !new_password) {
      res.status(400).json({ error: "Access token and new password are required" });
      return;
    }

    if (new_password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    // Get user from the access token
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(access_token);

    if (userError || !userData.user) {
      res.status(401).json({ error: "Invalid or expired reset link" });
      return;
    }

    // Update the user's password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userData.user.id,
      { password: new_password }
    );

    if (updateError) {
      res.status(500).json({ error: "Failed to reset password" });
      return;
    }

    res.json({ message: "Password has been reset successfully. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      res.status(401).json({ error: error.message });
      return;
    }

    // Log the login event
    try {
      await supabaseAdmin.rpc("log_auth_event", {
        p_event_type: "LOGIN",
        p_user_id: data.user.id,
      });
    } catch (rpcError) {
      console.error("RPC log_auth_event error:", rpcError);
    }

    // Use the security definer function to get user data (bypasses RLS)
    const { data: userData, error: userDataError } = await supabaseAdmin.rpc("get_user_full_data", {
      p_user_id: data.user.id,
    });

    console.log("User data from RPC:", userData);
    if (userDataError) {
      console.error("User data RPC error:", userDataError);
    }

    // Extract data from the RPC result (cast to any since the function returns JSON)
    const userDataObj = userData as { profile: any; roles: string[]; branches: any[] } | null;
    const profile = userDataObj?.profile || null;
    const userRoles = userDataObj?.roles || [];
    const branchAssignments = userDataObj?.branches || [];

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        profile,
        roles: userRoles || [],
        branches: branchAssignments || [],
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user
 */
router.post("/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Log the logout event before invalidating the session
    await supabaseAdmin.rpc("log_auth_event", {
      p_event_type: "LOGOUT",
      p_user_id: req.user!.id,
    });

    // Sign out the user
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (token) {
      await supabaseAdmin.auth.admin.signOut(token);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh the access token using refresh token
 */
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user's information
 */
router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Use the security definer function to get user data (bypasses RLS)
    const { data: userData, error: userDataError } = await supabaseAdmin.rpc("get_user_full_data", {
      p_user_id: req.user!.id,
    });

    if (userDataError) {
      console.error("User data RPC error:", userDataError);
    }

    // Extract data from the RPC result (cast to any since the function returns JSON)
    const userDataObj = userData as { profile: any; roles: string[]; branches: any[] } | null;
    const profile = userDataObj?.profile || null;
    const userRoles = userDataObj?.roles || [];
    const branchAssignments = userDataObj?.branches || [];

    res.json({
      id: req.user!.id,
      email: req.user!.email,
      profile,
      roles: userRoles,
      branches: branchAssignments,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user information" });
  }
});

/**
 * POST /api/auth/change-password
 * Change the current user's password
 */
router.post("/change-password", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current password and new password are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabaseAdmin.auth.signInWithPassword({
      email: req.user!.email,
      password: currentPassword,
    });

    if (verifyError) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user!.id,
      { password: newPassword }
    );

    if (updateError) {
      res.status(500).json({ error: "Failed to update password" });
      return;
    }

    // Log the password change event
    const userPrimaryBranch = req.user!.branchIds[0] || null;
    await supabaseAdmin.rpc("log_admin_action", {
      p_action: "UPDATE",
      p_entity_type: "password",
      p_entity_id: req.user!.id,
      p_performed_by_user_id: req.user!.id,
      p_performed_by_branch_id: userPrimaryBranch,
    });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

/**
 * PUT /api/auth/profile
 * Update the current user's profile information
 */
router.put("/profile", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { full_name, phone, email } = req.body;

    // Validate input
    if (!full_name || full_name.trim().length === 0) {
      res.status(400).json({ error: "Full name is required" });
      return;
    }

    // Update user_profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        full_name: full_name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || req.user!.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.user!.id)
      .select()
      .single();

    if (profileError) {
      console.error("Profile update error:", profileError);
      res.status(500).json({ error: "Failed to update profile" });
      return;
    }

    // If email was changed, update in auth.users as well
    if (email && email.trim() !== req.user!.email) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        req.user!.id,
        { email: email.trim() }
      );

      if (authError) {
        console.error("Auth email update error:", authError);
        // Revert the profile change
        await supabaseAdmin
          .from("user_profiles")
          .update({ email: req.user!.email })
          .eq("id", req.user!.id);
        res.status(500).json({ error: "Failed to update email" });
        return;
      }
    }

    // Log the profile update event
    const userPrimaryBranch = req.user!.branchIds[0] || null;
    await supabaseAdmin.rpc("log_admin_action", {
      p_action: "UPDATE",
      p_entity_type: "user_profile",
      p_entity_id: req.user!.id,
      p_performed_by_user_id: req.user!.id,
      p_performed_by_branch_id: userPrimaryBranch,
      p_new_values: { full_name, phone, email },
    });

    res.json({ 
      message: "Profile updated successfully",
      profile 
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * GET /api/auth/profile
 * Get the current user's profile information
 */
router.get("/profile", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", req.user!.id)
      .single();

    if (error) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json({ profile });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

export default router;
