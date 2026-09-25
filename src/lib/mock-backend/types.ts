export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
}

export interface MenuCategory {
  category: string;
  items: MenuItem[];
}

export interface RestaurantSummary {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  rating: number;
}

export interface Restaurant extends RestaurantSummary {
  menu: MenuCategory[];
}
