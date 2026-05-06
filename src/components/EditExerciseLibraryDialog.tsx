import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  useUpdateExercise,
  MOVEMENT_PATTERNS,
  LATERALITY_OPTIONS,
  MOVEMENT_PLANES,
  CONTRACTION_TYPES,
  EXERCISE_CATEGORIES,
  RISK_LEVELS,
  BOYLE_SCORE_SCALE,
  EXERCISE_DIMENSIONS,
  PATTERN_TO_CATEGORY,
  STABILITY_POSITION_OPTIONS,
  SURFACE_MODIFIER_OPTIONS,
  ExerciseLibrary,
  CreateExerciseInput,
} from "@/hooks/useExercisesLibrary";
import { useDuplicateExerciseCheck } from "@/hooks/useDuplicateExerciseCheck";
import { normalizeExerciseName } from "@/hooks/duplicateExerciseUtils";
import { EQUIPMENT_CATEGORIES } from "@/constants/equipment";
import { LEVEL_OPTIONS } from "@/constants/backToBasics";
import { Checkbox } from "@/components/ui/checkbox";
import { logger } from "@/utils/logger";
import { notify } from "@/lib/notify";


// Flatten equipment for selection
const ALL_EQUIPMENT = Object.values(EQUIPMENT_CATEGORIES).flat();

