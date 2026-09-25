import type { Restaurant } from "./types";

// Static, hand-written fixtures standing in for a real backend's database.
// See design/DESIGN.md §5.2 — no seeding, no randomness in the data itself.
export const restaurants: Restaurant[] = [
  {
    id: "trattoria-bella",
    name: "Trattoria Bella",
    cuisine: "Italian",
    description: "Family-run trattoria serving handmade pasta and wood-fired pizza.",
    rating: 4.6,
    menu: [
      {
        category: "Starters",
        items: [
          { id: "bruschetta", name: "Bruschetta al Pomodoro", description: "Grilled bread, tomato, basil, garlic.", price: 8.5, currency: "USD" },
          { id: "caprese", name: "Caprese Salad", description: "Buffalo mozzarella, tomato, basil, olive oil.", price: 10, currency: "USD" },
        ],
      },
      {
        category: "Pasta",
        items: [
          { id: "carbonara", name: "Spaghetti Carbonara", description: "Egg, pecorino, guanciale, black pepper.", price: 16, currency: "USD" },
          { id: "lasagna", name: "Lasagna alla Bolognese", description: "Layered pasta, beef ragù, béchamel.", price: 17.5, currency: "USD" },
        ],
      },
      {
        category: "Pizza",
        items: [
          { id: "margherita", name: "Margherita", description: "Tomato, mozzarella, basil.", price: 14, currency: "USD" },
          { id: "diavola", name: "Diavola", description: "Tomato, mozzarella, spicy salami.", price: 15.5, currency: "USD" },
        ],
      },
    ],
  },
  {
    id: "sakura-sushi",
    name: "Sakura Sushi",
    cuisine: "Japanese",
    description: "Modern sushi bar with a daily omakase selection.",
    rating: 4.8,
    menu: [
      {
        category: "Nigiri",
        items: [
          { id: "salmon-nigiri", name: "Salmon Nigiri (2pc)", description: "Fresh salmon over seasoned rice.", price: 6.5, currency: "USD" },
          { id: "tuna-nigiri", name: "Tuna Nigiri (2pc)", description: "Bluefin tuna over seasoned rice.", price: 7.5, currency: "USD" },
          { id: "eel-nigiri", name: "Eel Nigiri (2pc)", description: "Grilled eel, sweet glaze.", price: 8, currency: "USD" },
        ],
      },
      {
        category: "Rolls",
        items: [
          { id: "california-roll", name: "California Roll", description: "Crab, avocado, cucumber.", price: 9, currency: "USD" },
          { id: "spicy-tuna-roll", name: "Spicy Tuna Roll", description: "Tuna, chili mayo, scallion.", price: 10.5, currency: "USD" },
        ],
      },
    ],
  },
  {
    id: "el-fogon",
    name: "El Fogón",
    cuisine: "Mexican",
    description: "Street-style tacos and slow-cooked meats.",
    rating: 4.4,
    menu: [
      {
        category: "Tacos",
        items: [
          { id: "al-pastor", name: "Al Pastor", description: "Marinated pork, pineapple, cilantro, onion.", price: 4, currency: "USD" },
          { id: "carne-asada", name: "Carne Asada", description: "Grilled beef, cilantro, onion, salsa verde.", price: 4.5, currency: "USD" },
          { id: "veggie-taco", name: "Veggie Taco", description: "Grilled squash, black beans, cotija.", price: 3.75, currency: "USD" },
        ],
      },
      {
        category: "Sides",
        items: [
          { id: "guacamole", name: "Guacamole & Chips", description: "House-made, fresh lime.", price: 7, currency: "USD" },
          { id: "elote", name: "Elote", description: "Grilled corn, crema, cotija, chili powder.", price: 5, currency: "USD" },
        ],
      },
    ],
  },
  {
    id: "spice-route",
    name: "Spice Route",
    cuisine: "Indian",
    description: "Regional curries and tandoor classics.",
    rating: 4.5,
    menu: [
      {
        category: "Mains",
        items: [
          { id: "butter-chicken", name: "Butter Chicken", description: "Tomato-cream curry, tandoori chicken.", price: 15, currency: "USD" },
          { id: "saag-paneer", name: "Saag Paneer", description: "Spinach curry, house-made paneer.", price: 13, currency: "USD" },
          { id: "lamb-rogan-josh", name: "Lamb Rogan Josh", description: "Kashmiri red curry, slow-braised lamb.", price: 17, currency: "USD" },
        ],
      },
      {
        category: "Breads",
        items: [
          { id: "garlic-naan", name: "Garlic Naan", description: "Tandoor-baked, garlic, butter.", price: 4, currency: "USD" },
          { id: "roti", name: "Roti", description: "Whole wheat, tandoor-baked.", price: 3, currency: "USD" },
        ],
      },
    ],
  },
  {
    id: "le-petit-bistro",
    name: "Le Petit Bistro",
    cuisine: "French",
    description: "Classic bistro fare in a cozy setting.",
    rating: 4.7,
    menu: [
      {
        category: "Starters",
        items: [
          { id: "french-onion-soup", name: "French Onion Soup", description: "Caramelized onion, gruyère crouton.", price: 9.5, currency: "USD" },
          { id: "escargots", name: "Escargots de Bourgogne", description: "Snails, garlic herb butter.", price: 12, currency: "USD" },
        ],
      },
      {
        category: "Mains",
        items: [
          { id: "coq-au-vin", name: "Coq au Vin", description: "Braised chicken, red wine, mushrooms.", price: 21, currency: "USD" },
          { id: "steak-frites", name: "Steak Frites", description: "Grilled sirloin, herb butter, fries.", price: 24, currency: "USD" },
        ],
      },
    ],
  },
  {
    id: "golden-wok",
    name: "Golden Wok",
    cuisine: "Chinese",
    description: "Wok-fired classics and dim sum favorites.",
    rating: 4.3,
    menu: [
      {
        category: "Dim Sum",
        items: [
          { id: "pork-dumplings", name: "Pork Dumplings (6pc)", description: "Steamed, ginger-scallion dipping sauce.", price: 8, currency: "USD" },
          { id: "shrimp-shumai", name: "Shrimp Shumai (6pc)", description: "Steamed, topped with roe.", price: 8.5, currency: "USD" },
        ],
      },
      {
        category: "Mains",
        items: [
          { id: "kung-pao-chicken", name: "Kung Pao Chicken", description: "Peanuts, chili, scallion, wok-fired.", price: 14.5, currency: "USD" },
          { id: "mapo-tofu", name: "Mapo Tofu", description: "Silken tofu, chili bean sauce, minced pork.", price: 13, currency: "USD" },
          { id: "beef-chow-fun", name: "Beef Chow Fun", description: "Wide rice noodles, bean sprouts, soy.", price: 15, currency: "USD" },
        ],
      },
    ],
  },
];

export function listRestaurants(): Restaurant[] {
  return restaurants;
}

export function findRestaurant(id: string): Restaurant | undefined {
  return restaurants.find((restaurant) => restaurant.id === id);
}
