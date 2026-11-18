// Shared state logic, used by both the browser (app.js) and the server (server.js).
(function (root) {
  function emptyState() {
    return { orders: [], calls: [], tables: {}, reviews: [], seq: 1 };
  }

  function uid(state, p) {
    state.seq = (state.seq || 1) + 1;
    return p + state.seq.toString(36) + Date.now().toString(36).slice(-3);
  }

  function table(state, t) {
    t = String(t);
    if (!state.tables[t]) state.tables[t] = { billRequested: false, tip: 0, split: 1 };
    return state.tables[t];
  }

  // Pure-ish reducer: mutates and returns state.
  function reduce(state, action) {
    const p = action.payload || {};
    const now = Date.now();
    switch (action.type) {
      case "placeOrder": {
        if (!p.items || !p.items.length) break;
        const eta = Math.max.apply(null, p.items.map((i) => i.prep || 5));
        state.orders.push({
          id: uid(state, "o"),
          table: String(p.table),
          items: p.items,
          note: p.note || "",
          status: "new",
          eta,
          createdAt: now,
        });
        const tb = table(state, p.table);
        tb.billRequested = false;
        break;
      }
      case "sendToKitchen": {
        const o = state.orders.find((x) => x.id === p.id);
        if (o && o.status === "new") { o.status = "cooking"; o.sentAt = now; }
        break;
      }
      case "markReady": {
        const o = state.orders.find((x) => x.id === p.id);
        if (o && o.status === "cooking") {
          o.status = "ready"; o.readyAt = now;
          o.items.forEach((i) => { i.done = true; });
        }
        break;
      }
      case "stationReady": {
        // Kitchen marks one station's part of an order (e.g. Tandoor) as done.
        const o = state.orders.find((x) => x.id === p.id);
        if (!o || o.status !== "cooking") break;
        o.items.forEach((i) => { if (i.station === p.station) i.done = true; });
        if (o.items.every((i) => i.done)) { o.status = "ready"; o.readyAt = now; }
        break;
      }
      case "markServed": {
        const o = state.orders.find((x) => x.id === p.id);
        if (o) { o.status = "served"; o.servedAt = now; }
        break;
      }
      case "cancelOrder": {
        const o = state.orders.find((x) => x.id === p.id);
        if (o && o.status === "new") o.status = "cancelled";
        break;
      }
      case "call": {
        const open = state.calls.find((c) => !c.done && c.table === String(p.table) && c.type === p.type);
        if (!open) state.calls.push({ id: uid(state, "c"), table: String(p.table), type: p.type || "Waiter", at: now, done: false });
        break;
      }
      case "resolveCall": {
        const c = state.calls.find((x) => x.id === p.id);
        if (c) { c.done = true; c.doneAt = now; }
        break;
      }
      case "requestBill": {
        const tb = table(state, p.table);
        tb.billRequested = true;
        tb.tip = p.tip || 0;
        tb.split = p.split || 1;
        tb.billAt = now;
        break;
      }
      case "closeTable": {
        // Staff marks the table as settled (payment handled outside the app).
        const t = String(p.table);
        state.orders.forEach((o) => {
          if (o.table === t && !o.closed) { o.closed = true; o.closedAt = now; o.tipPct = table(state, t).tip; }
        });
        state.calls.forEach((c) => { if (c.table === t) c.done = true; });
        state.tables[t] = { billRequested: false, tip: 0, split: 1 };
        break;
      }
      case "review": {
        state.reviews.push({ table: String(p.table), stars: p.stars, text: p.text || "", at: now });
        break;
      }
      case "reset":
        return emptyState();
    }
    return state;
  }

  function orderTotal(o) {
    return o.items.reduce((s, i) => s + i.price * i.qty, 0);
  }

  function tableOrders(state, t) {
    return state.orders.filter((o) => o.table === String(t) && !o.closed && o.status !== "cancelled");
  }

  function tableStatus(state, t) {
    t = String(t);
    if (state.calls.some((c) => c.table === t && !c.done)) return "help";
    const tb = state.tables[t];
    if (tb && tb.billRequested) return "bill";
    const os = tableOrders(state, t);
    if (!os.length) return "free";
    if (os.some((o) => o.status === "new")) return "ordering";
    if (os.some((o) => o.status === "cooking")) return "cooking";
    return "eating";
  }

  const api = { emptyState, reduce, orderTotal, tableOrders, tableStatus };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StoreCore = api;
})(this);
