import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Scenarios keeps the scenarios of a comparison folded until the owner asks to see them. */
export function Scenarios({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-col items-start gap-4">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm">
            {open ? "Ocultar cenários" : "Ver cenários"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="w-full">
          <div className="flex flex-col gap-4">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
