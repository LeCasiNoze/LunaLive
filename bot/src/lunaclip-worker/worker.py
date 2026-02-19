#!/usr/bin/env python3
"""
LunaClip Worker v1.6 — Optimisé RAM + modes ACTIVE/WATCHING/IDLE
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
SCALE       = 3
PSM_MODE    = 3

MAX_WIN_DROP_RATIO    = 0.50
MIN_DECIMAL_THRESHOLD = 10.0
BET_MIN               = 0.01
BET_MAX               = 10000.0
EVENT_RESET_THRESHOLD = 50.0

RECONNECT_DELAY_SEC   = 5

# Intervalles par mode
INTERVAL_ACTIVE   = 2.0    # provider connu → toutes les 2s
INTERVAL_WATCHING = 30.0   # provider inconnu depuis trop longtemps → toutes les 30s
INTERVAL_IDLE     = 120.0  # aucune valeur depuis 5min → toutes les 2min
COOLDOWN_INTERVAL = 0.5    # post-EVENT pendant 30s → toutes les 0.5s
COOLDOWN_DURATION = 30.0   # durée du cooldown post-EVENT

# Seuils de transition
UNKNOWN_FRAMES_TO_WATCH = 10   # 10 frames sans valeur ET sans provider → WATCHING
NO_VALUE_SECS_TO_IDLE   = 300  # 5min sans aucune valeur → IDLE


def open_ffmpeg_pipe(hls_url: str, w: int = 640, h: int = 360):
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
    text     = fuzzy_fix(raw_ocr)
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

    return result


# ═══════════════════════════════════════════════
#  VALIDATION
# ═══════════════════════════════════════════════

def validate_bet(bet, prev_num):
    if not bet:                    return False
    n = bet["numeric"]
    if n is None:                  return False
    if n < BET_MIN or n > BET_MAX: return False
    if prev_num and prev_num > 0 and abs(n - prev_num) / prev_num > 0.5:
        return False
    return True

def validate_win(win, prev_num):
    if not win:   return False
    n   = win["numeric"]
    raw = win["value"]
    if n is None: return False
    if n > MIN_DECIMAL_THRESHOLD and not has_decimal_in_raw(raw):
        return False
    if prev_num is not None and prev_num > 0 and n > 0:
        drop = (prev_num - n) / prev_num
        if drop > MAX_WIN_DROP_RATIO:
            return False
    return True


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
    parsed   = parse_frame_text(raw_text)

    if parsed["provider"] != 'unknown':
        state["provider"] = parsed["provider"]
    elif state.get("provider"):
        parsed["provider"] = state["provider"]

    bet_ok = validate_bet(parsed["bet"], state.get("prev_bet_num"))
    bet    = parsed["bet"] if bet_ok else None
    if bet:
        state["current_bet"]  = bet
        state["prev_bet_num"] = bet["numeric"]
    effective_bet = bet or state.get("current_bet")

    win_ok = validate_win(parsed["win"], state.get("prev_win_num"))
    win    = parsed["win"] if win_ok else None
    if win: state["prev_win_num"] = win["numeric"]

    wt_ok     = validate_win(parsed["win_total"], state.get("prev_win_total_num"))
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
        if multi is None:
            return False
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
    """
    ACTIVE   : provider connu / valeurs détectées  → 2s
    WATCHING : provider inconnu depuis N frames     → 30s
    IDLE     : aucune valeur depuis 5min            → 120s
    COOLDOWN : juste après un EVENT                 → 0.5s pendant 30s
    """

    def __init__(self):
        self.mode                = "ACTIVE"
        self.consecutive_unknown = 0
        self.last_value_ts       = time.time()
        self.cooldown_until      = 0.0
        self.frames_total        = 0
        self.frames_with_value   = 0

    def current_interval(self) -> float:
        now = time.time()
        if now < self.cooldown_until:
            return COOLDOWN_INTERVAL
        if self.mode == "WATCHING":
            return INTERVAL_WATCHING
        if self.mode == "IDLE":
            return INTERVAL_IDLE
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

        # Cooldown post-EVENT → repasser ACTIVE immédiatement
        if event_triggered:
            self.cooldown_until      = now + COOLDOWN_DURATION
            self.consecutive_unknown = 0
            if self.mode != "ACTIVE":
                self.mode = "ACTIVE"
                emit_mode("ACTIVE", "event_triggered")

        if has_val:
            self.frames_with_value += 1
            self.last_value_ts      = now

        # Provider reconnu → reset unknown counter
        if provider != "unknown":
            if self.consecutive_unknown > 0 or self.mode in ("WATCHING", "IDLE"):
                prev = self.mode
                self.mode                = "ACTIVE"
                self.consecutive_unknown = 0
                if prev != "ACTIVE":
                    emit_mode("ACTIVE", f"provider_detected={provider}")
            else:
                self.consecutive_unknown = 0
        else:
            # Frame avec provider inconnu :
            # - Si valeur quand même → frame partielle, on ne dégrade pas le mode
            # - Si pas de valeur → on incrémente
            if not has_val:
                self.consecutive_unknown += 1

        # ACTIVE → WATCHING
        if self.mode == "ACTIVE" and self.consecutive_unknown >= UNKNOWN_FRAMES_TO_WATCH:
            self.mode = "WATCHING"
            emit_mode("WATCHING", f"consecutive_unknown={self.consecutive_unknown}")

        # WATCHING → IDLE
        if self.mode == "WATCHING" and (now - self.last_value_ts) > NO_VALUE_SECS_TO_IDLE:
            self.mode = "IDLE"
            emit_mode("IDLE", f"no_value_since={int(now - self.last_value_ts)}s")

        # IDLE → ACTIVE (valeur détectée)
        if self.mode == "IDLE" and has_val:
            self.mode                = "ACTIVE"
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
#  BOUCLE PRINCIPALE — MODE STREAM HLS
# ═══════════════════════════════════════════════

def run_stream(hls_url: str, alert_multi: float, interval_sec: float):
    emit_log(f"Starting stream analysis v1.6: {hls_url}")

    tracker    = EventTracker(alert_multi=alert_multi)
    mode_mgr   = ModeManager()
    state      = {}
    last_emit  = 0.0
    last_stats = 0.0

    running = [True]
    def on_sigterm(*_):
        running[0] = False
    signal.signal(signal.SIGTERM, on_sigterm)

    W, H       = 640, 360
    frame_size = W * H * 3

    reconnect = 0
    while running[0]:
        reconnect += 1
        emit_log(f"FFmpeg connect attempt {reconnect} (mode={mode_mgr.mode})")

        proc = open_ffmpeg_pipe(hls_url, W, H)
        if not proc.stdout:
            emit_log("FFmpeg failed to start (no stdout)")
            time.sleep(RECONNECT_DELAY_SEC)
            continue

        emit_log("FFmpeg started.")

        while running[0]:
            # ─────────────────────────────────────────────────────────
            # LECTURE CONTINUE — vide le pipe ffmpeg en permanence.
            # Sans ça, ffmpeg bloque et le buffer RAM explose.
            # On lit TOUJOURS, on n'analyse que si l'intervalle est passé.
            # ─────────────────────────────────────────────────────────
            raw = proc.stdout.read(frame_size)
            if not raw or len(raw) < frame_size:
                emit_log("FFmpeg stream ended / short read, reconnecting...")
                break

            now              = time.time()
            current_interval = mode_mgr.current_interval()

            # Stats toutes les 30s pour le dashboard Node
            if now - last_stats >= 30.0:
                last_stats = now
                emit("stats", mode_mgr.stats())

            # Pas encore le moment d'analyser → on a déjà lu et vidé le pipe
            if now - last_emit < current_interval:
                continue

            last_emit = now

            frame = np.frombuffer(raw, np.uint8).reshape((H, W, 3))

            try:
                frame_data = analyze_frame(frame, state)
            except Exception as e:
                emit_log(f"OCR error: {e}")
                continue

            has_val = bool(
                frame_data["bet_numeric"] or
                frame_data["win_numeric"] or
                frame_data["win_total_numeric"]
            )

            if has_val:
                emit_frame(frame_data)

            event_triggered = tracker.update(frame, frame_data)
            mode_mgr.update(frame_data, event_triggered)

        try:
            proc.kill()
        except:
            pass

        if running[0]:
            emit_log(f"Reconnecting in {RECONNECT_DELAY_SEC}s (mode={mode_mgr.mode})")
            time.sleep(RECONNECT_DELAY_SEC)

    emit_log("Worker stopped.")


# ═══════════════════════════════════════════════
#  MODE VIDEO FICHIER (local)
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