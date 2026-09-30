import os
import sys
import re
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

from db import products_collection, price_history_collection

from amazon_scraper import get_amazon_price
from flipkart_scraper import get_flipkart_price
from vijay_sales_scraper import get_vijay_sales_price

# Load ML Prediction Module
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "ml", "scripts"))
try:
    from predict import predict_price
except Exception as e:
    print("Warning: Could not import predict_price:", e)
    predict_price = None

app = Flask(__name__)
CORS(app)


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():

    return jsonify({
        "message": "Price Comparison API is running"
    })


# ============================================================
# API TEST
# ============================================================

@app.route("/api/test")
def test():

    return jsonify({
        "status": "success",
        "message": "Backend API is working"
    })


# ============================================================
# GET ALL PRODUCTS
# ============================================================

@app.route("/api/products")
def get_products():

    try:
        products = list(
            products_collection.find(
                {},
                {"_id": 0}
            )
        )
        return jsonify(products)
    except Exception as e:
        print("Database error in get_products:", e)
        return jsonify([]), 200


# ============================================================
# GET PRICE HISTORY
# ============================================================

@app.route("/api/price-history")
def get_price_history():

    model = request.args.get("model")
    platform = request.args.get("platform")

    query = {}

    # Exact model filter
    if model:
        query["product_name"] = {
            "$regex": re.escape(model),
            "$options": "i"
        }

    # Optional platform filter
    if platform:
        query["platform"] = {
            "$regex": f"^{re.escape(platform)}$",
            "$options": "i"
        }

    try:
        history = list(
            price_history_collection.find(
                query,
                {"_id": 0}
            ).sort("date", 1)
        )

        # Format date for frontend consumption
        for item in history:
            if "date" in item and hasattr(item["date"], "strftime"):
                item["date"] = item["date"].strftime("%Y-%m-%d %H:%M:%S")

        return jsonify(history)

    except Exception as e:
        print("Database error in get_price_history:", e)
        return jsonify([]), 200


# ============================================================
# ML PREDICT PRICE
# ============================================================

@app.route("/api/predict-price")
def get_predicted_price():

    platform = request.args.get("platform", "Amazon")
    brand = request.args.get("brand", "Samsung")
    category = request.args.get("category", "Refrigerator")
    capacity = request.args.get("capacity", "256 L")
    model = request.args.get("model", None)
    target_date = request.args.get("date", None)

    if predict_price is None:
        return jsonify({
            "status": "error",
            "message": "Prediction model is currently unavailable."
        }), 503

    try:
        res = predict_price(
            platform=platform,
            brand=brand,
            category=category,
            capacity=capacity,
            model=model,
            target_date=target_date
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Prediction failed: {str(e)}"
        }), 500


# ============================================================
# SEARCH PRODUCT IN DATABASE
# ============================================================

@app.route("/api/products/search")
def search_product():

    product_name = request.args.get("name")

    if not product_name:

        return jsonify({
            "error": "Product name is required"
        }), 400

    product = products_collection.find_one(
        {
            "product_name": {
                "$regex": product_name,
                "$options": "i"
            }
        },
        {
            "_id": 0
        }
    )

    if not product:

        return jsonify({
            "message": "Product not found"
        }), 404

    return jsonify(product)


# ============================================================
# COMPARE STORED PRICES
# ============================================================

@app.route("/api/compare/<product_name>")
def compare_prices(product_name):

    prices = list(
        price_history_collection.find(
            {
                "product_name": {
                    "$regex": product_name,
                    "$options": "i"
                }
            },
            {
                "_id": 0,
                "platform": 1,
                "price": 1,
                "availability": 1
            }
        )
    )

    comparison = {}

    for item in prices:

        platform = item["platform"]

        comparison[platform] = {
            "price": item.get("price"),
            "availability": item.get(
                "availability",
                "Available"
            )
        }

    return jsonify({

        "product_name": product_name,

        "prices": comparison

    })


# ============================================================
# SAVE LIVE PRICE TO HISTORY
# ============================================================

def save_live_price(result, brand, category, model):

    # --------------------------------------------------------
    # Do not save unavailable results
    # --------------------------------------------------------

    if result.get("price") is None:
        return

    if result.get("product_name") is None:
        return

    # --------------------------------------------------------
    # If an exact model was requested, make sure the
    # product name actually contains that model.
    # --------------------------------------------------------

    if model:

        product_name = result.get(
            "product_name",
            ""
        )

        if model.lower() not in product_name.lower():

            print(
                "Not saving because model does not match:",
                product_name
            )

            return

    try:
        # Check if snapshot for this platform, product, and price already exists today
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        existing = price_history_collection.find_one({
            "platform": result["platform"],
            "product_name": result["product_name"],
            "price": result["price"],
            "date": {"$gte": today_start}
        })

        if existing:
            print(f"Skipping duplicate live price snapshot for {result['platform']} today.")
            return

        # Create historical record
        history_record = {
            "product_name": result["product_name"],
            "brand": brand,
            "category": category,
            "platform": result["platform"],
            "price": result["price"],
            "availability": result.get("availability", "Available"),
            "date": datetime.now()
        }

        # Save to MongoDB
        price_history_collection.insert_one(history_record)
        print("Live price saved:", result["platform"], result["price"])

    except Exception as e:
        print("Could not save live price to MongoDB:", e)


