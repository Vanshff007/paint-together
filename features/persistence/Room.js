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
    // last 50 chat messages (features/chat), so a restored room keeps its conversation
    chat: {
        type: [{ _id: false, author: String, text: String }],
        default: []
    },
    // salted scrypt hash "salt:hash" (features/passwords), null for an open room
    passwordHash: {
        type: String,
        default: null
    },
    users: {
        type: [String],
        default: []
    },
    // undo/redo history (features/history): { baseState, ops, nextId, redo }, null if too big
    history: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // browser ids that got in (skip the password), kicked browser ids, and 1-hour IP bans
    members: { type: [String], default: [] },
    banned: { type: [String], default: [] },
    bannedIps: {
        type: [{ _id: false, ip: String, until: Number }],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now,
        // TTL index: MongoDB deletes rooms not saved for 30 days
        expires: '30d'
    },
    lastSavedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Room", roomSchema);
