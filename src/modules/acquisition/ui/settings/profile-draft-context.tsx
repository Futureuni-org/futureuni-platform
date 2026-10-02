"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ServiceLineProfile } from "@/contracts/service-line-profile";

export interface ProfileDraftContextValue {
  draft: ServiceLineProfile;
  canEdit: boolean;
  /** Replace one top-level key of the draft. */
  setField: <K extends keyof ServiceLineProfile>(key: K, value: ServiceLineProfile[K]) => void;
  /** Apply an arbitrary immutable update to the whole draft. */
  update: (updater: (draft: ServiceLineProfile) => ServiceLineProfile) => void;
}

const ProfileDraftContext = createContext<ProfileDraftContextValue | null>(null);

export function ProfileDraftProvider({
  value,
  children,
}: {
  value: ProfileDraftContextValue;
  children: ReactNode;
}) {
  return <ProfileDraftContext.Provider value={value}>{children}</ProfileDraftContext.Provider>;
}

export function useDraft(): ProfileDraftContextValue {
  const ctx = useContext(ProfileDraftContext);
  if (ctx === null) throw new Error("useDraft must be used inside ProfileDraftProvider");
  return ctx;
}
