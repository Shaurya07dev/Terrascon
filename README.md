# Restaurant Management System

A complete restaurant booking and management system. The app serves a static admin UI and site from `pages/restaurant_clone/restaurant_clone/` and exposes a REST API. The default backend uses MongoDB Atlas via Mongoose (`server-mongodb.js`). A legacy Supabase variant exists in `server.js` but is not required.


## Features
- **Bookings**: Create, list, update, delete reservations.
- **Customers**: Track visits and details.
- **Settings**: Manage restaurant info and operating hours.
- **Time Slot Availability**: Admin can set per-date overrides or global defaults to mark slots unavailable; bookings respect these rules.
- **Menu PDFs**: Upload and serve PDF menus per item or type (Food/Wine).
- **Static UI**: Served from `pages/restaurant_clone/restaurant_clone/` at runtime.


## Requirements
- Node.js 18+ and npm
- MongoDB Atlas (or any reachable MongoDB) connection string
- Windows/macOS/Linux supported


## Environment Variables
Create/update `.env` in the project root. Example keys from `./.env`:

```
PORT=3000
NODE_ENV=development
SESSION_SECRET=change-this-to-a-long-random-string

# MongoDB Atlas connection URI (required)
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority

# Optional email (currently disabled/stubbed in Mongo server)
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASS=your-app-password

# Optional production settings
# FRONTEND_URL=https://yourdomain.com
# TRUST_PROXY=true
```

Important:
- Do NOT commit real secrets. Replace any existing credentials in `.env` with your own.
- For Atlas, ensure your IP is allowed in Network Access and the database/user exist.


## Install & Run (MongoDB default)
1) Install dependencies
```
npm install
```

2) Verify DB connectivity
```
npm run test:db
```
- If it fails, check `MONGODB_URI`, Atlas IP allowlist, or credentials.

3) Seed initial data (creates admin user and sample data)
```
npm run seed
```
- Default admin after seeding: `admin / admin123`.
- You should change this password in production.

4) Start the app (development with reload)
```
npm run dev
```
Or start without reload:
```
npm start
```

5) Open the UI
- Admin panel: http://localhost:3000/admin-login.html
- Main site: http://localhost:3000/index.html

Tip (Windows): `npm run start:all` or `npm run dev:all` can auto-open the browser via `wait-on` + `start`.


## Project Scripts (from `package.json`)
- **Start Mongo server**
  - `npm start` → `node server-mongodb.js`
  - `npm run dev` → `nodemon server-mongodb.js`
  - Aliases: `start:mongo`, `dev:mongo`
- **Legacy Supabase server (optional)**
  - `npm run start:web` → `node server.js`
  - `npm run dev:web` → `nodemon server.js`
  - Note: `server.js` expects Supabase creds; some routes will fail if unset.
- **Run both (not usually needed)**
  - `npm run start:both`, `npm run dev:both`
- **Utilities**
  - `npm run test:db` → quick Atlas connectivity test
  - `npm run seed` → seed DB with admin and sample data
  - `npm run open:admin`, `npm run open:site` → open browser after server is up


## Directory Structure
- `server-mongodb.js` → Main Express API + static file server (Mongo)
- `server.js` → Legacy Supabase-based API (optional)
- `config/database.js` → Mongoose connection helper
- `models/` → `User`, `Customer`, `Booking`, `Settings`, `MenuPdf`, `TimeSlotSettings`
- `scripts/` → `seed.js`, `test-connection.js`
- `pages/restaurant_clone/restaurant_clone/` → Frontend HTML/CSS/JS
- `uploads/` → Stored menu PDF files


## API Overview (Mongo server)
Base URL: `http://localhost:3000`

- **Auth**
  - `POST /api/auth/login` → body `{ username, password }`
- **Settings**
  - `GET /api/settings`
  - `PUT /api/settings`
- **Time Slot Management**
  - `GET /api/time-slots/availability` or `GET /api/time-slots/availability?date=YYYY-MM-DD`
    - Returns an object map `{ "07:30-08:30": true|false, ... }` where `false = unavailable`.
    - If `date` is provided, returns date-specific settings; otherwise returns global defaults (`date: null`).
    - Fallback order: specific date → global → creates empty global if none.
  - `PUT /api/time-slots/availability` or `PUT /api/time-slots/availability?date=YYYY-MM-DD`
    - Upserts availability for the given date (or global if no date).
    - Body is a JSON object of slotRange→boolean, where `true=available`, `false=unavailable`.
- **Customers**
  - `GET /api/customers`
  - `POST /api/customers`
  - `PUT /api/customers/:id`
  - `DELETE /api/customers/:id`
- **Bookings**
  - `GET /api/bookings`
  - `GET /api/bookings/:id`
  - `POST /api/bookings`
  - `PUT /api/bookings/:id`
  - `DELETE /api/bookings/:id`
