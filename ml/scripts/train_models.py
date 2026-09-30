import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from preprocess import preprocess_data

def train_and_evaluate_models(processed_path="data/processed/processed_price_features.csv"):
    """
    Trains and compares Linear Regression, Decision Tree, and Random Forest models.
    Evaluates MAE, MSE, RMSE, and R2 on holdout test set.
    Saves the best performing model pipeline using joblib.
    """
    if not os.path.exists(processed_path):
        print("Processed features not found, running preprocessing first...")
        preprocess_data()

    df = pd.read_csv(processed_path)
    print(f"Training dataset size: {len(df)} rows")

    # Feature definitions
    categorical_features = ["platform", "brand", "category", "capacity", "model"]
    numerical_features = ["day", "month", "year", "day_of_week"]

    # Target
    target = "price"

    X = df[categorical_features + numerical_features]
    y = df[target]

    # Holdout train/test split
    # For small datasets, test_size=0.25 gives adequate test samples (3 out of 12)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42
    )

    print(f"Training set: {len(X_train)} samples | Test set: {len(X_test)} samples\n")

    # Feature Preprocessor Pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                categorical_features
            ),
            (
                "num",
                "passthrough",
                numerical_features
            )
        ]
    )

    # Candidate Models
    models = {
        "Linear Regression": LinearRegression(),
        "Decision Tree Regression": DecisionTreeRegressor(random_state=42),
        "Random Forest Regression": RandomForestRegressor(n_estimators=50, random_state=42)
    }

    results = []
    trained_pipelines = {}

    print("==========================================================================")
    print("                     MODEL TRAINING & EVALUATION                          ")
    print("==========================================================================")

    for name, model in models.items():
        # Build end-to-end pipeline
        pipeline = Pipeline(steps=[
            ("preprocessor", preprocessor),
            ("regressor", model)
        ])

        # Train
        pipeline.fit(X_train, y_train)
        trained_pipelines[name] = pipeline

        # Predict on test set
        y_pred = pipeline.predict(X_test)

        # Compute metrics
        mae = mean_absolute_error(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        # R2 score (note: on very small test sets, R2 may be negative or low; calculate safely)
        try:
            r2 = r2_score(y_test, y_pred)
        except Exception:
            r2 = 0.0

        results.append({
            "model_name": name,
            "mae": round(float(mae), 2),
            "mse": round(float(mse), 2),
            "rmse": round(float(rmse), 2),
            "r2": round(float(r2), 4)
        })

    # Print comparison table
    results_df = pd.DataFrame(results)
    print(results_df.to_string(index=False))
    print("==========================================================================\n")

    # Select best model based on lowest MAE (or RMSE)
    best_model_info = min(results, key=lambda x: x["mae"])
    best_model_name = best_model_info["model_name"]
    best_pipeline = trained_pipelines[best_model_name]

    print(f"Selected Best Model: {best_model_name}")
    print(f"Metrics -> MAE: Rs. {best_model_info['mae']:,} | RMSE: Rs. {best_model_info['rmse']:,} | R2: {best_model_info['r2']}\n")

    # Save best model to ml/models/
    os.makedirs("ml/models", exist_ok=True)
    model_save_path = "ml/models/price_prediction_model.joblib"
    joblib.dump(best_pipeline, model_save_path)
    print(f"Model saved to: {model_save_path}")

    # Also save metrics report
    metrics_path = "ml/models/model_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump({
            "comparison": results,
            "selected_model": best_model_info,
            "features": categorical_features + numerical_features
        }, f, indent=4)
    print(f"Metrics saved to: {metrics_path}")

    return best_model_name, best_pipeline, results

if __name__ == "__main__":
    train_and_evaluate_models()
