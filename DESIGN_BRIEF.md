# Design Brief: "Exchange Center" — Currency Exchange Back-Office & Teller Workstation

Design a complete UI/UX for a professional currency-exchange desk application. It is used by tellers and managers at a money-exchange business to process customer transactions, monitor live FX rates from multiple sources, and configure the shop's pricing (spreads, per-customer fees, destination commissions). Think **Bloomberg-terminal / trading-desk aesthetic**: dark theme by default (with a light theme option), dense data tables, monospaced numbers everywhere, pulsing "live" indicators, compact professional layout — a tool for power users, not a consumer app.

---

## 1. Users & Context

- **Primary user:** a teller at an exchange counter, processing walk-in customer transactions quickly.
- **Secondary user:** a manager configuring rates, spreads, fees, and customer tiers.
- Single-user desktop web app (no auth screens needed). The current user is shown in the sidebar footer (avatar, name, branch name).
- Data-dense and number-first: every rate, amount, timestamp, and ID renders in a monospace font.

## 2. Core Domain Concept — The 4-Layer Pricing Engine

This is the heart of the app and must be understood to design it well. The final price a customer gets is built from four layers:

1. **Store mid-rate** — a base exchange rate per currency pair. It can come from four modes: `AUTO AVG` (average of all connected rate sources), `MANUAL SOURCE` (pinned to the live feed, betaserver), `CUSTOM VALUE` (manually typed rate), or `LOCKED` (frozen).
2. **Spread** — turns the mid into a bid (shop buys) and ask (shop sells). Configurable per pair as **Percentage or Fixed amount**, and **Symmetric** (one value split evenly around mid) or **Asymmetric** (separate Buy margin and Sell margin).
3. **Customer level points** — every customer has a **1–5 star level**; per pair and per star level, an extra fee ("points", percentage or fixed) widens the rate. Higher-star (VIP) customers get lower fees.
4. **Destination commission** — an optional receiving destination (e.g. a payout agent/city) with its own percentage or fixed commission deducted from the payout.

