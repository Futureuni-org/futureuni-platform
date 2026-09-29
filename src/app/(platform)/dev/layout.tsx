import { requireUser, canFromUser } from "@/platform/auth";
import { PermissionState } from "@/components/patterns/states";

/**
 * /dev/** is a developer surface. In production only ADMIN sees it
 * (`platform.devGallery.read`); in development everyone can open it.
 */
export default async function DevLayout({ children }: LayoutProps<"/dev">) {
  const user = await requireUser();
  const allowed =
    process.env.NODE_ENV === "development"
      ? true
      : canFromUser(user, "platform.devGallery.read");
  if (!allowed) {
    return (
      <PermissionState
        title="Dev gallery is admin-only in production"
        description="Sign in with an administrator account to view it."
      />
    );
  }
  return <div className="flex flex-col gap-8">{children}</div>;
}
