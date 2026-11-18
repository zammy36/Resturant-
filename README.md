# Tadka — QR Table Ordering (no online payment)

Har table par apni website. Customer table ka QR scan karta hai → menu dekhta hai → order karta hai.
Staff aur kitchen ko sab live dikhta hai. **Payment app mein nahi hai** — bill counter / waiter pe settle hota hai.

## Features
| Customer (phone) | Staff (tablet) | Kitchen (screen) |
|---|---|---|
| Menu: search, categories, veg filter | New orders → **Send to kitchen** (sound alert) | Tickets by station (Tandoor / Curry / Drinks) |
| Dish detail: allergens, spice level, Half/Full size, special request | Floor map: Free / Ordering / Waiting / Eating / Bill / Help | Live timers (green → yellow → red when late) |
| Cart → place order, **reward points** | Waiter calls with "Done" | **Done ✓** per station; order auto-ready when all done |
| Live status: Ordered → Cooking (countdown) → Ready → Served | Bills: GST, tip, split, print, **Mark paid & free table** | |
| Spice Quiz (2 players) while waiting | Overview: tables, orders, sales, top dishes, reviews | |
| Call waiter / water / napkins / cutlery | | |
| Bill: GST 5%, tip, split 1–4 ways, **Request bill**, review ⭐ | | |

## Chalana kaise hai
Node.js (v18+) chahiye. Koi `npm install` nahi.

```bash
node server.js
```
Ye 2 link print karega. Counter PC pe **Same Wi-Fi** wala link kholo:
- `/` → table QR codes (🖨️ Print karke tables pe lagao)
- `/#/staff` → staff tablet
- `/#/kitchen` → kitchen display
- `/#/t/5` → table 5 ka customer menu

Customers ka phone restaurant ke Wi-Fi pe hona chahiye (server same network pe hai).
Data `state.json` mein save hota hai, server restart pe bhi rehta hai.

> Server ke bina (`index.html` direct khol ke) bhi demo chalta hai, lekin sync sirf usi browser ke tabs mein hoga.

## Customize
- Menu, prices, tables, quiz questions, rewards: **`data.js`**
- Restaurant name: `data.js` → `RESTAURANT.name`
- Colours: `styles.css` ke top pe `:root` variables
