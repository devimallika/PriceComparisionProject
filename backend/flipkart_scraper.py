from playwright.sync_api import sync_playwright


def get_flipkart_price(
    search_query,
    brand="Samsung",
    capacity="256 L",
    model=None
):
    with sync_playwright() as p:

        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = (
            "https://www.flipkart.com/search?q="
            + search_query.replace(" ", "+")
        )

        print("Opening Flipkart...")

        page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=30000
        )

        page.wait_for_timeout(5000)

        # Get product containers
        products = page.locator(
            "div[data-id]"
        )

        print("Products found:", products.count())

        for i in range(products.count()):

            product = products.nth(i)

            try:
                # Get complete product text
                text = product.inner_text()

                text_lower = text.lower()

                # Check brand
                if brand.lower() not in text_lower:
                    continue

                # Check capacity
                capacity_number = (
                    capacity.lower()
                    .replace(" ", "")
                )

                if capacity_number not in text_lower.replace(
                    " ", ""
                ):
                    continue

                # Model check
                if model:
                    if model.lower() not in text_lower:
                        continue

                # Find price
                # Find price using robust text selector for rupee symbol
                price = None
                price_elem = product.locator('text=₹').first
                if price_elem.count() > 0:
                    try:
                        price_text = price_elem.inner_text().strip()
                        cleaned_price = price_text.replace('₹', '').replace(',', '').strip()
                        if cleaned_price.isdigit():
                            price = int(cleaned_price)
                    except Exception:
                        pass
                # Fallback: generic search for divs with rupee text if above fails
                if price is None:
                    price_elements = product.locator('div').filter(has_text='₹')
                    for j in range(price_elements.count()):
                        try:
                            price_text = price_elements.nth(j).inner_text().strip()
                            cleaned_price = price_text.replace('₹', '').replace(',', '').strip()
                            if cleaned_price.isdigit():
                                price = int(cleaned_price)
                                break
                        except Exception:
                            continue

                # ------------------------------------------------
                # PRODUCT TITLE
                # ------------------------------------------------
                # Try known Flipkart title selectors (including current layout)
                title_loc = product.locator('div.RG5Slk, div._4rR01T, div.s1Q9rs').first
                if title_loc.count() > 0:
                    name = title_loc.inner_text().strip()
                else:
                    # Fallback: derive name from text lines as before
                    lines = [line.strip() for line in text.split("\n") if line.strip()]
                    name = None
                    for line in lines:
                        low = line.lower()
                        if low in ["add to compare", "rating", "review"]:
                            continue
                        if low.startswith("₹"):
                            continue
                        if "off" in low or "days price" in low:
                            continue
                        if "only " in low and "left" in low:
                            continue
                        name = line
                        break
                    if name is None:
                        name = f"Samsung {capacity} Refrigerator ({model})" if model else "Samsung Refrigerator"
                # Exact model verification (if model provided)
                # if model:
                #     if model.lower() not in name.lower():
                #         continue

                # Check availability
                availability = "Available"
                if "notify me" in text_lower:
                    availability = "Notify Me"
                elif "out of stock" in text_lower or "currently unavailable" in text_lower:
                    availability = "Out of Stock"

                result = {
                    "platform": "Flipkart",
                    "product_name": name,
                    "price": price,
                    "availability": availability
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
            "platform": "Flipkart",
            "product_name": None,
            "price": None,
            "availability": "Price unavailable"
        }


if __name__ == "__main__":

    result = get_flipkart_price(
        "Samsung 256L refrigerator",
        brand="Samsung",
        capacity="256 L",
        model="RT40H30U3THL"
    )

    print()
    print("--- FLIPKART RESULT ---")
    print(result)