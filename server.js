// Restaurant Management API (MongoDB Atlas)
// This file handles all API endpoints for the restaurant booking system

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const connectDB = require('./config/database');
const User = require('./models/User');
const Customer = require('./models/Customer');
const Booking = require('./models/Booking');
const MenuPdf = require('./models/MenuPdf');
const Settings = require('./models/Settings');
const TimeSlotSettings = require('./models/TimeSlotSettings');

// Connect to database
connectDB();

// Ensure env loaded even if .env is inside the theme folder
try {
    require('dotenv').config({ path: '.env' });
} catch (_) {}

// Email configuration (using Gmail SMTP as example)
let emailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    emailTransporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    console.log('Email service configured');
} else {
    console.log('Email not configured - set EMAIL_USER and EMAIL_PASS in .env to enable email notifications');
}

// MongoDB is connected via connectDB() function above

// Restaurant data (now using MongoDB for bookings and customers)
let restaurantData = {
    settings: {
        name: 'Laurent Restaurant',
        address: '123 Main Street, City, State 12345',
        phone: '+1 (555) 123-4567',
        maxPartySize: 12,
        bookingAdvanceDays: 30,
        tableCount: 20,
        operatingHours: {
            weekdays: '11:00 AM - 10:00 PM',
            weekends: '11:00 AM - 11:00 PM',
            sunday: '12:00 PM - 9:00 PM'
        }
    },
    menuItems: [
        { id: 1, name: 'Grilled Salmon', category: 'Main Course', price: 28.99, description: 'Fresh Atlantic salmon with herbs', available: true },
        { id: 2, name: 'Caesar Salad', category: 'Appetizer', price: 12.99, description: 'Romaine lettuce with parmesan', available: true },
        { id: 3, name: 'Chocolate Cake', category: 'Dessert', price: 8.99, description: 'Rich chocolate cake with ganache', available: false },
        { id: 4, name: 'Pasta Carbonara', category: 'Main Course', price: 22.99, description: 'Creamy pasta with bacon', available: true }
    ]
};

// Authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'admin123') {
        req.user = { username: 'admin', role: 'admin' };
        next();
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
};

// API Routes

// Authentication
app.post('/api/auth/login', authenticateAdmin, (req, res) => {
    res.json({ 
        success: true, 
        user: req.user,
        message: 'Login successful' 
    });
});