- **Menu PDFs**
  - `GET /api/menu` → returns items + attached PDFs
  - `POST /api/menu/:id/pdf` → multipart upload field `menuPdf` (PDF only)
  - `GET /api/menu/:id/pdf` → stream PDF
  - `DELETE /api/menu/:id/pdf`
- **Admin Maintenance**
  - `POST /api/admin/clear` → clears all data except the `admin` user


## Database Reference (MongoDB via Mongoose)

All models live under `models/`. This backend primarily uses these collections:

- **User** (`models/User.js`)
  - Fields: `username` (unique), `passwordHash`, `role` (e.g., `admin`), `name`, `lastPage`, timestamps
  - Methods: `comparePassword(plain)` (bcrypt comparison)

- **Customer** (`models/Customer.js`)
  - Fields: `name`, `email` (unique), `phone`, `visits` (Number, default 0), `lastVisit` (Date), timestamps

- **Booking** (`models/Booking.js`)
  - Fields: `customerName`, `customerEmail`, `customerPhone`, `date` (Date), `time` (String, `HH:MM:SS`), `guests` (Number), `tableNumber` (Number), `status` (`pending|confirmed|cancelled`), `specialRequests`, timestamps
  - API validation: `POST /api/bookings` rejects bookings when:
    - The selected slot is marked unavailable by admin (date-specific or global)
    - A booking already exists with `status='confirmed'` for the same `date + time`

- **Settings** (`models/Settings.js`)
  - Fields: `restaurantName`, `address`, `phone`, `maxPartySize` (Number), `bookingAdvanceDays` (Number), `tableCount` (Number), `operatingHours` (Mixed/Object), timestamps

- **MenuPdf** (`models/MenuPdf.js`)
  - Fields: `title`, `menuTitle` (e.g., `Food Menu`, `Wine Menu`), `filename`, `filePath`, `fileSize`, `mimeType`, `uploadedBy`, `isActive` (Boolean), timestamps
  - Files stored on disk under `uploads/`; DB stores metadata

- **TimeSlotSettings** (`models/TimeSlotSettings.js`)
  - Purpose: Store slot availability maps globally or for a specific date
  - Fields:
    - `date`: `YYYY-MM-DD` string, or `null` for global defaults
    - `slotSettings`: `Map<String, Boolean>` where `false = unavailable`, `true = available`
  - Example documents:
    ```json
    // Global defaults (applies when a date has no specific override)
    {
      "date": null,
      "slotSettings": {
        "07:30-08:30": true,
        "08:30-09:30": false,
        "09:30-10:30": true
      }
    }

    // Date-specific override (only for 2025-10-15)
    {
      "date": "2025-10-15",
      "slotSettings": {
        "19:30-20:30": false,
        "20:30-21:30": false
      }
    }
    ```

### Time Slot Data Flow
- Admin Settings page (`admin-dashboard.html`, `#settingsPage`):
  - Loads availability via `GET /api/time-slots/availability[?date=YYYY-MM-DD]`
  - Saves changes via `PUT /api/time-slots/availability[?date=YYYY-MM-DD]`
  - If no date selected, edits the global defaults (used by all dates without overrides)
- Reservation page (`booking-confirmation.html`):
  - Hides time selection until a date is chosen
  - Fetches date-specific availability to disable admin-unavailable slots
  - Also disables slots already booked with `status='confirmed'`


## Hosting

### Option A: Render/Railway/Heroku
1) Provision MongoDB Atlas. Copy the connection string to `MONGODB_URI`.
2) Create a new Web Service:
   - Runtime: Node.js
   - Build Command: `npm install`
   - Start Command: `node server-mongodb.js`
3) Configure Environment Variables:
   - `MONGODB_URI=...`
   - Optional: `SESSION_SECRET`, `NODE_ENV=production`
4) Deploy. The platform injects `PORT`; the app uses it automatically.

Static UI is served by Express from `pages/restaurant_clone/restaurant_clone/`. No separate static hosting is required.

### Option B: VPS (Ubuntu) with PM2 + Nginx
- SSH to server, install Node 18+ and git.
- Clone repo and create `.env` with `MONGODB_URI` and secrets.
- Install deps: `npm ci`
- Start with PM2:
  ```bash
  pm2 start server-mongodb.js --name restaurant
  pm2 save && pm2 startup
  ```
- Configure Nginx reverse proxy to `http://127.0.0.1:<PORT>` and enable HTTPS (Let’s Encrypt).


## Troubleshooting
- **Mongo connect errors**: Run `npm run test:db`. Check Atlas IP allowlist, credentials, and `MONGODB_URI` (ensure a DB name is present).
- **PDF uploads**: Only PDFs allowed; files stored under `uploads/`. The server creates the folder if missing.
- **Port conflicts**: Change `PORT` in `.env`.
- **Legacy server**: If you run `server.js` without Supabase keys, some routes will error. Prefer `server-mongodb.js`.


## Security Notes
- Rotate any sample credentials immediately in production.
- Change the seeded admin password after first login.
- Keep `.env` out of version control.


## License
MIT
