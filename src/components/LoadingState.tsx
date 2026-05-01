/**
 * LoadingState - Componente unificado de carregamento
 * Usa tokens de spacing, opacity e animation consistentes
 */

import { Loader2, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /**
   * Texto de carregamento (opcional)
   */
  text?: string;
  /**
   * Tamanho do spinner
   * @default "default"
   */
  size?: "sm" | "default" | "lg";
  /**
   * Ícone customizado (opcional)
   */
  icon?: LucideIcon;
  /**
   * Classes CSS adicionais
   */
  className?: string;
  /**
   * Centralizar verticalmente na tela
   * @default false
   */
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: "h-4 w-4",
  default: "h-8 w-8",
  lg: "h-12 w-12",
};

const textSizeClasses = {
  sm: "text-sm",
  default: "text-base",
  lg: "text-lg",
};

export const LoadingState = ({
  text = "Carregando...",
  size = "default",
  icon: Icon = Loader2,
  className,
  fullScreen = false,
}: LoadingStateProps) => {
  const content = (
    <div
      className={cn("flex flex-col items-center justify-center gap-md", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Icon 
        className={cn(
          "animate-spin text-primary",
          sizeClasses[size]
        )} 
        aria-hidden="true"
      />
      {text && (
        <p className={cn(
          "text-muted-foreground font-medium",
          textSizeClasses[size]
        )}>
          {text}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center p-xl" aria-busy="true">
        {content}
      </div>
    );
  }

  return content;
};
