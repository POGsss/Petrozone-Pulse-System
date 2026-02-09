export function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <div className="max-w-md w-full bg-white rounded-lg p-8 text-center">
        <div className="text-6xl mb-4"></div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h1>
        <p className="text-neutral mb-6">
          You don't have permission to access this page. Please contact your administrator if you believe this is an error.
        </p>
        <a
          href="/dashboard"
          className="inline-block bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-950 transition"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
