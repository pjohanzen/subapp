import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FX_ATTRIBUTION } from "@/lib/fx/provider";
import { requireUser } from "@/lib/session";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 hover:bg-muted focus-visible:outline-2">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/subscriptions/new" />} size="sm">Add</Button>
          <form action={signOut}><Button type="submit" variant="ghost" size="sm">Sign out</Button></form>
        </div>
      </header>
      <main className="flex-1 pb-12">{children}</main>
      <footer className="border-t py-4 text-xs text-muted-foreground">
        <a href={FX_ATTRIBUTION.href} className="underline" rel="noopener noreferrer">{FX_ATTRIBUTION.label}</a>
      </footer>
    </div>
  );
}
