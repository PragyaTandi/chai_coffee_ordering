import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconArrowLeft, IconArrowRight, IconCheck, IconChevronDown, IconClock, IconCoffee, IconMinus, IconPlus, IconSearch, IconShoppingBag, IconX } from "@tabler/icons-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Form, Link, useNavigate, useParams, useSearchParams } from "react-router";

type Product = { id: string; name: string; description: string; category: string; price: number; image: string; tag: string };
type Line = { product: Product; quantity: number };
type Order = { id: string; tableNumber: number; customerName: string; instructions: string; paymentMethod: string; paymentStatus: string; status: string; total: number; estimatedMinutes: number | null; createdAt: string; items: { id: string; name: string; price: number; quantity: number }[] };
type DailyReportItem = { id: string; name: string; price: number; quantity: number; lineTotal: number };
type DailyReportOrder = {
  id: string;
  tableNumber: number;
  customerName: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  total: number;
  createdAt: string;
  items: DailyReportItem[];
};
type DailyReport = {
  date: string;
  timezone: string;
  orderCount: number;
  totalItems: number;
  totalOrderValue: number;
  counterDueValue: number;
  onlineUnpaidValue: number;
  itemTotals: { name: string; unitPrice: number; quantity: number; lineTotal: number }[];
  orders: DailyReportOrder[];
};
type CartContext = { cart: Line[]; add: (p: Product) => void; change: (id: string, amount: number) => void; clear: () => void; open: boolean; setOpen: (open: boolean) => void; trackingId: string | null; setTrackingId: (id: string) => void };
const Cart = createContext<CartContext>(null!);
const categories = ["All", "Chai & Tea", "Coffee", "Cold Drinks", "Snacks", "Desserts"];
const money = (n: number) => `₹${n}`;
const orderNumber = (id: string) => `#${id.slice(0, 6).toUpperCase()}`;
const tableLabel = (table: number) => String(table).padStart(2, "0");

export function CafeProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [trackingId, setTrackingIdState] = useState<string | null>(null);
  useEffect(() => setTrackingIdState(localStorage.getItem("after-hours-order-id")), []);
  const setTrackingId = (id: string) => {
    localStorage.setItem("after-hours-order-id", id);
    setTrackingIdState(id);
  };
  const add = (product: Product) => setCart((old) => old.some((line) => line.product.id === product.id) ? old.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...old, { product, quantity: 1 }]);
  const change = (id: string, amount: number) => setCart((old) => old.map((line) => line.product.id === id ? { ...line, quantity: line.quantity + amount } : line).filter((line) => line.quantity > 0));
  return <Cart.Provider value={{ cart, add, change, clear: () => setCart([]), open, setOpen, trackingId, setTrackingId }}>{children}</Cart.Provider>;
}

