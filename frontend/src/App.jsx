import { useState, useEffect, useMemo, useRef } from "react";
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

// Backend URL: override with VITE_API_BASE in frontend/.env if needed
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5000";
const COMPARE_TIMEOUT_MS = 90000;

const PLATFORMS = ["Amazon", "Flipkart", "Vijay Sales"];
const PLATFORM_COLORS = {
  Amazon: "#FF9900",
  Flipkart: "#2874F0",
  "Vijay Sales": "#E31E26",
};
const BRANDS = ["Samsung", "LG", "Whirlpool", "Godrej", "Haier", "Bosch"];
const CATEGORIES = ["Refrigerator", "Washing Machine", "Air Conditioner", "Microwave"];

// ── Helpers ────────────────────────────────────────────────
const fmtINR = (n) =>
  n != null && n !== "" && !Number.isNaN(Number(n))
    ? "₹" + Number(n).toLocaleString("en-IN")
    : null;

async function fetchJson(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = new Error(`Server returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const isAvailableItem = (item) => {
  const a = (item?.availability || "").toLowerCase();
  return item?.price != null && (a === "available" || a === "in stock");
};

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
    Amazon: { bg: "#FF9900", text: "AMZ" },
    Flipkart: { bg: "#2874F0", text: "FK" },
    "Vijay Sales": { bg: "#E31E26", text: "VS" },
  };
  const s = styles[name] || {
    bg: "#334155",
    text: name ? name.substring(0, 2).toUpperCase() : "?",
  };
  return (
    <span className="plat-icon" style={{ background: s.bg }} aria-label={name}>
      {s.text}
    </span>
  );
}

// ── Main App ──────────────────────────────────────────────
export default function App() {
  // Search form
  const [brand, setBrand] = useState("Samsung");
  const [category, setCategory] = useState("Refrigerator");
  const [capacity, setCapacity] = useState("256 L");
  const [selectedModel, setSelectedModel] = useState("RT30C3732S8/NL");

  // Model dropdown
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(false);

  // Results
  const [results, setResults] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [searchedModel, setSearchedModel] = useState("");

  // Insights (history + ML)
  const [historyData, setHistoryData] = useState([]);
  const [historyPlatform, setHistoryPlatform] = useState("All");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [mlPrediction, setMlPrediction] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [backendStatus, setBackendStatus] = useState("checking"); // checking | online | offline

  const abortRef = useRef(null);

  // ── Backend health check ───────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    fetchJson("/api/test", { signal: ctrl.signal })
      .then(() => setBackendStatus("online"))
      .catch((e) => {
        if (e.name !== "AbortError") setBackendStatus("offline");
      });
    return () => ctrl.abort();
  }, []);

  // ── Load models when brand / category change ───────────
  useEffect(() => {
    const ctrl = new AbortController();
    setModelsLoading(true);
    setModelsError(false);
    fetchJson(
      `/api/products/models?brand=${encodeURIComponent(brand)}&category=${encodeURIComponent(category)}`,
      { signal: ctrl.signal }
    )
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setModels(list);
        setSelectedModel((prev) => (list.includes(prev) ? prev : list[0] || ""));
        setBackendStatus("online");
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setModels([]);
        setSelectedModel("");
        setModelsError(true);
        setBackendStatus("offline");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setModelsLoading(false);
      });
    return () => ctrl.abort();
  }, [brand, category]);

  // ── Load price history (auto, when model / platform changes) ──
  useEffect(() => {
    if (!selectedModel) {
      setHistoryData([]);
      return;
    }
    const ctrl = new AbortController();
    setHistoryLoading(true);
    let path = `/api/price-history?model=${encodeURIComponent(selectedModel)}`;
    if (historyPlatform !== "All") path += `&platform=${encodeURIComponent(historyPlatform)}`;
    fetchJson(path, { signal: ctrl.signal })
      .then((data) => setHistoryData(Array.isArray(data) ? data : []))
      .catch((e) => {
        if (e.name !== "AbortError") setHistoryData([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setHistoryLoading(false);
      });
    return () => ctrl.abort();
  }, [selectedModel, historyPlatform, refreshKey]);

  // ── Load ML prediction (debounced: capacity is typed) ──
  useEffect(() => {
    if (!selectedModel) {
      setMlPrediction(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const path =
        `/api/predict-price?brand=${encodeURIComponent(brand)}` +
        `&category=${encodeURIComponent(category)}` +
        `&capacity=${encodeURIComponent(capacity)}` +
        `&model=${encodeURIComponent(selectedModel)}`;
      fetchJson(path, { signal: ctrl.signal })
        .then((data) =>
          setMlPrediction(
            data.status === "success"
              ? data
              : { status: "unavailable", message: data.message }
          )
        )
        .catch((e) => {
          if (e.name !== "AbortError") setMlPrediction({ status: "unavailable" });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [selectedModel, brand, category, capacity, refreshKey]);

  // ── Reset results whenever the selection changes ───────
  const resetResults = () => {
    abortRef.current?.abort();
    setResults([]);
    setRecommendation(null);
    setHasSearched(false);
    setError("");
    setLoading(false);
  };

  const onBrandChange = (v) => {
    resetResults();
    setBrand(v);
  };
  const onCategoryChange = (v) => {
    resetResults();
    setCategory(v);
  };
  const onModelChange = (v) => {
    resetResults();
    setSelectedModel(v);
  };

  // ── Compare prices ─────────────────────────────────────
  const compare = async (e) => {
    e?.preventDefault();
    if (!selectedModel) {
      setError("Please select a model before comparing.");
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, COMPARE_TIMEOUT_MS);

    setLoading(true);
    setError("");
    setResults([]);
    setRecommendation(null);
    setHasSearched(true);
    setSearchedModel(selectedModel);

    try {
      const searchQuery = `${brand} ${capacity} ${category.toLowerCase()}`;
      const path =
        `/api/live-compare?query=${encodeURIComponent(searchQuery)}` +
        `&model=${encodeURIComponent(selectedModel)}` +
        `&brand=${encodeURIComponent(brand)}` +
        `&capacity=${encodeURIComponent(capacity)}` +
        `&category=${encodeURIComponent(category)}`;
      const data = await fetchJson(path, { signal: ctrl.signal });
      setResults(Array.isArray(data.results) ? data.results : []);
      setRecommendation(data.recommendation || null);
      setBackendStatus("online");
      setRefreshKey((k) => k + 1); // reload history + ML after a new snapshot is saved
    } catch (err) {
      if (err.name === "AbortError" && !timedOut) return; // cancelled by a newer action
      if (timedOut) {
        setError("The marketplaces took too long to respond. Please try again in a moment.");
      } else if (err.status) {
        setError(`The backend returned an error (${err.status}). Check the Flask terminal for details.`);
      } else {
        setBackendStatus("offline");
        setError(
          `Could not reach the backend at ${API_BASE}. Start it with: python backend/app.py`
        );
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === ctrl) setLoading(false);
    }
  };

  // ── Derived data ───────────────────────────────────────
  const displayResults = PLATFORMS.map((plat) => {
    const found = results.find((r) => r.platform?.toLowerCase() === plat.toLowerCase());
    return (
      found || {
        platform: plat,
        product_name: null,
        price: null,
        availability: "Price unavailable",
        product_url: null,
      }
    );
  });

  const bestPlatform = useMemo(() => {
    const avail = results.filter(isAvailableItem);
    if (!avail.length) return null;
    return avail.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a)).platform;
  }, [results]);

  const bestPrice = useMemo(() => {
    const p = results.find((r) => r.platform === bestPlatform);
    return p ? Number(p.price) : null;
  }, [results, bestPlatform]);

  const hasDemoFallback = results.some((r) => r.data_source === "demo_fallback");
  const foundCount = displayResults.filter((r) => r.price != null).length;

  const { chartData, chartPlatforms } = useMemo(() => {
    const byDate = new Map();
    const plats = new Set();
    historyData.forEach((d) => {
      const price = Number(d.price);
      const date = d.date ? String(d.date).slice(0, 10) : null;
      if (!Number.isFinite(price) || !date || !d.platform) return;
      plats.add(d.platform);
      const row = byDate.get(date) || { date };
      row[d.platform] = price; // latest snapshot of the day wins
      byDate.set(date, row);
    });
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const ordered = PLATFORMS.filter((p) => plats.has(p)).concat(
      [...plats].filter((p) => !PLATFORMS.includes(p))
    );
    return { chartData: rows, chartPlatforms: ordered };
  }, [historyData]);

  const recentSnapshots = useMemo(() => [...historyData].reverse().slice(0, 6), [historyData]);

  const showResults = hasSearched && !loading;
  const rec = recommendation;

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
          <div className="header-right">
            <span className={`status-pill status-${backendStatus}`} role="status">
              <span className="status-dot" />
              {backendStatus === "online" && "Backend connected"}
              {backendStatus === "offline" && "Backend offline"}
              {backendStatus === "checking" && "Connecting…"}
            </span>
            <div className="header-platforms">
              <span className="plat-tag amz">Amazon</span>
              <span className="plat-tag fk">Flipkart</span>
              <span className="plat-tag vs">Vijay Sales</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="ps-hero">
        <div className="hero-inner">
          <h1 className="hero-heading">Find the best price, instantly</h1>
          <p className="hero-sub">
            Compare the exact same model across Amazon, Flipkart and Vijay Sales, and see
            which one is worth buying right now.
          </p>
        </div>
      </section>

      <main className="ps-shell">
        {/* ── SEARCH CARD ── */}
        <form className="search-card" onSubmit={compare}>
          <div className="sc-header">
            <span className="sc-title">Select a product to compare</span>
            <span className="sc-sub">Choose brand, category, capacity and the exact model number</span>
          </div>

          <div className="sc-fields">
            <div className="sc-row">
              <div className="field-group">
                <label htmlFor="ps-brand">Brand</label>
                <select id="ps-brand" value={brand} onChange={(e) => onBrandChange(e.target.value)}>
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
                  onChange={(e) => onCategoryChange(e.target.value)}
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
                    onChange={(e) => onModelChange(e.target.value)}
                    disabled={models.length === 0}
                    className={models.length === 0 ? "select-empty" : ""}
                  >
                    {models.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))
                    )}
                  </select>
                )}
                {!modelsLoading && modelsError ? (
                  <span className="model-hint hint-warn">
                    Couldn’t load models — the backend isn’t reachable.
                  </span>
                ) : !modelsLoading && models.length === 0 ? (
                  <span className="model-hint hint-warn">
                    No models are stored for {brand} {category.toLowerCase()} yet. Try Samsung
                    Refrigerator, which has verified models.
                  </span>
                ) : (
                  <span className="model-hint">
                    The same exact model is checked on Amazon, Flipkart and Vijay Sales.
                  </span>
                )}
              </div>

              <div className="field-action">
                <button
                  type="submit"
                  className="btn-compare"
                  disabled={loading || !selectedModel}
                >
                  {loading ? (
                    <>
                      <span className="btn-spin" />
                      Comparing…
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
        </form>

        {/* ── ERROR ── */}
        {error && (
          <div className="alert alert-error" role="alert">
            <WarningIcon />
            <div className="alert-body">
              <strong>Something went wrong.</strong> {error}
            </div>
            <button type="button" className="btn-retry" onClick={compare} disabled={loading}>
              Try again
            </button>
          </div>
        )}

        {/* ── DEMO NOTICE ── */}
        {hasDemoFallback && !loading && (
          <div className="alert alert-fallback" role="status">
            <span className="fallback-badge-chip">Demo data</span>
            <span>
              Live scraping didn’t return a price for some platforms, so sample prices are shown
              for <strong>{searchedModel}</strong>. They’re labelled on each card.
            </span>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div className="loading-panel" role="status" aria-live="polite">
            <div className="loading-spinner" />
            <div>
              <h3>Fetching live marketplace prices…</h3>
              <p>
                Checking all three stores for <strong className="model-code">{selectedModel}</strong>.
                This can take up to a minute.
              </p>
              <div className="loading-steps">
                <div className="loading-step"><span className="step-dot step-amz" />Amazon</div>
                <div className="loading-step"><span className="step-dot step-fk" />Flipkart</div>
                <div className="loading-step"><span className="step-dot step-vs" />Vijay Sales</div>
              </div>
            </div>
          </div>
        )}

        {/* ── MARKETPLACE PRICES ── */}
        {showResults && !error && (
          <section className="results-section">
            <div className="section-hdr">
              <div>
                <h2 className="section-title">MARKETPLACE PRICES</h2>
                <p className="section-desc">
                  {foundCount === 0
                    ? "No platform returned a price for this model."
                    : `Prices found on ${foundCount} of 3 platforms.`}
                </p>
              </div>
              <div className="model-tag">
                <span className="mt-label">Exact Model:</span>
                <span className="mt-value">{searchedModel}</span>
              </div>
            </div>

            <div className="market-grid">
              {displayResults.map((item) => {
                const found = item.product_name != null;
                const hasPrice = item.price != null;
                const available = isAvailableItem(item);
                const isFallback = item.data_source === "demo_fallback";
                const isBest = hasPrice && item.platform === bestPlatform;
                const diff =
                  hasPrice && bestPrice != null && !isBest
                    ? Number(item.price) - bestPrice
                    : null;

                return (
                  <div
                    key={item.platform}
                    className={[
                      "market-card",
                      hasPrice ? "card-priced" : "card-no-price",
                      available ? "card-available" : "",
                      isBest ? "card-best" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {isBest && <span className="best-ribbon">★ Best price</span>}

                    <div className="mc-head">
                      <div className="mc-plat-info">
                        <PlatformIcon name={item.platform} />
                        <span className="mc-platform">{item.platform}</span>
                      </div>
                      <div className="mc-head-badges">
                        {isFallback && <span className="badge badge-fallback">Demo</span>}
                        <AvailBadge avail={item.availability} productFound={found} />
                      </div>
                    </div>

                    <div className="mc-body">
                      <p className="mc-product" title={item.product_name || ""}>
                        {found ? item.product_name : "Exact model not found on this platform"}
                      </p>
                    </div>

                    <div className="mc-footer">
                      <div className="mc-price-row">
                        <div className="mc-price-box">
                          <span className="mc-price-label">Price</span>
                          {hasPrice ? (
                            <span className="mc-price">{fmtINR(item.price)}</span>
                          ) : (
                            <span className="mc-price-na">
                              {found ? "Price unavailable" : "Not found"}
                            </span>
                          )}
                          {diff != null && (
                            <span className="mc-diff">
                              {diff === 0 ? "Same as best price" : `${fmtINR(diff)} more than best`}
                            </span>
                          )}
                        </div>
                      </div>

                      {hasPrice && !available && found && (
                        <p className="mc-note">Price recorded, but currently not in stock.</p>
                      )}

                      <div className="mc-action-row">
                        {item.product_url ? (
                          <a
                            href={item.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-view-product"
                          >
                            View on {item.platform} <ExternalLinkIcon />
                          </a>
                        ) : (
                          <span className="btn-view-product btn-disabled">Link unavailable</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── RECOMMENDATION ── */}
        {showResults && !error && (
          <section className="rec-section">
            <div className="section-hdr">
              <div>
                <h2 className="section-title">BEST AVAILABLE OPTION</h2>
                <p className="section-desc">
                  Our recommendation, based on live price and in-stock availability.
                </p>
              </div>
            </div>

            {rec && rec.status === "available" ? (
              <div className="rec-card rec-good">
                <div className="rec-head">
                  <div>
                    <span className="rec-badge badge-best">Recommended</span>
                    <h3 className="rec-heading">Buy on {rec.platform}</h3>
                  </div>
                  <div className="rec-price-highlight">
                    <span className="rph-label">Live price</span>
                    <span className="rph-price">{fmtINR(rec.price)}</span>
                  </div>
                </div>

                <div className="rec-details">
                  <div className="rec-stat">
                    <span className="rs-label">Platform</span>
                    <span className="rs-value">{rec.platform}</span>
                  </div>
                  <div className="rec-stat">
                    <span className="rs-label">Availability</span>
                    <AvailBadge avail="Available" productFound={true} />
                  </div>
                  <div className="rec-stat">
                    <span className="rs-label">Model</span>
                    <span className="rs-value">{searchedModel}</span>
                  </div>
                  {rec.savings > 0 && (
                    <div className="rec-stat rec-stat-savings">
                      <span className="rs-label">You save</span>
                      <span className="rs-value rs-savings">{fmtINR(rec.savings)}</span>
                    </div>
                  )}
                </div>

                {rec.predicted_price != null && (
                  <div className="rec-ml">
                    <span className="rec-ml-label">ML fair-value estimate</span>
                    <span className="rec-ml-value">{fmtINR(rec.predicted_price)}</span>
                    <span className="rec-ml-text">
                      {rec.price_difference == null || Math.abs(rec.price_difference) < 1
                        ? "The live price matches the estimate."
                        : rec.price_difference < 0
                        ? `The live price is ${fmtINR(Math.abs(rec.price_difference))} below the estimate — a good deal.`
                        : `The live price is ${fmtINR(rec.price_difference)} above the estimate.`}
                    </span>
                  </div>
                )}

                {rec.product_name && (
                  <div className="rec-product">
                    <span className="rp-label">Product:</span>
                    <span className="rp-name">{rec.product_name}</span>
                  </div>
                )}
              </div>
            ) : rec && rec.status === "out_of_stock" ? (
              <div className="rec-card rec-warn">
                <div className="rec-head">
                  <div>
                    <span className="rec-badge badge-warn">Inventory notice</span>
                    <h3 className="rec-heading rec-heading-warn">Nothing is in stock right now</h3>
                  </div>
                </div>
                <p className="rec-warn-body">
                  Prices were found (shown above), but <strong>every listing is out of stock</strong>{" "}
                  or set to “Notify me”. Check back later.
                </p>
              </div>
            ) : (
              <div className="rec-card rec-neutral">
                <div className="rec-head">
                  <div>
                    <span className="rec-badge badge-neutral">Notice</span>
                    <h3 className="rec-heading">No price found</h3>
                  </div>
                </div>
                <p className="rec-neutral-body">
                  <strong>{searchedModel}</strong> wasn’t found with a price on any of the three
                  marketplaces. Try a different model.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── PRICE HISTORY & ML ── */}
        {selectedModel && (
          <section className="insights-card">
            <div className="insights-hdr">
              <div>
                <h2 className="section-title">PRICE HISTORY</h2>
                <p className="section-desc">
                  Saved snapshots for <strong>{selectedModel}</strong>. Every comparison adds a new
                  data point.
                </p>
              </div>
              <div className="plat-filter">
                <label htmlFor="plat-sel">Platform</label>
                <select
                  id="plat-sel"
                  value={historyPlatform}
                  onChange={(e) => setHistoryPlatform(e.target.value)}
                >
                  <option value="All">All platforms</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {mlPrediction?.status === "success" && (
              <div className="ml-quick-banner">
                <div>
                  <strong>ML fair-value estimate: </strong>
                  <span>{fmtINR(mlPrediction.predicted_price)}</span>
                  <span className="ml-alg-tag">({mlPrediction.model_used})</span>
                </div>
                <span className="ml-disclaimer-inline">
                  Estimated from historical records. The comparison above uses real scraped prices.
                </span>
              </div>
            )}

            {historyLoading ? (
              <div className="hist-loading">
                <span className="mini-spin" />
                <span>Loading snapshots…</span>
              </div>
            ) : chartData.length >= 2 ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis
                      stroke="#94a3b8"
                      width={72}
                      domain={["auto", "auto"]}
                      tickFormatter={(v) => "₹" + Number(v).toLocaleString("en-IN")}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(v, name) => [fmtINR(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    {chartPlatforms.map((p) => (
                      <Line
                        key={p}
                        type="monotone"
                        dataKey={p}
                        name={p}
                        stroke={PLATFORM_COLORS[p] || "#475569"}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="hist-empty">
                <p>
                  <strong>Not enough historical data for a trend.</strong>{" "}
                  {chartData.length === 1
                    ? "Only one day has been recorded so far; compare again on another day to see a trend."
                    : "Run a price comparison to start recording history for this model."}
                </p>
              </div>
            )}

            {recentSnapshots.length > 0 && (
              <div className="hist-table-wrap">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Platform</th>
                      <th>Price</th>
                      <th>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSnapshots.map((s, i) => (
                      <tr key={i}>
                        <td>{s.date ? String(s.date).slice(0, 16) : "—"}</td>
                        <td>{s.platform}</td>
                        <td>{fmtINR(s.price) || "—"}</td>
                        <td>{s.availability || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── INITIAL PROMPT ── */}
        {!hasSearched && !loading && (
          <div className="empty-state">
            <div className="es-icon" aria-hidden="true">🔍</div>
            <h3>Ready to compare</h3>
            <p>
              Pick a model above and press <strong>COMPARE PRICES</strong> to check Amazon,
              Flipkart and Vijay Sales at the same time.
            </p>
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="ps-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Multi-Platform Product Price Comparison</span>
            <p>Live scraping across Amazon, Flipkart and Vijay Sales with exact model verification.</p>
          </div>
          <div className="footer-tech">
            {["Python Flask", "Playwright", "MongoDB", "scikit-learn", "React"].map((t) => (
              <span key={t} className="tech-badge">{t}</span>
            ))}
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
