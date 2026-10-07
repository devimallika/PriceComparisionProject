import os
import sys
import concurrent.futures
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

    try:
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
    except Exception as e:
        print("Database error in search_product:", e)
        return jsonify({"message": "Database unavailable"}), 503

    if not product:

        return jsonify({
            "message": "Product not found"
        }), 404

    return jsonify(product)


# ============================================================
# GET AVAILABLE MODELS (for frontend dropdown)
# ============================================================

# Known/verified models — used as fallback when DB is unavailable
KNOWN_MODELS = {
    "samsung": {
        "refrigerator": [
            "RT30C3732S8/NL",
            "RT40H30U3THL",
            "RT40H30U2PHL",
            "RT28C3452S8",
            "RT34C4522S8",
            "RT42CB66228",
        ]
    }
}

@app.route("/api/products/models")
def get_models():
    brand = (request.args.get("brand") or "").strip().lower()
    category = (request.args.get("category") or "").strip().lower()

    models = []

    # ── Try MongoDB first ──────────────────────────────────────
    try:
        query = {}
        if brand:
            query["brand"] = {"$regex": f"^{re.escape(brand)}$", "$options": "i"}
        if category:
            query["category"] = {"$regex": re.escape(category), "$options": "i"}

        # Pull distinct model values from price_history
        raw = price_history_collection.distinct("model", query)
        models = [m for m in raw if m]  # filter None / empty
    except Exception as e:
        print("DB unavailable for /api/products/models:", e)

    # ── Fallback to static list when DB empty/unreachable ─────
    if not models:
        fallback = KNOWN_MODELS.get(brand, {}).get(category, [])
        if not fallback and brand == "samsung":
            # Return all Samsung models regardless of category
            for cat_models in KNOWN_MODELS["samsung"].values():
                fallback.extend(cat_models)
        models = fallback

    # Deduplicate and sort
    models = sorted(set(models))
    return jsonify(models)


# ============================================================
# COMPARE STORED PRICES
# ============================================================

