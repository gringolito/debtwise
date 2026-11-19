import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

// `line` is DESIGN.md's tab strip rather than upstream's: tabs as tall as their content over a
// hairline, scrolling sideways when they don't fit, the current one underlined in the accent mark.
const tabsListVariants = cva(
  "group/tabs-list text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] group-data-horizontal/tabs:h-8",
        line: "flex items-end gap-2 overflow-x-auto overscroll-x-contain shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:thin]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

// Focus shows the app-wide outline from index.css instead of upstream's translucent ring; in a
// line strip it sits inside the tab, since the strip's scrolling clips anything outside it.
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 rounded-lg border border-transparent text-callout font-medium text-muted-foreground transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:h-[calc(100%-1px)] group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:px-1.5 group-data-[variant=default]/tabs-list:py-0.5 group-data-[variant=default]/tabs-list:whitespace-nowrap group-data-[variant=default]/tabs-list:data-active:bg-card group-data-[variant=default]/tabs-list:data-active:shadow-xs",
        "group-data-[variant=line]/tabs-list:min-h-11 group-data-[variant=line]/tabs-list:shrink-0 group-data-[variant=line]/tabs-list:flex-col group-data-[variant=line]/tabs-list:items-start group-data-[variant=line]/tabs-list:gap-0.5 group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:pt-2 group-data-[variant=line]/tabs-list:pb-3.5 group-data-[variant=line]/tabs-list:text-left group-data-[variant=line]/tabs-list:focus-visible:outline-offset-[-2px]",
        "after:absolute after:rounded-full after:bg-accent-mark after:opacity-0 group-data-[variant=line]/tabs-list:after:inset-x-3 group-data-[variant=line]/tabs-list:after:bottom-0 group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:scale-x-0 group-data-[variant=line]/tabs-list:after:transition-[transform,opacity] group-data-[variant=line]/tabs-list:after:duration-300 group-data-[variant=line]/tabs-list:after:ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[variant=line]/tabs-list:data-active:after:scale-x-100 group-data-[variant=line]/tabs-list:data-active:after:opacity-100 motion-reduce:after:transition-none",
        className,
      )}
      {...props}
    />
  );
}

// The panel keeps the app-wide focus outline, which upstream removes, so a keyboard reaching it
// from the tabs sees where it went.
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
