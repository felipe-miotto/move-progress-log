import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { SkipToContent } from "@/components/SkipToContent";
import { TrainingProvider } from "@/contexts/TrainingContext";
import { lazy, Suspense } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { AuthDebugPanel } from "@/components/AuthDebugPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isAuthDebugEnabled } from "@/utils/authDebug";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ROUTES } from "@/constants/navigation";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";

// AUD-009: Code splitting por rota para reduzir bundle size inicial
const Index = lazy(() => import("./pages/Index"));
const StudentsPage = lazy(() => import("./pages/StudentsPage"));
const StudentDetailPage = lazy(() => import("./pages/StudentDetailPage"));
const StudentsComparisonPage = lazy(() => import("./pages/StudentsComparisonPage"));
const SessionsPage = lazy(() => import("./pages/SessionsPage"));
const ExercisesLibraryPage = lazy(() => import("./pages/ExercisesLibraryPage"));
const PrescriptionsPage = lazy(() => import("./pages/PrescriptionsPage"));
const RecoveryProtocolsPage = lazy(() => import("./pages/RecoveryProtocolsPage"));
const AdminDiagnosticsPage = lazy(() => import("./pages/AdminDiagnosticsPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const ExerciseReviewPage = lazy(() => import("./pages/ExerciseReviewPage"));
const StudentReportsPage = lazy(() => import("./pages/StudentReportsPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const StudentOnboardingPage = lazy(() => import("./pages/StudentOnboardingPage"));
const OnboardingSuccessPage = lazy(() => import("./pages/OnboardingSuccessPage"));
const OuraErrorPage = lazy(() => import("./pages/OuraErrorPage"));
const OuraConnectPage = lazy(() => import("./pages/OuraConnectPage"));
const PrecisionQuestionnairePage = lazy(() => import("./pages/PrecisionQuestionnairePage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const AIBuilderPage = lazy(() => import("./features/ai-builder/AIBuilderPage"));
const AthleteInsightsDashboard = lazy(() => import("./pages/AthleteInsightsDashboard"));
const CoachConsole = lazy(() => import("./pages/CoachConsole"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,       // 1 minuto
      retry: 1,                 // 1 retry em vez de 3 (padrão)
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  const showAuthDebug = isAuthDebugEnabled();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <TrainingProvider>
              <SkipToContent />
              <Toaster />
              <Sonner />
              {showAuthDebug && <AuthDebugPanel />}
            <BrowserRouter>
              <GlobalSearch />
              <Suspense fallback={<LoadingSpinner size="lg" text="Carregando página..." />}>
                <Routes>
                  {/* Public routes without sidebar */}
                  <Route path={ROUTES.auth} element={<AuthPage />} />
                  <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
                  <Route path="/onboarding/:token" element={<StudentOnboardingPage />} />
                  <Route path={ROUTES.onboardingSuccess} element={<OnboardingSuccessPage />} />
                  <Route path={ROUTES.ouraError} element={<OuraErrorPage />} />
                  <Route path="/oura-connect/:token" element={<OuraConnectPage />} />
                  <Route path="/precision-questionnaire/:token" element={<PrecisionQuestionnairePage />} />
                  <Route path={ROUTES.terms} element={<LegalPage variant="terms" />} />
                  <Route path={ROUTES.privacy} element={<LegalPage variant="privacy" />} />
                  <Route path={ROUTES.ouraConsent} element={<LegalPage variant="ouraConsent" />} />
                  
                  {/* Protected routes with sidebar */}
                  <Route path="/*" element={
                    <ProtectedRoute>
                      <SidebarProvider>
                        <div className="flex min-h-screen w-full">
                          <AppSidebar />
                          <div className="flex-1 flex flex-col">
                            <header className="h-14 flex items-center justify-between border-b border-border px-md sticky top-0 bg-background/95 z-50 backdrop-blur-md">
                              <SidebarTrigger aria-label="Abrir/Fechar menu lateral" />
                              <ThemeToggle />
                            </header>
                            <main className="flex-1">
                              <ErrorBoundary>
                                <Routes>
                                  <Route path="/" element={<Index />} />
                                  <Route path="/alunos" element={<StudentsPage />} />
                                  <Route path="/alunos/:id" element={<StudentDetailPage />} />
                                  <Route path="/alunos/:studentId/relatorios" element={<StudentReportsPage />} />
                                  <Route path="/alunos-comparacao" element={<StudentsComparisonPage />} />
                                  <Route path="/sessoes" element={<SessionsPage />} />
                                  <Route path="/exercicios" element={<ExercisesLibraryPage />} />
                                  <Route path="/prescricoes" element={<PrescriptionsPage />} />
                                  <Route path="/protocolos" element={<RecoveryProtocolsPage />} />
                                  <Route path="/admin/diagnostico-oura" element={<AdminRoute><AdminDiagnosticsPage /></AdminRoute>} />
                                  <Route path="/admin/usuarios" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
                                  <Route path={ROUTES.adminExerciseReview} element={<AdminRoute><ExerciseReviewPage /></AdminRoute>} />
                                  <Route path="/ai-builder" element={<AdminRoute><AIBuilderPage /></AdminRoute>} />
                                  <Route path="/athlete-insights" element={<AdminRoute><AthleteInsightsDashboard /></AdminRoute>} />
                                  <Route path="/coach-console" element={<AdminRoute><CoachConsole /></AdminRoute>} />
                                  <Route path="*" element={<NotFound />} />
                                </Routes>
                              </ErrorBoundary>
                            </main>
                          </div>
                        </div>
                      </SidebarProvider>
                    </ProtectedRoute>
                  } />
                </Routes>
              </Suspense>
            </BrowserRouter>
            </TrainingProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
