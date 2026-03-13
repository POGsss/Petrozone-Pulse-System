import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser } from "../lib/auditLogger.js";

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

// Track scheduled notification timers so they can be cancelled on reschedule/delete
const scheduledTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Helper: create notification receipts for targeted users
async function createReceipts(notificationId: string, targetType: string, targetValue: string, branchId: string): Promise<void> {
  let userIds: string[] = [];

  if (targetType === "user") {
    // Single user
    userIds = [targetValue];
  } else if (targetType === "role") {
    // All users with this role in the branch
    const { data: roleUsers } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", targetValue as "HM" | "POC" | "JS" | "R" | "T" | "ADMIN");

    if (roleUsers) {
      // Filter to users assigned to this branch
      const { data: branchUsers } = await supabaseAdmin
        .from("user_branch_assignments")
        .select("user_id")
        .eq("branch_id", branchId);

      const branchUserIds = new Set(branchUsers?.map(b => b.user_id) || []);
      userIds = roleUsers.filter(r => branchUserIds.has(r.user_id)).map(r => r.user_id);
    }
  } else if (targetType === "branch") {
    // All users in the branch
    const { data: branchUsers } = await supabaseAdmin
      .from("user_branch_assignments")
      .select("user_id")
      .eq("branch_id", targetValue);

    userIds = branchUsers?.map(b => b.user_id) || [];
  }

  if (userIds.length > 0) {
    const receipts = userIds.map(uid => ({
      notification_id: notificationId,
      user_id: uid,
      is_read: false,
    }));
    await supabaseAdmin.from("notification_receipts").insert(receipts);
  }
}

/**
 * GET /api/notifications
 * List notifications (admin view – all notifications in accessible branches)
 * Roles: HM, POC, JS (manage); R, T can view
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        target_type,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("notifications")
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

      if (branch_id) {
        query = query.eq("branch_id", branch_id as string);
      }
      if (status) {
        query = query.eq("status", status as string);
      }
      if (target_type) {
        query = query.eq("target_type", target_type as string);
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(`title.ilike.${searchTerm},message.ilike.${searchTerm}`);
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: notifications, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: notifications,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  }
);

/**
 * GET /api/notifications/my
 * Get current user's notifications (via receipts)
 * All authenticated users
 */
router.get(
  "/my",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { is_read, limit = "20", offset = "0" } = req.query;

      let query = supabaseAdmin
        .from("notification_receipts")
        .select(
          `
          *,
          notifications(id, title, message, target_type, target_value, status, notification_type, reference_type, reference_id, branch_id, created_by, created_at, updated_at, branches(id, name, code))
        `,
          { count: "exact" }
        )
        .eq("user_id", req.user!.id)
        .order("delivered_at", { ascending: false });

      // Filter by read status
      if (is_read === "true") {
        query = query.eq("is_read", true);
      } else if (is_read === "false") {
        query = query.eq("is_read", false);
      }

      // Only show active notifications
      query = query.eq("notifications.status", "active");

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: receipts, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Filter out receipts where notification was soft-deleted
      const activeReceipts = (receipts || []).filter((r: any) => r.notifications !== null);

      res.json({
        data: activeReceipts,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get my notifications error:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  }
);

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for current user
 */
router.get(
  "/unread-count",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { count, error } = await supabaseAdmin
        .from("notification_receipts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user!.id)
        .eq("is_read", false);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ unread_count: count || 0 });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  }
);

