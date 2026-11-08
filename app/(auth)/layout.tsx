export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscription Tracker</h1>
        <p className="text-sm text-muted-foreground">Know what you pay for and when it renews.</p>
      </div>
      {children}
    </main>
  );
}
