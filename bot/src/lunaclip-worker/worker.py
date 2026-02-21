#!/usr/bin/env python3
"""
LunaClip Worker v2.0
- Qualité OCR maximale : 960x540, scale=4, psm=6
- Préprocessing avancé : netteté (unsharp mask) + threshold adaptatif
- Détection MISE contextuelle (ancre sur CREDIT, ligne pragmatic)
- Blacklist promo étendue : PACK, BIENVENU, BEAST, WINBEAST, etc.
- ACTIVE / WATCHING / IDLE modes
- OCR debug complet (raw_ocr, filtered_ocr, parse_debug, removed_lines)
"""

import cv2
import numpy as np
import pytesseract
from PIL import Image
import re, json, os, sys, argparse, time, signal
from datetime import datetime
import subprocess

# ═══════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════

SCAN_TOP    = 0.50
SCAN_BOTTOM = 0.98
SCAN_LEFT   = 0.05
SCAN_RIGHT  = 0.95

# ✅ v1.9 : qualité maximale — réduire si CPU trop chargé
SCALE    = 4
PSM_MODE = 6      # bloc de texte uniforme, meilleur pour overlays

# ✅ v1.9 : résolution source haute
FRAME_W = 960
FRAME_H = 540

MAX_WIN_DROP_RATIO    = 0.50
MIN_DECIMAL_THRESHOLD = 10.0
BET_MIN               = 0.01
BET_MAX               = 10000.0
EVENT_RESET_THRESHOLD = 50.0
RECONNECT_DELAY_SEC   = 5

INTERVAL_ACTIVE   = 2.0
INTERVAL_WATCHING = 30.0
INTERVAL_IDLE     = 120.0
COOLDOWN_INTERVAL = 0.5
COOLDOWN_DURATION = 30.0

UNKNOWN_FRAMES_TO_WATCH = 10
NO_VALUE_SECS_TO_IDLE   = 300

# Pause post-OCR : légèrement plus long car frames plus lourdes à traiter
POST_OCR_SLEEP = 0.15

# ─────────────────────────────────────────────
# Mots clés jeu — seul filtre : si une ligne ne
# contient aucun de ces mots → [HORS_CONTEXTE]
# Pas de blacklist : tout ce qui n'est pas jeu
# est ignoré automatiquement.
# ─────────────────────────────────────────────
# Mots qui définissent le contexte jeu
GAME_WORDS = [
    "BET", "MISE",
    "WIN", "WINS",
    "GAIN", "GAINS", "GAIN_TOTAL", "WIN_TOTAL",
    "CREDIT",
    "FREE_SPINS", "FREE SPINS",
    "MULTIPLIER", "MULT",
    "SOLDE_CREDIT", "BALANCE",
]
_GAME_RE = re.compile(
    r'\b(' + '|'.join(re.escape(w) for w in GAME_WORDS) + r')\b',
    re.IGNORECASE
)


def open_ffmpeg_pipe(hls_url: str, w: int = FRAME_W, h: int = FRAME_H):
    headers = (
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36\r\n"
        "Referer: https://dlive.tv/\r\n"
        "Origin: https://dlive.tv\r\n"
        "Accept: */*\r\n"
        "Accept-Language: en-US,en;q=0.9\r\n"
    )
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-headers", headers,
        "-i", hls_url,
        "-vf", f"scale={w}:{h}",
        "-an", "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1",
    ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


# ═══════════════════════════════════════════════
#  OUTPUT
# ═══════════════════════════════════════════════

def emit(type_: str, data: dict):
    print(json.dumps({"type": type_, "data": data}), flush=True)

def emit_frame(frame_data: dict):
    emit("frame", frame_data)

def emit_event(frame_data: dict, screenshot_path: str | None):
    emit("event", {"frame": frame_data, "screenshot_path": screenshot_path})

def emit_log(msg: str):
    print(json.dumps({"type": "log", "data": msg}), flush=True)

def emit_mode(mode: str, reason: str):
    emit("mode", {"mode": mode, "reason": reason})


# ═══════════════════════════════════════════════
#  PRÉPROCESSING IMAGE — v1.9
# ═══════════════════════════════════════════════