// Restaurant Settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await Settings.findOne() || restaurantData.settings;
        res.json(settings);
    } catch (error) {
        console.error('Settings fetch error:', error);
        res.json(restaurantData.settings);
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = await Settings.findOneAndUpdate(
            {},
            {
                restaurantName: req.body.name,
                address: req.body.address,
                phone: req.body.phone,
                maxPartySize: req.body.maxPartySize,
                bookingAdvanceDays: req.body.bookingAdvanceDays,
                tableCount: req.body.tableCount,
                operatingHours: req.body.operatingHours
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Time Slot Management
app.get('/api/time-slots/availability', async (req, res) => {
    try {
        const date = (req.query.date || '').trim() || null; // optional YYYY-MM-DD

        // Try date-specific first
        let timeSlotSettings = null;
        if (date) {
            timeSlotSettings = await TimeSlotSettings.findOne({ date });
        }

        // Fallback to global
        if (!timeSlotSettings) {
            timeSlotSettings = await TimeSlotSettings.findOne({ date: null });
        }

        // If nothing exists, create global defaults
        if (!timeSlotSettings) {
            timeSlotSettings = new TimeSlotSettings({ date: null });
            await timeSlotSettings.save();
        }

        // Convert Map to plain object for JSON response
        const availability = {};
        if (timeSlotSettings.slotSettings && timeSlotSettings.slotSettings instanceof Map) {
            // Use Array.from for better compatibility
            Array.from(timeSlotSettings.slotSettings.entries()).forEach(([key, value]) => {
                availability[key] = value;
            });
        }

        res.json(availability);
    } catch (error) {
        console.error('Time slot availability fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch time slot availability' });
    }
});

app.put('/api/time-slots/availability', async (req, res) => {
    try {
        const date = (req.query.date || '').trim() || null; // optional YYYY-MM-DD
        const availabilitySettings = req.body;

        // Convert plain object to Map for MongoDB storage
        const slotSettingsMap = new Map();
        if (availabilitySettings) {
            Object.entries(availabilitySettings).forEach(([key, value]) => {
                slotSettingsMap.set(key, value);
            });
        }

        await TimeSlotSettings.findOneAndUpdate(
            { date },
            { slotSettings: slotSettingsMap, date },
            { new: true, upsert: true }
        );

        res.json({ success: true, message: 'Time slot settings saved successfully' });
    } catch (error) {
        console.error('Time slot availability update error:', error);
        res.status(500).json({ error: 'Failed to update time slot availability' });
    }
});

// Menu Items
app.get('/api/menu', async (req, res) => {
    try {
        // Fetch PDFs from MongoDB
        const pdfs = await MenuPdf.find({ isActive: true });

        // Create a map of PDFs by menu item ID
        const pdfsMap = {};
        pdfs.forEach(pdf => {
            // Handle special menu types (food_menu, wine_menu)
            if (pdf.menuTitle === 'Food Menu') {
                pdfsMap['food_menu'] = pdf;
            } else if (pdf.menuTitle === 'Wine Menu') {
                pdfsMap['wine_menu'] = pdf;
            } else {
                // Handle numeric IDs for regular menu items
                const match = pdf.menuTitle.match(/Menu Item (\d+)/);
                if (match) {
                    const menuItemId = parseInt(match[1]);
                    pdfsMap[menuItemId] = pdf;
                }
            }
        });

        // Add PDF information to menu items
        const menuItemsWithPdfs = restaurantData.menuItems.map(item => {
            const pdfData = pdfsMap[item.id];
            if (pdfData) {
                return {
                    ...item,
                    pdfFile: {
                        id: pdfData._id,
                        filename: pdfData.filename,
                        originalName: pdfData.title,
                        mimetype: pdfData.mimeType,
                        size: pdfData.fileSize,
                        uploadDate: pdfData.uploadedAt
                    }
                };
            }
            return item;
        });

        // Always include special menu types (Food Menu and Wine Menu)
        const specialMenuTypes = [
            {
                id: 'food_menu',
                name: 'Food Menu',
                price: 'N/A',
                category: 'Menu Type',
                description: 'Menu category for organizing food items',
                available: true,
                menuTitle: 'Food Menu',
                pdfFile: pdfsMap['food_menu'] ? {
                    id: pdfsMap['food_menu']._id,
                    filename: pdfsMap['food_menu'].filename,
                    originalName: pdfsMap['food_menu'].title,
                    mimetype: pdfsMap['food_menu'].mimeType,
                    size: pdfsMap['food_menu'].fileSize,
                    uploadDate: pdfsMap['food_menu'].uploadedAt
                } : null
            },
            {
                id: 'wine_menu',
                name: 'Wine Menu',
                price: 'N/A',
                category: 'Menu Type',
                description: 'Menu category for organizing wine items',
                available: true,
                menuTitle: 'Wine Menu',
                pdfFile: pdfsMap['wine_menu'] ? {
                    id: pdfsMap['wine_menu']._id,
                    filename: pdfsMap['wine_menu'].filename,
                    originalName: pdfsMap['wine_menu'].title,
                    mimetype: pdfsMap['wine_menu'].mimeType,
                    size: pdfsMap['wine_menu'].fileSize,
                    uploadDate: pdfsMap['wine_menu'].uploadedAt
                } : null
            }
        ];

        const allMenuItems = [...menuItemsWithPdfs, ...specialMenuTypes];
        res.json(allMenuItems);
    } catch (error) {
        console.error('Error fetching menu items:', error);
        res.json(restaurantData.menuItems);
    }
});

// PDF functionality removed - simplified menu management

app.post('/api/menu', (req, res) => {
    const newItem = {
        id: restaurantData.menuItems.length + 1,
        ...req.body
    };
    restaurantData.menuItems.push(newItem);
    res.json({ success: true, item: newItem });
});

app.put('/api/menu/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = restaurantData.menuItems.findIndex(item => item.id === id);
    
    if (index !== -1) {
        restaurantData.menuItems[index] = { ...restaurantData.menuItems[index], ...req.body };
        res.json({ success: true, item: restaurantData.menuItems[index] });
    } else {
        res.status(404).json({ error: 'Menu item not found' });
    }
});

app.delete('/api/menu/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = restaurantData.menuItems.findIndex(item => item.id === id);
    
    if (index !== -1) {
        restaurantData.menuItems.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Menu item not found' });
    }
});

