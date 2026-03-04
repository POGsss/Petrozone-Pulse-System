import type { ComponentType, SVGProps } from "react";

export interface StatCard {
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number | string;
}

interface StatsCardsProps {
  cards: StatCard[];
}

const colsMap: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};

export function StatsCards({ cards }: StatsCardsProps) {
  const cols = colsMap[cards.length] ?? "sm:grid-cols-3";

  return (
    <div className={`grid grid-cols-1 ${cols} gap-4`}>
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white border border-neutral-200 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 ${card.iconBg} rounded-lg`}>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <div>
              <p className="text-sm text-neutral-900">{card.label}</p>
              <p className="text-2xl font-bold text-neutral-950">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
