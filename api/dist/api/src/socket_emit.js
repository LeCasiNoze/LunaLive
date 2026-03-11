function slugRoom(slug) {
    return String(slug || "").trim().toLowerCase();
}
export function emitChatAll(io, slug, event, payload) {
    const s = slugRoom(slug);
    io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit(event, payload);
}
export function emitStream(io, slug, event, payload) {
    const s = slugRoom(slug);
    io.to(`stream:${s}`).emit(event, payload);
}
// si tu veux “tout le monde” (chat + stream)
export function emitChatAndStream(io, slug, event, payload) {
    emitChatAll(io, slug, event, payload);
    emitStream(io, slug, event, payload);
}
