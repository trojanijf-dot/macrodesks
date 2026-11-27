#!/usr/bin/env python3
"""Moteur du rapport « Étalonnage + installation ».

Corps A4 (police Carlito, métrique de Calibri) suivi des certificats d'étalonnage
(format Letter, 3 pages par transmetteur). Tout le contenu vient d'un JSON :

    render(data, sortie_pdf, dossier_des_images)
    python moteur_etalonnage.py contenu.json sortie.pdf [dossier_des_images]

data = { meta, etalonnage{dossier, etalons, transmetteurs, mesures}, postes, sections[{num, titre,
nouvelle_page, blocs}], annexe }. Blocs : p, h2, h3, h3o, h3s, note, small_i, body10, puces, table,
figure, figures, spacer, visa, et « auto » (tableaux calculés depuis les relevés et les postes :
transmetteurs, modeles, series, etalons, points, resultats, postes, synthese).
Aucune donnée d'affaire n'est écrite ici. La charte et la mise en page des certificats ne se modifient pas."""
import os, sys, re, json, datetime, tempfile
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle, Image, PageBreak, KeepTogether, CondPageBreak, Flowable)
from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix="rapport_")

# ---------------------------------------------------------------- polices
FD = os.path.join(HERE, "fonts") + os.sep          # Carlito = Calibri métrique (SIL OFL)
pdfmetrics.registerFont(TTFont("Cal", FD + "Carlito-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Cal-B", FD + "Carlito-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Cal-I", FD + "Carlito-Italic.ttf"))
pdfmetrics.registerFont(TTFont("Cal-BI", FD + "Carlito-BoldItalic.ttf"))
pdfmetrics.registerFontFamily("Cal", normal="Cal", bold="Cal-B", italic="Cal-I", boldItalic="Cal-BI")
pdfmetrics.registerFont(TTFont("DJ", FD + "DejaVuSans.ttf"))

# ---------------------------------------------------------------- charte
NAVY = colors.HexColor("#1B365D"); NAVY2 = colors.HexColor("#0F2340")
ORANGE = colors.HexColor("#E85D04"); TEAL = colors.HexColor("#2C5F7C")
GREY = colors.HexColor("#5B6B7A"); ALT = colors.HexColor("#EEF3F7")
RULE = colors.HexColor("#D0D7DE"); BOX = colors.HexColor("#F4F6F8")
GREEN = colors.HexColor("#1B7A4E")
PW, PH = A4
ML, MR = 51.0, 51.0
CW = PW - ML - MR            # 493,3 pt

# ---------------------------------------------------------------- données (JSON)
BASE = HERE
META = {}; CERT = {}; dos = {}; etalons = []; tx = []; mes = {}; TXD = {}
TOL = 0.5; TOL_MA = 0.08; PRINT_DATE = None
HEADER_TITLE = ""; FOOTER = ""; POSTES = []; SECTIONS = []; ANNEXE = {}; V = {}
AC = "à compléter"

def _date(v):
    if isinstance(v, (datetime.date, datetime.datetime)): return v
    try: return datetime.datetime.strptime(str(v)[:10], "%Y-%m-%d")
    except Exception: return v
fd = lambda d: d.strftime("%d/%m/%Y") if isinstance(d, (datetime.date, datetime.datetime)) else ("" if d is None else str(d))

def _n(v):
    """Nombre saisi (virgule ou point admis), ou None s'il manque."""
    if isinstance(v, bool) or v is None: return None
    if isinstance(v, (int, float)): return v
    try: return float(str(v).replace(",", ".").replace(" ", ""))
    except Exception: return None

def _soc(): return META.get("societe") or ""
def _chemin(p): return p if os.path.isabs(p) else os.path.join(BASE, p)

def _img(cle):
    """Chemin d'un logo de meta.logos, ou None s'il n'est pas fourni."""
    p = (META.get("logos") or {}).get(cle)
    p = _chemin(p) if p else None
    return p if p and os.path.exists(p) else None

def _boite(path, w, h):
    """Taille dans la boîte w × h : celle de la charte si l'image en a les proportions, sinon ajustée sans déformer."""
    iw, ih = ImageReader(path).getSize()
    if abs((iw / float(ih)) / (w / float(h)) - 1) < 0.02: return w, h
    s = min(w / float(iw), h / float(ih)); return iw * s, ih * s

def _logo(c, cle, x, y, w, h, ancre="g"):
    p = _img(cle)
    if not p: return
    ww, hh = _boite(p, w, h)
    dx = (w - ww) if ancre == "d" else 0
    c.drawImage(ImageReader(p), x + dx, y + (h - hh) / 2, ww, hh, mask="auto")

def _couleur_statut(v):
    s = str(v).upper()
    if s.startswith(("NON", "FAIL")): return "#C00000"
    if s.startswith(("À ", "EN ")): return "#E85D04"
    return "#1B7A4E"

def _complet(t):
    pts = mes.get(t["tag"]) or []
    return (t["lrv"] is not None and t["urv"] is not None and t["urv"] != t["lrv"] and len(pts) == 5
            and all(p[k] is not None for p in pts for k in ("pct", "pa", "ia", "pd", "idd")))

