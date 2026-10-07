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
    return <span className="badge badge-oos">✗ Out Of Stock</span>;
  return <span className="badge badge-unavail">{avail || "Unavailable"}</span>;
}

// ── Platform Icon ─────────────────────────────────────────
function PlatformIcon({ name }) {
  const styles = {
    Amazon:       { bg: "#FF9900", text: "AMZ" },
    Flipkart:     { bg: "#2874F0", text: "FK" },
    "Vijay Sales":{ bg: "#E31E26", text: "VS" },
  };
  const s = styles[name] || { bg: "#334155", text: name ? name.substring(0, 2).toUpperCase() : "?" };
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

// ── BRANDS & CATEGORIES ───────────────────────────────────
const BRANDS = ["Samsung", "LG", "Whirlpool", "Godrej", "Haier", "Bosch"];
const CATEGORIES = ["Refrigerator", "Washing Machine", "Air Conditioner", "Microwave"];

// ── Main App ──────────────────────────────────────────────
export default function App() {
  // ── Search form state ──────────────────────────────────
  const [brand, setBrand]       = useState("Samsung");
  const [category, setCategory] = useState("Refrigerator");
  const [capacity, setCapacity] = useState("256 L");
  const [selectedModel, setSelectedModel] = useState("RT30C3732S8/NL");

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
        if (list.length > 0) {
          if (!list.includes(selectedModel)) {
            setSelectedModel(list[0]);
          }
        }
      } else {
        throw new Error("Failed to load models");
      }
    } catch (e) {
      console.warn("Could not load models from server, using catalog defaults:", e);
      const fallback = [
        "RT30C3732S8/NL",
        "RT40H30U3THL",
        "RT40H30U2PHL",
        "RT28C3452S8",
        "RT34C4522S8",
        "RT42CB66228",
      ];
      setModels(fallback);
      if (!fallback.includes(selectedModel)) {
        setSelectedModel(fallback[0]);
      }
    } finally {
      setModelsLoading(false);
    }
  }, [selectedModel]);

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

  // ── Fetch ML prediction (secondary feature) ────────────
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

  // ── Compare Prices ─────────────────────────────────────
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

      // Refresh secondary history & prediction in background
      fetchPriceHistory(selectedModel, historyPlatform);
      fetchPrediction(selectedModel);
    } catch (e) {
      console.error(e);
      setError(
        "Could not connect to the backend. Please ensure the Flask backend is running on http://127.0.0.1:5000."
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

  // Ensure 3 primary platforms are shown in structured order
  const orderedPlatforms = ["Amazon", "Flipkart", "Vijay Sales"];
  const displayResults = orderedPlatforms.map((plat) => {
    const found = results.find((r) => r.platform?.toLowerCase() === plat.toLowerCase());
    return found || {
      platform: plat,
      product_name: null,
      price: null,
      availability: "Price unavailable",
      product_url: null,
    };
  });

  // Check if any results are demo/fallback
  const hasDemoFallback = results.some((r) => r.data_source === "demo_fallback");

  return (
    <div className="ps-root">

      {/* ── HEADER ── */}
      <header className="ps-header">
        <div className="header-inner">
          <div className="logo-block">
            <span className="logo-icon" aria-hidden="true">₹</span>
            <div>
              <span className="logo-name">Product Price Comparison</span>
              <span className="logo-tagline">Real-Time Market Comparison</span>
            </div>
          </div>
          <div className="header-platforms">
            <span className="plat-tag amz">Amazon</span>
            <span className="plat-tag fk">Flipkart</span>
            <span className="plat-tag vs">Vijay Sales</span>
          </div>
        </div>
      </header>

      {/* ── HERO BANNER ── */}
      <section className="ps-hero">
        <div className="hero-inner">
          <h1 className="hero-heading">Product Price Comparison</h1>
          <p className="hero-sub">
            Compare real product prices across Amazon, Flipkart, and Vijay Sales for the exact same model.
          </p>
        </div>
      </section>

      {/* ── MAIN CONTENT SHELL ── */}
      <main className="ps-shell">

        {/* ── SEARCH CARD ── */}
        <section className="search-card">
          <div className="sc-header">
            <span className="sc-title">Select Product to Compare</span>
            <span className="sc-sub">Choose brand, category, specification and exact model</span>
          </div>

          <div className="sc-fields">
            {/* Row 1: Brand, Category, Capacity */}
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
                <label htmlFor="ps-capacity">Capacity / Specification</label>
                <input
                  id="ps-capacity"
                  type="text"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 256 L"
                />
              </div>
            </div>

            {/* Row 2: Model Number + Compare Button */}
            <div className="sc-row sc-row-model">
              <div className="field-group field-model">
                <label htmlFor="ps-model">
                  Model
                  <span className="field-tag">Exact Model Matching</span>
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
                          — Select exact model —
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
                <span className="model-hint">
                  Same exact product model compared across Amazon, Flipkart, and Vijay Sales.
                </span>
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
                      Comparing Prices…
                    </>
                  ) : (
                    <>
                      <SearchIcon />
                      COMPARE PRICES
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── DEMO / FALLBACK NOTICE ── */}
        {hasDemoFallback && !loading && (
          <div className="alert alert-fallback" role="status">
            <span className="fallback-badge-chip">Demo / Fallback Mode</span>
            <span>
              <strong>Note:</strong> Displaying verified demo/fallback price data for model{" "}
              <strong>{selectedModel}</strong>. Live marketplace scrapers will overwrite this automatically once accessible.
            </span>
          </div>
        )}

        {/* ── ERROR ALERT ── */}
        {error && (
          <div className="alert alert-error" role="alert">
            <WarningIcon />
            <div>
              <strong>Connection Error:</strong> {error}
            </div>
          </div>
        )}

        {/* ── LOADING STATE ── */}
        {loading && (
          <div className="loading-panel">
            <div className="loading-spinner" />
            <div>
              <h3>Fetching Live Marketplace Prices…</h3>
              <p>
                Checking Amazon, Flipkart, and Vijay Sales for exact model:{" "}
                <strong className="model-code">{selectedModel}</strong>.
              </p>
              <div className="loading-steps">
                <div className="loading-step">
                  <span className="step-dot step-amz" />
                  Amazon
                </div>
                <div className="loading-step">
                  <span className="step-dot step-fk" />
                  Flipkart
                </div>
                <div className="loading-step">
                  <span className="step-dot step-vs" />
                  Vijay Sales
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── LIVE PRICES SECTION ── */}
        {(hasSearched || results.length > 0) && !loading && (
          <section className="results-section">
            <div className="section-hdr">
              <div>
                <h2 className="section-title">MARKETPLACE PRICES</h2>
                <p className="section-desc">
                  Prices compared side-by-side for exact model:{" "}
                  <strong>{selectedModel}</strong> across all 3 platforms.
                </p>
              </div>
              <div className="model-tag">
                <span className="mt-label">Exact Model:</span>
                <span className="mt-value">{selectedModel}</span>
              </div>
            </div>

            <div className="market-grid">
              {displayResults.map((item, i) => {
                const found = item.product_name != null;
                const hasPrice = item.price != null;
                const avail = (item.availability || "").toLowerCase();
                const isAvailable =
                  avail === "available" || avail === "in stock";
                const isFallback = item.data_source === "demo_fallback";

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
                      <div className="mc-plat-info">
                        <PlatformIcon name={item.platform} />
                        <span className="mc-platform">{item.platform}</span>
                      </div>
                      <div className="mc-head-badges">
                        {isFallback && (
                          <span className="badge badge-fallback">Demo/Fallback</span>
                        )}
                        <AvailBadge
                          avail={item.availability}
                          productFound={found}
                        />
                      </div>
                    </div>

                    <div className="mc-body">
                      <div className="mc-meta-row">
                        <span className="mc-meta-label">Model:</span>
                        <span className="mc-model-chip">{selectedModel}</span>
                      </div>
                      <p className="mc-product" title={item.product_name || ""}>
                        {found ? item.product_name : "Exact model not found on this platform"}
                      </p>
                    </div>

                    <div className="mc-footer">
                      <div className="mc-price-row">
                        {hasPrice ? (
                          <div className="mc-price-box">
                            <span className="mc-price-label">Price</span>
                            <span className="mc-price">{fmtINR(item.price)}</span>
                          </div>
                        ) : (
                          <div className="mc-price-box">
                            <span className="mc-price-label">Price</span>
                            <span className="mc-price-na">
                              {found ? "Price unavailable" : "Exact model not found"}
                            </span>
                          </div>
                        )}
                      </div>

                      {hasPrice && !isAvailable && found && (
                        <p className="mc-note">
                          Valid price recorded — product currently Out Of Stock.
                        </p>
                      )}

                      {/* Product URL Link Button */}
                      <div className="mc-action-row">
                        {item.product_url ? (
                          <a
                            href={item.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-view-product"
                          >
                            Buy on {item.platform} <ExternalLinkIcon />
                          </a>
                        ) : (
                          <span className="btn-view-product btn-disabled">
                            Buy Link Unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── BEST AVAILABLE OPTION (RECOMMENDATION) ── */}
        {(hasSearched || recommendation) && !loading && (
          <section className="rec-section">
            <div className="section-hdr">
              <div>
                <h2 className="section-title">BEST AVAILABLE OPTION</h2>
                <p className="section-desc">
                  Recommended purchase decision taking into account verified live availability.
                </p>
              </div>
            </div>

            {recommendation && recommendation.status === "available" ? (
              <div className="rec-card rec-good">
                <div className="rec-head">
                  <div>
                    <span className="rec-badge badge-best">Recommended Purchase</span>
                    <h3 className="rec-heading">
                      Lowest Available Price on {recommendation.platform}
                    </h3>
                  </div>
                  <div className="rec-price-highlight">
                    <span className="rph-label">Live Price</span>
                    <span className="rph-price">{fmtINR(recommendation.price)}</span>
                  </div>
                </div>

                <div className="rec-details">
                  <div className="rec-stat">
                    <span className="rs-label">Platform</span>
                    <span className="rs-value">{recommendation.platform}</span>
                  </div>
                  <div className="rec-stat">
                    <span className="rs-label">Availability</span>
                    <AvailBadge avail="Available" productFound={true} />
                  </div>
                  <div className="rec-stat">
                    <span className="rs-label">Verified Model</span>
                    <span className="rs-value">{selectedModel}</span>
                  </div>
                  {recommendation.savings > 0 && (
                    <div className="rec-stat rec-stat-savings">
                      <span className="rs-label">Calculated Savings</span>
                      <span className="rs-value rs-savings">₹{Number(recommendation.savings).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="rec-stat">
                    <span className="rs-label">Decision</span>
                    <span className="rs-value rs-reason">{recommendation.reason || "Lowest available in-stock price"}</span>
                  </div>
                </div>

                {recommendation.product_name && (
                  <div className="rec-product">
                    <span className="rp-label">Product Name:</span>
                    <span className="rp-name">{recommendation.product_name}</span>
                  </div>
                )}
              </div>
            ) : recommendation && recommendation.status === "out_of_stock" ? (
              <div className="rec-card rec-warn">
                <div className="rec-head">
                  <div>
                    <span className="rec-badge badge-warn">Inventory Notice</span>
                    <h3 className="rec-heading rec-heading-warn">
                      No Currently Available Purchase Option
                    </h3>
                  </div>
                </div>
                <p className="rec-warn-body">
                  Marketplace prices were found and are displayed above, but{" "}
                  <strong>all listings are currently Out Of Stock or Notify Me</strong>.
                  An unavailable product is not recommended for immediate purchase.
                </p>
              </div>
            ) : (
              <div className="rec-card rec-neutral">
                <div className="rec-head">
                  <div>
                    <span className="rec-badge badge-neutral">Notice</span>
                    <h3 className="rec-heading">No Valid Price Option</h3>
                  </div>
                </div>
                <p className="rec-neutral-body">
                  Exact model <strong>{selectedModel}</strong> was not found with an available price on the queried marketplaces.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── SECONDARY SECTION: HISTORICAL TREND & ML FORECAST ── */}
        <section className="secondary-section">
          <details className="sec-details" open={false}>
            <summary className="sec-summary">
              <span className="sec-summary-title">📊 Historical Price Trends &amp; ML Insights (Optional Project Feature)</span>
              <span className="sec-summary-hint">Click to expand</span>
            </summary>

            <div className="sec-content">
              {/* ML Valuation Hint */}
              {mlPrediction && mlPrediction.status === "success" && (
                <div className="ml-quick-banner">
                  <div>
                    <strong>ML Fair Value Estimate: </strong>
                    <span>{fmtINR(mlPrediction.predicted_price)}</span>
                    <span className="ml-alg-tag">({mlPrediction.model_used})</span>
                  </div>
                  <span className="ml-disclaimer-inline">
                    *Estimated fair valuation trained on historical database records; live comparison uses real scraped prices above.
                  </span>
                </div>
              )}

              {/* Price History Chart */}
              <div className="history-block">
                <div className="history-hdr-row">
                  <h4>Price History Snapshots (MongoDB)</h4>
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

                {historyLoading ? (
                  <div className="hist-loading">
                    <span className="mini-spinner" />
                    <span>Loading snapshots…</span>
                  </div>
                ) : chartData.length >= 2 ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
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
                          tickFormatter={(v) => "₹" + Number(v).toLocaleString("en-IN")}
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
                          dot={{ r: 4, fill: "#2563eb" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="hist-empty">
                    <p>
                      {chartData.length === 1
                        ? "One price snapshot recorded in MongoDB. Multiple snapshots over time will render a trend chart."
                        : "No prior snapshots in MongoDB yet for this model. Live comparison will record prices upon search."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </details>
        </section>

        {/* ── INITIAL PROMPT BEFORE SEARCH ── */}
        {!hasSearched && !loading && (
          <div className="empty-state">
            <div className="es-icon">🔍</div>
            <h3>Ready to Compare Live Prices</h3>
            <p>
              Select your specifications above and click <strong>COMPARE PRICES</strong> to query Amazon, Flipkart, and Vijay Sales simultaneously.
            </p>
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer className="ps-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Multi-Platform Product Price Comparison</span>
            <p>Live scraping across Amazon, Flipkart, and Vijay Sales with exact model verification.</p>
          </div>
          <div className="footer-tech">
            {["Amazon", "Flipkart", "Vijay Sales", "Python Flask", "Playwright", "MongoDB", "React"].map(
              (t) => <span key={t} className="tech-badge">{t}</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Inline SVG Icons ──────────────────────────────────────
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}