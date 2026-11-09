import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export function Select(props) {
  return <SelectPrimitive.Root {...props} />;
}

export function SelectTrigger({ children, className = "", ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={`inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 text-left text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white ${className}`}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" className="size-4 text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectValue(props) {
  return <SelectPrimitive.Value {...props} />;
}

export function SelectContent({ children, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className="z-50 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        position="popper"
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ children, ...props }) {
  return (
    <SelectPrimitive.Item
      className="relative flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-9 text-sm text-ink outline-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800 dark:data-[highlighted]:text-white"
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
        <Check aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
