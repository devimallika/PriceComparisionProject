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

                # Check exact model when provided
                if model:
                    if model.lower() not in text_lower:
                        continue

                # Find price
                price_elements = product.locator(
                    "div"
                ).filter(
                    has_text="₹"
                )

                price = None

                for j in range(price_elements.count()):

                    try:
                        price_text = (
                            price_elements
                            .nth(j)
                            .inner_text()
                            .strip()
                        )

                        cleaned_price = (
                            price_text
                            .replace("₹", "")
                            .replace(",", "")
                            .strip()
                        )

                        if cleaned_price.isdigit():

                            price = int(cleaned_price)

                            break

                    except Exception:
                        continue

                # Get clean product name
                lines = [
                    line.strip()
                    for line in text.split("\n")
                    if line.strip()
                ]

                name = None

                for line in lines:

                    line_lower = line.lower()

                    # Skip non-product information
                    if line_lower == "add to compare":
                        continue

                    if "rating" in line_lower:
                        continue

                    if "review" in line_lower:
                        continue

                    if "digital inverter compressor" in line_lower:
                        continue

                    if "built-in stabilizer" in line_lower:
                        continue

                    if "warranty" in line_lower:
                        continue

                    if line.startswith("₹"):
                        continue

                    if "off" in line_lower:
                        continue

                    if "days price" in line_lower:
                        continue

                    if (
                        "only " in line_lower
                        and "left" in line_lower
                    ):
                        continue

                    # First suitable line = product name
                    name = line
                    break

                if name is None:
                    name = f"Samsung {capacity} Refrigerator ({model})" if model else "Samsung Refrigerator"

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