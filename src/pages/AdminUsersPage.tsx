import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useUserRole";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { StickyBar } from "@/components/StickyBar";
import { getOrganizationSchema, getWebPageSchema, getBreadcrumbSchema } from "@/utils/structuredData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { 
  Users, 
  Shield, 
  UserCog, 
  Search,
  Filter,
  RefreshCw,
  UserPlus
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NAV_LABELS } from "@/constants/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSEOHead, SEO_PRESETS } from "@/hooks/useSEOHead";
import { useOpenGraph, FABRIK_OG_DEFAULTS } from "@/hooks/useOpenGraph";
import { AddUserDialog } from "@/components/AddUserDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import { logger } from "@/utils/logger";
import { buildErrorDescription } from "@/utils/errorParsing";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'moderator' | 'user';
  created_at: string;
  last_sign_in_at: string | null;
}

type SortField = 'name' | 'email' | 'role' | 'last_sign_in';

const TRAINER_PROFILES_SELECT = "id, full_name, created_at, updated_at";

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  moderator: 'Treinador',
  user: 'Aluno'
};

const roleVariants: Record<string, "default" | "secondary" | "destructive"> = {
  admin: 'destructive',
  moderator: 'default',
  user: 'secondary'
};

export default function AdminUsersPage() {
  usePageTitle(NAV_LABELS.adminUsers);
  useSEOHead(SEO_PRESETS.private);
  useOpenGraph({
    ...FABRIK_OG_DEFAULTS,
    title: `${NAV_LABELS.adminUsers} · Fabrik Performance`,
    description: 'Administração de usuários e permissões do sistema Fabrik Performance.',
    type: 'website',
    url: true,
  });
  
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página.",
        variant: "destructive",
      });
      navigate(ROUTES.dashboard);
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Buscar papéis de todos os usuários
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Buscar todos os perfis de treinadores
      const { data: profiles, error: profilesError } = await supabase
        .from("trainer_profiles")
        .select(TRAINER_PROFILES_SELECT);

      if (profilesError) throw profilesError;

      // Buscar todos os alunos
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id, name, created_at, updated_at");

      if (studentsError) throw studentsError;

      // Combinar dados de trainers/admins
      const trainersData: UserWithRole[] = (profiles || []).map((profile) => {
        const roleData = roles?.find((r) => r.user_id === profile.id);

        return {
          id: profile.id,
          email: 'admin@fabrikbrasil.com', // Placeholder até ter auth.admin
          full_name: profile.full_name || 'Sem nome',
          role: (roleData?.role || 'moderator') as 'admin' | 'moderator' | 'user',
          created_at: profile.created_at,
          last_sign_in_at: profile.updated_at
        };
      });

      // Adicionar alunos como usuários com role 'user'
      const studentsData: UserWithRole[] = (students || []).map((student) => ({
        id: student.id,
        email: 'aluno@fabrikbrasil.com', // Placeholder - alunos não têm email no sistema
        full_name: student.name,
        role: 'user' as const,
        created_at: student.created_at,
        last_sign_in_at: student.updated_at
      }));

      setUsers([...trainersData, ...studentsData]);
    } catch (error: unknown) {
      logger.error("Error fetching users:", error);
      toast({
        title: "Erro ao carregar usuários",
        description: buildErrorDescription(error) || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedUsers = users
    .filter(user => {
      const matchesSearch = user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.full_name.localeCompare(b.full_name);
          break;
        case 'email':
          comparison = a.email.localeCompare(b.email);
          break;
        case 'role':
          comparison = a.role.localeCompare(b.role);
          break;
        case 'last_sign_in': {
          const dateA = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
          const dateB = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    moderators: users.filter(u => u.role === 'moderator').length,
    users: users.filter(u => u.role === 'user').length,
  };

  if (roleLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
  };

  const getSortAria = (field: SortField): "ascending" | "descending" | "none" =>
    sortField === field ? (sortDirection === "asc" ? "ascending" : "descending") : "none";

  const renderSortHeader = (field: SortField, label: string) => {
    const isActive = sortField === field;
    const directionLabel = sortDirection === "asc" ? "crescente" : "decrescente";

    return (
      <th scope="col" aria-sort={getSortAria(field)} className="p-0 text-left font-medium">
        <button
          type="button"
          onClick={() => handleSort(field)}
          className="flex w-full items-center gap-2 p-4 text-left font-medium transition-colors hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span>{label}</span>
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {isActive ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
          </span>
          <span className="sr-only">
            {isActive
              ? `Ordenado em ordem ${directionLabel}. Clique para inverter.`
              : "Clique para ordenar esta coluna."}
          </span>
        </button>
      </th>
    );
  };

  return (
    <PageLayout
      structuredData={[
        { data: getWebPageSchema(NAV_LABELS.adminUsers, NAV_LABELS.subtitleAdminUsers), id: "webpage-schema" },
        { data: getBreadcrumbSchema([
          { label: "Home", href: "/" },
          { label: NAV_LABELS.adminUsers, href: "/admin/usuarios" }
        ]), id: "breadcrumb-schema" }
      ]}
    >
      <PageHeader
        title={NAV_LABELS.adminUsers}
        description={`${stats.total} usuários • ${stats.admins} admins • ${stats.moderators} treinadores • ${stats.users} alunos`}
      />

      {/* Filters in StickyBar */}
      <StickyBar topOffset={48} threshold={100}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="w-full md:w-48">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
                <SelectItem value="moderator">Treinadores</SelectItem>
                <SelectItem value="user">Alunos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(searchTerm || roleFilter !== "all") && (
            <Button variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}

          <Button
            onClick={() => setShowAddDialog(true)}
            variant="default"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Adicionar Usuário
          </Button>

          <Button onClick={fetchUsers} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </StickyBar>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>{NAV_LABELS.sectionUserList}</CardTitle>
          <CardDescription>
            {filteredAndSortedUsers.length} {filteredAndSortedUsers.length === 1 ? 'usuário encontrado' : 'usuários encontrados'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                  <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24 shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
	                  <thead className="bg-muted">
	                    <tr>
	                      {renderSortHeader("name", "Nome")}
	                      {renderSortHeader("email", "Email")}
	                      {renderSortHeader("role", "Perfil")}
	                      {renderSortHeader("last_sign_in", "Último Acesso")}
	                      <th scope="col" className="text-left p-4 font-medium">Ações</th>
	                    </tr>
	                  </thead>
                  <tbody>
                     {filteredAndSortedUsers.map((user) => (
                      <tr key={user.id} className="border-t hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center justify-center h-10 w-10 rounded-full ${
                              user.role === 'admin' ? 'bg-destructive/10' : 
                              user.role === 'moderator' ? 'bg-primary/10' : 
                              'bg-secondary/10'
                            }`}>
                              {user.role === 'admin' && <Shield className="h-5 w-5 text-destructive" />}
                              {user.role === 'moderator' && <UserCog className="h-5 w-5 text-primary" />}
                              {user.role === 'user' && <Users className="h-5 w-5 text-muted-foreground" />}
                            </div>
                            <span className="font-medium">{user.full_name || 'Sem nome'}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{user.email}</td>
                        <td className="p-4">
                          <Badge variant={roleVariants[user.role]}>
                            {roleLabels[user.role]}
                          </Badge>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {user.last_sign_in_at 
                            ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR')
                            : 'Nunca'}
                        </td>
                        <td className="p-4">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowEditDialog(true);
                            }}
                          >
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredAndSortedUsers.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum usuário encontrado
                </div>
              )}
              </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Sistema de Gestão de Contas - Fase 1</CardTitle>
          <CardDescription>
            Fundação implementada com sucesso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Sistema de permissões granulares (35 permissões)</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Auditoria completa (histórico de mudanças)</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Rate limiting anti-brute force</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Sistema de reset de senha</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-yellow-500">⊙</span>
              <span>Painel de gestão (em desenvolvimento)</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddUserDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchUsers}
      />

      <EditUserDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        user={selectedUser}
        currentUserId={currentUserId}
        onSuccess={fetchUsers}
      />
    </PageLayout>
  );
}
