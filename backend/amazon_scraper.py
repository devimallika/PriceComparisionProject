from playwright.sync_api import sync_playwright


def get_amazon_price(
    search_query,
    brand="Samsung",
    capacity="256 L",
    model=None
):
    with sync_playwright() as p:

        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = (
            "https://www.amazon.in/s?k="
            + search_query.replace(" ", "+")
        )

        print("Opening Amazon...")

        page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=30000
        )

        page.wait_for_timeout(5000)

        products = page.locator(
            'div[data-component-type="s-search-result"]'
        )

        print("Products found:", products.count())

        for i in range(products.count()):

            product = products.nth(i)

            try:

                product_text = product.inner_text()

                text_lower = product_text.lower()

                # ------------------------------------------------
                # BRAND CHECK
                # ------------------------------------------------

                if brand.lower() not in text_lower:
                    continue


                # ------------------------------------------------
                # CAPACITY CHECK
                # ------------------------------------------------

                capacity_number = (
                    capacity.lower()
                    .replace(" ", "")
                )

                if capacity_number not in text_lower.replace(
                    " ",
                    ""
                ):
                    continue


                # ------------------------------------------------
                # MODEL CHECK
                # ------------------------------------------------

                if model:

                    if model.lower() not in text_lower:
                        continue


                # ------------------------------------------------
                # PRODUCT TITLE
                # ------------------------------------------------

                title = product.locator(
                    "h2.a-size-medium"
                ).first

                if title.count() == 0:
                    title = product.locator(
                        "h2 a span, h2 span, h2"
                    ).first

                if title.count() == 0:
                    continue

                name = title.inner_text().strip()


                # ------------------------------------------------
                # PRICE
                # ------------------------------------------------

                price = None

                price_element = product.locator(
                    "span.a-price-whole"
                ).first

                if price_element.count() > 0:

                    try:
                        price_text = (
                            price_element
                            .inner_text()
                            .strip()
                            .replace(",", "")
                            .replace(".", "")
                        )

                        if price_text.isdigit():
                            price = int(price_text)
                    except Exception:
                        pass

                # Fallback to offscreen price span
                if price is None:
                    offscreen = product.locator(
                        "span.a-price span.a-offscreen"
                    ).first

                    if offscreen.count() > 0:
                        try:
                            clean_txt = (
                                offscreen
                                .inner_text()
                                .replace("₹", "")
                                .replace(",", "")
                                .strip()
                            )
                            if clean_txt.isdigit():
                                price = int(clean_txt)
                        except Exception:
                            pass

                # Fallback to text regex for rupee amount
                if price is None:
                    import re
                    match = re.search(r'₹\s*([0-9,]+)', product_text)
                    if match:
                        try:
                            price = int(match.group(1).replace(",", ""))
                        except Exception:
                            pass

                # ------------------------------------------------
                # AVAILABILITY
                # ------------------------------------------------

                availability = "Available"
                if "notify me" in text_lower:
                    availability = "Notify Me"
                elif (
                    "out of stock" in text_lower
                    or "currently unavailable" in text_lower
                ):
                    availability = "Out of Stock"


                # Extract product link if available
                product_url = None
                link_el = product.locator("h2 a").first
                if link_el.count() > 0:
                    try:
                        href = link_el.get_attribute("href")
                        if href:
                            product_url = href if href.startswith("http") else f"https://www.amazon.in{href}"
                    except Exception:
                        pass

                # ------------------------------------------------
                # RESULT
                # ------------------------------------------------

                result = {

                    "platform": "Amazon",

                    "product_name": name,

                    "price": price,

                    "availability": availability,

                    "product_url": product_url

                }


                browser.close()

                return result


            except Exception as e:

                print(
                    f"Skipping product {i}: "
                    f"{type(e).__name__}"
                )

                continue


        browser.close()


        return {

            "platform": "Amazon",

            "product_name": None,

            "price": None,

            "availability": "Price unavailable",

            "product_url": None

        }


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    result = get_amazon_price(

        "Samsung 256L refrigerator",

        brand="Samsung",

        capacity="256 L",

        model="RT40H30U3THL"

    )

    print()
    print("--- AMAZON RESULT ---")
    print(result)