@app.route("/api/compare/<product_name>")
def compare_prices(product_name):

    try:
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
    except Exception as e:
        print("Database error in compare_prices:", e)
        return jsonify({"product_name": product_name, "prices": {}}), 200

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
            "model": model,
            "platform": result["platform"],
            "price": result["price"],
            "availability": result.get("availability", "Available"),
            "date": datetime.now()
        }

        # Save to MongoDB
        price_history_collection.insert_one(history_record)
        print("Live price saved:", result["platform"], result["price"], f"({result.get('availability')})")

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

    # -------------------------------------------------------
    # Concurrent execution of scrapers using threads
    # -------------------------------------------------------
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_to_platform = {
            executor.submit(
                get_amazon_price,
                search_query,
                brand=brand,
                capacity=capacity,
                model=model
            ): "Amazon",
            executor.submit(
                get_flipkart_price,
                search_query,
                brand=brand,
                capacity=capacity,
                model=model
            ): "Flipkart",
            executor.submit(
                get_vijay_sales_price,
                search_query,
                brand=brand,
                capacity=capacity,
                model=model
            ): "Vijay Sales",
        }

        # Execute each scraper with an individual timeout
        PER_FUTURE_TIMEOUT = 15  # seconds
        for future, platform in future_to_platform.items():
            try:
                result = future.result(timeout=PER_FUTURE_TIMEOUT)
                result["availability"] = result.get("availability", "Available")
                results.append(result)
            except concurrent.futures.TimeoutError:
                print(f"{platform} timed out after {PER_FUTURE_TIMEOUT} seconds")
                results.append({
                    "platform": platform,
                    "product_name": None,
                    "price": None,
                    "availability": "Price unavailable",
                    "product_url": None
                })
            except Exception as e:
                print(f"{platform} error:", e)
                results.append({
                    "platform": platform,
                    "product_name": None,
                    "price": None,
                    "availability": "Price unavailable",
                    "product_url": None
                })
    # ========================================================
    # DEMO / FALLBACK LOGIC
    # If live scraping fails or yields unavailable data, populate with verified
    # fallback values clearly tagged as "demo_fallback"
    # ========================================================
    FALLBACK_PRODUCTS = {
        "RT30C3732S8/NL": {
            "model": "RT30C3732S8/NL",
            "title": "Samsung 256 L Frost Free Double Door Refrigerator (RT30C3732S8/NL)",
            "platforms": {
                "Amazon": {
                    "price": 31750,
                    "availability": "Available",
                    "product_url": "https://www.amazon.in/s?k=Samsung+RT30C3732S8"
                },
                "Flipkart": {
                    "price": 31800,
                    "availability": "Available",
                    "product_url": "https://www.flipkart.com/search?q=Samsung+RT30C3732S8"
                },
                "Vijay Sales": {
                    "price": 31800,
                    "availability": "Available",
                    "product_url": "https://www.vijaysales.com/c/refrigerators/brand/buy-samsung-refrigerators"
                }
            }
        }
    }

    # Match fallback candidate by normalized model
    norm_model = (model or "").upper().replace(" ", "")
    fallback_entry = None
    for k, v in FALLBACK_PRODUCTS.items():
        if k.upper().replace(" ", "").split("/")[0] in norm_model or norm_model in k.upper().replace(" ", ""):
            fallback_entry = v
            break

    # If all three or some returned unavailable, check fallback
    final_results = []
    has_live = False
    for r in results:
        plat = r.get("platform")
        if r.get("price") is not None and r.get("price") > 0:
            r["data_source"] = "live"
            has_live = True
            final_results.append(r)
        elif fallback_entry and plat in fallback_entry["platforms"]:
            fb = fallback_entry["platforms"][plat]
            final_results.append({
                "platform": plat,
                "product_name": fallback_entry["title"],
                "price": fb["price"],
                "availability": fb["availability"],
                "product_url": fb.get("product_url"),
                "data_source": "demo_fallback"
            })
        else:
            r["data_source"] = "live"
            final_results.append(r)

    results = final_results

    # ========================================================
    # SAVE SUCCESSFUL LIVE PRICES
    # ========================================================

    for result in results:
        if result.get("data_source") == "live":
            try:
                save_live_price(
                    result,
                    brand,
                    category,
                    model
                )
            except Exception as e:
                print("Could not save price history:", e)

    # ========================================================
    # FIND AVAILABLE PRODUCTS
    # ========================================================

    available_results = []

    for result in results:

        price = result.get("price")

        availability = (result.get("availability") or "").lower()

        if (
            price is not None
            and "out of stock" not in availability
            and "notify me" not in availability
            and "unavailable" not in availability
        ):

            available_results.append(
                result
            )

    priced_results = [r for r in results if r.get("price") is not None]


    # ========================================================
    # RECOMMENDATION
    # ========================================================

    if available_results:

        recommended = min(
            available_results,
            key=lambda item: item["price"]
        )

        # Calculate savings if there are multiple available options
        savings = 0
        if len(available_results) > 1:
            max_price = max(r["price"] for r in available_results)
            savings = max_price - recommended["price"]
        elif len(priced_results) > 1:
            max_price = max(r["price"] for r in priced_results)
            savings = max_price - recommended["price"]

        recommendation = {
            "status": "available",
            "platform": recommended["platform"],
            "price": recommended["price"],
            "current_price": recommended["price"],
            "product_name": recommended["product_name"],
            "availability": recommended.get("availability", "Available"),
            "reason": f"Lowest available price — Save ₹{savings:,}" if savings > 0 else "Lowest available price",
            "savings": savings,
            "data_source": recommended.get("data_source", "live")
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

    elif priced_results:

        recommendation = {
            "status": "out_of_stock",
            "platform": None,
            "price": None,
            "current_price": None,
            "predicted_price": None,
            "product_name": None,
            "availability": "Out Of Stock",
            "reason": "Prices found, but no currently available purchase option."
        }

        if predict_price is not None:
            try:
                pred = predict_price(
                    platform=priced_results[0]["platform"],
                    brand=brand,
                    category=category,
                    capacity=capacity,
                    model=model
                )
                if pred.get("status") == "success":
                    recommendation["predicted_price"] = pred["predicted_price"]
                    recommendation["model_used"] = pred.get("model_used")
            except Exception:
                pass

    else:

        recommendation = {
            "status": "none",
            "platform": None,
            "price": None,
            "current_price": None,
            "predicted_price": None,
            "product_name": None,
            "availability": "Price unavailable",
            "reason": "No price information found"
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