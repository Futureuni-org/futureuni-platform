"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/patterns/section";

export default function InputsGalleryPage() {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-10">
      <Section title="Text inputs">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Email</span>
            <Input
              type="email"
              placeholder="you@futureuni.com"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Company</span>
            <Input placeholder="Adunni Bakes & Events" />
          </label>
        </div>
      </Section>
      <Section title="Textarea">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Message body</span>
          <Textarea placeholder="Write a draft…" defaultValue="" />
        </label>
      </Section>
    </div>
  );
}
