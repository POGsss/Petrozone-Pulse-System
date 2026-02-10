import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { LuMail, LuLock, LuEye, LuEyeOff, LuLoader, LuX, LuCheck } from "react-icons/lu";
import { authApi } from "../lib/api";

export function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Forgot password state
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotError, setForgotError] = useState("");
    const [forgotSuccess, setForgotSuccess] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            await login(email, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e: FormEvent) => {
        e.preventDefault();
        setForgotError("");
        setForgotLoading(true);

        try {
            await authApi.forgotPassword(forgotEmail);
            setForgotSuccess(true);
        } catch (err) {
            setForgotError(err instanceof Error ? err.message : "Failed to send reset email");
        } finally {
            setForgotLoading(false);
        }
    };

    const closeForgotModal = () => {
        setShowForgotModal(false);
        setForgotEmail("");
        setForgotError("");
        setForgotSuccess(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4">
            <div className="w-full max-w-md">
                {/* Login card */}
                <div className="bg-white rounded-2xl p-8">
                    {/* Logo and title */}
                    <div className="flex flex-col items-center mb-8">
                        <h1 className="text-2xl font-bold text-neutral-950 mt-6">Welcome back!</h1>
                        <p className="text-neutral-500 mt-1">Login to your account</p>
                    </div>

                    {/* Login form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="bg-negative-200 border border-negative text-negative-950 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {/* Email field */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <LuMail className="w-5 h-5 text-neutral-900" />
                            </div>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-neutral-100 border border-neutral-200/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
                                placeholder="Email Address"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Password field */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <LuLock className="w-5 h-5 text-neutral-900" />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-12 py-3 bg-neutral-100 border border-neutral-200/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
                                placeholder="Password"
                                disabled={isLoading}
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

                        {/* Recover password link */}
                        <div className="text-right">
                            <button
                                type="button"
                                onClick={() => setShowForgotModal(true)}
                                className="text-sm text-primary hover:text-primary-950 font-medium"
                            >
                                Recover Password
                            </button>
                        </div>

                        {/* Login button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-primary text-white py-3.5 px-4 rounded-xl font-semibold hover:bg-primary-950 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center">
                                    <LuLoader className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                                    Signing in...
                                </span>
                            ) : (
                                "Login"
                            )}
                        </button>
                    </form>
                </div>
            </div>

            {/* Forgot Password Modal */}
            {showForgotModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/50" onClick={closeForgotModal} />
                    <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
                        {/* Close button */}
                        <button
                            onClick={closeForgotModal}
                            className="absolute right-4 top-4 p-1 text-neutral-400 hover:text-neutral-600 rounded-lg"
                        >
                            <LuX className="w-5 h-5" />
                        </button>

                        {forgotSuccess ? (
                            /* Success state */
                            <div className="text-center py-4">
                                <div className="w-16 h-16 bg-positive-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <LuCheck className="w-8 h-8 text-positive-600" />
                                </div>
                                <h2 className="text-xl font-semibold text-neutral-950 mb-2">Check your email</h2>
                                <p className="text-neutral-500 mb-6">
                                    If an account exists with <strong>{forgotEmail}</strong>, you will receive a password reset link shortly.
                                </p>
                                <button
                                    onClick={closeForgotModal}
                                    className="w-full bg-primary text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-950 transition"
                                >
                                    Back to Login
                                </button>
                            </div>
                        ) : (
                            /* Form state */
                            <>
                                <h2 className="text-xl font-semibold text-neutral-950 mb-2">Forgot Password</h2>
                                <p className="text-neutral-500 mb-6">
                                    Enter your email address and we'll send you a link to reset your password.
                                </p>

                                {forgotError && (
                                    <div className="bg-negative-50 border border-negative-200 text-negative-700 px-4 py-3 rounded-lg text-sm mb-4">
                                        {forgotError}
                                    </div>
                                )}

                                <form onSubmit={handleForgotPassword} className="space-y-4">
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <LuMail className="w-5 h-5 text-neutral-900" />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            value={forgotEmail}
                                            onChange={(e) => setForgotEmail(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3 bg-neutral-100 border border-neutral-200/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
                                            placeholder="Email Address"
                                            disabled={forgotLoading}
                                        />
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={closeForgotModal}
                                            className="flex-1 py-3 px-4 border border-neutral-300 rounded-xl font-semibold text-neutral-700 hover:bg-neutral-50 transition"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={forgotLoading}
                                            className="flex-1 bg-primary text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                        >
                                            {forgotLoading ? (
                                                <span className="flex items-center justify-center">
                                                    <LuLoader className="animate-spin -ml-1 mr-2 h-5 w-5" />
                                                    Sending...
                                                </span>
                                            ) : (
                                                "Send Reset Link"
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
