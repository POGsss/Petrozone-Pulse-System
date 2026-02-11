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

    // Use the optimized RPC to get all user data in a single call
    const { data: userData, error: userDataError } = await supabaseAdmin.rpc("get_user_full_data", {
      p_user_id: user.id,
    });

    if (userDataError) {
      console.error("Get user data error:", userDataError);
      res.status(500).json({ error: "Failed to fetch user data" });
      return;
    }

    const userDataObj = userData as { profile: any; roles: string[]; branches: any[] } | null;
    const profile = userDataObj?.profile || null;
    const roles = userDataObj?.roles || [];
    const branchIds = userDataObj?.branches?.map((b: any) => b.branch_id) || [];

    // Check if user is active
    if (profile && !profile.is_active) {
      res.status(403).json({ error: "User account is deactivated" });
      return;
    }

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
 * Used for User Management (US10-13)
 */
export const requireSupervisor = requireRoles("HM", "POC", "JS");

/**
 * Middleware for User Management access (HM, POC, JS) - US10-13
 */
export const requireUserManager = requireRoles("HM", "POC", "JS");

/**
 * Middleware for Branch Management access (HM, POC, JS, R) - US1-4
 */
export const requireBranchManager = requireRoles("HM", "POC", "JS", "R");

/**
 * Middleware for Audit Log access (HM, POC) - US18
 */
export const requireAuditViewer = requireRoles("HM", "POC");

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
