import { cn } from "@/lib/utils";

/** Holds a screen's skeletons and names what is loading for assistive technology. */
export function Loading({
  label,
  className,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  );
}
