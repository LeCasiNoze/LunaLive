export function emitUserToast(io, userId, toast) {
    if (!userId)
        return;
    io.to(`user:${userId}`).emit("ui:toast", toast);
}
