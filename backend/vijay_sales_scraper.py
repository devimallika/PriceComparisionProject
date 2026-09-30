from playwright.sync_api import sync_playwright


def get_vijay_sales_price(
    search_query,
    brand="Samsung",
    capacity="256 L",
    model=None
):
    with sync_playwright() as p:

        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = (
            "https://www.vijaysales.com/c/refrigerators/brand/"
            "buy-samsung-refrigerators"
        )

        print("Opening Vijay Sales...")

        page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=30000
        )

        page.wait_for_timeout(5000)


        # --------------------------------------------------------
        # FIND PRODUCTS
        # --------------------------------------------------------

        products = page.locator(
            "body"
        )

        page_text = products.inner_text()

        text_lower = page_text.lower()


        # --------------------------------------------------------
        # MODEL CHECK
        # --------------------------------------------------------

        if model:

            if model.lower() not in text_lower:

                browser.close()

                return {
                    "platform": "Vijay Sales",
                    "product_name": None,
                    "price": None,
                    "availability": "Price unavailable"
                }


        # --------------------------------------------------------
        # FIND PRODUCT
        # --------------------------------------------------------

        product = page.get_by_text(
            "Samsung 256 L Frost Free Double Door Refrigerator",
            exact=False
        ).first


        if product.count() == 0:

            browser.close()

            return {
                "platform": "Vijay Sales",
                "product_name": None,
                "price": None,
                "availability": "Price unavailable"
            }


        card = product.locator(
            "xpath=../../.."
        )


        card_text = card.inner_text()


        print()
        print("--- PRODUCT FOUND ---")
        print(card_text)


        # --------------------------------------------------------
        # CHECK MODEL INSIDE PRODUCT CARD
        # --------------------------------------------------------

        if model:

            if model.lower() not in card_text.lower():

                browser.close()

                return {
                    "platform": "Vijay Sales",
                    "product_name": None,
                    "price": None,
                    "availability": "Price unavailable"
                }


        # --------------------------------------------------------
        # FIND PRICE
        # --------------------------------------------------------

        price = None


        for line in card_text.split("\n"):

            line = line.strip()


            if line.startswith("₹"):

                cleaned = (
                    line
                    .replace("₹", "")
                    .replace(",", "")
                    .strip()
                )


                if cleaned.isdigit():

                    price = int(cleaned)

                    break


        # --------------------------------------------------------
        # CHECK AVAILABILITY
        # --------------------------------------------------------

        if "Out Of Stock" in card_text:

            availability = "Out Of Stock"

        elif "Notify Me" in card_text:

            availability = "Out Of Stock"

        else:

            availability = "Available"


        # --------------------------------------------------------
        # RESULT
        # --------------------------------------------------------

        prod_name = product.inner_text().strip()
        if model and model.lower() not in prod_name.lower():
            prod_name = f"{prod_name} ({model})"

        result = {

            "platform": "Vijay Sales",

            "product_name": prod_name,

            "price": price,

            "availability": availability

        }


        browser.close()

        return result


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