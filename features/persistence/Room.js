const mongoose = require("mongoose");

// Persistence-only shape. No socket objects are ever stored here —
// "users" is just a snapshot of display names for the room.
const roomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    canvasState: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    hostId: {
        type: String,
        default: null
    },
    users: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastSavedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Room", roomSchema);
