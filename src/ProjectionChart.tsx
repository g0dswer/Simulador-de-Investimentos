import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtBRL, mesesParaAnosMeses, ProjecaoDado } from "./lib/calculos";

/** Loaded only after a plan is requested, keeping the beginner form light. */
export default function ProjectionChart({
  data,
  target,
}: {
  data: ProjecaoDado[];
  target?: number;
}) {
  const lastMonth = data[data.length - 1]?.mes ?? 0;
  const compact = (value: number) =>
    `R$ ${new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 20, right: 14, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#28765c" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#28765c" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="#e5ebe5"
          strokeDasharray="4 5"
        />
        <XAxis
          dataKey="mes"
          type="number"
          domain={[0, Math.max(1, lastMonth)]}
          tickFormatter={(m) =>
            m === 0
              ? "Hoje"
              : `${Math.floor(m / 12)}a${m % 12 ? ` ${m % 12}m` : ""}`
          }
          tickCount={5}
          minTickGap={28}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#65756b", fontSize: 11 }}
        />
        <YAxis
          tickFormatter={compact}
          width={78}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#65756b", fontSize: 11 }}
        />
        <Tooltip
          formatter={(v: number) => fmtBRL(v)}
          labelFormatter={(m) =>
            Number(m) === 0 ? "Hoje" : mesesParaAnosMeses(Number(m))
          }
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #dce5dd",
            fontSize: 13,
          }}
        />
        {target !== undefined && (
          <ReferenceLine
            y={target}
            stroke="#94702e"
            strokeDasharray="5 5"
            ifOverflow="extendDomain"
            label={{
              value: "Sua meta",
              position: "insideTopRight",
              fill: "#7a591c",
              fontSize: 12,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="saldo"
          name="Total estimado"
          stroke="#28765c"
          strokeWidth={3}
          fill="url(#balance-fill)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="contribuicoesAcum"
          name="Dinheiro que você colocou"
          stroke="#83949e"
          strokeWidth={2}
          strokeDasharray="5 4"
          fill="transparent"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
