#!/usr/bin/env python3
"""
LunaClip Worker v3.0
════════════════════════════════════════════════════════════════
Pipeline : YOLO (détection zones) → OCR sur crop précis

Améliorations vs v2.2 :
  - YOLO détecte les zones BET et WIN (best.pt, classes 0=BET 1=WIN)
  - OCR uniquement sur les crops YOLO (±10px padding) — finis les faux positifs
  - PSM 7 (single-line) sur chaque crop — parfait pour une zone isolée
  - CLAHE + unsharp + double threshold + morph conservés (v2.2)
  - fuzzy_fix identique à v2.2 (toutes les corrections OCR)
  - find_mise_contextuel conservé (Pragmatic CREDIT/MISE sur même ligne)
  - Validation anti-faux-positifs identique (chute 50%, décimales)
  - ModeManager identique (ACTIVE / WATCHING / IDLE)
  - EventTracker identique
  - OCR debug enrichi : confs YOLO, texte brut par crop

Structure des fichiers :
  bot/src/lunaclip/worker.py          ← ce fichier
  bot/src/lunaclip/models/best.pt     ← modèle YOLO à placer ici

Dépendances :
  pip install ultralytics opencv-python pytesseract pillow
"""

#!/usr/bin/env python3
import os
# limiter threads AVANT imports lourds
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["ORT_NUM_THREADS"] = "1"
os.environ["YOLO_CONFIG_DIR"] = "/tmp/Ultralytics"

import cv2
cv2.setNumThreads(0)

import numpy as np
import pytesseract
from PIL import Image
from ultralytics import YOLO
import re, json, sys, argparse, time, signal, subprocess
from datetime import datetime
import resource

def mem_mb():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
# ═══════════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════════

# Résolution source (inchangée v2.2)
FRAME_W = 640
FRAME_H = 360

# ── YOLO ────────────────────────────────────────────────────────
YOLO_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "best.onnx")
YOLO_CONF       = 0.25    # seuil minimum — on accepte les détections peu sûres, la validation filtre ensuite
YOLO_IMGSZ      = 320     # résolution maximale = précision maximale (CPU ~100-150ms, OK à 2s d'intervalle)
YOLO_CLASS_BET  = 0       # classe 0 = BET  (data.yaml)
YOLO_CLASS_WIN  = 1       # classe 1 = WIN  (data.yaml)

# ── OCR sur crop ─────────────────────────────────────────────────
CROP_PADDING = 12     # pixels de marge autour de la box YOLO — évite de couper des caractères bord
CROP_SCALE   = 4      # upscale avant OCR (identique v2.2)
PSM_MODE     = 7      # single line — parfait pour crop isolé ; fallback PSM 6 si valeur non trouvée

# ── Validation valeurs (identique v2.2) ──────────────────────────
MAX_WIN_DROP_RATIO    = 0.50
MIN_DECIMAL_THRESHOLD = 10.0
BET_MIN               = 0.01
BET_MAX               = 10000.0
EVENT_RESET_THRESHOLD = 50.0

# ── Timing (identique v2.2) ──────────────────────────────────────
RECONNECT_DELAY_SEC     = 5
INTERVAL_ACTIVE         = 2.0
INTERVAL_WATCHING       = 30.0
INTERVAL_IDLE           = 120.0
COOLDOWN_INTERVAL       = 0.5
COOLDOWN_DURATION       = 30.0
UNKNOWN_FRAMES_TO_WATCH = 10
NO_VALUE_SECS_TO_IDLE   = 300
POST_OCR_SLEEP          = 0.15   # identique v2.2

# ═══════════════════════════════════════════════════════════════
#  CHARGEMENT YOLO (singleton — chargé une seule fois au démarrage)
# ═══════════════════════════════════════════════════════════════

_yolo_model = None

def get_yolo_model() -> YOLO:
    global _yolo_model
    if _yolo_model is None:
        if not os.path.exists(YOLO_MODEL_PATH):
            raise FileNotFoundError(
                f"Modèle YOLO introuvable : {YOLO_MODEL_PATH}\n"
                f"→ Copier best.pt dans : bot/src/lunaclip/models/best.pt"
            )
        emit_log(f"[YOLO] Chargement modèle : {YOLO_MODEL_PATH}")
        _yolo_model = YOLO(YOLO_MODEL_PATH, task="detect")
        _yolo_model.overrides['device']  = 'cpu'
        _yolo_model.overrides['verbose'] = False
        emit_log("[YOLO] Modèle chargé (CPU)")
        
    return _yolo_model


