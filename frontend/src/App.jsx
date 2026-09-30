import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

const API_BASE = "http://127.0.0.1:5000";

function App() {
  const [query, setQuery] = useState("Samsung 256L refrigerator");
  const [model, setModel] = useState("RT40H30U3THL");

  const [results, setResults] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyPlatform, setHistoryPlatform] = useState("All");
  const [mlPrediction, setMlPrediction] = useState(null);

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch price history for the exact model
  const fetchPriceHistory = async (targetModel, platform = "All") => {
    if (!targetModel) return;
    setHistoryLoading(true);
    try {
      let url = `${API_BASE}/api/price-history?model=${encodeURIComponent(targetModel)}`;
      if (platform && platform !== "All") {
        url += `&platform=${encodeURIComponent(platform)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn("Could not load price history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch ML Prediction
  const fetchPrediction = async (targetModel) => {
    try {
      const url = `${API_BASE}/api/predict-price?brand=Samsung&category=Refrigerator&capacity=256%20L&model=${encodeURIComponent(targetModel || "")}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          setMlPrediction(data);
        }
      }
    } catch (err) {
      console.warn("Could not load ML prediction:", err);
    }
  };

  // Load initial history & ML prediction on mount
  useEffect(() => {
    fetchPriceHistory("RT40H30U3THL", "All");
    fetchPrediction("RT40H30U3THL");
  }, []);

  const comparePrices = async () => {
    setLoading(true);
    setError("");
    setResults([]);
    setRecommendation(null);

    try {
      const url =
        `${API_BASE}/api/live-compare` +
        `?query=${encodeURIComponent(query)}` +
        `&model=${encodeURIComponent(model)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Unable to get price data from server.");
      }

      const data = await response.json();
      setResults(data.results || []);
      setRecommendation(data.recommendation || null);

      // Refresh price history & ML prediction after live scrape
      await fetchPriceHistory(model, historyPlatform);
      await fetchPrediction(model);
    } catch (err) {
      console.error(err);
      setError(
        "Could not connect to the backend. Make sure Flask is running on port 5000."
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePlatformChange = (p) => {
    setHistoryPlatform(p);
    fetchPriceHistory(model, p);
  };

  // Filter history data if filtered client-side
  const filteredHistory = historyPlatform === "All"
    ? historyData
    : historyData.filter((item) => item.platform === historyPlatform);

  return (
    <div className="app">
      <header className="header">
        <h1>Multi-Platform Product Price Comparison</h1>
        <p className="subtitle">
          Intelligent real-time price aggregator and machine learning purchase recommendation system.
        </p>
      </header>

      {/* SEARCH BOX */}
      <div className="search-box">
        <div className="input-group">
          <label>Product Query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Samsung 256L refrigerator"
          />
        </div>

        <div className="input-group">
          <label>Exact Model Number</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. RT40H30U3THL"
          />
        </div>

        <button
          className="btn-compare"
          onClick={comparePrices}
          disabled={loading}
        >
          {loading ? "Checking Prices..." : "Compare Prices"}
        </button>
      </div>

      {/* ERROR NOTICE */}
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {/* LOADING STATE */}
      {loading && (
        <div className="loading-card">
          <div className="spinner"></div>
          <p>Scraping live marketplace prices from Amazon, Flipkart, and Vijay Sales...</p>
          <span className="loading-note">Verifying exact model match to prevent incorrect product comparisons.</span>
        </div>
      )}

      {/* RECOMMENDATION SECTION */}
      {recommendation && (
        <section className="recommendation">
          <div className="rec-header">
            <h2>Recommended Option</h2>
            <span className="badge badge-success">Top Choice</span>
          </div>

          <div className="rec-grid">
            <div className="rec-item">
              <span className="rec-label">Target Model</span>
              <span className="rec-value">{model || "Specified Model"}</span>
            </div>

            <div className="rec-item">
              <span className="rec-label">Recommended Platform</span>
              <span className="rec-value platform-name">
                {recommendation.platform || "None"}
              </span>
            </div>

            <div className="rec-item">
              <span className="rec-label">Live Price</span>
              <span className="rec-value price-highlight">
                {recommendation.price !== null
                  ? `₹${recommendation.price.toLocaleString("en-IN")}`
                  : "Price unavailable"}
              </span>
            </div>

            <div className="rec-item">
              <span className="rec-label">Decision Reason</span>
              <span className="rec-value">{recommendation.reason}</span>
            </div>

            {recommendation.predicted_price && (
              <>
                <div className="rec-item">
                  <span className="rec-label">ML Predicted Price</span>
                  <span className="rec-value">
                    ₹{recommendation.predicted_price.toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="rec-item">
                  <span className="rec-label">Price vs Predicted</span>
                  <span className="rec-value">
                    {recommendation.price_difference !== undefined ? (
                      recommendation.price_difference > 0
                        ? `+₹${recommendation.price_difference.toLocaleString("en-IN")} above predicted`
                        : `${recommendation.price_difference < 0 ? `-₹${Math.abs(recommendation.price_difference).toLocaleString("en-IN")} below predicted` : "Matches predicted"}`
                    ) : "N/A"}
                  </span>
                </div>
              </>
            )}
          </div>

          {recommendation.product_name && (
            <p className="rec-product-name">
              <strong>Scraped Product:</strong> {recommendation.product_name}
            </p>
          )}
        </section>
      )}

      {/* LIVE MARKETPLACE RESULTS */}
      {results.length > 0 && (
        <section className="results-section">
          <h2>Live Marketplace Prices</h2>
          <div className="cards-grid">
            {results.map((item, index) => {
              const isAvailable =
                item.price !== null &&
                item.availability &&
                item.availability.toLowerCase() !== "out of stock" &&
                item.availability.toLowerCase() !== "price unavailable";

              return (
                <div
                  className={`price-card ${isAvailable ? "available" : "unavailable"}`}
                  key={index}
                >
                  <div className="card-top">
                    <h3>{item.platform}</h3>
                    <span
                      className={`status-pill ${
                        isAvailable ? "pill-available" : "pill-unavailable"
                      }`}
                    >
                      {item.availability || "Price unavailable"}
                    </span>
                  </div>

                  <p className="product-title">
                    {item.product_name || "Product unavailable / model not found"}
                  </p>

                  <div className="price-display">
                    {item.price !== null ? (
                      <span className="price-amount">
                        ₹{item.price.toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span className="price-na">Price unavailable</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ML PREDICTION SUMMARY */}
      {mlPrediction && (
        <section className="ml-section">
          <h2>Machine Learning Valuation</h2>
          <div className="ml-card">
            <div className="ml-info">
              <p>
                <strong>Regression Algorithm:</strong> {mlPrediction.model_used}
              </p>
              <p>
                <strong>Estimated Fair Price:</strong>{" "}
                <span className="ml-price">
                  ₹{mlPrediction.predicted_price.toLocaleString("en-IN")}
                </span>
              </p>
              {mlPrediction.metrics && (
                <p className="ml-metrics">
                  <span>Model MAE: Rs. {mlPrediction.metrics.mae}</span>
                  <span> | RMSE: Rs. {mlPrediction.metrics.rmse}</span>
                </p>
              )}
            </div>
            <p className="ml-note">
              * The predicted price is independently estimated using trained regression models from historical pricing data. Current live scraped prices are never substituted or used as predictions.
            </p>
          </div>
        </section>
      )}

      {/* REAL PRICE HISTORY GRAPH */}
      <section className="history-section">
        <div className="history-header">
          <h2>Historical Price Trend</h2>
          <div className="platform-filter">
            <label>Filter Platform: </label>
            <select
              value={historyPlatform}
              onChange={(e) => handlePlatformChange(e.target.value)}
            >
              <option value="All">All Platforms</option>
              <option value="Amazon">Amazon</option>
              <option value="Flipkart">Flipkart</option>
              <option value="Vijay Sales">Vijay Sales</option>
            </select>
          </div>
        </div>

        <p className="history-subtitle">
          Showing real historical price records from MongoDB for model:{" "}
          <strong>{model || "All"}</strong>
        </p>

        {historyLoading ? (
          <div className="history-placeholder">Loading history data...</div>
        ) : filteredHistory.length <= 1 ? (
          <div className="history-placeholder">
            <p className="no-trend-notice">
              Not enough historical data for a trend.
            </p>
            {filteredHistory.length === 1 && (
              <div className="single-snapshot">
                <p>
                  <strong>Recorded Snapshot:</strong> Platform:{" "}
                  {filteredHistory[0].platform} | Price: ₹
                  {filteredHistory[0].price?.toLocaleString("en-IN")} | Date:{" "}
                  {filteredHistory[0].date}
                </p>
                <span className="hint-text">
                  (At least 2 historical snapshots are required to plot a trend chart. Future price checks will build the timeline.)
                </span>
              </div>
            )}
            {filteredHistory.length === 0 && (
              <p className="hint-text">
                No historical records found for this exact model yet. Perform live comparisons to create historical snapshots.
              </p>
            )}
          </div>
        ) : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={filteredHistory.map((d) => ({
                  ...d,
                  displayDate: d.date ? d.date.split(" ")[0] : "Recent",
                  priceNumber: Number(d.price)
                }))}
                margin={{ top: 15, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="displayDate" stroke="#555" />
                <YAxis
                  stroke="#555"
                  domain={["auto", "auto"]}
                  tickFormatter={(val) => `₹${val.toLocaleString("en-IN")}`}
                />
                <Tooltip
                  formatter={(val, name, item) => [
                    `₹${val.toLocaleString("en-IN")}`,
                    `${item.payload.platform || "Price"}`
                  ]}
                  labelFormatter={(lbl, payload) =>
                    payload?.[0]?.payload?.date || lbl
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="priceNumber"
                  name="Recorded Price"
                  stroke="#2563eb"
                  strokeWidth={2}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <footer className="footer">
        <p>College Project: Multi-Platform Product Price Comparison and Purchase Recommendation System</p>
        <p>Built with React, Flask, MongoDB Atlas, Scikit-learn, and Playwright.</p>
      </footer>
    </div>
  );
}

export default App;