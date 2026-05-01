import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useValidateInvite, useCreateStudentFromInvite } from "@/hooks/useStudentInvites";
import { toast } from "sonner";
import { logger } from "@/utils/logger";

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  birth_date: z.string().optional(),
  weight_kg: z.number().positive().optional().or(z.literal("")),
  height_cm: z.number().positive().optional().or(z.literal("")),
  fitness_level: z.enum(["iniciante", "intermediario", "avancado"]).optional(),
  objectives: z.string().optional(),
  limitations: z.string().optional(),
  injury_history: z.string().optional(),
  preferences: z.string().optional(),
  weekly_sessions_proposed: z.number().int().positive().default(2),
  has_oura_ring: z.boolean().default(false),
  accepts_oura_sharing: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function StudentOnboardingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  logger.log('StudentOnboardingPage loaded');
  logger.log('Validating invite token');

  const { data: validationData, isLoading: isValidating, error: validationError } = useValidateInvite(token || "");
  const createStudent = useCreateStudentFromInvite();

  logger.log('Validation data:', validationData);
  logger.log('Validation error:', validationError);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      weekly_sessions_proposed: 2,
      has_oura_ring: false,
      accepts_oura_sharing: false,
    },
  });

  const hasOuraRing = form.watch("has_oura_ring");

  useEffect(() => {
    if (validationError) {
      toast.error("Link de convite inválido ou expirado");
    }
  }, [validationError]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
        toast.error("Formato de imagem não suportado", {
          description: "Use JPG, PNG ou WEBP.",
        });
        e.target.value = "";
        setAvatarPreview(null);
        return;
      }

      if (file.size > MAX_AVATAR_SIZE_BYTES) {
        toast.error("Imagem muito grande", {
          description: "A foto de perfil deve ter no máximo 5 MB.",
        });
        e.target.value = "";
        setAvatarPreview(null);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!token) return;

    try {
      logger.log('Creating student from invite');
      const result = await createStudent.mutateAsync({
        invite_token: token,
        student_data: {
          name: values.name,
          birth_date: values.birth_date,
          weight_kg: typeof values.weight_kg === 'number' ? values.weight_kg : undefined,
          height_cm: typeof values.height_cm === 'number' ? values.height_cm : undefined,
          fitness_level: values.fitness_level,
          objectives: values.objectives,
          limitations: values.limitations,
          injury_history: values.injury_history,
          preferences: values.preferences,
          weekly_sessions_proposed: values.weekly_sessions_proposed,
          has_oura_ring: values.has_oura_ring,
          accepts_oura_sharing: values.accepts_oura_sharing,
        },
        avatar_base64: avatarPreview || undefined,
      });

      if (result.redirect_to_oura && result.oura_auth_url) {
        toast.info("Conectando ao Oura Ring", {
          description: "Você será redirecionado para autorizar o acesso aos seus dados",
          duration: 2000,
        });
        
        setTimeout(() => {
          window.location.href = result.oura_auth_url;
        }, 2000);
      } else if (values.has_oura_ring && values.accepts_oura_sharing && !result.oura_auth_url) {
        toast.warning("Oura Ring não configurado", {
          description: "O sistema não está configurado para Oura Ring. Você pode conectar mais tarde.",
          duration: 4000,
        });
        navigate(ROUTES.onboardingSuccess);
      } else {
        navigate(ROUTES.onboardingSuccess);
      }
    } catch (error) {
      logger.error("Error creating student:", error);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (validationError || !validationData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link Inválido</CardTitle>
            <CardDescription>
              Este link de convite é inválido, expirado ou já foi utilizado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Entre em contato com seu treinador para solicitar um novo link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Complete seu Cadastro</CardTitle>
            <CardDescription>
              Bem-vindo! Você foi convidado por {validationData.trainer_name}. Complete seus dados para começar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo *</FormLabel>
                        <FormControl>
                          <Input placeholder="Digite seu nome completo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="avatar">Foto de Perfil (opcional)</Label>
                    <div className="flex items-center gap-4">
                      {avatarPreview && (
                        <img
                          src={avatarPreview}
                          alt="Pré-visualização da foto de perfil selecionada"
                          className="h-16 w-16 rounded-full object-cover"
                        />
                      )}
                      <Input
                        id="avatar"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="birth_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Nascimento</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="weight_kg"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Peso (kg)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="70"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : "")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="height_cm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Altura (cm)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="170"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : "")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="fitness_level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nível de Condicionamento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="iniciante">Iniciante</SelectItem>
                            <SelectItem value="intermediario">Intermediário</SelectItem>
                            <SelectItem value="avancado">Avançado</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="objectives"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Objetivos</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Quais são seus objetivos com o treinamento?"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="limitations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Limitações</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Possui alguma limitação física?"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="injury_history"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Histórico de Lesões</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Descreva lesões anteriores, se houver"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="preferences"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferências de Treino</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Horários preferidos, tipo de treino, etc."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weekly_sessions_proposed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sessões por Semana</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={7}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4 border-t pt-4">
                    <FormField
                      control={form.control}
                      name="has_oura_ring"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">
                            Possuo Oura Ring
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    {hasOuraRing && (
                      <div className="ml-6 space-y-3 border-l-2 border-primary/20 pl-4">
                        <FormField
                          control={form.control}
                          name="accepts_oura_sharing"
                          render={({ field }) => (
                            <FormItem className="space-y-3">
                              <div className="flex items-center space-x-2">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0 cursor-pointer font-semibold">
                                  Aceito compartilhar dados do meu Oura Ring
                                </FormLabel>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-2 bg-muted/50 p-3 rounded-lg">
                                <p className="font-medium">Dados que serão compartilhados:</p>
                                <ul className="space-y-1 ml-4">
                                  <li>• Qualidade do sono (duração, fases, eficiência)</li>
                                  <li>• Prontidão física (recuperação, HRV, FC em repouso)</li>
                                  <li>• Atividade física (passos, calorias, treinos)</li>
                                  <li>• Métricas de stress e recuperação</li>
                                  <li>• SpO2, VO2 Max e temperatura corporal</li>
                                </ul>
                                <div className="mt-3 pt-2 border-t border-border">
                                  <p className="text-xs">
                                    🔒 <strong>Privacidade garantida:</strong> Seus dados serão usados <strong>exclusivamente</strong> por {validationData?.trainer_name || "seu treinador"} para personalizar seus treinos. Não compartilharemos com terceiros.{" "}
                                    <a
                                      href={ROUTES.ouraConsent}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      Ver escopo Oura.
                                    </a>
                                  </p>
                                </div>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center text-sm text-muted-foreground space-y-2">
                  <p>
                    Ao finalizar o cadastro, você concorda com nossos{" "}
                    <a 
                      href={ROUTES.terms}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Termos de Uso
                    </a>
                    {" "}e{" "}
                    <a 
                      href={ROUTES.privacy}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Política de Privacidade
                    </a>
                    .
                  </p>
                  
                  {hasOuraRing && form.watch("accepts_oura_sharing") && (
                    <p className="text-xs bg-primary/10 p-2 rounded">
                      ✓ Após o cadastro, você será redirecionado para autorizar o acesso seguro aos seus dados do Oura Ring.
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={createStudent.isPending}>
                  {createStudent.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {hasOuraRing && form.watch("accepts_oura_sharing") 
                        ? "Redirecionando para Oura..." 
                        : "Finalizando cadastro..."}
                    </>
                  ) : (
                    "Finalizar Cadastro"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
