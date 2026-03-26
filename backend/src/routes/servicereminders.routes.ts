import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser } from "../lib/auditLogger.js";
import { sendEmail } from "../lib/emailService.js";
import { sendSms } from "../lib/smsService.js";

const router = Router();

// All reminder routes require authentication
router.use(requireAuth);

/**
 * GET /api/service-reminders
 * List service reminders with filtering and pagination
 * Roles: POC, JS, R
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        customer_id,
        vehicle_id,
        status,
        delivery_method,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("service_reminders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Branch scoping: HM sees all, others see their branches
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      if (branch_id) {
        query = query.eq("branch_id", branch_id as string);
      }
      if (customer_id) {
        query = query.eq("customer_id", customer_id as string);
      }
      if (vehicle_id) {
        query = query.eq("vehicle_id", vehicle_id as string);
      }
      if (status) {
        query = query.eq("status", status as string);
      }
      if (delivery_method) {
        query = query.eq("delivery_method", delivery_method as string);
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(`service_type.ilike.${searchTerm},message_template.ilike.${searchTerm}`);
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: reminders, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: reminders,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get service reminders error:", error);
      res.status(500).json({ error: "Failed to fetch service reminders" });
    }
  }
);

/**
 * GET /api/service-reminders/:id
 * Get a single service reminder
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reminderId = req.params.id as string;

      const { data: reminder, error } = await supabaseAdmin
        .from("service_reminders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `
        )
        .eq("id", reminderId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Service reminder not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(reminder.branch_id)
      ) {
        res.status(403).json({ error: "No access to this reminder's branch" });
        return;
      }

      res.json(reminder);
    } catch (error) {
      console.error("Get service reminder error:", error);
      res.status(500).json({ error: "Failed to fetch service reminder" });
    }
  }
);

/**
 * POST /api/service-reminders
 * Create a service reminder
 * Roles: POC, JS, R
 */
