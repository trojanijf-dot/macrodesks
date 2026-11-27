#!/usr/bin/env python3
"""
Moteur des RAPPORTS D'INTERVENTION CALINSTRUM.

Reproduit à l'identique la trame du rapport d'intervention de référence
(A4, ReportLab, Liberation Sans).

Plus-value GRC : le rapport est construit à partir des POSTES DU DEVIS.
  - `devis.postes[]` alimente automatiquement le tableau « Réalisation des
    postes du devis » (désignation du devis / réalisation / état).
  - chaque poste peut porter ses propres photos (`photos[]`) : le bloc
    `reportage_postes` génère alors seul le reportage photographique, un
    sous-titre par poste, avec renvoi « (photos §x.y) » dans le tableau.

Usage :
    python moteur_rapport.py contenu.json sortie.pdf
"""
import json
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame,
                                Image, KeepTogether, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# Charte (mesurée sur le PDF de référence, en points)
# --------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MX = 59.5                                 # marges gauche / droite (21 mm)
CW = PAGE_W - 2 * MX                      # 476,3 pt utiles
TOP = 70                                  # haut du corps
BOTTOM = 62                               # bas du corps (filet de pied à 44 pt)

NAVY = colors.HexColor("#102441")         # bandeau d'en-tête, barres de section, entêtes tableaux
TITLE = colors.HexColor("#1B3160")        # titre, sous-titre, H2
ORANGE = colors.HexColor("#E85D04")       # filet d'en-tête, « En attente », filet des encadrés
TXT = colors.HexColor("#1A1A1A")
GREY = colors.HexColor("#6B7280")         # légendes, pied de page
GREY2 = colors.HexColor("#4B5563")        # lignes d'info de garde
ALT = colors.HexColor("#F2F4F7")          # lignes alternées, encadrés, bloc d'identification
WARN = colors.HexColor("#FDF1E7")         # lignes à signaler, encadré « à la charge du Client »
RULE = colors.HexColor("#C9CFD9")         # bordures 0,5 pt
GREEN = colors.HexColor("#2E7D32")        # coche ✔

# --------------------------------------------------------------------------
# Polices
# --------------------------------------------------------------------------
def _font_dirs():
    return [os.path.join(HERE, "assets", "fonts"),
            "/usr/share/fonts/truetype/liberation",
            "/usr/share/fonts/truetype/dejavu"]


