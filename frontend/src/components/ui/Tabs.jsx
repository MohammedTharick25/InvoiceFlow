import * as TabsPrimitive from "@radix-ui/react-tabs";

export function Tabs({ defaultValue, children, ...props }) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue} {...props}>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabsList({ children, ...props }) {
  return (
    <TabsPrimitive.List
      className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ children, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className="min-h-9 rounded-lg px-3 text-sm font-medium text-slate-600 outline-none transition-colors data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm dark:text-slate-300 dark:data-[state=active]:bg-slate-950 dark:data-[state=active]:text-white"
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ children, ...props }) {
  return <TabsPrimitive.Content {...props}>{children}</TabsPrimitive.Content>;
}