interface EditExerciseLibraryDialogProps {
  exercise: ExerciseLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditExerciseLibraryDialog = ({
  exercise,
  open,
  onOpenChange,
}: EditExerciseLibraryDialogProps) => {
  const [name, setName] = useState(exercise.name);
  const [movementPattern, setMovementPattern] = useState(exercise.movement_pattern);
  const [laterality, setLaterality] = useState(exercise.laterality || "");
  const [movementPlane, setMovementPlane] = useState(exercise.movement_plane || "");
  const [contractionType, setContractionType] = useState(exercise.contraction_type || "");
  const [level, setLevel] = useState(exercise.level || "");
  const [boyleScore, setBoyleScore] = useState(
    exercise.boyle_score?.toString() || ""
  );
  const [axialLoad, setAxialLoad] = useState(exercise.axial_load?.toString() || "");
  const [lumbarDemand, setLumbarDemand] = useState(exercise.lumbar_demand?.toString() || "");
  const [technicalComplexity, setTechnicalComplexity] = useState(exercise.technical_complexity?.toString() || "");
  const [metabolicPotential, setMetabolicPotential] = useState(exercise.metabolic_potential?.toString() || "");
  const [kneeDominance, setKneeDominance] = useState(exercise.knee_dominance?.toString() || "");
  const [hipDominance, setHipDominance] = useState(exercise.hip_dominance?.toString() || "");
  const [emphasis, setEmphasis] = useState(exercise.emphasis || "");
  const [description, setDescription] = useState(exercise.description || "");
  const [stabilityPosition, setStabilityPosition] = useState(exercise.stability_position || "");
  const [surfaceModifier, setSurfaceModifier] = useState(exercise.surface_modifier || "nenhum");
  const [videoUrl, setVideoUrl] = useState(exercise.video_url || "");
  const [riskLevel, setRiskLevel] = useState(exercise.risk_level || "");
  const [category, setCategory] = useState(exercise.category || "");
  const [subcategory, setSubcategory] = useState(exercise.subcategory || "");
  const [plyometricPhase, setPlyometricPhase] = useState(exercise.plyometric_phase?.toString() || "");
  const [defaultSets, setDefaultSets] = useState(exercise.default_sets || "");
  const [defaultReps, setDefaultReps] = useState(exercise.default_reps || "");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(exercise.equipment_required || []);

  const updateExercise = useUpdateExercise();
  const { data: duplicates } = useDuplicateExerciseCheck(name, exercise.id);
  const hasExactDuplicate = Boolean(
    duplicates?.some((duplicate) => normalizeExerciseName(duplicate.name) === normalizeExerciseName(name))
  );

  useEffect(() => {
    setName(exercise.name);
    setMovementPattern(exercise.movement_pattern);
    setLaterality(exercise.laterality || "");
    setMovementPlane(exercise.movement_plane || "");
    setContractionType(exercise.contraction_type || "");
    setLevel(exercise.level || "");
    setBoyleScore(exercise.boyle_score?.toString() || "");
    setAxialLoad(exercise.axial_load?.toString() || "");
    setLumbarDemand(exercise.lumbar_demand?.toString() || "");
    setTechnicalComplexity(exercise.technical_complexity?.toString() || "");
    setMetabolicPotential(exercise.metabolic_potential?.toString() || "");
    setKneeDominance(exercise.knee_dominance?.toString() || "");
    setHipDominance(exercise.hip_dominance?.toString() || "");
    setEmphasis(exercise.emphasis || "");
    setStabilityPosition(exercise.stability_position || "");
    setSurfaceModifier(exercise.surface_modifier || "nenhum");
    setDescription(exercise.description || "");
    setVideoUrl(exercise.video_url || "");
    setRiskLevel(exercise.risk_level || "");
    setCategory(exercise.category || "");
    setSubcategory(exercise.subcategory || "");
    setPlyometricPhase(exercise.plyometric_phase?.toString() || "");
    setDefaultSets(exercise.default_sets || "");
    setDefaultReps(exercise.default_reps || "");
    setSelectedEquipment(exercise.equipment_required || []);
  }, [exercise]);

  const handleMovementPatternChange = (pattern: string) => {
    setMovementPattern(pattern);
    const autoCategory = PATTERN_TO_CATEGORY[pattern];
    if (autoCategory && !category) {
      setCategory(autoCategory);
    }
  };

  const handleEquipmentToggle = (equipment: string) => {
    setSelectedEquipment(prev => 
      prev.includes(equipment) 
        ? prev.filter(e => e !== equipment)
        : [...prev, equipment]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    if (hasExactDuplicate) {
      notify.error("Exercício duplicado", {
        description: "Já existe um exercício com esse mesmo nome normalizado. Use o exercício existente ou ajuste a nomenclatura.",
      });
      return;
    }

    try {
      await updateExercise.mutateAsync({
        id: exercise.id,
        name: name.trim(),
        movement_pattern: movementPattern && movementPattern !== "none" ? movementPattern : null,
        laterality: laterality && laterality !== "none" ? laterality : null,
        movement_plane: movementPlane && movementPlane !== "none" ? movementPlane : null,
        contraction_type: contractionType && contractionType !== "none" ? contractionType : null,
        level: level && level !== "none" ? level : null,
        numeric_level: boyleScore && boyleScore !== "none" ? parseInt(boyleScore) : null,
        boyle_score: boyleScore && boyleScore !== "none" ? parseInt(boyleScore) : null,
        axial_load: axialLoad ? parseInt(axialLoad) : null,
        lumbar_demand: lumbarDemand ? parseInt(lumbarDemand) : null,
        technical_complexity: technicalComplexity ? parseInt(technicalComplexity) : null,
        metabolic_potential: metabolicPotential ? parseInt(metabolicPotential) : null,
        knee_dominance: kneeDominance ? parseInt(kneeDominance) : null,
        hip_dominance: hipDominance ? parseInt(hipDominance) : null,
        emphasis: emphasis.trim() || null,
        description: description.trim() || null,
        video_url: videoUrl.trim() || null,
        risk_level: riskLevel && riskLevel !== "none" ? riskLevel : null,
        category: category && category !== "none" ? category : null,
        subcategory: subcategory.trim() || null,
        plyometric_phase: plyometricPhase ? parseInt(plyometricPhase) : null,
        default_sets: defaultSets.trim() || null,
        default_reps: defaultReps.trim() || null,
        equipment_required: selectedEquipment.length > 0 ? selectedEquipment : null,
        surface_modifier: surfaceModifier && surfaceModifier !== "nenhum" ? surfaceModifier : "nenhum",
        stability_position: stabilityPosition && stabilityPosition !== "none" ? stabilityPosition : null,
      } satisfies Partial<CreateExerciseInput> & { id: string });

      onOpenChange(false);
    } catch (error: unknown) {
      logger.warn("EditExerciseLibraryDialog submit failed", error);
      // Error feedback is handled by mutation's onError callback.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Exercício</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-4">
          <form onSubmit={handleSubmit} className="space-y-4" id="edit-exercise-form">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Informações Básicas</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="edit-name">Nome do Exercício *</Label>
                  <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Agachamento Livre"
                    required
                  />
                  {duplicates && duplicates.length > 0 && (
                    <Alert variant="default" className="border-accent/50 bg-accent/10">
                      <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                      <AlertDescription className="text-sm">
                        Exercício(s) similar(es) encontrado(s):
                        <ul className="mt-1 list-disc list-inside">
                          {duplicates.map((d) => (
                            <li key={d.id} className="text-muted-foreground">{d.name}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-movement-pattern">Padrão de Movimento</Label>
                  <Select value={movementPattern} onValueChange={handleMovementPatternChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o padrão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(MOVEMENT_PATTERNS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-category">Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {Object.entries(EXERCISE_CATEGORIES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-boyle-score">Nível Boyle (1-5)</Label>
                  <Select value={boyleScore} onValueChange={setBoyleScore}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(BOYLE_SCORE_SCALE).map(([key, val]) => (
                        <SelectItem key={key} value={key}>
                          {val.label} — {val.category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-risk-level">Nível de Risco</Label>
                  <Select value={riskLevel} onValueChange={setRiskLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(RISK_LEVELS).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-level">Nível Técnico</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(LEVEL_OPTIONS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Classification Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Classificação Biomecânica</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-laterality">Lateralidade</Label>
                  <Select value={laterality} onValueChange={setLaterality}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(LATERALITY_OPTIONS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-movement-plane">Plano de Movimento</Label>
                  <Select value={movementPlane} onValueChange={setMovementPlane}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(MOVEMENT_PLANES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-stability-position">Posição / Base de Estabilidade</Label>
                  <Select value={stabilityPosition} onValueChange={setStabilityPosition}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {Object.entries(STABILITY_POSITION_OPTIONS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-contraction-type">Tipo de Contração</Label>
                  <Select value={contractionType} onValueChange={setContractionType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {Object.entries(CONTRACTION_TYPES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-surface-modifier">Modificador de Superfície</Label>
                  <Select value={surfaceModifier} onValueChange={setSurfaceModifier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SURFACE_MODIFIER_OPTIONS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-plyometric-phase">Fase Pliométrica (1-19)</Label>
                  <Input
                    id="edit-plyometric-phase"
                    type="number"
                    min="1"
                    max="19"
                    value={plyometricPhase}
                    onChange={(e) => setPlyometricPhase(e.target.value)}
                    placeholder="Ex: 5"
                  />
                </div>
              </div>
            </div>

            {/* Dimension Scores Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Scores de Classificação (0-5)</h3>
              
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(EXERCISE_DIMENSIONS).map(([key, dim]) => {
                  const stateMap: Record<string, [string, (v: string) => void]> = {
                    axial_load: [axialLoad, setAxialLoad],
                    lumbar_demand: [lumbarDemand, setLumbarDemand],
                    technical_complexity: [technicalComplexity, setTechnicalComplexity],
                    metabolic_potential: [metabolicPotential, setMetabolicPotential],
                    knee_dominance: [kneeDominance, setKneeDominance],
                    hip_dominance: [hipDominance, setHipDominance],
                  };
                  const [val, setter] = stateMap[key];
                  return (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs" title={dim.description}>{dim.abbrev} — {dim.label}</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        placeholder="0-5"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-emphasis">Ênfase (articulação/região)</Label>
                <Input
                  id="edit-emphasis"
                  value={emphasis}
                  onChange={(e) => setEmphasis(e.target.value)}
                  placeholder="Ex: Joelho, Quadril, Ombro"
                />
              </div>
            </div>

            {/* Defaults Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Prescrição Padrão</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-default-sets">Séries Padrão</Label>
                  <Input
                    id="edit-default-sets"
                    value={defaultSets}
                    onChange={(e) => setDefaultSets(e.target.value)}
                    placeholder="Ex: 3-4"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-default-reps">Repetições Padrão</Label>
                  <Input
                    id="edit-default-reps"
                    value={defaultReps}
                    onChange={(e) => setDefaultReps(e.target.value)}
                    placeholder="Ex: 8-12"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="edit-subcategory">Subcategoria</Label>
                  <Input
                    id="edit-subcategory"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="Ex: Agachamentos, Flexões"
                  />
                </div>
              </div>
            </div>

            {/* Video and Description */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Mídia e Descrição</h3>
              
              <div className="space-y-2">
                <Label htmlFor="edit-video-url">URL do Vídeo</Label>
                <Input
                  id="edit-video-url"
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrição</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição opcional do exercício, dicas de execução..."
                  rows={3}
                />
              </div>
            </div>

            {/* Equipment Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground">Equipamentos Necessários</h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                {ALL_EQUIPMENT.map((equipment) => (
                  <div key={equipment} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-equip-${equipment}`}
                      checked={selectedEquipment.includes(equipment)}
                      onCheckedChange={() => handleEquipmentToggle(equipment)}
                    />
                    <label
                      htmlFor={`edit-equip-${equipment}`}
                      className="text-sm cursor-pointer truncate"
                    >
                      {equipment}
                    </label>
                  </div>
                ))}
              </div>
              {selectedEquipment.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedEquipment.length} equipamento(s) selecionado(s)
                </p>
              )}
            </div>
          </form>
        </div>
        <div className="pt-4 border-t border-border shrink-0">
          <Button 
            type="submit" 
            form="edit-exercise-form"
            className="w-full" 
            disabled={updateExercise.isPending}
          >
            {updateExercise.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
