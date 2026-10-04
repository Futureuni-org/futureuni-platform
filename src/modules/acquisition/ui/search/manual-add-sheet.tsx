"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button, Input } from "@/components/ui";
import { MarketBadge } from "@/components/ui/market-badge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Market, ServiceLine } from "@/contracts/common";

import { addManualLeadAction } from "./actions";
import { Field } from "./spec-fields";
import { lineHref } from "@/modules/acquisition/ui/shell/line-context";

/**
 * Add one business by hand. The market is derived from the country and shown. Submits through the
 * manual adapter and, on success, opens the new lead.
 */

interface ManualState {
  name: string;
  website: string;
  phone: string;
  email: string;
  contactName: string;
  contactRole: string;
  city: string;
  country: string;
}

const EMPTY: ManualState = {
  name: "",
  website: "",
  phone: "",
  email: "",
  contactName: "",
  contactRole: "",
  city: "",
  country: "",
};

function deriveMarket(country: string): Market {
  const c = country.trim().toLowerCase();
  return c === "" || c === "ng" || c === "nigeria" ? "NIGERIA" : "INTERNATIONAL";
}

export function ManualAddSheet({
  slug,
  line,
  open,
  onOpenChange,
}: {
  slug: string;
  line: ServiceLine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<ManualState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const market = deriveMarket(state.country);
  const hasChannel = state.website.trim() !== "" || state.phone.trim() !== "" || state.email.trim() !== "";
  const canSubmit = state.name.trim().length >= 2 && hasChannel && !saving;

  function set(patch: Partial<ManualState>): void {
    setState((s) => ({ ...s, ...patch }));
  }

  async function submit(): Promise<void> {
    setSaving(true);
    const res = await addManualLeadAction(slug, {
      company: {
        name: state.name.trim(),
        ...(state.website.trim() === "" ? {} : { website: state.website.trim() }),
        ...(state.phone.trim() === "" ? {} : { phone: state.phone.trim() }),
        ...(state.email.trim() === "" ? {} : { email: state.email.trim() }),
        ...(state.city.trim() === "" ? {} : { city: state.city.trim() }),
        ...(state.country.trim() === "" ? {} : { country: state.country.trim() }),
      },
      ...(state.contactName.trim() === "" && state.contactRole.trim() === "" && state.email.trim() === ""
        ? {}
        : {
            contact: {
              ...(state.contactName.trim() === "" ? {} : { name: state.contactName.trim() }),
              ...(state.contactRole.trim() === "" ? {} : { role: state.contactRole.trim() }),
              ...(state.email.trim() === "" ? {} : { email: state.email.trim() }),
            },
          }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Lead added");
      setState(EMPTY);
      onOpenChange(false);
      if (res.data.leadId !== null) {
        router.push(lineHref(line, `leads/${res.data.leadId}`));
      } else {
        router.refresh();
      }
    } else {
      toast.error(res.error.message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-lg">
        <SheetTitle>Add a lead</SheetTitle>
        <SheetDescription>
          Add one business you found. It follows the same pipeline: enrichment, audit, scoring and review.
        </SheetDescription>

        <Field label="Company name">
          <Input value={state.name} onChange={(e) => { set({ name: e.target.value }); }} placeholder="e.g. Jollof Kitchen" />
        </Field>
        <Field label="Website or social URL" hint="At least one of website, phone or email is needed.">
          <Input value={state.website} onChange={(e) => { set({ website: e.target.value }); }} placeholder="https:// or instagram.com/…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={state.phone} onChange={(e) => { set({ phone: e.target.value }); }} placeholder="+234 803 123 4567" />
          </Field>
          <Field label="Email">
            <Input value={state.email} onChange={(e) => { set({ email: e.target.value }); }} placeholder="name@company.com" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name">
            <Input value={state.contactName} onChange={(e) => { set({ contactName: e.target.value }); }} placeholder="Full name" />
          </Field>
          <Field label="Contact role">
            <Input value={state.contactRole} onChange={(e) => { set({ contactRole: e.target.value }); }} placeholder="e.g. Owner" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <Input value={state.city} onChange={(e) => { set({ city: e.target.value }); }} placeholder="e.g. Lagos" />
          </Field>
          <Field label="Country">
            <Input value={state.country} onChange={(e) => { set({ country: e.target.value }); }} placeholder="e.g. Nigeria or GB" />
          </Field>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          Market:
          <MarketBadge market={market} />
        </div>

        <div className="mt-auto flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => { onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {saving ? "Adding…" : "Add lead"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
