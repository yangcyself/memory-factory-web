export function Notice({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  const message = error ?? success;
  if (!message) return null;
  return (
    <p
      className={`mb-5 rounded-lg p-3 ${error ? "bg-red-100 text-red-900" : "bg-mist"}`}
      role="status"
    >
      {message}
    </p>
  );
}
