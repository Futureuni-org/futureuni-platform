"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog, Field, Select } from "@/components/admin";
import { ChipMultiSelect } from "@/modules/acquisition/ui/settings/editor-fields";
import {
  changeRoleAction,
  forceSignOutAction,
  inviteUserAction,
  resendInviteAction,
  resetUser2faAction,
  revokeInviteAction,
  setUserActiveAction,
} from "../actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  SERVICE_LEAD: "Service lead",
  MEMBER: "Member",
};
const LINE_OPTIONS = [
  { value: "WEB_DEVELOPMENT", label: "Web" },
  { value: "UI_UX_DESIGN", label: "UI/UX" },
  { value: "GRAPHIC_DESIGN", label: "Graphic" },
  { value: "VIDEO_EDITING", label: "Video" },
];

export interface UserCapabilities {
  canChangeRole: boolean;
  canDeactivate: boolean;
  canReset2fa: boolean;
  canForceSignOut: boolean;
}

/** Roles an inviter may grant (CEIL: at or below their own, never ADMIN unless they are ADMIN). */
function invitableRoles(inviterRole: string): string[] {
  if (inviterRole === "ADMIN") return ["ADMIN", "MANAGER", "SERVICE_LEAD", "MEMBER"];
  if (inviterRole === "MANAGER") return ["MANAGER", "SERVICE_LEAD", "MEMBER"];
  return [];
}

export function InviteDialog({ inviterRole }: { inviterRole: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [lines, setLines] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const roles = invitableRoles(inviterRole);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await inviteUserAction({ email, role, serviceLines: lines });
      if (result.ok) {
        setLink(result.data.link);
        toast.success(`Invited ${result.data.email}.`);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus aria-hidden className="size-4" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to set a password.</DialogDescription>
        </DialogHeader>
        {link === null ? (
          <>
            <Field label="Email">
              {({ id }) => (
                <Input id={id} type="email" value={email} onChange={(e) => { setEmail(e.target.value); }} placeholder="name@futureuni.local" />
              )}
            </Field>
            <Field label="Role">
              {({ id }) => (
                <Select
                  id={id}
                  value={role}
                  options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
                  onChange={(e) => { setRole(e.target.value); }}
                />
              )}
            </Field>
            <ChipMultiSelect label="Service lines" values={lines} options={LINE_OPTIONS} onChange={setLines} />
            {error != null && <p role="alert" aria-live="polite" className="text-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button variant="secondary" onClick={() => { setOpen(false); }} disabled={pending}>Cancel</Button>
              <Button onClick={submit} loading={pending} disabled={email.trim() === ""}>Send invite</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Invite sent. Share this link if the email doesn&apos;t arrive:</p>
            <code className="break-all rounded-md bg-zone p-2 font-mono text-xs">{link}</code>
            <DialogFooter>
              <Button onClick={() => { setOpen(false); setLink(null); setEmail(""); setLines([]); }}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UserActions({
  userId,
  userName,
  role,
  status,
  caps,
}: {
  userId: string;
  userName: string;
  role: string;
  status: "ACTIVE" | "DEACTIVATED";
  caps: UserCapabilities;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "role" | "deactivate" | "reactivate" | "reset2fa" | "signout">(null);
  const [newRole, setNewRole] = useState(role);

  function refresh() {
    router.refresh();
  }
  const anyAction = caps.canChangeRole || caps.canDeactivate || caps.canReset2fa || caps.canForceSignOut;
  if (!anyAction) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label={`Actions for ${userName}`}>
            <MoreHorizontal aria-hidden className="size-4" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {caps.canChangeRole && (
            <DropdownMenuItem onSelect={() => { setNewRole(role); setDialog("role"); }}>Change role</DropdownMenuItem>
          )}
          {caps.canDeactivate &&
            (status === "ACTIVE" ? (
              <DropdownMenuItem onSelect={() => { setDialog("deactivate"); }}>Deactivate</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => { setDialog("reactivate"); }}>Reactivate</DropdownMenuItem>
            ))}
          {caps.canReset2fa && (
            <DropdownMenuItem onSelect={() => { setDialog("reset2fa"); }}>Reset 2FA</DropdownMenuItem>
          )}
          {caps.canForceSignOut && (
            <DropdownMenuItem onSelect={() => { setDialog("signout"); }}>Force sign-out</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "role"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={`Change ${userName}'s role`}
        description="Changing a role rotates the user's sessions; they'll need to sign in again."
        confirmLabel="Change role"
        body={
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">New role</span>
            <Select
              aria-label="New role"
              value={newRole}
              options={Object.keys(ROLE_LABEL).map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
              onChange={(e) => { setNewRole(e.target.value); }}
            />
          </label>
        }
        onConfirm={async () => {
          const result = await changeRoleAction(userId, newRole);
          if (result.ok) { toast.success("Role changed."); refresh(); }
          return result;
        }}
      />

      <ConfirmDialog
        open={dialog === "deactivate"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        tone="danger"
        title={`Deactivate ${userName}`}
        description="They'll be signed out and can't sign in until reactivated."
        confirmLabel="Deactivate"
        onConfirm={async () => {
          const result = await setUserActiveAction(userId, false);
          if (result.ok) { toast.success("User deactivated."); refresh(); }
          return result;
        }}
      />
      <ConfirmDialog
        open={dialog === "reactivate"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={`Reactivate ${userName}`}
        confirmLabel="Reactivate"
        onConfirm={async () => {
          const result = await setUserActiveAction(userId, true);
          if (result.ok) { toast.success("User reactivated."); refresh(); }
          return result;
        }}
      />
      <ConfirmDialog
        open={dialog === "reset2fa"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        tone="danger"
        title={`Reset ${userName}'s 2FA`}
        description="Their authenticator is removed; they'll set it up again at next sign-in."
        confirmLabel="Reset 2FA"
        onConfirm={async () => {
          const result = await resetUser2faAction(userId);
          if (result.ok) { toast.success("2FA reset."); refresh(); }
          return result;
        }}
      />
      <ConfirmDialog
        open={dialog === "signout"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        tone="danger"
        title={`Sign ${userName} out everywhere`}
        confirmLabel="Force sign-out"
        onConfirm={async () => {
          const result = await forceSignOutAction(userId);
          if (result.ok) { toast.success("Signed out of all sessions."); refresh(); }
          return result;
        }}
      />
    </>
  );
}

export function PendingInviteActions({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const result = await resendInviteAction(inviteId);
      if (result.ok) toast.success("Invite resent.");
      else toast.error(result.error.message);
    });
  }
  function revoke() {
    startTransition(async () => {
      const result = await revokeInviteAction(inviteId);
      if (result.ok) { toast.success("Invite revoked."); router.refresh(); }
      else toast.error(result.error.message);
    });
  }

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={resend} disabled={pending}>Resend</Button>
      <Button variant="ghost" size="sm" className="text-danger" onClick={revoke} disabled={pending}>Revoke</Button>
    </div>
  );
}
