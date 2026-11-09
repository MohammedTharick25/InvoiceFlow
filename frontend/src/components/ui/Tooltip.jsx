import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export function TooltipProvider({ children }) {
  return (
    <TooltipPrimitive.Provider delayDuration={350}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ children, content }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="z-50 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white shadow-lg"
          sideOffset={5}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-950" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
