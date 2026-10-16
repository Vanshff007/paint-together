const Room = require('./Room');

const AUTOSAVE_INTERVAL_MS = 30 * 1000;
// MongoDB documents max out at 16 MB; the canvas itself can take ~6 MB
const MAX_HISTORY_BYTES = 8 * 1024 * 1024;

// the room's undo/redo history to save, or null when there is none or it is too big.
// ponytail: too big = not saved, so a restored room starts its history from the canvas.
function savableHistory(room) {
    if (!room.history) return null;
    const { compacting, ...history } = room.history;
    return JSON.stringify(history).length <= MAX_HISTORY_BYTES ? history : null;
}

// RoomModel is injectable so tests can run without MongoDB
function createPersistence(roomData, RoomModel = Room) {

    //  Mongo persistence helper - only ever writes the latest canvasState,
    //  never called from draw/mousemove/cursor events
    async function saveRoomState(roomId) {
        const room = roomData[roomId];
        if (!room) return;
        // cleared before the write, so a change during the write is saved next time
        room.dirty = false;
        try {
            await RoomModel.findOneAndUpdate(
                { roomId },
                {
                    $set: {
                        canvasState: room.canvasState,
                        hostId: room.hostId,
                        passwordHash: room.passwordHash || null,
                        chat: room.chat || [],
                        history: savableHistory(room),
                        members: room.members || [],
                        banned: room.banned || [],
                        bannedIps: (room.bannedIps || []).filter(b => b.until > Date.now()),
                        users: Object.values(room.users).map(u => u.name),
                        updatedAt: new Date(),
                        lastSavedAt: new Date()
                    },
                    $setOnInsert: { createdAt: new Date() }
                },
                { upsert: true }
            );
        } catch (err) {
            console.error(`❌ Failed to save room ${roomId} to MongoDB:`, err);
            room.dirty = true;
        }
    }

    // create the MongoDB document for this room if it doesn't exist yet
    async function ensureRoomDoc(roomId, hostId, userName, passwordHash = null) {
        try {
            const existing = await RoomModel.findOne({ roomId });
            if (!existing) {
                await RoomModel.create({
                    roomId,
                    canvasState: null,
                    hostId,
                    users: [userName],
                    passwordHash
                });
            }
        } catch (err) {
            console.error(`❌ Failed to create MongoDB document for room ${roomId}:`, err);
        }
    }

    // returns the stored room document, or null if missing or on error
    async function loadRoom(roomId) {
        try {
            return await RoomModel.findOne({ roomId });
        } catch (err) {
            console.error(`❌ Failed to restore room ${roomId} from MongoDB:`, err);
            return null;
        }
    }

    //  Autosave: every 30s, persist the latest canvasState of rooms that changed
    function startAutosave() {
        return setInterval(() => {
            Object.keys(roomData).forEach(roomId => {
                if (roomData[roomId].dirty) saveRoomState(roomId);
            });
        }, AUTOSAVE_INTERVAL_MS);
    }

    return { saveRoomState, ensureRoomDoc, loadRoom, startAutosave };
}

module.exports = { createPersistence, savableHistory, AUTOSAVE_INTERVAL_MS, MAX_HISTORY_BYTES };
