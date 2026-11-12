"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const tableContainerVariants = cva(
  // A table wider than its container scrolls in it, and the scroll stays there.
  "relative w-full overflow-x-auto overscroll-x-contain",
  {
    variants: {
      variant: {
        default: "",
        /** A white panel holding a table of the default density. */
        panel: "@container rounded-lg glass",
        /** A white panel whose rows read like an inset grouped list's. */
        grouped: "@container rounded-lg glass",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/**
 * In a panel the first column stays put under md while the rest scrolls, over an opaque fill that
 * hides what slides under it. A row can change the fill with --pinned-fill. A cell spanning the
 * table, like an expanded row's detail, scrolls with it.
 */
const pinnedFirstColumn =
  "max-md:[--pinned-fill:var(--color-panel)] max-md:[&_tr>:first-child:not([colspan])]:pinned-edge max-md:[&_tr>:first-child:not([colspan])]:sticky max-md:[&_tr>:first-child:not([colspan])]:left-0 max-md:[&_tr>:first-child:not([colspan])]:z-1 max-md:[&_tr>:first-child:not([colspan])]:bg-(--pinned-fill)";
/** The same, for a table that reflows under sm and so pins its column only from sm to md. */
const pinnedFirstColumnFromSm =
  "sm:max-md:[--pinned-fill:var(--color-panel)] sm:max-md:[&_tr>:first-child:not([colspan])]:pinned-edge sm:max-md:[&_tr>:first-child:not([colspan])]:sticky sm:max-md:[&_tr>:first-child:not([colspan])]:left-0 sm:max-md:[&_tr>:first-child:not([colspan])]:z-1 sm:max-md:[&_tr>:first-child:not([colspan])]:bg-(--pinned-fill)";

/**
 * Under sm a table of a name, a second line under it and the figures beside both folds each row
 * into a grid: the first cell is the name, the second goes under it and the rest keep their
 * columns. The second column's heading stays for screen readers only.
 */
const foldedRows =
  "max-sm:block max-sm:[&_thead]:block max-sm:[&_tbody]:block max-sm:[&_tr]:grid max-sm:[&_tr]:auto-cols-auto max-sm:[&_tr]:grid-cols-[minmax(0,1fr)] max-sm:[&_tr]:items-start max-sm:[&_tr]:gap-x-4 max-sm:[&_tr]:px-3.5 max-sm:[&_tr>*]:row-start-1 max-sm:[&_tr>*]:min-w-0 max-sm:[&_tr>*]:max-w-none max-sm:[&_tr>*]:px-0 max-sm:[&_tr>:nth-child(1)]:col-start-1 max-sm:[&_tr>:nth-child(3)]:col-start-2 max-sm:[&_tr>:nth-child(4)]:col-start-3 max-sm:[&_thead_th]:self-center max-sm:[&_thead_th:nth-child(2)]:sr-only max-sm:[&_tbody_th]:pt-3.5 max-sm:[&_tbody_th]:pb-0.5 max-sm:[&_tbody_td:nth-child(2)]:col-start-1 max-sm:[&_tbody_td:nth-child(2)]:row-start-2 max-sm:[&_tbody_td:nth-child(2)]:pt-0 max-sm:[&_tbody_td:nth-child(2)]:pb-3.5 max-sm:[&_tbody_td:nth-child(2)]:text-footnote max-sm:[&_tbody_td:nth-child(n+3)]:row-span-2 max-sm:[&_tbody_td:nth-child(n+3)]:py-3.5";

/**
 * Under sm a table of rows to edit becomes a card a row: the first cell on top, the others in two
 * columns under their own data-label, and the last cell, the row's action, in the card's corner.
 * Its headings stay for screen readers only.
 */
const cardRows =
  "max-sm:block max-sm:[&_thead]:sr-only max-sm:[&_tbody]:block max-sm:[&_tbody_tr]:relative max-sm:[&_tbody_tr]:grid max-sm:[&_tbody_tr]:grid-cols-2 max-sm:[&_tbody_tr]:gap-x-4 max-sm:[&_tbody_tr]:gap-y-3 max-sm:[&_tbody_tr]:p-4 max-sm:[&_tbody_td]:min-w-0 max-sm:[&_tbody_td]:p-0 max-sm:[&_tbody_td:first-child]:col-span-full max-sm:[&_tbody_td:first-child]:pr-9 max-sm:[&_tbody_td:last-child:not(:first-child)]:absolute max-sm:[&_tbody_td:last-child:not(:first-child)]:top-1.5 max-sm:[&_tbody_td:last-child:not(:first-child)]:right-1.5 max-sm:[&_tbody_td[data-label]]:before:mb-0.5 max-sm:[&_tbody_td[data-label]]:before:block max-sm:[&_tbody_td[data-label]]:before:text-footnote max-sm:[&_tbody_td[data-label]]:before:text-muted-foreground max-sm:[&_tbody_td[data-label]]:before:content-[attr(data-label)]";

const tableVariants = cva("w-full caption-bottom", {
  variants: {
    variant: {
      default: "text-callout",
      panel: "text-callout [&_tr>:first-child]:pl-4 [&_tr>:last-child]:pr-4",
      grouped: "text-body tabular-nums max-sm:text-callout",
    },
    reflow: {
      scroll: "",
      /** Under sm, each row folds its second cell under its first. */
      folded: foldedRows,
      /** Under sm, each row becomes a card, with no column pinned. */
      cards: cardRows,
    },
  },
  compoundVariants: [
    { variant: ["panel", "grouped"], reflow: "scroll", class: pinnedFirstColumn },
    { variant: ["panel", "grouped"], reflow: "folded", class: pinnedFirstColumnFromSm },
  ],
  defaultVariants: { variant: "default", reflow: "scroll" },
});

function Table({
  className,
  variant,
  reflow,
  ...props
}: React.ComponentProps<"table"> & VariantProps<typeof tableVariants>) {
  return (
    <div data-slot="table-container" className={tableContainerVariants({ variant })}>
      <table
        data-slot="table"
        className={cn(tableVariants({ variant, reflow }), className)}
        {...props}
      />
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
      default:
        "hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted aria-[current=date]:bg-accent-tint aria-[current=date]:[--pinned-fill:var(--color-accent-tint)]",
      /** A grouped table's row, which nothing selects. */
      grouped: "",
      /** A grouped table's row the owner has to check, tinted with a caution bar on its edge. */
      caution:
        "bg-caution-tint shadow-[inset_4px_0_0_var(--color-caution)] [--pinned-fill:var(--color-caution-tint)]",
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
          "h-11 px-4 text-footnote font-normal tracking-wide text-muted-foreground uppercase max-sm:px-3",
        /** A grouped table's row header, read as the row's label; on a phone it wraps in a narrow column. */
        "grouped-row":
          "px-4 py-3.5 font-normal max-sm:max-w-40 max-sm:min-w-28 max-sm:px-3 max-sm:whitespace-normal",
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
      grouped: "px-4 py-3.5 align-top max-sm:px-3",
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