/**
 * GET /api/notifications/:id
 * Get a single notification by ID
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const notificationId = req.params.id as string;

      const { data: notification, error } = await supabaseAdmin
        .from("notifications")
        .select(`*, branches(id, name, code)`)
        .eq("id", notificationId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Notification not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(notification.branch_id)
      ) {
        res.status(403).json({ error: "No access to this notification's branch" });
        return;
      }

      res.json(notification);
    } catch (error) {
      console.error("Get notification error:", error);
      res.status(500).json({ error: "Failed to fetch notification" });
    }
  }
);

/**
 * POST /api/notifications
 * Create a manual notification
 * Roles: HM, POC, JS
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, message, target_type, target_value, branch_id, scheduled_at } = req.body;

      // Validation
      if (!title || !title.trim()) {
        res.status(400).json({ error: "Title is required" });
        return;
      }
      if (!message || !message.trim()) {
        res.status(400).json({ error: "Message is required" });
        return;
      }
      if (!target_type || !["role", "user", "branch"].includes(target_type)) {
        res.status(400).json({ error: "Target type must be 'role', 'user', or 'branch'" });
        return;
      }
      if (!target_value || !target_value.trim()) {
        res.status(400).json({ error: "Target value is required" });
        return;
      }
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Determine status: scheduled_at provided → "scheduled", otherwise → "draft"
      const scheduledAtValue = scheduled_at ? new Date(scheduled_at).toISOString() : null;
      const effectiveStatus = scheduledAtValue ? "scheduled" : "draft";

      // Create notification
      const { data: notification, error } = await supabaseAdmin
        .from("notifications")
        .insert({
          title: title.trim(),
          message: message.trim(),
          target_type,
          target_value: target_value.trim(),
          status: effectiveStatus,
          notification_type: "manual",
          branch_id,
          created_by: req.user!.id,
          scheduled_at: scheduledAtValue,
        })
        .select(`*, branches(id, name, code)`)
        .single();

      if (error) {
        await logFailedAction(req, "CREATE", "NOTIFICATION", null, error.message);
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user
      await fixAuditLogUser("NOTIFICATION", notification.id, "CREATE", req.user!.id, req.user!.branchIds[0]);

      // If scheduled, set a timer to auto-send when the time arrives
      if (scheduledAtValue) {
        const delayMs = new Date(scheduledAtValue).getTime() - Date.now();
        if (delayMs > 0) {
          const timer = setTimeout(async () => {
            scheduledTimers.delete(notification.id);
            try {
              // Check if still in "scheduled" status (not manually sent or deleted)
              const { data: current } = await supabaseAdmin
                .from("notifications")
                .select("status")
                .eq("id", notification.id)
                .single();

              if (current?.status === "scheduled") {
                await supabaseAdmin
                  .from("notifications")
                  .update({ status: "active" })
                  .eq("id", notification.id);
                await createReceipts(notification.id, target_type, target_value, branch_id);
              }
            } catch (err) {
              console.error(`Scheduled notification ${notification.id} delivery failed:`, err);
            }
          }, delayMs);
          scheduledTimers.set(notification.id, timer);
        }
      }

      res.status(201).json(notification);
    } catch (error) {
      console.error("Create notification error:", error);
      res.status(500).json({ error: "Failed to create notification" });
    }
  }
);

/**
 * PUT /api/notifications/:id
 * Update a notification
 * Roles: HM, POC, JS
 */
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const notificationId = req.params.id as string;
      const { title, message, target_type, target_value, status, scheduled_at } = req.body;

      // Fetch existing
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Notification not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this notification's branch" });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title.trim();
      if (message !== undefined) updateData.message = message.trim();
      if (target_type !== undefined) {
        if (!["role", "user", "branch"].includes(target_type)) {
          res.status(400).json({ error: "Target type must be 'role', 'user', or 'branch'" });
          return;
        }
        updateData.target_type = target_type;
      }
      if (target_value !== undefined) updateData.target_value = target_value.trim();
      if (status !== undefined) {
        if (!["draft", "scheduled", "active", "inactive"].includes(status)) {
          res.status(400).json({ error: "Status must be 'draft', 'scheduled', 'active', or 'inactive'" });
          return;
        }
        updateData.status = status;
      }
      if (scheduled_at !== undefined) {
        // Only allow schedule changes for draft/scheduled notifications
        if (!["draft", "scheduled"].includes(existing.status)) {
          res.status(400).json({ error: "Schedule can only be changed for draft or scheduled notifications" });
          return;
        }
        const newScheduledAt = scheduled_at ? new Date(scheduled_at).toISOString() : null;
        updateData.scheduled_at = newScheduledAt;
        // Auto-update status based on schedule
        if (newScheduledAt && !updateData.status) {
          updateData.status = "scheduled";
        } else if (!newScheduledAt && !updateData.status) {
          updateData.status = "draft";
        }
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("notifications")
        .update(updateData)
        .eq("id", notificationId)
        .select(`*, branches(id, name, code)`)
        .single();

      if (updateError) {
        await logFailedAction(req, "UPDATE", "NOTIFICATION", notificationId, updateError.message);
        res.status(500).json({ error: updateError.message });
        return;
      }

      // If schedule was changed, cancel old timer and set new one
      if (scheduled_at !== undefined) {
        // Cancel any existing timer
        const existingTimer = scheduledTimers.get(notificationId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          scheduledTimers.delete(notificationId);
        }

        const newScheduledAt = updated.scheduled_at;
        if (newScheduledAt && updated.status === "scheduled") {
          const delayMs = new Date(newScheduledAt).getTime() - Date.now();
          if (delayMs > 0) {
            const timer = setTimeout(async () => {
              scheduledTimers.delete(notificationId);
              try {
                const { data: current } = await supabaseAdmin
                  .from("notifications")
                  .select("*, branches(id, name, code)")
                  .eq("id", notificationId)
                  .single();

                if (current?.status === "scheduled") {
                  await supabaseAdmin
                    .from("notifications")
                    .update({ status: "active" })
                    .eq("id", notificationId);
                  await createReceipts(notificationId, current.target_type, current.target_value, current.branch_id);
                }
              } catch (err) {
                console.error(`Rescheduled notification ${notificationId} delivery failed:`, err);
              }
            }, delayMs);
            scheduledTimers.set(notificationId, timer);
          }
        }
      }

      await fixAuditLogUser("NOTIFICATION", notificationId, "UPDATE", req.user!.id, req.user!.branchIds[0]);

      res.json(updated);
    } catch (error) {
      console.error("Update notification error:", error);
      res.status(500).json({ error: "Failed to update notification" });
    }
  }
);

