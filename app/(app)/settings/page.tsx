import { addCategory, addPaymentMethod, deleteAccount, deleteCategory, deletePaymentMethod, updateProfile, updateReminders } from "@/app/actions/settings";
import { DeleteAccountForm, NamedList, ProfileForm, ReminderForm } from "@/components/settings-forms";
import { Button } from "@/components/ui/button";
import { KNOWN_CURRENCIES } from "@/lib/parser";
import { loadCore } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { db, profile } = await requireUser();
  const { categories, paymentMethods } = await loadCore(db);
  const { data: rem } = await db.from("reminders").select("days_before");
  const enabled = (rem ?? []).map((r) => r.days_before as number);
  const timezones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [profile.timezone];

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="space-y-3"><h2 className="font-medium">Currency and time zone</h2>
        <ProfileForm action={updateProfile} home={profile.home_currency} timezone={profile.timezone} currencies={[...KNOWN_CURRENCIES].sort()} timezones={timezones} />
      </section>
      <section className="space-y-3"><h2 className="font-medium">Email reminders</h2>
        <ReminderForm action={updateReminders} enabled={enabled} />
      </section>
      <section className="space-y-6"><h2 className="font-medium">Categories and payment methods</h2>
        <p className="text-sm text-muted-foreground">Deleting one moves its subscriptions to another, so nothing is left without a category or payment method.</p>
        <NamedList title="Categories" items={categories} addAction={addCategory} deleteAction={deleteCategory} />
        <NamedList title="Payment methods" items={paymentMethods} addAction={addPaymentMethod} deleteAction={deletePaymentMethod} />
      </section>
      <section className="space-y-3"><h2 className="font-medium">Your data</h2>
        <Button render={<a href="/api/export" download />} variant="outline">Export subscriptions (CSV)</Button>
      </section>
      <section className="space-y-3 rounded-xl border border-destructive/40 p-4"><h2 className="font-medium text-destructive">Delete account</h2>
        <DeleteAccountForm action={deleteAccount} />
      </section>
    </div>
  );
}
