import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ExternalLink, MonitorSmartphone } from "lucide-react";

const SYMBOLS = [
  { ticker: "NBIS", tv: "NASDAQ:NBIS", name: "Nebius Group" },
  { ticker: "RKLB", tv: "NASDAQ:RKLB", name: "Rocket Lab" },
];

function formatUsd(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatMarketCap(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000)
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return formatUsd(value);
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#07111f",
    color: "white",
    fontFamily: "Inter, Arial, sans-serif",
    padding: 24,
  },
  shell: {
    maxWidth: 1300,
    margin: "0 auto",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: 16,
    padding: 24,
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(90deg, rgba(34,211,238,0.12), rgba(15,23,42,0.92), rgba(217,70,239,0.10))",
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
    marginBottom: 24,
  },
  panel: {
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
    backdropFilter: "blur(12px)",
  },
  panelHeader: {
    padding: "20px 20px 0 20px",
  },
  panelBody: {
    padding: 20,
  },
  badge: (positive) => ({
    display: "inline-block",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 700,
    background: positive ? "rgba(16,185,129,0.18)" : "rgba(244,63,94,0.18)",
    color: positive ? "#86efac" : "#fda4af",
  }),
  input: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    outline: "none",
  },
  button: {
    padding: "12px 16px",
    borderRadius: 16,
    border: "none",
    background: "white",
    color: "#07111f",
    fontWeight: 700,
    cursor: "pointer",
  },
  ghostButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "rgba(255,255,255,0.8)",
    cursor: "pointer",
  },
};

