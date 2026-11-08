import { ImportFlow } from "@/components/import-flow";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Import CSV" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Import subscriptions</h1>
      <ImportFlow />
    </div>
  );
}