// Customers
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find({}).sort({ lastVisit: -1 });

        // Transform MongoDB data to match frontend format
        const transformedCustomers = customers.map(customer => ({
            id: customer._id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            visits: customer.visits || 0,
            lastVisit: customer.lastVisit || 'Never'
        }));

        res.json(transformedCustomers);
    } catch (error) {
        console.error('Customers fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

app.post('/api/customers', async (req, res) => {
    try {
        const customer = new Customer({
            name: req.body.name,
            email: req.body.email || null,
            phone: req.body.phone || null,
            visits: req.body.visits || 1,
            lastVisit: req.body.lastVisit || new Date().toISOString().split('T')[0]
        });

        const savedCustomer = await customer.save();
        res.json({ success: true, customer: savedCustomer });
    } catch (error) {
        console.error('Customer creation error:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

app.put('/api/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
                email: req.body.email,
                phone: req.body.phone,
                visits: req.body.visits,
                lastVisit: req.body.lastVisit
            },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ success: true, customer });
    } catch (error) {
        console.error('Customer update error:', error);
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndDelete(req.params.id);

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Customer deletion error:', error);
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// Bookings
app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await Booking.find({}).sort({ date: 1 });

        // Transform MongoDB data to match frontend format
        const transformedBookings = bookings.map(booking => ({
            id: booking._id,
            customerName: booking.customerName,
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone,
            date: booking.date,
            time: booking.time,
            guests: booking.guests,
            tableNumber: booking.tableNumber,
            status: booking.status,
            specialRequests: booking.specialRequests,
            createdAt: booking.createdAt
        }));

        res.json(transformedBookings);
    } catch (error) {
        console.error('Bookings fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

app.post('/api/bookings', async (req, res) => {
    try {
        // Normalize incoming payload (supports both pages' formats)
        const rawDate = req.body.date;
        const rawTime = req.body.time;

        // Date: accept YYYY-MM-DD or MM/DD/YYYY and convert to YYYY-MM-DD
        let normalizedDate = rawDate;
        try {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) {
                normalizedDate = d.toISOString().split('T')[0];
            }
        } catch (e) {
            normalizedDate = rawDate; // fallback
        }

        // Time: accept ranges like "19:30-20:30" and take the start time; ensure HH:MM:SS
        let normalizedTime = rawTime || '';
        if (normalizedTime.includes('-')) {
            normalizedTime = normalizedTime.split('-')[0];
        }
        // Trim AM/PM if ever present (defensive)
        normalizedTime = normalizedTime.replace(/\s?(AM|PM)$/i, '');
        // Ensure HH:MM
        if (/^\d{1,2}:\d{2}$/.test(normalizedTime)) {
            normalizedTime = normalizedTime.padStart(5, '0');
        }
        // Ensure HH:MM:SS
        if (/^\d{1,2}:\d{2}$/.test(normalizedTime)) {
            normalizedTime = `${normalizedTime}:00`;
        } else if (/^\d{1,2}:\d{2}:\d{2}$/.test(normalizedTime) === false) {
            // As a last resort, set to 19:30:00 if parsing failed
            normalizedTime = '19:30:00';
        }

        // Derive and sanitize fields across both forms (landing + detailed page)
        const derivedGuests = Number(
            (req.body.guests ?? req.body.partysize ?? 1)
        ) || 1;

        const derivedNameRaw = (
            req.body.customerName ||
            `${req.body.firstName || ''} ${req.body.lastName || ''}`
        ).trim();
        const derivedName = derivedNameRaw || 'Guest';

        const derivedEmail = (req.body.customerEmail || req.body.email || '').trim() || 'guest@example.com';
        const derivedPhone = (req.body.customerPhone || req.body.phone || '').trim() || null;
        const derivedTable = Number(req.body.tableNumber) || Math.floor(Math.random() * (restaurantData.settings?.tableCount || 20)) + 1;

        const bookingData = {
            customerName: derivedName,
            customerEmail: derivedEmail,
            customerPhone: derivedPhone,
            guests: derivedGuests,
            tableNumber: derivedTable,
            specialRequests: req.body.specialRequests || '',
            date: normalizedDate,
            time: normalizedTime,
            status: req.body.status || 'pending'
        };

        // Always create/update customer record
        try {
            // First check if customer exists by email
            const existingCustomer = await Customer.findOne({ email: bookingData.customerEmail });

            if (existingCustomer) {
                // Update existing customer
                await Customer.findByIdAndUpdate(existingCustomer._id, {
                    visits: (existingCustomer.visits || 0) + 1,
                    lastVisit: new Date().toISOString().split('T')[0],
                    name: bookingData.customerName, // Update name in case it changed
                    phone: bookingData.customerPhone // Update phone in case it changed
                });
            } else {
                // Create new customer
                const newCustomer = new Customer({
                    name: bookingData.customerName,
                    email: bookingData.customerEmail || null,
                    phone: bookingData.customerPhone || null,
                    visits: 1,
                    lastVisit: bookingData.date
                });
                await newCustomer.save();
            }
        } catch (customerError) {
            console.error('Error managing customer:', customerError);
            // Continue even if customer management fails
        }

        // Save booking to MongoDB (remove in-memory storage)
        const booking = new Booking(bookingData);
        const savedBooking = await booking.save();

        // Return booking with MongoDB ObjectId
        res.json({
            success: true,
            booking: {
                id: savedBooking._id.toString(),
                ...bookingData
            }
        });
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

app.put('/api/bookings/:id', async (req, res) => {
    try {
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            {
                customerName: req.body.customerName,
                customerEmail: req.body.customerEmail,
                customerPhone: req.body.customerPhone,
                date: req.body.date,
                time: req.body.time,
                guests: req.body.guests,
                tableNumber: req.body.tableNumber,
                status: req.body.status,
                specialRequests: req.body.specialRequests
            },
            { new: true }
        );

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Transform MongoDB data to match frontend format
        const transformedBooking = {
            id: booking._id,
            customerName: booking.customerName,
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone,
            date: booking.date,
            time: booking.time,
            guests: booking.guests,
            tableNumber: booking.tableNumber,
            status: booking.status,
            specialRequests: booking.specialRequests,
            createdAt: booking.createdAt
        };

        res.json({ success: true, booking: transformedBooking });
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ error: 'Failed to update booking' });
    }
});

app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const booking = await Booking.findByIdAndDelete(req.params.id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

// Analytics
app.get('/api/analytics', async (req, res) => {
    try {
        // Get total bookings count
        const totalBookings = await Booking.countDocuments();

        // Get confirmed bookings for calculations
        const confirmedBookings = await Booking.find({ status: 'confirmed' }, 'guests date time');

        // Calculate average party size
        const averagePartySize = confirmedBookings.length > 0 ?
            confirmedBookings.reduce((sum, booking) => sum + booking.guests, 0) / confirmedBookings.length : 0;

        // Analyze peak hours
        let peakHours = ['7:00 PM', '8:00 PM', '9:00 PM']; // Default fallback
        if (confirmedBookings.length > 0) {
            const timeCounts = {};
            confirmedBookings.forEach(booking => {
                const time = booking.time;
                timeCounts[time] = (timeCounts[time] || 0) + 1;
            });

            // Find the most popular time slots
            const sortedTimes = Object.entries(timeCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([time]) => {
                    // Convert 24-hour format to 12-hour format
                    const [hours, minutes] = time.split(':');
                    const hour = parseInt(hours);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                    return `${displayHour}:${minutes} ${ampm}`;
                });

            if (sortedTimes.length > 0) {
                peakHours = sortedTimes;
            }
        }

        const analytics = {
            totalBookings: totalBookings || 0,
            averagePartySize: Math.round(averagePartySize * 10) / 10, // Round to 1 decimal place
            peakHours: peakHours
        };

        res.json(analytics);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Get booking by ID (for confirmation page)
app.get('/api/bookings/:id', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Transform MongoDB data to match frontend format
        const transformedBooking = {
            id: booking._id,
            customerName: booking.customerName,
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone,
            date: booking.date,
            time: booking.time,
            guests: booking.guests,
            tableNumber: booking.tableNumber,
            status: booking.status,
            specialRequests: booking.specialRequests,
            createdAt: booking.createdAt
        };

        res.json(transformedBooking);
    } catch (error) {
        console.error('Error finding booking:', error);
        res.status(500).json({ error: 'Failed to find booking' });
    }
});

// Send booking confirmation email
app.post('/api/bookings/:id/send-confirmation', async (req, res) => {
    try {
        if (!emailTransporter) {
            return res.status(500).json({ error: 'Email service not configured' });
        }

        const id = req.params.id;

        // First verify the booking exists and get its details
        const booking = await Booking.findById(id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = {
            customerName: booking.customerName,
            customerEmail: booking.customerEmail,
            date: booking.date,
            time: booking.time,
            guests: booking.guests,
            tableNumber: booking.tableNumber
        };

        const { customerEmail, customerName, date, time, guests, tableNumber } = req.body;

        // Use provided data or fallback to booking data
        const emailData = {
            customerName: customerName || booking.customerName,
            customerEmail: customerEmail || booking.customerEmail,
            date: date || booking.date,
            time: time || booking.time,
            guests: guests || booking.guests,
            tableNumber: tableNumber || booking.tableNumber
        };

        if (!emailData.customerEmail) {
            return res.status(400).json({ error: 'Customer email is required' });
        }

        // Create email template
        const emailHtml = createBookingConfirmationEmail({
            customerName: emailData.customerName,
            date: emailData.date,
            time: emailData.time,
            guests: emailData.guests,
            tableNumber: emailData.tableNumber,
            restaurantName: restaurantData.settings.name,
            restaurantAddress: restaurantData.settings.address,
            restaurantPhone: restaurantData.settings.phone
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: emailData.customerEmail,
            subject: `Booking Confirmation - ${restaurantData.settings.name}`,
            html: emailHtml
        };

        await emailTransporter.sendMail(mailOptions);

        res.json({ success: true, message: 'Confirmation email sent successfully' });
    } catch (error) {
        console.error('Error sending confirmation email:', error);
        res.status(500).json({ error: 'Failed to send confirmation email' });
    }
});

// Email template function
function createBookingConfirmationEmail(bookingDetails) {
    const { customerName, date, time, guests, tableNumber, restaurantName, restaurantAddress, restaurantPhone } = bookingDetails;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Booking Confirmation</title>
            <style>
                body { font-family: 'Josefin Sans', sans-serif; background: #0f1d22; color: #C9AB81; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: rgba(42, 42, 42, 0.95); padding: 30px; border-radius: 12px; }
                .header { text-align: center; margin-bottom: 30px; }
                .header h1 { color: #C9AB81; margin: 0; font-size: 28px; }
                .success-icon { font-size: 48px; color: #059669; margin-bottom: 15px; }
                .booking-details { background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 8px; margin: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid rgba(201, 171, 129, 0.2); }
                .detail-label { font-weight: 600; }
                .detail-value { color: #C9AB81; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(201, 171, 129, 0.3); }
                .restaurant-info { margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✓</div>
                    <h1>Booking Confirmed!</h1>
                    <p>Your reservation has been confirmed by our restaurant.</p>
                </div>

                <div class="booking-details">
                    <h2>Reservation Details</h2>
                    <div class="detail-row">
                        <span class="detail-label">Customer:</span>
                        <span class="detail-value">${customerName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Time:</span>
                        <span class="detail-value">${time}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Party Size:</span>
                        <span class="detail-value">${guests} ${guests === 1 ? 'Guest' : 'Guests'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Table:</span>
                        <span class="detail-value">${tableNumber}</span>
                    </div>
                </div>

                <div class="restaurant-info">
                    <h3>${restaurantName}</h3>
                    <p><strong>Address:</strong> ${restaurantAddress}</p>
                    <p><strong>Phone:</strong> ${restaurantPhone}</p>
                </div>

                <div class="footer">
                    <p>Thank you for choosing ${restaurantName}!</p>
                    <p>We look forward to serving you.</p>
                    <p style="margin-top: 20px; font-size: 14px; color: rgba(201, 171, 129, 0.7);">
                        If you need to make any changes to your reservation, please contact us directly.
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Configure multer for file uploads (moved before routes)
const multer = require('multer');

// Create uploads directory if it doesn't exist (moved to top level)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// PDF upload functionality for menu items

// PDF upload endpoint with error handling
app.post('/api/menu/:id/pdf', (req, res, next) => {
    upload.single('menuPdf')(req, res, function(err) {
        if (err) {
            console.error('Multer error:', err);
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
                }
            }
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        console.log('PDF upload request received');
        console.log('Menu item ID:', req.params.id);
        console.log('File info:', req.file ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            filename: req.file.filename
        } : 'No file received');

        if (!req.file) {
            console.log('No file received in request');
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const menuItemId = req.params.id;

        if (supabase) {
            try {
                // Handle special menu types (food_menu, wine_menu)
                let menuTitle = menuItemId;
                if (menuItemId === 'food_menu') {
                    menuTitle = 'Food Menu';
                } else if (menuItemId === 'wine_menu') {
                    menuTitle = 'Wine Menu';
                } else {
                    menuTitle = `Menu Item ${menuItemId}`;
                }

                // Store PDF metadata in menu_pdfs table with menu_item_id
                // Use the original filename as the title when no title is provided
                const pdfTitle = req.file.originalname;
                console.log('Attempting to insert PDF data:', {
                    title: pdfTitle,
                    menu_title: menuTitle,
                    filename: req.file.filename,
                    file_path: path.join(uploadsDir, req.file.filename),
                    file_size: req.file.size,
                    mime_type: req.file.mimetype
                });

                const { data: pdfData, error: pdfError } = await supabase
                    .from('menu_pdfs')
                    .insert([{
                        title: pdfTitle,
                        menu_title: menuTitle,
                        filename: req.file.filename,
                        file_path: path.join(uploadsDir, req.file.filename),
                        file_size: req.file.size,
                        mime_type: req.file.mimetype,
                        uploaded_by: null, // For now, we'll set this later when we have user auth
                        is_active: true
                    }])
                    .select()
                    .single();

                if (pdfError) {
                    console.error('Supabase insert error:', pdfError);
                    return res.status(500).json({ error: 'Failed to store PDF metadata in database: ' + pdfError.message });
                }

                console.log('PDF data inserted successfully:', pdfData);

                res.json({
                    success: true,
                    message: 'PDF uploaded successfully',
                    pdfId: pdfData.id,
                    pdfFile: {
                        id: pdfData.id,
                        filename: req.file.filename,
                        originalName: req.file.originalname,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        uploadDate: pdfData.uploaded_at
                    }
                });
            } catch (dbError) {
                console.error('Database operation error:', dbError);
                return res.status(500).json({ error: 'Database operation failed: ' + dbError.message });
            }
        } else {
            console.log('Supabase not available, using fallback');
            // Fallback to local storage if Supabase is not available
            const menuItemIndex = restaurantData.menuItems.findIndex(item => item.id === menuItemId);

            if (menuItemIndex === -1) {
                return res.status(404).json({ error: 'Menu item not found' });
            }

            // Save file info to menu item
            restaurantData.menuItems[menuItemIndex].pdfFile = {
                filename: req.file.filename,
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                uploadDate: new Date().toISOString()
            };

            res.json({
                success: true,
                message: 'PDF uploaded successfully',
                pdfFile: restaurantData.menuItems[menuItemIndex].pdfFile
            });
        }
    } catch (error) {
        console.error('Error uploading PDF:', error);
        res.status(500).json({ error: 'Failed to upload PDF: ' + error.message });
    }
});

// Get PDF file endpoint
app.get('/api/menu/:id/pdf', async (req, res) => {
    try {
        const menuItemId = req.params.id; // Keep as string since it could be 'food_menu' or 'wine_menu'

        if (supabase) {
            // Handle special menu types (food_menu, wine_menu)
            let menuTitle = menuItemId;
            if (menuItemId === 'food_menu') {
                menuTitle = 'Food Menu';
            } else if (menuItemId === 'wine_menu') {
                menuTitle = 'Wine Menu';
            } else {
                menuTitle = `Menu Item ${menuItemId}`;
            }

            // Find PDF by menu_title field
            const { data: pdfData, error: pdfError } = await supabase
                .from('menu_pdfs')
                .select('*')
                .eq('menu_title', menuTitle)
                .eq('is_active', true)
                .single();

            if (pdfError || !pdfData) {
                return res.status(404).json({ error: 'PDF not found for this menu item' });
            }

            const filePath = path.join(uploadsDir, pdfData.filename);

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'PDF file not found on server' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${pdfData.title}"`);

            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        } else {
            // Fallback to local storage
            const menuItem = restaurantData.menuItems.find(item => item.id === menuItemId);

            if (!menuItem || !menuItem.pdfFile) {
                return res.status(404).json({ error: 'PDF not found for this menu item' });
            }

            const filePath = path.join(uploadsDir, menuItem.pdfFile.filename);

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'PDF file not found on server' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${menuItem.pdfFile.originalName}"`);

            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        }
    } catch (error) {
        console.error('Error serving PDF:', error);
        res.status(500).json({ error: 'Failed to serve PDF' });
    }
});

// Delete PDF endpoint
app.delete('/api/menu/:id/pdf', async (req, res) => {
    try {
        const menuItemId = req.params.id; // Keep as string since it could be 'food_menu' or 'wine_menu'

        if (supabase) {
            // Handle special menu types (food_menu, wine_menu)
            let menuTitle = menuItemId;
            if (menuItemId === 'food_menu') {
                menuTitle = 'Food Menu';
            } else if (menuItemId === 'wine_menu') {
                menuTitle = 'Wine Menu';
            } else {
                menuTitle = `Menu Item ${menuItemId}`;
            }

            // Find PDF by menu_title field
            const { data: pdfData, error: pdfError } = await supabase
                .from('menu_pdfs')
                .select('*')
                .eq('menu_title', menuTitle)
                .eq('is_active', true)
                .single();

            if (pdfError || !pdfData) {
                return res.status(404).json({ error: 'PDF not found for this menu item' });
            }

            // Delete file from filesystem
            const filePath = path.join(uploadsDir, pdfData.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Delete PDF record from database
            const { error: deleteError } = await supabase
                .from('menu_pdfs')
                .delete()
                .eq('id', pdfData.id);

            if (deleteError) {
                console.error('Error deleting PDF from database:', deleteError);
                return res.status(500).json({ error: 'Failed to delete PDF from database' });
            }

            res.json({ success: true, message: 'PDF deleted successfully' });
        } else {
            // Fallback to local storage
            const menuItemIndex = restaurantData.menuItems.findIndex(item => item.id === menuItemId);

            if (menuItemIndex === -1) {
                return res.status(404).json({ error: 'Menu item not found' });
            }

            if (restaurantData.menuItems[menuItemIndex].pdfFile) {
                // Delete file from filesystem
                const filePath = path.join(uploadsDir, restaurantData.menuItems[menuItemIndex].pdfFile.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }

                // Remove PDF info from menu item
                delete restaurantData.menuItems[menuItemIndex].pdfFile;
            }

            res.json({ success: true, message: 'PDF deleted successfully' });
        }
    } catch (error) {
        console.error('Error deleting PDF:', error);
        res.status(500).json({ error: 'Failed to delete PDF' });
    }
});

// Serve uploaded PDFs statically
app.use('/uploads', express.static(uploadsDir));

// Admin-only: Clear all datasets (database + in-memory)
app.post('/api/admin/clear', authenticateAdmin, async (req, res) => {
    try {
        // Clear MongoDB collections
        try {
            await Booking.deleteMany({});
            await Customer.deleteMany({});
            await MenuPdf.deleteMany({});
            await Settings.deleteMany({});
            await TimeSlotSettings.deleteMany({});
            console.log('MongoDB collections cleared');
        } catch (dbErr) {
            console.error('MongoDB clear error:', dbErr);
        }

        // Reset in-memory datasets
        restaurantData.bookings = [];
        restaurantData.customers = [];
        restaurantData.menuItems = [];

        return res.json({ success: true, message: 'All datasets cleared.' });
    } catch (err) {
        console.error('Admin clear error:', err);
        return res.status(500).json({ success: false, error: 'Failed to clear datasets' });
    }
});

// Serve static files
app.use(express.static('pages/restaurant_clone/restaurant_clone'));

// Start server
app.listen(PORT, () => {
    console.log(`Restaurant Management API running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin-login.html`);
    console.log(`Main site: http://localhost:${PORT}/index.html`);
});

module.exports = app;