def _recalc():
    """Recalcule toutes les colonnes calculées à partir des saisies (P réf. et mA). Un transmetteur
    dont les relevés sont incomplets n'est pas calculé : il n'a pas de certificat."""
    for t in tx:
        t["ok"] = _complet(t)
        if not t["ok"]: continue
        span = float(t["urv"] - t["lrv"])
        pts = mes.get(t["tag"], [])
        for p in pts:
            p["cons"] = t["lrv"] + span * p["pct"] / 100
            p["na"] = 4 + 16 * (p["pa"] - t["lrv"]) / span
            p["nd"] = 4 + 16 * (p["pd"] - t["lrv"]) / span
            p["ea"] = p["ia"] - p["na"]; p["ed"] = p["idd"] - p["nd"]
            p["emax"] = p["ea"] if abs(p["ea"]) >= abs(p["ed"]) else p["ed"]
            p["emaxp"] = abs(p["emax"]) / 16 * 100
            p["hy"] = abs(p["ia"] - p["idd"]); p["hyp"] = p["hy"] / 16 * 100
            p["res"] = "PASS" if abs(p["emax"]) <= TOL_MA else "FAIL"
        worst = max(pts, key=lambda p: abs(p["emax"]))
        t["err"] = abs(worst["emax"]) / 16 * 100
        t["hyst"] = max(p["hyp"] for p in pts)
        t["res"] = "FAIL" if any(p["res"] == "FAIL" for p in pts) else "PASS"
        if isinstance(t["date"], (datetime.date, datetime.datetime)) and not t.get("due"):
            d = t["date"]
            try: t["due"] = d.replace(year=d.year + 1)
            except ValueError: t["due"] = d.replace(year=d.year + 1, day=28)

def _charger(data, base):
    global BASE, META, CERT, dos, etalons, tx, mes, TXD, TOL, TOL_MA, PRINT_DATE, HEADER_TITLE, FOOTER, POSTES, SECTIONS, ANNEXE, V
    BASE = base or HERE
    META = data.get("meta") or {}; CERT = META.get("cert") or {}
    e = data.get("etalonnage") or {}
    dos = e.get("dossier") or {}
    etalons = [(x.get("designation", ""), x.get("modele", ""), x.get("serie", ""), x.get("echeance", ""), x.get("role", ""))
               for x in e.get("etalons") or []]
    tx = []; mes = {}
    for x in e.get("transmetteurs") or []:
        t = dict(x)
        t.update(cert=x.get("cert", ""), tag=x.get("tag", ""), service=x.get("service", ""), manuf=x.get("constructeur", ""),
                 model=x.get("modele", ""), sn=x.get("serie", ""), unit=x.get("unite", ""), lrv=_n(x.get("lrv")), urv=_n(x.get("urv")),
                 out=x.get("sortie", ""), date=_date(x.get("date")), temp=x.get("temperature", ""), hum=x.get("humidite", ""),
                 due=_date(x.get("echeance")) if x.get("echeance") else None, err=None, hyst=None, res=None)
        tx.append(t)
        mes[t["tag"]] = [dict(pt=i + 1, pct=_n(m.get("pct")), pa=_n(m.get("p_montee")), ia=_n(m.get("ma_montee")),
                              pd=_n(m.get("p_descente")), idd=_n(m.get("ma_descente")))
                         for i, m in enumerate((e.get("mesures") or {}).get(t["tag"]) or [])]
    v = _n(dos.get("critere")); v = 0.5 if v is None else v
    TOL = int(v) if float(v) == int(v) else float(v); TOL_MA = 16 * TOL / 100.0
    _recalc()
    PRINT_DATE = _date(dos.get("date_impression"))
    TXD = {t["tag"]: t for t in tx}
    HEADER_TITLE = META.get("header_title", ""); FOOTER = META.get("footer", "")
    POSTES = data.get("postes") or []; SECTIONS = data.get("sections") or []; ANNEXE = data.get("annexe") or {}
    V = {"tol": str(TOL).replace(".", ","), "tol_ma": ("%.2f" % TOL_MA).replace(".", ","), "date_impression": fd(PRINT_DATE),
         "operateur": dos.get("operateur", ""), "approbateur": dos.get("approbateur", "")}
    if tx:
        V.update(cert_premier=tx[0]["cert"], cert_dernier=tx[-1]["cert"], date_etalonnage=fd(tx[0]["date"]) or AC,
                 echeance=fd(tx[0].get("due")) or AC, tags=", ".join(t["tag"] for t in tx))

def T(s):
    """Remplace les variables {tol}, {tol_ma}, {cert_premier}, {cert_dernier}, {date_etalonnage}, {echeance},
    {date_impression}, {operateur}, {tags}, {err:TAG}, {hyst:TAG} ; le reste du texte est rendu tel quel."""
    def r(m):
        k, a = m.group(1), m.group(2)
        if a is not None:
            t = TXD.get(a)
            if k not in ("err", "hyst"): return m.group(0)
            return ("%.2f" % t[k]).replace(".", ",") if t and t.get(k) is not None else AC
        return str(V[k]) if k in V else m.group(0)
    return re.sub(r"\{([a-z_]+)(?::([^{}]+))?\}", r, "" if s is None else str(s))

# ---------------------------------------------------------------- styles
def S(name, **kw):
    d = dict(fontName="Cal", fontSize=11, leading=15.5, textColor=NAVY)
    d.update(kw); return ParagraphStyle(name, **d)
