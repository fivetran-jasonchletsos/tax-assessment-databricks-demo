from playwright.sync_api import sync_playwright
import os

DIR = os.path.dirname(os.path.abspath(__file__))
HTML = f"file://{DIR}/activation-addendum.html"
OUT = f"{DIR}/activation-addendum.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(HTML)
    page.pdf(
        path=OUT,
        format="Letter",
        print_background=True,
        margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
    )
    browser.close()
print("wrote", OUT)
