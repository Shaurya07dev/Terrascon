// Restaurant Management API (MongoDB Atlas)
// Replaces Supabase with MongoDB via Mongoose

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// DB
const connectDB = require('./config/database');
const User = require('./models/User');
const Customer = require('./models/Customer');
const Booking = require('./models/Booking');
const MenuPdf = require('./models/MenuPdf');
const Settings = require('./models/Settings');
const TimeSlotSettings = require('./models/TimeSlotSettings');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect DB
connectDB();

// In-memory menu items baseline (kept for UI display); PDFs live in DB
const restaurantData = {
  menuItems: [
    { id: 1, name: 'Grilled Salmon', category: 'Main Course', price: 28.99, description: 'Fresh Atlantic salmon with herbs', available: true },
    { id: 2, name: 'Caesar Salad', category: 'Appetizer', price: 12.99, description: 'Romaine lettuce with parmesan', available: true },
    { id: 3, name: 'Chocolate Cake', category: 'Dessert', price: 8.99, description: 'Rich chocolate cake with ganache', available: false },
    { id: 4, name: 'Pasta Carbonara', category: 'Main Course', price: 22.99, description: 'Creamy pasta with bacon', available: true },
  ],
};

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// Helpers
function normalizeDate(d) {
  try {
    const dd = new Date(d);
    if (!isNaN(dd.getTime())) return new Date(dd.toISOString().split('T')[0]);
  } catch (_) {}
  return new Date(d);
}

function normalizeTime(t) {
  if (!t) return '19:30:00';
  let s = t;
  if (s.includes('-')) s = s.split('-')[0];
  s = s.replace(/\s?(AM|PM)$/i, '');
  if (/^\d{1,2}:\d{2}$/.test(s)) s = `${s}:00`;
  if (!/^\d{1,2}:\d{2}:\d{2}$/.test(s)) s = '19:30:00';
  return s;
}


