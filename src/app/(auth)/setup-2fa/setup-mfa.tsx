"use client";

import { useRouter } from "next/navigation";
import { MfaSetup } from "@/app/(app)/account/mfa-card";

export function SetupMfa() {
  const router = useRouter();
  return <MfaSetup enabled={false} required onEnabled={() => router.replace("/")} />;
}
