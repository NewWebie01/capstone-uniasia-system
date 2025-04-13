"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Label, Pie, PieChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Hardware-related sales data
const chartData = [
  { category: "Power Tools", sales: 340, fill: "var(--color-tools)" },
  { category: "Hand Tools", sales: 270, fill: "var(--color-handtools)" },
  { category: "Paints", sales: 220, fill: "var(--color-paints)" },
  { category: "Plumbing", sales: 185, fill: "var(--color-plumbing)" },
  { category: "Electrical", sales: 195, fill: "var(--color-electrical)" },
];

const chartConfig = {
  sales: {
    label: "Sales",
  },
  tools: {
    label: "Power Tools",
    color: "hsl(var(--chart-1))",
  },
  handtools: {
    label: "Hand Tools",
    color: "hsl(var(--chart-2))",
  },
  paints: {
    label: "Paints",
    color: "hsl(var(--chart-3))",
  },
  plumbing: {
    label: "Plumbing",
    color: "hsl(var(--chart-4))",
  },
  electrical: {
    label: "Electrical",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

const Graphs = () => {
  const totalSales = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.sales, 0);
  }, []);

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Sales Breakdown - Hardware Categories</CardTitle>
        <CardDescription>October - March 2024</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="sales"
              nameKey="category"
              innerRadius={60}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {totalSales.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          Total Sales
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none">
          Trending up by 6.3% this quarter <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Hardware sales data from the last 6 months
        </div>
      </CardFooter>
    </Card>
  );
};

export default Graphs;
