from pypdf import PdfWriter
import shutil, os

DIR = os.path.dirname(os.path.abspath(__file__))
RUNBOOK = os.path.join(DIR, "..", "public", "Allegheny-County-Tax-3min-Demo-Runbook.pdf")
ADDENDUM = os.path.join(DIR, "activation-addendum.pdf")
TMP = RUNBOOK + ".tmp"

writer = PdfWriter()
writer.append(RUNBOOK)     # existing pages, untouched
writer.append(ADDENDUM)    # new final page
with open(TMP, "wb") as f:
    writer.write(f)

shutil.move(TMP, RUNBOOK)  # atomic overwrite, original pages preserved byte-identical
print("merged runbook written to", RUNBOOK)
