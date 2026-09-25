import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";
import { recordHistogram } from "@/otel/metrics";
import { withSpan } from "@/otel/tracing";
import type { Restaurant } from "@/lib/mock-backend/types";
import styles from "./page.module.css";

// Next's own root span for this route is always "GET /restaurants/[id]"
// (the route pattern, not the actual restaurant) — that's intentional on
// Next's part (avoids unbounded span-name cardinality) and not something
// this app can safely override. This custom span is the reliable place to
// see the resolved restaurant id — its name includes it, see §7.9.
async function fetchRestaurant(id: string): Promise<Restaurant | null> {
  return withSpan(
    `page.restaurant-detail ${id}`,
    async () => {
      const baseUrl = await getBaseUrl();
      const start = performance.now();

      const response = await fetch(`${baseUrl}/api/restaurants/${id}`, {
        cache: "no-store",
      });

      recordHistogram("restaurant_menu_fetch_duration_ms", performance.now() - start, {
        "http.status_code": response.status,
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to load restaurant "${id}" (${response.status}).`);
      }

      return response.json();
    },
    { "restaurant.id": id }
  );
}

export default async function RestaurantPage(props: PageProps<"/restaurants/[id]">) {
  const { id } = await props.params;
  const restaurant = await fetchRestaurant(id);

  if (!restaurant) {
    notFound();
  }

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        ← All restaurants
      </Link>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1>{restaurant.name}</h1>
          <span className={styles.rating}>★ {restaurant.rating.toFixed(1)}</span>
        </div>
        <p className={styles.cuisine}>{restaurant.cuisine}</p>
        <p className={styles.description}>{restaurant.description}</p>
      </header>

      <main>
        {restaurant.menu.map((category) => (
          <section key={category.category} className={styles.category}>
            <h2>{category.category}</h2>
            <ul className={styles.items}>
              {category.items.map((item) => (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemTop}>
                    <span className={styles.itemName}>{item.name}</span>
                    <span className={styles.itemPrice}>
                      {formatPrice(item.price, item.currency)}
                    </span>
                  </div>
                  <p className={styles.itemDescription}>{item.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
}
