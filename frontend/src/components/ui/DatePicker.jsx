import { Input } from "./Input.jsx";

export function DatePicker({ label, id, ...props }) {
  return (
    <label
      className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100"
      htmlFor={id}
    >
      {label}
      <Input id={id} type="date" {...props} />
    </label>
  );
}