# ============================================================
# LIVE MULTI-PLATFORM PRICE COMPARISON
# ============================================================

@app.route("/api/live-compare")
def live_compare():

    search_query = request.args.get(
        "query",
        "Samsung 256L refrigerator"
    )

    brand = request.args.get(
        "brand",
        "Samsung"
    )

    capacity = request.args.get(
        "capacity",
        "256 L"
    )

    model = request.args.get(
        "model",
        None
    )

    category = request.args.get(
        "category",
        "Refrigerator"
    )

    results = []


    # ========================================================
    # AMAZON
    # ========================================================

    try:

        amazon_result = get_amazon_price(

            search_query,

            brand=brand,

            capacity=capacity,

            model=model

        )

        amazon_result["availability"] = amazon_result.get(
            "availability",
            "Available"
        )

        results.append(
            amazon_result
        )

    except Exception as e:

        print(
            "Amazon error:",
            e
        )

        results.append({

            "platform": "Amazon",

            "product_name": None,

            "price": None,

            "availability": "Price unavailable"

        })


    # ========================================================
    # FLIPKART
    # ========================================================

    try:

        flipkart_result = get_flipkart_price(

            search_query,

            brand=brand,

            capacity=capacity,

            model=model

        )

        flipkart_result["availability"] = flipkart_result.get(
            "availability",
            "Available"
        )

        results.append(
            flipkart_result
        )

    except Exception as e:

        print(
            "Flipkart error:",
            e
        )

        results.append({

            "platform": "Flipkart",

            "product_name": None,

            "price": None,

            "availability": "Price unavailable"

        })


    # ========================================================
    # VIJAY SALES
    # ========================================================

    try:

        vijay_result = get_vijay_sales_price(

            search_query,

            brand=brand,

            capacity=capacity,

            model=model

        )

        results.append(
            vijay_result
        )

    except Exception as e:

        print(
            "Vijay Sales error:",
            e
        )

        results.append({

            "platform": "Vijay Sales",

            "product_name": None,

            "price": None,

            "availability": "Price unavailable"

        })


    # ========================================================
    # SAVE SUCCESSFUL LIVE PRICES
    # ========================================================

    for result in results:

        try:

            save_live_price(
                result,
                brand,
                category,
                model
            )

        except Exception as e:

            print(
                "Could not save price history:",
                e
            )


    # ========================================================
    # FIND AVAILABLE PRODUCTS
    # ========================================================

    available_results = []

    for result in results:

        price = result.get("price")

        availability = result.get(
            "availability",
            "Available"
        )

        if (
            price is not None
            and availability.lower() != "out of stock"
        ):

            available_results.append(
                result
            )


    # ========================================================
    # RECOMMENDATION
    # ========================================================

    if available_results:

        recommended = min(
            available_results,
            key=lambda item: item["price"]
        )

        recommendation = {
            "platform": recommended["platform"],
            "price": recommended["price"],
            "current_price": recommended["price"],
            "product_name": recommended["product_name"],
            "availability": recommended.get("availability", "Available"),
            "reason": "Lowest available price"
        }

        # Enrich recommendation with ML predicted price if available
        if predict_price is not None:
            try:
                pred = predict_price(
                    platform=recommended["platform"],
                    brand=brand,
                    category=category,
                    capacity=capacity,
                    model=model
                )
                if pred.get("status") == "success":
                    predicted_val = pred["predicted_price"]
                    recommendation["predicted_price"] = predicted_val
                    recommendation["model_used"] = pred.get("model_used")
                    diff = recommended["price"] - predicted_val
                    recommendation["price_difference"] = diff
            except Exception as e:
                print("Could not compute prediction for recommendation:", e)

    else:

        recommendation = {
            "platform": None,
            "price": None,
            "current_price": None,
            "predicted_price": None,
            "product_name": None,
            "availability": "Price unavailable",
            "reason": "No available price"
        }


    # ========================================================
    # FINAL RESPONSE
    # ========================================================

    return jsonify({

        "search_query": search_query,

        "brand": brand,

        "capacity": capacity,

        "category": category,

        "model": model,

        "results": results,

        "recommendation": recommendation

    })


# ============================================================
# START FLASK SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True
    )