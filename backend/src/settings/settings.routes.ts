import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * GET /api/settings
 * Fetch the system-wide settings (singleton row)
 * PUBLIC — no auth required so the login page can also be themed
 */
router.get(
  "/",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("system_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (err) {
      console.error("GET /api/settings error:", err);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  }
);

/**
 * PUT /api/settings
 * Update the system-wide settings
 * HM only
 */
router.put(
  "/",
  requireAuth,
  requireRoles("HM"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dark_mode, primary_color, sidebar_collapsed, font_size } = req.body;

      const updates: Record<string, unknown> = {};
      if (typeof dark_mode === "boolean") updates.dark_mode = dark_mode;
      if (typeof primary_color === "string") updates.primary_color = primary_color;
      if (typeof sidebar_collapsed === "boolean") updates.sidebar_collapsed = sidebar_collapsed;
      if (typeof font_size === "string" && ["small", "medium", "large"].includes(font_size)) {
        updates.font_size = font_size;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      updates.updated_at = new Date().toISOString();
      updates.updated_by = req.user!.id;

      // Get the singleton row ID first
      const { data: existing } = await supabaseAdmin
        .from("system_settings")
        .select("id")
        .limit(1)
        .single();

      if (!existing) {
        res.status(404).json({ error: "Settings row not found" });
        return;
      }

      // Update with select to verify row was actually affected
      const { data: updatedRows, error } = await supabaseAdmin
        .from("system_settings")
        .update(updates)
        .eq("id", existing.id)
        .select();

      if (error) {
        console.error("Settings update error:", error);
        res.status(500).json({ error: error.message });
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Settings update: no rows affected");
        res.status(500).json({ error: "Update did not affect any rows" });
        return;
      }

      res.json(updatedRows[0]);
    } catch (err) {
      console.error("PUT /api/settings error:", err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  }
);

export default router;
