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

/**
 * Fix audit log user_id after a database trigger creates an audit entry.
 * The trigger may set user_id from `created_by` (the record creator),
 * which is wrong for UPDATE actions. This uses a two-step SELECT+UPDATE
 * to reliably find and fix the most recent audit log entry.
 */
export async function fixAuditLogUser(
  entityType: string,
  entityId: string,
  action: string,
  userId: string,
  branchId?: string | null
): Promise<void> {
  try {
    // Find the most recent audit log for this entity+action
    const { data: auditLog } = await supabaseAdmin
      .from("audit_logs")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("action", action)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (auditLog) {
      const updatePayload: Record<string, unknown> = { user_id: userId };
      if (branchId !== undefined) {
        updatePayload.branch_id = branchId;
      }
      await supabaseAdmin
        .from("audit_logs")
        .update(updatePayload)
        .eq("id", auditLog.id);
    }
  } catch (error) {
    // Never let audit logging break the response flow
    console.error("Failed to fix audit log user:", error);
  }
}

/**
 * Filter out fields from updateData that haven't actually changed
 * compared to the existing record. Returns only fields with real changes.
 * This prevents unnecessary database updates and empty audit log entries.
 */
export function filterUnchangedFields(
  updateData: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, newValue] of Object.entries(updateData)) {
    const oldValue = existing[key];
    // Use JSON.stringify for deep comparison (handles null, numbers, strings, etc.)
    if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
      changed[key] = newValue;
    }
  }
  return changed;
}