ST = {
    "body": S("body", alignment=TA_JUSTIFY, spaceAfter=6),
    "body10": S("body10", fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=5),
    "note": S("note", fontName="Cal-I", fontSize=10, leading=13, textColor=GREY, spaceAfter=6),
    "small_i": S("small_i", fontName="Cal-I", fontSize=9, leading=12, textColor=GREY, spaceAfter=4),
    "h2": S("h2", fontName="Cal-B", fontSize=12, leading=15, textColor=TEAL, spaceBefore=8, spaceAfter=5),
    "h3": S("h3", fontName="Cal-B", fontSize=11, leading=14, textColor=TEAL, spaceBefore=6, spaceAfter=4),
    "h3o": S("h3o", fontName="Cal-B", fontSize=10, leading=13, textColor=ORANGE, spaceBefore=6, spaceAfter=3),
    "h3s": S("h3s", fontName="Cal-B", fontSize=10, leading=13, textColor=TEAL, spaceBefore=6, spaceAfter=2),
    "bullet": S("bullet", leftIndent=30, bulletIndent=17, spaceAfter=3.5, alignment=TA_LEFT,
                 bulletFontName="DJ", bulletFontSize=10, bulletColor=ORANGE),
    "caption": S("caption", fontName="Cal-I", fontSize=9, leading=11.5, textColor=GREY, alignment=TA_CENTER,
                 spaceBefore=4, spaceAfter=10),
    "th": S("th", fontName="Cal-B", fontSize=7.5, leading=9.5, textColor=colors.white),
    "thc": S("thc", fontName="Cal-B", fontSize=7.5, leading=9.5, textColor=colors.white, alignment=TA_CENTER),
    "td": S("td", fontSize=8, leading=10.2),
    "tdb": S("tdb", fontName="Cal-B", fontSize=8, leading=10.2),
    "tdc": S("tdc", fontSize=8, leading=10.2, alignment=TA_CENTER),
}

def P(t, s="body"): return Paragraph(t, ST[s] if isinstance(s, str) else s)

def bullets(items, s="bullet"):
    return [Paragraph(t, ST[s], bulletText="▸") for t in items]

class SectionTitle(Flowable):
    """« 01   Titre » : n° orange 13 gras, titre bleu nuit 14 gras, filet orange 1,9 pt."""
    def __init__(self, num, title):
        super().__init__(); self.num, self.title = num, title
    def wrap(self, aw, ah): return CW, 44
    def draw(self):
        c = self.canv
        c.setFillColor(ORANGE); c.setFont("Cal-B", 13); c.drawString(0, 30, self.num)
        w = pdfmetrics.stringWidth(self.num + "   ", "Cal-B", 13)
        c.setFillColor(NAVY); c.setFont("Cal-B", 14); c.drawString(w, 30, self.title)
        c.setFillColor(ORANGE); c.rect(-1.4, 0, CW + 2.8, 1.9, stroke=0, fill=1)

def section(num, title, newpage=True):
    out = [PageBreak()] if newpage else [CondPageBreak(160), Spacer(1, 8)]
    return out + [SectionTitle(num, title), Spacer(1, 12)]