def _find(name):
    for d in _font_dirs():
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def _register():
    ok = all(_find(f) for f in ["LiberationSans-Regular.ttf",
                                "LiberationSans-Bold.ttf",
                                "LiberationSans-Italic.ttf",
                                "LiberationSans-BoldItalic.ttf"])
    if ok:
        pdfmetrics.registerFont(TTFont("LS", _find("LiberationSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("LS-B", _find("LiberationSans-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("LS-I", _find("LiberationSans-Italic.ttf")))
        pdfmetrics.registerFont(TTFont("LS-BI", _find("LiberationSans-BoldItalic.ttf")))
        pdfmetrics.registerFontFamily("LS", normal="LS", bold="LS-B",
                                      italic="LS-I", boldItalic="LS-BI")
        f = ("LS", "LS-B")
    else:
        f = ("Helvetica", "Helvetica-Bold")
    sym = "Helvetica"
    if _find("DejaVuSans.ttf"):
        pdfmetrics.registerFont(TTFont("DejaVuSans", _find("DejaVuSans.ttf")))
        sym = "DejaVuSans"
    return f + (sym,)


F, FB, FSYM = _register()

# --------------------------------------------------------------------------
# Styles
# --------------------------------------------------------------------------
def st(name, **kw):
    base = dict(fontName=F, fontSize=8.6, leading=12.6, textColor=TXT)
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "body": st("body", alignment=TA_JUSTIFY, spaceAfter=5),
    "alert": st("alert", fontName=FB, fontSize=8, leading=12.6,
                textColor=ORANGE, alignment=TA_JUSTIFY, spaceAfter=5),
    "bullet": st("bullet", leftIndent=12, bulletIndent=3,
                 bulletFontName="Helvetica", bulletFontSize=10,
                 alignment=TA_JUSTIFY, spaceAfter=2.5),
    "h2": st("h2", fontName=FB, fontSize=9.6, leading=12, textColor=TITLE,
             leftIndent=5, spaceBefore=6, spaceAfter=5),
    "section": st("section", fontName=FB, fontSize=10.5, leading=13,
                  textColor=colors.white),
    "cell": st("cell", fontSize=7.4, leading=9.6),
    "cell_b": st("cell_b", fontName=FB, fontSize=7.4, leading=9.6),
    "cell_head": st("cell_head", fontName=FB, fontSize=7.4, leading=9.6,
                    textColor=colors.white),
    "box_title": st("box_title", fontName=FB, fontSize=8.2, leading=11),
    "box": st("box", fontSize=8, leading=11.6),
    "caption": st("caption", fontSize=6.8, leading=8.6, textColor=GREY,
                  alignment=TA_CENTER),
    "kind": st("kind", fontName=FB, fontSize=8.6, leading=11,
               textColor=ORANGE, alignment=TA_CENTER),
    "title": st("title", fontName=FB, fontSize=19, leading=23,
                textColor=TITLE, alignment=TA_CENTER),
    "subtitle": st("subtitle", fontName=FB, fontSize=10.6, leading=13,
                   textColor=TITLE, alignment=TA_CENTER),
    "info": st("info", fontSize=7.6, leading=10.4, textColor=GREY2,
               alignment=TA_CENTER),
    "id_label": st("id_label", fontName=FB, fontSize=7.4, leading=9.6),
    "id_value": st("id_value", fontSize=7.4, leading=9.6),
    "sign": st("sign", fontSize=7.6, leading=10.2),
}

# Rendu des états de poste / de mesure
CHECK = '<font name="{}" color="#2E7D32">✔</font>'.format(FSYM)
ATTENTE = '<font color="#E85D04"><b>En attente</b></font>'
ETATS = {
    "ok": CHECK,
    "attente": ATTENTE,
    "ok_attente": CHECK + " / " + ATTENTE,
    "nok": '<font color="#C00000"><b>Non réalisé</b></font>',
    "en_cours": '<font color="#E85D04"><b>En cours</b></font>',
}


def rich(t):
    """<b>, <i>, <br/> natifs ; <o>…</o> = gras orange ; [ok] = ✔ vert ; [attente]."""
    t = str(t)
    t = t.replace("<o>", '<font color="#E85D04"><b>').replace("</o>", "</b></font>")
    t = t.replace("[ok]", CHECK).replace("[attente]", ATTENTE)
    return t


def P(t, s="body"):
    return Paragraph(rich(t), S[s] if isinstance(s, str) else s)


# --------------------------------------------------------------------------
# Page : bandeau d'en-tête, filet orange, pied de page
# --------------------------------------------------------------------------
class Doc(BaseDocTemplate):
    def __init__(self, path, meta):
        self.meta = meta
        super().__init__(path, pagesize=A4, leftMargin=MX, rightMargin=MX,
                         topMargin=TOP, bottomMargin=BOTTOM,
                         title=meta.get("pdf_title", ""), author="CALINSTRUM")
        fr = Frame(MX, BOTTOM, CW, PAGE_H - TOP - BOTTOM, 0, 0, 0, 0, id="f")
        self.addPageTemplates([PageTemplate("p", [fr], onPage=self.decor)])

    def decor(self, c, doc):
        m = self.meta
        c.saveState()
        # Bandeau bleu nuit 18 pt
        c.setFillColor(NAVY)
        c.rect(MX, PAGE_H - 44, CW, 18, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(FB, 7.6)
        c.drawString(MX + 10, PAGE_H - 38.5, m.get("banner_left", "CALINSTRUM"))
        c.setFont(F, 7.6)
        c.drawString(MX + 74, PAGE_H - 38.5,
                     m.get("banner_center", "Service Instrumentation   ·   Nouméa"))
        c.drawRightString(MX + CW - 10, PAGE_H - 38.5, m.get("banner_right", ""))
        # Filet orange 6 pt
        c.setFillColor(ORANGE)
        c.rect(MX, PAGE_H - 55.5, CW, 6, stroke=0, fill=1)
        # Pied de page
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.line(MX, PAGE_H - 797.9, MX + CW, PAGE_H - 797.9)
        c.setFillColor(GREY)
        c.setFont(F, 6.6)
        c.drawString(MX, PAGE_H - 808, m.get("footer_left", ""))
        c.drawRightString(MX + CW, PAGE_H - 808,
                          "{} · Page {}".format(m.get("footer_right", ""), doc.page))
        c.restoreState()


# --------------------------------------------------------------------------
# Flowables
# --------------------------------------------------------------------------
class SectionBar(Flowable):
    """Barre de section : fond bleu nuit 26 pt, « n · Titre » blanc 10,5 gras."""

    def __init__(self, text):
        super().__init__()
        self.text = text

    def wrap(self, aw, ah):
        return CW, 26

    def draw(self):
        c = self.canv
        c.setFillColor(NAVY)
        c.rect(0, 0, CW, 26, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(FB, 10.5)
        c.drawString(9, 9.2, self.text)


def section(text):
    return [CondPageBreak(110), Spacer(1, 10), SectionBar(text), Spacer(1, 8)]


def box(block):
    """Encadré gris (SYNTHÈSE, ANALYSE) ou crème (alerte Client), filet orange à gauche."""
    rows = []
    if block.get("title"):
        rows.append(P(block["title"], "box_title"))
        rows.append(Spacer(1, 3))
    for it in block.get("items", []):
        if isinstance(it, dict) and "bullet" in it:
            rows.append(P("•  " + it["bullet"], "box"))
        elif isinstance(it, dict) and "text" in it:
            rows.append(P(it["text"], "box"))
        else:
            rows.append(P("•  " + it, "box"))
    t = Table([[rows]], colWidths=[CW])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARN if block.get("variant") == "client" else ALT),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, ORANGE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ] + ([("BOX", (0, 0), (-1, -1), 0.5, RULE)] if block.get("variant") == "client" else [])))
    return [Spacer(1, 2), t, Spacer(1, 10)]


