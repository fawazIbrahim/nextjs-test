"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: "2.5rem 1.5rem", maxWidth: 960, margin: "0 auto" }}>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button onClick={reset} style={{ marginTop: "1rem" }}>
        Try again
      </button>
    </div>
  );
}