def table(head, rows, widths, center_cols=(), bold_cols=(), status_col=None):
    tot = float(sum(widths)); widths = [CW * w / tot for w in widths]
    data = [[Paragraph(h, ST["thc"] if j in center_cols else ST["th"]) for j, h in enumerate(head)]]
    for r in rows:
        line = []
        for j, v in enumerate(r):
            st = "tdc" if j in center_cols else ("tdb" if j in bold_cols else "td")
            if status_col is not None and j == status_col:
                v = '<font name="Cal-B" color="%s">%s</font>' % (_couleur_statut(v), v)
            line.append(Paragraph(str(v), ST[st]))
        data.append(line)
    t = Table(data, colWidths=widths, repeatRows=1)
    ts = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), 0.5, RULE),
          ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
          ("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6)]
    for i in range(1, len(data), 2):
        ts.append(("BACKGROUND", (0, i), (-1, i), ALT))
    t.setStyle(TableStyle(ts))
    return [t, Spacer(1, 8)]

def figure(path, caption, max_w=CW * 0.62, max_h=330):
    iw, ih = ImageReader(path).getSize()
    s = min(max_w / iw, max_h / ih)
    return [KeepTogether([Image(path, iw * s, ih * s), P(caption, "caption")])]

def figures_row(items, h=250, caption=None):
    """Plusieurs photos côte à côte, même hauteur, légende commune ou individuelles."""
    imgs, caps = [], []
    n = len(items); cw = CW / n
    for path, cap in items:
        iw, ih = ImageReader(path).getSize()
        s = min(h / ih, (cw - 8) / iw)
        imgs.append(Image(path, iw * s, ih * s)); caps.append(P(cap, "caption") if cap else "")
    data = [imgs] + ([caps] if any(c for _, c in items) else [])
    t = Table(data, colWidths=[cw] * n)
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
                           ("VALIGN", (0, 1), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                           ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    out = [t]
    if caption: out.append(P(caption, "caption"))
    else: out.append(Spacer(1, 8))
    return [KeepTogether(out)]

def info_box(label, text):
    p = Paragraph('<font name="Cal-B" color="#E85D04" size="10">%s  —  </font>%s' % (label, text),
                  S("ib", fontSize=10, leading=13.5))
    t = Table([[p]], colWidths=[CW - 1])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BOX), ("BOX", (0, 0), (-1, -1), 1.5, ORANGE),
                           ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t

# ---------------------------------------------------------------- pages
class Doc(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(path, pagesize=A4, leftMargin=ML, rightMargin=MR, topMargin=77, bottomMargin=60,
                         title=META.get("pdf_title") or "Rapport d'intervention",
                         author=_soc())
        fr_cover = Frame(ML, 40, CW, PH - 40 - 98, 0, 0, 0, 0, id="cover")
        fr = Frame(ML, 60, CW, PH - 77 - 60, 0, 0, 0, 0, id="body")
        self.addPageTemplates([PageTemplate("cover", [fr_cover], onPage=self.cover_deco),
                               PageTemplate("body", [fr], onPage=self.body_deco)])
        self.total = "?"

    def cover_deco(self, c, doc):
        c.saveState()
        c.setFillColor(NAVY2); c.rect(ML, PH - 63.1, CW, 33.3, stroke=0, fill=1)
        c.setFillColor(ORANGE); c.rect(ML, PH - 91.5, CW, 28.4, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Cal-B", 11)
        x = 57; c.drawString(x, PH - 45, _soc())
        x += pdfmetrics.stringWidth(_soc(), "Cal-B", 11)
        c.setFont("Cal", 9.5); c.drawString(x, PH - 45, META.get("bandeau", ""))
        c.restoreState()

    def body_deco(self, c, doc):
        c.saveState()
        _logo(c, "calinstrum", 52, PH - 56, 79.3, 42.2)
        _logo(c, "client", 457.2, PH - 50.4, 85, 36.7, "d")
        c.setFillColor(NAVY); c.setFont("Cal-B", 9); c.drawCentredString(PW / 2, PH - 22.5, HEADER_TITLE)
        c.setFillColor(ORANGE); c.rect(49.6, PH - 795.6, 496.3, 1.5, stroke=0, fill=1)
        y = PH - 822
        c.setFillColor(NAVY); c.setFont("Cal-B", 8); c.drawString(ML, y, (_soc() + "  "))
        x = ML + pdfmetrics.stringWidth((_soc() + "  "), "Cal-B", 8)
        c.setFillColor(GREY); c.setFont("Cal", 8); c.drawString(x, y, FOOTER)
        x += pdfmetrics.stringWidth(FOOTER, "Cal", 8)
        c.setFillColor(NAVY); c.setFont("Cal", 11); c.drawString(x, y, str(doc.page))
        x += pdfmetrics.stringWidth(str(doc.page), "Cal", 11)
        c.setFillColor(GREY); c.setFont("Cal", 8); c.drawString(x, y, " / %s" % self.total)
        c.restoreState()

def cover():
    from reportlab.platypus import NextPageTemplate
    g = META.get("garde") or {}
    out = []
    cells = []
    for cle, w, h in (("calinstrum", 130.3, 69.4), ("client", 113.3, 48.8), ("groupe", 118.9, 39.5)):
        p = _img(cle); cells.append(Image(p, *_boite(p, w, h)) if p else "")
    t = Table([cells], colWidths=[CW / 3] * 3, rowHeights=[72])
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    out += [Spacer(1, 16), t, Spacer(1, 12),
            P(T(g.get("surtitre") or "RAPPORT D'INTERVENTION"), S("k", fontName="Cal-B", textColor=ORANGE, alignment=TA_CENTER)),
            Spacer(1, 4),
            P(T(g.get("titre") or AC), S("t", fontName="Cal-B", fontSize=20,
              leading=28, alignment=TA_CENTER)),
            Spacer(1, 6),
            P(T(g.get("ligne1") or "&nbsp;"), S("s1", textColor=TEAL, alignment=TA_CENTER, leading=16)),
            P(T(g.get("ligne2") or "&nbsp;"), S("s2", fontName="Cal-B", alignment=TA_CENTER)),
            Spacer(1, 12)]
    pics = [(_chemin(v["src"]), v.get("legende") or "") for v in g.get("visuels") or [] if v.get("src") and os.path.exists(_chemin(v["src"]))]
    if pics:
        n = len(pics); row_i, row_c = [], []
        for path, cap in pics:
            iw, ih = ImageReader(path).getSize(); s = min(138 / ih, 220 / iw)
            row_i.append(Image(path, iw * s, ih * s))
            row_c.append(Paragraph(T(cap), S("cc", fontName="Cal-B", fontSize=8, leading=10, alignment=TA_CENTER)))
        t = Table([row_i, row_c], colWidths=[CW / n] * n, rowHeights=[144, 15])
        t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                               ("BOX", (0, 0), (-1, -1), 0.5, RULE), ("INNERGRID", (0, 0), (-1, -1), 0.5, RULE),
                               ("BACKGROUND", (0, 1), (-1, 1), BOX),
                               ("TOPPADDING", (0, 1), (-1, 1), 2), ("BOTTOMPADDING", (0, 1), (-1, 1), 2)]))
        out += [t, Spacer(1, 20)]
    ident = [(T(k), T(v) or AC) for k, v in g.get("ident") or []]
    if ident:
        data = [[Paragraph(k, S("ik", fontName="Cal-B", fontSize=8, leading=10, textColor=colors.white)),
                 Paragraph(v, S("iv", fontSize=9, leading=11))] for k, v in ident]
        t = Table(data, colWidths=[130.5, CW - 130.5])
        ts = [("BACKGROUND", (0, 0), (0, -1), NAVY), ("GRID", (0, 0), (-1, -1), 0.5, RULE),
              ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 3),
              ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6)]
        for i in range(0, len(data), 2): ts.append(("BACKGROUND", (1, i), (1, i), ALT))
        t.setStyle(TableStyle(ts))
        out += [t, Spacer(1, 22)]
    out += [info_box(g.get("objet_label") or "Objet", T(g.get("objet") or AC)),
            Spacer(1, 26)]
    foot = S("cf", fontSize=8, leading=10.5, textColor=GREY, alignment=TA_CENTER)
    out += [P(T(m), foot) for m in g.get("mentions") or []]
    out.append(NextPageTemplate("body"))
    return out

