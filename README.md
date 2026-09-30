# Multi-Platform Product Price Comparison and Purchase Recommendation System

A full-stack, machine-learning-assisted product price comparison and purchase recommendation system.

## Project Architecture & Workflow

```
User selects / searches product & exact model
                  ↓
          React + Vite Frontend
                  ↓
            Flask Backend API
                  ↓
    Live Marketplace Scrapers (Playwright)
  [ Amazon | Flipkart | Vijay Sales ]
                  ↓
      MongoDB Atlas Database
      (Historical Price Snapshots)
                  ↓
Data Preprocessing & Feature Engineering
                  ↓
Machine Learning Regression Models
(Linear Regression, Decision Tree, Random Forest)
                  ↓
Live Price Comparison & Purchase Recommendation
                  ↓
      React Interactive Dashboard
  (Live Cards + Recommendation + Recharts Trend)
```

## Technologies

- **Backend:** Python, Flask, Flask-CORS, PyMongo, Playwright
- **Database:** MongoDB Atlas (`price_comparison_db`)
- **Data & ML:** Pandas, NumPy, Scikit-learn, Joblib
- **Frontend:** React 19, Vite, Recharts, CSS3
- **Version Control:** Git, GitHub

## Features

1. **Exact-Model Matching:** Strict model verification (e.g. `RT40H30U3THL`) ensures fair, 1-to-1 product comparisons rather than mixing different capacities or specifications.
2. **Multi-Platform Scrapers:** Live automated extraction from Amazon, Flipkart, and Vijay Sales using Playwright Chromium.
3. **Graceful Degradation:** If any marketplace is blocked, out of stock, or unavailable, the system displays "Price unavailable" without crashing the API or other marketplace results.
4. **Historical Snapshot Storage:** Every successful live scrape is persisted to MongoDB Atlas (with duplicate prevention for repeated same-day requests).
5. **Exact-Model Price History API:** `/api/price-history?model=...&platform=...` returns verified historical snapshots.
6. **Recharts Historical Trend Visualization:** Shows date, price, and platform trends. If 1 or fewer data points exist, clearly explains: *"Not enough historical data for a trend."*
7. **Machine Learning Valuation:** Compares Linear Regression, Decision Tree, and Random Forest Regression on historical features (`platform`, `brand`, `category`, `capacity`, `model`, `day`, `month`, `year`, `day_of_week`), evaluating with MAE, MSE, RMSE, and R².
8. **Purchase Recommendation:** Automatically selects the lowest available live price, enriched with comparison against the ML predicted price.

## API Endpoints

- `GET /` — API health status
- `GET /api/test` — Backend connectivity check
- `GET /api/products` — List stored catalog products
- `GET /api/price-history?model=RT40H30U3THL&platform=Amazon` — Retrieve historical prices by exact model and platform
- `GET /api/live-compare?query=Samsung%20256L%20refrigerator&model=RT40H30U3THL` — Trigger live multi-platform scrapers & generate recommendation
- `GET /api/predict-price?platform=Amazon&brand=Samsung&capacity=256%20L&model=RT40H30U3THL` — ML regression price prediction

## Project Setup & Execution

### 1. Environment & Dependencies

Activate the pre-configured virtual environment:
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. Run Data Preprocessing & Model Training

```powershell
# Preprocess raw data and extract features
.\.venv\Scripts\python.exe ml\scripts\preprocess.py

# Train Linear Regression, Decision Tree, and Random Forest
.\.venv\Scripts\python.exe ml\scripts\train_models.py
```

### 3. Start Backend Server

```powershell
.\.venv\Scripts\python.exe backend\app.py
```
Backend runs on: `http://127.0.0.1:5000`

### 4. Start React Frontend

```powershell
cd frontend
npm run dev
```
Frontend runs on: `http://localhost:5173`