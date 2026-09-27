"use server";

import { runAction } from "@/lib/action";
import { searchIndex } from "@/modules/search/service";

export async function searchIndexAction() {
  return runAction((actor) => searchIndex(actor), { revalidate: [] });
}
