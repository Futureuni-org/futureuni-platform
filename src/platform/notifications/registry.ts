import "server-only";

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";
import { getNotificationTypes } from "@/platform/registry";

import { platformNotificationTypes } from "./types";

let byId: Map<string, NotificationTypeDefinition> | null = null;

function ensure(): Map<string, NotificationTypeDefinition> {
  if (byId !== null) return byId;
  const map = new Map<string, NotificationTypeDefinition>();
  for (const type of platformNotificationTypes) map.set(type.id, type);
  for (const type of getNotificationTypes()) map.set(type.id, type);
  byId = map;
  return map;
}

export function _resetNotificationRegistry(): void {
  byId = null;
}

export function getNotificationType(id: string): NotificationTypeDefinition | null {
  return ensure().get(id) ?? null;
}

export function listNotificationTypes(): NotificationTypeDefinition[] {
  return [...ensure().values()];
}
