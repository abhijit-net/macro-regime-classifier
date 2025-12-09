"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { Upload, Play, Info, Activity, CheckCircle } from "lucide-react";

// -------------------- CONSTANTS --------------------

const regimes: Record<
  number,
  { name: string; color: string; criteria: string }
> = {
  0: {
    name: "Goldilocks",
    color: "#10b981",
    criteria: "R≥0.5, V≤0, G≥0, -0.5≤I≤0.75",
  },
  1: {
    name: "Slowdown",
    color: "#ef4444",
    criteria: "R≤-0.5, G≤0, V≥0",
  },
  2: {
    name: "Stagflation",
    color: "#f59e0b",
    criteria: "G≤0, I≥0.75, V≥0",
  },
  3: {
    name: "Overheating",
    color: "#8b5cf6",
    criteria: "R≥0.5, V≤-0.5, Optimism High",
  },
};

// 21 macro features – must match your macro CSV
const expectedFeatures = [
  "spx_ret_1w_z",
  "spx_ret_3w_z",
  "spx_ret_6w_z",
  "vix_z",
  "rv_3w_z",
  "vix_ts_z",
  "vvix_z",
  "hy_ret_3w_z",
  "slope_2s10s_z",
  "pmi_z",
  "pmi_chg_3w_z",
  "breakeven10_z",
  "breakeven_chg_3w_z",
  "cpi_yoy_z",
  "ip_yoy_z",
  "unemp_z",
  "aaii_spread_z",
  "cg_ratio_z",
  "oil_ret_3w_z",
  "gold_ret_3w_z",
  "capex_ret_6w_z",
];

// Feature-group display
const featureGroups: Record<string, string[]> = {
  "Market Returns & Momentum": ["spx_ret_1w_z", "spx_ret_3w_z", "spx_ret_6w_z"],
  "Volatility & Risk": ["vix_z", "rv_3w_z", "vix_ts_z", "vvix_z"],
  "Credit & Rates": ["hy_ret_3w_z", "slope_2s10s_z"],
  "Growth Indicators": ["pmi_z", "pmi_chg_3w_z", "ip_yoy_z", "unemp_z"],
  Inflation: ["breakeven10_z", "breakeven_chg_3w_z", "cpi_yoy_z"],
  Sentiment: ["aaii_spread_z"],
  "Commodities & Cross-Asset": [
    "cg_ratio_z",
    "oil_ret_3w_z",
    "gold_ret_3w_z",
    "capex_ret_6w_z",
  ],
};

// 11 sector ETFs used in your sector files
const SECTOR_TICKERS = [
  "IYR US Equity",
  "IYZ US Equity",
  "XLB US Equity",
  "XLE US Equity",
  "XLF US Equity",
  "XLI US Equity",
  "XLK US Equity",
  "XLP US Equity",
  "XLU US Equity",
  "XLV US Equity",
  "XLY US Equity",
];

// Static mapping: sectors to long/short in each regime
const regimeSectorConfig: Record<
  number,
  { long: string[]; short: string[] }
> = {
  0: {
    // Goldilocks – growth & cyclicals
    long: ["XLY US Equity", "XLK US Equity", "XLF US Equity"],
    short: ["XLU US Equity", "XLP US Equity"],
  },
  1: {
    // Slowdown – defensives
    long: ["XLP US Equity", "XLU US Equity", "XLV US Equity"],
    short: ["XLY US Equity", "XLF US Equity", "XLI US Equity"],
  },
  2: {
    // Stagflation – commodities
    long: ["XLE US Equity", "XLB US Equity"],
    short: ["XLF US Equity", "XLK US Equity", "XLY US Equity"],
  },
  3: {
    // Overheating – late cycle
    long: ["XLF US Equity", "XLI US Equity", "XLV US Equity"],
    short: ["XLU US Equity", "XLP US Equity"],
  },
};

// -------------------- UTILS --------------------

const normDate = (val: any): string | null => {
  if (val == null) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

const parseCSV = (text: string) => {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  const data: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(",");
    const row: any = {};
    headers.forEach((header, idx) => {
      const raw = values[idx]?.trim();
      if (raw === undefined || raw === "") {
        row[header] = null;
      } else if (!isNaN(Number(raw)) && header.toLowerCase() !== "date") {
        row[header] = parseFloat(raw);
      } else {
        row[header] = raw;
      }
    });
    data.push(row);
  }

  return { headers, data };
};

// -------------------- RF / LABEL LOGIC --------------------

