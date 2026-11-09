import * as Dialog from "@radix-ui/react-dialog";

export function Modal({ title, description, trigger, children }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-5">{children}</div>
          <Dialog.Close
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Close dialog"
          >
            {"\u00d7"}
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
