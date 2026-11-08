"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const tableContainerVariants = cva("relative w-full overflow-x-auto", {
  variants: {
    variant: {
      default: "",
      /** A white panel whose rows read like an inset grouped list's. */
      grouped: "rounded-lg border bg-card",
    },
  },
  defaultVariants: { variant: "default" },
});

const tableVariants = cva("w-full caption-bottom", {
  variants: {
    variant: {
      default: "text-callout",
      grouped: "text-body tabular-nums",
    },
  },
  defaultVariants: { variant: "default" },
});

function Table({
  className,
  variant,
  ...props
}: React.ComponentProps<"table"> & VariantProps<typeof tableVariants>) {
  return (
    <div data-slot="table-container" className={tableContainerVariants({ variant })}>
      <table data-slot="table" className={cn(tableVariants({ variant }), className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

const tableRowVariants = cva("border-b transition-colors", {
  variants: {
    variant: {
      default: "hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
      /** A grouped table's row, which nothing selects. */
      grouped: "",
      /** A grouped table's row the owner has to check, tinted with a caution bar on its edge. */
      caution: "bg-caution-tint shadow-[inset_4px_0_0_var(--color-caution)]",
    },
  },
  defaultVariants: { variant: "default" },
});

function TableRow({
  className,
  variant,
  ...props
}: React.ComponentProps<"tr"> & VariantProps<typeof tableRowVariants>) {
  return (
    <tr data-slot="table-row" className={cn(tableRowVariants({ variant }), className)} {...props} />
  );
}

const tableHeadVariants = cva(
  "align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      variant: {
        default: "h-10 px-2 font-medium",
        /** A grouped table's column header, in the footnote caps of a section header. */
        grouped:
          "h-11 px-4 text-footnote font-normal tracking-wide text-muted-foreground uppercase",
        /** A grouped table's row header, read as the row's label. */
        "grouped-row": "px-4 py-3.5 font-normal",
      },
      align: {
        start: "text-left",
        end: "text-right",
      },
    },
    defaultVariants: { variant: "default", align: "start" },
  },
);

function TableHead({
  className,
  variant,
  align,
  ...props
}: Omit<React.ComponentProps<"th">, "align"> & VariantProps<typeof tableHeadVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(tableHeadVariants({ variant, align }), className)}
      {...props}
    />
  );
}

const tableCellVariants = cva("[&:has([role=checkbox])]:pr-0", {
  variants: {
    variant: {
      default: "p-2 align-middle whitespace-nowrap",
      /** A grouped table's cell, whose notes wrap under its value. */
      grouped: "px-4 py-3.5 align-top",
    },
    align: {
      start: "text-left",
      end: "text-right",
    },
  },
  defaultVariants: { variant: "default", align: "start" },
});

function TableCell({
  className,
  variant,
  align,
  ...props
}: Omit<React.ComponentProps<"td">, "align"> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(tableCellVariants({ variant, align }), className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-callout text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