/**
 * DELETE /api/notifications/:id
 * Draft/scheduled → hard delete. Active/inactive → deactivate (set inactive).
 * Roles: HM, POC, JS
 */
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const notificationId = req.params.id as string;

      // Fetch existing
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Notification not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this notification's branch" });
        return;
      }

      if (["draft", "scheduled"].includes(existing.status)) {
        // Cancel any scheduled timer
        const existingTimer = scheduledTimers.get(notificationId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          scheduledTimers.delete(notificationId);
        }

        // Hard delete – notification hasn't been sent yet
        // Delete any receipts first (shouldn't exist but just in case)
        await supabaseAdmin
          .from("notification_receipts")
          .delete()
          .eq("notification_id", notificationId);

        const { error: deleteError } = await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("id", notificationId);

        if (deleteError) {
          await logFailedAction(req, "HARD_DELETE", "NOTIFICATION", notificationId, deleteError.message);
          res.status(500).json({ error: deleteError.message });
          return;
        }

        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "HARD_DELETE",
            p_entity_type: "NOTIFICATION",
            p_entity_id: notificationId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { title: existing.title },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Notification deleted permanently" });
      } else {
        // Soft delete – notification has been sent (active/inactive)
        const { error: updateError } = await supabaseAdmin
          .from("notifications")
          .update({ status: "inactive" })
          .eq("id", notificationId);

        if (updateError) {
          await logFailedAction(req, "SOFT_DELETE", "NOTIFICATION", notificationId, updateError.message);
          res.status(500).json({ error: updateError.message });
          return;
        }

        await fixAuditLogUser("NOTIFICATION", notificationId, "UPDATE", req.user!.id, req.user!.branchIds[0]);

        res.json({ message: "Notification deactivated (has been sent to users)" });
      }
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  }
);

/**
 * POST /api/notifications/:id/send
 * Manually send a draft or scheduled notification (create receipts, set active)
 * Roles: HM, POC, JS
 */
router.post(
  "/:id/send",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const notificationId = req.params.id as string;

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Notification not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this notification's branch" });
        return;
      }

      if (!["draft", "scheduled"].includes(existing.status)) {
        res.status(400).json({ error: "Only draft or scheduled notifications can be sent" });
        return;
      }

      // Cancel any scheduled timer
      const existingTimer = scheduledTimers.get(notificationId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        scheduledTimers.delete(notificationId);
      }

      // Set status to active
      const { error: updateError } = await supabaseAdmin
        .from("notifications")
        .update({ status: "active" })
        .eq("id", notificationId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Create receipts for targeted users
      await createReceipts(notificationId, existing.target_type, existing.target_value, existing.branch_id);

      await fixAuditLogUser("NOTIFICATION", notificationId, "UPDATE", req.user!.id, req.user!.branchIds[0]);

      res.json({ message: "Notification sent successfully" });
    } catch (error) {
      console.error("Send notification error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  }
);

/**
 * POST /api/notifications/:id/mark-read
 * Mark a notification as read for the current user
 */
router.post(
  "/:id/mark-read",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const notificationId = req.params.id as string;

      const { data, error } = await supabaseAdmin
        .from("notification_receipts")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("notification_id", notificationId)
        .eq("user_id", req.user!.id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Notification receipt not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  }
);

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for the current user
 */
router.post(
  "/mark-all-read",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { error } = await supabaseAdmin
        .from("notification_receipts")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", req.user!.id)
        .eq("is_read", false);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Mark all read error:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  }
);

// Exported helper for Job Order status change notifications

/**
 * Create a system notification when a Job Order status changes.
 * Called from joborders.routes.ts after status transitions.
 */
export async function createJobOrderNotification(
  orderNumber: string,
  orderId: string,
  branchId: string,
  fromStatus: string,
  toStatus: string,
  triggeredByUserId: string
): Promise<void> {
  try {
    const statusLabels: Record<string, string> = {
      draft: "Draft",
      pending_approval: "Pending Approval",
      approved: "Approved",
      in_progress: "In Progress",
      ready_for_release: "Ready for Release",
      completed: "Completed",
      rejected: "Rejected",
      cancelled: "Cancelled",
    };

    const title = `Job Order ${orderNumber} - Status Update`;
    const message = `Job Order ${orderNumber} has been updated from "${statusLabels[fromStatus] || fromStatus}" to "${statusLabels[toStatus] || toStatus}".`;

    // Create system notification targeting all users in the branch
    const { data: notification, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        title,
        message,
        target_type: "branch",
        target_value: branchId,
        status: "active",
        notification_type: "system",
        reference_type: "JOB_ORDER",
        reference_id: orderId,
        branch_id: branchId,
        created_by: triggeredByUserId,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create JO notification:", error);
      return;
    }

    // Create receipts for all branch users
    await createReceipts(notification.id, "branch", branchId, branchId);
  } catch (err) {
    console.error("JO notification error:", err);
  }
}

export default router;