def preprocess(crop_bgr):
    # 1. Upscale avec LANCZOS4 — meilleure qualité que INTER_CUBIC
    big = cv2.resize(crop_bgr, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_LANCZOS4)

    # 2. Niveaux de gris
    gray = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)

    # 3. ✅ Unsharp mask — accentue les contours des caractères
    kernel = np.array([
        [ 0, -1,  0],
        [-1,  5, -1],
        [ 0, -1,  0],
    ], dtype=np.float32)
    sharpened = cv2.filter2D(gray, -1, kernel)

    # 4. ✅ Threshold adaptatif — s'adapte aux variations de luminosité de l'overlay
    thresh = cv2.adaptiveThreshold(
        sharpened, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=31,
        C=10,
    )

    # 5. Nettoyage morphologique léger (supprime pixels isolés)
    kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_clean)

    return thresh


def ocr_text(thresh):
    return pytesseract.image_to_string(
        Image.fromarray(thresh),
        config=f"--psm {PSM_MODE} --oem 1"
    )


# ═══════════════════════════════════════════════
#  FILTRAGE LIGNES OCR
# ═══════════════════════════════════════════════

def filter_ocr_lines(raw: str):
    """
    ✅ v2.0 : filtrage par whitelist pure — aucune blacklist.
    Une ligne est gardée si et seulement si elle contient
    au moins un mot du contexte jeu : BET, MISE, WIN, GAIN,
    GAIN_TOTAL, WIN_TOTAL, CREDIT, FREE_SPINS, MULTIPLIER…
    Tout le reste (promos, chat, overlay stream) est ignoré
    automatiquement sans avoir besoin de le nommer.
    """
    lines   = raw.split('\n')
    kept    = []
    removed = []

    for line in lines:
        stripped = line.strip()

        if len(stripped) < 3:
            continue

        if _GAME_RE.search(stripped):
            kept.append(stripped)
        else:
            removed.append(f"[HORS_CONTEXTE] {stripped}")

    return '\n'.join(kept), removed



# ═══════════════════════════════════════════════
#  PARSING
# ═══════════════════════════════════════════════

