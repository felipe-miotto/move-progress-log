import type { LucideIcon } from "lucide-react";
import { Home, Users, ClipboardList, Library, FileText, Heart, UserCog, Shield, Bot, BarChart2, Brain } from "lucide-react";

/**
 * Constantes de navegação e nomenclaturas
 * Centralizadas para garantir consistência em toda a aplicação
 * Padrão: Sentence case, máx. 2-3 palavras, sem gerúndio
 */

/**
 * ROUTES - Fonte única de verdade para todas as rotas da aplicação
 * Type-safe, com funções para rotas dinâmicas
 */
export const ROUTES = {
  // Public routes
  auth: "/auth",
  resetPassword: "/reset-password",
  onboarding: (token: string) => `/onboarding/${token}`,
  onboardingSuccess: "/onboarding/success",
  ouraError: "/onboarding/oura-error",
  ouraConnect: (token: string) => `/oura-connect/${token}`,
  terms: "/termos",
  privacy: "/privacidade",
  ouraConsent: "/oura-consentimento",
  
  // Protected routes
  dashboard: "/",
  students: "/alunos",
  studentDetail: (id: string) => `/alunos/${id}`,
  studentReports: (id: string) => `/alunos/${id}/relatorios`,
  studentsComparison: "/alunos-comparacao",
  sessions: "/sessoes",
  exercises: "/exercicios",
  prescriptions: "/prescricoes",
  protocols: "/protocolos",
  
  // Admin routes
  adminUsers: "/admin/usuarios",
  adminDiagnostics: "/admin/diagnostico-oura",
  aiBuilder: "/ai-builder",
  athleteInsights: "/athlete-insights",
  coachConsole: "/coach-console",
} as const;

/**
 * POST_LOGIN_ROUTE - Rota padrão após autenticação bem-sucedida
 */
export const POST_LOGIN_ROUTE = ROUTES.dashboard;

/**
 * RouteDefinition - Interface para configuração de rotas com metadados
 */
export interface RouteDefinition {
  path: string;
  label: string;
  icon?: LucideIcon;
  requiresAdmin?: boolean;
}

/**
 * ROUTE_CONFIG - Configuração centralizada de rotas para navegação
 * Sincroniza automaticamente com sidebar e breadcrumbs
 */
export const ROUTE_CONFIG: RouteDefinition[] = [
  { path: ROUTES.dashboard, label: "Dashboard", icon: Home },
  { path: ROUTES.students, label: "Alunos", icon: Users },
  { path: ROUTES.sessions, label: "Sessões", icon: ClipboardList },
  { path: ROUTES.exercises, label: "Exercícios", icon: Library },
  { path: ROUTES.prescriptions, label: "Prescrições", icon: FileText },
  { path: ROUTES.protocols, label: "Protocolos", icon: Heart },
  { path: ROUTES.adminUsers, label: "Usuários", icon: UserCog, requiresAdmin: true },
  { path: ROUTES.adminDiagnostics, label: "Admin - Diagnóstico Oura", icon: Shield, requiresAdmin: true },
  { path: ROUTES.aiBuilder, label: "AI Builder", icon: Bot, requiresAdmin: true },
  { path: ROUTES.athleteInsights, label: "Insights do Atleta", icon: BarChart2, requiresAdmin: true },
  { path: ROUTES.coachConsole, label: "Coach Console", icon: Brain, requiresAdmin: true },
];

export const NAV_LABELS = {
  // Navegação principal
  dashboard: "Dashboard",
  students: "Alunos",
  sessions: "Sessões",
  exercises: "Exercícios",
  prescriptions: "Prescrições",
  protocols: "Protocolos",
  
  // Páginas secundárias
  studentsComparison: "Comparar alunos",
  adminUsers: "Usuários",
  adminDiagnostics: "Admin - Diagnóstico Oura",
  
  // Ações comuns
  addStudent: "Adicionar aluno",
  groupSession: "Sessão em grupo",
  generateInvite: "Gerar convite",
  importExcel: "Importar Excel",
  importExercises: "Importar exercícios",
  newPrescription: "Nova prescrição",
  recordSession: "Registrar sessão",
  recordIndividualSession: "Registrar sessão",
  recordGroupSession: "Registrar sessão em grupo",
  signOut: "Sair",
  back: "Voltar",
  
  // Ações de autenticação
  signIn: "Entrar",
  signUp: "Criar conta",
  continueWithGoogle: "Continuar com Google",
  forgotPassword: "Esqueceu a senha?",
  rememberMe: "Lembrar de mim",
  
  // Botões contextuais
  saveStudent: "Salvar aluno",
  saveSession: "Salvar sessão",
  saveReport: "Salvar relatório",
  generateReport: "Gerar relatório",
  startRecording: "Iniciar gravação",
  recordByVoice: "Gravar por voz",
  fillManually: "Preencher manualmente",
  
  // Tabs
  tabTraining: "Treinamento",
  tabOverview: "Visão geral",
  tabSessions: "Sessões",
  tabExercises: "Exercícios",
  tabPrescriptions: "Prescrições",
  tabOura: "Oura - Histórico",
  
  // Stats cards
  statTotalSessions: "Sessões registradas",
  statThisMonth: "Este mês",
  statActiveStudents: "Alunos ativos",
  statAvgLoad: "Carga média",
  statTotalUsers: "Total de usuários",
  statAdmins: "Administradores",
  statModerators: "Treinadores",
  statStudents: "Alunos",
  
  // Seções
  sectionRecentSessions: "Sessões recentes",
  sectionFilters: "Filtros",
  sectionUserList: "Lista de usuários",
  
  // Subtítulos padrão
  subtitleDefault: "Sistema de registro e acompanhamento",
  subtitleStudents: "Gerencie os dados dos seus alunos",
  subtitleSessions: "Visualize e filtre todas as sessões registradas no sistema",
  subtitleExercises: "Gerencie exercícios com classificações por padrões de movimento",
  subtitlePrescriptions: "Crie e gerencie prescrições de treino para seus alunos",
  subtitleProtocols: "Biblioteca completa baseada em evidências científicas",
  subtitleComparison: "Visualize e compare dados de até 10 alunos simultaneamente",
  subtitleAdminUsers: "Gerencie contas, perfis e permissões de todos os usuários do sistema",
  aiBuilder: "AI Builder",
  athleteInsights: "Insights do Atleta",
  coachConsole: "Coach Console",
  subtitleDiagnostics: "Painel técnico para administradores",
} as const;

export type NavLabel = typeof NAV_LABELS[keyof typeof NAV_LABELS];