router.post(
  "/",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        customer_id,
        vehicle_id,
        service_type,
        scheduled_at,
        delivery_method,
        message_template,
        branch_id,
        status,
      } = req.body;

      // Validation
      if (!customer_id) {
        res.status(400).json({ error: "Customer is required" });
        return;
      }
      if (!vehicle_id) {
        res.status(400).json({ error: "Vehicle is required" });
        return;
      }
      if (!service_type || !service_type.trim()) {
        res.status(400).json({ error: "Service type is required" });
        return;
      }
      if (!scheduled_at) {
        res.status(400).json({ error: "Scheduled date/time is required" });
        return;
      }
      if (!message_template || !message_template.trim()) {
        res.status(400).json({ error: "Message template is required" });
        return;
      }
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }
      if (delivery_method && !["email", "sms"].includes(delivery_method)) {
        res.status(400).json({ error: "Delivery method must be 'email' or 'sms'" });
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

      // Validate customer exists
      const { data: customer, error: custError } = await supabaseAdmin
        .from("customers")
        .select("id, full_name, email, contact_number")
        .eq("id", customer_id)
        .single();

      if (custError || !customer) {
        res.status(400).json({ error: "Customer not found" });
        return;
      }

      // Validate vehicle exists and belongs to customer
      const { data: vehicle, error: vehError } = await supabaseAdmin
        .from("vehicles")
        .select("id, plate_number, customer_id")
        .eq("id", vehicle_id)
        .single();

      if (vehError || !vehicle) {
        res.status(400).json({ error: "Vehicle not found" });
        return;
      }

      if (vehicle.customer_id !== customer_id) {
        res.status(400).json({ error: "Vehicle does not belong to the selected customer" });
        return;
      }

      // Validate contact availability for delivery method
      const method = delivery_method || "email";
      if (method === "email" && !customer.email) {
        res.status(400).json({ error: "Customer does not have an email address for email delivery" });
        return;
      }
      if (method === "sms" && !customer.contact_number) {
        res.status(400).json({ error: "Customer does not have a phone number for SMS delivery" });
        return;
      }

      // Determine initial status
      const initialStatus = status && ["draft", "scheduled"].includes(status) ? status : "draft";

      const { data: reminder, error: insertError } = await supabaseAdmin
        .from("service_reminders")
        .insert({
          customer_id,
          vehicle_id,
          service_type: service_type.trim(),
          scheduled_at,
          delivery_method: method,
          message_template: message_template.trim(),
          status: initialStatus,
          branch_id,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `
        )
        .single();

      if (insertError) {
        await logFailedAction(req, "CREATE", "SERVICE_REMINDER", null, insertError.message);
        res.status(500).json({ error: insertError.message });
        return;
      }

      await fixAuditLogUser("SERVICE_REMINDER", reminder.id, "CREATE", req.user!.id, req.user!.branchIds[0]);

      res.status(201).json(reminder);
    } catch (error) {
      console.error("Create service reminder error:", error);
      res.status(500).json({ error: "Failed to create service reminder" });
    }
  }
);

/**
 * PUT /api/service-reminders/:id
 * Update a service reminder
 * Roles: POC, JS, R
 */
router.put(
  "/:id",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reminderId = req.params.id as string;
      const {
        customer_id,
        vehicle_id,
        service_type,
        scheduled_at,
        delivery_method,
        message_template,
        status,
      } = req.body;

      // Fetch existing
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("service_reminders")
        .select("*")
        .eq("id", reminderId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Service reminder not found" });
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
        res.status(403).json({ error: "No access to this reminder's branch" });
        return;
      }

      // Cannot update sent or cancelled reminders
      if (["sent", "cancelled"].includes(existing.status)) {
        res.status(400).json({ error: `Cannot update a reminder with status "${existing.status}"` });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};
      if (customer_id !== undefined) updateData.customer_id = customer_id;
      if (vehicle_id !== undefined) updateData.vehicle_id = vehicle_id;
      if (service_type !== undefined) updateData.service_type = service_type.trim();
      if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at;
      if (delivery_method !== undefined) {
        if (!["email", "sms"].includes(delivery_method)) {
          res.status(400).json({ error: "Delivery method must be 'email' or 'sms'" });
          return;
        }
        updateData.delivery_method = delivery_method;
      }
      if (message_template !== undefined) updateData.message_template = message_template.trim();
      if (status !== undefined) {
        if (!["draft", "scheduled", "cancelled"].includes(status)) {
          res.status(400).json({ error: "Status must be 'draft', 'scheduled', or 'cancelled'" });
          return;
        }
        updateData.status = status;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // If changing delivery method, validate contact availability
      if (updateData.delivery_method || updateData.customer_id) {
        const custId = (updateData.customer_id || existing.customer_id) as string;
        const { data: cust } = await supabaseAdmin
          .from("customers")
          .select("email, contact_number")
          .eq("id", custId)
          .single();

        if (cust) {
          const method = (updateData.delivery_method || existing.delivery_method) as string;
          if (method === "email" && !cust.email) {
            res.status(400).json({ error: "Customer does not have an email address for email delivery" });
            return;
          }
          if (method === "sms" && !cust.contact_number) {
            res.status(400).json({ error: "Customer does not have a phone number for SMS delivery" });
            return;
          }
        }
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("service_reminders")
        .update(updateData)
        .eq("id", reminderId)
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `
        )
        .single();

      if (updateError) {
        await logFailedAction(req, "UPDATE", "SERVICE_REMINDER", reminderId, updateError.message);
        res.status(500).json({ error: updateError.message });
        return;
      }

      await fixAuditLogUser("SERVICE_REMINDER", reminderId, "UPDATE", req.user!.id, req.user!.branchIds[0]);

      res.json(updated);
    } catch (error) {
      console.error("Update service reminder error:", error);
      res.status(500).json({ error: "Failed to update service reminder" });
    }
  }
);

/**
 * DELETE /api/service-reminders/:id
 * Delete a service reminder
 * Roles: POC, JS, R
 */
