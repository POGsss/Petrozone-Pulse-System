import { supabaseAdmin } from "./supabase.js";
import type { Request } from "express";

const ACTION_NORMALIZATION_MAP: Record<string, "LOGIN" | "LOGOUT" | "CREATE" | "UPDATE" | "DELETE"> = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",

  // Job order lifecycle and operational actions
  JO_CREATED: "CREATE",
  REWORK_CREATED: "CREATE",
  JO_UPDATED: "UPDATE",
  JO_CANCELLED: "UPDATE",
  WORK_STARTED: "UPDATE",
  MARKED_READY: "UPDATE",
  JO_COMPLETED: "UPDATE",
  JO_RESTORED: "UPDATE",
  JO_DEACTIVATED: "UPDATE",
  APPROVAL_REQUESTED: "UPDATE",
  APPROVAL_RECORDED: "UPDATE",
  REWORK_APPROVED: "UPDATE",
  REWORK_REJECTED: "UPDATE",
  STATUS_CHANGED: "UPDATE",
  PAYMENT_DETAILS_UPDATED: "UPDATE",
  PAYMENT_RECORDED: "UPDATE",
  JO_SOFT_DELETED: "DELETE",

  // Purchase order lifecycle and operational actions
  SUBMIT: "UPDATE",
  APPROVE: "UPDATE",
  PO_RECEIPT_UPLOADED: "UPDATE",
  RECEIVE: "UPDATE",
  CANCEL: "UPDATE",
  PO_DEACTIVATED: "UPDATE",
  PO_RESTORED: "UPDATE",

  // Inventory and reminders operational actions
  ADJUSTMENT: "UPDATE",
  STOCK_IN: "UPDATE",
  SEND: "UPDATE",
  HARD_DELETE: "DELETE",

  // Reports
  GENERATE: "CREATE",
};

export function normalizeAuditAction(action: string): "LOGIN" | "LOGOUT" | "CREATE" | "UPDATE" | "DELETE" {
  return ACTION_NORMALIZATION_MAP[action] || "UPDATE";
}

export function getAuditActionVariants(primaryAction: string): string[] {
  const normalized = normalizeAuditAction(primaryAction);
  const variants = Object.entries(ACTION_NORMALIZATION_MAP)
    .filter(([, mapped]) => mapped === normalized)
    .map(([action]) => action);

  return variants.length > 0 ? variants : [normalized];
}

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
    const normalizedAction = normalizeAuditAction(action);
    const userId = req.user?.id ?? null;
    const branchId = req.user?.branchIds?.[0] ?? null;

    await supabaseAdmin.from("audit_logs").insert({
      action: normalizedAction,
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      branch_id: branchId,
      status: "FAILED",
      new_values: {
        error: errorMessage,
        audit_subaction: action,
      },
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
