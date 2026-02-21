#!/usr/bin/env python3
"""
LunaClip Worker v1.8
- RAM optimisé
- ACTIVE / WATCHING / IDLE modes
- OCR debug (raw_ocr + parse_debug)
- CPU optimisé : scale 2, résolution 480x270, nice, sleep post-OCR
- Filtrage OCR : whitelist lignes utiles + blacklist patterns promo
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

# ✅ v1.8 : scale 2 au lieu de 3 → -30% CPU OCR, qualité suffisante
SCALE    = 2
PSM_MODE = 3

# ✅ v1.8 : résolution ffmpeg réduite → moins de pixels à traiter
FRAME_W = 480
FRAME_H = 270

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

# ✅ v1.8 : pause minimale après chaque OCR pour céder le CPU
POST_OCR_SLEEP = 0.05

# ─────────────────────────────────────────────
# Mots qui indiquent qu'une ligne est utile
# Si une ligne ne contient AUCUN de ces mots → ignorée
# ─────────────────────────────────────────────
USEFUL_WORDS = [
    "BET", "MISE", "WIN", "GAIN", "CREDIT", "SOLDE", "BALANCE",
    "FREE_SPINS", "FREE SPINS", "TOURS", "PARTIES",
    "MULTIPLIER", "MULT", "TOTAL",
]

# ─────────────────────────────────────────────
# Patterns promotionnels à bannir ligne par ligne
# Si une ligne contient l'un de ces patterns → supprimée
# ─────────────────────────────────────────────
PROMO_PATTERNS = [
    r'\bWAGER\b', r'\bRACE\b', r'\bDISCORD\b', r'\bEXCLUSIF\b',
    r'\bOFFERT\b', r'\bGIVEAWAY\b', r'\bFREESPINS\b', r'!\w+',
    r'\bCODE\b', r'\bBONUS\b(?!\s+(?:ROUND|GAME|SPINS|WIN))',
    r'\bPROMO\b', r'\bDÈS\b', r'\bMISÉ\b', r'\bTWITCH\b',
    r'\bYOUTUBE\b', r'\bINSTAGRAM\b', r'\bTIKTOK\b',
    r'\d+\s*[kK]\s*\$',   # "7.000$", "7k$" dans contexte promo
    r'\bSUBSCRIBE\b', r'\bABONNEZ\b', r'\bFOLLOW\b',
]
_PROMO_RE = re.compile('|'.join(PROMO_PATTERNS), re.IGNORECASE)
_USEFUL_RE = re.compile(
    '|'.join(re.escape(w) for w in USEFUL_WORDS),
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
#  OCR
# ═══════════════════════════════════════════════

def preprocess(crop_bgr):
    big  = cv2.resize(crop_bgr, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)
    _, t = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    return t

def ocr_text(thresh):
    return pytesseract.image_to_string(
        Image.fromarray(thresh),
        config=f"--psm {PSM_MODE} --oem 1"
    )

def filter_ocr_lines(raw: str) -> str:
    """
    Filtre ligne par ligne le texte OCR brut :
    1. Supprime les lignes vides / trop courtes
    2. Supprime les lignes qui contiennent des patterns promo
    3. Ne garde que les lignes qui contiennent au moins un mot utile
       (BET, MISE, WIN, CREDIT, GAIN, etc.)

    Retourne le texte filtré reconstruit.
    Les lignes supprimées sont remplacées par des commentaires
    dans raw_ocr_filtered pour le debug.
    """
    lines = raw.split('\n')
    kept = []
    removed = []

    for line in lines:
        stripped = line.strip()

        # Ignorer lignes vides / trop courtes (bruit OCR)
        if len(stripped) < 3:
            continue

        # Bannir si pattern promo détecté
        if _PROMO_RE.search(stripped):
            removed.append(f"[PROMO] {stripped}")
            continue

        # Ne garder que si au moins un mot utile
        if not _USEFUL_RE.search(stripped):
            removed.append(f"[NOISE] {stripped}")
            continue

        kept.append(stripped)

    return '\n'.join(kept), removed


def fuzzy_fix(text):
    text = re.sub(r'GAIN\s+TOTAL',  'GAIN_TOTAL', text, flags=re.IGNORECASE)
    text = re.sub(r'WIN\s+TOTAL',   'WIN_TOTAL',  text, flags=re.IGNORECASE)
    text = re.sub(r'TOURS?\s+GRATUITE?S?(\s+RESTANTES?)?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'PARTIES?\s+GRATUITE?S?(\s+RESTANTES?)?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'FREE\s+SPINS?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'\bSOLDE\b',   'SOLDE_CREDIT', text, flags=re.IGNORECASE)
    text = re.sub(r'\bBALANCE\b', 'SOLDE_CREDIT', text, flags=re.IGNORECASE)
    text = re.sub(r'\bBE[L1Il|]\b',  'BET',   text, flags=re.IGNORECASE)
    text = re.sub(r'\bB[E3][T7]\b',  'BET',   text, flags=re.IGNORECASE)
    text = re.sub(r'\bMl[S5]E\b',    'MISE',  text, flags=re.IGNORECASE)
    text = re.sub(r'\bMIS[E3]\b',    'MISE',  text, flags=re.IGNORECASE)
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
    # ✅ v1.8 : filtrer avant tout le reste
    filtered_text, removed_lines = filter_ocr_lines(raw_ocr)
    text     = fuzzy_fix(filtered_text)
    provider = detect_provider(text)
    in_bonus = detect_bonus(text)

    result = {
        "provider":          provider,
        "in_bonus":          in_bonus,
        "bet":               find_label(text, ["BET", "MISE"]),
        "win":               None,
        "win_total":         None,
        "free_spins":        None,
        "multiplier_source": None,
        "_removed_lines":    removed_lines,  # pour debug
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

    # ✅ v1.8 : parse_frame_text retourne aussi le texte filtré
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

    bet_num    = effective_bet["numeric"] if effective_bet else None
    src        = parsed["multiplier_source"]
    multi_val  = win_total if src == "win_total" else win
    multiplier = None
    if bet_num and bet_num > 0 and multi_val and multi_val["numeric"] is not None:
        multiplier = round(multi_val["numeric"] / bet_num, 2)

    def v(d): return d["value"]   if d else None
    def n(d): return d["numeric"] if d else None

    # ✅ raw_ocr : texte brut nettoyé (max 500 chars)
    raw_clean = re.sub(r'\s+', ' ', raw_text).strip()[:500]
    # ✅ filtered_ocr : texte après filtrage (ce que le parser a réellement vu)
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
        # ── OCR Debug ──────────────────────────
        "raw_ocr":           raw_clean,
        "filtered_ocr":      filtered_clean,   # ✅ nouveau : ce que le parser voit
        "parse_debug": {
            "provider_detected":  parsed["provider"],
            "in_bonus":           parsed["in_bonus"],
            "bet_raw":            parsed["bet"]["value"] if parsed["bet"] else None,
            "win_raw":            parsed["win"]["value"] if parsed["win"] else None,
            "win_total_raw":      parsed["win_total"]["value"] if parsed["win_total"] else None,
            "bet_reason":         debug_reasons.get("bet", "—"),
            "win_reason":         debug_reasons.get("win", "—"),
            "win_total_reason":   debug_reasons.get("win_total", "—"),
            "removed_lines":      parsed.get("_removed_lines", [])[:10],  # max 10 pour debug
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
        if now < self.cooldown_until:  return COOLDOWN_INTERVAL
        if self.mode == "WATCHING":    return INTERVAL_WATCHING
        if self.mode == "IDLE":        return INTERVAL_IDLE
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
    emit_log(f"Starting stream analysis v1.8: {hls_url}")
    emit_log(f"Config: {FRAME_W}x{FRAME_H} scale={SCALE} psm={PSM_MODE}")

    tracker    = EventTracker(alert_multi=alert_multi)
    mode_mgr   = ModeManager()
    state      = {}
    last_emit  = 0.0
    last_stats = 0.0

    running = [True]
    def on_sigterm(*_): running[0] = False
    signal.signal(signal.SIGTERM, on_sigterm)

    frame_size = FRAME_W * FRAME_H * 3
    reconnect  = 0

    # ✅ v1.8 : nice pour céder le CPU aux autres processus
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
            # Lire en continu pour vider le pipe ffmpeg
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
                # ✅ v1.8 : sleep même en cas d'erreur pour ne pas boucler à fond
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

            # ✅ v1.8 : céder le CPU après chaque analyse
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