function usePollingQuotes(apiKey) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    if (!apiKey) {
      setError(
        "Add a Finnhub API key to enable live prices and live market cap."
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = {};
      for (const s of SYMBOLS) {
        const [quoteRes, profileRes] = await Promise.all([
          fetch(
            `https://finnhub.io/api/v1/quote?symbol=${s.ticker}&token=${apiKey}`
          ),
          fetch(
            `https://finnhub.io/api/v1/stock/profile2?symbol=${s.ticker}&token=${apiKey}`
          ),
        ]);
        if (!quoteRes.ok || !profileRes.ok) {
          throw new Error("Failed to load one or more market data endpoints.");
        }
        const quote = await quoteRes.json();
        const profile = await profileRes.json();
        const dailyPercent = quote.pc
          ? ((quote.c - quote.pc) / quote.pc) * 100
          : null;
        next[s.ticker] = {
          price: quote.c,
          changePercent: dailyPercent,
          prevClose: quote.pc,
          high: quote.h,
          low: quote.l,
          marketCap: profile.marketCapitalization
            ? profile.marketCapitalization * 1_000_000
            : null,
        };
      }
      setData(next);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to fetch live data right now."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (!apiKey) return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [apiKey]);

  return { data, loading, updatedAt, error, refresh: load };
}

function useCandleHistory(apiKey, ticker) {
  const [state, setState] = useState({ points: [], loading: false, error: "" });

  useEffect(() => {
    async function load() {
      if (!apiKey) {
        setState({ points: [], loading: false, error: "" });
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const now = Math.floor(Date.now() / 1000);
        const monthAgo = now - 60 * 60 * 24 * 30;
        const url = `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${monthAgo}&to=${now}&token=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not load chart data.");
        const json = await res.json();
        if (!json || json.s !== "ok" || !Array.isArray(json.c)) {
          throw new Error("No chart data available.");
        }
        const points = json.c.map((price, index) => ({
          price,
          time: json.t[index],
        }));
        setState({ points, loading: false, error: "" });
      } catch (e) {
        setState({
          points: [],
          loading: false,
          error: e instanceof Error ? e.message : "Chart failed to load.",
        });
      }
    }

    load();
  }, [apiKey, ticker]);

  return state;
}

function BuiltInChart({ apiKey, ticker, quote, height = 320 }) {
  const { points, loading, error } = useCandleHistory(apiKey, ticker);
  const storageKey = `live-chart-${ticker}`;
  const [livePoints, setLivePoints] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) setLivePoints(saved);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (quote?.price == null) return;
    setLivePoints((prev) => {
      const lastPrice = prev.length ? prev[prev.length - 1].price : null;
      if (lastPrice === quote.price) return prev;
      const next = [
        ...prev,
        { price: quote.price, time: Date.now() / 1000 },
      ].slice(-240);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [quote?.price, storageKey]);

  let chartPoints = points.length >= 2 ? points : livePoints;
  let mode = points.length >= 2 ? "historical" : "live";

  if (chartPoints.length < 2 && quote?.price != null) {
    const synthetic = [];
    const prevClose = quote?.prevClose;
    const low = quote?.low;
    const high = quote?.high;
    if (prevClose != null) synthetic.push({ price: prevClose, time: 1 });
    if (low != null && low !== prevClose)
      synthetic.push({ price: low, time: 2 });
    if (high != null && high !== low) synthetic.push({ price: high, time: 3 });
    synthetic.push({ price: quote.price, time: 4 });
    if (synthetic.length >= 2) {
      chartPoints = synthetic;
      mode = "snapshot";
    }
  }

  if (!apiKey) {
    return (
      <div
        style={{
          minHeight: height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.45)",
        }}
      >
        Connect your API key to load the chart.
      </div>
    );
  }

  if (loading && chartPoints.length < 2) {
    return (
      <div
        style={{
          minHeight: height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.45)",
        }}
      >
        Loading chart…
      </div>
    );
  }

  if (chartPoints.length < 2) {
    return (
      <div
        style={{
          minHeight: height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: "rgba(255,255,255,0.55)",
          padding: 24,
        }}
      >
        {error
          ? "Historical chart data is unavailable right now, and there is not enough quote data yet to draw a fallback chart."
          : "Waiting for more live price points to draw the chart."}
      </div>
    );
  }

  const width = 560;
  const padding = 18;
  const prices = chartPoints.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 0.0001);
  const last = prices[prices.length - 1];
  const first = prices[0];
  const positive = last >= first;

  const linePath = chartPoints
    .map((p, i) => {
      const x =
        padding + (i / (chartPoints.length - 1)) * (width - padding * 2);
      const y =
        padding + ((max - p.price) / range) * (height - padding * 2 - 24);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${width - padding} ${
    height - padding
  } L ${padding} ${height - padding} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height, display: "block" }}
      >
        <defs>
          <linearGradient id={`fill-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={
                positive ? "rgba(52,211,153,0.45)" : "rgba(251,113,133,0.45)"
              }
            />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((g) => {
          const y = padding + (g / 3) * (height - padding * 2 - 24);
          return (
            <line
              key={g}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          );
        })}
        <path d={areaPath} fill={`url(#fill-${ticker})`} />
        <path
          d={linePath}
          fill="none"
          stroke={positive ? "#34d399" : "#fb7185"}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <text
          x={padding}
          y={height - 6}
          fill="rgba(255,255,255,0.45)"
          fontSize="12"
        >
          {mode === "historical"
            ? "30D"
            : mode === "live"
            ? "Start"
            : "Prev close"}
        </text>
        <text
          x={width - padding}
          y={height - 6}
          textAnchor="end"
          fill="rgba(255,255,255,0.45)"
          fontSize="12"
        >
          Now
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
          fontSize: 14,
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.6)" }}>
          {mode === "historical"
            ? "30-day trend"
            : mode === "live"
            ? "Live session trend"
            : "Daily snapshot"}
        </span>
        <span
          style={{ color: positive ? "#86efac" : "#fda4af", fontWeight: 700 }}
        >
          {formatPercent(((last - first) / first) * 100)}
        </span>
      </div>
      {mode !== "historical" && error ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          {mode === "snapshot"
            ? "Historical data did not load, so this chart is showing a quote-based fallback from previous close, day range, and current price."
            : "Historical data did not load, so this chart is building from live prices while the page stays open."}
        </div>
      ) : null}
    </div>
  );
}

function StockTile({ stock, quote }) {
  const positive = (quote?.changePercent ?? 0) >= 0;
  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>
              {stock.ticker}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 14,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {stock.name}
            </div>
          </div>
          <div style={styles.badge(positive)}>
            {formatPercent(quote?.changePercent)}
          </div>
        </div>
      </div>
      <div style={styles.panelBody}>
        <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2 }}>
          {formatUsd(quote?.price)}
        </div>
        <div
          style={{
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.18)",
            padding: 16,
            marginTop: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Live market cap
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 36,
              fontWeight: 800,
              color: "#67e8f9",
            }}
          >
            {formatMarketCap(quote?.marketCap)}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div
            style={{
              borderRadius: 18,
              background: "rgba(255,255,255,0.05)",
              padding: 14,
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
              Prev close
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>
              {formatUsd(quote?.prevClose)}
            </div>
          </div>
          <div
            style={{
              borderRadius: 18,
              background: "rgba(255,255,255,0.05)",
              padding: 14,
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
              Day range
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>
              {quote?.low != null && quote?.high != null
                ? `${formatUsd(quote.low)} – ${formatUsd(quote.high)}`
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LiveStockDashboard() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const { data, loading, updatedAt, error, refresh } = usePollingQuotes(apiKey);

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("finnhub-api-key") || "";
      if (savedKey) {
        setApiKey(savedKey);
        setApiKeyInput(savedKey);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (apiKey) {
        localStorage.setItem("finnhub-api-key", apiKey);
        setApiKeyInput(apiKey);
      }
    } catch {}
  }, [apiKey]);

  const lastUpdated = useMemo(() => {
    if (!updatedAt) return "Not connected";
    return updatedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [updatedAt]);

  const isNarrow = typeof window !== "undefined" && window.innerWidth < 980;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div
          style={{
            ...styles.hero,
            gridTemplateColumns: isNarrow ? "1fr" : "1.4fr 1fr",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.25em",
                color: "#67e8f9",
              }}
            >
              <MonitorSmartphone size={16} />
              always-on stock board
            </div>
            <h1
              style={{
                margin: "14px 0 0 0",
                fontSize: isNarrow ? 36 : 56,
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: -2,
              }}
            >
              NBIS + RKLB Live Dashboard
            </h1>
            <p
              style={{
                marginTop: 14,
                maxWidth: 760,
                fontSize: 16,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.5,
              }}
            >
              Big numbers, highlighted daily move, live market cap below each
              price, and charts on the right. Keep this open in a dedicated
              browser tab or fullscreen on a second monitor.
            </p>
          </div>

          <div
            style={{
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.20)",
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              Connect live data
            </div>
            <p
              style={{
                marginTop: 6,
                fontSize: 14,
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.5,
              }}
            >
              Paste a Finnhub API key once. It will be saved in this browser,
              and the dashboard refreshes every 15 seconds.
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Finnhub API key"
                style={styles.input}
              />
              <button
                onClick={() => setApiKey(apiKeyInput.trim())}
                style={styles.button}
              >
                Connect
              </button>
              <button
                onClick={() => {
                  setApiKey("");
                  setApiKeyInput("");
                  try {
                    localStorage.removeItem("finnhub-api-key");
                  } catch {}
                }}
                style={{
                  ...styles.ghostButton,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                Clear
              </button>
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 12,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              <span>
                Status:{" "}
                {apiKey
                  ? loading
                    ? "Refreshing…"
                    : `Connected • ${lastUpdated}`
                  : "Not connected"}
              </span>
              <button onClick={refresh} style={styles.ghostButton}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
            {error ? (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 18,
                  border: "1px solid rgba(251,191,36,0.25)",
                  background: "rgba(251,191,36,0.12)",
                  padding: 12,
                  fontSize: 14,
                  color: "#fde68a",
                }}
              >
                {error}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 14,
                fontSize: 12,
              }}
            >
              <a
                style={{ ...styles.ghostButton, textDecoration: "none" }}
                href="https://finnhub.io/"
                target="_blank"
                rel="noreferrer"
              >
                Get API key <ExternalLink size={13} />
              </a>
              <a
                style={{ ...styles.ghostButton, textDecoration: "none" }}
                href="https://www.tradingview.com/"
                target="_blank"
                rel="noreferrer"
              >
                TradingView charts <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 24,
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
          }}
        >
          <div style={{ display: "grid", gap: 24 }}>
            {SYMBOLS.map((stock) => (
              <StockTile
                key={stock.ticker}
                stock={stock}
                quote={data[stock.ticker]}
              />
            ))}
          </div>

          <div style={{ display: "grid", gap: 24 }}>
            {SYMBOLS.map((stock) => (
              <div
                key={stock.ticker}
                style={{ ...styles.panel, overflow: "hidden" }}
              >
                <div style={styles.panelHeader}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {stock.ticker} Chart
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    Built-in chart using Finnhub history, plus live and quote
                    fallback
                  </div>
                </div>
                <div style={styles.panelBody}>
                  <BuiltInChart
                    apiKey={apiKey}
                    ticker={stock.ticker}
                    quote={data[stock.ticker]}
                    height={320}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