def table(columns, rows, widths, highlight=None, bold_first=False, caption=None):
    """Tableau standard : entête bleu nuit, une ligne sur deux #F2F4F7,
    lignes signalées (#FDF1E7) prioritaires."""
    tot = float(sum(widths))
    widths = [CW * w / tot for w in widths]
    data = [[P(h, "cell_head") for h in columns]]
    for r in rows:
        data.append([P(v if not isinstance(v, list) else "<br/>".join(v),
                       "cell_b" if (bold_first and j == 0) else "cell")
                     for j, v in enumerate(r)])
    ts = [("BACKGROUND", (0, 0), (-1, 0), NAVY),
          ("GRID", (0, 0), (-1, -1), 0.5, RULE),
          ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("LEFTPADDING", (0, 0), (-1, -1), 5),
          ("RIGHTPADDING", (0, 0), (-1, -1), 5),
          ("TOPPADDING", (0, 0), (-1, -1), 4.25),
          ("BOTTOMPADDING", (0, 0), (-1, -1), 4.25)]
    for i in range(2, len(data), 2):
        ts.append(("BACKGROUND", (0, i), (-1, i), ALT))
    for i in (highlight or []):
        ts.append(("BACKGROUND", (0, i + 1), (-1, i + 1), WARN))
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(ts))
    out = [t]
    if caption:
        out += [Spacer(1, 4), P(caption, "caption")]
    out.append(Spacer(1, 8))
    return out


def _img_path(src, base):
    return src if os.path.isabs(src) else os.path.join(base, src)


def photo_grid(photos, base, cols=None, height=None):
    """Grille de photos : n colonnes égales, photos centrées à hauteur fixe,
    légende grise 6,8 centrée sous chaque photo."""
    n = cols or min(len(photos), 4)
    cell_w = CW / n
    h = height or {1: 280, 2: 270, 3: 190, 4: 198}.get(n, 198)
    pad = 3.8
    cells_img, cells_cap = [], []
    for ph in photos:
        path = _img_path(ph["src"], base)
        iw, ih = ImageReader(path).getSize()
        w = h * iw / ih
        hh = h
        if w > cell_w - 2 * pad:
            w = cell_w - 2 * pad
            hh = w * ih / iw
        cells_img.append(Image(path, width=w, height=hh))
        cells_cap.append(P(ph.get("caption", ""), "caption"))
    rows_img, rows_cap = [], []
    for i in range(0, len(photos), n):
        ri = cells_img[i:i + n]
        rc = cells_cap[i:i + n]
        ri += [""] * (n - len(ri))
        rc += [""] * (n - len(rc))
        rows_img.append(ri)
        rows_cap.append(rc)
    out = [Spacer(1, 3)]
    for ri, rc in zip(rows_img, rows_cap):
        t = Table([ri, rc], colWidths=[cell_w] * n)
        t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
            ("VALIGN", (0, 1), (-1, 1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), pad),
            ("RIGHTPADDING", (0, 0), (-1, -1), pad),
            ("TOPPADDING", (0, 0), (-1, 0), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
        ]))
        out.append(t)
    out.append(Spacer(1, 4))
    return out


