// Menu + quiz data. Edit this file to change dishes, prices, tables.
window.RESTAURANT = {
  name: "Tadka",
  tagline: "Indian · Dine-in",
  tables: [1, 2, 3, 4, 5, 6],
  pointsPerRupee: 0.1, // ₹10 = 1 point
};

window.CATEGORIES = ["Starters", "Mains", "Breads", "Drinks", "Desserts"];

// station: which kitchen display column the item goes to
window.MENU = [
  { id: "paneer-tikka", cat: "Starters", name: "Paneer Tikka", desc: "Char-grilled cottage cheese, mint chutney", price: 260, emoji: "🧀", veg: true, allergens: ["Dairy"], spice: 2, station: "Tandoor", prep: 12, sizes: true },
  { id: "chicken-65", cat: "Starters", name: "Chicken 65", desc: "Crispy spiced fried chicken", price: 290, emoji: "🍗", veg: false, allergens: ["Gluten"], spice: 3, station: "Tandoor", prep: 12, sizes: true },
  { id: "veg-samosa", cat: "Starters", name: "Samosa (2 pc)", desc: "Potato & pea stuffed pastry", price: 90, emoji: "🥟", veg: true, allergens: ["Gluten"], spice: 1, station: "Tandoor", prep: 6 },

  { id: "paneer-makhani", cat: "Mains", name: "Paneer Makhani", desc: "Cottage cheese in a rich tomato-butter gravy", price: 320, emoji: "🍛", veg: true, allergens: ["Dairy", "Nuts"], spice: 2, station: "Curry", prep: 14, sizes: true },
  { id: "dal-makhani", cat: "Mains", name: "Dal Makhani", desc: "Slow-cooked black lentils", price: 280, emoji: "🥘", veg: true, allergens: ["Dairy"], spice: 1, station: "Curry", prep: 10, sizes: true },
  { id: "veg-biryani", cat: "Mains", name: "Veg Biryani", desc: "Saffron rice, raita", price: 300, emoji: "🍚", veg: true, allergens: ["Dairy"], spice: 2, station: "Curry", prep: 16, sizes: true },
  { id: "butter-chicken", cat: "Mains", name: "Butter Chicken", desc: "Tandoori chicken in creamy makhani sauce", price: 380, emoji: "🍲", veg: false, allergens: ["Dairy", "Nuts"], spice: 2, station: "Curry", prep: 15, sizes: true },
  { id: "kadhai-paneer", cat: "Mains", name: "Kadhai Paneer", desc: "Paneer, capsicum, kadhai masala", price: 310, emoji: "🫑", veg: true, allergens: ["Dairy"], spice: 3, station: "Curry", prep: 13, sizes: true },

  { id: "garlic-naan", cat: "Breads", name: "Garlic Naan", desc: "From the tandoor, butter brushed", price: 70, emoji: "🫓", veg: true, allergens: ["Gluten", "Dairy"], spice: 0, station: "Tandoor", prep: 5 },
  { id: "tandoori-roti", cat: "Breads", name: "Tandoori Roti", desc: "Whole wheat", price: 40, emoji: "🫓", veg: true, allergens: ["Gluten"], spice: 0, station: "Tandoor", prep: 4 },
  { id: "laccha-paratha", cat: "Breads", name: "Laccha Paratha", desc: "Flaky layered bread", price: 80, emoji: "🥞", veg: true, allergens: ["Gluten", "Dairy"], spice: 0, station: "Tandoor", prep: 6 },

  { id: "mango-lassi", cat: "Drinks", name: "Mango Lassi", desc: "Chilled yogurt, alphonso mango", price: 120, emoji: "🥭", veg: true, allergens: ["Dairy"], spice: 0, station: "Drinks", prep: 3 },
  { id: "masala-chai", cat: "Drinks", name: "Masala Chai", desc: "Ginger, cardamom", price: 60, emoji: "☕", veg: true, allergens: ["Dairy"], spice: 0, station: "Drinks", prep: 4 },
  { id: "nimbu-soda", cat: "Drinks", name: "Nimbu Soda", desc: "Sweet or salted", price: 80, emoji: "🍋", veg: true, allergens: [], spice: 0, station: "Drinks", prep: 2 },

  { id: "gulab-jamun", cat: "Desserts", name: "Gulab Jamun", desc: "Two pieces, warm", price: 80, emoji: "🍡", veg: true, allergens: ["Dairy", "Gluten"], spice: 0, station: "Drinks", prep: 3 },
  { id: "rasmalai", cat: "Desserts", name: "Rasmalai", desc: "Saffron milk, pistachio", price: 120, emoji: "🍮", veg: true, allergens: ["Dairy", "Nuts"], spice: 0, station: "Drinks", prep: 3 },
];

// Half = 60% of full price (rounded to 10)
window.SIZE_FACTOR = { Half: 0.6, Full: 1 };

window.QUIZ = [
  { q: "Which state is famous for Rogan Josh?", a: ["Punjab", "Kashmir", "Kerala", "Goa"], c: 1 },
  { q: "Main ingredient of Dal Makhani?", a: ["Moong dal", "Chana dal", "Black urad dal", "Masoor dal"], c: 2 },
  { q: "Which spice gives biryani its golden colour?", a: ["Turmeric only", "Saffron", "Paprika", "Cumin"], c: 1 },
  { q: "Naan is traditionally cooked in a…", a: ["Tawa", "Kadhai", "Tandoor", "Pressure cooker"], c: 2 },
  { q: "Which chilli was once the world's hottest?", a: ["Bhut Jolokia", "Kashmiri", "Byadgi", "Guntur"], c: 0 },
  { q: "Lassi is made from…", a: ["Milk", "Yogurt", "Cream", "Paneer"], c: 1 },
  { q: "Garam masala usually does NOT contain…", a: ["Cardamom", "Cloves", "Cinnamon", "Oregano"], c: 3 },
  { q: "Gulab jamun is soaked in…", a: ["Honey", "Sugar syrup", "Milk", "Jaggery water"], c: 1 },
];

window.REWARDS = [
  { pts: 100, name: "Free Masala Chai" },
  { pts: 200, name: "Free Mango Lassi" },
  { pts: 400, name: "Free Dessert" },
];
