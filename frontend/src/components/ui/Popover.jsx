import * as PopoverPrimitive from "@radix-ui/react-popover";

export function Popover({ children, ...props }) {
  return <PopoverPrimitive.Root {...props}>{children}</PopoverPrimitive.Root>;
}

export function PopoverTrigger({ children, ...props }) {
  return (
    <PopoverPrimitive.Trigger asChild {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

export function PopoverContent({ children, className = "", ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        className={`z-50 rounded-xl border border-line bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 ${className}`}
        sideOffset={6}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