def _ech(t):
    return "%g / %g %s" % (t["lrv"], t["urv"], t["unit"]) if t["lrv"] is not None and t["urv"] is not None else AC

def _auto(q):
    """Tableaux calculés depuis les relevés d'étalonnage et les postes du devis."""
    if q == "transmetteurs":
        return table(["Repère (TAG)", "Localisation", "Grandeur / service", "Échelle<br/>LRV / URV", "Type", "Sortie"],
                     [[t["tag"], t.get("localisation") or AC, t.get("grandeur") or t["service"], "<b>%s</b>" % _ech(t), t.get("type") or "", t["out"]] for t in tx],
                     [79, 101, 124, 72, 55, 62], center_cols=(3, 4, 5), bold_cols=(0,))
    if q == "modeles":
        vus = {}
        for t in tx: vus.setdefault(t["model"], []).append(t)
        return table(["Famille", "Code constructeur", "Usage", "Mesure"],
                     [[g[0].get("famille") or "", m, ", ".join(t["tag"] for t in g) + " — " + g[0]["service"], g[0].get("mesure") or ""] for m, g in vus.items()],
                     [90, 190, 120, 93])
    if q == "series":
        return table(["TAG / service", "Constructeur", "Modèle", "N° de série"],
                     [[t["tag"] + (" — " + (t.get("service_court") or t["service"]) if (t.get("service_court") or t["service"]) else ""), t["manuf"], t["model"], "<b>%s</b>" % (t["sn"] or AC)] for t in tx],
                     [110, 95, 200, 88])
    if q == "etalons":
        return table(["Moyen", "Modèle / N° de série", "Rôle", "Échéance"],
                     [[e[0], "%s · %s" % (e[1], e[2]), e[4], e[3]] for e in etalons],
                     [140, 140, 150, 63])
    if q == "points":
        gr = {}
        for t in tx:
            if t["lrv"] is not None and t["urv"] is not None: gr.setdefault((t["lrv"], t["urv"], t["unit"]), []).append(t["tag"])
        cols = list(gr.items())
        if not cols: return []
        return table(["Point", "% échelle", "mA nominal"] + ["%s (%s)" % (" / ".join(tags), k[2]) for k, tags in cols],
                     [[str(i + 1), "%d %%" % p, "%.2f" % (4 + 16 * p / 100)] + ["%g" % (k[0] + (k[1] - k[0]) * p / 100) for k, _ in cols] for i, p in enumerate([0, 25, 50, 75, 100])],
                     [60, 90, 100] + [243.0 / len(cols)] * len(cols), center_cols=tuple(range(3 + len(cols))))
    if q == "resultats":
        return table(["TAG", "N° de série", "Certificat", "Erreur max", "Hystérésis max", "Critère", "Résultat"],
                     [[t["tag"], t["sn"], t["cert"], "%.2f %%" % t["err"], "%.2f %%" % t["hyst"], "±%s %%" % TOL, "CONFORME" if t["res"] == "PASS" else "NON CONFORME"] if t["ok"]
                      else [t["tag"], t["sn"], t["cert"], "—", "—", "±%s %%" % TOL, "À COMPLÉTER"] for t in tx],
                     [65, 85, 88, 62, 72, 58, 63], center_cols=(3, 4, 5, 6), bold_cols=(0,), status_col=6)
    if q == "postes":
        return table(["Poste", "Désignation (devis)", "Réalisation", "Statut"],
                     [[p.get("num", ""), T(p.get("designation", "")), T(p.get("realisation") or AC), p.get("statut") or "À COMPLÉTER"] for p in POSTES],
                     [36, 182, 212, 63], center_cols=(0, 3), status_col=3)
    if q == "synthese":
        return table(["N°", "TAG", "Grandeur", "Échelle", "Modèle / S/N", "Certificat", "Statut"],
                     [[str(i + 1), t["tag"], t["service"], _ech(t), "%s · %s" % (t.get("modele_court") or t.get("famille") or t["model"], t["sn"]), t["cert"], t.get("statut") or "ÉTALONNÉ"] for i, t in enumerate(tx)],
                     [28, 62, 95, 62, 120, 75, 51], center_cols=(0, 6), bold_cols=(1,), status_col=6)
    return []

