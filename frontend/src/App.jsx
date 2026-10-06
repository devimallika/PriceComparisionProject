import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const API_BASE = "http://127.0.0.1:5000";

// ── Helpers ────────────────────────────────────────────────
const fmtINR = (n) =>
  n != null ? "₹" + Number(n).toLocaleString("en-IN") : null;

// ── Availability Badge ────────────────────────────────────
function AvailBadge({ avail, productFound }) {
  if (!productFound)
    return <span className="badge badge-unavail">Not Found</span>;
  const a = (avail || "").toLowerCase();
  if (a === "available" || a === "in stock")
    return <span className="badge badge-avail">✓ Available</span>;
  if (a === "notify me")
    return <span className="badge badge-notify">🔔 Notify Me</span>;
  if (a === "out of stock")
    return <span className="badge badge-oos">✗ Out of Stock</span>;
  return <span className="badge badge-unavail">{avail || "Unavailable"}</span>;
}

// ── Platform Icon ─────────────────────────────────────────
function PlatformIcon({ name }) {
  const styles = {
    Amazon:       { bg: "#FF9900", text: "AMZ" },
    Flipkart:     { bg: "#2874F0", text: "FK" },
    "Vijay Sales":{ bg: "#E31E26", text: "VS" },
  };
  const s = styles[name] || { bg: "#334155", text: name ? name[0] : "?" };
  return (
    <span
      className="plat-icon"
      style={{ background: s.bg }}
      aria-label={name}
    >
      {s.text}
    </span>
  );
}

// ── Chart Custom Tooltip ──────────────────────────────────
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="ct-date">{d.date || d.displayDate}</div>
      <div className="ct-price">{fmtINR(d.priceNumber)}</div>
      <div className="ct-platform">{d.platform}</div>
    </div>
  );
}

// ── BRANDS (static – extend as needed) ───────────────────
const BRANDS = ["Samsung", "LG", "Whirlpool", "Godrej", "Haier", "Bosch"];
const CATEGORIES = ["Refrigerator", "Washing Machine", "Air Conditioner", "Microwave"];