const labelRegimes = (data: any[]) => {
  return data.map((row) => {
    const R_z = row.spx_ret_3w_z ?? 0;
    const V_z = row.vix_z ?? 0;
    const G_z = row.pmi_z ?? 0;
    const I_z = row.breakeven10_z ?? 0;

    const vol_stress = (row.vvix_z ?? 0) + (row.rv_3w_z ?? 0);
    const growth_momentum = (row.ip_yoy_z ?? 0) - (row.unemp_z ?? 0);

    let regime: number;

    // Stagflation
    if (G_z <= 0 && I_z >= 0.75 && V_z >= 0) {
      regime = 2;
    }
    // Overheating
    else if (R_z >= 0.5 && V_z <= -0.5 && vol_stress < -0.3) {
      regime = 3;
    }
    // Slowdown
    else if (R_z <= -0.5 && G_z <= 0 && V_z >= 0) {
      regime = 1;
    }
    // Goldilocks
    else if (
      R_z >= 0.5 &&
      V_z <= 0 &&
      G_z >= 0 &&
      I_z >= -0.5 &&
      I_z <= 0.75
    ) {
      regime = 0;
    }
    // Fallback logic
    else {
      if (R_z > 0 && V_z < 0 && growth_momentum > 0) regime = 0;
      else if (R_z < 0 && V_z > 0) regime = 1;
      else if (I_z > 0.5 || (row.cpi_yoy_z ?? 0) > 0.75) regime = 2;
      else regime = 3;
    }

    return { ...row, regime };
  });
};

const calcGini = (data: any[], target: string) => {
  const counts = [0, 0, 0, 0];
  data.forEach((d) => counts[d[target]]++);
  let gini = 1;
  counts.forEach((c) => {
    if (data.length > 0) gini -= Math.pow(c / data.length, 2);
  });
  return gini;
};

const trainDecisionTree = (
  data: any[],
  features: string[],
  target: string,
  depth: number,
  maxDepth: number
): any => {
  if (depth >= maxDepth || data.length < 15) {
    const counts = [0, 0, 0, 0];
    data.forEach((d) => counts[d[target]]++);
    const prediction = counts.indexOf(Math.max(...counts));
    return { leaf: true, prediction };
  }

  const numFeatures = Math.max(1, Math.floor(Math.sqrt(features.length)));
  const selected = [...features]
    .sort(() => 0.5 - Math.random())
    .slice(0, numFeatures);

  let bestFeature = selected[0];
  let bestThreshold = 0;
  let bestGini = Infinity;

  selected.forEach((feature) => {
    const values = data
      .map((d) => d[feature])
      .filter((v: number) => v != null && !isNaN(v))
      .sort((a: number, b: number) => a - b);
    if (values.length === 0) return;

    [0.25, 0.5, 0.75].forEach((pct) => {
      const threshold = values[Math.floor(values.length * pct)];
      const left = data.filter(
        (d) => d[feature] != null && d[feature] <= threshold
      );
      const right = data.filter(
        (d) => d[feature] != null && d[feature] > threshold
      );

      if (left.length < 5 || right.length < 5) return;

      const gini =
        (left.length / data.length) * calcGini(left, target) +
        (right.length / data.length) * calcGini(right, target);

      if (gini < bestGini) {
        bestGini = gini;
        bestFeature = feature;
        bestThreshold = threshold;
      }
    });
  });

  const left = data.filter(
    (d) => d[bestFeature] != null && d[bestFeature] <= bestThreshold
  );
  const right = data.filter(
    (d) => d[bestFeature] != null && d[bestFeature] > bestThreshold
  );

  if (left.length === 0 || right.length === 0) {
    const counts = [0, 0, 0, 0];
    data.forEach((d) => counts[d[target]]++);
    const prediction = counts.indexOf(Math.max(...counts));
    return { leaf: true, prediction };
  }

  return {
    leaf: false,
    feature: bestFeature,
    threshold: bestThreshold,
    left: trainDecisionTree(left, features, target, depth + 1, maxDepth),
    right: trainDecisionTree(right, features, target, depth + 1, maxDepth),
  };
};

const trainRandomForest = (
  data: any[],
  features: string[],
  target: string,
  numTrees = 100
) => {
  const trees: any[] = [];
  for (let i = 0; i < numTrees; i++) {
    const bootstrap = Array.from({ length: data.length }, () => {
      const idx = Math.floor(Math.random() * data.length);
      return data[idx];
    });
    trees.push(trainDecisionTree(bootstrap, features, target, 0, 12));
  }
  return trees;
};

const predictTree = (tree: any, sample: any): number => {
  if (tree.leaf) return tree.prediction;
  const val = sample[tree.feature];
  if (val == null || isNaN(val)) return tree.prediction ?? 0;
  return val <= tree.threshold
    ? predictTree(tree.left, sample)
    : predictTree(tree.right, sample);
};

const predictRF = (trees: any[], sample: any) => {
  const probs = [0, 0, 0, 0];
  trees.forEach((tree) => {
    const cls = predictTree(tree, sample);
    probs[cls]++;
  });
  return probs.map((p) => p / trees.length);
};