router.delete(
  "/:id",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reminderId = req.params.id as string;

      // Fetch existing
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("service_reminders")
        .select("*")
        .eq("id", reminderId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Service reminder not found" });
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
        res.status(403).json({ error: "No access to this reminder's branch" });
        return;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("service_reminders")
        .delete()
        .eq("id", reminderId);

      if (deleteError) {
        await logFailedAction(req, "DELETE", "SERVICE_REMINDER", reminderId, deleteError.message);
        res.status(500).json({ error: deleteError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "SERVICE_REMINDER",
          p_entity_id: reminderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { service_type: existing.service_type, customer_id: existing.customer_id },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Service reminder deleted" });
    } catch (error) {
      console.error("Delete service reminder error:", error);
      res.status(500).json({ error: "Failed to delete service reminder" });
    }
  }
);

/**
 * POST /api/service-reminders/:id/send
 * Send a service reminder (email/SMS delivery)
 * Roles: POC, JS, R
 */
router.post(
  "/:id/send",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reminderId = req.params.id as string;

      // Fetch reminder with customer data
      const { data: reminder, error: fetchError } = await supabaseAdmin
        .from("service_reminders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `
        )
        .eq("id", reminderId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Service reminder not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(reminder.branch_id)
      ) {
        res.status(403).json({ error: "No access to this reminder's branch" });
        return;
      }

      // Can only send draft, scheduled, or failed reminders
      if (!["draft", "scheduled", "failed"].includes(reminder.status)) {
        res.status(400).json({ error: `Cannot send a reminder with status "${reminder.status}"` });
        return;
      }

      // Validate contact availability
      const customer = (reminder as any).customers;
      if (!customer) {
        res.status(400).json({ error: "Customer data not found" });
        return;
      }

      if (reminder.delivery_method === "email" && !customer.email) {
        const { error: failErr } = await supabaseAdmin
          .from("service_reminders")
          .update({ status: "failed", failure_reason: "Customer has no email address" })
          .eq("id", reminderId);
        if (failErr) console.error("Failed to update status:", failErr);
        res.status(400).json({ error: "Customer does not have an email address" });
        return;
      }

      if (reminder.delivery_method === "sms" && !customer.contact_number) {
        const { error: failErr } = await supabaseAdmin
          .from("service_reminders")
          .update({ status: "failed", failure_reason: "Customer has no phone number" })
          .eq("id", reminderId);
        if (failErr) console.error("Failed to update status:", failErr);
        res.status(400).json({ error: "Customer does not have a phone number" });
        return;
      }

      // Real delivery via email/SMS
      let deliverySuccess = false;
      let deliveryError = "";
      const now = new Date().toISOString();

      if (reminder.delivery_method === "email") {
        const result = await sendEmail({
          to: customer.email,
          subject: `${reminder.service_type} – ${(reminder as any).vehicles?.plate_number || "Your Vehicle"}`,
          text: reminder.message_template,
          html: `<p>${reminder.message_template.replace(/\n/g, "<br>")}</p>`,
        });
        deliverySuccess = result.success;
        deliveryError = result.error || "";
      } else if (reminder.delivery_method === "sms") {
        const result = await sendSms(customer.contact_number, reminder.message_template);
        deliverySuccess = result.success;
        deliveryError = result.error || "";
      }

      if (deliverySuccess) {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("service_reminders")
          .update({ status: "sent", sent_at: now, failure_reason: null })
          .eq("id", reminderId)
          .select(
            `
            *,
            customers(id, full_name, contact_number, email),
            vehicles(id, plate_number, model, vehicle_type),
            branches(id, name, code)
          `
          )
          .single();

        if (updateError) {
          res.status(500).json({ error: updateError.message });
          return;
        }

        // Audit log
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "SEND",
            p_entity_type: "SERVICE_REMINDER",
            p_entity_id: reminderId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: {
              delivery_method: reminder.delivery_method,
              customer_name: customer.full_name,
              sent_at: now,
            },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Reminder sent successfully", data: updated });
      } else {
        // Real failure path
        await supabaseAdmin
          .from("service_reminders")
          .update({ status: "failed", failure_reason: deliveryError || "Delivery service unavailable" })
          .eq("id", reminderId);

        res.status(500).json({ error: deliveryError || "Failed to deliver reminder" });
      }
    } catch (error) {
      console.error("Send service reminder error:", error);
      res.status(500).json({ error: "Failed to send service reminder" });
    }
  }
);