function useTable() {
  const [params] = useSearchParams();
  const number = Number(params.get("table"));
  return Number.isInteger(number) && number > 0 ? number : 7;
}
function useProducts() { return useActionQuery<Product[]>("list-products", {}).data ?? []; }
function useStaffOrders(enabled: boolean) { return useActionQuery<Order[]>("list-orders", {}, { enabled, refetchInterval: 5000 }); }
function useStaffAccess() { return useActionQuery("check-staff-access", {}, { retry: false, refetchInterval: 5000 }); }
function useOrder(id: string) { return useActionQuery<Order | null>("get-order", { id }, { enabled: Boolean(id), refetchInterval: 5000 }).data ?? null; }
function playOrderClink(context: AudioContext, delay = 0) {
  const startAt = context.currentTime + delay;
  [1396.91, 1760].forEach((frequency, index) => {
    const toneStart = startAt + index * 0.055;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.75, toneStart + 0.4);
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.12, toneStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.45);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    oscillator.start(toneStart);
    oscillator.stop(toneStart + 0.45);
  });
}
const REPORT_TIME_ZONE = "Asia/Kolkata";
function getCafeDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("Could not determine the café's local date.");
  return `${year}-${month}-${day}`;
}
function isValidReportDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function formatReportTime(value: string, timeZone = REPORT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function csvCell(value: string | number) {
  const text = String(value);
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
function downloadDailyReportCsv(report: DailyReport) {
  const rows: (string | number)[][] = [
    ["After Hours daily order report", report.date],
    ["Timezone", report.timezone],
    [],
    ["Orders", report.orderCount],
    ["Items sold", report.totalItems],
    ["Order value (INR)", report.totalOrderValue],
    ["Pay-at-counter due (INR)", report.counterDueValue],
    ["Online unpaid (INR)", report.onlineUnpaidValue],
    [],
    ["Order ID", "Time", "Table", "Customer", "Order status", "Payment method", "Payment status", "Item", "Quantity", "Unit price (INR)", "Line total (INR)", "Order total (INR)"],
    ...report.orders.flatMap((order) => {
      const orderItems = order.items.length ? order.items : [null];
      return orderItems.map((item, index) => [
        order.id,
        formatReportTime(order.createdAt, report.timezone),
        order.tableNumber,
        order.customerName,
        order.status,
        order.paymentMethod,
        order.paymentStatus,
        item?.name ?? "",
        item?.quantity ?? "",
        item?.price ?? "",
        item?.lineTotal ?? "",
        index === 0 ? order.total : "",
      ]);
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `after-hours-orders-${report.date}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TablePicker({ table, editable }: { table: number; editable: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(String(table));
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => setDraft(String(table)), [table]);
  if (!editable) return <span className="table-pill"><span className="table-dot"/> TABLE {tableLabel(table)}</span>;
  return <details ref={picker} className="table-picker">
    <summary className="table-pill" aria-label={`Change table number, currently ${tableLabel(table)}`}><span className="table-dot"/> TABLE {tableLabel(table)} <IconChevronDown size={13}/></summary>
    <form className="table-picker-popover" onSubmit={(event) => {
      event.preventDefault();
      const nextTable = Number(draft);
      if (!Number.isInteger(nextTable) || nextTable < 1) return;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("table", String(nextTable));
        return next;
      });
      if (picker.current) picker.current.open = false;
    }}>
      <label htmlFor="table-number">Your table</label>
      <input id="table-number" type="number" min="1" step="1" required value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="submit">Update table</button>
    </form>
  </details>;
}

function Brand({ light = false }: { light?: boolean }) {
  const [params] = useSearchParams();
  const table = Number(params.get("table"));
  const home = Number.isInteger(table) && table > 0 ? `/?table=${table}` : "/";
  return <Link to={home} className={`brand ${light ? "brand-light" : ""}`} aria-label="After Hours home"><span className="brand-mark"><IconCoffee size={20} stroke={1.6}/></span><span><strong>after hours<span className="brand-dot">.</span></strong><small>CHAI · COFFEE · COMPANY</small></span></Link>;
}
function Header({ table, dark = false, editable = true }: { table: number; dark?: boolean; editable?: boolean }) {
  const { cart, setOpen, trackingId } = useContext(Cart);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <header className={`site-header ${dark ? "header-dark" : ""}`}><div className="header-inner"><Brand light={dark}/><nav className="header-nav"><Link to={`/menu?table=${table}`}>Our menu</Link><a href="/#our-story">Our story</a><Link to="/staff">For staff</Link></nav><div className="header-right">{trackingId && <Link className="track-order-link" to={`/order/${trackingId}?table=${table}`}>Track order</Link>}<Link className="mobile-staff-link" to="/staff">Staff</Link><TablePicker table={table} editable={editable}/><button className="bag-button" onClick={() => setOpen(true)} aria-label={`Open cart, ${count} items`}><IconShoppingBag size={20} stroke={1.6}/><span>{count}</span></button></div></div></header>;
}
function Footer() { return <footer className="footer" id="our-story"><div className="footer-inner"><div><Brand light/><p>Good things happen when you stay a little longer.</p></div><div className="footer-note">PULL UP A CHAIR. STAY A WHILE.<br/><span>Made for slow evenings & good company.</span></div></div><div className="footer-bottom"><span>© AFTER HOURS CAFÉ</span><span>CHAI, CONVERSATIONS & EVERYTHING IN BETWEEN</span></div></footer>; }
function CartDrawer({ table }: { table: number }) {
  const { cart, change, open, setOpen } = useContext(Cart);
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  if (!open) return null;
  return <div className="drawer-backdrop" onClick={() => setOpen(false)}><aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Your order"><div className="drawer-head"><div><span className="eyebrow">A LITTLE SOMETHING FOR YOU</span><h2>Your order<span className="gold">.</span></h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close cart"><IconX/></button></div><p className="drawer-sub">Something good is on its way.</p><div className="drawer-lines">{cart.length === 0 ? <div className="empty-cart"><IconCoffee size={42} stroke={1}/><p>Nothing here just yet.</p><span>Find something lovely on the menu.</span></div> : cart.map(({ product, quantity }) => <div className="cart-line" key={product.id}><img src={product.image} alt=""/><div className="cart-line-info"><strong>{product.name}</strong><span>{money(product.price)}</span><div className="quantity"><button onClick={() => change(product.id, -1)} aria-label={`Remove one ${product.name}`}><IconMinus size={14}/></button><span>{quantity}</span><button onClick={() => change(product.id, 1)} aria-label={`Add one ${product.name}`}><IconPlus size={14}/></button></div></div><strong>{money(product.price * quantity)}</strong></div>)}</div><div className="drawer-bottom"><div className="total-row"><span>Subtotal</span><strong>{money(total)}</strong></div><p>Good food, good company. No rush.</p><Link className={`button button-gold full ${!cart.length ? "disabled" : ""}`} to={`/checkout?table=${table}`} onClick={(e) => { if (!cart.length) e.preventDefault(); else setOpen(false); }}>Continue to checkout <IconArrowRight size={18}/></Link></div></aside></div>;
}
function MenuSection({ table, standalone = false }: { table: number; standalone?: boolean }) {
  const products = useProducts();
  const { add, cart, change, setOpen } = useContext(Cart);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => products.filter((p) => (category === "All" || p.category === category) && `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())), [products, category, search]);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <section className={`menu-section ${standalone ? "menu-standalone" : ""}`} id="menu"><div className="menu-inner"><div className="menu-intro"><div><div className="section-kicker"><span/> A LITTLE SOMETHING FOR EVERYONE</div><h2>Come hungry.<br/><em>Stay a little longer.</em></h2><p>Good food, warm cups and the kind of conversations<br className="desktop-only"/> that turn into your favourite memories.</p></div><div className="menu-stamp"><span>MADE WITH</span><IconCoffee size={31} stroke={1.2}/><span>A LITTLE LOVE</span></div></div><div className="menu-toolbar"><div className="tabs" aria-label="Menu categories">{categories.map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><IconSearch size={18}/><input placeholder="Find your favourite" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search menu"/></label></div><div className="menu-list-heading"><div><span className="eyebrow">THE GOOD STUFF</span><h3>{category === "All" ? "All favourites" : category}</h3></div><span>{filtered.length} ITEMS TO EXPLORE</span></div><div className="product-grid">{filtered.map((product) => { const quantity = cart.find((line) => line.product.id === product.id)?.quantity ?? 0; return <article className="product-card" key={product.id}><div className="product-image"><img src={product.image} alt={product.name}/>{product.tag && <span className="product-tag">✳ {product.tag}</span>}</div><div className="product-content"><div className="product-title"><h4>{product.name}</h4><span className="veg-icon"><i/></span></div><p>{product.description}</p><div className="product-bottom"><strong>{money(product.price)}</strong>{quantity ? <div className="card-quantity"><button onClick={() => change(product.id, -1)} aria-label={`Remove one ${product.name}`}><IconMinus size={14}/></button><span>{quantity}</span><button onClick={() => add(product)} aria-label={`Add one ${product.name}`}><IconPlus size={14}/></button></div> : <button className="add-button" onClick={() => add(product)}>ADD <IconPlus size={14}/></button>}</div></div></article>; })}</div>{filtered.length === 0 && <p className="no-results">No favourites found. Try another search.</p>}<div className="menu-end"><span>✳</span> A LITTLE MORE TIME TOGETHER <span>✳</span></div></div>{count > 0 && <button className="floating-cart" onClick={() => setOpen(true)}><span>{count} {count === 1 ? "item" : "items"} · {money(cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0))}</span> View order <IconArrowRight size={17}/></button>}</section>;
}
type DayPart = "morning" | "afternoon" | "evening";
const getDayPart = (): DayPart => {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : "evening";
};
const dayPartCopy = {
  morning: { kicker: "A FRESH START, THE AFTER HOURS WAY", title: "Good mornings.", side: "MAKE TODAY A LITTLE SLOWER", signoff: "Made for bright beginnings.", ticker: "A GOOD START, ONE CUP AT A TIME" },
  afternoon: { kicker: "TAKE THE LONG WAY THROUGH TODAY", title: "Easy afternoons.", side: "A LITTLE PAUSE IN YOUR DAY", signoff: "A good reason to take a break.", ticker: "TAKE A BREATHER, STAY A LITTLE" },
  evening: { kicker: "YOUR LITTLE CORNER OF THE EVENING", title: "Good evenings.", side: "GOOD FOOD. GOOD MOOD. GOOD COMPANY.", signoff: "Made for slow evenings.", ticker: "MADE FOR SLOW EVENINGS" },
};
function useDayPart(preview: DayPart | "auto") {
  const [localDayPart, setLocalDayPart] = useState<DayPart>("evening");
  useEffect(() => {
    setLocalDayPart(getDayPart());
    const interval = window.setInterval(() => setLocalDayPart(getDayPart()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return preview === "auto" ? localDayPart : preview;
}
function EntrySelection({ table }: { table: number }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"role" | "table" | "confirm">("role");
  const [tableDraft, setTableDraft] = useState(String(table));
  const [selectedTable, setSelectedTable] = useState(table);
  const isRoleStep = step === "role";

  useEffect(() => {
    if (!sessionStorage.getItem("after-hours-entry-complete")) setOpen(true);
  }, []);

  return <Sheet open={open}>
    <SheetContent side="bottom" className="entry-sheet" showClose={false}>
      <div className="entry-choice">
        <SheetHeader className="entry-choice-header">
          <SheetTitle className="entry-choice-title">{isRoleStep ? "Welcome to After Hours." : step === "table" ? "What table are you at?" : "This is your table."}</SheetTitle>
          <SheetDescription className="entry-choice-description">{isRoleStep ? "What brings you in today?" : "We’ll bring your order to you."}</SheetDescription>
        </SheetHeader>
        {isRoleStep ? <div className="entry-choice-options">
          <button type="button" className="entry-choice-option" onClick={() => setStep("table")}>
            <span><strong>Customer</strong><small>Browse the menu and order</small></span><IconArrowRight size={19}/>
          </button>
          <Link className="entry-choice-option" to="/staff" onClick={() => sessionStorage.setItem("after-hours-entry-complete", "true")}>
            <span><strong>Staff</strong><small>Manage café orders</small></span><IconArrowRight size={19}/>
          </Link>
        </div> : step === "table" ? <form className="entry-table-form" onSubmit={(event) => {
          event.preventDefault();
          const nextTable = Number(tableDraft);
          if (!Number.isInteger(nextTable) || nextTable < 1) return;
          setSelectedTable(nextTable);
          setStep("confirm");
        }}>
          <label htmlFor="entry-table-number">TABLE NUMBER</label>
          <input id="entry-table-number" type="number" min="1" step="1" required autoFocus value={tableDraft} onChange={(event) => setTableDraft(event.target.value)} />
          <button type="submit" className="button button-gold full">Confirm table <IconArrowRight size={18}/></button>
          <button type="button" className="entry-back" onClick={() => setStep("role")}><IconArrowLeft size={15}/> Back</button>
        </form> : <div className="entry-table-confirmation">
          <div className="entry-table-number"><span>TABLE</span><strong>{tableLabel(selectedTable)}</strong></div>
          <button type="button" className="button button-gold full" onClick={() => {
            sessionStorage.setItem("after-hours-entry-complete", "true");
            navigate(`/menu?table=${selectedTable}`);
          }}>Continue to menu <IconArrowRight size={18}/></button>
          <button type="button" className="entry-back" onClick={() => setStep("table")}><IconArrowLeft size={15}/> Change table</button>
        </div>}
      </div>
    </SheetContent>
  </Sheet>;
}
export function Home() {
  const table = useTable();
  const [timePreview, setTimePreview] = useState<DayPart | "auto">("auto");
  const dayPart = useDayPart(timePreview);
  const copy = dayPartCopy[dayPart];
  return <><EntrySelection table={table}/><Header table={table} dark/><main><section className={`hero hero-${dayPart}`}><div className="hero-overlay"/><div className="hero-content"><div className="hero-kicker"><span/> {copy.kicker}</div><h1>{copy.title}<br/><em>Better conversations.</em></h1><p>Chai, coffee and a little more time together.</p><div className="hero-table"><span className="table-dot"/> YOU’RE AT TABLE {tableLabel(table)}</div><a href="#menu" className="button button-gold">Explore the menu <IconArrowRight size={19}/></a><div className="hero-signoff">{copy.signoff} <span>✳</span></div></div><div className="hero-side">{copy.side}</div><div className="hero-bottom"><span>COME AS YOU ARE, STAY AS LONG AS YOU LIKE</span>{import.meta.env.DEV ? <label className="time-preview"><IconClock size={14}/><span>Preview time</span><select aria-label="Preview time of day" value={timePreview} onChange={(event) => setTimePreview(event.target.value as DayPart | "auto")}><option value="auto">Auto</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label> : <span>01 / 03</span>}</div></section><div className="ticker"><span>✳</span> CHAI & CONVERSATIONS <span>✳</span> GOOD FOOD, GOOD COMPANY <span>✳</span> {copy.ticker} <span>✳</span> CHAI & CONVERSATIONS <span>✳</span></div><MenuSection table={table}/></main><Footer/><CartDrawer table={table}/></>;
}
export function MenuPage() { const table = useTable(); return <><Header table={table}/><MenuSection table={table} standalone/><Footer/><CartDrawer table={table}/></>; }
export function Checkout() {
  const table = useTable();
  const navigate = useNavigate();
  const { cart, change, clear, setTrackingId } = useContext(Cart);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [payment, setPayment] = useState<"counter" | "online">("counter");
  const [activeTarget, setActiveTarget] = useState<"table" | "name" | "instructions" | "counter" | "online" | "place" | null>("table");
  const tableFieldRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const counterPaymentRef = useRef<HTMLButtonElement>(null);
  const placeOrderRef = useRef<HTMLButtonElement>(null);
  const create = useActionMutation("create-order");
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const guideTo = (target: HTMLElement | null, nextTarget: Exclude<typeof activeTarget, null>) => {
    if (!target) return;
    setActiveTarget(nextTarget);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    const tableField = tableFieldRef.current;
    tableField?.focus({ preventScroll: true });
    tableField?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <>
      <Header table={table}/>
      <main className="flow-page">
        <Link className="back-link" to={`/menu?table=${table}`}><IconArrowLeft size={16}/> Back to menu</Link>
        <div className="flow-heading">
          <span className="eyebrow">ALMOST THERE</span>
          <h1>Make yourself <em>at home.</em></h1>
          <p>A few little details and we’ll get started on your order.</p>
        </div>
        <div className="checkout-grid">
          <div className="checkout-form">
            <div className="form-card">
              <div className="form-title"><span>01</span><h2>Your details</h2></div>
              <label>TABLE NUMBER <div ref={tableFieldRef} className={`table-field ${activeTarget === "table" ? "checkout-guided-active" : ""}`} tabIndex={0} role="group" aria-label={`Table ${tableLabel(table)}. Press Enter to continue to your name.`} onFocus={() => setActiveTarget("table")} onBlur={() => setActiveTarget(null)} onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                guideTo(nameRef.current, "name");
              }}><span className="table-dot"/> Table {tableLabel(table)}</div></label>
              <label>YOUR NAME <small>OPTIONAL</small><input ref={nameRef} className={activeTarget === "name" ? "checkout-guided-active" : ""} value={name} onChange={(event) => setName(event.target.value)} onFocus={() => setActiveTarget("name")} onBlur={() => setActiveTarget(null)} onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                guideTo(instructionsRef.current, "instructions");
              }} placeholder="What should we call you?"/></label>
              <label>SPECIAL INSTRUCTIONS <small>OPTIONAL</small><textarea ref={instructionsRef} className={activeTarget === "instructions" ? "checkout-guided-active" : ""} value={instructions} onChange={(event) => setInstructions(event.target.value)} onFocus={() => setActiveTarget("instructions")} onBlur={() => setActiveTarget(null)} onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                guideTo(counterPaymentRef.current, "counter");
              }} placeholder="Anything we should know? (Shift+Enter for a new line)" rows={3}/></label>
            </div>
            <div
              className="form-card"
              ref={paymentSectionRef}
            >
              <div className="form-title"><span>02</span><h2>How would you like to pay?</h2></div>
              <button type="button" ref={counterPaymentRef} className={`payment-option ${payment === "counter" ? "selected" : ""} ${activeTarget === "counter" ? "checkout-guided-active" : ""}`} aria-pressed={payment === "counter"} onFocus={() => setActiveTarget("counter")} onBlur={() => setActiveTarget(null)} onClick={() => setPayment("counter")} onKeyDown={(event) => {
                if (event.key !== "Enter" || payment !== "counter") return;
                event.preventDefault();
                guideTo(placeOrderRef.current, "place");
              }}>
                <span className="radio"/><span><strong>Pay at the counter</strong><small>Settle up whenever you’re ready</small></span>
              </button>
              <button type="button" className={`payment-option ${payment === "online" ? "selected" : ""} ${activeTarget === "online" ? "checkout-guided-active" : ""}`} aria-pressed={payment === "online"} onFocus={() => setActiveTarget("online")} onBlur={() => setActiveTarget(null)} onClick={() => setPayment("online")} onKeyDown={(event) => {
                if (event.key !== "Enter" || payment !== "online") return;
                event.preventDefault();
                guideTo(placeOrderRef.current, "place");
              }}>
                <span className="radio"/><span><strong>Pay online</strong><small>DEMO MODE — no payment will be collected</small></span>
              </button>
            </div>
          </div>
          <aside className="summary-card">
            <span className="eyebrow">THE GOOD STUFF</span>
            <h2>Your order<span className="gold">.</span></h2>
            {cart.length ? cart.map((line) => (
              <div className="summary-line" key={line.product.id}>
                <div>
                  <strong>{line.product.name}</strong>
                  <span><button onClick={() => change(line.product.id, -1)}>−</button> {line.quantity} <button onClick={() => change(line.product.id, 1)}>+</button></span>
                </div>
                <strong>{money(line.quantity * line.product.price)}</strong>
              </div>
            )) : <p>Your order is empty. Head back to the menu to add something.</p>}
            <div className="total-row"><span>Total</span><strong>{money(total)}</strong></div>
            <button
              ref={placeOrderRef}
              className={`button button-gold full ${activeTarget === "place" ? "checkout-guided-active" : ""}`}
              onFocus={() => setActiveTarget("place")}
              onBlur={() => setActiveTarget(null)}
              disabled={!cart.length || create.isPending}
              onClick={() => create.mutate(
                {
                  tableNumber: table,
                  customerName: name,
                  instructions,
                  paymentMethod: payment,
                  items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
                },
                {
                  onSuccess: (order) => {
                    if (order?.id) {
                      setTrackingId(order.id);
                      clear();
                      navigate(`/order/${order.id}?table=${table}&placed=1`);
                    }
                  },
                },
              )}
            >
              {create.isPending ? "Placing your order..." : "Place my order"} <IconArrowRight size={18}/>
            </button>
            {create.isError && <p className="error">Couldn’t place your order. Please try again.</p>}
            <p className="summary-foot">Made fresh, just for you. ♡</p>
          </aside>
        </div>
      </main>
      <Footer/>
      <CartDrawer table={table}/>
    </>
  );
}
export function Confirmation() {
  const table = useTable();
  const { id } = useParams();
  const { setTrackingId } = useContext(Cart);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOrderPlaced, setShowOrderPlaced] = useState(() => searchParams.get("placed") === "1");
  const order = useOrder(id ?? "");
  const status = order?.status ?? "Received";
  const step = status === "Ready" ? 2 : status === "Preparing" || status === "Accepted" ? 1 : 0;

  useEffect(() => {
    if (id) setTrackingId(id);
  }, [id]);

  useEffect(() => {
    if (searchParams.get("placed") !== "1") return;
    const timeout = window.setTimeout(() => {
      setShowOrderPlaced(false);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("placed");
      setSearchParams(nextParams, { replace: true });
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [searchParams, setSearchParams]);

  return (
    <>
      <Header table={order?.tableNumber ?? table} editable={false}/>
      <main className="confirmation">
        <div className="cup-illustration">
          <span className="chai-steam">♨</span><IconCoffee size={72} stroke={1}/><i aria-hidden="true">✳</i><i aria-hidden="true">·</i>
        </div>
        <span className="eyebrow">A LITTLE THANK-YOU FROM US</span>
        <h1>The counter<br/>was far.<br/><em>Your order<br/>wasn't.</em></h1>
        <p>No queue, no long walk, just a few taps from your cozy little corner.<br/><br/>Your order is on its way. Enjoy your time here!</p>
        {order ? (
          <div className="confirmation-card">
            <div className="confirm-meta">
              <div><span>ORDER NUMBER</span><strong>{orderNumber(order.id)}</strong></div>
              <div><span>YOUR TABLE</span><strong>Table {tableLabel(order.tableNumber)}</strong></div>
            </div>
            <div className="progress-steps">
              {["Order received", "Preparing", "Ready"].map((label, index) => (
                <div key={label} className={index <= step ? "done" : ""}>
                  <span>{index < step ? <IconCheck size={16}/> : index + 1}</span><small>{label}</small>
                </div>
              ))}
            </div>
            {status === "Ready" && <div className="ready-callout"><IconCheck size={18}/> Your order is ready. Please collect it at the counter.</div>}
            <div className="confirm-facts">
              <div><span>PAYMENT</span><strong>{order.paymentStatus}</strong></div>
              <div><span>ESTIMATED PREPARATION</span><strong>{order.status === "Ready" ? "Ready to collect now" : order.estimatedMinutes ? `About ${order.estimatedMinutes} minutes` : "The team is preparing your order"}</strong></div>
            </div>
            <div className="confirm-items">
              {order.items.map((item) => (
                <div key={item.id}><span>{item.quantity} × {item.name}</span><strong>{money(item.price * item.quantity)}</strong></div>
              ))}
              <div><strong>Order total</strong><strong>{money(order.total)}</strong></div>
            </div>
          </div>
        ) : <div className="confirmation-card">Looking up your order…</div>}
        <Link className="button button-gold full confirmation-menu-button" to={`/menu?table=${table}`}>
          Back to menu <IconArrowRight size={18}/>
        </Link>
      </main>
      <Footer/>
      <CartDrawer table={table}/>
      {showOrderPlaced && (
        <Sheet open={showOrderPlaced} onOpenChange={setShowOrderPlaced}>
          <SheetContent side="bottom" className="order-placed-sheet" showClose={false}>
            <SheetHeader className="order-placed-content">
              <span className="order-placed-check" aria-hidden="true"><IconCheck size={28}/></span>
              <SheetTitle className="order-placed-title">Your order is placed!</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
function StaffLogin({ configured, error }: { configured: boolean; error: boolean }) {
  return <main className="staff-login-page"><div className="staff-login-card"><Brand/><span className="eyebrow">STAFF ACCESS</span><h1>Good to see you<span className="gold">.</span></h1>{configured ? <><p>Enter the café staff password to manage orders.</p>{error && <div className="staff-login-error" role="alert">That password didn’t work. Please try again.</div>}<Form method="post" reloadDocument className="staff-login-form"><input type="hidden" name="intent" value="login"/><label htmlFor="staff-password">STAFF PASSWORD</label><input id="staff-password" name="password" type="password" autoComplete="current-password" required/><button className="button button-gold full" type="submit">Continue to orders <IconArrowRight size={17}/></button></Form></> : <div className="staff-setup-note">Staff access isn’t configured yet. An app administrator needs to set the <code>STAFF_PASSWORD</code> environment variable to a private password at least 16 characters long.</div>}<Link className="text-link" to="/">Back to the café</Link></div></main>;
}
export function Staff({ entryAuthorized }: { entryAuthorized: boolean }) {
  const dayPart = useDayPart("auto");
  const [searchParams] = useSearchParams();
  const access = useStaffAccess();
  const orderQuery = useStaffOrders(entryAuthorized && access.data?.authorized === true);
  const orders = orderQuery.data ?? [];
  const update = useActionMutation("update-order");
  const [filter, setFilter] = useState("Active");
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, string>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const seenOrderIds = useRef<Set<string> | null>(null);
  const shown = orders.filter((o) => filter === "All orders" || (filter === "Active" ? o.status !== "Ready" : o.status === "Ready"));

  useEffect(() => {
    if (!entryAuthorized || !orderQuery.data) {
      seenOrderIds.current = null;
      return;
    }

    const newOrders = orderQuery.data.filter((order) => !seenOrderIds.current?.has(order.id));
    const isInitialLoad = seenOrderIds.current === null;
    seenOrderIds.current = new Set(orderQuery.data.map((order) => order.id));
    if (isInitialLoad || newOrders.length === 0 || !soundEnabled) return;

    try {
      const context = audioContext.current ?? new window.AudioContext();
      audioContext.current = context;
      void context.resume().then(() => {
        newOrders.forEach((_, index) => playOrderClink(context, index * 0.25));
        setSoundBlocked(false);
      }).catch(() => setSoundBlocked(true));
    } catch {
      setSoundBlocked(true);
    }
  }, [entryAuthorized, orderQuery.data, soundEnabled]);

  function enableOrderSound() {
    setSoundEnabled(true);
    try {
      const context = audioContext.current ?? new window.AudioContext();
      audioContext.current = context;
      void context.resume().then(() => {
        playOrderClink(context);
        setSoundBlocked(false);
      }).catch(() => setSoundBlocked(true));
    } catch {
      setSoundBlocked(true);
    }
  }

  if (!entryAuthorized) {
    if (access.isError) return <main className="staff-login-page"><div className="staff-login-card" role="alert">Couldn’t verify staff access. Refresh to try again.</div></main>;
    if (!access.data) return <main className="staff-login-page"><div className="staff-login-card">Checking staff access…</div></main>;
    return <StaffLogin configured={access.data.configured} error={searchParams.get("error") === "1"}/>;
  }
  if (access.isError) return <main className="staff-login-page"><div className="staff-login-card" role="alert">Couldn’t verify staff access. Refresh to try again.</div></main>;
  if (!access.data) return <main className="staff-login-page"><div className="staff-login-card">Checking staff access…</div></main>;
  if (!access.data.authorized) return <StaffLogin configured={access.data.configured} error={searchParams.get("error") === "1"}/>;
  return (
    <div className="staff-page">
      <header className="staff-header">
        <Brand light />
        <div>
          <span className="staff-label">STAFF DASHBOARD</span>
          <button
            className="staff-logout"
            type="button"
            aria-pressed={soundEnabled}
            onClick={() => soundEnabled && !soundBlocked ? setSoundEnabled(false) : enableOrderSound()}
          >
            {soundBlocked ? "Enable sound" : soundEnabled ? "Mute sound" : "Enable sound"}
          </button>
          <Form method="post" reloadDocument>
            <input type="hidden" name="intent" value="logout" />
            <button className="staff-logout" type="submit">Sign out</button>
          </Form>
          <Link to="/">View customer site <IconArrowRight size={15} /></Link>
        </div>
      </header>
      <main className="staff-main">
        <div className="staff-top">
          <div>
            <span className="eyebrow">THE HEART OF AFTER HOURS</span>
            <h1>
              {dayPart === "morning" ? "Morning" : dayPart === "afternoon" ? "Afternoon" : "Evening"}, team
              <span className="gold">.</span>
            </h1>
            <p>Here’s what’s happening at the café.</p>
          </div>
          <div className="staff-live"><span className="table-dot" /> LIVE ORDERS</div>
        </div>
        <div className="staff-toolbar">
          <div className="staff-tabs">
            {["Active", "Ready", "All orders"].map((value) => (
              <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>
                {value}
              </button>
            ))}
          </div>
          <span>{shown.length} {shown.length === 1 ? "ORDER" : "ORDERS"}</span>
        </div>
        {shown.length === 0 ? (
          <div className="staff-empty">
            <IconCoffee size={42} stroke={1} />
            <h2>All caught up.</h2>
            <p>New orders will appear here when they come in.</p>
          </div>
        ) : (
          <div className="order-grid">
            {shown.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card-top">
                  <div>
                    <span className="eyebrow">{orderNumber(order.id)}</span>
                    <h2>Table {tableLabel(order.tableNumber)}</h2>
                  </div>
                  <span className={`status status-${order.status.toLowerCase()}`}>
                    {order.status === "Ready" ? "Ready for collection" : order.status}
                  </span>
                </div>
                <div className="order-time">
                  <IconClock size={15} />
                  {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {order.customerName && ` · ${order.customerName}`}
                </div>
                <div className="staff-items">
                  {order.items.map((item) => (
                    <div key={item.id}>
                      <span><b>{item.quantity}×</b> {item.name}</span>
                      <span>{money(item.quantity * item.price)}</span>
                    </div>
                  ))}
                </div>
                {order.instructions && <div className="instructions"><strong>NOTE</strong> {order.instructions}</div>}
                <div className="staff-payment">
                  <span>{order.paymentMethod === "counter" ? "Pay at counter" : "Online · DEMO MODE"}</span>
                  <strong>{order.paymentStatus}</strong>
                </div>
                <div className="staff-estimate">
                  <label htmlFor={`estimate-${order.id}`}>PREP ESTIMATE <span>MINUTES</span></label>
                  <div>
                    <input
                      id={`estimate-${order.id}`}
                      type="number"
                      min="1"
                      max="240"
                      step="1"
                      placeholder="e.g. 15"
                      value={estimateDrafts[order.id] ?? order.estimatedMinutes?.toString() ?? ""}
                      onChange={(event) => setEstimateDrafts((current) => ({ ...current, [order.id]: event.target.value }))}
                    />
                    <button
                      type="button"
                      disabled={update.isPending || !/^[0-9]+$/.test(estimateDrafts[order.id] ?? order.estimatedMinutes?.toString() ?? "") || Number(estimateDrafts[order.id] ?? order.estimatedMinutes) < 1 || Number(estimateDrafts[order.id] ?? order.estimatedMinutes) > 240}
                      onClick={() => update.mutate({ id: order.id, estimatedMinutes: Number(estimateDrafts[order.id] ?? order.estimatedMinutes) })}
                    >
                      Save estimate
                    </button>
                  </div>
                </div>
                {order.status !== "Ready" && (
                  <button
                    className="button button-gold full"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: order.id, status: order.status === "Received" ? "Accepted" : order.status === "Accepted" ? "Preparing" : "Ready" })}
                  >
                    {order.status === "Received" ? "Accept order" : order.status === "Accepted" ? "Start preparing" : "Mark ready"}
                    <IconArrowRight size={17} />
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export function StaffDailyReport({ entryAuthorized }: { entryAuthorized: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [today] = useState(getCafeDate);
  const date = isValidReportDate(searchParams.get("date")) ? searchParams.get("date")! : today;
  const access = useStaffAccess();
  const report = useActionQuery(
    "get-daily-report",
    { date },
    { enabled: access.data?.authorized === true, retry: false },
  );
  if (!entryAuthorized || access.isError || !access.data?.authorized) return null;

  return (
    <section className="daily-report" data-daily-report-print aria-labelledby="daily-report-title">
      <header className="daily-report-heading">
        <div>
          <span className="eyebrow">DAILY REPORT · ASIA/KOLKATA</span>
          <h2 id="daily-report-title">Orders by day<span className="gold">.</span></h2>
        </div>
        <div className="daily-report-controls" data-print-hide>
          <label htmlFor="daily-report-date">REPORT DATE</label>
          <input
            id="daily-report-date"
            type="date"
            value={date}
            max={today}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value === today) next.delete("date");
              else next.set("date", event.target.value);
              setSearchParams(next, { replace: true });
            }}
          />
          <button type="button" disabled={!report.data} onClick={() => report.data && downloadDailyReportCsv(report.data)}>
            Download Excel CSV
          </button>
          <button type="button" disabled={!report.data} onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </header>
      {report.isLoading ? (
        <p className="daily-report-message">Loading this day’s orders…</p>
      ) : report.isError ? (
        <p className="daily-report-message daily-report-error" role="alert">
          {actionErrorMessage(report.error) ?? "Couldn’t load the daily report. Please try again."}
        </p>
      ) : report.data ? (
        <>
          <div className="daily-report-stats">
            <div><span>ORDERS</span><strong>{report.data.orderCount}</strong></div>
            <div><span>ITEMS SOLD</span><strong>{report.data.totalItems}</strong></div>
            <div><span>ORDER VALUE</span><strong>{money(report.data.totalOrderValue)}</strong></div>
            <div><span>DUE AT COUNTER</span><strong>{money(report.data.counterDueValue)}</strong></div>
            <div><span>ONLINE · UNPAID</span><strong>{money(report.data.onlineUnpaidValue)}</strong></div>
          </div>
          <p className="daily-report-note">
            Order value is not a record of money collected. Online payments are demo-only and are not processed.
          </p>
          <div className="daily-report-section">
            <h3>Items sold</h3>
            {report.data.itemTotals.length ? (
              <div className="daily-report-table-wrap">
                <table className="daily-report-table">
                  <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Item total</th></tr></thead>
                  <tbody>{report.data.itemTotals.map((item) => (
                    <tr key={`${item.name}-${item.unitPrice}`}>
                      <td>{item.name}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.lineTotal)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="daily-report-message">No orders were placed on this date.</p>}
          </div>
          <div className="daily-report-section">
            <h3>Order details</h3>
            {report.data.orders.length ? report.data.orders.map((order) => (
              <article className="daily-report-order" key={order.id}>
                <div className="daily-report-order-heading">
                  <div><strong>{orderNumber(order.id)}</strong><span>Table {tableLabel(order.tableNumber)} · {formatReportTime(order.createdAt, report.data!.timezone)}</span></div>
                  <strong>{money(order.total)}</strong>
                </div>
                {order.customerName && <p className="daily-report-customer">{order.customerName}</p>}
                <div className="daily-report-lines">
                  {order.items.map((item) => (
                    <div key={item.id}>
                      <span>{item.quantity} × {item.name} <small>({money(item.price)} each)</small></span>
                      <strong>{money(item.lineTotal)}</strong>
                    </div>
                  ))}
                </div>
                <div className="daily-report-payment">
                  <span>{order.status} · {order.paymentMethod === "counter" ? "Pay at counter" : "Online"}</span>
                  <strong>{order.paymentStatus}</strong>
                </div>
              </article>
            )) : <p className="daily-report-message">No orders were placed on this date.</p>}
          </div>
        </>
      ) : null}
    </section>
  );
}
