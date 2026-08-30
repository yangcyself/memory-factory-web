"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({
  children,
  pendingLabel,
  className = "button",
  name,
  value,
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      type="submit"
      disabled={pending}
      name={name}
      value={value}
      formAction={formAction}
      aria-busy={pending}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
