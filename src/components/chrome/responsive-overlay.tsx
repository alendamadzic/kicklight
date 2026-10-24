"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * One overlay, two shapes: a bottom sheet on phones (thumb reach) and a popover
 * anchored to its trigger on desktop. Used for the stat picker, TV sync and the
 * other remote controls that open a panel.
 */
export function ResponsiveOverlay({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  align = "end",
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opens it; rendered as the trigger. */
  trigger: ReactElement;
  title: string;
  description?: string;
  align?: "start" | "center" | "end";
  className?: string;
  children: ReactNode;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger render={trigger} />
        <PopoverContent
          align={align}
          sideOffset={8}
          className={cn("w-[22rem] gap-3 rounded-2xl", className)}
        >
          <div className="flex flex-col gap-1">
            <PopoverTitle className="text-sm font-semibold">
              {title}
            </PopoverTitle>
            {description ? (
              <PopoverDescription className="text-xs text-muted-foreground">
                {description}
              </PopoverDescription>
            ) : null}
          </div>
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger} />
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[85dvh] gap-3 overflow-y-auto rounded-t-3xl px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]",
          className,
        )}
      >
        <span
          aria-hidden
          className="mx-auto mb-1 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/40"
        />
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
