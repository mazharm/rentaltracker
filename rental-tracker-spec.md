# RentalTracker — Spec v1.2

> A rental income and expense tracking SPA for a solo landlord managing multiple properties, with TurboTax-aligned P&L reporting and OneDrive-backed persistence.

---

## 1. Goals & Constraints

| Dimension | Decision |
|-----------|----------|
| **User** | Solo landlord (Mazhar), 1–10 rental properties |
| **Hosting** | GitHub Pages — pure SPA, no server |
| **Persistence** | OneDrive (MSA auth via MSAL.js) — JSON files |
| **Design System** | Fluent UI v9 (`@fluentui/react-components`) |
| **Bundler** | Vite + React 18 + TypeScript |
| **Auth** | MSAL.js 2.x — Microsoft Account (MSA) for OneDrive Graph API |
| **Reporting** | Schedule E (Form 1040) aligned P&L, exportable as CSV |
| **Archive** | Timestamped snapshots before every write to prevent corruption |
| **Responsive** | Full functionality on desktop and mobile (iPhone 16 Pro target) |

---

## 2. Data Model

All data lives in a single OneDrive app folder: `Apps/RentalTracker/`.

### 2.1 File Layout

```
Apps/RentalTracker/
├── config.json          # Global config: properties, recurring expense templates
├── data/
│   ├── 2025.json        # Year file: all transactions for 2025
│   ├── 2026.json
│   └── ...
└── archives/
    ├── config_2025-03-14T10-30-00Z.json
    ├── 2025_2025-03-14T10-30-00Z.json
    └── ...
```

### 2.2 `config.json`

```typescript
interface Config {
  version: 1;
  properties: Property[];
  recurringExpenseTemplates: RecurringExpenseTemplate[];
}

interface Property {
  id: string;                  // UUID
  name: string;                // e.g., "123 Elm St"
  address: string;
  monthlyRent: number;         // Current monthly rent amount
  rentStartDate: string;       // ISO date — when rent accrual begins
  propertyTax: {
    annualAmount: number;
    dueMonth: number;          // 1-12, month property tax is due/paid
  };
  deposit: {
    amount: number;
    receivedDate: string;      // ISO date
    refundedDate?: string;     // ISO date, null if still held
    refundAmount?: number;     // Partial refund support
  } | null;
  status: "active" | "inactive";  // Inactive = sold/removed
}

interface RecurringExpenseTemplate {
  id: string;                  // UUID
  name: string;                // e.g., "Landscaping"
  frequency: "monthly" | "quarterly" | "semi-annual" | "annual";
  amount: number;
  appliesToPropertyIds: string[] | "all";  // Specific property IDs, or "all" for every property
  category: ExpenseCategory;
  startDate: string;           // ISO date
  endDate?: string;            // Optional — null means ongoing
}

type ExpenseCategory =
  | "landscaping"
  | "roof_cleaning"
  | "appliance_insurance"
  | "property_insurance"
  | "property_tax"
  | "repairs_maintenance"
  | "utilities"
  | "management_fees"
  | "legal_professional"
  | "advertising"
  | "other";
```

### 2.3 `data/{year}.json`

```typescript
interface YearData {
  version: 1;
  year: number;
  rentEntries: RentEntry[];
  expenseEntries: ExpenseEntry[];
}

interface RentEntry {
  id: string;                  // UUID
  propertyId: string;
  month: number;               // 1-12
  year: number;
  expectedAmount: number;      // From config at time of accrual
  actualAmount: number;        // Same as expected unless overridden
  status: "accrued" | "received" | "vacant" | "partial" | "deposit_retained";
  overrideReason?: string;     // e.g., "Vacant — tenant moved out Feb 15"
  receivedDate?: string;       // ISO date of actual payment
  notes?: string;
}

interface ExpenseEntry {
  id: string;                  // UUID
  propertyId: string;
  date: string;                // ISO date
  amount: number;
  category: ExpenseCategory;
  description: string;
  recurringTemplateId?: string;   // Links to template if auto-generated
  isOneTime: boolean;             // True for repair/maintenance entries
  receipt?: {
    fileName: string;             // Stored in OneDrive: Apps/RentalTracker/receipts/
    oneDrivePath: string;
  };
  notes?: string;
}

interface ScheduleEReport {
  year: number;
  properties: ScheduleEPropertyReport[];
  totals: ScheduleELineItems;
}

interface ScheduleEPropertyReport {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  lineItems: ScheduleELineItems;
  netIncome: number;           // Line 3 total minus total expenses
}

interface ScheduleELineItems {
  rentsReceived: number;       // Line 3
  advertising: number;         // Line 5
  cleaningMaintenance: number; // Line 7
  insurance: number;           // Line 9
  legalProfessional: number;   // Line 10
  managementFees: number;      // Line 12
  taxes: number;               // Line 16
  utilities: number;           // Line 17
  otherExpenses: number;       // Line 19
  totalExpenses: number;
}
```

