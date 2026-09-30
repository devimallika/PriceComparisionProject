from datetime import datetime

from vijay_sales_scraper import get_vijay_sales_price
from db import price_history_collection


result = get_vijay_sales_price(
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
        "availability": result["availability"],
        "date": datetime.now()
    }

    price_history_collection.insert_one(record)

    print()
    print("--- SAVED TO MONGODB ---")
    print("Platform:", record["platform"])
    print("Product:", record["product_name"])
    print("Price:", f"₹{record['price']:,}")
    print("Availability:", record["availability"])
    print("Date:", record["date"])

else:

    print()
    print("--- PRICE NOT AVAILABLE ---")
    print("Vijay Sales price could not be retrieved.")
    print("Nothing was saved to MongoDB.")