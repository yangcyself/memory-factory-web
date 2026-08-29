"use client";

import { useFormStatus } from "react-dom";

export function RemoveWatchListButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button-secondary border-red-300 text-red-700 disabled:cursor-wait disabled:opacity-60"
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            `Remove “${name}” from your watch lists? Imported memory items will be kept.`,
          )
        )
          event.preventDefault();
      }}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      <span>{pending ? "Removing…" : "Remove from watch lists"}</span>
    </button>
  );
}
