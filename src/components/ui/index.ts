/**
 * `@/components/ui` — the FUTUREUNI primitive library.
 *
 * Every export is a small, accessible, token-only primitive built on Radix or a hand-rolled
 * base. Phases 15–18 import from here; feature code composes patterns from these.
 */

export { Avatar, AvatarGroup } from "./avatar";
export { Badge, type BadgeProps } from "./badge";
export { Button, IconButton, type ButtonProps } from "./button";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export { Input } from "./input";
export { Kbd } from "./kbd";
export { MarketBadge } from "./market-badge";
export { Money } from "./money";
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover";
export { ReadingRule } from "./reading-rule";
export { RelativeTime } from "./relative-time";
export { Separator } from "./separator";
export { ServiceLineBadge } from "./service-line-badge";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
export { Skeleton } from "./skeleton";
export { StatusBadge, statusMeta, type StatusBadgeProps, type StatusKind } from "./status-badge";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
export { Textarea } from "./textarea";
export { Toaster } from "./toaster";
export { Tooltip, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "./tooltip";