/**
 * POST /api/service-reminders/:id/cancel
 * Cancel a scheduled reminder
 * Roles: POC, JS, R
 */
router.post(
  "/:id/cancel",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reminderId = req.params.id as string;

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("service_reminders")
        .select("*")
        .eq("id", reminderId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Service reminder not found" });
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
        res.status(403).json({ error: "No access to this reminder's branch" });
        return;
      }

      if (!["draft", "scheduled"].includes(existing.status)) {
        res.status(400).json({ error: `Cannot cancel a reminder with status "${existing.status}"` });
        return;
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("service_reminders")
        .update({ status: "cancelled" })
        .eq("id", reminderId)
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `
        )
        .single();

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "CANCEL",
          p_entity_type: "SERVICE_REMINDER",
          p_entity_id: reminderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from_status: existing.status, to_status: "cancelled" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Reminder cancelled", data: updated });
    } catch (error) {
      console.error("Cancel service reminder error:", error);
      res.status(500).json({ error: "Failed to cancel service reminder" });
    }
  }
);

/**
 * POST /api/service-reminders/process-scheduled
 * Process scheduled reminders that are due (cron simulation)
 * This would normally be called by a cron job / Edge Function
 * Roles: HM (manual trigger)
 */
router.post(
  "/process-scheduled",
  requireRoles("HM"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const now = new Date().toISOString();

      // Get all scheduled reminders that are due
      const { data: dueReminders, error: fetchError } = await supabaseAdmin
        .from("service_reminders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email)
        `
        )
        .eq("status", "scheduled")
        .lte("scheduled_at", now);

      if (fetchError) {
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (!dueReminders || dueReminders.length === 0) {
        res.json({ message: "No scheduled reminders due", processed: 0 });
        return;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const reminder of dueReminders) {
        const customer = (reminder as any).customers;
        let canSend = true;
        let failureReason = "";

        if (reminder.delivery_method === "email" && !customer?.email) {
          canSend = false;
          failureReason = "Customer has no email address";
        }
        if (reminder.delivery_method === "sms" && !customer?.contact_number) {
          canSend = false;
          failureReason = "Customer has no phone number";
        }

        if (canSend) {
          // Real delivery
          let sent = false;
          if (reminder.delivery_method === "email" && customer?.email) {
            const result = await sendEmail({
              to: customer.email,
              subject: `${reminder.service_type} – ${(reminder as any).vehicles?.plate_number || "Your Vehicle"}`,
              text: reminder.message_template,
              html: `<p>${reminder.message_template.replace(/\n/g, "<br>")}</p>`,
            });
            sent = result.success;
            if (!result.success) failureReason = result.error || "Email delivery failed";
          } else if (reminder.delivery_method === "sms" && customer?.contact_number) {
            const result = await sendSms(customer.contact_number, reminder.message_template);
            sent = result.success;
            if (!result.success) failureReason = result.error || "SMS delivery failed";
          }

          if (sent) {
            await supabaseAdmin
              .from("service_reminders")
              .update({ status: "sent", sent_at: now, failure_reason: null })
              .eq("id", reminder.id);
            sentCount++;
          } else {
            await supabaseAdmin
              .from("service_reminders")
              .update({ status: "failed", failure_reason: failureReason })
              .eq("id", reminder.id);
            failedCount++;
          }
        } else {
          await supabaseAdmin
            .from("service_reminders")
            .update({ status: "failed", failure_reason: failureReason })
            .eq("id", reminder.id);
          failedCount++;
        }
      }

      res.json({
        message: "Scheduled reminders processed",
        processed: dueReminders.length,
        sent: sentCount,
        failed: failedCount,
      });
    } catch (error) {
      console.error("Process scheduled reminders error:", error);
      res.status(500).json({ error: "Failed to process scheduled reminders" });
    }
  }
);

export default router;
