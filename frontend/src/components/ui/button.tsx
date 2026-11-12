import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

// Focus shows the app-wide outline from index.css, DESIGN.md's one focus mark, instead of
// upstream's translucent ring. On touch-size screens (under md) the small sizes reach a 44px hit
// area through an ::after that extends past the button without moving anything.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all select-none active:not-aria-[haspopup]:opacity-85 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-graphite-raised",
        inverse: "bg-card text-foreground shadow-raised hover:bg-card/90",
        outline:
          "border-border bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        plain: "text-muted-foreground hover:text-foreground",
        "plain-inverse": "text-graphite-muted-foreground hover:text-graphite-foreground",
        /** A destructive text action, such as "Excluir" beside "Editar" in a page's header. */
        "plain-destructive": "text-destructive hover:text-destructive/80",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        /** The action that confirms a deletion. */
        critical: "bg-destructive text-primary-foreground hover:bg-destructive/90",
        /** "Cancelar" under a confirmation's action. */
        secondary: "bg-muted text-foreground hover:bg-border",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-6 text-callout has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        xs: "h-6 gap-1 px-2 text-footnote has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-callout has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 max-md:relative max-md:after:absolute max-md:after:-inset-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        inline:
          "h-auto gap-1 p-0 text-callout max-md:relative max-md:after:absolute max-md:after:-inset-x-1.5 max-md:after:-inset-y-3.25",
        icon: "size-11",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 max-md:relative max-md:after:absolute max-md:after:-inset-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