def blocs(lst):
    o = []
    for b in lst or []:
        k = b.get("type")
        if k in ("p", "h2", "h3", "h3o", "h3s", "note", "small_i", "body10"):
            o.append(P(T(b.get("texte", "")), "body" if k == "p" else k))
        elif k == "puces":
            o += bullets([T(x) for x in b.get("items") or []])
        elif k == "table":
            o += table([T(h) for h in b.get("entetes") or []], [[T(c) for c in r] for r in b.get("lignes") or []], b.get("largeurs") or [1],
                       tuple(b.get("centre") or ()), tuple(b.get("gras") or ()), b.get("statut"))
        elif k == "figure":
            p = _chemin(b.get("src") or "")
            if os.path.isfile(p): o += figure(p, T(b.get("legende", "")), CW * b.get("max_w", 0.62), b.get("max_h", 330))
        elif k == "figures":
            items = [(_chemin(x["src"]), T(x["legende"]) if x.get("legende") else None) for x in b.get("items") or [] if x.get("src") and os.path.isfile(_chemin(x["src"]))]
            if items: o += figures_row(items, b.get("h", 250), T(b["legende"]) if b.get("legende") else None)
        elif k == "spacer":
            o.append(Spacer(1, b.get("h", 8)))
        elif k == "auto":
            o += _auto(b.get("quoi"))
        elif k == "visa":
            vis = Table([[Paragraph(T(b.get("gauche", "")), ST["body10"]), Paragraph(T(b.get("droite", "")), ST["body10"])]],
                        colWidths=[CW / 2] * 2, rowHeights=[80])
            vis.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, RULE), ("INNERGRID", (0, 0), (-1, -1), 0.5, RULE),
                                     ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
            o += [Spacer(1, 10), vis]
    return o

def body():
    o = []
    for s in SECTIONS:
        o += section(str(s.get("num", "")), T(s.get("titre", "")), bool(s.get("nouvelle_page", True)))
        o += blocs(s.get("blocs"))
    if any(t["ok"] for t in tx):
        o += [PageBreak()]
        o += [AnnexTitle(), Spacer(1, 12), P(T(ANNEXE.get("texte", "")))]
    return o

class AnnexTitle(Flowable):
    def wrap(self, aw, ah): return CW, 44
    def draw(self):
        c = self.canv
        c.setFillColor(ORANGE); c.setFont("Cal-B", 13); c.drawString(0, 30, "Annexe A")
        w = pdfmetrics.stringWidth("Annexe A", "Cal-B", 13)
        c.setFillColor(NAVY); c.setFont("Cal-B", 14); c.drawString(w, 30, "  —  Certificats d'étalonnage atelier")
        c.setFillColor(ORANGE); c.rect(-1.4, 0, CW + 2.8, 1.9, stroke=0, fill=1)

def build_body(path):
    doc = Doc(path); doc.build(cover() + body()); n = doc.page
    doc = Doc(path); doc.total = n; doc.build(cover() + body())
    return n

# ---------------------------------------------------------------- certificats ACal (Letter)
LW, LH = letter
def num(v, d): return ("%." + str(d) + "f") % v

def graphs_png(t, pts, path):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.08, 8.6), gridspec_kw=dict(height_ratios=[1.05, 0.88], hspace=0.62))
    x = [p["cons"] for p in pts]
    e = [p["emaxp"] if p["emax"] >= 0 else -p["emaxp"] for p in pts]   # erreur max (% EM), feuille 3-Mesures
    ax1.plot(x, e, "-o", color="#2E8B57", lw=1.6, ms=6, label="Error")
    ax1.axhline(0, color="#555555", lw=0.6)
    ax1.set_ylim(-1, 1); ax1.set_yticks([v / 10 for v in range(-10, 11, 2)])
    ax1.set_xlabel("SetPoint:%s" % t["unit"]); ax1.set_ylabel("Error:%")
    ax1.set_title("ACal Error Graph---Pressure Transmitter:AsFound Data\n%s  ·  %s" % (t["tag"], t["cert"]), fontsize=11)
    ax1.grid(True, color="#dddddd"); ax1.legend(loc="upper right", fontsize=9)
    seq = [0, 25, 50, 75, 100, 75, 50, 25, 0]
    ma = [p["ia"] for p in pts] + [p["idd"] for p in reversed(pts)][1:]
    ideal = [4 + 16 * s / 100 for s in seq]
    ax2.plot(seq[:5], ideal[:5], "--", color="#1B365D", lw=1.5, label="Idéal 4-20 mA")
    ax2.plot(seq, ma, "-o", color="#E8670C", lw=1.4, ms=5, label="Mesuré DUT")
    ax2.set_xticks([0, 25, 50, 75, 100]); ax2.set_xlabel("% échelle"); ax2.set_ylabel("mA")
    ax2.set_title("Boucle 4-20 mA — cycle 0-25-50-75-100-75-50-25-0\n%s" % t["tag"], fontsize=11)
    ax2.grid(True, color="#dddddd"); ax2.legend(loc="lower right", fontsize=9)
    fig.savefig(path, dpi=150, bbox_inches="tight"); plt.close(fig)

def frame(c):
    c.setStrokeColor(colors.HexColor("#1F1F1F")); c.setLineWidth(1.25); c.rect(18, 18, 576, 756)
    c.setLineWidth(0.55); c.rect(22, 22, 568, 748)

def hline(c, y, w=0.8, x0=36, x1=576):
    c.setStrokeColor(colors.HexColor("#262626")); c.setLineWidth(w); c.line(x0, LH - y, x1, LH - y)

def txt(c, x, y, s, font="Helvetica", size=10, color="#000000", align="l"):
    c.setFont(font, size); c.setFillColor(colors.HexColor(color))
    yy = LH - y
    if align == "r": c.drawRightString(x, yy, s)
    elif align == "c": c.drawCentredString(x, yy, s)
    else: c.drawString(x, yy, s)

