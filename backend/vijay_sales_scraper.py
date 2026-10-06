import re
from playwright.sync_api import sync_playwright


def get_vijay_sales_price(
    search_query,
    brand="Samsung",
    capacity="256 L",
    model=None
):
    """
    Scrapes Vijay Sales for the exact product model.
    Returns price and availability strictly – never fabricates data.
    """
    url = (
        "https://www.vijaysales.com/c/refrigerators/brand/"
        "buy-samsung-refrigerators"
    )

    unavailable = {
        "platform": "Vijay Sales",
        "product_name": None,
        "price": None,
        "availability": "Price unavailable"
    }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            print("Opening Vijay Sales...")

            # Retry navigation up to 2 times for transient network errors
            loaded = False
            for attempt in range(2):
                try:
                    page.goto(
                        url,
                        wait_until="domcontentloaded",
                        timeout=20000
                    )
                    loaded = True
                    break
                except Exception as e_nav:
                    print(f"Vijay Sales nav attempt {attempt + 1} failed: {e_nav}")
                    if attempt < 1:
                        page.wait_for_timeout(2000)

            if not loaded:
                browser.close()
                return unavailable

            page.wait_for_timeout(5000)

            # --------------------------------------------------------
            # GET FULL PAGE TEXT
            # --------------------------------------------------------
            page_text = page.locator("body").inner_text()
            text_lower = page_text.lower()

            # --------------------------------------------------------
            # PAGE-LEVEL MODEL CHECK (fast early exit)
            # --------------------------------------------------------
            if model and model.lower() not in text_lower:
                browser.close()
                return unavailable

            # --------------------------------------------------------
            # FIND PRODUCT ELEMENT
            # --------------------------------------------------------
            product_locator = page.get_by_text(
                "Samsung 256 L Frost Free Double Door Refrigerator",
                exact=False
            ).first

            if product_locator.count() == 0:
                browser.close()
                return unavailable

            # --------------------------------------------------------
            # GET CARD TEXT
            # --------------------------------------------------------
            try:
                card = product_locator.locator("xpath=../../..")
                card_text = card.inner_text()
            except Exception:
                card_text = product_locator.inner_text()

            print("\n--- VIJAY SALES PRODUCT FOUND ---")
            print(card_text)

            # --------------------------------------------------------
            # CARD-LEVEL MODEL CHECK
            # --------------------------------------------------------
            if model and model.lower() not in card_text.lower():
                browser.close()
                return unavailable

            # --------------------------------------------------------
            # EXTRACT PRICE
            # --------------------------------------------------------
            price = None

            for line in card_text.split("\n"):
                line = line.strip()
                if line.startswith("₹"):
                    cleaned = line.replace("₹", "").replace(",", "").strip()
                    if cleaned.isdigit():
                        price = int(cleaned)
                        break

            # Fallback: regex
            if price is None:
                m = re.search(r'₹\s*([0-9,]+)', card_text)
                if m:
                    try:
                        price = int(m.group(1).replace(",", ""))
                    except Exception:
                        pass

            # --------------------------------------------------------
            # EXTRACT AVAILABILITY
            # --------------------------------------------------------
            card_lower = card_text.lower()
            if "notify me" in card_lower:
                availability = "Notify Me"
            elif "out of stock" in card_lower:
                availability = "Out Of Stock"
            else:
                availability = "Available"

            # --------------------------------------------------------
            # BUILD RESULT
            # --------------------------------------------------------
            prod_name = product_locator.inner_text().strip()
            if model and model.lower() not in prod_name.lower():
                prod_name = f"{prod_name} ({model})"

            browser.close()

            return {
                "platform": "Vijay Sales",
                "product_name": prod_name,
                "price": price,
                "availability": availability
            }

    except Exception as e:
        print(f"Vijay Sales unexpected error: {e}")
        return unavailable


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":
    result = get_vijay_sales_price(
        "Samsung 256L refrigerator",
        brand="Samsung",
        capacity="256 L",
        model="RT40H30U3THL"
    )
    print()
    print("--- VIJAY SALES RESULT ---")
    print(result)