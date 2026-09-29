"use client";

import { Send } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Section } from "@/components/patterns/section";

export default function ButtonsGalleryPage() {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Variants">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="link">Link-style</Button>
        </div>
      </Section>
      <Section title="Sizes">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <IconButton aria-label="Send"><Send aria-hidden className="size-4" /></IconButton>
        </div>
      </Section>
      <Section title="States">
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>
    </div>
  );
}
