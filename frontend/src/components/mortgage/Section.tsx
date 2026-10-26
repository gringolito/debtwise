import { useId } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SectionProps = React.ComponentProps<typeof Card> & { heading: string };

/** Section is a titled card that screen readers reach as a region named by its heading. */
export function Section({ heading, children, ...props }: SectionProps) {
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId} {...props}>
      <CardHeader>
        <CardTitle id={headingId}>{heading}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
