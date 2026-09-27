const Room = require('./Room');

const AUTOSAVE_INTERVAL_MS = 30 * 1000;

// RoomModel is injectable so tests can run without MongoDB
function createPersistence(roomData, RoomModel = Room) {

    //  Mongo persistence helper - only ever writes the latest canvasState,
    //  never called from draw/mousemove/cursor events
    async function saveRoomState(roomId) {
        const room = roomData[roomId];
        if (!room) return;
        try {
            await RoomModel.findOneAndUpdate(
                { roomId },
                {
                    $set: {
                        canvasState: room.canvasState,
                        hostId: room.hostId,
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
        }
    }

    // create the MongoDB document for this room if it doesn't exist yet
    async function ensureRoomDoc(roomId, hostId, userName) {
        try {
            const existing = await RoomModel.findOne({ roomId });
            if (!existing) {
                await RoomModel.create({
                    roomId,
                    canvasState: null,
                    hostId,
                    users: [userName]
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

    //  Autosave: every 30s, persist only the latest canvasState per active room
    function startAutosave() {
        return setInterval(() => {
            Object.keys(roomData).forEach(roomId => {
                saveRoomState(roomId);
            });
        }, AUTOSAVE_INTERVAL_MS);
    }

    return { saveRoomState, ensureRoomDoc, loadRoom, startAutosave };
}

module.exports = { createPersistence, AUTOSAVE_INTERVAL_MS };
