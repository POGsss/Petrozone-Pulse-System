import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { LuMail, LuLock, LuEye, LuEyeOff, LuLoader, LuCheck } from "react-icons/lu";
import { authApi } from "../lib/api";
import { showToast } from "../lib/toast";
import { Modal, ModalSection, ModalInput, ModalButtons, ModalError } from "../components";

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
            showToast.error(err instanceof Error ? err.message : "Login failed");
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
            showToast.success("Password reset email sent successfully");
        } catch (err) {
            setForgotError(err instanceof Error ? err.message : "Failed to send reset email");
            showToast.error(err instanceof Error ? err.message : "Failed to send reset email");
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
                                className="w-full pl-12 pr-4 py-3 bg-neutral-100 border border-neutral-100 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
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
                                className="w-full pl-12 pr-12 py-3 bg-neutral-100 border border-neutral-100 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary focus:bg-white outline-none transition text-neutral-950 placeholder-neutral-400"
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
            <Modal
                isOpen={showForgotModal}
                onClose={closeForgotModal}
                title="Forgot Password"
            >
                {forgotSuccess ? (
                    /* Success state */
                    <div className="text-center py-4">
                        <div className="w-16 h-16 bg-positive-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LuCheck className="w-8 h-8 text-positive-950" />
                        </div>
                        <h3 className="text-lg font-semibold text-neutral-950 mb-2">Check your email</h3>
                        <p className="text-neutral-600 mb-6">
                            If an account exists with <strong className="text-neutral-950">{forgotEmail}</strong>, you will receive a password reset link shortly.
                        </p>
                        <button
                            onClick={closeForgotModal}
                            className="w-full bg-primary text-white py-3.5 px-4 rounded-xl font-semibold hover:bg-primary-950 transition"
                        >
                            Back to Login
                        </button>
                    </div>
                ) : (
                    /* Form state */
                    <form onSubmit={handleForgotPassword}>
                        <ModalError message={forgotError} />
                        
                        <ModalSection>
                            <p className="text-neutral-600 mb-4">
                                Enter your email address and we'll send you a link to reset your password.
                            </p>
                            <ModalInput
                                type="email"
                                value={forgotEmail}
                                onChange={setForgotEmail}
                                placeholder="Email Address"
                                required
                                disabled={forgotLoading}
                            />
                        </ModalSection>

                        <ModalButtons
                            onCancel={closeForgotModal}
                            cancelText="Cancel"
                            submitText={forgotLoading ? "Sending..." : "Send Reset Link"}
                            loading={forgotLoading}
                        />
                    </form>
                )}
            </Modal>
        </div>
    );
}
