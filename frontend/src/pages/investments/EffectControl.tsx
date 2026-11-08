import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { effectLabels, type PrepaymentEffect } from "@/lib/mortgageEvents";

/** EffectControl picks what prepaying the proceeds of an early sale changes. */
export function EffectControl({
  value,
  onValueChange,
  className,
}: {
  value: PrepaymentEffect;
  onValueChange: (effect: PrepaymentEffect) => void;
  className?: string;
}) {
  return (
    <SegmentedControl
      aria-label="Efeito da amortização"
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      {(Object.keys(effectLabels) as PrepaymentEffect[]).map((effect) => (
        <SegmentedControlItem key={effect} value={effect}>
          {effectLabels[effect]}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