### 2.4 Deposit Tracking

Deposits are tracked at the property level in `config.json` (see `Property.deposit`). They are **not** income or expense until refund occurs:

- **Deposit received**: Recorded on property config. Not P&L income.
- **Deposit refunded (full)**: No P&L impact — liability returned.
- **Deposit retained (partial/full)**: The retained portion becomes income in the year retained. A synthetic rent entry is added to the year file with:
  - `status: "deposit_retained"`
  - `month`: the month the deposit was retained
  - `expectedAmount: 0` (no rent was expected — this is deposit income)
  - `actualAmount`: the retained amount
  - `notes`: auto-populated with deposit context (e.g., "Deposit retained — tenant moved out")

---

## 3. Rent Accrual Engine

### 3.1 Auto-Accrual Logic

On app load (and on-demand), the system generates `RentEntry` records for all months between `rentStartDate` and the current month for each active property.

```
for each active property:
  for each month from rentStartDate to currentMonth:
    if no RentEntry exists for (propertyId, month, year):
      create RentEntry {
        expectedAmount: property.monthlyRent,
        actualAmount: property.monthlyRent,
        status: "accrued"
      }
```

### 3.2 Vacancy Overrides

User can override any month:
- Set `status: "vacant"` → `actualAmount: 0`
- Set `status: "partial"` → `actualAmount: <user-specified>`
- Optionally provide `overrideReason`

### 3.3 Rent Changes

When `monthlyRent` is updated on a property, only **future** unmodified entries are affected. An entry is considered "modified" if the user has changed its `status`, `actualAmount`, or `overrideReason` from the auto-accrued defaults (i.e., any entry with status other than `"accrued"`, or whose `actualAmount` differs from `expectedAmount`). Past entries retain their original `expectedAmount`. The config stores only the current rent; historical rent is preserved in the year data entries.

---

## 4. Recurring Expense Engine

### 4.1 Auto-Generation

Similar to rent accrual, recurring expenses are materialized into `ExpenseEntry` records. Once materialized, expense entries are **immutable snapshots** — if a template's amount changes later, only newly generated entries use the updated amount. Existing entries retain their original values and can be edited individually.

```
for each active template:
  for each due date from startDate to currentDate (per frequency):
    if no ExpenseEntry exists with matching (templateId, propertyId, date):
      create ExpenseEntry {
        amount: template.amount,
        category: template.category,
        recurringTemplateId: template.id,
        isOneTime: false
      }
```

**Frequency mapping:**

| Frequency | Due dates |
|-----------|-----------|
| monthly | 1st of each month |
| quarterly | Jan 1, Apr 1, Jul 1, Oct 1 |
| semi-annual | Jan 1, Jul 1 |
| annual | Anniversary of `startDate` (month/day) |

### 4.2 Pre-Built Templates

On first run, seed these templates (user can modify/delete):

| Name | Frequency | Default Amount | Category |
|------|-----------|---------------|----------|
| Landscaping | monthly | 0 (user sets) | `landscaping` |
| Roof Cleaning | annual | 0 (user sets) | `roof_cleaning` |
| Appliance Insurance | monthly | 0 (user sets) | `appliance_insurance` |
| Property Insurance | annual | 0 (user sets) | `property_insurance` |

### 4.3 Property Tax

