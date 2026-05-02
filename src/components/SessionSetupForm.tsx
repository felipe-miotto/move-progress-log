import { useState, useMemo, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTrainers } from "@/hooks/useTrainers";
import { useStudents } from "@/hooks/useStudents";
import { useStudentsWithActivePrescriptions } from "@/hooks/useStudentDetail";
import { format } from "date-fns";
import { Search, UserPlus, GitCompare } from "lucide-react";
import { AddStudentDialog } from "./AddStudentDialog";
import { ROUTES } from "@/constants/navigation";

interface Student {
  id: string;
  name: string;
  weight_kg?: number;
  has_active_prescription?: boolean;
}

interface SessionSetupFormProps {
  date: string;
  time: string;
  trainerName: string;
  selectedStudents: Student[];
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onTrainerNameChange: (trainer: string) => void;
  onStudentToggle: (student: Student) => void;
  prescriptionId?: string | null;
  showValidation?: boolean;
  availableStudents?: Student[];
  allowNewStudent?: boolean;
  emptyStudentsMessage?: string;
}

export function SessionSetupForm({
  date,
  time,
  trainerName,
  selectedStudents,
  onDateChange,
  onTimeChange,
  onTrainerNameChange,
  onStudentToggle,
  prescriptionId,
  showValidation = false,
  availableStudents,
  allowNewStudent = true,
  emptyStudentsMessage,
}: SessionSetupFormProps) {
  const { data: trainers } = useTrainers();
  const { data: fetchedStudents } = useStudents();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const students = availableStudents ?? fetchedStudents;

  // Buscar prescrições ativas de todos os alunos
  const studentIds = useMemo(() => students?.map(s => s.id) || [], [students]);
  const { data: activeStudentIds } = useStudentsWithActivePrescriptions(studentIds);

  // Enriquecer estudantes com informação de prescrição ativa
  const enrichedStudents = useMemo(() => students?.map(student => ({
    ...student,
    has_active_prescription: (student.has_active_prescription ?? activeStudentIds?.has(student.id)) || false,
  })), [students, activeStudentIds]);

  // Normalizar texto removendo acentos para busca
  const normalize = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Filtrar estudantes com busca tokenizada (suporta nomes compostos parciais e acentos)
  const filteredStudents = useMemo(() => {
    if (!enrichedStudents) return [];
    if (!searchTerm.trim()) return enrichedStudents;
    const searchTokens = normalize(searchTerm).split(/\s+/).filter(Boolean);
    return enrichedStudents.filter(student => {
      const nameTokens = normalize(student.name).split(/\s+/);
      return searchTokens.every(st => nameTokens.some(nt => nt.startsWith(st)));
    });
  }, [enrichedStudents, searchTerm]);

  const handleStudentCreated = (newStudent: { id: string; name: string }) => {
    // Auto-select the newly created student
    onStudentToggle(newStudent as Student);
  };

  const handleOpenComparison = () => {
    const studentIds = selectedStudents.map(s => s.id).join(',');
    const params = new URLSearchParams();
    
    if (studentIds) params.set('students', studentIds);
    if (prescriptionId) params.set('prescription', prescriptionId);
    if (date) {
      // Set date range: 30 days before session date
      const sessionDate = new Date(date);
      const startDate = new Date(sessionDate);
      startDate.setDate(startDate.getDate() - 30);
      params.set('startDate', format(startDate, "yyyy-MM-dd"));
      params.set('endDate', date);
    }
    
    const url = `${ROUTES.studentsComparison}?${params.toString()}`;
    window.open(url, '_blank');
  };

  const canOpenComparison = selectedStudents.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Data *</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            max={format(new Date(), "yyyy-MM-dd")}
            className={showValidation && !date ? "border-destructive" : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="time">Horário *</Label>
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className={showValidation && !time ? "border-destructive" : ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Treinador Responsável *</Label>
        <Select value={trainerName} onValueChange={onTrainerNameChange}>
          <SelectTrigger className={showValidation && !trainerName ? "border-destructive" : ""}>
            <SelectValue placeholder="Selecione o treinador" />
          </SelectTrigger>
          <SelectContent>
            {trainers?.filter(t => t.full_name).map((trainer) => (
              <SelectItem key={trainer.id} value={trainer.full_name}>
                {trainer.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Label>Alunos * (máximo 10)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenComparison}
                disabled={!canOpenComparison}
                className="h-7 gap-1.5 text-xs"
                title={canOpenComparison ? "Abrir histórico dos alunos selecionados em nova aba" : "Selecione pelo menos um aluno"}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Histórico
              </Button>
              {allowNewStudent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddStudentDialog(true)}
                  className="h-7 gap-1.5 text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Novo
                </Button>
              )}
            </div>
          </div>
          {selectedStudents.length > 0 && (
            <Badge variant="secondary">
              {selectedStudents.length} selecionado{selectedStudents.length > 1 ? 's' : ''}
              {selectedStudents.length >= 10 && ' (máximo)'}
            </Badge>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            id="session-student-search"
            name="internal-session-student-filter"
            type="text"
            role="search"
            autoComplete="chrome-off"
            data-form-type="other"
            data-lpignore="true"
            placeholder="Buscar aluno..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className={`border rounded-md p-4 max-h-[300px] overflow-y-auto space-y-3 ${showValidation && selectedStudents.length === 0 ? "border-destructive" : ""}`}>
          {filteredStudents?.map((student) => (
            <div key={student.id} className="flex items-center space-x-2">
              <Checkbox
                id={`student-${student.id}`}
                checked={selectedStudents.some(s => s.id === student.id)}
                onCheckedChange={() => {
                  onStudentToggle(student);
                  // Preserve focus on search input after toggle
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
                disabled={selectedStudents.length >= 10 && !selectedStudents.some(s => s.id === student.id)}
              />
              <label
                htmlFor={`student-${student.id}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 flex-1"
              >
                {student.name}
                {student.has_active_prescription && (
                  <Badge variant="secondary" className="text-xs">Com prescrição</Badge>
                )}
              </label>
            </div>
          ))}
          {!filteredStudents?.length && enrichedStudents?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum aluno encontrado com "{searchTerm}"
            </p>
          ) : !enrichedStudents?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {emptyStudentsMessage ?? "Nenhum aluno cadastrado"}
            </p>
          ) : null}
        </div>
      </div>

      <AddStudentDialog 
        open={showAddStudentDialog} 
        onOpenChange={setShowAddStudentDialog}
        onStudentCreated={handleStudentCreated}
      />
    </div>
  );
}
