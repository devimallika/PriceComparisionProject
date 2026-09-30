import os
import re
import pandas as pd
import numpy as np

def preprocess_data(
    raw_path="data/raw/product_price_data.csv",
    cleaned_path="data/cleaned/cleaned_price_data.csv",
    processed_path="data/processed/processed_price_features.csv"
):
    """
    Cleans raw price dataset and extracts ML features.
    Handles missing values, duplicates, date conversion, and categorical features.
    """
    os.makedirs(os.path.dirname(cleaned_path), exist_ok=True)
    os.makedirs(os.path.dirname(processed_path), exist_ok=True)

    if not os.path.exists(raw_path):
        raise FileNotFoundError(f"Raw data file not found at: {raw_path}")

    # 1. Load raw dataset
    df = pd.read_csv(raw_path)
    print(f"Loaded raw dataset with {len(df)} records.")

    # 2. Duplicate handling
    initial_len = len(df)
    df = df.drop_duplicates()
    if len(df) < initial_len:
        print(f"Removed {initial_len - len(df)} duplicate records.")

    # 3. Missing-value handling
    # Drop rows without critical fields: price or date
    df = df.dropna(subset=["price", "date"])

    # Fill optional missing fields with standard defaults
    if "brand" not in df.columns:
        df["brand"] = "Samsung"
    else:
        df["brand"] = df["brand"].fillna("Samsung")

    if "category" not in df.columns:
        df["category"] = "Refrigerator"
    else:
        df["category"] = df["category"].fillna("Refrigerator")

    if "platform" not in df.columns:
        df["platform"] = "Unknown"
    else:
        df["platform"] = df["platform"].fillna("Unknown")

    if "availability" not in df.columns:
        df["availability"] = "Available"
    else:
        df["availability"] = df["availability"].fillna("Available")

    # 4. Clean price
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df = df.dropna(subset=["price"])
    df["price"] = df["price"].astype(float)

    # 5. Extract capacity and model from product_name if missing
    def extract_capacity(name):
        match = re.search(r'(\d+)\s*L', str(name), re.IGNORECASE)
        return f"{match.group(1)} L" if match else "253 L"

    def extract_model(name):
        # Look for model codes like RT40H30U3THL or extract base model
        match = re.search(r'(RT[0-9A-Z]+)', str(name), re.IGNORECASE)
        if match:
            return match.group(1).upper()
        # Fallback to product name identifier
        if "253" in str(name):
            return "RT28-253L"
        return "Standard"

    if "capacity" not in df.columns:
        df["capacity"] = df["product_name"].apply(extract_capacity)

    if "model" not in df.columns:
        df["model"] = df["product_name"].apply(extract_model)

    # Clearly distinguish sample/demo data from live collected data
    if "data_source" not in df.columns:
        df["data_source"] = "sample_historical"

    # Save cleaned data
    df.to_csv(cleaned_path, index=False)
    print(f"Saved cleaned dataset to: {cleaned_path}")

    # 6. Date conversion and Feature Engineering
    df["date"] = pd.to_datetime(df["date"])
    df["day"] = df["date"].dt.day
    df["month"] = df["date"].dt.month
    df["year"] = df["date"].dt.year
    df["day_of_week"] = df["date"].dt.dayofweek

    # Save processed features
    df.to_csv(processed_path, index=False)
    print(f"Saved processed features to: {processed_path}")

    return df

if __name__ == "__main__":
    df = preprocess_data()
    print("\nPreprocessed Data Sample:")
    print(df.head())
    print("\nColumns:", df.columns.tolist())
