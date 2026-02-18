import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { settingsApi } from "./api";

// Available primary color presets
export const COLOR_PRESETS = [
  { name: "Blue Indigo", value: "#5570F1" },
  { name: "Teal", value: "#0d9488" },
  { name: "Emerald", value: "#10b981" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Sky Blue", value: "#0ea5e9" },
  { name: "Fuchsia", value: "#d946ef" },
] as const;

// Fixed semantic colors
const POSITIVE_HEX = "#519C66";
const NEGATIVE_HEX = "#CC5F5F";

export type FontSize = "small" | "medium" | "large";

export interface ThemeSettings {
  darkMode: boolean;
  primaryColor: string;
  sidebarCollapsed: boolean;
  fontSize: FontSize;
}

export const DEFAULT_SETTINGS: ThemeSettings = {
  darkMode: false,
  primaryColor: "#5570F1",
  sidebarCollapsed: false,
  fontSize: "medium",
};

const STORAGE_KEY = "petrozone-theme-settings";

interface ThemeContextValue {
  settings: ThemeSettings;
  updateSettings: (updates: Partial<ThemeSettings>) => void;
  resetSettings: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────────────────

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (c: number) => clamp(c).toString(16).padStart(2, "0");

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Generate a light-mode colour scale — mixes towards white */
function hexToLightScale(hex: string) {
  const { r, g, b } = parseHex(hex);
  const mix = (c: number, pct: number) => Math.round(c + (255 - c) * (1 - pct / 100));
  const shade = (pct: number) =>
    `#${toHex(mix(r, pct))}${toHex(mix(g, pct))}${toHex(mix(b, pct))}`;
  const darker = (f: number) =>
    `#${toHex(Math.round(r * f))}${toHex(Math.round(g * f))}${toHex(Math.round(b * f))}`;

  return {
    DEFAULT: hex,
    "950": darker(0.9),
    "900": shade(50),
    "800": shade(45),
    "700": shade(40),
    "600": shade(35),
    "500": shade(30),
    "400": shade(25),
    "300": shade(20),
    "200": shade(10),
    "100": shade(5),
  };
}

/** Generate a dark-mode colour scale — mixes towards dark base (#16161b) */
function hexToDarkScale(hex: string) {
  const { r, g, b } = parseHex(hex);
  const dr = 22, dg = 22, db = 27; // #16161b

  const mix = (c: number, dc: number, pct: number) => Math.round(dc + (c - dc) * pct / 100);
  const shade = (pct: number) =>
    `#${toHex(mix(r, dr, pct))}${toHex(mix(g, dg, pct))}${toHex(mix(b, db, pct))}`;

  // 950 = slightly lighter accent for hover in dark mode
  const lighter = `#${toHex(Math.min(255, r + 30))}${toHex(Math.min(255, g + 30))}${toHex(Math.min(255, b + 30))}`;

  return {
    DEFAULT: hex,
    "950": lighter,
    "900": shade(50),
    "800": shade(45),
    "700": shade(40),
    "600": shade(35),
    "500": shade(30),
    "400": shade(25),
    "300": shade(20),
    "200": shade(10),
    "100": shade(5),
  };
}

// ── Apply functions ────────────────────────────────────────────────────────

function applyColorScale(prefix: string, hex: string, isDark: boolean) {
  const scale = isDark ? hexToDarkScale(hex) : hexToLightScale(hex);
  const root = document.documentElement;
  root.style.setProperty(`--color-${prefix}`, scale.DEFAULT);
  for (const step of ["950","900","800","700","600","500","400","300","200","100"] as const) {
    root.style.setProperty(`--color-${prefix}-${step}`, scale[step]);
  }
}

function applyFontSize(size: FontSize) {
  const root = document.documentElement;
  switch (size) {
    case "small":
      root.style.fontSize = "14px";
      break;
    case "medium":
      root.style.fontSize = "16px";
      break;
    case "large":
      root.style.fontSize = "18px";
      break;
  }
}

function applyDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function applyAllColors(primaryHex: string, isDark: boolean) {
  applyColorScale("primary", primaryHex, isDark);
  applyColorScale("positive", POSITIVE_HEX, isDark);
  applyColorScale("negative", NEGATIVE_HEX, isDark);
}

// ── Provider ───────────────────────────────────────────────────────────────

/** Convert DB row → ThemeSettings */
function fromDb(row: {
  dark_mode: boolean;
  primary_color: string;
  sidebar_collapsed: boolean;
  font_size: string;
}): ThemeSettings {
  return {
    darkMode: row.dark_mode,
    primaryColor: row.primary_color,
    sidebarCollapsed: row.sidebar_collapsed,
    fontSize: (["small", "medium", "large"].includes(row.font_size)
      ? row.font_size
      : "medium") as FontSize,
  };
}

/** Convert ThemeSettings → DB payload */
function toDb(s: ThemeSettings) {
  return {
    dark_mode: s.darkMode,
    primary_color: s.primaryColor,
    sidebar_collapsed: s.sidebarCollapsed,
    font_size: s.fontSize,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    // Start with localStorage cache (instant paint) – DB fetch will override
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_SETTINGS;
  });

  // Fetch latest settings from DB on mount
  useEffect(() => {
    settingsApi
      .get()
      .then((row) => {
        const dbSettings = fromDb(row);
        setSettings(dbSettings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbSettings));
      })
      .catch(() => {
        // API unavailable (not logged in yet, etc.) – keep localStorage / defaults
      });
  }, []);

  // Apply all theme settings whenever they change
  useEffect(() => {
    applyDarkMode(settings.darkMode);
    applyAllColors(settings.primaryColor, settings.darkMode);
    applyFontSize(settings.fontSize);
  }, [settings]);

  async function updateSettings(updates: Partial<ThemeSettings>) {
    const next = { ...settings, ...updates };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    // Persist to DB and verify the update took effect
    const result = await settingsApi.update(toDb(next));
    
    // Verify the returned data matches what we sent
    if (result && result.dark_mode !== next.darkMode) {
      throw new Error("Settings were not saved to the database. The server returned stale data.");
    }
  }

  async function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));

    await settingsApi.update(toDb(DEFAULT_SETTINGS));
  }

  return (
    <ThemeContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
