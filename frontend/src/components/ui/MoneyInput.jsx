import { useState } from "react";
import { parseMajorToMinor } from "../../lib/money.js";
import { Input } from "./Input.jsx";

export function MoneyInput({
  currency = "INR",
  onMinorChange,
  value: controlledValue,
  onChange: onValueChange,
  ...props
}) {
  const [localValue, setLocalValue] = useState("");
  const value = controlledValue ?? localValue;

  function handleChange(event) {
    const next = event.target.value;
    if (controlledValue === undefined) setLocalValue(next);
    onValueChange?.(event);
    try {
      onMinorChange?.(parseMajorToMinor(next, currency));
    } catch {
      onMinorChange?.(null);
    }
  }

  return (
    <Input
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
}