Property tax is handled as a special recurring expense auto-generated from `property.propertyTax`:
- One `ExpenseEntry` per year per property
- Date: `{year}-{dueMonth}-01`
- Category: `property_tax`
- Amount: `property.propertyTax.annualAmount`
- `isOneTime: false`
- `recurringTemplateId`: not set (no template — generated directly from property config)
- `description`: auto-populated as `"Property tax — {property.name}"`
- **Dedup check**: `(propertyId, category: "property_tax", year)` — skip if an entry already exists for that property and year

---

## 5. One-Time Expenses (Repairs & Maintenance)

Manual entry form:
- Property (dropdown)
- Date
- Amount
- Category (defaults to `repairs_maintenance`, but selectable)
- Description (required — e.g., "Replace water heater")
- Notes (optional)
- Receipt upload (optional — stored in OneDrive `receipts/` folder)

These entries have `isOneTime: true` and no `recurringTemplateId`.

---

## 6. P&L Report — TurboTax Schedule E Alignment

### 6.1 Report Structure

The report maps directly to **IRS Schedule E (Form 1040), Part I** line items.

**Per property, per year:**

| Schedule E Line | Field | Source |
|----------------|-------|--------|
| 3 | Rents received | Sum of `rentEntries` where `status != "vacant"` |
| 5 | Advertising | Expenses with `category: "advertising"` |
| 7 | Cleaning and maintenance | `landscaping` + `roof_cleaning` + `repairs_maintenance` |
| 9 | Insurance | `appliance_insurance` + `property_insurance` |
| 10 | Legal and professional fees | `legal_professional` |
| 12 | Management fees | `management_fees` |
| 16 | Taxes | `property_tax` |
| 17 | Utilities | `utilities` |
| 19 | Other expenses | `other` |
| — | Deposit retained (if any) | Added to Line 3 as income |

**Note:** Lines not listed (4, 6, 8, 11, 13-15, 18) are out of scope for v1 (depreciation, mortgage interest, travel, etc.). The report should include placeholders/zeros for these so the user can fill them manually.

### 6.2 Export Format

**CSV export** with the following structure:

```csv
Property,Address,Line,Description,Amount
"123 Elm St","123 Elm St, Kirkland WA","3","Rents received",36000.00
"123 Elm St","123 Elm St, Kirkland WA","5","Advertising",0.00
"123 Elm St","123 Elm St, Kirkland WA","7","Cleaning and maintenance",4200.00
...
```

Also produce a **human-readable summary** (displayed in-app) with totals and net income per property.

### 6.3 Report Generation

- User selects tax year from dropdown
- "Generate Report" button produces both the in-app summary and downloadable CSV
- Report runs on-demand, not pre-computed

---

## 7. OneDrive Integration

### 7.1 Authentication

Use **MSAL.js 2.x** (`@azure/msal-browser`) with:

| Setting | Value |
|---------|-------|
| Auth flow | Authorization Code + PKCE (SPA) |
| Scopes | `User.Read`, `Files.ReadWrite.AppFolder` |
| Redirect URI | GitHub Pages URL |
| Authority | `https://login.microsoftonline.com/consumers` (MSA only) |

**App Registration:**
- Register in Azure Portal → App registrations
- Platform: SPA
- Redirect URI: `https://<username>.github.io/rental-tracker/`
- Supported account types: Personal Microsoft accounts only

### 7.2 OneDrive Operations

All file operations use Microsoft Graph API:

```
GET  /me/drive/special/approot:/{path}:/content     # Read file
PUT  /me/drive/special/approot:/{path}:/content      # Write file
GET  /me/drive/special/approot:/{path}:/children     # List folder
DELETE /me/drive/special/approot:/{path}:/content     # Delete (archives only)
```

### 7.3 Archive Strategy

**Before every write operation:**

1. Read current file from OneDrive
2. Write archive copy: `archives/{filename}_{ISO-timestamp}.json`
3. Write updated file to primary location
4. Prune archives older than 90 days (keep at least 10 most recent per file)

**Archive naming:** `config_2025-03-14T10-30-00Z.json`

### 7.4 Offline / Error Handling

- On auth failure: Show sign-in prompt, cache nothing sensitive
- On write failure: Retry once, then show error with "Retry" / "Download JSON" fallback
- On read failure: Show cached data if available (use `sessionStorage` for current session only)
- Conflict detection: Compare `eTag` on read vs. write; warn if file changed externally

