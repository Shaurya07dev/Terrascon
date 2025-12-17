/**
 * Seed Script for MongoDB Database
 * Run this ONCE after setting up MongoDB to populate initial data
 * 
 * Usage: node scripts/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Booking = require('../models/Booking');
const Settings = require('../models/Settings');

const connectDB = require('../config/database');

async function seedDatabase() {
    try {
        console.log('🌱 Starting database seed...\n');

        // Connect to MongoDB
        await connectDB();

        // Clear existing data (CAUTION: This deletes all data!)
        console.log('🗑️  Clearing existing data...');
        await User.deleteMany({});
        await Customer.deleteMany({});
        await Booking.deleteMany({});
        await Settings.deleteMany({});

        // Create Admin User
        console.log('👤 Creating admin user...');
        const adminUser = await User.create({
            username: 'admin',
            password: 'admin123', // Will be hashed automatically by the model
            name: 'Restaurant Admin',
            role: 'admin'
        });
        console.log(`✅ Admin user created: ${adminUser.username}`);

        // Create Settings
        console.log('\n⚙️  Creating restaurant settings...');
        const settings = await Settings.create({
            restaurantName: 'Laurent Restaurant',
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
        });
        console.log('✅ Settings created');

        // Create Sample Customers
        console.log('\n👥 Creating sample customers...');
        const customers = await Customer.insertMany([
            {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '+1 234 567 8900',
                visits: 5,
                lastVisit: new Date('2025-08-28')
            },
            {
                name: 'Jane Smith',
                email: 'jane@example.com',
                phone: '+1 234 567 8901',
                visits: 3,
                lastVisit: new Date('2025-08-25')
            },
            {
                name: 'Mike Johnson',
                email: 'mike@example.com',
                phone: '+1 234 567 8902',
                visits: 8,
                lastVisit: new Date('2025-08-30')
            },
            {
                name: 'Sarah Wilson',
                email: 'sarah@example.com',
                phone: '+1 234 567 8903',
                visits: 2,
                lastVisit: new Date('2025-08-20')
            }
        ]);
        console.log(`✅ ${customers.length} customers created`);

        // Create Sample Bookings
        console.log('\n📅 Creating sample bookings...');
        const bookings = await Booking.insertMany([
            {
                customerName: 'John Doe',
                customerEmail: 'john@example.com',
                customerPhone: '+1 234 567 8900',
                date: new Date('2025-09-01'),
                time: '19:30:00',
                guests: 4,
                tableNumber: 5,
                status: 'confirmed',
                specialRequests: 'Anniversary dinner'
            },
            {
                customerName: 'Jane Smith',
                customerEmail: 'jane@example.com',
                customerPhone: '+1 234 567 8901',
                date: new Date('2025-09-03'),
                time: '20:00:00',
                guests: 2,
                tableNumber: 3,
                status: 'pending',
                specialRequests: 'Vegetarian options'
            }
        ]);
        console.log(`✅ ${bookings.length} bookings created`);

        console.log('\n✨ Database seed completed successfully!\n');
        console.log('📝 Summary:');
        console.log(`   - Admin user: ${adminUser.username} / admin123`);
        console.log(`   - Customers: ${customers.length}`);
        console.log(`   - Bookings: ${bookings.length}`);
        console.log(`   - Settings: Created\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed error:', error);
        process.exit(1);
    }
}

// Run the seed
seedDatabase();
