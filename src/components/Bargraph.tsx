"use client";

import { TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

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

const chartData = [
  { month: "January", tools: 120, hardware: 90, paints: 60 },
  { month: "February", tools: 150, hardware: 110, paints: 70 },
  { month: "March", tools: 130, hardware: 85, paints: 95 },
  { month: "April", tools: 100, hardware: 120, paints: 80 },
  { month: "May", tools: 170, hardware: 95, paints: 105 },
  { month: "June", tools: 160, hardware: 100, paints: 110 },
];

const chartConfig = {
  tools: {
    label: "Tools",
    color: "hsl(var(--chart-1))",
  },
  hardware: {
    label: "Hardware",
    color: "hsl(var(--chart-2))",
  },
  paints: {
    label: "Paints",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

const Bargraph = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Sales Chart</CardTitle>
        <CardDescription>January - June 2024</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />
            <Bar dataKey="tools" fill="var(--color-tools)" radius={4} />
            <Bar dataKey="hardware" fill="var(--color-hardware)" radius={4} />
            <Bar dataKey="paints" fill="var(--color-paints)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Showing total sales by category for the last 6 months
        </div>
      </CardFooter>
    </Card>
  );
};

export default Bargraph;
