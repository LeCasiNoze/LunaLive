export const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
