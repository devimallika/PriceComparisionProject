from datetime import datetime

from flipkart_scraper import get_flipkart_price
from db import price_history_collection


result = get_flipkart_price(
    "Samsung 256L refrigerator",
    brand="Samsung",
    capacity="256 L"
)


if result["price"] is not None:

    record = {
        "product_name": result["product_name"],
        "brand": "Samsung",
        "category": "Refrigerator",
        "platform": result["platform"],
        "price": result["price"],
        "date": datetime.now()
    }

    price_history_collection.insert_one(record)

    print()
    print("--- SAVED TO MONGODB ---")
    print("Platform:", record["platform"])
    print("Product:", record["product_name"])
    print("Price:", f"₹{record['price']:,}")
    print("Date:", record["date"])

else:

    print()
    print("--- PRICE NOT AVAILABLE ---")
    print("Flipkart price could not be retrieved.")
    print("Nothing was saved to MongoDB.")