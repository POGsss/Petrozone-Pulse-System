import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin, createSupabaseClient } from "../lib/supabase.js";
import type { UserRole, UserProfile } from "../types/database.types.js";

// Extend Express Request to include authenticated user info
export interface AuthenticatedUser {
  id: string;
  email: string;
  profile: UserProfile | null;
  roles: UserRole[];
  branchIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      supabase?: ReturnType<typeof createSupabaseClient>;
    }
  }
}

/**
 * Middleware to verify JWT and attach user info to request
 * This is the primary authentication gate for all protected routes
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      res.status(401).json({ error: "Missing access token" });
      return;
    }

    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Fetch user profile
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Check if user is active
    if (profile && !profile.is_active) {
      res.status(403).json({ error: "User account is deactivated" });
      return;
    }

    // Fetch user roles
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = userRoles?.map((r) => r.role) ?? [];

    // Fetch user branch assignments
    const { data: branchAssignments } = await supabaseAdmin
      .from("user_branch_assignments")
      .select("branch_id")
      .eq("user_id", user.id);

    const branchIds = branchAssignments?.map((b) => b.branch_id) ?? [];

    // Attach user info and authenticated Supabase client to request
    req.user = {
      id: user.id,
      email: user.email ?? "",
      profile,
      roles,
      branchIds,
    };

    // Create a Supabase client with the user's JWT for RLS-protected queries
    req.supabase = createSupabaseClient(token);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Factory function to create role-checking middleware
 * Ensures user has at least one of the required roles
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({ 
        error: "Insufficient permissions",
        required: allowedRoles,
        current: req.user.roles 
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require HM (Higher Management) role - has full system access
 * Note: ADMIN role has been merged into HM
 */
export const requireAdmin = requireRoles("HM");

/**
 * Middleware to require management roles (HM only since ADMIN merged into HM)
 */
export const requireManagement = requireRoles("HM");

/**
 * Middleware to require supervisor roles (HM, POC, or JS)
 */
export const requireSupervisor = requireRoles("HM", "POC", "JS");

/**
 * Factory function to check if user has access to a specific branch
 * HM has access to all branches
 */
export function requireBranchAccess(getBranchId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const branchId = getBranchId(req);

    if (!branchId) {
      res.status(400).json({ error: "Branch ID required" });
      return;
    }

    // HM has access to all branches
    if (req.user.roles.includes("HM")) {
      next();
      return;
    }

    // Check if user is assigned to the branch
    if (!req.user.branchIds.includes(branchId)) {
      res.status(403).json({ error: "No access to this branch" });
      return;
    }

    next();
  };
}