const calcImportance = (trees: any[], features: string[]) => {
  const imp: Record<string, number> = {};
  features.forEach((f) => (imp[f] = 0));

  const traverse = (tree: any, depth = 0) => {
    if (!tree.leaf) {
      imp[tree.feature] += 1 / (depth + 1);
      traverse(tree.left, depth + 1);
      traverse(tree.right, depth + 1);
    }
  };

  trees.forEach((tree) => traverse(tree));
  const total = Object.values(imp).reduce((a, b) => a + b, 0) || 1;

  return Object.entries(imp)
    .map(([feature, score]) => ({
      feature,
      importance: parseFloat(((score / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.importance - a.importance);
};

// -------------------- MAIN COMPONENT --------------------

const MacroRegimeClassifier = () => {
  const [step, setStep] = useState<
    "upload" | "ready" | "training" | "results" | "error"
  >("upload");
  const [rawData, setRawData] = useState<any[] | null>(null);
  const [processedData, setProcessedData] = useState<any[] | null>(null);
  const [model, setModel] = useState<any | null>(null);
  const [results, setResults] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "importance" | "test" | "backtest"
  >("overview");
  const [dataStats, setDataStats] = useState<any | null>(null);

  // Step 2 data: sector & stock weekly returns
  const [sectorData, setSectorData] = useState<any[] | null>(null);
  const [stockData, setStockData] = useState<any[] | null>(null);

  // Backtest result + weekly trade details
  const [backtest, setBacktest] = useState<any | null>(null);
  const [selectedTradeDate, setSelectedTradeDate] = useState<string>("");

  // -------------------- FILE UPLOAD: MACRO FEATURES --------------------

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { headers, data } = parseCSV(text);

    const dateCol =
      headers.find((h) => h.toLowerCase().includes("date")) ||
      headers.find((h) =>
        ["month", "time", "yyyymm"].includes(h.toLowerCase())
      );

    const missingFeatures = expectedFeatures.filter((f) => !headers.includes(f));
    const availableFeatures = expectedFeatures.filter((f) =>
      headers.includes(f)
    );

    // date range
    let dateRange = "N/A";
    if (dateCol) {
      const sorted = [...data].sort(
        (a, b) =>
          new Date(a[dateCol]).getTime() - new Date(b[dateCol]).getTime()
      );
      if (sorted.length > 0) {
        dateRange = `${sorted[0][dateCol]} to ${
          sorted[sorted.length - 1][dateCol]
        }`;
      }
    }

    const stats = {
      totalRows: data.length,
      dateColumn: dateCol,
      dateRange,
      availableFeatures: availableFeatures.length,
      missingFeatures,
      headers,
    };

    setRawData(data);
    setDataStats(stats);

    if (!dateCol) {
      setStep("error");
      return;
    }

    if (missingFeatures.length === 0) {
      const labeled = labelRegimes(data);
      const withKey = labeled
        .map((row) => {
          const key = normDate(row[dateCol]);
          return key ? { ...row, _dateKey: key } : null;
        })
        .filter(Boolean) as any[];
      setProcessedData(withKey);
      setStep("ready");
    } else {
      setStep("error");
    }
  };

  // -------------------- TRAIN RF MODEL --------------------

  const handleTrain = () => {
    if (!processedData || !dataStats?.dateColumn) return;
    setStep("training");

    setTimeout(() => {
      const dateCol = dataStats.dateColumn;

      // fixed split: 2005–2015 train, 2016–2025 test
      const trainingData = processedData.filter((row) => {
        const year = new Date(row[dateCol]).getFullYear();
        return year >= 2005 && year <= 2015;
      });

      const testingData = processedData.filter((row) => {
        const year = new Date(row[dateCol]).getFullYear();
        return year >= 2016;
      });

      if (trainingData.length === 0) {
        console.error("No training data in 2005–2015 range.");
        setStep("error");
        return;
      }

      const trees = trainRandomForest(
        trainingData,
        expectedFeatures,
        "regime",
        100
      );

      const trainPreds = trainingData.map((s) => {
        const probs = predictRF(trees, s);
        const predicted = probs.indexOf(Math.max(...probs));
        return {
          date: s[dateCol],
          actual: s.regime,
          predicted,
          probs,
        };
      });

      const correct = trainPreds.filter((p) => p.actual === p.predicted).length;
      const trainAcc =
        trainPreds.length > 0
          ? ((correct / trainPreds.length) * 100).toFixed(1)
          : "0.0";

      const regimeAcc = [0, 1, 2, 3].map((r) => {
        const rData = trainPreds.filter((p) => p.actual === r);
        const rCorrect = rData.filter((p) => p.predicted === r).length;
        const acc =
          rData.length > 0
            ? ((rCorrect / rData.length) * 100).toFixed(1)
            : "0.0";
        return {
          regime: regimes[r].name,
          accuracy: acc,
          count: rData.length,
        };
      });

      const testPreds = testingData.map((s) => {
        const probs = predictRF(trees, s);
        const predicted = probs.indexOf(Math.max(...probs));
        return {
          date: s[dateCol],
          predicted,
          p0: parseFloat((probs[0] * 100).toFixed(1)),
          p1: parseFloat((probs[1] * 100).toFixed(1)),
          p2: parseFloat((probs[2] * 100).toFixed(1)),
          p3: parseFloat((probs[3] * 100).toFixed(1)),
        };
      });

      const importance = calcImportance(trees, expectedFeatures);

      setModel({ trees, importance, testPredictions: testPreds });
      setResults({
        predictions: trainPreds,
        accuracy: trainAcc,
        regimeAccuracy: regimeAcc,
      });
      setStep("results");
      setActiveTab("overview");
    }, 400);
  };

  // -------------------- STEP 2: SECTOR WEEKLY RETURNS --------------------

  const handleSectorWeeklyUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { headers, data } = parseCSV(text);

    const dateHeader =
      headers.find((h) => h.toLowerCase() === "date") ||
      headers.find((h) => h.toLowerCase().includes("date")) ||
      headers[0];

    const rows = data
      .map((row) => {
        const key = normDate(row[dateHeader]);
        if (!key) return null;
        const returns: Record<string, number> = {};
        SECTOR_TICKERS.forEach((ticker) => {
          const v = row[ticker];
          if (v != null && v !== "" && !isNaN(Number(v))) {
            returns[ticker] = Number(v);
          }
        });
        return { _dateKey: key, returns };
      })
      .filter(Boolean) as any[];

    setSectorData(rows);
  };

  // -------------------- STEP 2: STOCK CONSTITUENT RETURNS --------------------

  const handleStockReturnsUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { headers, data } = parseCSV(text);

    if (!headers.includes("date") || !headers.includes("stock_ticker")) {
      alert(
        "Stock file must have at least: date, stock_ticker, sector_etf, ret columns."
      );
      return;
    }

    const rows = data
      .map((row) => {
        const key = normDate(row.date);
        if (!key) return null;
        const ret =
          row.ret != null && !isNaN(Number(row.ret)) ? Number(row.ret) : null;
        if (ret == null) return null;
        return {
          _dateKey: key,
          date: row.date,
          stock_ticker: row.stock_ticker,
          sector_etf: row.sector_etf,
          ret,
        };
      })
      .filter(Boolean) as any[];

    setStockData(rows);
  };

  // -------------------- BACKTEST ENGINE (2015–2025, 1-WEEK LAG) --------------------

  const runBacktest = () => {
    if (!processedData || !dataStats?.dateColumn) {
      alert("Upload macro feature file first.");
      return;
    }
    if (!sectorData || !stockData) {
      alert("Upload both sector + stock returns files.");
      return;
    }

    // 1) Date → regime (rule-based)
    const regimeByDate: Record<string, number> = {};
    processedData.forEach((row) => {
      const key: string | null =
        row._dateKey ?? normDate(row[dataStats.dateColumn]);
      if (!key) return;
      if (typeof row.regime === "number") regimeByDate[key] = row.regime;
    });

    // 2) Date → sector returns
    const sectorByDate: Record<string, Record<string, number>> = {};
    sectorData.forEach((row: any) => {
      if (!row._dateKey) return;
      sectorByDate[row._dateKey] = row.returns;
    });

    // 3) Date → stock rows
    const stocksByDate: Record<string, any[]> = {};
    stockData.forEach((row: any) => {
      if (!row._dateKey) return;
      if (!stocksByDate[row._dateKey]) stocksByDate[row._dateKey] = [];
      stocksByDate[row._dateKey].push(row);
    });

    // Build date→ticker→return map for quick lookup (this week's returns)
    const stockRetByDate: Record<string, Record<string, number>> = {};
    Object.entries(stocksByDate).forEach(([d, rows]) => {
      stockRetByDate[d] = {};
      rows.forEach((r: any) => {
        if (r.stock_ticker && isFinite(r.ret)) {
          stockRetByDate[d][r.stock_ticker] = r.ret;
        }
      });
    });

    // Common dates
    const allDates = Object.keys(regimeByDate)
      .filter((d) => sectorByDate[d] && stocksByDate[d])
      .sort();

    if (allDates.length < 2) {
      alert("Not enough overlapping dates between the 3 files.");
      setBacktest(null);
      return;
    }

    const cutoff = new Date("2015-01-01");

    const initialCapital = 1_000_000;
    let equity = initialCapital;

    const equityCurve: { date: string; equity: number; ret: number }[] = [];
    const weeklyReturns: number[] = [];
    const tradesByDate: Record<
      string,
      {
        date: string;
        regime: number;
        weeklyRet: number;
        longs: {
          ticker: string;
          sector_etf: string;
          stockRet: number;
          weight: number;
          pnl: number;
        }[];
        shorts: {
          ticker: string;
          sector_etf: string;
          stockRet: number;
          weight: number;
          pnl: number;
        }[];
      }
    > = {};

    // 1-week lag: use week (i-1) to select, week i to realize P&L
    for (let i = 1; i < allDates.length; i++) {
      const tradeDate = allDates[i];
      const tradeDateObj = new Date(tradeDate);
      if (tradeDateObj < cutoff) continue; // strictly 2015 onwards

      const rankDate = allDates[i - 1];

      const regime = regimeByDate[tradeDate];
      const config = regimeSectorConfig[regime];
      if (!config) {
        weeklyReturns.push(0);
        equityCurve.push({ date: tradeDate, equity, ret: 0 });
        continue;
      }

      const rankStocks = stocksByDate[rankDate] || [];
      const todayRets = stockRetByDate[tradeDate] || {};

      // Collect candidates with *today's* return available
      const longCandidates: {
        ticker: string;
        sector_etf: string;
        stockRet: number;
      }[] = [];
      const shortCandidates: {
        ticker: string;
        sector_etf: string;
        stockRet: number;
      }[] = [];

      // Long side: best 5 per sector by last week's return
      config.long.forEach((sector) => {
        const sorted = rankStocks
          .filter((s: any) => s.sector_etf === sector && isFinite(s.ret))
          .sort((a: any, b: any) => b.ret - a.ret)
          .slice(0, 5);

        sorted.forEach((s: any) => {
          const rToday = todayRets[s.stock_ticker];
          if (rToday != null && isFinite(rToday)) {
            longCandidates.push({
              ticker: s.stock_ticker,
              sector_etf: s.sector_etf,
              stockRet: rToday,
            });
          }
        });
      });

      // Short side: worst 5 per sector by last week's return
      config.short.forEach((sector) => {
        const sorted = rankStocks
          .filter((s: any) => s.sector_etf === sector && isFinite(s.ret))
          .sort((a: any, b: any) => a.ret - b.ret)
          .slice(0, 5);

        sorted.forEach((s: any) => {
          const rToday = todayRets[s.stock_ticker];
          if (rToday != null && isFinite(rToday)) {
            shortCandidates.push({
              ticker: s.stock_ticker,
              sector_etf: s.sector_etf,
              stockRet: rToday,
            });
          }
        });
      });

      const nL = longCandidates.length;
      const nS = shortCandidates.length;

      if (nL + nS === 0) {
        weeklyReturns.push(0);
        equityCurve.push({ date: tradeDate, equity, ret: 0 });
        continue;
      }

      const longWeight = nL > 0 ? 0.5 / nL : 0;
      const shortWeight = nS > 0 ? 0.5 / nS : 0;

      let weeklyRet = 0;

      const longPositions = longCandidates.map((c) => {
        const pnl = longWeight * c.stockRet;
        weeklyRet += pnl;
        return {
          ...c,
          weight: longWeight,
          pnl,
        };
      });

      const shortPositions = shortCandidates.map((c) => {
        const weight = -shortWeight; // negative exposure
        const pnl = weight * c.stockRet;
        weeklyRet += pnl;
        return {
          ...c,
          weight,
          pnl,
        };
      });

      equity *= 1 + weeklyRet;

      weeklyReturns.push(weeklyRet);
      equityCurve.push({ date: tradeDate, equity, ret: weeklyRet });

      tradesByDate[tradeDate] = {
        date: tradeDate,
        regime,
        weeklyRet,
        longs: longPositions,
        shorts: shortPositions,
      };
    }

    if (equityCurve.length === 0) {
      alert("No valid weeks after applying 2015+ cutoff.");
      setBacktest(null);
      return;
    }

    // -------- Stats --------
    const totalReturn = equity / initialCapital - 1;
    const n = weeklyReturns.length;

    const cagr = Math.pow(1 + totalReturn, 52 / n) - 1;

    const mean =
      weeklyReturns.reduce((a, b) => a + b, 0) / (n || 1);
    const variance =
      weeklyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) /
      (n > 1 ? n - 1 : 1);
    const volWeekly = Math.sqrt(variance);
    const volAnnual = volWeekly * Math.sqrt(52);
    const sharpe = volAnnual ? cagr / volAnnual : 0;

    let peak = initialCapital;
    let maxDD = 0;
    for (const pt of equityCurve) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = (pt.equity - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }

    const winRate =
      weeklyReturns.filter((r) => r > 0).length / (weeklyReturns.length || 1);

    // Yearly returns
    const yearlyMap: Record<string, number> = {};
    equityCurve.forEach((pt, idx) => {
      const year = new Date(pt.date).getFullYear().toString();
      if (!yearlyMap[year]) yearlyMap[year] = 1;
      yearlyMap[year] *= 1 + weeklyReturns[idx];
    });

    const yearlyReturns = Object.entries(yearlyMap)
      .map(([year, cum]) => ({
        year,
        ret: cum - 1,
      }))
      .sort((a, b) => Number(a.year) - Number(b.year));

    const tradeDates = Object.keys(tradesByDate).sort();

    setBacktest({
      equityCurve,
      stats: {
        startDate: equityCurve[0]?.date,
        endDate: equityCurve[equityCurve.length - 1]?.date,
        finalValue: equity,
        cagr,
        volAnnual,
        sharpe,
        maxDD,
        winRate,
      },
      yearlyReturns,
      tradesByDate,
      tradeDates,
    });

    setSelectedTradeDate(tradeDates[tradeDates.length - 1] || "");
    setActiveTab("backtest");
  };

  // -------------------- RENDER --------------------

  const selectedDetails =
    backtest && selectedTradeDate
      ? backtest.tradesByDate[selectedTradeDate]
      : null;

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">ML Macro Regime Classifier</h1>
        <p className="text-gray-600">
          Upload your macro features, sector & stock returns, and backtest a
          regime-aware sector/stock strategy.
        </p>
      </div>

      {/* Step 1: Upload macro features */}
      <Card className="border-2 border-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Step 1: Upload Macro Features
          </CardTitle>
          <CardDescription>
            Upload <strong>FE571_cleaned_zscored_features.csv</strong> (21
            z-scored features).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {dataStats && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-semibold">Macro Data Loaded</span>
              </div>
              <div className="text-sm space-y-1">
                <div>
                  📊 Total Rows: <strong>{dataStats.totalRows}</strong>
                </div>
                <div>
                  📅 Date Column: <strong>{dataStats.dateColumn}</strong>
                </div>
                <div>
                  📅 Date Range: <strong>{dataStats.dateRange}</strong>
                </div>
                <div>
                  ✅ Features Available:{" "}
                  <strong>
                    {dataStats.availableFeatures}/{expectedFeatures.length}
                  </strong>
                </div>
                {dataStats.missingFeatures.length > 0 && (
                  <div className="text-red-600 text-xs">
                    ⚠️ Missing: {dataStats.missingFeatures.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "error" && (
            <Alert>
              <AlertDescription className="text-red-700">
                <strong>Error:</strong> Check that your macro CSV has a valid
                date column and all 21 z-scored features.
              </AlertDescription>
            </Alert>
          )}

          {step === "ready" && (
            <Alert>
              <AlertDescription className="text-green-700">
                <strong>Ready!</strong> Data processed with{" "}
                {processedData?.length ?? 0} rows. Regime labels applied.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Feature groups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Your 21 Features Across 7 Categories
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(featureGroups).map(([category, features]) => (
              <div key={category} className="p-3 border rounded-lg bg-gray-50">
                <div className="font-semibold text-sm mb-2 text-blue-700">
                  {category}
                </div>
                <div className="space-y-1">
                  {features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          dataStats?.headers?.includes(f)
                            ? "text-green-600"
                            : "text-gray-400"
                        }
                      >
                        {dataStats?.headers?.includes(f) ? "✓" : "○"}
                      </span>
                      <span className="font-mono">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Regime definitions */}
      {step !== "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Rule-Based Regime Labels
            </CardTitle>
            <CardDescription>
              Automatic classification using core indicators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-3">
              {Object.values(regimes).map((r, i) => (
                <div
                  key={i}
                  className="p-3 border-2 rounded"
                  style={{ borderColor: r.color }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: r.color }}
                    />
                    <div className="font-bold text-sm">{r.name}</div>
                  </div>
                  <div className="text-xs font-mono bg-gray-100 p-2 rounded mt-2">
                    {r.criteria}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Train model */}
      {step === "ready" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Train Model</CardTitle>
            <CardDescription>
              Train Random Forest on 2005–2015, test on 2016–2025.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={handleTrain}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Play className="w-4 h-4" />
              Train Random Forest (100 trees, 21 features)
            </button>
          </CardContent>
        </Card>
      )}

      {step === "training" && (
        <Alert>
          <AlertDescription>
            Training Random Forest on your data...
          </AlertDescription>
        </Alert>
      )}

      {/* After model trained */}
      {results && (
        <>
          <Alert>
            <AlertDescription className="font-semibold text-green-700">
              ✓ Model Trained Successfully! Training Accuracy:{" "}
              {results.accuracy}%
            </AlertDescription>
          </Alert>

          {/* STEP 3 UPLOAD: sector + stock files */}
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Upload Sector & Stock Returns</CardTitle>
              <CardDescription>
                Weekly sector returns + sector constituent weekly returns (same
                date frequency as macro data).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="font-semibold text-sm">
                  sector_weekly_returns_new.csv
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleSectorWeeklyUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <div className="text-xs text-gray-600 space-y-1">
                  <div>
                    Rows:{" "}
                    <strong>{sectorData ? sectorData.length : 0}</strong>
                  </div>
                  <div>
                    Sectors: <strong>{SECTOR_TICKERS.length}</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-semibold text-sm">
                  sector_constituent_returns_new2.csv
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleStockReturnsUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <div className="text-xs text-gray-600 space-y-1">
                  <div>
                    Rows: <strong>{stockData ? stockData.length : 0}</strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 border-b mt-4">
            {["overview", "importance", "test", "backtest"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 font-medium ${
                  activeTab === tab
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-600"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && (
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Training Performance (2005–2015)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-4 bg-blue-50 rounded">
                    <div className="text-sm text-gray-600">Overall Accuracy</div>
                    <div className="text-3xl font-bold text-blue-600">
                      {results.accuracy}%
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mb-2">
                    Per-Regime Performance:
                  </div>
                  {results.regimeAccuracy.map((r: any, i: number) => (
                    <div
                      key={i}
                      className="flex justify-between items-center p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: regimes[i].color }}
                        />
                        <span className="text-sm">{r.regime}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-xs text-gray-500">
                          n={r.count}
                        </span>
                        <span className="font-semibold">{r.accuracy}%</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Regime Distribution (Training)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={results.regimeAccuracy}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="regime" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count">
                        {results.regimeAccuracy.map((_: any, i: number) => (
                          <Cell key={i} fill={regimes[i].color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Importance tab */}
          {activeTab === "importance" && (
            <Card>
              <CardHeader>
                <CardTitle>Feature Importance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={550}>
                  <BarChart data={model.importance} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="feature"
                      type="category"
                      width={150}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip />
                    <Bar dataKey="importance" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Test tab */}
          {activeTab === "test" && model.testPredictions && (
            <Card>
              <CardHeader>
                <CardTitle>Out-of-Sample Predictions (2016–2025)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={model.testPredictions}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={false}
                      label={{
                        value: "Time",
                        position: "insideBottom",
                        offset: -5,
                      }}
                    />
                    <YAxis
                      label={{
                        value: "Probability (%)",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="p0"
                      stroke={regimes[0].color}
                      name="Goldilocks"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p1"
                      stroke={regimes[1].color}
                      name="Slowdown"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p2"
                      stroke={regimes[2].color}
                      name="Stagflation"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p3"
                      stroke={regimes[3].color}
                      name="Overheating"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div className="overflow-x-auto">
                  <div className="text-sm font-semibold mb-2">
                    Latest 24 Months:
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Regime</th>
                        <th className="text-right p-2">Gold %</th>
                        <th className="text-right p-2">Slow %</th>
                        <th className="text-right p-2">Stag %</th>
                        <th className="text-right p-2">Over %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.testPredictions
                        .slice(-24)
                        .map((r: any, i: number) => (
                          <tr
                            key={i}
                            className="border-b hover:bg-gray-50"
                          >
                            <td className="p-2 font-mono text-xs">
                              {r.date}
                            </td>
                            <td className="p-2">
                              <span
                                className="px-2 py-1 rounded text-white text-xs font-medium"
                                style={{
                                  backgroundColor:
                                    regimes[r.predicted].color,
                                }}
                              >
                                {regimes[r.predicted].name}
                              </span>
                            </td>
                            <td className="text-right p-2">{r.p0}%</td>
                            <td className="text-right p-2">{r.p1}%</td>
                            <td className="text-right p-2">{r.p2}%</td>
                            <td className="text-right p-2">{r.p3}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Backtest tab */}
          {activeTab === "backtest" && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle>Regime-Aware Sector/Stock Backtest</CardTitle>
                  <CardDescription>
                    Weekly rebalance, 5 stocks per sector, equal weight across
                    all stocks, 1,000,000 initial capital (dollar-neutral
                    long/short). Backtest from <strong>Jan-2015</strong> to{" "}
                    <strong>2025</strong>.
                  </CardDescription>
                </div>
                <button
                  onClick={runBacktest}
                  disabled={!sectorData || !stockData}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    sectorData && stockData
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Run Backtest
                </button>
              </CardHeader>
              <CardContent className="space-y-6">
                {!sectorData || !stockData ? (
                  <div className="text-sm text-red-600">
                    ⚠️ Please upload both{" "}
                    <strong>sector_weekly_returns_new.csv</strong> and your
                    cleaned{" "}
                    <strong>sector_constituent_returns_new2.csv</strong> file
                    before running the backtest.
                  </div>
                ) : !backtest ? (
                  <div className="text-sm text-gray-600">
                    Click <strong>Run Backtest</strong> to compute the portfolio
                    equity curve.
                  </div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg space-y-1">
                        <div className="text-xs text-gray-500">CAGR</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {(backtest.stats.cagr * 100).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          {backtest.stats.startDate} →{" "}
                          {backtest.stats.endDate}
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg space-y-1">
                        <div className="text-xs text-gray-500">
                          Volatility (ann.)
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {(backtest.stats.volAnnual * 100).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          Sharpe: {backtest.stats.sharpe.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg space-y-1">
                        <div className="text-xs text-gray-500">
                          Max Drawdown / Win Rate
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {(backtest.stats.maxDD * 100).toFixed(1)}% /{" "}
                          {(backtest.stats.winRate * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          Final Value: $
                          {backtest.stats.finalValue.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Equity curve */}
                    <div className="h-[380px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={backtest.equityCurve}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tick={false}
                            label={{
                              value: "Time",
                              position: "insideBottom",
                              offset: -5,
                            }}
                          />
                          <YAxis
                            tickFormatter={(v) =>
                              (v / 1_000_000).toFixed(1) + "M"
                            }
                          />
                          <Tooltip
                            formatter={(value: any, name: any) => {
                              if (name === "equity") {
                                return [
                                  `$${Number(value).toLocaleString()}`,
                                  "Equity",
                                ];
                              }
                              if (name === "ret") {
                                return [
                                  (Number(value) * 100).toFixed(2) + "%",
                                  "Weekly Return",
                                ];
                              }
                              return [value, name];
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="equity"
                            name="Portfolio Value"
                            dot={false}
                            strokeWidth={2}
                            stroke="#2563eb"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Yearly returns */}
                    <div className="overflow-x-auto">
                      <div className="text-sm font-semibold mb-2">
                        Yearly Returns
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-2">Year</th>
                            <th className="text-right p-2">Return</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtest.yearlyReturns.map(
                            (y: any, idx: number) => (
                              <tr
                                key={idx}
                                className="border-b hover:bg-gray-50"
                              >
                                <td className="p-2">{y.year}</td>
                                <td className="p-2 text-right">
                                  {(y.ret * 100).toFixed(2)}%
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Weekly long/short breakdown */}
                    {backtest.tradeDates && backtest.tradeDates.length > 0 && (
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            Weekly Long / Short Breakdown
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-600">
                              Select week:
                            </span>
                            <select
                              value={selectedTradeDate}
                              onChange={(e) =>
                                setSelectedTradeDate(e.target.value)
                              }
                              className="border rounded px-2 py-1 text-sm"
                            >
                              {backtest.tradeDates.map((d: string) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {selectedDetails ? (
                          <div className="grid md:grid-cols-2 gap-6 text-sm">
                            {/* Longs */}
                            <div>
                              <div className="text-green-600 font-semibold mb-2">
                                Long Stocks
                              </div>
                              {selectedDetails.longs.length === 0 ? (
                                <div className="text-xs text-gray-500">
                                  No long positions this week.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs md:text-sm">
                                    <thead>
                                      <tr className="border-b bg-gray-50">
                                        <th className="text-left p-2">
                                          Ticker
                                        </th>
                                        <th className="text-left p-2">
                                          Sector ETF
                                        </th>
                                        <th className="text-right p-2">
                                          Stock Return
                                        </th>
                                        <th className="text-right p-2">
                                          Weight
                                        </th>
                                        <th className="text-right p-2">
                                          P&L Contrib
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedDetails.longs.map(
                                        (s: any, i: number) => (
                                          <tr
                                            key={i}
                                            className="border-b hover:bg-gray-50"
                                          >
                                            <td className="p-2 font-mono">
                                              {s.ticker}
                                            </td>
                                            <td className="p-2">
                                              {s.sector_etf}
                                            </td>
                                            <td className="p-2 text-right">
                                              {(s.stockRet * 100).toFixed(2)}%
                                            </td>
                                            <td className="p-2 text-right">
                                              {(s.weight * 100).toFixed(2)}%
                                            </td>
                                            <td className="p-2 text-right text-green-600">
                                              {(s.pnl * 100).toFixed(2)}%
                                            </td>
                                          </tr>
                                        )
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* Shorts */}
                            <div>
                              <div className="text-red-600 font-semibold mb-2">
                                Short Stocks
                              </div>
                              {selectedDetails.shorts.length === 0 ? (
                                <div className="text-xs text-gray-500">
                                  No short positions this week.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs md:text-sm">
                                    <thead>
                                      <tr className="border-b bg-gray-50">
                                        <th className="text-left p-2">
                                          Ticker
                                        </th>
                                        <th className="text-left p-2">
                                          Sector ETF
                                        </th>
                                        <th className="text-right p-2">
                                          Stock Return
                                        </th>
                                        <th className="text-right p-2">
                                          Weight
                                        </th>
                                        <th className="text-right p-2">
                                          P&L Contrib
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedDetails.shorts.map(
                                        (s: any, i: number) => (
                                          <tr
                                            key={i}
                                            className="border-b hover:bg-gray-50"
                                          >
                                            <td className="p-2 font-mono">
                                              {s.ticker}
                                            </td>
                                            <td className="p-2">
                                              {s.sector_etf}
                                            </td>
                                            <td className="p-2 text-right">
                                              {(s.stockRet * 100).toFixed(2)}%
                                            </td>
                                            <td className="p-2 text-right">
                                              {(s.weight * 100).toFixed(2)}%
                                            </td>
                                            <td className="p-2 text-right text-green-600">
                                              {(s.pnl * 100).toFixed(2)}%
                                            </td>
                                          </tr>
                                        )
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            No trade data available for the selected week.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default MacroRegimeClassifier;
