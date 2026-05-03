import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardTone = "default" | "success" | "warning" | "danger";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  gradient?: boolean;
  onClick?: () => void;
  progress?: number; // 0-100 percentage
  badge?: string;
  trend?: {
    value: number;
    label: string;
  };
  /**
   * Visual tone for thresholded KPIs. Affects the icon container background
   * and the value color. "default" keeps the existing neutral look.
   */
  tone?: StatCardTone;
}

const TONE_VALUE_CLASS: Record<StatCardTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const TONE_ICON_CLASS: Record<StatCardTone, string> = {
  default: "bg-secondary text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  subtitle,
  gradient,
  onClick,
  progress,
  badge,
  trend,
  tone = "default"
}: StatCardProps) => {
  return (
    <Card
      className={`animate-fade-in ${onClick ? 'card-interactive' : ''}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <CardHeader className="pb-sm p-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground leading-normal">{title}</CardTitle>
          <div className={cn("p-sm rounded-md", TONE_ICON_CLASS[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-md p-lg pt-0">
        <div className="flex items-baseline gap-xs">
          <div className={cn("text-4xl font-bold leading-tight", TONE_VALUE_CLASS[tone])}>
            {value}
          </div>
          {trend && (
            <div className={`flex items-center gap-xs text-xs font-semibold ${
              trend.value > 0 ? 'text-success' : trend.value < 0 ? 'text-destructive' : 'text-muted-foreground'
            }`}>
              {trend.value > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend.value < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              <span>{trend.label}</span>
            </div>
          )}
        </div>

        {subtitle && <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>}
        
        {progress !== undefined && (
          <div className="space-y-xs">
            <Progress value={progress} className="h-1.5" />
            <p className="text-sm text-muted-foreground">{progress.toFixed(0)}% da meta</p>
          </div>
        )}

        {badge && (
          <Badge variant="secondary" className="text-xs font-medium">
            {badge}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

export default StatCard;
