import { getDb } from "./db";
import { nowIso } from "./time";

export async function getSetting(key: string) {
  const db = await getDb();
  const row = await db.selectFrom("app_setting").select("value").where("key", "=", key).executeTakeFirst();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  const updatedAt = nowIso();
  await db
    .insertInto("app_setting")
    .values({ key, value, updated_at: updatedAt })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value, updated_at: updatedAt }))
    .execute();
}

export async function deleteSetting(key: string) {
  const db = await getDb();
  await db.deleteFrom("app_setting").where("key", "=", key).execute();
}

export async function getBooleanSetting(key: string, fallback = false) {
  const value = await getSetting(key);
  if (value === null) return fallback;
  return value === "true" || value === "1";
}

export async function setBooleanSetting(key: string, value: boolean) {
  await setSetting(key, value ? "true" : "false");
}
