import { supabaseAdmin } from "./supabase.js";
import type { Request } from "express";

/**
 * Log a failed action to the audit_logs table.
 * Used when a CREATE/UPDATE/DELETE operation fails so the attempt is recorded.
 */
export async function logFailedAction(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  errorMessage: string
): Promise<void> {
  try {
    const userId = req.user?.id ?? null;
    const branchId = req.user?.branchIds?.[0] ?? null;

    await supabaseAdmin.from("audit_logs").insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      branch_id: branchId,
      status: "FAILED",
      new_values: { error: errorMessage },
    });
  } catch (logError) {
    // Never let audit logging break the response flow
    console.error("Failed to log audit event:", logError);
  }
}
