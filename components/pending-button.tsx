"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({
  children,
  pendingLabel,
  className = "button",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      type="submit"
      disabled={pending}
      name={name}
      value={value}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
