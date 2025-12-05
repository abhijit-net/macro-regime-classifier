"use client";
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Cell
} from 'recharts';
import { Upload, Play, Info, Activity, CheckCircle } from 'lucide-react';

const MacroRegimeClassifier = () => {
  const [step, setStep] = useState<'upload' | 'ready' | 'training' | 'results' | 'error'>('upload');
  const [rawData, setRawData] = useState<any[] | null>(null);
  const [processedData, setProcessedData] = useState<any[] | null>(null);
  const [model, setModel] = useState<any | null>(null);
  const [results, setResults] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'importance' | 'test'>('overview');
  const [dataStats, setDataStats] = useState<any | null>(null);

  const regimes: Record<number, { name: string; color: string; criteria: string }> = {
    0: { name: 'Goldilocks', color: '#10b981', criteria: 'R≥0.5, V≤0, G≥0, -0.5≤I≤0.75' },
    1: { name: 'Slowdown', color: '#ef4444', criteria: 'R≤-0.5, G≤0, V≥0' },
    2: { name: 'Stagflation', color: '#f59e0b', criteria: 'G≤0, I≥0.75, V≥0' },
    3: { name: 'Overheating', color: '#8b5cf6', criteria: 'R≥0.5, V≤-0.5, Optimism High' }
  };

  // Your actual feature columns (must match CSV)
  const expectedFeatures = [
    'spx_ret_1w_z',
    'spx_ret_3w_z',
    'spx_ret_6w_z',
    'vix_z',
    'rv_3w_z',
    'vix_ts_z',
    'vvix_z',
    'hy_ret_3w_z',
    'slope_2s10s_z',
    'pmi_z',
    'pmi_chg_3w_z',
    'breakeven10_z',
    'breakeven_chg_3w_z',
    'cpi_yoy_z',
    'ip_yoy_z',
    'unemp_z',
    'aaii_spread_z',
    'cg_ratio_z',
    'oil_ret_3w_z',
    'gold_ret_3w_z',
    'capex_ret_6w_z'
  ];

  const featureGroups: Record<string, string[]> = {
    'Market Returns & Momentum': ['spx_ret_1w_z', 'spx_ret_3w_z', 'spx_ret_6w_z'],
    'Volatility & Risk': ['vix_z', 'rv_3w_z', 'vix_ts_z', 'vvix_z'],
    'Credit & Rates': ['hy_ret_3w_z', 'slope_2s10s_z'],
    'Growth Indicators': ['pmi_z', 'pmi_chg_3w_z', 'ip_yoy_z', 'unemp_z'],
    'Inflation': ['breakeven10_z', 'breakeven_chg_3w_z', 'cpi_yoy_z'],
    'Sentiment': ['aaii_spread_z'],
    'Commodities & Cross-Asset': ['cg_ratio_z', 'oil_ret_3w_z', 'gold_ret_3w_z', 'capex_ret_6w_z']
  };

  // -------- CSV PARSER --------
  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',');
      const row: any = {};
      headers.forEach((header, idx) => {
        const raw = values[idx]?.trim();
        if (raw === undefined || raw === '') {
          row[header] = null;
        } else if (!isNaN(Number(raw)) && header !== 'date') {
          row[header] = parseFloat(raw);
        } else {
          row[header] = raw;
        }
      });
      data.push(row);
    }

    return { headers, data };
  };

  // -------- RULE-BASED LABELS --------
  const labelRegimes = (data: any[]) => {
    return data.map(row => {
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
      else if (R_z >= 0.5 && V_z <= 0 && G_z >= 0 && I_z >= -0.5 && I_z <= 0.75) {
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

  // -------- FILE UPLOAD --------
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { headers, data } = parseCSV(text);

    const dateCol =
      headers.find(h => h.toLowerCase().includes('date')) ||
      headers.find(h => ['month', 'time', 'yyyymm'].includes(h.toLowerCase()));

    const missingFeatures = expectedFeatures.filter(f => !headers.includes(f));
    const availableFeatures = expectedFeatures.filter(f => headers.includes(f));

    // Compute date range using actual dates
    let dateRange = 'N/A';
    if (dateCol) {
      const sorted = [...data].sort(
        (a, b) => new Date(a[dateCol]).getTime() - new Date(b[dateCol]).getTime()
      );
      if (sorted.length > 0) {
        dateRange = `${sorted[0][dateCol]} to ${sorted[sorted.length - 1][dateCol]}`;
      }
    }

    const stats = {
      totalRows: data.length,
      dateColumn: dateCol,
      dateRange,
      availableFeatures: availableFeatures.length,
      missingFeatures,
      headers
    };

    setRawData(data);
    setDataStats(stats);

    if (!dateCol) {
      setStep('error');
      return;
    }

    if (missingFeatures.length === 0) {
      const labeled = labelRegimes(data);
      setProcessedData(labeled);
      setStep('ready');
    } else {
      setStep('error');
    }
  };

  // -------- RANDOM FOREST IMPLEMENTATION --------
  const calcGini = (data: any[], target: string) => {
    const counts = [0, 0, 0, 0];
    data.forEach(d => counts[d[target]]++);
    let gini = 1;
    counts.forEach(c => {
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
      data.forEach(d => counts[d[target]]++);
      const prediction = counts.indexOf(Math.max(...counts));
      return { leaf: true, prediction };
    }

    const numFeatures = Math.max(1, Math.floor(Math.sqrt(features.length)));
    const selected = [...features].sort(() => 0.5 - Math.random()).slice(0, numFeatures);

    let bestFeature = selected[0];
    let bestThreshold = 0;
    let bestGini = Infinity;

    selected.forEach(feature => {
      const values = data
        .map(d => d[feature])
        .filter((v: number) => v != null && !isNaN(v))
        .sort((a: number, b: number) => a - b);
      if (values.length === 0) return;

      [0.25, 0.5, 0.75].forEach(pct => {
        const threshold = values[Math.floor(values.length * pct)];
        const left = data.filter(d => d[feature] != null && d[feature] <= threshold);
        const right = data.filter(d => d[feature] != null && d[feature] > threshold);

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

    const left = data.filter(d => d[bestFeature] != null && d[bestFeature] <= bestThreshold);
    const right = data.filter(d => d[bestFeature] != null && d[bestFeature] > bestThreshold);

    if (left.length === 0 || right.length === 0) {
      const counts = [0, 0, 0, 0];
      data.forEach(d => counts[d[target]]++);
      const prediction = counts.indexOf(Math.max(...counts));
      return { leaf: true, prediction };
    }

    return {
      leaf: false,
      feature: bestFeature,
      threshold: bestThreshold,
      left: trainDecisionTree(left, features, target, depth + 1, maxDepth),
      right: trainDecisionTree(right, features, target, depth + 1, maxDepth)
    };
  };

  const trainRandomForest = (data: any[], features: string[], target: string, numTrees = 100) => {
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
    return val <= tree.threshold ? predictTree(tree.left, sample) : predictTree(tree.right, sample);
  };

  const predictRF = (trees: any[], sample: any) => {
    const probs = [0, 0, 0, 0];
    trees.forEach(tree => {
      const cls = predictTree(tree, sample);
      probs[cls]++;
    });
    return probs.map(p => p / trees.length);
  };

  const calcImportance = (trees: any[], features: string[]) => {
    const imp: Record<string, number> = {};
    features.forEach(f => (imp[f] = 0));

    const traverse = (tree: any, depth = 0) => {
      if (!tree.leaf) {
        imp[tree.feature] += 1 / (depth + 1);
        traverse(tree.left, depth + 1);
        traverse(tree.right, depth + 1);
      }
    };

    trees.forEach(tree => traverse(tree));
    const total = Object.values(imp).reduce((a, b) => a + b, 0) || 1;

    return Object.entries(imp)
      .map(([feature, score]) => ({
        feature,
        importance: parseFloat(((score / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.importance - a.importance);
  };

  // -------- TRAIN MODEL (WITH FIXED 2005–2015 vs 2016–2025 SPLIT) --------
  const handleTrain = () => {
    if (!processedData || !dataStats?.dateColumn) return;
    setStep('training');

    setTimeout(() => {
      const dateCol = dataStats.dateColumn;

      // fixed split: 2005–2015 train, 2016–2025 test
      const trainingData = processedData.filter(row => {
        const year = new Date(row[dateCol]).getFullYear();
        return year >= 2005 && year <= 2015;
      });

      const testingData = processedData.filter(row => {
        const year = new Date(row[dateCol]).getFullYear();
        return year >= 2016;
      });

      if (trainingData.length === 0) {
        console.error('No training data in 2005–2015 range.');
        setStep('error');
        return;
      }

      const trees = trainRandomForest(trainingData, expectedFeatures, 'regime', 100);

      const trainPreds = trainingData.map(s => {
        const probs = predictRF(trees, s);
        const predicted = probs.indexOf(Math.max(...probs));
        return {
          date: s[dateCol],
          actual: s.regime,
          predicted,
          probs
        };
      });

      const correct = trainPreds.filter(p => p.actual === p.predicted).length;
      const trainAcc =
        trainPreds.length > 0 ? ((correct / trainPreds.length) * 100).toFixed(1) : '0.0';

      const regimeAcc = [0, 1, 2, 3].map(r => {
        const rData = trainPreds.filter(p => p.actual === r);
        const rCorrect = rData.filter(p => p.predicted === r).length;
        const acc = rData.length > 0 ? ((rCorrect / rData.length) * 100).toFixed(1) : '0.0';
        return {
          regime: regimes[r].name,
          accuracy: acc,
          count: rData.length
        };
      });

      const testPreds = testingData.map(s => {
        const probs = predictRF(trees, s);
        const predicted = probs.indexOf(Math.max(...probs));
        return {
          date: s[dateCol],
          predicted,
          p0: parseFloat((probs[0] * 100).toFixed(1)),
          p1: parseFloat((probs[1] * 100).toFixed(1)),
          p2: parseFloat((probs[2] * 100).toFixed(1)),
          p3: parseFloat((probs[3] * 100).toFixed(1))
        };
      });

      const importance = calcImportance(trees, expectedFeatures);

      setModel({ trees, importance, testPredictions: testPreds });
      setResults({ predictions: trainPreds, accuracy: trainAcc, regimeAccuracy: regimeAcc });
      setStep('results');
    }, 500);
  };

  // -------- RENDER --------
  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">ML Macro Regime Classifier</h1>
        <p className="text-gray-600">Upload your FE571_cleaned_zscored_features.csv file</p>
      </div>

      {/* File Upload */}
      <Card className="border-2 border-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Step 1: Upload Data
          </CardTitle>
          <CardDescription>Upload FE571_cleaned_zscored_features.csv with 21 z-scored features</CardDescription>
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
                <span className="font-semibold">Data Loaded Successfully!</span>
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
                  ✅ Features Available:{' '}
                  <strong>
                    {dataStats.availableFeatures}/{expectedFeatures.length}
                  </strong>
                </div>
                {dataStats.missingFeatures.length > 0 && (
                  <div className="text-red-600 text-xs">
                    ⚠️ Missing: {dataStats.missingFeatures.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'error' && (
            <Alert>
              <AlertDescription className="text-red-700">
                <strong>Error:</strong> Check that your CSV has a valid date column and all 21 z-scored
                features.
              </AlertDescription>
            </Alert>
          )}

          {step === 'ready' && (
            <Alert>
              <AlertDescription className="text-green-700">
                <strong>Ready!</strong> Data processed with {processedData?.length ?? 0} rows. Regime labels
                applied.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Feature Groups */}
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
                <div className="font-semibold text-sm mb-2 text-blue-700">{category}</div>
                <div className="space-y-1">
                  {features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          dataStats?.headers?.includes(f) ? 'text-green-600' : 'text-gray-400'
                        }
                      >
                        {dataStats?.headers?.includes(f) ? '✓' : '○'}
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

      {/* Regime Definitions */}
      {step !== 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Rule-Based Regime Labels
            </CardTitle>
            <CardDescription>Automatic classification using core indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-3">
              {Object.values(regimes).map((r, i) => (
                <div key={i} className="p-3 border-2 rounded" style={{ borderColor: r.color }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: r.color }} />
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

      {/* Train Button */}
      {step === 'ready' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Train Model</CardTitle>
            <CardDescription>Train on 2005–2015, test on 2016–2025</CardDescription>
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

      {step === 'training' && (
        <Alert>
          <AlertDescription>Training Random Forest on your data...</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {results && (
        <>
          <Alert>
            <AlertDescription className="font-semibold text-green-700">
              ✓ Model Trained Successfully! Training Accuracy: {results.accuracy}%
            </AlertDescription>
          </Alert>

          <div className="flex gap-2 border-b">
            {['overview', 'importance', 'test'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 font-medium ${
                  activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Training Performance (2005–2015)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-4 bg-blue-50 rounded">
                    <div className="text-sm text-gray-600">Overall Accuracy</div>
                    <div className="text-3xl font-bold text-blue-600">{results.accuracy}%</div>
                  </div>
                  <div className="text-xs text-gray-600 mb-2">Per-Regime Performance:</div>
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
                        <span className="text-xs text-gray-500">n={r.count}</span>
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

          {/* Importance Tab */}
          {activeTab === 'importance' && (
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

          {/* Test Tab */}
          {activeTab === 'test' && model.testPredictions && (
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
                      label={{ value: 'Time', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis label={{ value: 'Probability (%)', angle: -90, position: 'insideLeft' }} />
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
                  <div className="text-sm font-semibold mb-2">Latest 24 Months:</div>
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
                      {model.testPredictions.slice(-24).map((r: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-xs">{r.date}</td>
                          <td className="p-2">
                            <span
                              className="px-2 py-1 rounded text-white text-xs font-medium"
                              style={{ backgroundColor: regimes[r.predicted].color }}
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
        </>
      )}
    </div>
  );
};

export default MacroRegimeClassifier;
