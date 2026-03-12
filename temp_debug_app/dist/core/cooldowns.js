export class Cooldowns {
    m = new Map(); // key -> expiresAtMs
    allow(key, cooldownSec) {
        const now = Date.now();
        const exp = this.m.get(key) ?? 0;
        if (exp > now)
            return false;
        this.m.set(key, now + cooldownSec * 1000);
        return true;
    }
    gc() {
        const now = Date.now();
        for (const [k, v] of this.m)
            if (v <= now)
                this.m.delete(k);
    }
}
