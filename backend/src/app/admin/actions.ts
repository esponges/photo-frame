"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, login } from "@/lib/auth";
import { invalidateMediaCache } from "@/lib/drive";
import { store } from "@/lib/store";
import type { Settings } from "@/lib/types";

async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Not authorised");
}

export async function doLogin(form: FormData) {
  await login(String(form.get("password") ?? ""));
  revalidatePath("/admin");
}

export async function doSkip() {
  await assertAdmin();
  await store().pushCommand({ type: "skip" });
  revalidatePath("/admin");
}

export async function doResync() {
  await assertAdmin();
  // A manual resync usually follows adding photos in Drive; don't serve the cached list.
  invalidateMediaCache();
  await store().pushCommand({ type: "resync" });
  revalidatePath("/admin");
}

export async function doHide(form: FormData) {
  await assertAdmin();
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await store().hide(id);
  // Hiding what's on screen should take it off screen immediately.
  await store().pushCommand({ type: "resync" });
  await store().pushCommand({ type: "skip" });
  revalidatePath("/admin");
}

export async function doUnhide(form: FormData) {
  await assertAdmin();
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await store().unhide(id);
  await store().pushCommand({ type: "resync" });
  revalidatePath("/admin");
}

export async function doSaveSettings(form: FormData) {
  await assertAdmin();
  const num = (k: string) => {
    const v = form.get(k);
    return v === null || v === "" ? undefined : Number(v);
  };
  const patch: Partial<Settings> = {
    intervalSec: num("intervalSec"),
    transitionMs: num("transitionMs"),
    transition: (form.get("transition") as Settings["transition"]) || undefined,
    onHour: num("onHour"),
    offHour: num("offHour"),
    brightness: num("brightness"),
    showCaption: form.get("showCaption") === "on",
    showDate: form.get("showDate") === "on",
  };
  for (const k of Object.keys(patch) as (keyof Settings)[]) {
    if (patch[k] === undefined) delete patch[k];
  }
  await store().setSettings(patch);
  revalidatePath("/admin");
}