def fuzzy_fix(text):
    text = re.sub(r'GAIN\s+TOTAL',  'GAIN_TOTAL', text, flags=re.IGNORECASE)
    text = re.sub(r'WIN\s+TOTAL',   'WIN_TOTAL',  text, flags=re.IGNORECASE)
    text = re.sub(r'TOURS?\s+GRATUITE?S?(\s+RESTANTES?)?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'PARTIES?\s+GRATUITE?S?(\s+RESTANTES?)?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'FREE\s+SPINS?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'\bSOLDE\b',   'SOLDE_CREDIT', text, flags=re.IGNORECASE)
    text = re.sub(r'\bBALANCE\b', 'SOLDE_CREDIT', text, flags=re.IGNORECASE)
    text = re.sub(r'\bBE[L1Il|]\b',      'BET',  text, flags=re.IGNORECASE)
    text = re.sub(r'\bB[E3][T7]\b',      'BET',  text, flags=re.IGNORECASE)
    text = re.sub(r'\bMl[S5]E\b',        'MISE', text, flags=re.IGNORECASE)
    text = re.sub(r'\bMIS[E3]\b',        'MISE', text, flags=re.IGNORECASE)
    text = re.sub(r'\bM[lI1][S5][E3]\b', 'MISE', text, flags=re.IGNORECASE)
    text = re.sub(r'\bGA[Il1]NS\b',  'GAINS', text, flags=re.IGNORECASE)
    text = re.sub(r'\bW[Il1][Nn]\b', 'WIN',   text, flags=re.IGNORECASE)
    return text


def clean_raw_value(raw):
    v = re.sub(r'\s*\n\s*', '', raw)
    v = re.sub(r'\s{2,}', ' ', v)
    return v.strip()


def has_decimal_in_raw(raw):
    return bool(re.search(r'\d\s*[,.]\s*\d', raw))


def extract_numeric(raw):
    s = re.sub(r'[€$£]', '', raw)
    s = re.sub(r'\n', ' ', s).strip()
    m = re.match(r'^([\d][\d\s]*)[,\.](\s*\d{1,3})\s*$', s)
    if m:
        entier  = re.sub(r'\s', '', m.group(1))
        decimal = re.sub(r'\s', '', m.group(2))
        try:    return float(f"{entier}.{decimal}")
        except: pass
    try:    return float(re.sub(r'\s', '', s).replace(',', '.'))
    except: return None


def find_label(text, keywords):
    kw = '|'.join(re.escape(k) for k in keywords)
    for pat in [
        rf'(?i)\b({kw})\b\s*([€$£]?\s*[\d\s]+[,\.][\s\n]*\d{{2}}\s*[€$£]?)',
        rf'(?i)\b({kw})\b\s*([€$£]?\s*\d{{1,7}}[.,]\d{{1,3}})',
        rf'(?i)\b({kw})\b\s*([€$£]?\s*\d{{1,7}})',
    ]:
        m = re.search(pat, text)
        if m:
            raw = m.group(2).strip()
            num = extract_numeric(raw)
            if num is not None:
                return {"label": m.group(1).upper(), "value": clean_raw_value(raw), "numeric": num}
    return None


def find_mise_contextuel(text):
    """
    ✅ v1.9 : Recherche MISE contextuelle pour Pragmatic.
    CREDIT et MISE sont souvent sur la même ligne : "CREDIT 1 392,84 € MISE 1,60 €"
    On utilise CREDIT comme ancre pour localiser MISE à proximité.
    On ne retourne jamais CREDIT comme valeur de BET.
    """
    # Pattern : "CREDIT [montant] MISE [montant]" sur la même ligne
    pat = r'(?i)CREDIT\s+[\d\s,\.€$£]+\s+MISE\s+([€$£]?\s*[\d\s]+[,\.]\d{1,3}\s*[€$£]?)'
    m = re.search(pat, text)
    if m:
        raw = m.group(1).strip()
        num = extract_numeric(raw)
        if num is not None and BET_MIN <= num <= BET_MAX:
            return {"label": "MISE", "value": clean_raw_value(raw), "numeric": num}

    # Fallback : MISE dans les 120 chars suivant CREDIT
    idx = text.upper().find("CREDIT")
    if idx >= 0:
        window = text[idx:idx + 120]
        m2 = re.search(
            r'(?i)\bMISE\b\s*([€$£]?\s*[\d\s]+[,\.]\d{1,3}\s*[€$£]?)',
            window
        )
        if m2:
            raw = m2.group(1).strip()
            num = extract_numeric(raw)
            if num is not None and BET_MIN <= num <= BET_MAX:
                return {"label": "MISE", "value": clean_raw_value(raw), "numeric": num}

    return None


def detect_provider(text):
    t = text.upper()
    if any(k in t for k in ['GAIN_TOTAL', 'WIN_TOTAL', 'SOLDE_CREDIT']):
        return 'hacksaw'
    if 'CREDIT' in t:
        return 'pragmatic'
    return 'unknown'


def detect_bonus(text):
    return 'FREE_SPINS' in text.upper()


def parse_frame_text(raw_ocr):
    filtered_text, removed_lines = filter_ocr_lines(raw_ocr)
    text     = fuzzy_fix(filtered_text)
    provider = detect_provider(text)
    in_bonus = detect_bonus(text)

    # Recherche BET/MISE standard
    bet_found = find_label(text, ["BET", "MISE"])

    # ✅ v1.9 : si pas trouvé + provider pragmatic → recherche contextuelle
    # On cherche aussi dans le texte brut car CREDIT peut avoir été filtré
    if not bet_found and provider == 'pragmatic':
        raw_fixed = fuzzy_fix(raw_ocr)
        bet_found = find_mise_contextuel(raw_fixed) or find_mise_contextuel(text)

    result = {
        "provider":          provider,
        "in_bonus":          in_bonus,
        "bet":               bet_found,
        "win":               None,
        "win_total":         None,
        "free_spins":        None,
        "multiplier_source": None,
        "_removed_lines":    removed_lines,
    }

    if provider == 'hacksaw':
        result["win"]       = find_label(text, ["GAIN", "WIN"])
        result["win_total"] = find_label(text, ["GAIN_TOTAL", "WIN_TOTAL"])
        fs = re.search(r'\bFREE_SPINS\b\s*(\d+)', text, re.IGNORECASE)
        if fs: result["free_spins"] = int(fs.group(1))
        result["multiplier_source"] = "win_total" if (in_bonus and result["win_total"]) else "win"
    elif provider == 'pragmatic':
        result["win"]               = find_label(text, ["WIN", "GAINS"])
        result["multiplier_source"] = "win"
    else:
        result["win"]               = find_label(text, ["WIN", "GAINS", "GAIN"])
        result["multiplier_source"] = "win"

    return result, filtered_text


# ═══════════════════════════════════════════════
#  VALIDATION
# ═══════════════════════════════════════════════

def validate_bet(bet, prev_num):
    if not bet:                    return False, "no_bet"
    n = bet["numeric"]
    if n is None:                  return False, "not_numeric"
    if n < BET_MIN or n > BET_MAX: return False, f"out_of_range({n})"
    if prev_num and prev_num > 0 and abs(n - prev_num) / prev_num > 0.5:
        return False, f"spike_vs_prev({prev_num})"
    return True, "ok"


def validate_win(win, prev_num):
    if not win:   return False, "no_win"
    n   = win["numeric"]
    raw = win["value"]
    if n is None: return False, "not_numeric"
    if n > MIN_DECIMAL_THRESHOLD and not has_decimal_in_raw(raw):
        return False, f"missing_decimal({raw})"
    if prev_num is not None and prev_num > 0 and n > 0:
        drop = (prev_num - n) / prev_num
        if drop > MAX_WIN_DROP_RATIO:
            return False, f"drop_too_large({drop:.2f})"
    return True, "ok"


# ═══════════════════════════════════════════════
#  ANALYSE D'UN FRAME
# ═══════════════════════════════════════════════

def analyze_frame(frame_bgr, state: dict) -> dict:
    h, w = frame_bgr.shape[:2]
    crop = frame_bgr[
        int(h * SCAN_TOP):int(h * SCAN_BOTTOM),
        int(w * SCAN_LEFT):int(w * SCAN_RIGHT),
    ]
    raw_text = ocr_text(preprocess(crop))
    parsed, filtered_text = parse_frame_text(raw_text)

    debug_reasons = {}

    if parsed["provider"] != 'unknown':
        state["provider"] = parsed["provider"]
    elif state.get("provider"):
        parsed["provider"] = state["provider"]

    bet_ok, bet_reason = validate_bet(parsed["bet"], state.get("prev_bet_num"))
    debug_reasons["bet"] = bet_reason
    bet = parsed["bet"] if bet_ok else None
    if bet:
        state["current_bet"]  = bet
        state["prev_bet_num"] = bet["numeric"]
    effective_bet = bet or state.get("current_bet")

    win_ok, win_reason = validate_win(parsed["win"], state.get("prev_win_num"))
    debug_reasons["win"] = win_reason
    win = parsed["win"] if win_ok else None
    if win: state["prev_win_num"] = win["numeric"]

    wt_ok, wt_reason = validate_win(parsed["win_total"], state.get("prev_win_total_num"))
    debug_reasons["win_total"] = wt_reason
    win_total = parsed["win_total"] if wt_ok else None
    if win_total: state["prev_win_total_num"] = win_total["numeric"]

    bet_num   = effective_bet["numeric"] if effective_bet else None
    src       = parsed["multiplier_source"]
    multi_val = win_total if src == "win_total" else win
    multiplier = None
    if bet_num and bet_num > 0 and multi_val and multi_val["numeric"] is not None:
        multiplier = round(multi_val["numeric"] / bet_num, 2)

    def v(d): return d["value"]   if d else None
    def n(d): return d["numeric"] if d else None

    raw_clean      = re.sub(r'\s+', ' ', raw_text).strip()[:500]
    filtered_clean = re.sub(r'\s+', ' ', filtered_text).strip()[:500]

    return {
        "provider":          parsed["provider"],
        "in_bonus":          parsed["in_bonus"],
        "bet_value":         v(effective_bet),
        "bet_numeric":       n(effective_bet),
        "win_value":         v(win),
        "win_numeric":       n(win),
        "win_total_value":   v(win_total),
        "win_total_numeric": n(win_total),
        "free_spins":        parsed["free_spins"],
        "multiplier":        multiplier,
        "multiplier_source": src,
        "ts_sec":            time.time(),
        "raw_ocr":           raw_clean,
        "filtered_ocr":      filtered_clean,
        "parse_debug": {
            "provider_detected": parsed["provider"],
            "in_bonus":          parsed["in_bonus"],
            "bet_raw":           parsed["bet"]["value"] if parsed["bet"] else None,
            "win_raw":           parsed["win"]["value"] if parsed["win"] else None,
            "win_total_raw":     parsed["win_total"]["value"] if parsed["win_total"] else None,
            "bet_reason":        debug_reasons.get("bet", "—"),
            "win_reason":        debug_reasons.get("win", "—"),
            "win_total_reason":  debug_reasons.get("win_total", "—"),
            "removed_lines":     parsed.get("_removed_lines", [])[:10],
        },
    }


# ═══════════════════════════════════════════════
#  EVENT TRACKER
# ═══════════════════════════════════════════════

class EventTracker:
    def __init__(self, alert_multi: float, screenshots_dir: str = "events"):
        self.alert_multi     = alert_multi
        self.screenshots_dir = screenshots_dir
        self.armed           = True
        self.count           = 0
        os.makedirs(screenshots_dir, exist_ok=True)

    def update(self, frame_bgr, frame_data: dict) -> bool:
        multi = frame_data.get("multiplier")
        if multi is None: return False
        if multi < EVENT_RESET_THRESHOLD and not self.armed:
            self.armed = True
        if self.armed and multi >= self.alert_multi:
            self.armed = False
            self.count += 1
            ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            fname  = f"event_{self.count:03d}_{ts_str}.jpg"
            spath  = os.path.join(self.screenshots_dir, fname)
            cv2.imwrite(spath, frame_bgr)
            emit_event(frame_data, spath)
            return True
        return False


# ═══════════════════════════════════════════════
#  MODE MANAGER
# ═══════════════════════════════════════════════

class ModeManager:
    def __init__(self):
        self.mode                = "ACTIVE"
        self.consecutive_unknown = 0
        self.last_value_ts       = time.time()
        self.cooldown_until      = 0.0
        self.frames_total        = 0
        self.frames_with_value   = 0

    def current_interval(self) -> float:
        now = time.time()
        if now < self.cooldown_until: return COOLDOWN_INTERVAL
        if self.mode == "WATCHING":   return INTERVAL_WATCHING
        if self.mode == "IDLE":       return INTERVAL_IDLE
        return INTERVAL_ACTIVE

    def update(self, frame_data: dict, event_triggered: bool):
        self.frames_total += 1
        now      = time.time()
        provider = frame_data.get("provider", "unknown")
        has_val  = bool(
            frame_data.get("bet_numeric") or
            frame_data.get("win_numeric") or
            frame_data.get("win_total_numeric")
        )
        if event_triggered:
            self.cooldown_until      = now + COOLDOWN_DURATION
            self.consecutive_unknown = 0
            if self.mode != "ACTIVE":
                self.mode = "ACTIVE"
                emit_mode("ACTIVE", "event_triggered")
        if has_val:
            self.frames_with_value += 1
            self.last_value_ts      = now
        if provider != "unknown":
            if self.consecutive_unknown > 0 or self.mode in ("WATCHING", "IDLE"):
                prev = self.mode
                self.mode = "ACTIVE"
                self.consecutive_unknown = 0
                if prev != "ACTIVE":
                    emit_mode("ACTIVE", f"provider_detected={provider}")
            else:
                self.consecutive_unknown = 0
        else:
            if not has_val:
                self.consecutive_unknown += 1
        if self.mode == "ACTIVE" and self.consecutive_unknown >= UNKNOWN_FRAMES_TO_WATCH:
            self.mode = "WATCHING"
            emit_mode("WATCHING", f"consecutive_unknown={self.consecutive_unknown}")
        if self.mode == "WATCHING" and (now - self.last_value_ts) > NO_VALUE_SECS_TO_IDLE:
            self.mode = "IDLE"
            emit_mode("IDLE", f"no_value_since={int(now - self.last_value_ts)}s")
        if self.mode == "IDLE" and has_val:
            self.mode = "ACTIVE"
            self.consecutive_unknown = 0
            emit_mode("ACTIVE", "value_detected_from_idle")

    def stats(self) -> dict:
        return {
            "mode":                self.mode,
            "consecutive_unknown": self.consecutive_unknown,
            "frames_total":        self.frames_total,
            "frames_with_value":   self.frames_with_value,
            "last_value_secs_ago": int(time.time() - self.last_value_ts),
        }


# ═══════════════════════════════════════════════
#  BOUCLE PRINCIPALE — STREAM HLS
# ═══════════════════════════════════════════════

def run_stream(hls_url: str, alert_multi: float, interval_sec: float):
    emit_log(f"Starting stream analysis v2.0: {hls_url}")
    emit_log(f"Config: {FRAME_W}x{FRAME_H} scale={SCALE} psm={PSM_MODE} adaptive_thresh")

    tracker   = EventTracker(alert_multi=alert_multi)
    mode_mgr  = ModeManager()
    state     = {}
    last_emit  = 0.0
    last_stats = 0.0

    running = [True]
    def on_sigterm(*_): running[0] = False
    signal.signal(signal.SIGTERM, on_sigterm)

    frame_size = FRAME_W * FRAME_H * 3
    reconnect  = 0

    try:
        os.nice(5)
        emit_log("nice(5) applied")
    except Exception:
        pass

    while running[0]:
        reconnect += 1
        emit_log(f"FFmpeg connect attempt {reconnect} (mode={mode_mgr.mode})")
        proc = open_ffmpeg_pipe(hls_url, FRAME_W, FRAME_H)
        if not proc.stdout:
            emit_log("FFmpeg failed to start (no stdout)")
            time.sleep(RECONNECT_DELAY_SEC)
            continue
        emit_log("FFmpeg started.")

        while running[0]:
            raw = proc.stdout.read(frame_size)
            if not raw or len(raw) < frame_size:
                emit_log("FFmpeg stream ended / short read, reconnecting...")
                break

            now              = time.time()
            current_interval = mode_mgr.current_interval()

            if now - last_stats >= 30.0:
                last_stats = now
                emit("stats", mode_mgr.stats())

            if now - last_emit < current_interval:
                continue
            last_emit = now

            frame = np.frombuffer(raw, np.uint8).reshape((FRAME_H, FRAME_W, 3))

            try:
                frame_data = analyze_frame(frame, state)
            except Exception as e:
                emit_log(f"OCR error: {e}")
                time.sleep(POST_OCR_SLEEP)
                continue

            has_val = bool(
                frame_data["bet_numeric"] or
                frame_data["win_numeric"] or
                frame_data["win_total_numeric"]
            )
            frame_data["has_value"] = has_val
            emit_frame(frame_data)

            event_triggered = tracker.update(frame, frame_data)
            mode_mgr.update(frame_data, event_triggered)

            time.sleep(POST_OCR_SLEEP)

        try: proc.kill()
        except: pass

        if running[0]:
            emit_log(f"Reconnecting in {RECONNECT_DELAY_SEC}s (mode={mode_mgr.mode})")
            time.sleep(RECONNECT_DELAY_SEC)

    emit_log("Worker stopped.")


# ═══════════════════════════════════════════════
#  MODE VIDEO FICHIER
# ═══════════════════════════════════════════════

def run_video(video_path: str, alert_multi: float, interval_sec: float):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        emit_log(f"Cannot open: {video_path}")
        sys.exit(1)
    fps   = cap.get(cv2.CAP_PROP_FPS) or 25
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step  = max(1, int(fps * interval_sec))
    tracker = EventTracker(alert_multi=alert_multi)
    state   = {}
    for fidx in range(0, total, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, fidx)
        ret, frame = cap.read()
        if not ret: continue
        ts = fidx / fps
        try:
            frame_data = analyze_frame(frame, state)
            frame_data["ts_sec"] = ts
        except Exception as e:
            emit_log(f"OCR error at {ts:.1f}s: {e}")
            continue
        if frame_data["bet_numeric"] or frame_data["win_numeric"] or frame_data["win_total_numeric"]:
            emit_frame(frame_data)
        tracker.update(frame, frame_data)
    cap.release()
    emit_log("Video analysis complete.")


# ═══════════════════════════════════════════════
#  ENTRYPOINT
# ═══════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hls-url",     required=True)
    parser.add_argument("--alert-multi", type=float, default=300.0)
    parser.add_argument("--interval",    type=float, default=2.0)
    parser.add_argument("--mode",        choices=["stream", "video"], default="stream")
    args = parser.parse_args()
    if args.mode == "stream":
        run_stream(args.hls_url, args.alert_multi, args.interval)
    else:
        run_video(args.hls_url, args.alert_multi, args.interval)