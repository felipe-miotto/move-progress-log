import { LoadingState } from "@/components/LoadingState";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export const LoadingSpinner = ({ 
  size = "md", 
  text = "Carregando...",
  className 
}: LoadingSpinnerProps) => {
  const loadingStateSize = size === "md" ? "default" : size;

  return (
    <LoadingState
      size={loadingStateSize}
      text={text}
      className={cn("py-12", className)}
    />
  );
};