def figure(block, base):
    path = _img_path(block["src"], base)
    iw, ih = ImageReader(path).getSize()
    w = block.get("width_pt", CW * 0.916)
    h = w * ih / iw
    mh = block.get("max_height_pt", 280)
    if h > mh:
        h = mh
        w = h * iw / ih
    items = [Image(path, width=w, height=h), Spacer(1, 4)]
    if block.get("caption"):
        items.append(P(block["caption"], "caption"))
    return [KeepTogether(items), Spacer(1, 6)]


# --------------------------------------------------------------------------
# Page de garde
# --------------------------------------------------------------------------
def cover(meta, base):
    out = [Spacer(1, 17)]
    logos = meta.get("cover_logos", [])
    if logos:
        cells = []
        for lg in logos:
            path = _img_path(lg["src"], base if not lg["src"].startswith("assets/") else HERE)
            iw, ih = ImageReader(path).getSize()
            mw, mh = lg.get("max_w", 130), lg.get("max_h", 66)
            sc = min(mw / iw, mh / ih)
            cells.append(Image(path, width=iw * sc, height=ih * sc))
        t = Table([cells], colWidths=[CW / len(cells)] * len(cells), rowHeights=[66])
        t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        out.append(t)
    out += [Spacer(1, 16), P(meta.get("kind", "RAPPORT D'INTERVENTION"), "kind"),
            Spacer(1, 12), P(meta["title"], "title"), Spacer(1, 2)]
    if meta.get("subtitle"):
        out.append(P(meta["subtitle"], "subtitle"))
    out.append(Spacer(1, 8))
    for line in meta.get("info_lines", []):
        out.append(P(line, "info"))
    out.append(Spacer(1, 11))
    out.append(identification(meta.get("identification", {})))
    return out


def identification(ident):
    """Bloc d'identification : 2 colonnes de couples libellé / valeur sur fond #F2F4F7."""
    half = CW / 2

    def col(pairs, extra_right=0):
        data = [[P(k, "id_label"), P(v, "id_value")] for k, v in pairs]
        if not data:
            return ""
        t = Table(data, colWidths=[68, half - 10 - 68])
        ts = [("VALIGN", (0, 0), (-1, -1), "TOP"),
              ("LEFTPADDING", (0, 0), (-1, -1), 4),
              ("RIGHTPADDING", (0, 0), (-1, -1), 4),
              ("RIGHTPADDING", (1, 0), (1, -1), 4 + extra_right),
              ("TOPPADDING", (0, 0), (-1, -1), 5.8),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 5.8)]
        for i in range(len(data) - 1):
            ts.append(("LINEBELOW", (0, i), (-1, i), 0.5, RULE))
        t.setStyle(TableStyle(ts))
        return t

    t = Table([[col(ident.get("left", []), 20), col(ident.get("right", []))]],
              colWidths=[half, half])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ALT),
                           ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                           ("LINEAFTER", (0, 0), (0, 0), 0.5, RULE),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 5),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                           ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def signature(block, base):
    def side(d):
        items = [P("<b>{}</b>".format(d.get("title", "")), "sign")]
        for line in d.get("lines", []):
            items.append(P(line, "sign"))
        if d.get("stamp"):
            path = _img_path(d["stamp"], base if not d["stamp"].startswith("assets/") else HERE)
            iw, ih = ImageReader(path).getSize()
            items.append(Spacer(1, 2))
            items.append(Image(path, width=118, height=118 * ih / iw, hAlign="LEFT"))
        return items

    t = Table([[side(block.get("left", {})), side(block.get("right", {}))]],
              colWidths=[CW / 2, CW / 2], rowHeights=[block.get("height", 91.8)])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, RULE),
                           ("LINEAFTER", (0, 0), (0, 0), 0.5, RULE),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), 7)]))
    return [Spacer(1, 14), t]