// ── Main App ──────────────────────────────────────────────
export default function App() {
  // ── Search form state ──────────────────────────────────
  const [brand, setBrand]       = useState("Samsung");
  const [category, setCategory] = useState("Refrigerator");
  const [capacity, setCapacity] = useState("256 L");
  const [selectedModel, setSelectedModel] = useState("");

  // ── Model dropdown state ────────────────────────────────
  const [models, setModels]           = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // ── Results state ──────────────────────────────────────
  const [results, setResults]             = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [historyData, setHistoryData]     = useState([]);
  const [historyPlatform, setHistoryPlatform] = useState("All");
  const [mlPrediction, setMlPrediction]   = useState(null);

  // ── UI state ───────────────────────────────────────────
  const [loading, setLoading]           = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError]               = useState("");
  const [hasSearched, setHasSearched]   = useState(false);

  // ── Load models when brand/category changes ────────────
  const loadModels = useCallback(async (b, cat) => {
    setModelsLoading(true);
    setModels([]);
    setSelectedModel("");
    try {
      const url =
        `${API_BASE}/api/products/models` +
        `?brand=${encodeURIComponent(b)}` +
        `&category=${encodeURIComponent(cat)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setModels(list);
        if (list.length > 0) setSelectedModel(list[0]);
      }
    } catch (e) {
      console.warn("Could not load models:", e);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Load models on mount and when brand/category changes
  useEffect(() => {
    loadModels(brand, category);
  }, [brand, category, loadModels]);

  // ── Fetch price history ───────────────────────────────
  const fetchPriceHistory = async (model, plat = "All") => {
    if (!model) return;
    setHistoryLoading(true);
    try {
      let url = `${API_BASE}/api/price-history?model=${encodeURIComponent(model)}`;
      if (plat && plat !== "All")
        url += `&platform=${encodeURIComponent(plat)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("History fetch failed:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Fetch ML prediction ───────────────────────────────
  const fetchPrediction = async (model) => {
    try {
      const url =
        `${API_BASE}/api/predict-price` +
        `?brand=${encodeURIComponent(brand)}` +
        `&category=${encodeURIComponent(category)}` +
        `&capacity=${encodeURIComponent(capacity)}` +
        `&model=${encodeURIComponent(model || "")}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMlPrediction(
          data.status === "success"
            ? data
            : { status: "insufficient_data", message: data.message }
        );
      }
    } catch (e) {
      console.warn("Prediction fetch failed:", e);
    }
  };

  // Load history on mount for default model
  useEffect(() => {
    if (selectedModel) {
      fetchPriceHistory(selectedModel, "All");
      fetchPrediction(selectedModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  // ── Compare ────────────────────────────────────────────
  const compare = async () => {
    if (!selectedModel) {
      setError("Please select a model from the dropdown before comparing.");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);
    setRecommendation(null);
    setHasSearched(true);

    try {
      const searchQuery = `${brand} ${capacity} ${category.toLowerCase()}`;
      const url =
        `${API_BASE}/api/live-compare` +
        `?query=${encodeURIComponent(searchQuery)}` +
        `&model=${encodeURIComponent(selectedModel)}` +
        `&brand=${encodeURIComponent(brand)}` +
        `&capacity=${encodeURIComponent(capacity)}` +
        `&category=${encodeURIComponent(category)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Server returned " + res.status);
      const data = await res.json();
      setResults(data.results || []);
      setRecommendation(data.recommendation || null);
      await fetchPriceHistory(selectedModel, historyPlatform);
      await fetchPrediction(selectedModel);
    } catch (e) {
      console.error(e);
      setError(
        "Could not connect to the backend. Please make sure Flask is running on port 5000."
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePlatformFilter = (p) => {
    setHistoryPlatform(p);
    if (selectedModel) fetchPriceHistory(selectedModel, p);
  };

  const chartData = historyData.map((d) => ({
    ...d,
    displayDate: d.date ? d.date.slice(0, 10) : "—",
    priceNumber: Number(d.price),
  }));

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="ps-root">

      {/* ── HEADER ── */}
      <header className="ps-header">
        <div className="header-inner">
          <div className="logo-block">
            <span className="logo-icon" aria-hidden="true">₹</span>
            <span className="logo-name">PriceScope</span>
          </div>
          <nav>
            <span className="nav-chip">Data Mining &amp; ML Project</span>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="ps-hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">Real-time · Multi-platform · ML-powered</p>
          <h1 className="hero-heading">
            Compare Prices Across<br />
            Every Major Marketplace
          </h1>
          <p className="hero-sub">
            Live product prices from Amazon, Flipkart, and Vijay Sales.
            Exact model matching guaranteed — no mixed results, no fabricated prices.
          </p>
        </div>
      </section>

      {/* ── MAIN SHELL ── */}
      <div className="ps-shell">

        {/* ── SEARCH CARD ── */}
        <div className="search-card">
          <div className="sc-header">
            <span className="sc-title">Search &amp; Compare</span>
            <span className="sc-sub">Select the exact model to guarantee precise matching</span>
          </div>

          <div className="sc-fields">
            {/* Row 1: Brand + Category + Capacity */}
            <div className="sc-row">
              <div className="field-group">
                <label htmlFor="ps-brand">Brand</label>
                <select
                  id="ps-brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                >
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="ps-category">Category</label>
                <select
                  id="ps-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="ps-capacity">Capacity / Spec</label>
                <input
                  id="ps-capacity"
                  type="text"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 256 L"
                />
              </div>
            </div>

            {/* Row 2: Model dropdown + Compare button */}
            <div className="sc-row sc-row-model">
              <div className="field-group field-model">
                <label htmlFor="ps-model">
                  Model Number
                  <span className="field-tag">Exact match enforced</span>
                </label>
                {modelsLoading ? (
                  <div className="model-loading">
                    <span className="mini-spin" />
                    Loading models…
                  </div>
                ) : (
                  <select
                    id="ps-model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={models.length === 0}
                    className={models.length === 0 ? "select-empty" : ""}
                  >
                    {models.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      <>
                        <option value="" disabled>
                          — Select model —
                        </option>
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                )}
                {selectedModel && (
                  <span className="model-hint">
                    The backend will verify this exact model on each marketplace.
                    A different model variant will be rejected.
                  </span>
                )}
              </div>

              <div className="field-action">
                <button
                  className="btn-compare"
                  onClick={compare}
                  disabled={loading || !selectedModel}
                >
                  {loading ? (
                    <>
                      <span className="btn-spin" />
                      Scraping…
                    </>
                  ) : (
                    <>
                      <SearchIcon />
                      Compare Prices
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── ERROR ── */}
        {error && (
          <div className="alert alert-error" role="alert">
            <WarningIcon />
            {error}
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div className="loading-panel">
            <div className="loading-spinner" />
            <div>
              <h3>Fetching Live Prices</h3>
              <p>
                Playwright is visiting Amazon, Flipkart, and Vijay Sales.
                Verifying exact model <strong className="model-code">{selectedModel}</strong>.
                This takes about 30–60 seconds.
              </p>
              <div className="loading-steps">
                <div className="loading-step">
                  <span className="step-dot step-amz" />
                  Checking Amazon…
                </div>
                <div className="loading-step">
                  <span className="step-dot step-fk" />
                  Checking Flipkart…
                </div>
                <div className="loading-step">
                  <span className="step-dot step-vs" />
                  Checking Vijay Sales…
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MARKETPLACE RESULTS ── */}
        {results.length > 0 && !loading && (
          <section className="results-section">
            <div className="section-hdr">
              <div>
                <h2 className="section-title">Live Marketplace Prices</h2>
                <p className="section-desc">
                  Scraped in real time. Valid prices are shown even when Out of Stock.
                </p>
              </div>
              <div className="model-tag">
                <span className="mt-label">Model</span>
                <span className="mt-value">{selectedModel}</span>
              </div>
            </div>

            <div className="market-grid">
              {results.map((item, i) => {
                const found    = item.product_name != null;
                const hasPrice = item.price != null;
                const avail    = (item.availability || "").toLowerCase();
                const isAvailable =
                  avail === "available" || avail === "in stock";

                return (
                  <div
                    key={i}
                    className={[
                      "market-card",
                      hasPrice ? "card-priced" : "card-no-price",
                      isAvailable && hasPrice ? "card-available" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="mc-head">
                      <PlatformIcon name={item.platform} />
                      <span className="mc-platform">{item.platform}</span>
                    </div>

                    <div className="mc-body">
                      <p className="mc-product">
                        {found
                          ? item.product_name
                          : "Exact model not found on this platform"}
                      </p>
                      {found && (
                        <span className="mc-model-chip">
                          {selectedModel}
                        </span>
                      )}
                    </div>

                    <div className="mc-footer">
                      <div className="mc-price-row">
                        {hasPrice ? (
                          <span className="mc-price">{fmtINR(item.price)}</span>
                        ) : (
                          <span className="mc-price-na">Price unavailable</span>
                        )}
                        <AvailBadge
                          avail={item.availability}
                          productFound={found}
                        />
                      </div>
                      {hasPrice && !isAvailable && found && (
                        <p className="mc-note">
                          Price recorded — item not currently purchasable.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── RECOMMENDATION ── */}
        {recommendation && !loading && (
          <section className="rec-section">
            {recommendation.status === "available" ? (
              <div className="rec-card rec-good">
                <div className="rec-head">
                  <div>
                    <p className="rec-eyebrow">Purchase Recommendation</p>
                    <h2 className="rec-heading">Best Available Option</h2>
                  </div>
                  <span className="rec-badge badge-best">Lowest Live Price</span>
                </div>

                <div className="rec-stats">
                  <div className="rec-stat">
                    <span className="rs-label">Marketplace</span>
                    <span className="rs-value rs-platform">
                      {recommendation.platform}
                    </span>
                  </div>
                  <div className="rec-stat rec-stat-hl">
                    <span className="rs-label">Current Price</span>
                    <span className="rs-value rs-price">
                      {fmtINR(recommendation.price)}
                    </span>
                    <span className="rs-sub">{recommendation.reason}</span>
                  </div>
                  <div className="rec-stat">
                    <span className="rs-label">Availability</span>
                    <AvailBadge avail="Available" productFound={true} />
                  </div>
                  {recommendation.predicted_price != null && (
                    <div className="rec-stat">
                      <span className="rs-label">ML Fair Valuation</span>
                      <span className="rs-value rs-ml">
                        {fmtINR(recommendation.predicted_price)}
                      </span>
                      <span className="rs-sub">
                        {recommendation.price_difference != null &&
                          (recommendation.price_difference > 0
                            ? `+${fmtINR(recommendation.price_difference)} vs predicted`
                            : recommendation.price_difference < 0
                            ? `${fmtINR(recommendation.price_difference)} vs predicted`
                            : "Matches predicted value")}
                      </span>
                    </div>
                  )}
                </div>

                {recommendation.product_name && (
                  <div className="rec-product">
                    <span className="rp-label">Verified Product:</span>
                    <span className="rp-name">{recommendation.product_name}</span>
                  </div>
                )}
              </div>
            ) : recommendation.status === "out_of_stock" ? (
              <div className="rec-card rec-warn">
                <div className="rec-head">
                  <div>
                    <p className="rec-eyebrow rec-eyebrow-warn">Inventory Alert</p>
                    <h2 className="rec-heading rec-heading-warn">
                      No Available Purchase Option
                    </h2>
                  </div>
                  <span className="rec-badge badge-warn">All Out of Stock</span>
                </div>
                <p className="rec-warn-body">
                  Prices were found but{" "}
                  <strong>all listings are currently Out of Stock or Notify Me</strong>.
                  All discovered prices are shown in the comparison above.
                  No purchase is recommended at this time.
                </p>
                {recommendation.predicted_price != null && (
                  <div className="rec-ml-hint">
                    <strong>ML Valuation:</strong> Estimated fair price is{" "}
                    <strong>{fmtINR(recommendation.predicted_price)}</strong> based on
                    historical regression ({recommendation.model_used}).
                  </div>
                )}
              </div>
            ) : (
              <div className="rec-card rec-neutral">
                <div className="rec-head">
                  <div>
                    <p className="rec-eyebrow rec-eyebrow-neutral">Search Result</p>
                    <h2 className="rec-heading">No Pricing Data Found</h2>
                  </div>
                  <span className="rec-badge badge-neutral">Not Listed</span>
                </div>
                <p className="rec-neutral-body">
                  Model <strong>{selectedModel}</strong> was not found on any monitored
                  marketplace. Verify the model number or try again later.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── ML FORECAST ── */}
        <section className="ml-section">
          <div className="section-hdr">
            <div>
              <h2 className="section-title">Price Forecast</h2>
              <p className="section-desc">
                Machine learning regression output — trained on historical price snapshots.
                This is an <em>estimated</em> fair value, not a live marketplace price.
              </p>
            </div>
          </div>

          <div className="ml-card">
            {!mlPrediction ? (
              <p className="ml-empty">Loading forecast…</p>
            ) : mlPrediction.status === "success" ? (
              <>
                <div className="ml-grid">
                  <div className="ml-block ml-primary">
                    <span className="ml-label">Estimated Fair Market Price</span>
                    <span className="ml-value">{fmtINR(mlPrediction.predicted_price)}</span>
                    <span className="ml-sub">Independent regression output</span>
                  </div>
                  <div className="ml-block">
                    <span className="ml-label">Algorithm</span>
                    <span className="ml-value ml-blue">{mlPrediction.model_used}</span>
                    <span className="ml-sub">Scikit-learn pipeline</span>
                  </div>
                  {mlPrediction.metrics && (
                    <div className="ml-block">
                      <span className="ml-label">Evaluation Metrics (holdout set)</span>
                      <div className="ml-metrics">
                        <div className="ml-metric">
                          <span className="mm-name">MAE</span>
                          <span className="mm-val">
                            ₹{Number(mlPrediction.metrics.mae || 0).toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="ml-metric">
                          <span className="mm-name">RMSE</span>
                          <span className="mm-val">
                            ₹{Number(mlPrediction.metrics.rmse || 0).toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="ml-metric">
                          <span className="mm-name">R²</span>
                          <span className="mm-val">
                            {Number(mlPrediction.metrics.r2 || 0).toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <p className="ml-disclaimer">
                  ⚠ The ML predicted price is derived from historical feature regression
                  (brand, capacity, platform, date). It is never presented as a current
                  marketplace price and never substitutes live scraped data.
                </p>
              </>
            ) : (
              <div className="ml-insufficient">
                <WarningIcon />
                <p>
                  {mlPrediction.message ||
                    "Not enough historical data for a reliable prediction."}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── PRICE HISTORY ── */}
        <section className="history-section">
          <div className="section-hdr history-hdr">
            <div>
              <h2 className="section-title">Historical Price Trend</h2>
              <p className="section-desc">
                Real MongoDB snapshots for model{" "}
                <strong>{selectedModel || "—"}</strong>. No fabricated data.
              </p>
            </div>
            <div className="plat-filter">
              <label htmlFor="plat-sel">Platform:</label>
              <select
                id="plat-sel"
                value={historyPlatform}
                onChange={(e) => handlePlatformFilter(e.target.value)}
              >
                <option value="All">All Platforms</option>
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
                <option value="Vijay Sales">Vijay Sales</option>
              </select>
            </div>
          </div>

          <div className="history-body">
            {historyLoading ? (
              <div className="hist-loading">
                <div className="mini-spinner" />
                <span>Fetching snapshots from MongoDB…</span>
              </div>
            ) : chartData.length >= 2 ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="displayDate"
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      domain={["auto", "auto"]}
                      tickFormatter={(v) =>
                        "₹" + Number(v).toLocaleString("en-IN")
                      }
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Line
                      type="monotone"
                      dataKey="priceNumber"
                      name="Recorded Price"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: "#2563eb" }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : chartData.length === 1 ? (
              <div className="hist-empty">
                <div className="he-icon">📊</div>
                <h3>Only One Snapshot Recorded</h3>
                <p>
                  Two or more snapshots on different dates are needed to plot a
                  trend line.
                </p>
                <div className="snapshot-card">
                  {[
                    ["Platform", chartData[0].platform],
                    ["Price",    fmtINR(chartData[0].price)],
                    ["Status",   chartData[0].availability || "—"],
                    ["Date",     chartData[0].date || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="sc-kv">
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <p className="he-hint">
                  Run price comparisons over multiple days to build a trend.
                </p>
              </div>
            ) : (
              <div className="hist-empty">
                <div className="he-icon">📉</div>
                <h3>No Historical Snapshots Yet</h3>
                <p>
                  Click <strong>Compare Prices</strong> to record the first snapshot
                  for model <strong>{selectedModel || "the selected model"}</strong>.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── EMPTY STATE (before first search) ── */}
        {!hasSearched && !loading && (
          <div className="empty-state">
            <div className="es-icon">🔍</div>
            <h3>Ready to Compare</h3>
            <p>
              Select a brand, category, and model from the dropdowns above, then
              click <strong>Compare Prices</strong> to see live prices from all
              three marketplaces.
            </p>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer className="ps-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">PriceScope</span>
            <p>Real-time product price comparison &amp; ML-assisted purchase recommendation.</p>
          </div>
          <div className="footer-tech">
            {["Python","Flask","Playwright","Scikit-learn","MongoDB","React","Recharts"].map(
              (t) => <span key={t} className="tech-badge">{t}</span>
            )}
          </div>
          <p className="footer-copy">College Project — Data Mining &amp; Machine Learning</p>
        </div>
      </footer>
    </div>
  );
}

// ── Inline SVG icons ──────────────────────────────────────
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}