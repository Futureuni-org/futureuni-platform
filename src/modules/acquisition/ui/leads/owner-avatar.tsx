import { Avatar } from "@/components/ui/avatar";

/**
 * A person's avatar as decoration, with their name given as text. The shared `Avatar` names itself
 * with an `aria-label` on a span that has no role: assistive technology ignores a label there, and
 * axe reports it as a serious violation (`aria-prohibited-attr`). So the picture is hidden from
 * assistive technology here, and the name comes from the text beside it or, where there is none,
 * from `label`, which only screen readers get. See CR-16-AVATAR-LABEL in phases/16/REQUESTS.md:
 * once `Avatar` has `role="img"`, this wrapper can go.
 */
export function OwnerAvatar({
  name,
  src,
  label,
}: {
  name: string;
  src?: string | null;
  /** Read out in place of the picture when the name isn't shown next to it. */
  label?: string;
}) {
  return (
    <>
      <span aria-hidden className="inline-flex shrink-0">
        <Avatar name={name} src={src ?? null} size="sm" />
      </span>
      {label !== undefined && <span className="sr-only">{label}</span>}
    </>
  );
}
