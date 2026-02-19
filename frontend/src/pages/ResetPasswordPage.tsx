import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LuLock, LuEye, LuEyeOff, LuLoader, LuCheck, LuCircleAlert } from "react-icons/lu";
import { authApi } from "../lib/api";
import { showToast } from "../lib/toast";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  // Get access_token from URL hash (Supabase returns it as a hash fragment)
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // Supabase sends the token in the URL hash fragment
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      const type = params.get("type");

      if (token && type === "recovery") {
        setAccessToken(token);
      } else {
        setTokenError(true);
      }
    } else {
      // Check query params as fallback
      const token = searchParams.get("access_token");
      if (token) {
        setAccessToken(token);
      } else {
        setTokenError(true);
      }
    }
  }, [searchParams]);

  // Password complexity checks
  const passwordChecks = useMemo(() => ({
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
  }), [newPassword]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError("Password must contain at least one lowercase letter");
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!accessToken) {
      setError("Invalid reset link");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword(accessToken, newPassword);
      setSuccess(true);
      showToast.success("Password reset successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
      showToast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  // Token error state
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-negative-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LuCircleAlert className="w-8 h-8 text-negative-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-950 mb-2">Invalid Reset Link</h1>
            <p className="text-neutral-500 mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-primary text-white py-3.5 px-4 rounded-xl font-semibold hover:bg-primary-950 transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-positive-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LuCheck className="w-8 h-8 text-positive-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-950 mb-2">Password Reset!</h1>
            <p className="text-neutral-500 mb-6">
              Your password has been successfully reset. You can now log in with your new password.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-primary text-white py-3.5 px-4 rounded-xl font-semibold hover:bg-primary-950 transition"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl p-8">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-2xl font-bold text-neutral-950 mt-6">Reset Password</h1>
            <p className="text-neutral-500 mt-1">Enter your new password</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-negative-50 border border-negative-200 text-negative-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* New Password field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <LuLock className="w-5 h-5 text-neutral-900" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-neutral-100 border border-neutral-200/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
                placeholder="New Password"
                disabled={isLoading}
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
                tabIndex={-1}
              >
                {showPassword ? (
                  <LuEye className="w-5 h-5 text-neutral-900 hover:text-neutral-950" />
                ) : (
                  <LuEyeOff className="w-5 h-5 text-neutral-900 hover:text-neutral-950" />
                )}
              </button>
            </div>

            {/* Confirm Password field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <LuLock className="w-5 h-5 text-neutral-900" />
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-neutral-100 border border-neutral-200/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
                placeholder="Confirm Password"
                disabled={isLoading}
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <LuEye className="w-5 h-5 text-neutral-900 hover:text-neutral-950" />
                ) : (
                  <LuEyeOff className="w-5 h-5 text-neutral-900 hover:text-neutral-950" />
                )}
              </button>
            </div>

            {/* Password requirements */}
            {newPassword.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-neutral-600">Password requirements:</p>
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
            {newPassword.length === 0 && (
              <p className="text-xs text-neutral-500">
                Password must be at least 8 characters with uppercase, lowercase, and a number.
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white py-3.5 px-4 rounded-xl font-semibold hover:bg-primary-950 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <LuLoader className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                  Resetting...
                </span>
              ) : (
                "Reset Password"
              )}
            </button>

            {/* Back to login link */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-sm text-primary hover:text-primary-950 font-medium"
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
