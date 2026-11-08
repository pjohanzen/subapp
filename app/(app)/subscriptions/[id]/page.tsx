import { notFound } from "next/navigation";
import { updateSubscription } from "@/app/actions/subscriptions";
import { SubscriptionForm } from "@/components/subscription-form";
import { loadCore } from "@/lib/data";
import { fromMinor } from "@/lib/money";
import { todayInTimezone } from "@/lib/renewals";
import { idInput } from "@/lib/schemas";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Edit subscription" };
export const dynamic = "force-dynamic";

export default async function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idInput.safeParse(id).success) notFound();
  const { db, profile } = await requireUser();
  const { subs, categories, paymentMethods } = await loadCore(db);
  const s = subs.find((x) => x.id === id);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Edit {s.name}</h1>
      <SubscriptionForm
        action={updateSubscription.bind(null, s.id)}
        categories={categories}
        paymentMethods={paymentMethods}
        homeCurrency={profile.home_currency}
        today={todayInTimezone(new Date(), profile.timezone)}
        submitLabel="Save changes"
        initial={{
          name: s.name, amount: fromMinor(s.amount_minor, s.currency), currency: s.currency, cycle: s.cycle,
          interval_count: String(s.interval_count), next_renewal: s.next_renewal, category_id: s.category_id,
          payment_method_id: s.payment_method_id, status: s.status, notes: s.notes ?? "",
        }}
      />
    </div>
  );
}
