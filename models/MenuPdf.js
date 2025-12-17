const mongoose = require('mongoose');

const menuPdfSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    menuTitle: {
        type: String, // 'Food Menu', 'Wine Menu', or 'Menu Item X'
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    mimeType: {
        type: String,
        default: 'application/pdf'
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for faster queries
menuPdfSchema.index({ menuTitle: 1, isActive: 1 });

module.exports = mongoose.model('MenuPdf', menuPdfSchema);
