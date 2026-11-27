# After Hours Cafe

After Hours is a table-side ordering app for a chai and coffee cafe. Guests can
browse the menu, choose their table, place an order, and follow its status.
Staff can view incoming orders and update their preparation status.

## Features

- Search and filter chai, coffee, cold drinks, snacks, and desserts.
- Build a table-specific cart and place an order with customer instructions.
- Track order status and preparation estimates.
- Password-protected staff dashboard for managing orders.
- Responsive customer and staff pages.

Orders currently use demo payment mode; the app does not process payments.
The initial database migration seeds eight sample menu products.

## Tech stack

- React 19 and React Router
- Vite and Agent-Native
- Drizzle ORM with PostgreSQL
- PGlite for local development

## Run locally

Requirements: Node.js `>=22.22.0` and pnpm `10.14.0`.

In PowerShell, from the project directory:

```powershell
corepack enable
pnpm install
pnpm db:migrate
```

Staff access is optional for customer ordering. To enable it locally, set a
private password of at least 16 characters in the same PowerShell session
before starting the app:

```powershell
$secure = Read-Host "Staff password (16+ characters)" -AsSecureString
$env:STAFF_PASSWORD = (New-Object System.Net.NetworkCredential("", $secure)).Password
pnpm dev
```

If you do not need staff access locally, start the app with `pnpm dev` after
the migration. The local PGlite database is stored under `data/pglite/` and is
not shared with other computers or deployments.

## Deployment

For a shared production deployment, use a persistent PostgreSQL database and
configure `DATABASE_URL` and `STAFF_PASSWORD` in the hosting provider's
environment settings. `STAFF_PASSWORD` must be at least 16 characters. Apply
the migrations to the same production database; migration tooling can use
`DATABASE_URL_UNPOOLED` for a direct database connection when the provider
also supplies a pooled URL.

For Vercel, add the required variables under the project's environment
settings and redeploy after changing them. Do not commit passwords or database
URLs to the repository.

### Render free demo

The root `render.yaml` defines a Render Blueprint with a free Node web service
and a free PostgreSQL database in Singapore. To deploy it, push the repository
to GitHub, then in Render choose **New → Blueprint** and connect this repository
and the `main` branch. Render will prompt you for `STAFF_PASSWORD`; enter a
private password of at least 16 characters. Render generates the
`BETTER_AUTH_SECRET` for you. The Blueprint pins both services to Render's Free
plan and limits PostgreSQL connections to the private network.
This project and Blueprint do not ask for or store bank or card details. If
Render's dashboard asks you to add a payment method, stop there and do not
continue.

The configured service URL is `https://after-hours-cafe.onrender.com`. If you
change the Render service name, update `APP_URL` and
`BETTER_AUTH_TRUSTED_ORIGINS` in `render.yaml` to match.

The web service builds with Nitro's Node server preset and runs the database
migrations before starting the app. On free web services, this migration
command runs whenever the service starts.

This is for a demo only, not real cafe orders: Render's free web service can
spin down after inactivity, and free PostgreSQL databases expire 30 days after
creation, after which their data is deleted. Free plans also have usage limits;
some overages can be billed if a payment method is on file. Review Render's
billing and spend controls before adding a payment method. If you need to avoid
overage charges, do not add a payment method; Render may suspend free services
or builds when limits are reached. Use a persistent database before relying on
the app for real orders.

## Project layout

- `app/`: customer and staff routes and UI
- `actions/`: operations used by both the UI and the app's agent
- `server/`: server plugins, authentication, and database client
- `drizzle/`: database schema and migrations

For development details, see [DEVELOPING.md](./DEVELOPING.md).
