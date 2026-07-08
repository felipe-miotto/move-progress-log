import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Heart, Moon, Zap } from "lucide-react";
import { WhoopMetrics } from "@/hooks/useWhoopMetrics";
import { formatLocalDate } from "@/utils/dateUtils";

interface WhoopActivityCardProps {
  metrics: WhoopMetrics;
}

const recoveryColor = (score: number | null) => {
  if (score === null) return "text-muted-foreground";
  if (score >= 67) return "text-primary";
  if (score >= 34) return "text-secondary-foreground";
  return "text-destructive";
};

const formatTime = (seconds: number | null) => {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const WhoopActivityCard = ({ metrics }: WhoopActivityCardProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Whoop</CardTitle>
          </div>
          <Badge variant="outline">{formatLocalDate(metrics.date)}</Badge>
        </div>
        <CardDescription>Recuperação, esforço e sono</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Recovery</p>
              <p className={`text-lg font-semibold ${recoveryColor(metrics.recovery_score)}`}>
                {metrics.recovery_score ?? "—"}
                {metrics.recovery_score !== null ? "%" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Strain</p>
              <p className="text-lg font-semibold">{metrics.day_strain ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">HRV / FC repouso</p>
              <p className="text-sm font-medium">
                {metrics.hrv_rmssd ?? "—"} ms · {metrics.resting_heart_rate ?? "—"} bpm
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Sono</p>
              <p className="text-sm font-medium">
                {formatTime(metrics.total_sleep_duration)} · {metrics.sleep_performance ?? "—"}%
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
