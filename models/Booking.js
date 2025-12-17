const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    customerName: {
        type: String,
        required: true,
        trim: true
    },
    customerEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    customerPhone: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String, // Storing as "HH:MM:SS" format
        required: true
    },
    guests: {
        type: Number,
        required: true,
        min: 1,
        max: 20
    },
    tableNumber: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    specialRequests: {
        type: String,
        default: ''
    }
}, {
    timestamps: true // Creates createdAt and updatedAt
});

// Indexes for faster queries
bookingSchema.index({ date: 1, status: 1 });
bookingSchema.index({ customerEmail: 1 });
bookingSchema.index({ status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
