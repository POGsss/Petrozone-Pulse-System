import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { LuMail, LuLock, LuEye, LuEyeOff, LuLoader } from "react-icons/lu";

export function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

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
                            <div className="bg-negative-50 border border-negative-200 text-negative-700 px-4 py-3 rounded-lg text-sm">
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
                            <a href="#" className="text-sm text-primary hover:text-primary-950 font-medium">
                                Recover Password
                            </a>
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
        </div>
    );
}