def certificates(path):
    c = rl_canvas.Canvas(path, pagesize=letter)
    for t in [x for x in tx if x["ok"]]:
        pts = mes[t["tag"]]
        rng = "(%g~%g)%s" % (t["lrv"], t["urv"], t["unit"])
        maxe = max(pts, key=lambda p: abs(p["emax"]))
        # page 1 --------------------------------------------------
        frame(c)
        _logo(c, "certificat", 36.1, LH - 78, 87.8, 38)
        txt(c, 306, 51.5, "Certificate of Calibration", "Helvetica-Bold", 16, align="c")
        txt(c, 306, 67, "Pressure Transmitter", "Helvetica", 11, align="c")
        txt(c, 576, 51.5, CERT.get("tel", ""), "Helvetica", 8, "#333333", "r")
        txt(c, 576, 63.5, CERT.get("email", ""), "Helvetica", 8, "#333333", "r")
        hline(c, 92)
        txt(c, 36, 109.5, "Certificate No.  %s" % t["cert"])
        txt(c, 576, 109.5, "Print Date  %s" % fd(PRINT_DATE), align="r")
        hline(c, 124)
        txt(c, 36, 143.5, "Device Under Test(DUT)", "Helvetica-Bold", 12)
        hline(c, 152, 0.6)
        left = [("DUT Name:", t["tag"]), ("Model:", t["model"]), ("Range:", rng), ("Resolution:", "0.0001"),
                ("S/N:", t["sn"]), ("Accuracy:", "±(%s%%FS)" % TOL)]
        right = [("Calibration Date:", fd(t["date"])), ("Expiration Date:", fd(t["due"])),
                 ("Manufacturer:", t.get("constructeur_cert") or t["manuf"]), ("Customer:", CERT.get("client", "")),
                 ("Service:", t["service"]), ("BC / Devis:", CERT.get("ref", ""))]
        for i, (k, v) in enumerate(left):
            y = 169.5 + 16 * i
            txt(c, 36, y, k)
            fs = 10
            while pdfmetrics.stringWidth(v, "Helvetica-Bold", fs) > 185 and fs > 6.5: fs -= 0.25
            txt(c, 131, y, v, "Helvetica-Bold", fs)
        for i, (k, v) in enumerate(right):
            y = 169.5 + 16 * i
            txt(c, 320, y, k); f = "Helvetica-Bold"
            if v.startswith("ΔP"):
                txt(c, 430, y, "∆", "DJ", 9); txt(c, 436, y, v[1:], f, 9)
            else:
                fs = 9
                while pdfmetrics.stringWidth(v, f, fs) > 142 and fs > 6.5: fs -= 0.25
                txt(c, 430, y, v, f, fs)
        hline(c, 274)
        txt(c, 36, 291.5, "Calibration Results", "Helvetica-Bold", 12)
        hline(c, 300, 0.6)
        heads = ["Result", "Indicator Error", "Hysteresis Error", "Temperature", "Humidity", "Atmospheric pressure"]
        vals = ["Pass" if t["res"] == "PASS" else "Fail", ("-" if maxe["emax"] < 0 else "") + "%.2f%%" % t["err"],
                "%.2f%%" % t["hyst"], t["temp"], t["hum"], dos.get("pression_atm") or "101kPa"]
        for i, (h, v) in enumerate(zip(heads, vals)):
            txt(c, 36 + 90 * i, 315.5, h, "Helvetica", 8); txt(c, 36 + 90 * i, 329.5, v, "Helvetica-Bold", 10)
        hline(c, 346)
        txt(c, 36, 363.5, "References", "Helvetica-Bold", 12)
        hline(c, 372, 0.6)
        for x, h in zip([36, 196, 276, 386, 476], ["Name", "Model", "Serial Number", "Certificate No.", "Due Date"]):
            txt(c, x, 387.5, h, "Helvetica", 8)
        hline(c, 392, 0.4)
        for j, e in enumerate(etalons):
            y = 405.5 + 14 * j
            for x, v in zip([36, 196, 276, 386, 476], [e[0], e[1], e[2], "—", e[3]]):
                txt(c, x, y, str(v), "Helvetica", 9)
        hline(c, 444)
        txt(c, 60, 472, "Performed By"); txt(c, 420, 472, "Approved By")
        _logo(c, "signature", 424.1, LH - 521.6, 45.2, 45.7)
        hline(c, 522, 0.8, 50, 200); hline(c, 522, 0.8, 400, 550)
        _logo(c, "calinstrum", 272.2, LH - 568, 67.6, 36)
        txt(c, 306, 579.5, CERT.get("pied1", ""), "Helvetica", 8, "#264066", "c")
        txt(c, 306, 591.5, CERT.get("pied2", ""), "Helvetica", 8, "#264066", "c")
        txt(c, 306, 757.5, "Tolérance banc : ±%s mA (4-20 mA)  ·  Exactitude constructeur ±%s %% FS  ·  Cycle 5 pts Asc/Des"
            % (("%.2f" % TOL_MA).replace(".", ","), str(TOL).replace(".", ",")), "Helvetica", 7, "#595959", "c")
        c.showPage()
        # page 2 --------------------------------------------------
        frame(c)
        txt(c, 306, 47.5, "Calibration Data", "Helvetica-Bold", 16, align="c")
        txt(c, 36, 69.5, "Certificate No.  %s" % t["cert"]); txt(c, 36, 83.5, "Cycle 1")
        txt(c, 576, 69.5, "%s  ·  S/N %s" % (t["tag"], t["sn"]), align="r"); txt(c, 576, 83.5, rng, align="r")
        hline(c, 100)
        cols = [36, 78, 128, 178, 218, 258, 298, 340, 395, 450, 505, 545]
        for x, h in [(36, "SetPoints"), (78, "Reference(%s)" % t["unit"]), (178, "Nominal(mA)"), (258, "DUT(mA)"),
                     (340, "Tolerance(mA)"), (395, "Indicator"), (450, "Hysteresis"), (505, "TAR"), (545, "Result")]:
            txt(c, x, 113.5, h, "Helvetica-Bold", 7)
        for x, h in [(78, "Asc."), (128, "Des."), (178, "Asc."), (218, "Des."), (258, "Asc."), (298, "Des."), (395, "Error(mA)"), (450, "Error(mA)")]:
            txt(c, x, 123.5, h, "Helvetica", 7)
        hline(c, 128, 0.5)
        for i, p in enumerate(pts):
            y = 141 + 16 * i
            ind = p["ea"] if abs(p["ea"]) >= abs(p["ed"]) else p["ed"]
            vals = ["%g" % p["cons"], num(p["pa"], 2), num(p["pd"], 2), num(p["na"], 4), num(p["nd"], 4),
                    num(p["ia"], 4), num(p["idd"], 4), "±%.2f" % TOL_MA, "%+.4f" % ind, num(p["hy"], 4), "N/A"]
            for x, v in zip(cols[:11], vals):
                txt(c, x, y, v, "Helvetica", 8)
            txt(c, 545, y, "Pass" if p["res"] == "PASS" else "Fail", "Helvetica", 8, "#0d7326" if p["res"] == "PASS" else "#C00000")
        hline(c, 226)
        txt(c, 306, 243.5, "=== Calibration Data End ===", align="c")
        g = "#4d4d4d"
        txt(c, 36, 271.5, "Cycle : 0 % → 25 % → 50 % → 75 % → 100 % (Asc.) puis 100 % → 75 % → 50 % → 25 % → 0 % (Des.).", "DJ", 7.2, g)
        txt(c, 36, 283.5, "Tolérance appliquée : ±%.2f mA sur sortie 4-20 mA.  Exactitude DUT : ±(%s%%FS)." % (TOL_MA, TOL), "Helvetica", 8, g)
        txt(c, 36, 295.5, CERT.get("banc", ""), "Helvetica", 8, g)
        txt(c, 36, 326, "Séquence complète (mA mesurés)", "Helvetica-Bold", 10)
        hline(c, 334, 0.5)
        seq = [0, 25, 50, 75, 100, 75, 50, 25, 0]
        ma = [p["ia"] for p in pts] + [p["idd"] for p in reversed(pts)][1:]
        txt(c, 36, 347.5, "% échelle", "Helvetica", 8); txt(c, 36, 359.5, "mA DUT", "Helvetica", 8); txt(c, 36, 371.5, "mA idéal", "Helvetica", 8)
        for k, s in enumerate(seq):
            xc = 100 + 48 * k
            txt(c, xc, 347.5, str(s), "Helvetica", 8, align="c")
            txt(c, xc, 359.5, "%.3f" % ma[k], "Helvetica", 8, align="c")
            txt(c, xc, 371.5, "%.3f" % (4 + 16 * s / 100), "Helvetica", 8, align="c")
        c.showPage()
        # page 3 --------------------------------------------------
        frame(c)
        txt(c, 306, 39.5, "Calibration Graphs — %s" % t["tag"], "Helvetica-Bold", 12, align="c")
        txt(c, 306, 53.5, "%s  ·  %s  ·  S/N %s" % (t["cert"], rng, t["sn"]), "Helvetica", 9, align="c")
        png = os.path.join(TMP, "graph_%d.png" % id(t)); graphs_png(t, pts, png)
        iw, ih = ImageReader(png).getSize(); w = 510; h = w * ih / iw
        if h > 650: h = 650; w = h * iw / ih
        c.drawImage(ImageReader(png), 306 - w / 2, LH - 75 - h, w, h)
        txt(c, 306, 752, "Erreur %% EM = erreur max (mA) / 16 × 100   ·   Tolérance ±%s mA" % ("%.2f" % TOL_MA).replace(".", ","), "DJ", 6.4, "#595959", "c")
        c.showPage()
    c.save()

def render(data, out_path, base_dir=None):
    """Produit le PDF complet (corps + certificats). Renvoie le nombre de pages du corps et de certificats."""
    _charger(data, base_dir)
    body_pdf = os.path.join(TMP, "_corps.pdf"); cert_pdf = os.path.join(TMP, "_certs.pdf")
    n = build_body(body_pdf)
    fichiers = [body_pdf]
    nb = len([t for t in tx if t["ok"]])
    if nb: certificates(cert_pdf); fichiers.append(cert_pdf)
    w = PdfWriter()
    for f in fichiers:
        for p in PdfReader(f).pages: w.add_page(p)
    w.add_metadata({"/Title": META.get("pdf_title") or "Rapport d'intervention", "/Author": _soc()})
    with open(out_path, "wb") as fh: w.write(fh)
    return {"pages_corps": n, "certificats": nb}

if __name__ == "__main__":
    src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else "rapport.pdf"
    base = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(os.path.abspath(src))
    with open(src, encoding="utf-8") as fh: r = render(json.load(fh), out, base)
    print("OK", out, "corps:", r["pages_corps"], "pages, certificats:", r["certificats"])
