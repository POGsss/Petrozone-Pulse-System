import { useState, useMemo } from "react";
import { LuSave, LuKey, LuUser, LuCheck, LuCircleAlert, LuEye, LuEyeOff } from "react-icons/lu";
import { useAuth } from "../../auth";
import { authApi } from "../../lib/api";
import { showToast } from "../../lib/toast";

export function ProfileSettings() {
  const { user, refreshUser, clearMustChangePassword } = useAuth();
  
  // Profile form state
  const [profileForm, setProfileForm] = useState({
    full_name: user?.profile?.full_name || "",
    email: user?.email || "",
    phone: user?.profile?.phone || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Password visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Handle profile update
  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!profileForm.full_name.trim()) {
      setProfileError("Full name is required");
      return;
    }

    if (!profileForm.phone.trim()) {
      setProfileError("Phone number is required");
      return;
    }

    // Validate phone number format (at least 7 digits)
    const phoneDigits = profileForm.phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 20) {
      setProfileError("Phone number must be between 7 and 20 digits");
      return;
    }

    try {
      setProfileSaving(true);
      await authApi.updateProfile({
        full_name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim(),
        email: profileForm.email.trim() || undefined,
      });
      setProfileSuccess("Profile updated successfully");
      showToast.success("Profile updated successfully");
      // Refresh user data in auth context
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
      showToast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  // Password complexity checks
  const passwordChecks = useMemo(() => ({
    minLength: passwordForm.newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(passwordForm.newPassword),
    hasLowercase: /[a-z]/.test(passwordForm.newPassword),
    hasNumber: /[0-9]/.test(passwordForm.newPassword),
  }), [passwordForm.newPassword]);

  // Handle password change
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!passwordForm.currentPassword) {
      setPasswordError("Current password is required");
      return;
    }
    if (!passwordForm.newPassword) {
      setPasswordError("New password is required");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(passwordForm.newPassword)) {
      setPasswordError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[a-z]/.test(passwordForm.newPassword)) {
      setPasswordError("Password must contain at least one lowercase letter");
      return;
    }
    if (!/[0-9]/.test(passwordForm.newPassword)) {
      setPasswordError("Password must contain at least one number");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    try {
      setPasswordSaving(true);
      await authApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordSuccess("Password changed successfully");
      showToast.success("Password changed successfully");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      clearMustChangePassword();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
      showToast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="flex flex-col md:flex-row items-stretch justify-stretch gap-6">
      {/* Profile Information Section */}
      <div className="flex-1 bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 rounded-lg">
            <LuUser className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Profile Information</h2>
            <p className="text-sm text-neutral-600">Update your personal details</p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          {profileError && (
            <div className="flex items-center gap-2 p-3 bg-negative-100 border border-negative rounded-lg text-sm text-negative-950">
              <LuCircleAlert className="w-4 h-4 flex-shrink-0" />
              {profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="flex items-center gap-2 p-3 bg-positive-100 border border-positive rounded-lg text-sm text-positive-950">
              <LuCheck className="w-4 h-4 flex-shrink-0" />
              {profileSuccess}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Full Name <span className="text-negative">*</span>
            </label>
            <input
              type="text"
              value={profileForm.full_name}
              onChange={(e) => setProfileForm(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Enter your full name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Phone Number <span className="text-negative">*</span>
            </label>
            <input
              type="tel"
              value={profileForm.phone}
              onChange={(e) => {
                // Only allow digits, plus sign, and common phone characters
                const value = e.target.value.replace(/[^0-9+\-()\s]/g, "");
                setProfileForm(prev => ({ ...prev, phone: value }));
              }}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Enter your phone number (e.g., +63 912 345 6789)"
              required
              pattern="[0-9+\-()\s]{7,20}"
              inputMode="tel"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={profileSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <LuSave className="w-4 h-4" />
              {profileSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password Section */}
      <div className="flex-1 bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 rounded-lg">
            <LuKey className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Change Password</h2>
            <p className="text-sm text-neutral-600">Update your account password</p>
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          {passwordError && (
            <div className="flex items-center gap-2 p-3 bg-negative-100 border border-negative rounded-lg text-sm text-negative-950">
              <LuCircleAlert className="w-4 h-4 flex-shrink-0" />
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="flex items-center gap-2 p-3 bg-positive-100 border border-positive rounded-lg text-sm text-positive-950">
              <LuCheck className="w-4 h-4 flex-shrink-0" />
              {passwordSuccess}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Current Password <span className="text-negative">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full px-4 py-2.5 pr-10 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Enter your current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                tabIndex={-1}
              >
                {showCurrentPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              New Password <span className="text-negative">*</span>
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                className="w-full px-4 py-2.5 pr-10 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Enter new password"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                tabIndex={-1}
              >
                {showNewPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
              </button>
            </div>
            {passwordForm.newPassword.length > 0 && (
              <div className="mt-2 space-y-1">
                {[
                  { met: passwordChecks.minLength, label: "At least 8 characters" },
                  { met: passwordChecks.hasUppercase, label: "One uppercase letter" },
                  { met: passwordChecks.hasLowercase, label: "One lowercase letter" },
                  { met: passwordChecks.hasNumber, label: "One number" },
                ].map(({ met, label }) => (
                  <div key={label} className={`flex items-center gap-1.5 text-xs ${met ? "text-positive-600" : "text-neutral-400"}`}>
                    {met ? <LuCheck className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-neutral-300 inline-block" />}
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Confirm New Password <span className="text-negative">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-4 py-2.5 pr-10 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Confirm your new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={passwordSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <LuKey className="w-4 h-4" />
              {passwordSaving ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