---

## 8. UI Design

### 8.1 Design Language

**Fluent UI v9** with a clean, utilitarian aesthetic. This is a financial tool — clarity over flair.

- **Theme:** Light mode default, with Fluent's built-in dark mode toggle
- **Typography:** Fluent's default Segoe UI stack
- **Layout:** Fixed sidebar nav + scrollable content area (desktop); bottom tab bar + full-width content (mobile)
- **Density:** Compact on desktop; comfortable touch targets on mobile (minimum 44x44px)

### 8.2 Page Structure — Desktop (>=768px)

```
┌─────────────────────────────────────────────────┐
│  RentalTracker              [User] [Settings] ⚙ │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Dashboard│   << Content Area >>                 │
│          │                                      │
│ Properties                                      │
│          │                                      │
│ Income   │                                      │
│          │                                      │
│ Expenses │                                      │
│          │                                      │
│ Reports  │                                      │
│          │                                      │
│ ── ── ── │                                      │
│ Settings │                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### 8.3 Page Structure — Mobile (<768px)

```
┌──────────────────────────┐
│  RentalTracker        ⚙  │
├──────────────────────────┤
│                          │
│                          │
│   << Content Area >>     │
│   (full width)           │
│                          │
│                          │
│                          │
├──────────────────────────┤
│ 🏠  💰  📋  📊  ⚙      │
│ Home Inc  Exp  Rpt Set   │
└──────────────────────────┘
```

- Sidebar collapses to a bottom tab bar with icons and short labels
- Properties page is accessible from Dashboard (no dedicated tab — save tab space)
- Content area is full-width with appropriate padding
- All forms open as full-screen overlays instead of side drawers

### 8.4 Responsive Breakpoints

| Breakpoint | Width | Layout |
|-----------|-------|--------|
| **Mobile** | <768px | Bottom tab bar, stacked cards, full-screen forms, horizontally scrollable grids |
| **Desktop** | >=768px | Sidebar nav, side-panel drawers, full data tables |

### 8.5 Per-Page Responsive Behavior

#### Dashboard
- **Desktop**: Summary cards in a 2x2 or 4-column grid; property mini-cards in rows
- **Mobile**: Summary cards stack vertically (full width); property cards stack as a scrollable list; quick actions become a sticky FAB (floating action button) or action sheet

#### Properties
- **Desktop**: Sortable data table with all columns visible; Drawer for add/edit
- **Mobile**: Card list (one card per property showing name, rent, status); tap card to open full-screen edit form; swipe or long-press for actions (deactivate)

#### Income (Rent Grid)
- **Desktop**: Full 12-column grid (properties x months) with inline cell editing
- **Mobile**: Property selector dropdown at top; single-property view showing months as a vertical list (one row per month with amount, status, and tap-to-edit); swipe left/right to switch properties

#### Expenses
- **Desktop**: Tabbed data table with filters and inline actions
- **Mobile**: Tabs remain; each tab shows a card-based list; filters collapse into a filter sheet (bottom drawer); "Add Expense" as a FAB

#### Reports
- **Desktop**: Full Schedule E table with expandable per-property sections
- **Mobile**: Accordion-style per-property sections; each section shows line items as a simple key-value list; "Download CSV" button remains prominent at top

#### Settings
- **Desktop**: Sectioned form layout with side-by-side fields
- **Mobile**: Single-column stacked form; sections collapsible

### 8.6 Pages

#### Dashboard
- **Summary cards**: Total income YTD, Total expenses YTD, Net income YTD, Vacancy rate
- **Per-property mini cards**: Name, monthly rent, status, last payment
- **Quick actions**: "Add expense", "Mark vacant", "Generate report"

#### Properties
- **Property list**: Sortable table with name, address, rent, status, deposit info
- **Add/Edit property**: Side panel (Fluent `Drawer`) on desktop, full-screen overlay on mobile, with form fields matching `Property` interface
- **Deposit management**: Within property edit — record deposit, record refund (full/partial)

#### Income
- **Rent grid**: Rows = properties, Columns = months (Jan–Dec)
- Each cell shows: amount, status badge (accrued/received/vacant/partial)
- Click cell → edit overlay for override
- Year selector at top
- **Totals row** at bottom

#### Expenses
- **Tabs**: "Recurring" | "One-Time" | "All"
- **Recurring tab**: Table of active templates with edit/delete. "Add Template" button.
- **One-Time tab**: Chronological list with filters by property, category, date range. "Add Expense" button.
- **All tab**: Unified chronological view, sortable/filterable

#### Reports
- Year selector
- "Generate P&L" button
- In-app summary table (Schedule E format)
- "Download CSV" button
- Per-property breakdown expandable

#### Settings
- **OneDrive**: Sign in/out, connection status, last sync time
- **Recurring Templates**: Manage global template list
- **Data**: "Export all data" (JSON download), "Import data", "View archives"
- **About**: Version, GitHub link

### 8.7 Unauthenticated State

Before sign-in, the app shows a landing page with a "Sign in with Microsoft" button and a brief description. All other routes redirect to this landing page until authenticated. The landing page is centered and works identically on desktop and mobile.

### 8.8 Component Library Usage

Lean on Fluent UI v9 components throughout:

| Pattern | Fluent Component |
|---------|-----------------|
| Navigation | `TabList` (sidebar/bottom tabs) or `Nav` |
| Data tables | `Table` / `DataGrid` |
| Forms | `Input`, `Dropdown`, `DatePicker`, `SpinButton` |
| Modals | `Dialog` |
| Side panels | `Drawer` (desktop); `Dialog` fullscreen (mobile) |
| Status | `Badge`, `Tag` |
| Actions | `Button`, `MenuButton`, `Toolbar` |
| Feedback | `Toast`, `MessageBar` |
| Layout | `Card`, `Divider` |

### 8.9 Touch & Mobile UX

- All interactive elements have a minimum touch target of 44x44px (Apple HIG)
- Use `viewport` meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- Respect safe area insets for iPhone notch/Dynamic Island: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`
- Bottom tab bar must sit above the iPhone home indicator (safe area)
- Form inputs should not cause layout shifts — use `position: fixed` for bottom bars
- Number inputs use `inputMode="decimal"` for numeric keyboard on mobile
- Date pickers use native mobile date input where Fluent `DatePicker` is awkward on touch

