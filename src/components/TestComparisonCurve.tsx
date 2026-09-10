import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

interface TestComparisonCurveProps {
  productionQuantiles: number[]; // 100 buckets
}

export const TestComparisonCurve: React.FC<TestComparisonCurveProps> = ({ productionQuantiles }) => {
  const [trueQuantiles, setTrueQuantiles] = useState<number[] | null>(null);

  useEffect(() => {
    // Load the 5000 samples JSON if it exists
    fetch('/data/hob_play_tcgplayer_5000.json')
      .then(res => res.json())
      .then((data: number[]) => {
        if (Array.isArray(data) && data.length > 0) {
          // Convert 5000 to 100 quantiles
          const bucketSize = Math.max(1, Math.floor(data.length / 100));
          const generatedQuantiles = [];
          for (let i = 0; i < 100; i++) {
            let sum = 0;
            let count = 0;
            for (let j = i * bucketSize; j < (i + 1) * bucketSize && j < data.length; j++) {
              sum += data[j];
              count++;
            }
            generatedQuantiles.push(Number((sum / count).toFixed(2)));
          }
          setTrueQuantiles(generatedQuantiles);
        }
      })
      .catch(err => {
        console.error("Failed to load test JSON. Please make sure hob_play_tcgplayer_5000.json is in public/data/", err);
      });
  }, []);

  const chartData = [];
  for (let i = 0; i < 100; i++) {
    chartData.push({
      percentile: \`\${i + 1}%\`,
      production: productionQuantiles[i] || 0,
      trueMonteCarlo: trueQuantiles ? trueQuantiles[i] : undefined,
    });
  }

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 mt-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800 mb-4">Monte Carlo Accuracy Test</h3>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="percentile" minTickGap={20} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => \`$\${val}\`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.5rem' }}
              itemStyle={{ fontSize: 12, fontWeight: 500 }}
              labelStyle={{ fontSize: 12, fontWeight: 700, marginBottom: '0.25rem', color: '#94a3b8' }}
              formatter={(value: number) => [\`$\${value.toFixed(2)}\`, '']}
            />
            <Line
              type="monotone"
              dataKey="production"
              name="Production (Current)"
              stroke="#ef4444"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
            />
            {trueQuantiles && (
              <Line
                type="monotone"
                dataKey="trueMonteCarlo"
                name="True 5000 Monte Carlo"
                stroke="#10b981"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
