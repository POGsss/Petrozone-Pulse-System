import { useState } from "react";
import { LuMoon, LuSun, LuPanelLeftClose, LuPanelLeft, LuType, LuRotateCcw, LuCheck, LuSave } from "react-icons/lu";
import { useTheme, COLOR_PRESETS, DEFAULT_SETTINGS, type FontSize, type ThemeSettings } from "../../lib/ThemeContext";
import { showToast } from "../../lib/toast";

const FONT_SIZE_OPTIONS: { value: FontSize; label: string; description: string }[] = [
    { value: "small", label: "Small", description: "Compact UI (14px)" },
    { value: "medium", label: "Medium", description: "Default (16px)" },
    { value: "large", label: "Large", description: "Comfortable (18px)" },
];

export function SystemSettings() {
    const { settings, updateSettings } = useTheme();

    // Local draft — only applied on Save
    const [draft, setDraft] = useState<ThemeSettings>({ ...settings });
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    const hasChanges =
        draft.darkMode !== settings.darkMode ||
        draft.primaryColor !== settings.primaryColor ||
        draft.sidebarCollapsed !== settings.sidebarCollapsed ||
        draft.fontSize !== settings.fontSize;

    function patchDraft(updates: Partial<ThemeSettings>) {
        setDraft((prev) => ({ ...prev, ...updates }));
        setSaved(false);
    }

    async function handleSave() {
        try {
            setSaving(true);
            await updateSettings(draft);
            setSaved(true);
            showToast.success("Settings have been updated successfully.");
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            showToast.error(err instanceof Error ? err.message : "Failed to save changes on settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleReset() {
        try {
            setDraft({ ...DEFAULT_SETTINGS });
            setSaved(false);
            await updateSettings({ ...DEFAULT_SETTINGS });
            showToast.success("System settings have been reset to defaults.");
        } catch (err) {
            showToast.error(err instanceof Error ? err.message : "Failed to reset settings on the server.");
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
                <div>
                    <h3 className="text-lg font-semibold text-neutral-950">System Settings</h3>
                    <p className="text-sm text-neutral-900">Customize the look and feel of the system</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 border border-neutral-200 text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-100 transition-colors"
                    >
                        <LuRotateCcw className="w-4 h-4" />
                        Reset
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={(!hasChanges && !saved) || saving}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${saved
                                ? "bg-positive text-white"
                                : hasChanges
                                    ? "bg-primary text-white hover:bg-primary-950"
                                    : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                            }`}
                    >
                        {saved ? (
                            <>
                                <LuCheck className="w-4 h-4" />
                                Saved
                            </>
                        ) : saving ? (
                            <>
                                <LuSave className="w-4 h-4 animate-pulse" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <LuSave className="w-4 h-4" />
                                Save
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Dark Mode */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-neutral-100 rounded-lg">
                            {draft.darkMode ? (
                                <LuMoon className="w-5 h-5 text-neutral-950" />
                            ) : (
                                <LuSun className="w-5 h-5 text-neutral-950" />
                            )}
                        </div>
                        <div>
                            <h4 className="font-medium text-neutral-950">Dark Mode</h4>
                            <p className="text-sm text-neutral-900">
                                {draft.darkMode ? "Dark theme is selected" : "Light theme is selected"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => patchDraft({ darkMode: !draft.darkMode })}
                        className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${draft.darkMode ? "bg-primary" : "bg-neutral-300"
                            }`}
                    >
                        <span
                            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${draft.darkMode ? "translate-x-7" : "translate-x-0"
                                }`}
                        />
                    </button>
                </div>
            </div>

            {/* Primary Color */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="mb-4">
                    <h4 className="font-medium text-neutral-950">Primary Color</h4>
                    <p className="text-sm text-neutral-900">
                        Choose the accent color used throughout the system. All color scales
                        (primary, positive, negative) will adapt automatically in dark mode.
                    </p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {COLOR_PRESETS.map((preset) => {
                        const isActive = draft.primaryColor === preset.value;
                        return (
                            <button
                                key={preset.value}
                                onClick={() => patchDraft({ primaryColor: preset.value })}
                                className={`relative flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all ${isActive
                                        ? "border-primary bg-primary-100"
                                        : "border-neutral-200 hover:border-neutral-400"
                                    }`}
                            >
                                <span
                                    className="w-8 h-8 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                                    style={{ backgroundColor: preset.value }}
                                />
                                <span className="text-sm font-medium text-neutral-950 truncate hidden sm:block">{preset.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sidebar Default State */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-neutral-100 rounded-lg">
                            {draft.sidebarCollapsed ? (
                                <LuPanelLeftClose className="w-5 h-5 text-neutral-950" />
                            ) : (
                                <LuPanelLeft className="w-5 h-5 text-neutral-950" />
                            )}
                        </div>
                        <div>
                            <h4 className="font-medium text-neutral-950">Sidebar Collapsed by Default</h4>
                            <p className="text-sm text-neutral-900">
                                {draft.sidebarCollapsed
                                    ? "Sidebar starts collapsed (icons only)"
                                    : "Sidebar starts expanded (full labels)"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => patchDraft({ sidebarCollapsed: !draft.sidebarCollapsed })}
                        className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${draft.sidebarCollapsed ? "bg-primary" : "bg-neutral-300"
                            }`}
                    >
                        <span
                            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${draft.sidebarCollapsed ? "translate-x-7" : "translate-x-0"
                                }`}
                        />
                    </button>
                </div>
            </div>

            {/* Font Size / UI Size */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-2.5 bg-neutral-100 rounded-lg">
                        <LuType className="w-5 h-5 text-neutral-950" />
                    </div>
                    <div>
                        <h4 className="font-medium text-neutral-950">Font / UI Size</h4>
                        <p className="text-sm text-neutral-900">Adjust the base font and element size</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {FONT_SIZE_OPTIONS.map((option) => {
                        const isActive = draft.fontSize === option.value;
                        return (
                            <button
                                key={option.value}
                                onClick={() => patchDraft({ fontSize: option.value })}
                                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2 transition-all ${isActive
                                        ? "border-primary bg-primary-100"
                                        : "border-neutral-200 hover:border-neutral-400"
                                    }`}
                            >
                                <span className="text-sm font-medium text-neutral-950">{option.label}</span>
                                <span className="text-xs text-neutral-900 hidden sm:block">{option.description}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
