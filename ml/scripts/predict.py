import os
import json
import joblib
import pandas as pd
from datetime import datetime

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "price_prediction_model.joblib")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "model_metrics.json")
PROCESSED_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "processed_price_features.csv")

_cached_model = None
_cached_metrics = None

def get_model():
    global _cached_model, _cached_metrics
    if _cached_model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}. Run train_models.py first.")
        _cached_model = joblib.load(MODEL_PATH)
    if _cached_metrics is None and os.path.exists(METRICS_PATH):
        with open(METRICS_PATH, "r", encoding="utf-8") as f:
            _cached_metrics = json.load(f)
    return _cached_model, _cached_metrics

def predict_price(
    platform="Amazon",
    brand="Samsung",
    category="Refrigerator",
    capacity="256 L",
    model=None,
    target_date=None
):
    """
    Predicts product price from historical features using the trained regression model.
    Does NOT substitute or use live scraped price.
    Returns predicted price, model name, and evaluation metrics.
    """
    # Check if we have historical data for this category/brand
    if os.path.exists(PROCESSED_DATA_PATH):
        try:
            df_hist = pd.read_csv(PROCESSED_DATA_PATH)
            # If the category or brand is completely unknown to our historical dataset
            matching_brand = df_hist[df_hist["brand"].str.lower() == str(brand).lower()]
            if len(matching_brand) == 0:
                return {
                    "status": "insufficient_data",
                    "message": f"Insufficient historical data for brand '{brand}'. Prediction unavailable.",
                    "predicted_price": None,
                    "model_used": None
                }
        except Exception:
            pass

    pipeline, metrics = get_model()
    model_name = metrics.get("selected_model", {}).get("model_name", "Random Forest Regression") if metrics else "Regression Model"

    if target_date is None:
        target_date = datetime.now()
    elif isinstance(target_date, str):
        try:
            target_date = pd.to_datetime(target_date)
        except Exception:
            target_date = datetime.now()

    # Normalize capacity and model string
    clean_capacity = capacity if capacity else "256 L"
    clean_model = model if model else "Standard"

    features_df = pd.DataFrame([{
        "platform": platform,
        "brand": brand,
        "category": category,
        "capacity": clean_capacity,
        "model": clean_model,
        "day": target_date.day,
        "month": target_date.month,
        "year": target_date.year,
        "day_of_week": target_date.weekday()
    }])

    predicted_val = pipeline.predict(features_df)[0]
    predicted_price = int(round(float(predicted_val)))

    return {
        "status": "success",
        "predicted_price": predicted_price,
        "model_used": model_name,
        "metrics": metrics.get("selected_model", {}) if metrics else {},
        "target_date": target_date.strftime("%Y-%m-%d"),
        "features": {
            "platform": platform,
            "brand": brand,
            "category": category,
            "capacity": clean_capacity,
            "model": clean_model
        }
    }

if __name__ == "__main__":
    result = predict_price(
        platform="Amazon",
        brand="Samsung",
        category="Refrigerator",
        capacity="256 L",
        model="RT40H30U3THL"
    )
    print("Test Prediction Result:")
    print(json.dumps(result, indent=2))
