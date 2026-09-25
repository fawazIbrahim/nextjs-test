import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "2.5rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Restaurant not found</h1>
      <p>We couldn&apos;t find that restaurant.</p>
      <Link href="/" style={{ display: "inline-block", marginTop: "1rem" }}>
        ← All restaurants
      </Link>
    </div>
  );
}