# ═══════════════════════════════════════════════════════════════
#  FFMPEG (identique v2.2)
# ═══════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════
#  OUTPUT
# ═══════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════
#  DÉTECTION YOLO
# ═══════════════════════════════════════════════════════════════

def yolo_detect(frame_bgr: np.ndarray) -> dict:
    """
    Détecte les zones BET et WIN sur le frame complet.
    Retourne { 'BET': [box], 'WIN': [box] } — max 1 box par classe
    (la plus haute confiance).
    box = { x1, y1, x2, y2, conf, cls_name }  coords pixels dans frame original
    """
    model   = get_yolo_model()
    emit_log(f"[MEM] start {mem_mb():.1f}MB")
    results = model.predict(
        source  = frame_bgr,
        imgsz   = YOLO_IMGSZ,
        conf    = YOLO_CONF,
        verbose = False,
        device  = 'cpu',
    )

    detections: dict = {'BET': [], 'WIN': []}

    if not results or not results[0].boxes:
        return detections

    for box in results[0].boxes:
        cls_id   = int(box.cls[0].item())
        conf     = float(box.conf[0].item())
        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
        cls_name = 'BET' if cls_id == YOLO_CLASS_BET else 'WIN'
        detections[cls_name].append({
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            'conf': round(conf, 3),
        })

    # Conserver uniquement la box de plus haute confiance par classe
    for cls in ('BET', 'WIN'):
        if len(detections[cls]) > 1:
            detections[cls] = [
                max(detections[cls], key=lambda b: b['conf'])
            ]

    return detections


# ═══════════════════════════════════════════════════════════════
#  PRÉPROCESSING OCR (adapté v2.2 pour un crop)
# ═══════════════════════════════════════════════════════════════

def preprocess_crop(crop_bgr: np.ndarray) -> np.ndarray:
    """
    Preprocessing optimisé pour un crop de texte isolé.
    Reprend exactement la chaîne v2.2 :
    upscale LANCZOS4 → gris → CLAHE → unsharp mask → double threshold
    (adaptatif + Otsu) → morph open
    Seul delta : tileGridSize plus petit (4x4 au lieu de 8x8)
    car le crop est déjà petit.
    """
    # 1. Upscale
    big = cv2.resize(
        crop_bgr, None,
        fx=CROP_SCALE, fy=CROP_SCALE,
        interpolation=cv2.INTER_LANCZOS4,
    )
    # 2. Niveaux de gris
    gray = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)

    # 3. CLAHE — équilibre local du contraste
    clahe     = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    equalized = clahe.apply(gray)

    # 4. Unsharp mask — accentue les contours des caractères
    kernel_sharp = np.array([
        [ 0, -1,  0],
        [-1,  5, -1],
        [ 0, -1,  0],
    ], dtype=np.float32)
    sharpened = cv2.filter2D(equalized, -1, kernel_sharp)

    # 5. Double threshold : adaptatif + Otsu → bitwise_or
    thresh_adapt = cv2.adaptiveThreshold(
        sharpened, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15,   # plus petit que v2.2 (31) car crop déjà petit
        C=8,
    )
    _, thresh_otsu = cv2.threshold(
        sharpened, 0, 255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )
    thresh = cv2.bitwise_or(thresh_adapt, thresh_otsu)

    # 6. Nettoyage morphologique
    kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_clean)

    return thresh


def ocr_crop(frame_bgr: np.ndarray, box: dict, psm: int = PSM_MODE) -> str:
    """
    Extrait le crop autour d'une box YOLO (+ CROP_PADDING),
    préprocesse et lance Tesseract.
    Retourne le texte brut nettoyé.
    """
    h, w = frame_bgr.shape[:2]
    x1 = max(0, box['x1'] - CROP_PADDING)
    y1 = max(0, box['y1'] - CROP_PADDING)
    x2 = min(w, box['x2'] + CROP_PADDING)
    y2 = min(h, box['y2'] + CROP_PADDING)

    if x2 <= x1 or y2 <= y1:
        return ""

    crop   = frame_bgr[y1:y2, x1:x2]
    thresh = preprocess_crop(crop)
    text   = pytesseract.image_to_string(
        Image.fromarray(thresh),
        config=f"--psm {psm} --oem 1",
    )
    return text.strip()


# ═══════════════════════════════════════════════════════════════
#  FUZZY FIX (identique v2.2)
# ═══════════════════════════════════════════════════════════════