Plus **per-pair rounding** (configurable decimal places; bid rounds down, ask rounds up — always in the house's favor).

Visual grammar used consistently everywhere: **bid = green, ask = amber/yellow, mid = neutral/muted**. Star levels render as amber stars ★★★☆☆.

## 3. App Shell

- **Left sidebar (fixed ~228px):**
  - Brand block: blue glowing rounded logo, app name "Exchange Center", subtitle "ENTERPRISE EDITION".
  - Nav items (icon + label; active = filled blue with glow): Dashboard, Live Rates, Transactions, Customers, Level Points, Destinations.
  - A divider, then two **feature-toggled** items that only appear if enabled in Settings: Settlement Terms, Margins.
  - Pinned at bottom: Settings link, then a user panel (avatar initials, user name, branch).
- **Top header (~52px):**
  - Left: API/WebSocket connection status — green dot with animated ping + "API: Connected", or yellow "API: Connecting…".
  - Right: large live monospace clock (HH:MM:SS, 24h) with date below; a refresh-rates icon button (spins while fetching); a light/dark theme toggle (sun/moon).
- **Disconnected banner:** when the realtime connection drops, a full-width red alert bar appears above the header: "API Disconnected — Live rates are unavailable. Showing cached data."
- **Toasts:** bottom-right stack, 4 types (success / error / warning / info) with colored left border and icon, auto-dismiss.

## 4. Pages

### 4.1 Dashboard (default page) — the Teller Workstation

Purpose: process a customer exchange in seconds. The centerpiece is a bidirectional currency calculator.

**"Currency Exchange" card:**
- Header shows an auto-generated transaction reference (e.g. `TR-48213`).
- **Customer selector:** a searchable dropdown (search by name or ID). Selected state shows the customer's star level inline: `★★★☆☆ Ahmad Kassem (CUST-1042)`. Required field with inline validation.
- **Conversion row:** two large amount inputs — "Customer Pays" and "Customer Receives" — each paired with a currency dropdown (colored 2-letter currency chip + code). A circular glowing **swap button** between them flips direction. The user can type in *either* field; the other becomes the computed output (shown in green). Editing/focusing the computed side makes it editable.
- **Destination selector (optional):** dropdown listing destinations with their commission ("Beirut Office — 1.5%"), plus a "No destination" option.
- **Rate breakdown panel (3 rows):**
  - Market rate (mid), shown bidirectionally: `1 USD = 0.9245 EUR | 1 EUR = 1.0817 USD`, plus a spread summary chip (e.g. `2%`, `0.5 fix`, or `B:1% / S:2%` for asymmetric) and an amber chip showing applied level points (`Lvl 3★ pts: 0.5%`).
  - Customer bid rate (green).
  - Customer ask rate (amber).
- **Actions:** "Clear" (outline, resets form) and "Process Transaction" (primary; on success flips to a green "Transaction Submitted!" state for a moment + success toast).
- Validation: amount must be > 0 and ≤ 1,000,000; currencies must differ; customer required.

**"Live Exchange Rates" card** below/beside: a compact list of pairs, each row showing pair name, mid rate, and bid | ask (green | amber) with a spread sub-label. Header has a pulsing green "Live" dot.

### 4.2 Live Rates — Multi-Source Comparison Board

Purpose: the manager's rate-control center. Compare rates across sources and configure store rate + spread + rounding per pair, all inline in one table.

- **Toolbar:** base currency select (USD, EUR, BRL, CNY, PYG, USDT, AED, ARS), pair search box, an "Auto Sync" toggle switch (polls every 30s), and a Refresh button.
- **4 KPI stat cards:** Network Latency (ms, labeled Excellent/Moderate/Slow), Market Stability (%, Stable/Moderate/Volatile), Sources Connected (n/total with per-source status dots), Global Avg Drift (% + count of locked/custom pairs).
- **Main comparison table** — one row per currency pair, columns:
  - Pair (sticky left column: code + currency name)
  - One column **per rate source** (header shows status dot + source name + latency in ms or "offline"); cells show the source's mid; **outlier values render red with strikethrough**.
  - **Store Rate:** bold mid + a mode dropdown (badge-styled: "Auto (Avg)", "Source (betaserver)" blue, "Custom" purple) offering "Use Source Rate" or a custom-value input with a Set button.
  - **Spread:** inline editor — a select with 4 options (% Sym / % Asym / Fix Sym / Fix Asym) and either one value input or two (B/S) for asymmetric.
  - **Bid / Ask:** computed, formatted to the pair's rounding.
  - **Rounding:** small numeric input (0–8 decimal places).
  - **Action:** Save button, enabled only when the row is dirty; flashes a green "Saved ✓" state.
  - **Updated:** date + time of last change.
- Rows **flash briefly** when their rate changes. Table shows shimmer skeleton rows on first load, a blur/spinner overlay while syncing, and a "Connection Error + Retry" card on failure. Gold is included (XAU per troy oz and XAUG per gram).
- Footer: a legend explaining spread modes, and a "System Health" bar (gradient progress bar driven by market stability, with latency and source counts).

### 4.3 Transactions — Ledger

Purpose: searchable, filterable history of all trades.

- Header: title + pulsing "LIVE FEED" badge + "{n} transactions found"; quick stats for the current page (Completed count, Pending count, total Volume $).
- **Filter bar:** free-text search (receipt ID / customer / pair), a date-range popover (From/To date pickers + clear), a status dropdown (ALL / COMPLETED / PENDING / FAILED / CANCELLED with colored dots), and an Export Report button.
- **Table columns:** Receipt ID (`#TX-99271`, mono) · Date & Time (two lines) · Customer (colored initials avatar + name) · Type badge (BUY green / SELL yellow / SWAP blue) · Pair (USD ⇄ EUR with swap icon) · Amount In (mono + currency code) · Amount Out (green mono + code) · Rate applied · Status pill (colored dot + label).
- Server-side pagination (10/page): "Showing 1–10 of 314", first/prev/numbered/next/last controls with ellipsis.
- Bottom bar: a "Daily Limit" progress meter and an "Export CSV" button.
- States: skeleton rows while loading; "No transactions match your filters" empty state.

### 4.4 Customers — Directory (mini-CRM)

- Header: "Customer Directory" + pulsing "Live Database" dot; "Add New Customer" primary button.
- **KPI cards:** Total Customers; Average Level (number + star rating visual).
- **Toolbar:** search (name / ID / phone / email), "Upload by Excel" (bulk import .xlsx), "Download template", Export.
- **Table:** Customer (colored initials avatar + name + `#CUST-1042`) · Phone · Email · Level (1–5 amber stars). Clicking a row opens a detail drawer; selected row gets a left accent border.
- **Add / Edit modal:** Full Name (required), Phone, Email (validated), Level picked by clicking stars (default 3). Inline field errors.
- **Detail drawer** (slides in from the right, ~380px): large avatar, name, ID, big star rating; contact info cards; "Member since" date; Edit and Delete actions (delete uses an inline confirm step).
- Excel import reports how many were created and any row errors via toast.

### 4.5 Level Points — Star-Tier Fee Configuration

Purpose: set the extra fee per currency pair per customer star level.

- One table: rows = currency pairs; columns = Pair · Type select (% or Fixed, showing a "RAW" unit tag when fixed) · five columns, one per star level (headers `★ (1)` through `★★★★★ (5)`), each a small numeric input with a %/raw suffix · Save action per row (dirty-tracking, "Saved ✓" feedback).
- Footer legend (info style, amber): explains percentage vs fixed, that higher stars = VIP = lower fees, and 0 = no fee.

### 4.6 Destinations — Payout Destinations & Commissions

- **Add card:** inline form row — Name, Commission value, Type (% / Fixed), Add button.
- **Table:** Name · Commission (`1.5%` or `2 raw`) · Type · Actions (edit / delete). Editing happens **inline in the row** (inputs replace text, save/cancel icon buttons, Enter/Escape shortcuts).
- Empty state: "No destinations configured yet. Add one above."

### 4.7 Settings

Narrow single-column page (max ~2xl width), three cards:
1. **Currencies:** manage the currency list — add form (Code, Name, Symbol, and a color picker of ~15 swatches used for currency avatar chips), reorder rows with up/down arrows (revealed on hover), delete. Each row shows its sort index, colored avatar, code, name, symbol.
2. **Live Rates:** a "Live Rate Fetching" master toggle (status pill Active green / Paused yellow — pausing stops all external API calls but keeps cached rates) and a "Fetch Now" one-shot button.
3. **Sidebar Sections:** toggles to show/hide the "Settlement Terms" and "Margins" nav items.

### 4.8 Settlement Terms & 4.9 Margins — "Coming Soon" placeholders

Centered icon, title, one descriptive line, and a blue "Coming Soon" pill.
- Settlement Terms: will configure settlement timing (Today / Tomorrow / Next Week / Next Month) with rate adjustments.
- Margins: will configure fee tiers by amount ranges (e.g. $1–$10,000 at 1%).

## 5. Real-Time & System Behaviors (design for these states)

- Rates stream over WebSocket (updates every ~3s when live); the multi-source board refreshes every 30s on auto-sync. UI needs live indicators, subtle row-flash on change, and a clear stale/cached state when disconnected.
- Rate sources can be **online / stale / offline** (status dots: green pinging / yellow / red) and individual quotes can be flagged **outliers** (excluded from the average, shown struck-through red).
- Every list needs: shimmer/skeleton loading state, empty state, and error + retry state.
- Dirty-state editing pattern: inline edits enable a Save button, saving shows brief "Saved ✓" confirmation.
- Currencies include fiat (USD, EUR, BRL, CNY, PYG, AED, ARS), crypto-stable (USDT), and gold (XAU troy-ounce, XAUG gram).

## 6. Visual Direction

- Dark terminal theme (near-black background, elevated card surfaces, hairline borders) + a full light-theme variant.
- Accent: electric blue with a soft glow on primary/active elements; purple as a secondary accent (e.g. "Custom" mode badge).
- Status palette: green (positive/bid/online/completed), amber (ask/pending/stale/stars), red (errors/offline/failed/outliers), blue (info/swap).
- Monospace for all numeric data; tiny uppercase tracked labels for table headers and metadata; high density (compact rows, small type) while staying readable.
- Micro-animations: pulsing live dots, ping rings on status dots, row flash on rate change, shimmer skeletons, slide-in drawer, spinning refresh icons.

**Deliverable:** design the full application — app shell plus all nine pages, including their loading/empty/error states, the modals (add/edit customer), the customer detail drawer, dropdown/popover patterns, toast system, and both dark and light themes.
