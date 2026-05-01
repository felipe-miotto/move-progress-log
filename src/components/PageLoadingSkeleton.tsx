/**
 * PageLoadingSkeleton - Estado de carregamento elegante e premium
 * Substitui "Carregando página..." por animação sofisticada
 */

import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface PageLoadingSkeletonProps {
  /**
   * Tipo de layout da página sendo carregada
   */
  layout?: "dashboard" | "list" | "detail" | "form";
  
  /**
   * Mostrar spinner animado
   */
  showSpinner?: boolean;
}

export const PageLoadingSkeleton = ({ 
  layout = "list",
  showSpinner = true 
}: PageLoadingSkeletonProps) => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6 animate-fade-in">
        {/* Header Skeleton */}
        <div className="space-y-2 pb-4 border-b border-border">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Content based on layout */}
        {layout === "dashboard" && (
          <>
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Skeleton className="h-32 w-full rounded-lg" />
                </motion.div>
              ))}
            </div>
            
            {/* Cards Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                >
                  <Skeleton className="h-64 w-full rounded-lg" />
                </motion.div>
              ))}
            </div>
          </>
        )}

        {layout === "list" && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Skeleton className="h-40 w-full rounded-lg" />
              </motion.div>
            ))}
          </div>
        )}

        {layout === "detail" && (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Skeleton className="h-48 w-full rounded-lg" />
            </motion.div>
            
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <Skeleton className="h-32 w-full rounded-lg" />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {layout === "form" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-2xl mx-auto space-y-6"
          >
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-12 w-32 rounded-lg" />
          </motion.div>
        )}

        {/* Spinner central elegante */}
        {showSpinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground font-medium" aria-hidden="true">
                Carregando...
              </p>
              <span className="sr-only">Carregando página</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
