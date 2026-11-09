import * as Dropdown from "@radix-ui/react-dropdown-menu";

export function DropdownMenu({ trigger, label = "Actions", children }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          aria-label={label}
          className="z-50 min-w-44 rounded-xl border border-line bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          sideOffset={6}
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function DropdownItem({ children, ...props }) {
  return (
    <Dropdown.Item
      className="flex min-h-10 cursor-pointer items-center rounded-lg px-3 text-sm text-ink outline-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800 dark:data-[highlighted]:text-white"
      {...props}
    >
      {children}
    </Dropdown.Item>
  );
}
