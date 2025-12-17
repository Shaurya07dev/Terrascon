const mongoose = require('mongoose');

const timeSlotSettingsSchema = new mongoose.Schema({
    // Optional date (YYYY-MM-DD). When absent, treated as global default
    date: {
        type: String,
        index: true,
        default: null
    },
    slotSettings: {
        type: Map,
        of: Boolean, // true = available, false = unavailable
        default: new Map()
    }
}, {
    timestamps: true
});

// Initialize with default time slots if no settings exist
timeSlotSettingsSchema.pre('save', function(next) {
    if (this.isNew && !this.slotSettings.size) {
        const defaultSlots = [
            '07:30-08:30', '08:30-09:30', '09:30-10:30',
            '12:00-13:00', '13:00-14:00', '13:30-14:30',
            '15:30-16:30', '16:30-17:30',
            '17:30-18:30', '18:30-19:30',
            '19:30-20:30', '20:30-21:30', '21:30-22:30'
        ];

        defaultSlots.forEach(slot => {
            this.slotSettings.set(slot, true);
        });
    }
    next();
});

module.exports = mongoose.model('TimeSlotSettings', timeSlotSettingsSchema);
