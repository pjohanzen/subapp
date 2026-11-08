"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serviceRoleConfigured } from "@/lib/env";
import { firstError, idInput, nameInput, profileInput } from "@/lib/schemas";
import { requireUser, type FormState } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const { db, user } = await requireUser();
  const parsed = profileInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await db.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: "Could not save settings." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function updateReminders(_: FormState, formData: FormData): Promise<FormState> {
  const { db, user } = await requireUser();
  const days = z.array(z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(7)]))).safeParse(formData.getAll("days"));
  if (!days.success) return { error: "Invalid reminder days" };
  const wanted = new Set(days.data);
  const del = await db.from("reminders").delete().eq("user_id", user.id).not("days_before", "in", `(${[...wanted].join(",") || "0"})`);
  if (del.error) return { error: "Could not save reminders." };
  if (wanted.size) {
    const { error } = await db.from("reminders").upsert([...wanted].map((d) => ({ user_id: user.id, days_before: d })), { onConflict: "user_id,days_before" });
    if (error) return { error: "Could not save reminders." };
  }
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

type Table = "categories" | "payment_methods";

async function addNamed(table: Table, formData: FormData): Promise<FormState> {
  const { db, user } = await requireUser();
  const parsed = nameInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await db.from(table).insert({ user_id: user.id, name: parsed.data.name });
  if (error) return { error: error.code === "23505" ? "That name already exists." : "Could not add." };
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function addCategory(_: FormState, f: FormData) { return addNamed("categories", f); }
export async function addPaymentMethod(_: FormState, f: FormData) { return addNamed("payment_methods", f); }

async function removeNamed(table: Table, rpc: "delete_category" | "delete_payment_method", _: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireUser();
  const id = idInput.safeParse(formData.get("id"));
  const to = idInput.safeParse(formData.get("reassign_to"));
  if (!id.success || !to.success) return { error: "Choose where to move its subscriptions first." };
  if (id.data === to.data) return { error: "Pick a different one to move subscriptions to." };
  const { error } = await db.rpc(rpc, { p_id: id.data, p_reassign_to: to.data });
  void table;
  if (error) return { error: "Could not delete." };
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function deleteCategory(_: FormState, f: FormData) { return removeNamed("categories", "delete_category", _, f); }
export async function deletePaymentMethod(_: FormState, f: FormData) { return removeNamed("payment_methods", "delete_payment_method", _, f); }

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const { db, user } = await requireUser();
  if (formData.get("confirm") !== "DELETE") return { error: 'Type DELETE to confirm.' };
  if (!serviceRoleConfigured()) return { error: "Account deletion is not configured on this server (missing service role key)." };
  const { error } = await createAdminClient().auth.admin.deleteUser(user.id); // cascades to every user table
  if (error) return { error: "Could not delete the account. Nothing was changed." };
  await db.auth.signOut();
  redirect("/login?deleted=1");
}