# --------------------------------------------------------------------------
# Plus-value GRC : rapport piloté par les postes du devis
# --------------------------------------------------------------------------
def postes_table(devis, photo_refs):
    """Tableau « Réalisation des postes du devis » généré depuis devis.postes."""
    rows, hl = [], []
    for i, p in enumerate(devis["postes"]):
        real = p.get("realisation", "")
        ref = photo_refs.get(i)  # par ligne : plusieurs lignes peuvent partager un n° de poste
        if ref and "(photos §" not in real:
            real += " (photos §{})".format(ref)
        etat = ETATS.get(p.get("etat", ""), rich(p.get("etat", "")))
        rows.append([str(p["num"]), p["designation"], real, etat])
        if "attente" in p.get("etat", "") or p.get("etat") in ("nok", "en_cours"):
            hl.append(i)
    cols = ["Poste", "Désignation (devis {})".format(devis.get("reference", "")),
            "Réalisation", "État"]
    return table(cols, rows, [31, 185, 200.3, 60], highlight=hl)


def reportage_postes(devis, base, numero_section):
    """Reportage photo automatique : un sous-titre par poste ayant des photos."""
    out, k = [], 0
    for p in devis["postes"]:
        if not p.get("photos"):
            continue
        k += 1
        titre = p.get("titre_reportage") or "Poste {} – {}".format(
            p["num"], p["designation"].split(":")[0])
        grid = photo_grid(p["photos"], base, cols=p.get("photo_cols"),
                          height=p.get("photo_height"))
        head = [P("{}.{} {}".format(numero_section, k, titre), "h2")]
        if p.get("commentaire"):
            head.append(P(p["commentaire"]))
        # le titre ne reste jamais seul en bas de page : il suit sa 1re rangée de photos
        out += [KeepTogether(head + grid[:2])] + grid[2:]
    return out


def photo_refs_from_devis(devis, numero_section):
    refs, k = {}, 0
    for i, p in enumerate(devis.get("postes", [])):
        if p.get("photos"):
            k += 1
            refs[i] = "{}.{}".format(numero_section, k)
    return refs


# --------------------------------------------------------------------------
def build_story(content, base):
    meta = content["meta"]
    devis = content.get("devis", {"postes": []})
    story = cover(meta, base)
    # renvois automatiques vers le reportage piloté par le devis
    rp_section = next((b.get("section_number") for b in content["body"]
                       if b["type"] == "reportage_postes"), None)
    refs = photo_refs_from_devis(devis, rp_section) if rp_section else {}
    for b in content["body"]:
        t = b["type"]
        if t == "section":
            story += section(b["text"])
        elif t == "h2":
            story += [CondPageBreak(b.get("keep", 60)), P(b["text"], "h2")]
        elif t == "p":
            story.append(P(b["text"], b.get("style", "body")))
        elif t == "bullets":
            story += [Paragraph(rich(i), S["bullet"], bulletText="•") for i in b["items"]]
            story.append(Spacer(1, 4))
        elif t == "box":
            story += box(b)
        elif t == "table":
            story += table(b["columns"], b["rows"], b.get("widths") or [1] * len(b["columns"]),
                           b.get("highlight"), b.get("first_col_bold", False),
                           b.get("caption"))
        elif t == "postes_devis":
            story += postes_table(devis, refs)
        elif t == "reportage_postes":
            story += reportage_postes(devis, base, b["section_number"])
        elif t == "photos":
            story += photo_grid(b["photos"], base, b.get("cols"), b.get("height"))
        elif t == "figure":
            story += figure(b, base)
        elif t == "signature":
            story += signature(b, base)
        elif t == "spacer":
            story.append(Spacer(1, b.get("height", 10)))
        elif t == "pagebreak":
            story.append(PageBreak())
        else:
            raise ValueError("Bloc inconnu : " + t)
    return story


def render(content, out_path, base):
    Doc(out_path, content["meta"]).build(build_story(content, base))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = sys.argv[1]
    with open(src, encoding="utf-8") as fh:
        data = json.load(fh)
    render(data, sys.argv[2], os.path.dirname(os.path.abspath(src)))
    print("OK ->", sys.argv[2])
