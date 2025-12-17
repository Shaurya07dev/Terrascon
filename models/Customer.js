const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true
    },
    visits: {
        type: Number,
        default: 0
    },
    lastVisit: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for faster lookups
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });

module.exports = mongoose.model('Customer', customerSchema);
