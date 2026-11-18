/* Tadka — QR table ordering (no online payment).
 * Views:  #/            landing + table QR codes
 *         #/t/<n>       customer app for table n
 *         #/staff       staff tablet (orders, floor, calls, bills, overview)
 *         #/kitchen     kitchen display
 */
(function () {
  const R = window.RESTAURANT;
  const MENU = window.MENU;
  const byId = Object.fromEntries(MENU.map((d) => [d.id, d]));
  const $app = document.getElementById("app");
  const STATIONS = [...new Set(MENU.map((d) => d.station))];
  const GST = 0.05;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rs = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const sizePrice = (d, size) => (size === "Half" ? Math.round((d.price * window.SIZE_FACTOR.Half) / 10) * 10 : d.price);
  const mmss = (sec) => { sec = Math.max(0, Math.floor(sec)); return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0"); };
  const ago = (t) => { const s = Math.floor((Date.now() - t) / 1000); return s < 60 ? s + "s ago" : Math.floor(s / 60) + "m ago"; };
  const spiceTxt = (n) => (n ? '<span class="chilli">' + "🌶️".repeat(n) + "</span> " + ["", "Mild", "Medium", "Hot"][n] : "None");
  const vegMark = (d) => `<span class="vegmark ${d.veg ? "" : "nv"}" title="${d.veg ? "Veg" : "Non-veg"}"></span>`;
  const statusLabel = { new: "Ordered", cooking: "Cooking", ready: "Ready", served: "Served", cancelled: "Cancelled" };
  const tableLabel = { free: "Free", ordering: "Ordering", cooking: "Waiting", eating: "Eating", bill: "Bill", help: "Help" };
  const AV_COLORS = ["#f2552c", "#4c7cf0", "#3ecf8e", "#a35cf0"];

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2400);
  }

  let audioCtx;
  function beep(freq = 880, times = 2) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime + i * 0.22;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.start(t0); o.stop(t0 + 0.2);
      }
    } catch (_) {}
  }

  // ---------- per-device storage ----------
  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (_) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  const me = lsGet("tadka.me", { points: 0, carts: {}, reviewed: {} });
  const saveMe = () => lsSet("tadka.me", me);

  // ---------- shared store (server if available, else this browser only) ----------
  const Store = {
    mode: "local",
    state: StoreCore.emptyState(),
    async init() {
      try {
        if (location.protocol.startsWith("http")) {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 2500);
          const r = await fetch("api/state", { cache: "no-store", signal: ctrl.signal });
          if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
            this.state = await r.json();
            this.mode = "server";
            const es = new EventSource("api/events");
            es.onmessage = (e) => { const prev = this.state; this.state = JSON.parse(e.data); onRemoteChange(prev); };
            return;
          }
        }
      } catch (_) {}
      this.state = lsGet("tadka.state", StoreCore.emptyState());
      window.addEventListener("storage", (e) => {
        if (e.key === "tadka.state") { const prev = this.state; this.state = lsGet("tadka.state", StoreCore.emptyState()); onRemoteChange(prev); }
      });
    },
    dispatch(type, payload) {
      const action = { type, payload };
      this.state = StoreCore.reduce(JSON.parse(JSON.stringify(this.state)), action);
      if (this.mode === "server") {
        fetch("api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) })
          .catch(() => toast("Connection problem — retrying…"));
      } else {
        lsSet("tadka.state", this.state);
      }
      render();
    },
  };
  const S = () => Store.state;

  function onRemoteChange(prev) {
    // Sound alerts for staff / kitchen screens.
    const r = route();
    const cnt = (st, f) => st.orders.filter(f).length;
    if (r.view === "staff") {
      const newO = cnt(S(), (o) => o.status === "new") > cnt(prev, (o) => o.status === "new");
      const newC = S().calls.filter((c) => !c.done).length > prev.calls.filter((c) => !c.done).length;
      if (newO || newC) beep(newC ? 660 : 880, newC ? 3 : 2);
      if (newC) toast("🔔 A table needs help");
      else if (newO) toast("🧾 New order received");
    }
    if (r.view === "kitchen" && cnt(S(), (o) => o.status === "cooking" && !o.items.some((i) => i.done)) > cnt(prev, (o) => o.status === "cooking" && !o.items.some((i) => i.done))) beep(990, 2);
    if (r.view === "table") {
      const mine = (st) => st.orders.filter((o) => o.table === r.table && o.status === "ready").length;
      if (mine(S()) > mine(prev)) { toast("🍽️ Your food is ready!"); if (navigator.vibrate) navigator.vibrate(200); }
      const myCalls = (st) => st.calls.filter((c) => c.table === r.table && !c.done).length;
      if (myCalls(S()) < myCalls(prev)) toast("👋 Waiter has seen your request");
    }
    render();
  }

  // ---------- routing ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const m = h.match(/^t\/(\w+)/);
    if (m) return { view: "table", table: m[1] };
    if (h.startsWith("staff")) return { view: "staff" };
    if (h.startsWith("kitchen")) return { view: "kitchen" };
    return { view: "landing" };
  }

  // UI-only state (not shared)
  const ui = {
    tab: "menu", cat: "All", q: "", vegOnly: false, sheet: null,
    tip: 10, split: 1, stars: 0, reviewText: "",
    quiz: null, staffTab: "orders", selTable: null,
  };

  // ---------- bill ----------
  function billFor(t) {
    const orders = StoreCore.tableOrders(S(), t);
    const map = {};
    orders.forEach((o) => o.items.forEach((i) => {
      const k = i.name + (i.size && i.size !== "Full" ? " (" + i.size + ")" : "");
      map[k] = map[k] || { name: k, qty: 0, amt: 0 };
      map[k].qty += i.qty; map[k].amt += i.qty * i.price;
    }));
    const lines = Object.values(map);
    const subtotal = lines.reduce((s, l) => s + l.amt, 0);
    const tb = S().tables[t] || {};
    const tipPct = tb.billRequested ? tb.tip : ui.tip;
    const split = tb.billRequested ? tb.split : ui.split;
    const gst = subtotal * GST, tip = (subtotal * tipPct) / 100;
    return { orders, lines, subtotal, gst, tip, tipPct, split, total: subtotal + gst + tip, requested: !!tb.billRequested };
  }

  // =====================================================================
  //  LANDING
  // =====================================================================
  function tableUrl(t) {
    return location.origin + location.pathname + "#/t/" + t;
  }
  function renderLanding() {
    document.body.className = "";
    const local = Store.mode === "local";
    return `
    <div class="landing">
      <div class="brand"><img class="brand-logo" src="icon.svg" alt=""><div><h1>${esc(R.name)}</h1><div class="eyebrow">${esc(R.tagline)}</div></div></div>
      <div class="hero">
        <h2>Har table par <span class="accent">apni website.</span></h2>
        <p>Customers scan the table QR, browse the menu, order, call the waiter, play while they wait and see their bill — staff and kitchen see everything live. No online payment: bill is settled at the counter.</p>
      </div>
      <div class="role-grid">
        <a class="role" href="#/t/${R.tables[0]}" style="text-decoration:none;color:inherit"><div class="ic">📱</div><h3>Customer demo</h3><p>Open the table ${R.tables[0]} menu as a guest would see it.</p></a>
        <a class="role" href="#/staff" style="text-decoration:none;color:inherit"><div class="ic">🧑‍🍳</div><h3>Staff tablet</h3><p>New orders, floor map, waiter calls, bills and the live overview.</p></a>
        <a class="role" href="#/kitchen" style="text-decoration:none;color:inherit"><div class="ic">🔥</div><h3>Kitchen display</h3><p>Live tickets by station with prep timers.</p></a>
      </div>
      <div class="print-area">
        <div class="section-title"><h3>Table QR codes</h3><button class="btn sm ghost" data-act="print">🖨️ Print QR codes</button></div>
        <div class="qr-grid">
          ${R.tables.map((t) => `
            <div class="qr-card">
              <div class="eyebrow" style="color:#8a7f78">Scan to order</div>
              <div class="qr" id="qr-${t}"></div>
              <b>Table ${t}</b>
              <a href="#/t/${t}">Open table ${t} →</a>
            </div>`).join("")}
        </div>
      </div>
      <p class="note">
        ${local
          ? `⚠️ Running without the server — data only syncs between tabs of <b>this</b> browser. For phones + kitchen + staff on different devices, run <code>node server.js</code> on the counter PC and open the link it prints.`
          : `✅ Live sync on. Every phone on the same Wi-Fi that scans a QR code will reach this server.`}
      </p>
    </div>`;
  }
  function afterLanding() {
    R.tables.forEach((t) => {
      const el = document.getElementById("qr-" + t);
      if (!el) return;
      if (window.qrcode) {
        const q = qrcode(0, "M"); q.addData(tableUrl(t)); q.make();
        el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      } else el.innerHTML = `<div class="fallback">${esc(tableUrl(t))}</div>`;
    });
  }

  // =====================================================================
  //  CUSTOMER
  // =====================================================================
  function cart(t) { me.carts[t] = me.carts[t] || []; return me.carts[t]; }
  const cartCount = (t) => cart(t).reduce((s, i) => s + i.qty, 0);
  const cartTotal = (t) => cart(t).reduce((s, i) => s + i.qty * i.price, 0);

  function renderCustomer(t) {
    document.body.className = "cust-body";
    if (!R.tables.map(String).includes(String(t))) {
      return `<div class="cust"><div class="empty"><div class="big">🤔</div><p>Table ${esc(t)} not found.</p></div></div>`;
    }
    const orders = StoreCore.tableOrders(S(), t);
    const openCall = S().calls.some((c) => c.table === String(t) && !c.done);
    const tabs = [
      ["menu", "📖", "Menu"],
      ["orders", "⏱️", "Status", orders.some((o) => o.status !== "served")],
      ["play", "🎲", "Play"],
      ["call", "🔔", "Call", openCall],
      ["bill", "🧾", "Bill"],
    ];
    let body = "";
    if (ui.tab === "menu") body = custMenu(t);
    else if (ui.tab === "orders") body = custOrders(t);
    else if (ui.tab === "play") body = custPlay();
    else if (ui.tab === "call") body = custCall(t);
    else if (ui.tab === "bill") body = custBill(t);

    const n = cartCount(t);
    return `
    <div class="cust">
      <div class="c-head">
        <div class="c-head-row">
          <div><div class="c-brand">${esc(R.name)}<span>.</span></div><div class="c-sub">${esc(R.tagline)}</div></div>
          <div class="table-badge">TABLE ${esc(t)}</div>
        </div>
        ${ui.tab === "menu" ? menuControls() : ""}
      </div>
      <div id="c-body">${body}</div>
      ${n && ui.tab === "menu" ? `
        <button class="cart-bar" data-act="openCart">
          <div style="text-align:left"><b>${n} item${n > 1 ? "s" : ""} · ${rs(cartTotal(t))}</b><small>Review & place order</small></div>
          <span class="btn sm">View cart →</span>
        </button>` : ""}
      <nav class="tabbar">
        ${tabs.map(([k, i, l, dot]) => `<button class="tab ${ui.tab === k ? "on" : ""}" data-act="tab" data-v="${k}"><span class="ti">${i}</span>${l}${dot ? '<span class="dot"></span>' : ""}</button>`).join("")}
      </nav>
      ${ui.sheet ? renderSheet(t) : ""}
    </div>`;
  }

  function menuControls() {
    return `
      <input class="search" id="search" placeholder="Search dishes…" value="${esc(ui.q)}" autocomplete="off">
      <div class="chips">
        ${["All", ...window.CATEGORIES].map((c) => `<button class="chip ${ui.cat === c ? "on" : ""}" data-act="cat" data-v="${c}">${c}</button>`).join("")}
        <button class="chip ${ui.vegOnly ? "on" : ""}" data-act="veg">🟢 Veg only</button>
      </div>`;
  }

  function custMenu(t) {
    return `<div class="dish-list" id="dish-list">${dishListHtml(t)}</div>`;
  }
  function dishListHtml(t) {
    const q = ui.q.trim().toLowerCase();
    const inCart = {};
    cart(t).forEach((i) => (inCart[i.dishId] = (inCart[i.dishId] || 0) + i.qty));
    const items = MENU.filter((d) =>
      (ui.cat === "All" || d.cat === ui.cat) && (!ui.vegOnly || d.veg) &&
      (!q || d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)));
    if (!items.length) return `<div class="empty"><div class="big">🍽️</div>No dishes match.</div>`;
    let html = "", last = "";
    items.forEach((d) => {
      if (d.cat !== last && ui.cat === "All") { html += `<div class="cat-title">${d.cat}</div>`; last = d.cat; }
      html += `
        <button class="dish" data-act="dish" data-id="${d.id}">
          <div class="dish-emoji">${d.emoji}</div>
          <div class="dish-info">
            <div class="dish-name">${vegMark(d)} ${esc(d.name)}</div>
            <div class="dish-desc">${esc(d.desc)}</div>
            <div class="dish-price">${rs(d.price)} ${d.spice ? `<span class="chilli" style="font-size:11px">${"🌶️".repeat(d.spice)}</span>` : ""}</div>
          </div>
          ${inCart[d.id] ? `<span class="qty-mini">×${inCart[d.id]}</span>` : ""}
          <span class="add-btn">+</span>
        </button>`;
    });
    return html;
  }

  function renderSheet(t) {
    const s = ui.sheet;
    let inner = "";
    if (s.type === "dish") {
      const d = byId[s.id];
      const price = sizePrice(d, s.size);
      inner = `
        <div class="sheet-hero">
          <div class="big-emoji">${d.emoji}</div>
          <h2>${esc(d.name)}</h2>
          <div class="price">${rs(price)}</div>
          <p>${esc(d.desc)}</p>
        </div>
        <div class="spec"><span class="eyebrow">Type</span><span>${vegMark(d)} ${d.veg ? "Vegetarian" : "Non-vegetarian"}</span></div>
        <div class="spec"><span class="eyebrow">Allergens</span><span>${d.allergens.length ? d.allergens.map((a) => `<span class="allergen">${a === "Dairy" ? "🥛" : a === "Nuts" ? "🥜" : "🌾"} ${a}</span>`).join("") : "None"}</span></div>
        <div class="spec"><span class="eyebrow">Spice level</span><span>${spiceTxt(d.spice)}</span></div>
        ${d.sizes ? `<div class="spec"><span class="eyebrow">Size</span>
          <span class="seg">${["Half", "Full"].map((z) => `<button class="${s.size === z ? "on" : ""}" data-act="size" data-v="${z}">${z}</button>`).join("")}</span></div>` : ""}
        <div class="spec"><span class="eyebrow">Quantity</span>
          <span class="stepper"><button data-act="sq" data-v="-1">−</button><span>${s.qty}</span><button data-act="sq" data-v="1">+</button></span></div>
        <div class="spec" style="display:block"><div class="eyebrow" style="margin-bottom:8px">Special request</div>
          <input class="field" id="dish-note" placeholder="e.g. less oil, no onion" value="${esc(s.note)}" maxlength="120"></div>
        <button class="btn block" data-act="addToCart" style="margin-top:10px">Add to order · ${rs(price * s.qty)}</button>`;
    } else if (s.type === "cart") {
      const c = cart(t);
      inner = `
        <h2 class="c-title" style="font-size:24px;margin-bottom:6px">Your order</h2>
        <div class="muted" style="font-size:13px">Table ${esc(t)} · goes to staff for confirmation</div>
        ${c.length ? c.map((i, idx) => `
          <div class="cart-line">
            <div class="dish-emoji" style="width:42px;height:42px;font-size:22px">${byId[i.dishId].emoji}</div>
            <div class="nm"><b>${esc(i.name)}</b><small>${i.size && byId[i.dishId].sizes ? i.size + " · " : ""}${rs(i.price)}${i.note ? " · " + esc(i.note) : ""}</small></div>
            <span class="stepper"><button data-act="cq" data-i="${idx}" data-v="-1">−</button><span>${i.qty}</span><button data-act="cq" data-i="${idx}" data-v="1">+</button></span>
          </div>`).join("") : `<div class="empty">Cart is empty</div>`}
        ${c.length ? `
          <div class="bill-total" style="border-top:0"><span class="muted">Subtotal</span><b style="font-size:22px">${rs(cartTotal(t))}</b></div>
          <div class="muted" style="font-size:12px;margin:4px 0 12px">You'll earn <b class="accent">${Math.floor(cartTotal(t) * R.pointsPerRupee)} points</b> with this order 🎁</div>
          <button class="btn block" data-act="placeOrder">Place order · ${rs(cartTotal(t))}</button>` : ""}`;
    }
    return `<div class="sheet-bg" data-act="closeSheet"><div class="sheet" data-stop><div class="grab"></div>${inner}</div></div>`;
  }

  function custOrders(t) {
    const orders = StoreCore.tableOrders(S(), t).slice().reverse();
    if (!orders.length) {
      return `<div class="c-page"><div class="empty"><div class="big">🧾</div><p>No orders yet.</p><br><button class="btn" data-act="tab" data-v="menu">Browse menu</button></div>${pointsCard()}</div>`;
    }
    const active = orders.filter((o) => o.status !== "served");
    const any = (st) => active.some((o) => o.status === st);
    let title, phase;
    if (any("cooking")) { title = `Your food is <span>cooking</span>`; phase = 1; }
    else if (any("new")) { title = `Order <span>received</span>`; phase = 0; }
    else if (any("ready")) { title = `Your food is <span>ready!</span>`; phase = 2; }
    else { title = `Enjoy your <span>meal</span> 😋`; phase = 3; }

    const cooking = active.filter((o) => o.status === "cooking").sort((a, b) => a.sentAt - b.sentAt)[0];
    let ring = "";
    const C = 2 * Math.PI * 88;
    if (cooking) {
      ring = `
        <div class="ring-wrap"><div class="ring">
          <svg width="200" height="200"><circle cx="100" cy="100" r="88" stroke="#ece4da" stroke-width="10" fill="none"/>
          <circle id="eta-ring" cx="100" cy="100" r="88" stroke="var(--accent)" stroke-width="10" fill="none" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="0" data-eta-ring="${cooking.sentAt}|${cooking.eta}|${C}"/></svg>
          <div class="center"><div><b data-eta="${cooking.sentAt}|${cooking.eta}">--:--</b><small>MIN LEFT</small></div></div>
        </div></div>`;
    } else if (phase === 0) {
      ring = `<div class="ring-wrap"><div class="ring"><svg width="200" height="200"><circle cx="100" cy="100" r="88" stroke="#ece4da" stroke-width="10" fill="none"/></svg>
        <div class="center"><div><b style="font-size:46px">🧾</b><small style="margin-top:6px">WAITING FOR STAFF</small></div></div></div></div>`;
    } else if (phase === 2) {
      ring = `<div class="ring-wrap"><div class="ring"><svg width="200" height="200"><circle cx="100" cy="100" r="88" stroke="var(--green)" stroke-width="10" fill="none"/></svg>
        <div class="center"><div><b style="font-size:52px">🍽️</b><small style="margin-top:6px">ON ITS WAY</small></div></div></div></div>`;
    }
    const steps = ["Ordered", "Cooking", "Ready", "Served"];
    return `
      <div class="c-page stack">
        <div class="eyebrow" style="color:var(--c-muted)">Table ${esc(t)} · Order status</div>
        <h1 class="c-title">${title}</h1>
        ${ring}
        ${phase < 3 ? `<div class="steps">${steps.map((s, i) => `<span class="${i < phase ? "done" : i === phase ? "cur" : ""}">● ${s}</span>`).join("")}</div>` : ""}
        ${orders.map((o) => `
          <div class="card order-card">
            <div class="row" style="margin-bottom:6px"><b>Order #${o.id.slice(-4).toUpperCase()}</b><span class="status-tag st-${o.status}">${statusLabel[o.status]}</span></div>
            ${o.items.map((i) => `<div class="row"><span>${i.qty} × ${esc(i.name)}${i.size && byId[i.dishId]?.sizes ? " <span class='muted'>(" + i.size + ")</span>" : ""}</span><span>${rs(i.qty * i.price)}</span></div>`).join("")}
          </div>`).join("")}
        <button class="btn ghost block" style="background:#fff;color:var(--c-text);border-color:var(--c-line)" data-act="tab" data-v="menu">+ Order more</button>
        ${pointsCard()}
        <button class="card" data-act="tab" data-v="play" style="text-align:left;width:100%">
          <b>🎲 Bored while waiting?</b><div class="muted" style="font-size:13px;margin-top:4px">Play the Spice Quiz with your table →</div>
        </button>
      </div>`;
  }

  function pointsCard() {
    const p = me.points;
    const next = window.REWARDS.find((r) => r.pts > p) || window.REWARDS[window.REWARDS.length - 1];
    const pct = Math.min(1, p / next.pts);
    return `
      <div class="points-card" style="margin-top:12px">
        <div class="points-ring" style="background:conic-gradient(var(--accent) ${pct * 360}deg, #3a2e2a 0)">
          <div style="width:76px;height:76px;border-radius:50%;background:#1d1613;display:grid;place-items:center;text-align:center">
            <div><b>${p}</b><div style="font-size:8px;letter-spacing:.14em;color:#bfb3ad">POINTS</div></div>
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="eyebrow" style="color:#bfb3ad">${esc(R.name)} rewards</div>
          <b style="font-size:17px">Every meal earns <span class="accent">points</span></b>
          ${window.REWARDS.map((r) => `<div class="reward ${p >= r.pts ? "unlocked" : ""}">${p >= r.pts ? "✅" : "🔒"} ${esc(r.name)} <span style="margin-left:auto;font-family:var(--mono);font-size:11px">${r.pts} pts</span></div>`).join("")}
          ${p >= window.REWARDS[0].pts ? `<div style="font-size:11px;color:#bfb3ad;margin-top:6px">Show this screen to your waiter to redeem.</div>` : ""}
        </div>
      </div>`;
  }

  function custPlay() {
    const Q = ui.quiz;
    if (!Q || !Q.started) {
      const names = (Q && Q.players) || ["", ""];
      return `
        <div class="c-page stack">
          <div class="eyebrow" style="color:var(--c-muted)">While you wait</div>
          <h1 class="c-title">Spice <span>Quiz</span> 🌶️</h1>
          <p class="muted">Pass the phone around the table. One question per turn — most correct answers wins!</p>
          <div class="card stack">
            <label class="eyebrow" style="color:var(--c-muted)">Player 1</label>
            <input class="field" data-pname="0" placeholder="Name" value="${esc(names[0])}" maxlength="14">
            <label class="eyebrow" style="color:var(--c-muted)">Player 2</label>
            <input class="field" data-pname="1" placeholder="Name" value="${esc(names[1])}" maxlength="14">
          </div>
          <button class="btn block" data-act="quizStart">Start quiz</button>
        </div>`;
    }
    const done = Q.idx >= Q.order.length;
    const board = `
      <div class="scoreboard">
        ${Q.players.map((p, i) => `<div class="score ${!done && Q.turn === i ? "turn" : ""}"><span class="avatar" style="background:${AV_COLORS[i]}">${esc(p[0] || "?").toUpperCase()}</span><div style="font-size:13px;margin-top:4px">${esc(p)}</div><b>${Q.scores[i]}</b></div>`).join("")}
      </div>`;
    if (done) {
      const [a, b] = Q.scores;
      const msg = a === b ? "It's a tie! 🤝" : `${esc(Q.players[a > b ? 0 : 1])} wins! 🏆`;
      return `<div class="c-page stack"><h1 class="c-title">${msg}</h1>${board}<button class="btn block" data-act="quizStart">Play again</button><button class="btn ghost block" style="background:#fff;color:var(--c-text);border-color:var(--c-line)" data-act="quizReset">Change players</button></div>`;
    }
    const q = window.QUIZ[Q.order[Q.idx]];
    return `
      <div class="c-page stack">
        <div class="eyebrow" style="color:var(--c-muted)">Round ${Q.idx + 1} of ${Q.order.length}</div>
        ${board}
        <div class="card"><div class="eyebrow" style="color:var(--accent);margin-bottom:6px">${esc(Q.players[Q.turn])}'s turn</div><b style="font-size:18px">${esc(q.q)}</b></div>
        ${q.a.map((opt, i) => {
          let cls = "";
          if (Q.picked != null) { if (i === q.c) cls = "right"; else if (i === Q.picked) cls = "wrong"; }
          return `<button class="quiz-opt ${cls}" data-act="quizPick" data-v="${i}" ${Q.picked != null ? "disabled" : ""}>${esc(opt)}</button>`;
        }).join("")}
        ${Q.picked != null ? `<button class="btn block" data-act="quizNext">${Q.idx + 1 >= Q.order.length ? "See result" : "Next →"}</button>` : ""}
      </div>`;
  }

  function custCall(t) {
    const calls = S().calls.filter((c) => c.table === String(t) && !c.done);
    const waiter = calls.find((c) => c.type === "Waiter");
    const quick = ["Water", "Napkins", "Cutlery", "Extra plate"];
    return `
      <div class="c-page" style="text-align:center">
        <div class="eyebrow" style="color:var(--c-muted);text-align:left">Table ${esc(t)}</div>
        <h1 class="c-title" style="text-align:left">Need <span>something?</span></h1>
        <button class="call-btn ${waiter ? "pulse" : ""}" data-act="call" data-v="Waiter">
          <div><span class="bell">🛎️</span>${waiter ? "Waiter coming…" : "Call waiter"}</div>
        </button>
        <div class="quick">
          ${quick.map((q) => `<button class="${calls.some((c) => c.type === q) ? "sent" : ""}" data-act="call" data-v="${q}">${calls.some((c) => c.type === q) ? "✓ " : ""}${q}</button>`).join("")}
          <button data-act="tab" data-v="bill">🧾 Bill</button>
        </div>
        ${calls.length ? `<div class="card" style="margin-top:20px;text-align:left">
          <div class="eyebrow" style="color:var(--c-muted);margin-bottom:6px">Sent to staff</div>
          ${calls.map((c) => `<div class="bill-row"><span>🔔 ${esc(c.type)}</span><span class="muted" data-ago="${c.at}">${ago(c.at)}</span></div>`).join("")}
        </div>` : `<p class="muted" style="margin-top:20px;font-size:13px">One tap — staff gets notified instantly.</p>`}
      </div>`;
  }

  function custBill(t) {
    const b = billFor(t);
    const reviewed = me.reviewed[t] && me.reviewed[t] > (b.orders[0]?.createdAt || 0);
    if (!b.lines.length) {
      return `<div class="c-page"><div class="empty"><div class="big">🧾</div><p>Your bill will appear here once you order.</p></div></div>`;
    }
    const people = Array.from({ length: b.split }, (_, i) => i);
    const per = b.total / b.split;
    return `
      <div class="c-page stack">
        <div class="eyebrow" style="color:var(--c-muted)">Table ${esc(t)}</div>
        <h1 class="c-title">Your <span>bill</span></h1>
        <div class="card">
          ${b.lines.map((l) => `<div class="bill-row"><span>${l.qty} × ${esc(l.name)}</span><span>${rs(l.amt)}</span></div>`).join("")}
          <div class="bill-row" style="border-top:1px solid var(--c-line);margin-top:6px;padding-top:10px"><span class="muted">Subtotal</span><span>${rs(b.subtotal)}</span></div>
          <div class="bill-row"><span class="muted">GST (5%)</span><span>${rs(b.gst)}</span></div>
          ${b.tip ? `<div class="bill-row"><span class="muted">Tip (${b.tipPct}%)</span><span>${rs(b.tip)}</span></div>` : ""}
          <div class="bill-total"><span class="muted">Total</span><b>${rs(b.total)}</b></div>
        </div>
        ${b.requested ? "" : `
        <div class="card">
          <div class="spec" style="border:0;padding-top:0"><span class="eyebrow">Split</span>
            <span class="seg">${[1, 2, 3, 4].map((n) => `<button class="${ui.split === n ? "on" : ""}" data-act="split" data-v="${n}">${n === 1 ? "1" : n + " ways"}</button>`).join("")}</span></div>
          <div class="spec" style="padding-bottom:0"><span class="eyebrow">Add tip</span>
            <span class="seg">${[0, 5, 10, 15].map((n) => `<button class="${ui.tip === n ? "on" : ""}" data-act="tip" data-v="${n}">${n ? n + "%" : "No"}</button>`).join("")}</span></div>
        </div>`}
        ${b.split > 1 ? `<div class="split-grid">${people.map((i) => `<div class="split-person"><span class="avatar" style="background:${AV_COLORS[i]}">${i + 1}</span><div style="font-weight:800;font-size:18px;margin-top:6px">${rs(per)}</div></div>`).join("")}</div>` : ""}
        ${b.requested
          ? `<div class="card" style="background:#1d1613;color:#fff;border:0;text-align:center">
               <div style="font-size:34px">✅</div><b style="font-size:18px">Bill requested</b>
               <p style="color:#bfb3ad;margin-top:6px;font-size:14px">Your waiter is bringing the bill. Please pay at the counter or to your waiter.</p>
             </div>`
          : `<button class="btn block" data-act="requestBill">Request bill · ${rs(b.total)}</button>
             <p class="muted" style="text-align:center;font-size:12px">Payment is collected at the counter / by your waiter.</p>`}
        ${reviewed ? `<div class="card" style="text-align:center"><b>Thanks for your review! 💛</b></div>` : reviewBlock(t)}
      </div>`;
  }

  function reviewBlock() {
    return `
      <div class="card" style="text-align:center">
        <div class="eyebrow" style="color:var(--c-muted)">Review</div>
        <h2 style="font-size:22px;font-weight:800;margin-top:4px">How was your <span class="accent">meal?</span></h2>
        <div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button class="${ui.stars >= n ? "on" : ""}" data-act="star" data-v="${n}" aria-label="${n} stars">★</button>`).join("")}</div>
        <textarea class="field" id="review-text" rows="3" placeholder="Tell us more (optional)" maxlength="300">${esc(ui.reviewText)}</textarea>
        <button class="btn block" style="margin-top:12px" data-act="review" ${ui.stars ? "" : "disabled"}>Submit review</button>
      </div>`;
  }

  // =====================================================================
  //  STAFF
  // =====================================================================
  function renderStaff() {
    document.body.className = "";
    const st = S();
    const openCalls = st.calls.filter((c) => !c.done);
    const newOrders = st.orders.filter((o) => o.status === "new");
    const bills = R.tables.filter((t) => st.tables[t]?.billRequested);
    const tabs = [
      ["orders", "Orders", newOrders.length],
      ["floor", "Floor", 0],
      ["calls", "Calls", openCalls.length],
      ["bills", "Bills", bills.length],
      ["overview", "Overview", 0],
    ];
    let body = "";
    if (ui.staffTab === "orders") body = staffOrders();
    else if (ui.staffTab === "floor") body = staffFloor();
    else if (ui.staffTab === "calls") body = staffCalls();
    else if (ui.staffTab === "bills") body = staffBills();
    else body = staffOverview();
    return `
      <div class="dash">
        <div class="dash-head">
          <div class="left"><a class="link-back" href="#/">←</a><img src="icon.svg" width="34" height="34" alt=""><div><h1>${esc(R.name)} <span class="muted" style="font-weight:500;font-size:14px">Staff</span></h1></div>
            <span class="pill live-dot" style="background:rgba(62,207,142,.1);color:var(--green)">${Store.mode === "server" ? "Live" : "This browser"}</span></div>
          <div class="dash-tabs">${tabs.map(([k, l, n]) => `<button class="${ui.staffTab === k ? "on" : ""}" data-act="staffTab" data-v="${k}">${l}${n ? `<span class="badge">${n}</span>` : ""}</button>`).join("")}</div>
        </div>
        ${body}
      </div>`;
  }

  function ticket(o, actions) {
    return `
      <div class="ticket ${o.status === "new" ? "new" : ""}">
        <div class="ticket-head">
          <b>T${esc(o.table)}</b>
          <span class="muted mono" style="font-size:12px">#${o.id.slice(-4).toUpperCase()}</span>
          ${o.status === "cooking" ? `<span class="timer" data-since="${o.sentAt}" data-eta-min="${o.eta}">00:00</span>`
            : `<span class="muted" style="font-size:12px" data-ago="${o.createdAt}">${ago(o.createdAt)}</span>`}
        </div>
        <ul>${o.items.map((i) => `<li><span>${i.done && o.status === "cooking" ? "✅ " : ""}${i.qty} × ${esc(i.name)}${i.size && byId[i.dishId]?.sizes && i.size !== "Full" ? " (" + i.size + ")" : ""}</span><span class="muted">${rs(i.qty * i.price)}</span></li>
          ${i.note ? `<li class="note-line">↳ ${esc(i.note)}</li>` : ""}`).join("")}</ul>
        ${o.note ? `<div class="note-line">📝 ${esc(o.note)}</div>` : ""}
        <div class="ticket-head" style="margin:10px 0 0;border-top:1px solid var(--line);padding-top:10px"><span class="muted">${o.items.reduce((s, i) => s + i.qty, 0)} items</span><b style="font-size:15px">${rs(StoreCore.orderTotal(o))}</b></div>
        <div class="ticket-actions">${actions}</div>
      </div>`;
  }

  function staffOrders() {
    const st = S();
    const live = st.orders.filter((o) => !o.closed);
    const col = (title, list, actFn, emptyTxt) => `
      <div class="panel">
        <div class="eyebrow" style="margin-bottom:12px">${title} · ${list.length}</div>
        ${list.length ? `<div class="tickets">${list.map((o) => ticket(o, actFn(o))).join("")}</div>` : `<div class="empty-dark">${emptyTxt}</div>`}
      </div>`;
    return `
      <div class="stack">
        ${col("🆕 New orders", live.filter((o) => o.status === "new"),
          (o) => `<button class="btn" data-act="sendToKitchen" data-id="${o.id}">Send to kitchen →</button><button class="btn ghost sm" data-act="cancelOrder" data-id="${o.id}">Cancel</button>`,
          "No new orders. They'll appear here (with a sound) when guests order.")}
        <div class="grid-2">
          ${col("🔥 In kitchen", live.filter((o) => o.status === "cooking"),
            (o) => `<button class="btn ghost sm" data-act="markReady" data-id="${o.id}">Mark ready</button>`, "Nothing cooking.")}
          ${col("✅ Ready to serve", live.filter((o) => o.status === "ready"),
            (o) => `<button class="btn green" data-act="markServed" data-id="${o.id}">Served</button>`, "Nothing waiting to be served.")}
        </div>
      </div>`;
  }

  function staffFloor() {
    const st = S();
    const sel = ui.selTable;
    const legend = [["free", "#5a4c47"], ["ordering", "var(--yellow)"], ["cooking", "var(--accent-2)"], ["eating", "var(--green)"], ["bill", "var(--blue)"], ["help", "var(--accent)"]];
    let detail = `<div class="empty-dark">Tap a table to see its details.</div>`;
    if (sel) {
      const b = billFor(sel);
      const calls = st.calls.filter((c) => c.table === String(sel) && !c.done);
      detail = `
        <div class="ticket-head"><b style="font-size:22px">Table ${esc(sel)}</b><span class="pill" style="background:var(--panel-2)">${tableLabel[StoreCore.tableStatus(st, sel)]}</span></div>
        ${calls.map((c) => `<div class="call-item urgent" style="margin-bottom:8px"><span>🔔 ${esc(c.type)} <span class="muted" style="font-size:12px">${ago(c.at)}</span></span><button class="btn sm" data-act="resolveCall" data-id="${c.id}">Done</button></div>`).join("")}
        ${b.orders.length ? `
          <div class="list" style="margin:10px 0">${b.orders.map((o) => `<div class="call-item"><span>#${o.id.slice(-4).toUpperCase()} · ${o.items.reduce((s, i) => s + i.qty, 0)} items</span><span class="status-tag st-${o.status}">${statusLabel[o.status]}</span></div>`).join("")}</div>
          <div class="bill-row"><span class="muted">Running total (incl. GST)</span><b>${rs(b.subtotal * (1 + GST))}</b></div>
          <button class="btn block" style="margin-top:10px" data-act="closeTable" data-t="${esc(sel)}">Mark paid & free table</button>`
          : `<div class="empty-dark">No open orders.</div>`}
        <a class="btn ghost block" style="margin-top:8px;text-decoration:none" href="#/t/${esc(sel)}" target="_blank">Open guest view ↗</a>`;
    }
    return `
      <div class="grid-2">
        <div class="panel">
          <div class="eyebrow" style="margin-bottom:12px">Floor map · live</div>
          <div class="floor">
            ${R.tables.map((t) => { const s = StoreCore.tableStatus(st, t); return `<button class="tbl ${s}" data-act="selTable" data-v="${t}" style="${String(sel) === String(t) ? "outline:2px solid var(--text);outline-offset:4px" : ""}"><div><b>T${t}</b><small>${tableLabel[s]}</small></div></button>`; }).join("")}
          </div>
          <div class="legend">${legend.map(([k, c]) => `<span><i style="background:${c}"></i>${tableLabel[k]}</span>`).join("")}</div>
        </div>
        <div class="panel">${detail}</div>
      </div>`;
  }

  function staffCalls() {
    const st = S();
    const open = st.calls.filter((c) => !c.done).sort((a, b) => a.at - b.at);
    const recent = st.calls.filter((c) => c.done).sort((a, b) => b.doneAt - a.doneAt).slice(0, 8);
    return `
      <div class="grid-2">
        <div class="panel"><div class="eyebrow" style="margin-bottom:12px">🔔 Open requests · ${open.length}</div>
          ${open.length ? `<div class="list">${open.map((c) => `
            <div class="call-item ${Date.now() - c.at > 120000 ? "urgent" : ""}">
              <div><b>Table ${esc(c.table)}</b> · ${esc(c.type)}<div class="muted" style="font-size:12px" data-ago="${c.at}">${ago(c.at)}</div></div>
              <button class="btn sm" data-act="resolveCall" data-id="${c.id}">Done ✓</button>
            </div>`).join("")}</div>` : `<div class="empty-dark">All quiet. No one needs anything right now.</div>`}
        </div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:12px">Recently handled</div>
          ${recent.length ? `<div class="list">${recent.map((c) => `<div class="call-item"><span>T${esc(c.table)} · ${esc(c.type)}</span><span class="muted" style="font-size:12px">${ago(c.doneAt || c.at)}</span></div>`).join("")}</div>` : `<div class="empty-dark">—</div>`}
        </div>
      </div>`;
  }

  function staffBills() {
    const st = S();
    const tables = R.tables.filter((t) => StoreCore.tableOrders(st, t).length);
    if (!tables.length) return `<div class="panel"><div class="empty-dark">No open tables.</div></div>`;
    tables.sort((a, b) => (st.tables[b]?.billRequested ? 1 : 0) - (st.tables[a]?.billRequested ? 1 : 0));
    return `
      <p class="muted" style="margin-bottom:12px;font-size:13px">Payment is collected at the counter (cash / UPI / card — outside the app). Mark the table paid to free it.</p>
      <div class="tickets">${tables.map((t) => {
        const tb = st.tables[t] || {};
        const b = billFor(t);
        const tip = tb.billRequested ? (b.subtotal * tb.tip) / 100 : 0;
        const total = b.subtotal + b.gst + tip;
        return `
          <div class="ticket ${tb.billRequested ? "new" : ""}">
            <div class="ticket-head"><b>Table ${t}</b>${tb.billRequested ? `<span class="pill" style="background:rgba(76,124,240,.15);color:var(--blue)">Bill requested</span>` : `<span class="muted" style="font-size:12px">Dining</span>`}</div>
            <table class="bill-table">
              ${b.lines.map((l) => `<tr><td>${l.qty} × ${esc(l.name)}</td><td>${rs(l.amt)}</td></tr>`).join("")}
              <tr><td class="muted">GST 5%</td><td>${rs(b.gst)}</td></tr>
              ${tip ? `<tr><td class="muted">Tip ${tb.tip}%</td><td>${rs(tip)}</td></tr>` : ""}
              <tr><td><b>Total</b></td><td><b style="font-size:18px">${rs(total)}</b></td></tr>
              ${tb.billRequested && tb.split > 1 ? `<tr><td class="muted">Split ${tb.split} ways</td><td>${rs(total / tb.split)} each</td></tr>` : ""}
            </table>
            <div class="ticket-actions"><button class="btn ${tb.billRequested ? "" : "ghost"}" data-act="printBill" data-t="${t}">🖨️ Print</button><button class="btn green" data-act="closeTable" data-t="${t}">Mark paid & free table</button></div>
          </div>`;
      }).join("")}</div>`;
  }

  function staffOverview() {
    const st = S();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = st.orders.filter((o) => o.createdAt >= start.getTime() && o.status !== "cancelled");
    const sales = today.reduce((s, o) => s + StoreCore.orderTotal(o), 0);
    const active = R.tables.filter((t) => StoreCore.tableStatus(st, t) !== "free").length;
    const ratings = st.reviews.filter((r) => r.at >= start.getTime());
    const avg = ratings.length ? (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1) : "—";
    const counts = {};
    today.forEach((o) => o.items.forEach((i) => (counts[i.name] = (counts[i.name] || 0) + i.qty)));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top[0]?.[1] || 1;
    return `
      <div class="stat-row">
        <div class="stat"><span class="eyebrow">Tables</span><b>${active}<span class="muted" style="font-size:16px">/${R.tables.length}</span></b></div>
        <div class="stat"><span class="eyebrow">Orders today</span><b>${today.length}</b></div>
        <div class="stat"><span class="eyebrow">Sales today</span><b class="accent">${rs(sales)}</b></div>
        <div class="stat"><span class="eyebrow">Avg rating</span><b>${avg}${ratings.length ? ` <span style="font-size:16px" class="accent">★</span>` : ""}</b></div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="eyebrow" style="margin-bottom:14px">Top dishes today</div>
          ${top.length ? top.map(([n, c]) => `<div class="top-item"><span>${esc(n)}</span><span class="mono muted">${c}</span><div class="bar"><i style="width:${(c / max) * 100}%"></i></div></div>`).join("") : `<div class="empty-dark">No orders yet today.</div>`}
        </div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:14px">Latest reviews</div>
          ${st.reviews.length ? `<div class="list">${st.reviews.slice(-6).reverse().map((r) => `<div class="review-item"><div class="ticket-head" style="margin:0"><span class="s">${"★".repeat(r.stars)}<span style="color:var(--line)">${"★".repeat(5 - r.stars)}</span></span><span class="muted" style="font-size:12px">T${esc(r.table)} · ${ago(r.at)}</span></div>${r.text ? `<div style="font-size:14px;margin-top:6px">${esc(r.text)}</div>` : ""}</div>`).join("")}</div>` : `<div class="empty-dark">No reviews yet.</div>`}
        </div>
      </div>
      <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn ghost" style="text-decoration:none" href="#/kitchen" target="_blank">Open kitchen display ↗</a>
        <button class="btn ghost" data-act="demo">➕ Add demo orders</button>
        <button class="btn ghost" data-act="reset" style="color:var(--accent)">Reset all data</button>
      </div>`;
  }

  // =====================================================================
  //  KITCHEN
  // =====================================================================
  function renderKitchen() {
    document.body.className = "";
    const cooking = S().orders.filter((o) => o.status === "cooking").sort((a, b) => a.sentAt - b.sentAt);
    const pending = S().orders.filter((o) => o.status === "new").length;
    const ready = S().orders.filter((o) => o.status === "ready" && !o.closed).length;
    const clock = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="dash">
        <div class="dash-head">
          <div class="left"><a class="link-back" href="#/">←</a><h1>Kitchen display</h1><span class="pill live-dot" style="background:rgba(62,207,142,.1);color:var(--green)">Live</span></div>
          <div class="left muted" style="font-size:14px">
            ${pending ? `<span>⏳ ${pending} awaiting staff</span>` : ""}
            <span>✅ ${ready} ready</span><span class="mono" id="kds-clock" style="color:var(--text);font-size:18px">${clock}</span>
          </div>
        </div>
        <div class="kds">
          ${STATIONS.map((stn) => {
            const tks = cooking.filter((o) => o.items.some((i) => i.station === stn && !i.done));
            return `<div class="kds-col"><h3><span>${stn}</span><span>${tks.length}</span></h3>
              <div class="list">
              ${tks.length ? tks.map((o) => {
                const its = o.items.filter((i) => i.station === stn);
                return `<div class="ticket">
                  <div class="ticket-head"><b>T${esc(o.table)}</b><span class="timer" data-since="${o.sentAt}" data-eta-min="${o.eta}">00:00</span></div>
                  <ul>${its.map((i) => `<li><span><b>${i.qty}×</b> ${esc(i.name)}${i.size && byId[i.dishId]?.sizes && i.size !== "Full" ? " (" + i.size + ")" : ""}</span></li>${i.note ? `<li class="note-line">↳ ${esc(i.note)}</li>` : ""}`).join("")}</ul>
                  ${o.note ? `<div class="note-line">📝 ${esc(o.note)}</div>` : ""}
                  <div class="ticket-actions"><button class="btn green sm" style="width:100%" data-act="stationReady" data-id="${o.id}" data-stn="${stn}">Done ✓</button></div>
                </div>`;
              }).join("") : `<div class="empty-dark">—</div>`}
              </div></div>`;
          }).join("")}
        </div>
      </div>`;
  }

  // =====================================================================
  //  RENDER + EVENTS
  // =====================================================================
  let lastView = "";
  function render() {
    const r = route();
    const key = r.view + (r.table || "");
    if (key !== lastView) { ui.sheet = null; window.scrollTo(0, 0); lastView = key; }
    // keep focus/caret in text inputs across re-renders
    const ae = document.activeElement;
    const focusId = ae && ae.id && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") ? ae.id : null;
    const caret = focusId ? ae.selectionStart : null;
    const sheetScroll = document.querySelector(".sheet")?.scrollTop;

    if (r.view === "table") $app.innerHTML = renderCustomer(r.table);
    else if (r.view === "staff") $app.innerHTML = renderStaff();
    else if (r.view === "kitchen") $app.innerHTML = renderKitchen();
    else { $app.innerHTML = renderLanding(); afterLanding(); }

    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (_) {} } }
    if (sheetScroll) { const sh = document.querySelector(".sheet"); if (sh) sh.scrollTop = sheetScroll; }
    tick();
  }

  function tick() {
    const now = Date.now();
    document.querySelectorAll("[data-since]").forEach((el) => {
      const sec = (now - +el.dataset.since) / 1000;
      const eta = +el.dataset.etaMin * 60;
      el.textContent = mmss(sec);
      el.className = "timer" + (sec > eta * 1.25 ? " late" : sec > eta * 0.8 ? " warn" : "");
    });
    document.querySelectorAll("[data-eta]").forEach((el) => {
      const [since, eta] = el.dataset.eta.split("|").map(Number);
      const left = eta * 60 - (now - since) / 1000;
      el.textContent = left > 0 ? mmss(left) : "Soon";
    });
    document.querySelectorAll("[data-eta-ring]").forEach((el) => {
      const [since, eta, C] = el.dataset.etaRing.split("|").map(Number);
      const frac = Math.min(1, (now - since) / 1000 / (eta * 60));
      el.setAttribute("stroke-dashoffset", String(C * frac));
    });
    document.querySelectorAll("[data-ago]").forEach((el) => (el.textContent = ago(+el.dataset.ago)));
    const clk = document.getElementById("kds-clock");
    if (clk) clk.textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  setInterval(tick, 1000);

  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function addDemoOrders() {
    const pick = (ids) => ids.map(([id, qty, size]) => { const d = byId[id]; return { dishId: id, name: d.name, size: size || "Full", qty, price: sizePrice(d, size || "Full"), station: d.station, prep: d.prep }; });
    Store.dispatch("placeOrder", { table: R.tables[1], items: pick([["paneer-makhani", 1], ["garlic-naan", 4], ["mango-lassi", 2]]) });
    Store.dispatch("placeOrder", { table: R.tables[3], items: pick([["veg-biryani", 1], ["paneer-tikka", 1, "Half"], ["masala-chai", 2]]) });
    const o = S().orders[S().orders.length - 1];
    Store.dispatch("sendToKitchen", { id: o.id });
    Store.dispatch("call", { table: R.tables[2], type: "Water" });
  }

  const actions = {
    print: () => window.print(),
    tab: (d) => { ui.tab = d.v; ui.sheet = null; window.scrollTo(0, 0); render(); },
    cat: (d) => { ui.cat = d.v; render(); },
    veg: () => { ui.vegOnly = !ui.vegOnly; render(); },
    dish: (d) => { ui.sheet = { type: "dish", id: d.id, size: "Full", qty: 1, note: "" }; render(); },
    closeSheet: (d, el, e) => { if (e.target === el) { ui.sheet = null; render(); } },
    size: (d) => { ui.sheet.size = d.v; render(); },
    sq: (d) => { ui.sheet.qty = Math.max(1, Math.min(20, ui.sheet.qty + +d.v)); render(); },
    addToCart: () => {
      const t = route().table, s = ui.sheet, dish = byId[s.id];
      const size = dish.sizes ? s.size : "Full";
      const c = cart(t);
      const note = (s.note || "").trim();
      const ex = c.find((i) => i.dishId === s.id && i.size === size && i.note === note);
      if (ex) ex.qty += s.qty;
      else c.push({ dishId: s.id, name: dish.name, size, qty: s.qty, price: sizePrice(dish, size), station: dish.station, prep: dish.prep, note });
      saveMe(); ui.sheet = null; render(); toast(`Added ${s.qty} × ${dish.name}`);
    },
    openCart: () => { ui.sheet = { type: "cart" }; render(); },
    cq: (d) => {
      const c = cart(route().table), i = c[+d.i];
      i.qty += +d.v; if (i.qty <= 0) c.splice(+d.i, 1);
      if (!c.length) ui.sheet = null;
      saveMe(); render();
    },
    placeOrder: () => {
      const t = route().table, c = cart(t);
      if (!c.length) return;
      const total = cartTotal(t);
      Store.dispatch("placeOrder", { table: t, items: c.map((i) => ({ ...i })) });
      me.points += Math.floor(total * R.pointsPerRupee);
      me.carts[t] = []; saveMe();
      ui.sheet = null; ui.tab = "orders"; render(); window.scrollTo(0, 0);
      toast("Order sent! 🎉 +" + Math.floor(total * R.pointsPerRupee) + " points");
    },
    call: (d) => {
      const t = route().table;
      Store.dispatch("call", { table: t, type: d.v });
      if (navigator.vibrate) navigator.vibrate(60);
      toast(d.v === "Waiter" ? "🛎️ Waiter has been called" : `Request sent: ${d.v}`);
    },
    split: (d) => { ui.split = +d.v; render(); },
    tip: (d) => { ui.tip = +d.v; render(); },
    requestBill: () => { Store.dispatch("requestBill", { table: route().table, tip: ui.tip, split: ui.split }); toast("🧾 Bill requested"); },
    star: (d) => { ui.stars = +d.v; render(); },
    review: () => {
      const t = route().table;
      Store.dispatch("review", { table: t, stars: ui.stars, text: ui.reviewText.trim() });
      me.reviewed[t] = Date.now(); saveMe();
      ui.stars = 0; ui.reviewText = ""; render(); toast("Thank you! 💛");
    },
    quizStart: () => {
      const players = (ui.quiz?.players || ["", ""]).map((p, i) => p.trim() || "Player " + (i + 1));
      ui.quiz = { players, scores: [0, 0], turn: 0, idx: 0, picked: null, started: true, order: shuffle(window.QUIZ.map((_, i) => i)) };
      render();
    },
    quizReset: () => { ui.quiz = { players: ui.quiz.players, started: false }; render(); },
    quizPick: (d) => {
      const Q = ui.quiz; if (Q.picked != null) return;
      Q.picked = +d.v;
      if (Q.picked === window.QUIZ[Q.order[Q.idx]].c) Q.scores[Q.turn]++;
      render();
    },
    quizNext: () => { const Q = ui.quiz; Q.idx++; Q.turn = Q.idx % 2; Q.picked = null; render(); },

    staffTab: (d) => { ui.staffTab = d.v; render(); },
    selTable: (d) => { ui.selTable = d.v; render(); },
    sendToKitchen: (d) => Store.dispatch("sendToKitchen", { id: d.id }),
    cancelOrder: (d) => { if (confirm("Cancel this order?")) Store.dispatch("cancelOrder", { id: d.id }); },
    markReady: (d) => Store.dispatch("markReady", { id: d.id }),
    markServed: (d) => Store.dispatch("markServed", { id: d.id }),
    stationReady: (d) => Store.dispatch("stationReady", { id: d.id, station: d.stn }),
    resolveCall: (d) => Store.dispatch("resolveCall", { id: d.id }),
    closeTable: (d) => { if (confirm(`Payment received for Table ${d.t}? This clears the table.`)) { Store.dispatch("closeTable", { table: d.t }); toast(`Table ${d.t} is free`); } },
    printBill: (d) => {
      const b = billFor(d.t), tb = S().tables[d.t] || {};
      const tip = tb.billRequested ? (b.subtotal * tb.tip) / 100 : 0;
      const w = window.open("", "_blank", "width=380,height=600");
      if (!w) return toast("Allow pop-ups to print");
      w.document.write(`<pre style="font:14px monospace;padding:16px">${esc(R.name)}\nTable ${esc(d.t)}  ${new Date().toLocaleString("en-IN")}\n${"-".repeat(32)}\n${b.lines.map((l) => (l.qty + " x " + l.name).slice(0, 22).padEnd(22) + rs(l.amt).padStart(10)).join("\n")}\n${"-".repeat(32)}\n${"Subtotal".padEnd(22)}${rs(b.subtotal).padStart(10)}\n${"GST 5%".padEnd(22)}${rs(b.gst).padStart(10)}\n${tip ? ("Tip " + tb.tip + "%").padEnd(22) + rs(tip).padStart(10) + "\n" : ""}${"TOTAL".padEnd(22)}${rs(b.subtotal + b.gst + tip).padStart(10)}\n\nThank you! Visit again.</pre>`);
      w.document.close(); w.print();
    },
    demo: () => { addDemoOrders(); toast("Demo orders added"); },
    reset: () => { if (confirm("Delete ALL orders, calls and reviews?")) Store.dispatch("reset"); },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    // clicks inside the sheet shouldn't trigger the backdrop close
    if (el.dataset.act === "closeSheet" && e.target.closest("[data-stop]")) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "search") { ui.q = el.value; const l = document.getElementById("dish-list"); if (l) l.innerHTML = dishListHtml(route().table); }
    else if (el.id === "dish-note" && ui.sheet) ui.sheet.note = el.value;
    else if (el.id === "review-text") ui.reviewText = el.value;
    else if (el.dataset.pname != null) { ui.quiz = ui.quiz || { players: ["", ""], started: false }; ui.quiz.players[+el.dataset.pname] = el.value; }
  });

  window.addEventListener("hashchange", () => { ui.tab = "menu"; render(); });

  Store.init().then(render);
})();
