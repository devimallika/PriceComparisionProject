from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    print("Opening Amazon search...")

    page.goto(
        "https://www.amazon.in/s?k=Samsung+253L+Refrigerator",
        wait_until="domcontentloaded",
        timeout=30000
    )

    page.wait_for_timeout(5000)

    print("URL:", page.url)
    print("\n--- AMAZON PAGE TEXT ---\n")

    text = page.locator("body").inner_text(timeout=15000)
    print(text[:5000])

    print("\n--- TEST COMPLETE ---")

    input("Press Enter to close the browser...")

    browser.close()