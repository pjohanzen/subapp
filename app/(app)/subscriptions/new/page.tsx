import { createSubscription } from "@/app/actions/subscriptions";
import { SubscriptionForm } from "@/components/subscription-form";
import { loadCore } from "@/lib/data";
import { todayInTimezone } from "@/lib/renewals";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Add subscription" };
export const dynamic = "force-dynamic";

export default async function NewSubscriptionPage() {
  const { db, profile } = await requireUser();
  const { categories, paymentMethods } = await loadCore(db);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Add a subscription</h1>
      <SubscriptionForm
        action={createSubscription}
        categories={categories}
        paymentMethods={paymentMethods}
        homeCurrency={profile.home_currency}
        today={todayInTimezone(new Date(), profile.timezone)}
        quickAdd
        submitLabel="Save subscription"
      />
    </div>
  );
}
