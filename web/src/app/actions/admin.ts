"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/lib/registry";

/** Moderator actions. Each one is authorised again inside the database (admin role + two-factor), not just here. */

export async function setRackStatus(form: FormData) {
  const db = await createClient();
  const owner = String(form.get("owner"));
  const name = String(form.get("name"));
  await admin.setRackStatus(db, owner, name, String(form.get("status")), String(form.get("reason") ?? "") || null);
  revalidatePath(`/${owner}/${name}`);
  revalidatePath("/admin");
}

export async function deleteRackAsAdmin(form: FormData) {
  const db = await createClient();
  await admin.deleteRack(db, String(form.get("owner")), String(form.get("name")));
  revalidatePath("/admin");
}

export async function suspendUser(form: FormData) {
  const db = await createClient();
  const username = String(form.get("username"));
  await admin.suspendUser(db, username, form.get("suspend") === "true", String(form.get("reason") ?? "") || null);
  revalidatePath(`/${username}`);
  revalidatePath("/admin");
}

export async function resolveReport(form: FormData) {
  const db = await createClient();
  await admin.resolveReport(db, String(form.get("id")), String(form.get("status")), String(form.get("resolution") ?? "") || null);
  revalidatePath("/admin");
}