---

## 9. GitHub Pages Deployment

### 9.1 Repository Structure

```
rental-tracker/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions: build + deploy to gh-pages
├── index.html                   # Vite entry point (project root)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── auth/
│   │   ├── msalConfig.ts       # MSAL configuration
│   │   └── AuthProvider.tsx     # MSAL React provider
│   ├── api/
│   │   ├── onedrive.ts         # Graph API wrapper
│   │   └── archive.ts          # Archive management
│   ├── engine/
│   │   ├── rentAccrual.ts      # Rent entry generation
│   │   ├── expenseAccrual.ts   # Recurring expense generation
│   │   └── reportGenerator.ts  # P&L / Schedule E builder
│   ├── models/
│   │   └── types.ts            # All TypeScript interfaces from §2
│   ├── store/
│   │   └── useStore.ts         # Zustand store for app state
│   ├── hooks/
│   │   └── useIsMobile.ts      # Responsive breakpoint hook
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Properties.tsx
│   │   ├── Income.tsx
│   │   ├── Expenses.tsx
│   │   ├── Reports.tsx
│   │   └── Settings.tsx
│   └── components/
│       ├── PropertyForm.tsx
│       ├── RentGrid.tsx
│       ├── ExpenseForm.tsx
│       ├── ReportTable.tsx
│       └── Layout.tsx          # Responsive shell: sidebar (desktop) / bottom tabs (mobile)
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### 9.2 Build & Deploy

**`vite.config.ts`:**
```typescript
export default defineConfig({
  base: '/rental-tracker/',   // GitHub Pages subpath
  plugins: [react()],
  build: { outDir: 'dist' }
});
```

**GitHub Actions (`.github/workflows/deploy.yml`):**
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 9.3 Routing

Use **React Router v6** with `HashRouter` (GitHub Pages doesn't support history API fallback cleanly):

```typescript
<HashRouter>
  <Routes>
    <Route path="/" element={<Layout />}>
      <Route index element={<Dashboard />} />
      <Route path="properties" element={<Properties />} />
      <Route path="income" element={<Income />} />
      <Route path="expenses" element={<Expenses />} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<Settings />} />
    </Route>
  </Routes>
