import Link from "next/link";
import { getBaseUrl } from "@/lib/get-base-url";
import { recordHistogram } from "@/otel/metrics";
import { withSpan } from "@/otel/tracing";
import { ViewTracker } from "@/components/ViewTracker";
import type { RestaurantSummary } from "@/lib/mock-backend/types";
import styles from "./page.module.css";

// Wrapped in its own span (§7.9) — Next's own root span for this route
// ("GET /") is fine here since "/" has no dynamic segment, but every page
// gets a matching custom span for consistency, and so the fetch's
// resolved duration/status are attached to something more specific than
// the whole-request span.
async function fetchRestaurants(): Promise<RestaurantSummary[]> {
  return withSpan("page.restaurant-list", async () => {
    const baseUrl = await getBaseUrl();
    const start = performance.now();

    const response = await fetch(`${baseUrl}/api/restaurants`, {
      cache: "no-store",
    });

    recordHistogram("restaurant_list_fetch_duration_ms", performance.now() - start, {
      "http.status_code": response.status,
    });

    if (!response.ok) {
      throw new Error(`Failed to load restaurants (${response.status}).`);
    }

    return response.json();
  });
}

export default async function Home() {
  const restaurants = await fetchRestaurants();

  return (
    <div className={styles.page}>
      <ViewTracker metricName="restaurant_list_view_count" />
      <header className={styles.header}>
        <h1>Restaurants</h1>
        <p>Pick a restaurant to see its menu and prices.</p>
      </header>
      <main className={styles.grid}>
        {restaurants.map((restaurant) => (
          <Link
            key={restaurant.id}
            href={`/restaurants/${restaurant.id}`}
            className={styles.card}
          >
            <div className={styles.cardTop}>
              <h2>{restaurant.name}</h2>
              <span className={styles.rating}>★ {restaurant.rating.toFixed(1)}</span>
            </div>
            <p className={styles.cuisine}>{restaurant.cuisine}</p>
            <p className={styles.description}>{restaurant.description}</p>
          </Link>
        ))}
      </main>
    </div>
  );
}
