const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    restaurantName: {
        type: String,
        default: 'Laurent Restaurant'
    },
    address: {
        type: String,
        default: '123 Main Street, City, State 12345'
    },
    phone: {
        type: String,
        default: '+1 (555) 123-4567'
    },
    maxPartySize: {
        type: Number,
        default: 12
    },
    bookingAdvanceDays: {
        type: Number,
        default: 30
    },
    tableCount: {
        type: Number,
        default: 20
    },
    operatingHours: {
        weekdays: {
            type: String,
            default: '11:00 AM - 10:00 PM'
        },
        weekends: {
            type: String,
            default: '11:00 AM - 11:00 PM'
        },
        sunday: {
            type: String,
            default: '12:00 PM - 9:00 PM'
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema);