// Auth
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, name: user.name, lastPage: user.lastPage } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Page tracking endpoints
app.post('/api/user/page', async (req, res) => {
  try {
    const { userId, page } = req.body;
    if (!userId || !page) return res.status(400).json({ error: 'Missing userId or page' });
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.lastPage = page;
    await user.save();
    
    res.json({ success: true, lastPage: page });
  } catch (e) {
    console.error('Page tracking error:', e);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

app.get('/api/user/page/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({ success: true, lastPage: user.lastPage });
  } catch (e) {
    console.error('Page fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    res.json({
      name: s.restaurantName,
      address: s.address,
      phone: s.phone,
      maxPartySize: s.maxPartySize,
      bookingAdvanceDays: s.bookingAdvanceDays,
      tableCount: s.tableCount,
      operatingHours: s.operatingHours,
    });
  } catch (e) {
    console.error('Settings fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = new Settings();
    s.restaurantName = req.body.name ?? s.restaurantName;
    s.address = req.body.address ?? s.address;
    s.phone = req.body.phone ?? s.phone;
    s.maxPartySize = req.body.maxPartySize ?? s.maxPartySize;
    s.bookingAdvanceDays = req.body.bookingAdvanceDays ?? s.bookingAdvanceDays;
    s.tableCount = req.body.tableCount ?? s.tableCount;
    s.operatingHours = req.body.operatingHours ?? s.operatingHours;
    await s.save();
    res.json({ success: true, settings: req.body });
  } catch (e) {
    console.error('Settings update error:', e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Time Slot Management (Admin availability per date)
app.get('/api/time-slots/availability', async (req, res) => {
  try {
    const date = (req.query.date || '').trim() || null; // YYYY-MM-DD or null for global

    // Prefer date-specific, fallback to global (date: null)
    let doc = null;
    if (date) {
      doc = await TimeSlotSettings.findOne({ date });
    }
    if (!doc) {
      doc = await TimeSlotSettings.findOne({ date: null });
    }
    if (!doc) {
      doc = new TimeSlotSettings({ date: null });
      await doc.save();
    }

    const availability = {};
    if (doc.slotSettings && doc.slotSettings instanceof Map) {
      Array.from(doc.slotSettings.entries()).forEach(([k, v]) => {
        availability[k] = v;
      });
    }
    return res.json(availability);
  } catch (e) {
    console.error('Time slot availability fetch error:', e);
    return res.status(500).json({ error: 'Failed to fetch time slot availability' });
  }
});

app.put('/api/time-slots/availability', async (req, res) => {
  try {
    const date = (req.query.date || '').trim() || null; // YYYY-MM-DD or null
    const body = req.body || {};

    const map = new Map();
    Object.entries(body).forEach(([k, v]) => map.set(k, !!v));

    await TimeSlotSettings.findOneAndUpdate(
      { date },
      { slotSettings: map, date },
      { new: true, upsert: true }
    );
    return res.json({ success: true, message: 'Time slot settings saved successfully' });
  } catch (e) {
    console.error('Time slot availability update error:', e);
    return res.status(500).json({ error: 'Failed to update time slot availability' });
  }
});

// Customers
app.get('/api/customers', async (req, res) => {
  try {
    const data = await Customer.find({}).sort({ lastVisit: -1, createdAt: -1 });
    const customers = data.map(c => ({
      id: c._id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      visits: c.visits || 0,
      lastVisit: c.lastVisit ? c.lastVisit.toISOString().split('T')[0] : 'Never',
    }));
    res.json(customers);
  } catch (e) {
    console.error('Customers fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const c = await Customer.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      visits: req.body.visits ?? 1,
      lastVisit: req.body.lastVisit ? new Date(req.body.lastVisit) : new Date(),
    });
    res.json({ success: true, customer: c });
  } catch (e) {
    console.error('Customer create error:', e);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        visits: req.body.visits,
        lastVisit: req.body.lastVisit ? new Date(req.body.lastVisit) : undefined,
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Customer not found' });
    res.json({ success: true, customer: updated });
  } catch (e) {
    console.error('Customer update error:', e);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('Customer delete error:', e);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Bookings
app.get('/api/bookings', async (req, res) => {
  try {
    const data = await Booking.find({}).sort({ date: 1, time: 1 });
    const bookings = data.map(b => ({
      id: b._id,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      customerPhone: b.customerPhone,
      date: b.date.toISOString().split('T')[0],
      time: b.time,
      guests: b.guests,
      tableNumber: b.tableNumber,
      status: b.status,
      specialRequests: b.specialRequests,
      createdAt: b.createdAt,
    }));
    res.json(bookings);
  } catch (e) {
    console.error('Bookings fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const date = normalizeDate(req.body.date);
    const time = normalizeTime(req.body.time);
    const guests = Number(req.body.guests ?? req.body.partysize ?? 1) || 1;
    const customerName = (req.body.customerName || `${req.body.firstName || ''} ${req.body.lastName || ''}`.trim()) || 'Guest';
    const customerEmail = (req.body.customerEmail || req.body.email || '').trim() || 'guest@example.com';
    const customerPhone = (req.body.customerPhone || req.body.phone || '').trim() || null;
    const tableNumber = Number(req.body.tableNumber) || 1;

    // Validate against admin-set unavailable slots and existing confirmed bookings
    const SLOT_RANGES = [
      '07:30-08:30','08:30-09:30','09:30-10:30',
      '12:00-13:00','13:00-14:00','13:30-14:30',
      '15:30-16:30','16:30-17:30',
      '17:30-18:30','18:30-19:30',
      '19:30-20:30','20:30-21:30','21:30-22:30'
    ];
    const hhmm = (time || '').slice(0,5);
    const findContainingSlot = (t) => {
      for (const range of SLOT_RANGES) {
        const [start, end] = range.split('-');
        if (t >= start && t < end) return range;
      }
      return null;
    };
    const containing = findContainingSlot(hhmm);
    try {
      const dateStr = date instanceof Date && !isNaN(date) ? date.toISOString().split('T')[0] : null;
      let ts = null;
      if (dateStr) ts = await TimeSlotSettings.findOne({ date: dateStr });
      if (!ts) ts = await TimeSlotSettings.findOne({ date: null });
      if (ts && containing && ts.slotSettings instanceof Map) {
        const v = ts.slotSettings.get(containing);
        if (v === false) {
          return res.status(400).json({ error: 'Selected time slot is unavailable for the chosen date' });
        }
      }
    } catch (e) {
      console.error('Time slot availability check failed:', e);
      // Do not block booking due to availability check failure
    }

    // Prevent double booking a slot that is already confirmed
    try {
      const existing = await Booking.findOne({ date, time, status: 'confirmed' });
      if (existing) {
        return res.status(400).json({ error: 'Selected time slot is already booked' });
      }
    } catch (e) {
      console.error('Existing booking check failed:', e);
    }

    const b = await Booking.create({
      customerName,
      customerEmail,
      customerPhone,
      date,
      time,
      guests,
      tableNumber,
      status: req.body.status || 'pending',
      specialRequests: req.body.specialRequests || '',
    });

    // Upsert customer record
    const existing = await Customer.findOne({ email: customerEmail });
    if (existing) {
      existing.visits = (existing.visits || 0) + 1;
      existing.lastVisit = date;
      existing.name = customerName;
      existing.phone = customerPhone || existing.phone;
      await existing.save();
    } else {
      await Customer.create({ name: customerName, email: customerEmail, phone: customerPhone, visits: 1, lastVisit: date });
    }

    res.json({ success: true, booking: { id: b._id, customerName, customerEmail, customerPhone, date: b.date.toISOString().split('T')[0], time, guests, tableNumber, status: b.status, specialRequests: b.specialRequests, createdAt: b.createdAt } });
  } catch (e) {
    console.error('Booking create error:', e);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.get('/api/bookings/:id', async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    res.json({ id: b._id, customerName: b.customerName, customerEmail: b.customerEmail, customerPhone: b.customerPhone, date: b.date.toISOString().split('T')[0], time: b.time, guests: b.guests, tableNumber: b.tableNumber, status: b.status, specialRequests: b.specialRequests, createdAt: b.createdAt });
  } catch (e) {
    console.error('Booking find error:', e);
    res.status(500).json({ error: 'Failed to find booking' });
  }
});

app.put('/api/bookings/:id', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.date) payload.date = normalizeDate(payload.date);
    if (payload.time) payload.time = normalizeTime(payload.time);
    const updated = await Booking.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!updated) return res.status(404).json({ error: 'Booking not found' });
    res.json({ success: true, booking: {
      id: updated._id,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      customerPhone: updated.customerPhone,
      date: updated.date.toISOString().split('T')[0],
      time: updated.time,
      guests: updated.guests,
      tableNumber: updated.tableNumber,
      status: updated.status,
      specialRequests: updated.specialRequests,
      createdAt: updated.createdAt,
    }});
  } catch (e) {
    console.error('Booking update error:', e);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('Booking delete error:', e);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Send confirmation email
app.post('/api/bookings/:id/send-confirmation', async (req, res) => {
  try {
    // Email notifications are disabled in this environment.
    // We still check if the booking exists to return a meaningful response.
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ success: true, message: 'Email notifications are disabled in this environment.' });
  } catch (e) {
    console.error('Send confirmation (stub) error:', e);
    res.status(500).json({ error: 'Failed to process confirmation (email disabled)' });
  }
});

// Analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const confirmed = await Booking.find({ status: 'confirmed' }).select('guests time date');
    const avg = confirmed.length ? confirmed.reduce((s, b) => s + (b.guests || 0), 0) / confirmed.length : 0;

    // Calculate peak hours with better formatting
    const timeCounts = {};
    confirmed.forEach(b => {
      const t = b.time;
      timeCounts[t] = (timeCounts[t] || 0) + 1;
    });

    const to12h = (t) => {
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${m} ${ampm}`;
    };

    const peakHours = Object.entries(timeCounts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([t]) => to12h(t));

    res.json({
      totalBookings,
      averagePartySize: Math.round(avg * 10) / 10,
      peakHours: peakHours.length ? peakHours : ['No data available']
    });
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Menu PDFs - Get all PDFs by menu title (for admin panel - shows all PDFs)
app.get('/api/menu-pdfs', async (req, res) => {
  try {
    const menuTitle = req.query.menuTitle;
    if (!menuTitle) {
      return res.status(400).json({ error: 'menuTitle query parameter is required' });
    }

    // For admin panel, show ALL PDFs (both active and inactive) so admins can reactivate them
    const pdfs = await MenuPdf.find({ menuTitle }).sort({ createdAt: -1 });
    res.json(pdfs.map(pdf => ({
      _id: pdf._id,
      title: pdf.title,
      menuTitle: pdf.menuTitle,
      filename: pdf.filename,
      fileSize: pdf.fileSize,
      mimeType: pdf.mimeType,
      createdAt: pdf.createdAt,
      isActive: pdf.isActive
    })));
  } catch (e) {
    console.error('Menu PDFs fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch menu PDFs' });
  }
});

// Menu PDFs
app.get('/api/menu', async (req, res) => {
  try {
    const pdfs = await MenuPdf.find({ isActive: true });
    const map = {};
    pdfs.forEach(pdf => {
      if (pdf.menuTitle === 'Food Menu') map['food_menu'] = pdf;
      else if (pdf.menuTitle === 'Wine Menu') map['wine_menu'] = pdf;
      else {
        const m = pdf.menuTitle.match(/Menu Item (\d+)/);
        if (m) map[parseInt(m[1], 10)] = pdf;
      }
    });

    const items = restaurantData.menuItems.map(item => {
      const pdf = map[item.id];
      return pdf ? { ...item, pdfFile: { id: pdf._id, filename: pdf.filename, originalName: pdf.title, mimetype: pdf.mimeType, size: pdf.fileSize, uploadDate: pdf.createdAt } } : item;
    });

    const special = [
      { id: 'food_menu', name: 'Food Menu', price: 'N/A', category: 'Menu Type', description: 'Menu category for organizing food items', available: true, menuTitle: 'Food Menu', pdfFile: map['food_menu'] ? { id: map['food_menu']._id, filename: map['food_menu'].filename, originalName: map['food_menu'].title, mimetype: map['food_menu'].mimeType, size: map['food_menu'].fileSize, uploadDate: map['food_menu'].createdAt } : null },
      { id: 'wine_menu', name: 'Wine Menu', price: 'N/A', category: 'Menu Type', description: 'Menu category for organizing wine items', available: true, menuTitle: 'Wine Menu', pdfFile: map['wine_menu'] ? { id: map['wine_menu']._id, filename: map['wine_menu'].filename, originalName: map['wine_menu'].title, mimetype: map['wine_menu'].mimeType, size: map['wine_menu'].fileSize, uploadDate: map['wine_menu'].createdAt } : null },
    ];

    res.json([...items, ...special]);
  } catch (e) {
    console.error('Menu fetch error:', e);
    res.json(restaurantData.menuItems);
  }
});

app.post('/api/menu/:id/pdf', (req, res, next) => {
  upload.single('menuPdf')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    const menuItemId = req.params.id;
    let menuTitle = menuItemId === 'food_menu' ? 'Food Menu' : menuItemId === 'wine_menu' ? 'Wine Menu' : `Menu Item ${menuItemId}`;

    const pdf = await MenuPdf.create({
      title: req.file.originalname,
      menuTitle,
      filename: req.file.filename,
      filePath: path.join(uploadsDir, req.file.filename),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: null,
      isActive: true,
    });

    res.json({ success: true, message: 'PDF uploaded successfully', pdfId: pdf._id, pdfFile: { id: pdf._id, filename: pdf.filename, originalName: pdf.title, mimetype: pdf.mimeType, size: pdf.fileSize, uploadDate: pdf.createdAt } });
  } catch (e) {
    console.error('PDF upload error:', e);
    res.status(500).json({ error: 'Failed to store PDF metadata' });
  }
});

app.get('/api/menu/:id/pdf', async (req, res) => {
  try {
    const menuItemId = req.params.id;
    let menuTitle = menuItemId === 'food_menu' ? 'Food Menu' : menuItemId === 'wine_menu' ? 'Wine Menu' : `Menu Item ${menuItemId}`;
    const pdf = await MenuPdf.findOne({ menuTitle, isActive: true });
    if (!pdf) return res.status(404).json({ error: 'PDF not found for this menu item' });
    const filePath = path.join(uploadsDir, pdf.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'PDF file not found on server' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.title}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('Serve PDF error:', e);
    res.status(500).json({ error: 'Failed to serve PDF' });
  }
});

app.delete('/api/menu/:id/pdf', async (req, res) => {
  try {
    const menuItemId = req.params.id;
    let menuTitle = menuItemId === 'food_menu' ? 'Food Menu' : menuItemId === 'wine_menu' ? 'Wine Menu' : `Menu Item ${menuItemId}`;
    const pdf = await MenuPdf.findOne({ menuTitle, isActive: true });
    if (!pdf) return res.status(404).json({ error: 'PDF not found for this menu item' });
    const filePath = path.join(uploadsDir, pdf.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await MenuPdf.deleteOne({ _id: pdf._id });
    res.json({ success: true, message: 'PDF deleted successfully' });
  } catch (e) {
    console.error('Delete PDF error:', e);
    res.status(500).json({ error: 'Failed to delete PDF' });
  }
});

// Set PDF as active (deactivate others with same menuTitle)
// Admin only - requires authentication
app.put('/api/menu-pdfs/:id/set-active', async (req, res) => {
  try {
    // Basic auth check - in production, implement proper JWT/session auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    if (token !== 'admin-token') { // Simple token check for demo
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pdfId = req.params.id;
    const { menuTitle } = req.body;

    if (!menuTitle) {
      return res.status(400).json({ error: 'menuTitle is required' });
    }

    // Find the PDF to activate
    const pdf = await MenuPdf.findById(pdfId);
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    // Deactivate all other PDFs with the same menuTitle
    await MenuPdf.updateMany(
      { menuTitle, _id: { $ne: pdfId } },
      { isActive: false }
    );

    // Activate the selected PDF
    pdf.isActive = true;
    await pdf.save();

    res.json({ success: true, message: 'PDF set as active successfully' });
  } catch (e) {
    console.error('Set active PDF error:', e);
    res.status(500).json({ error: 'Failed to set PDF as active' });
  }
});

// Remove PDF from being main (deactivate) - keeps PDF stored but removes from active use
// Admin only - requires authentication
app.put('/api/menu-pdfs/:id/deactivate', async (req, res) => {
  try {
    // Basic auth check - in production, implement proper JWT/session auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    if (token !== 'admin-token') { // Simple token check for demo
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pdfId = req.params.id;

    // Find the PDF to deactivate
    const pdf = await MenuPdf.findById(pdfId);
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    // Deactivate the PDF
    pdf.isActive = false;
    await pdf.save();

    res.json({ success: true, message: 'PDF removed from main successfully' });
  } catch (e) {
    console.error('Deactivate PDF error:', e);
    res.status(500).json({ error: 'Failed to deactivate PDF' });
  }
});

// Delete PDF by ID
// Admin only - requires authentication
app.delete('/api/menu-pdfs/:id', async (req, res) => {
  try {
    // Basic auth check - in production, implement proper JWT/session auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    if (token !== 'admin-token') { // Simple token check for demo
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pdf = await MenuPdf.findById(req.params.id);
    if (!pdf) return res.status(404).json({ error: 'PDF not found' });

    const filePath = path.join(uploadsDir, pdf.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await MenuPdf.deleteOne({ _id: pdf._id });
    res.json({ success: true, message: 'PDF deleted successfully' });
  } catch (e) {
    console.error('Delete PDF by ID error:', e);
    res.status(500).json({ error: 'Failed to delete PDF' });
  }
});

// Admin maintenance: clear data (keep admin user)
app.post('/api/admin/clear', async (req, res) => {
  try {
    await Booking.deleteMany({});
    await Customer.deleteMany({});
    await MenuPdf.deleteMany({});
    await User.deleteMany({ username: { $ne: 'admin' } });
    res.json({ success: true, message: 'All datasets cleared (except admin user).' });
  } catch (e) {
    console.error('Admin clear error:', e);
    res.status(500).json({ error: 'Failed to clear datasets' });
  }
});

// Static files
app.use('/uploads', express.static(uploadsDir));
app.use(express.static('pages/restaurant_clone/restaurant_clone'));

// Start
app.listen(PORT, () => {
  console.log(`Restaurant Management API (Mongo) running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin-login.html`);
  console.log(`Main site: http://localhost:${PORT}/index.html`);
});
