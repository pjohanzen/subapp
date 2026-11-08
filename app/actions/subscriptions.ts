"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstError, idInput, subscriptionInput } from "@/lib/schemas";
import { requireUser, type FormState } from "@/lib/session";

function parse(formData: FormData) {
  return subscriptionInput.safeParse(Object.fromEntries(formData));
}

function toRow(v: NonNullable<ReturnType<typeof parse>["data"]>) {
  const { amount: _amount, ...rest } = v;
  void _amount;
  return {
    ...rest,
    currency: v.currency,
    notes: v.notes?.trim() ? v.notes.trim() : null,
    anchor_day: Number(v.next_renewal.slice(8, 10)),
  };
}

export async function createSubscription(_: FormState, formData: FormData): Promise<FormState> {
  const { db, user } = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await db.from("subscriptions").insert({ ...toRow(parsed.data), user_id: user.id });
  if (error) return { error: "Could not save. Check that the category and payment method still exist." };
  revalidatePath("/", "layout");
  redirect("/subscriptions");
}

export async function updateSubscription(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const { db, user } = await requireUser();
  if (!idInput.safeParse(id).success) return { error: "Invalid subscription" };
  const parsed = parse(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error, data } = await db.from("subscriptions").update(toRow(parsed.data)).eq("id", id).eq("user_id", user.id).select("id");
  if (error || !data?.length) return { error: "Could not save changes." };
  revalidatePath("/", "layout");
  redirect("/subscriptions");
}

export async function deleteSubscription(formData: FormData) {
  const { db, user } = await requireUser();
  const id = idInput.safeParse(formData.get("id"));
  if (!id.success) return;
  await db.from("subscriptions").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/subscriptions");
}
