import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const dialogOverlayVariants = cva(
  "fixed inset-0 isolate z-50 bg-foreground/30 supports-backdrop-filter:backdrop-blur-sm",
  {
    variants: {
      motion: {
        fade: "duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        none: "",
      },
    },
    defaultVariants: {
      motion: "fade",
    },
  },
);

function DialogOverlay({
  className,
  motion,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> &
  VariantProps<typeof dialogOverlayVariants>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(dialogOverlayVariants({ motion }), className)}
      {...props}
    />
  );
}

// Under sm a dialog is a bottom sheet: full width at the bottom edge, its top corners rounded, its
// bottom padding clear of the home indicator and its height capped, scrolling inside.
const dialogContentVariants = cva(
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100%-4rem)] w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-lg bg-popover p-8 text-popover-foreground shadow-sheet outline-none max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92svh] max-sm:max-w-none max-sm:translate-none max-sm:rounded-t-sheet max-sm:rounded-b-none max-sm:p-6 max-sm:pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] max-sm:overscroll-contain",
  {
    variants: {
      variant: {
        default:
          "max-w-[520px] duration-150 sm:data-open:animate-in sm:data-open:fade-in-0 sm:data-open:zoom-in-95 sm:data-closed:animate-out sm:data-closed:fade-out-0 sm:data-closed:zoom-out-95 motion-safe:max-sm:data-open:animate-sheet-in motion-safe:max-sm:data-closed:animate-sheet-out",
        /**
         * What follows a sheet once its change is saved. It takes the sheet's place in the same
         * frame and without animation, so the modal reads as one changing its content.
         */
        feedback: "max-w-[520px] text-center",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// Upstream renders an X close button; an Orvalho sheet closes through "Cancelar" in DialogHeader.
function DialogContent({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants>) {
  return (
    <DialogPortal>
      <DialogOverlay motion={variant === "feedback" ? "none" : "fade"} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ variant }), className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex items-baseline justify-between gap-4", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col gap-2 *:w-full", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-title-2", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-callout text-muted-foreground", className)}
      {...props}
    />
  );
}

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
};