def fuzzy_fix(text: str) -> str:
    # Séparateurs décimaux déformés
    text = re.sub(r'(\d)[°\'`](\d)', r'\1.\2', text)
    text = re.sub(r'(\d)\s*\.\s*(\d{2})\b', r'\1.\2', text)
    # Labels composés
    text = re.sub(r'\bGAIN\s+TOTAL',  'GAIN_TOTAL', text, flags=re.IGNORECASE)
    text = re.sub(r'\bWIN\s+TOTAL',   'WIN_TOTAL',  text, flags=re.IGNORECASE)
    text = re.sub(r'TOURS?\s+GRATUITE?S?(\s+RESTANTES?)?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'PARTIES?\s+GRATUITE?S?(\s+RESTANTES?)?', 'FREE_SPINS', text, flags=re.IGNORECASE)
    text = re.sub(r'FREE\s+SPINS?',   'FREE_SPINS',   text, flags=re.IGNORECASE)
    text = re.sub(r'\bSOLDE\b',       'SOLDE_CREDIT', text, flags=re.IGNORECASE)
    text = re.sub(r'\bBALANCE\b',     'SOLDE_CREDIT', text, flags=re.IGNORECASE)
    # BET
    text = re.sub(r'\bBE[L1Il|]\b',   'BET', text, flags=re.IGNORECASE)
    text = re.sub(r'\bB[E3][T7]\b',   'BET', text, flags=re.IGNORECASE)
    text = re.sub(r'\bBETN?\b',       'BET', text, flags=re.IGNORECASE)
    text = re.sub(r'\bB3T\b',         'BET', text, flags=re.IGNORECASE)
    # MISE
    text = re.sub(r'\bMl[S5]E\b',         'MISE', text, flags=re.IGNORECASE)
    text = re.sub(r'\bMIS[E3]\b',         'MISE', text, flags=re.IGNORECASE)
    text = re.sub(r'\bM[lI1][S5][E3]\b',  'MISE', text, flags=re.IGNORECASE)
    text = re.sub(r'\bMlSE\b',            'MISE', text, flags=re.IGNORECASE)
    # WIN / GAINS
    text = re.sub(r'\bW[Il1][Nn]\b',  'WIN',   text, flags=re.IGNORECASE)
    text = re.sub(r'\bGA[Il1]NS?\b',  'GAINS', text, flags=re.IGNORECASE)
    text = re.sub(r'\bGA[Il1]N\b',    'GAIN',  text, flags=re.IGNORECASE)
    # CREDIT
    text = re.sub(r'\bCRED[Il1]T\b',  'CREDIT', text, flags=re.IGNORECASE)
    text = re.sub(r'\bCREDl[T7]\b',   'CREDIT', text, flags=re.IGNORECASE)
    return text


# ═══════════════════════════════════════════════════════════════
#  PARSING VALEURS (identique v2.2)
# ═══════════════════════════════════════════════════════════════

def clean_raw_value(raw: str) -> str:
    v = re.sub(r'\s*\n\s*', '', raw)
    v = re.sub(r'\s{2,}', ' ', v)
    return v.strip()


def has_decimal_in_raw(raw: str) -> bool:
    return bool(re.search(r'\d\s*[,.]\s*\d', raw))


def extract_numeric(raw: str):
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


def find_label(text: str, keywords: list) -> dict | None:
    """
    Cherche un label parmi keywords suivi d'une valeur monétaire.
    Version duale :
    - Cherche "LABEL valeur" (label présent dans le crop)
    - Si non trouvé, cherche une valeur numérique seule
      (YOLO sait ce que c'est, le label peut être absent du crop)
    """
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
                return {
                    "label":   m.group(1).upper(),
                    "value":   clean_raw_value(raw),
                    "numeric": num,
                }

    # Fallback valeur seule — label absent mais YOLO a localisé la zone
    m = re.search(
        r'([€$£]?\s*[\d\s]+[,\.]\d{2}\s*[€$£]?)',
        text,
    )
    if m:
        raw = m.group(1).strip()
        num = extract_numeric(raw)
        if num is not None:
            return {
                "label":   keywords[0].upper(),
                "value":   clean_raw_value(raw),
                "numeric": num,
            }
    return None


def find_mise_contextuel(text: str) -> dict | None:
    """
    v2.2 : CREDIT et MISE souvent sur la même ligne Pragmatic.
    "CREDIT 1 392,84 € MISE 1,60 €" → retourne MISE=1.60
    Ne retourne jamais la valeur CREDIT comme BET.
    """
    pat = r'(?i)CREDIT\s+[\d\s,\.€$£]+\s+MISE\s+([€$£]?\s*[\d\s]+[,\.]\d{1,3}\s*[€$£]?)'
    m = re.search(pat, text)
    if m:
        raw = m.group(1).strip()
        num = extract_numeric(raw)
        if num is not None and BET_MIN <= num <= BET_MAX:
            return {"label": "MISE", "value": clean_raw_value(raw), "numeric": num}

    idx = text.upper().find("CREDIT")
    if idx >= 0:
        window = text[idx:idx + 120]
        m2 = re.search(
            r'(?i)\bMISE\b\s*([€$£]?\s*[\d\s]+[,\.]\d{1,3}\s*[€$£]?)',
            window,
        )
        if m2:
            raw = m2.group(1).strip()
            num = extract_numeric(raw)
            if num is not None and BET_MIN <= num <= BET_MAX:
                return {"label": "MISE", "value": clean_raw_value(raw), "numeric": num}
    return None


# ═══════════════════════════════════════════════════════════════
#  DÉTECTION PROVIDER / BONUS
# ═══════════════════════════════════════════════════════════════

def detect_provider(bet_text: str, win_text: str) -> str:
    combined = (bet_text + " " + win_text).upper()
    if any(k in combined for k in ['GAIN_TOTAL', 'WIN_TOTAL', 'SOLDE_CREDIT']):
        return 'hacksaw'
    if 'CREDIT' in combined:
        return 'pragmatic'
    return 'unknown'


def detect_bonus(bet_text: str, win_text: str) -> bool:
    return 'FREE_SPINS' in (bet_text + " " + win_text).upper()


# ═══════════════════════════════════════════════════════════════
#  VALIDATION ANTI-FAUX-POSITIFS (identique v2.2)
# ═══════════════════════════════════════════════════════════════

def validate_bet(bet, prev_num):
    if not bet:                        return False, "no_bet"
    n = bet["numeric"]
    if n is None:                      return False, "not_numeric"
    if n < BET_MIN or n > BET_MAX:     return False, f"out_of_range({n})"
    if prev_num and prev_num > 0 and abs(n - prev_num) / prev_num > 0.5:
        return False, f"spike_vs_prev({prev_num})"
    return True, "ok"


def validate_win(win, prev_num):
    if not win:      return False, "no_win"
    n   = win["numeric"]
    raw = win["value"]
    if n is None:    return False, "not_numeric"
    if n > MIN_DECIMAL_THRESHOLD and not has_decimal_in_raw(raw):
        return False, f"missing_decimal({raw})"
    if prev_num is not None and prev_num > 0 and n > 0:
        drop = (prev_num - n) / prev_num
        if drop > MAX_WIN_DROP_RATIO:
            return False, f"drop_too_large({drop:.2f})"
    return True, "ok"


# ═══════════════════════════════════════════════════════════════
#  ANALYSE D'UN FRAME — pipeline YOLO + OCR
# ═══════════════════════════════════════════════════════════════

def analyze_frame(frame_bgr: np.ndarray, state: dict) -> dict:
    """
    Pipeline v3.0 :
    1. YOLO → boxes BET et WIN
    2. OCR sur crop de chaque box (PSM 7, puis PSM 6 si raté)
    3. fuzzy_fix → parsing → validation
    4. Provider déduit du texte OCR (conservé de v2.2)
    5. Multiplicateur calculé
    """

    # ── 1. YOLO ─────────────────────────────────────────────────
    detections  = yolo_detect(frame_bgr)
    emit_log(f"[MEM] after ffmpeg {mem_mb():.1f}MB")
    bet_boxes   = detections['BET']
    win_boxes   = detections['WIN']
    found_bet   = len(bet_boxes) > 0
    found_win   = len(win_boxes) > 0

    # ── 2. OCR sur crops ────────────────────────────────────────
    bet_raw = ""
    win_raw = ""
    bet_conf = 0.0
    win_conf = 0.0

    if found_bet:
        bet_box  = bet_boxes[0]
        bet_conf = bet_box['conf']
        bet_raw  = ocr_crop(frame_bgr, bet_box, psm=PSM_MODE)
        # Fallback PSM 6 si PSM 7 ne donne rien d'utile
        if len(bet_raw) < 2:
            bet_raw = ocr_crop(frame_bgr, bet_box, psm=6)

    if found_win:
        win_box  = win_boxes[0]
        win_conf = win_box['conf']
        win_raw  = ocr_crop(frame_bgr, win_box, psm=PSM_MODE)
        if len(win_raw) < 2:
            win_raw = ocr_crop(frame_bgr, win_box, psm=6)

    # ── 3. Fuzzy fix (2 passes comme v2.2) ──────────────────────
    bet_text = fuzzy_fix(fuzzy_fix(bet_raw))
    win_text = fuzzy_fix(fuzzy_fix(win_raw))

    # ── 4. Provider + bonus ─────────────────────────────────────
    provider = detect_provider(bet_text, win_text)
    in_bonus = detect_bonus(bet_text, win_text)

    # Mémorisation provider (identique v2.2 — ne pas écraser pour ModeManager)
    if provider != 'unknown':
        state["provider"] = provider

    # ── 5. Parsing BET ──────────────────────────────────────────
    bet_parsed = None
    if found_bet:
        bet_parsed = find_label(bet_text, ["BET", "MISE"])
        # Fallback contextuel Pragmatic (v2.2)
        if not bet_parsed and provider == 'pragmatic':
            bet_parsed = (
                find_mise_contextuel(bet_raw) or
                find_mise_contextuel(bet_text)
            )

    # ── 6. Parsing WIN selon provider ───────────────────────────
    win_parsed       = None
    win_total_parsed = None
    free_spins       = None
    multiplier_src   = "win"

    if found_win:
        if provider == 'hacksaw':
            win_total_parsed = find_label(win_text, ["GAIN_TOTAL", "WIN_TOTAL"])
            win_parsed       = find_label(win_text, ["GAIN", "WIN"])
            fs = re.search(r'\bFREE_SPINS\b\s*(\d+)', win_text, re.IGNORECASE)
            if fs: free_spins = int(fs.group(1))
            multiplier_src = "win_total" if (in_bonus and win_total_parsed) else "win"
        elif provider == 'pragmatic':
            win_parsed     = find_label(win_text, ["WIN", "GAINS"])
            multiplier_src = "win"
        else:
            win_parsed     = find_label(win_text, ["WIN", "GAINS", "GAIN"])
            multiplier_src = "win"

    # ── 7. Validation ───────────────────────────────────────────
    debug = {}

    bet_ok, bet_reason = validate_bet(bet_parsed, state.get("prev_bet_num"))
    debug["bet"] = bet_reason
    bet = bet_parsed if bet_ok else None
    if bet:
        state["current_bet"]  = bet
        state["prev_bet_num"] = bet["numeric"]
    effective_bet = bet or state.get("current_bet")

    win_ok, win_reason = validate_win(win_parsed, state.get("prev_win_num"))
    debug["win"] = win_reason
    win = win_parsed if win_ok else None
    if win: state["prev_win_num"] = win["numeric"]

    wt_ok, wt_reason = validate_win(win_total_parsed, state.get("prev_win_total_num"))
    debug["win_total"] = wt_reason
    win_total = win_total_parsed if wt_ok else None
    if win_total: state["prev_win_total_num"] = win_total["numeric"]

    # ── 8. Multiplicateur ───────────────────────────────────────
    bet_num   = effective_bet["numeric"] if effective_bet else None
    multi_val = win_total if multiplier_src == "win_total" else win
    multiplier = None
    if bet_num and bet_num > 0 and multi_val and multi_val["numeric"] is not None:
        multiplier = round(multi_val["numeric"] / bet_num, 2)

    # ── 9. Helpers ──────────────────────────────────────────────
    def v(d): return d["value"]   if d else None
    def n(d): return d["numeric"] if d else None

    return {
        "provider":          provider,
        "in_bonus":          in_bonus,
        "bet_value":         v(effective_bet),
        "bet_numeric":       n(effective_bet),
        "win_value":         v(win),
        "win_numeric":       n(win),
        "win_total_value":   v(win_total),
        "win_total_numeric": n(win_total),
        "free_spins":        free_spins,
        "multiplier":        multiplier,
        "multiplier_source": multiplier_src,
        "ts_sec":            time.time(),
        # ── OCR debug (enrichi v3.0) ──
        "raw_ocr": (
            f"BET[conf={bet_conf:.2f}]: {bet_raw[:200]} "
            f"| WIN[conf={win_conf:.2f}]: {win_raw[:200]}"
        ),
        "filtered_ocr": (
            f"BET: {bet_text[:200]} | WIN: {win_text[:200]}"
        ),
        "parse_debug": {
            "provider_detected":   provider,
            "in_bonus":            in_bonus,
            "yolo_found_bet":      found_bet,
            "yolo_found_win":      found_win,
            "yolo_bet_conf":       round(bet_conf, 3),
            "yolo_win_conf":       round(win_conf, 3),
            "bet_raw":             v(bet_parsed),
            "win_raw":             v(win_parsed),
            "win_total_raw":       v(win_total_parsed),
            "bet_reason":          debug.get("bet", "—"),
            "win_reason":          debug.get("win", "—"),
            "win_total_reason":    debug.get("win_total", "—"),
            "removed_lines":       [],   # plus de scan large, crop propre
        },
    }


# ═══════════════════════════════════════════════════════════════
#  EVENT TRACKER (identique v2.2)
# ═══════════════════════════════════════════════════════════════

class EventTracker:
    def __init__(self, alert_multi: float, screenshots_dir: str = "events"):
        self.alert_multi     = alert_multi
        self.screenshots_dir = screenshots_dir
        self.armed           = True
        self.count           = 0
        os.makedirs(screenshots_dir, exist_ok=True)

    def update(self, frame_bgr: np.ndarray, frame_data: dict) -> bool:
        multi = frame_data.get("multiplier")
        if multi is None: return False
        if multi < EVENT_RESET_THRESHOLD and not self.armed:
            self.armed = True
        if self.armed and multi >= self.alert_multi:
            self.armed  = False
            self.count += 1
            ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            fname  = f"event_{self.count:03d}_{ts_str}.jpg"
            spath  = os.path.join(self.screenshots_dir, fname)
            cv2.imwrite(spath, frame_bgr)
            emit_event(frame_data, spath)
            return True
        return False


# ═══════════════════════════════════════════════════════════════
#  MODE MANAGER (identique v2.2)
# ═══════════════════════════════════════════════════════════════

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
            frame_data.get("win_numeric")  or
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


# ═══════════════════════════════════════════════════════════════
#  BOUCLE PRINCIPALE — STREAM HLS (identique v2.2)
# ═══════════════════════════════════════════════════════════════

def run_stream(hls_url: str, alert_multi: float, interval_sec: float):
    emit_log(f"Starting LunaClip Worker v3.0: {hls_url}")
    emit_log(f"Config: {FRAME_W}x{FRAME_H} | YOLO imgsz={YOLO_IMGSZ} conf={YOLO_CONF} | CPU mode")

    # Préchargement du modèle YOLO au démarrage (pas à la première frame)
    try:
        get_yolo_model()
    except FileNotFoundError as e:
        emit_log(f"FATAL: {e}")
        sys.exit(1)

    tracker  = EventTracker(alert_multi=alert_multi)
    mode_mgr = ModeManager()
    state    = {}
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
        emit_log(f"[MEM] after model {mem_mb():.1f}MB")

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
                emit_log(f"Analysis error: {e}")
                time.sleep(POST_OCR_SLEEP)
                continue

            has_val = bool(
                frame_data["bet_numeric"] or
                frame_data["win_numeric"]  or
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


# ═══════════════════════════════════════════════════════════════
#  MODE VIDEO FICHIER (identique v2.2)
# ═══════════════════════════════════════════════════════════════

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
            frame_data          = analyze_frame(frame, state)
            frame_data["ts_sec"] = ts
        except Exception as e:
            emit_log(f"Analysis error at {ts:.1f}s: {e}")
            continue
        if frame_data["bet_numeric"] or frame_data["win_numeric"] or frame_data["win_total_numeric"]:
            emit_frame(frame_data)
        tracker.update(frame, frame_data)
    cap.release()
    emit_log("Video analysis complete.")


# ═══════════════════════════════════════════════════════════════
#  ENTRYPOINT
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LunaClip Worker v3.0 — YOLO + OCR")
    parser.add_argument("--hls-url",     required=True,           help="URL HLS du stream")
    parser.add_argument("--alert-multi", type=float, default=300.0)
    parser.add_argument("--interval",    type=float, default=2.0)
    parser.add_argument("--mode",        choices=["stream", "video"], default="stream")
    args = parser.parse_args()

    if args.mode == "stream":
        run_stream(args.hls_url, args.alert_multi, args.interval)
    else:
        run_video(args.hls_url, args.alert_multi, args.interval)