</HashRouter>
```

---

## 10. State Management

Use **Zustand** for global state:

```typescript
interface AppStore {
  // Auth
  isAuthenticated: boolean;
  user: AccountInfo | null;

  // Data
  config: Config | null;
  yearData: Record<number, YearData>;  // Keyed by year
  currentYear: number;

  // UI
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;

  // Actions — Data loading
  loadFromOneDrive: () => Promise<void>;
  saveConfig: () => Promise<void>;
  saveYearData: (year: number) => Promise<void>;

  // Actions — Properties
  addProperty: (property: Omit<Property, 'id'>) => void;
  updateProperty: (id: string, updates: Partial<Property>) => void;
  deactivateProperty: (id: string) => void;

  // Actions — Income
  accrueRent: () => void;
  overrideRent: (propertyId: string, month: number, year: number, override: Partial<RentEntry>) => void;

  // Actions — Expenses
  accrueExpenses: () => void;
  addExpense: (entry: Omit<ExpenseEntry, 'id'>) => void;

  // Actions — Reports
  generateReport: (year: number) => ScheduleEReport;
}
```

---

## 11. Key Dependencies

```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.28",
    "@fluentui/react-components": "^9.56",
    "@fluentui/react-icons": "^1.1",
    "@azure/msal-browser": "^3.27",
    "@azure/msal-react": "^2.1",
    "zustand": "^5.0",
    "uuid": "^10.0",
    "date-fns": "^4.1"
  },
  "devDependencies": {
    "typescript": "^5.6",
    "vite": "^6.0",
    "@vitejs/plugin-react": "^4.3",
    "@types/react": "^18.3",
    "@types/uuid": "^10.0"
  }
}
```

---

## 12. Implementation Phases

### Phase 1 — Foundation (MVP)
1. Vite + React + TypeScript + Fluent UI v9 scaffold
2. Responsive shell: sidebar (desktop) / bottom tab bar (mobile) with `useIsMobile` hook
3. MSAL auth flow (sign in/out, token management)
4. OneDrive read/write with archive-on-write
5. Data model types + Zustand store
6. Property CRUD (add, edit, deactivate)
7. Settings page (OneDrive connection, templates)

### Phase 2 — Core Features
8. Rent accrual engine + Income grid page (with mobile single-property view)
9. Recurring expense engine + Expense page
10. One-time expense entry form
11. Property tax auto-generation
12. Deposit tracking (receive, refund, retain)
13. Dashboard with summary cards

### Phase 3 — Reporting
14. P&L report generator (Schedule E alignment)
15. CSV export for TurboTax

### Phase 4 — Polish
16. Error handling, retry logic, conflict detection
17. Archive viewer + data export/import in Settings
18. Mobile UX polish (safe areas, touch targets, input modes)
19. GitHub Actions deployment pipeline
20. README with setup instructions (Azure app registration, GitHub Pages config)

---

## 13. Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Accrual engines, report generator, data transforms |
| Component | Vitest + Testing Library | Form validation, grid rendering, state updates |
| Integration | Manual | OneDrive read/write cycle, MSAL auth flow |
| Responsive | Manual | Verify all pages at 393px (iPhone 16 Pro) and 1440px+ (desktop) |

Priority: Unit test the accrual engines and report generator exhaustively — these are the financial core.

---

## 14. Security Notes

- **No secrets in repo**: MSAL client ID is public (SPA)
- **Token refresh**: MSAL handles silent token renewal; app checks `isAuthenticated` before Graph calls
- **Archive integrity**: Archives are append-only; primary files are the only mutable targets

---

## 15. Open Questions / Future Scope

- **Depreciation tracking**: Schedule E Line 18 — complex (MACRS), defer to v2
- **Mortgage interest**: Line 12 — requires loan amortization schedule, defer to v2
- **Multi-user**: Not in scope — single MSA account
- **Notifications**: Upcoming expense reminders via email — requires backend, out of scope for SPA

---

*End of spec. Ready for implementation.*
