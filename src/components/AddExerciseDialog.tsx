import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, AlertTriangle, ChevronDown } from "lucide-react";
import {
  useCreateExercise,
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
  CORE_ATIVACAO_SUBCATEGORIES,
} from "@/hooks/useExercisesLibrary";
import { useDuplicateExerciseCheck } from "@/hooks/useDuplicateExerciseCheck";
import { normalizeExerciseName } from "@/hooks/duplicateExerciseUtils";
import { EQUIPMENT_CATEGORIES } from "@/constants/equipment";
import { LEVEL_OPTIONS } from "@/constants/backToBasics";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { notify } from "@/lib/notify";

// Flatten equipment for selection
const ALL_EQUIPMENT = Object.values(EQUIPMENT_CATEGORIES).flat();

export interface ExerciseDefaultValues {
  movementPattern?: string;
  laterality?: string;
  movementPlane?: string;
  contractionType?: string;
  level?: string;
  boyleScore?: string;
  axialLoad?: string;
  lumbarDemand?: string;
  technicalComplexity?: string;
  metabolicPotential?: string;
  kneeDominance?: string;
  hipDominance?: string;
  emphasis?: string;
  description?: string;
  videoUrl?: string;
  riskLevel?: string;
  category?: string;
  subcategory?: string;
  plyometricPhase?: string;
  defaultSets?: string;
  defaultReps?: string;
  selectedEquipment?: string[];
  stabilityPosition?: string;
  surfaceModifier?: string;
}

interface AddExerciseDialogProps {
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  defaultName?: string;
  defaultValues?: ExerciseDefaultValues;
  onCreated?: (exercise: { id: string; name: string }) => void;
}

export const AddExerciseDialog = ({
  externalOpen,
  onExternalOpenChange,
  defaultName,
  defaultValues,
  onCreated,
}: AddExerciseDialogProps = {}) => {
  const isControlled = externalOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = isControlled ? externalOpen : internalOpen;
  const setDialogOpen = isControlled ? (onExternalOpenChange || (() => {})) : setInternalOpen;
  const [name, setName] = useState(defaultName || "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Sync defaults when dialog opens externally
  useEffect(() => {
    if (isControlled && externalOpen) {
      if (defaultName) setName(defaultName);
      setAdvancedOpen(Boolean(defaultValues));
      if (defaultValues) {
        setMovementPattern(defaultValues.movementPattern || "");
        setLaterality(defaultValues.laterality || "");
        setMovementPlane(defaultValues.movementPlane || "");
        setContractionType(defaultValues.contractionType || "");
        setLevel(defaultValues.level || "");
        setBoyleScore(defaultValues.boyleScore || "");
        setAxialLoad(defaultValues.axialLoad || "");
        setLumbarDemand(defaultValues.lumbarDemand || "");
        setTechnicalComplexity(defaultValues.technicalComplexity || "");
        setMetabolicPotential(defaultValues.metabolicPotential || "");
        setKneeDominance(defaultValues.kneeDominance || "");
        setHipDominance(defaultValues.hipDominance || "");
        setEmphasis(defaultValues.emphasis || "");
        setDescription(defaultValues.description || "");
        setVideoUrl(defaultValues.videoUrl || "");
        setRiskLevel(defaultValues.riskLevel || "");
        setCategory(defaultValues.category || "");
        setSubcategory(defaultValues.subcategory || "");
        setPlyometricPhase(defaultValues.plyometricPhase || "");
        setDefaultSets(defaultValues.defaultSets || "");
        setDefaultReps(defaultValues.defaultReps || "");
        setSelectedEquipment(defaultValues.selectedEquipment || []);
        setStabilityPosition(defaultValues.stabilityPosition || "");
        setSurfaceModifier(defaultValues.surfaceModifier || "");
      }
    }
  }, [isControlled, externalOpen, defaultName, defaultValues]);

  const [movementPattern, setMovementPattern] = useState("");
  const [laterality, setLaterality] = useState("");
  const [movementPlane, setMovementPlane] = useState("");
  const [contractionType, setContractionType] = useState("");
  const [level, setLevel] = useState("");
  const [boyleScore, setBoyleScore] = useState("");
  const [axialLoad, setAxialLoad] = useState("");
  const [lumbarDemand, setLumbarDemand] = useState("");
  const [technicalComplexity, setTechnicalComplexity] = useState("");
  const [metabolicPotential, setMetabolicPotential] = useState("");
  const [kneeDominance, setKneeDominance] = useState("");
  const [hipDominance, setHipDominance] = useState("");
  const [emphasis, setEmphasis] = useState("");
  const [description, setDescription] = useState("");
  
  // New fields
  const [videoUrl, setVideoUrl] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [plyometricPhase, setPlyometricPhase] = useState("");
  const [defaultSets, setDefaultSets] = useState("");
  const [defaultReps, setDefaultReps] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [stabilityPosition, setStabilityPosition] = useState("");
  const [surfaceModifier, setSurfaceModifier] = useState("");

  const advancedFieldsFilledCount = [
    laterality,
    movementPlane,
    contractionType,
    level,
    axialLoad,
    lumbarDemand,
    technicalComplexity,
    metabolicPotential,
    kneeDominance,
    hipDominance,
    emphasis,
    description,
    videoUrl,
    subcategory,
    plyometricPhase,
    defaultSets,
    defaultReps,
    stabilityPosition,
    surfaceModifier && surfaceModifier !== "nenhum" ? surfaceModifier : "",
    selectedEquipment.length > 0 ? "equipment" : "",
  ].filter(Boolean).length;

  const createExercise = useCreateExercise();
  const { data: duplicates } = useDuplicateExerciseCheck(name);
  const hasExactDuplicate = Boolean(
    duplicates?.some((duplicate) => normalizeExerciseName(duplicate.name) === normalizeExerciseName(name))
  );

  const handleMovementPatternChange = (pattern: string) => {
    setMovementPattern(pattern);
    // Auto-fill category based on direct pattern → category mapping
    const autoCategory = PATTERN_TO_CATEGORY[pattern];
    if (autoCategory) {
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
      notify.error("Preencha o nome do exercício.");
      return;
    }

    if (hasExactDuplicate) {
      notify.error("Exercício duplicado", {
        description: "Já existe um exercício com esse mesmo nome normalizado. Use o exercício existente ou ajuste a nomenclatura.",
      });
      return;
    }

    try {

    const result = await createExercise.mutateAsync({
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
      stability_position: stabilityPosition && stabilityPosition !== "none" ? stabilityPosition : null,
      surface_modifier: surfaceModifier && surfaceModifier !== "nenhum" ? surfaceModifier : "nenhum",
    });

    // Notify parent if callback provided
    if (onCreated && result) {
      onCreated({ id: result.id, name: result.name });
    }

    // Reset form
    setName("");
    setMovementPattern("");
    setLaterality("");
    setMovementPlane("");
    setContractionType("");
    setLevel("");
    setBoyleScore("");
    setAxialLoad("");
    setLumbarDemand("");
    setTechnicalComplexity("");
    setMetabolicPotential("");
    setKneeDominance("");
    setHipDominance("");
    setEmphasis("");
    setDescription("");
    setVideoUrl("");
    setRiskLevel("");
    setCategory("");
    setSubcategory("");
    setPlyometricPhase("");
    setDefaultSets("");
    setDefaultReps("");
    setSelectedEquipment([]);
    setStabilityPosition("");
    setSurfaceModifier("");
    setAdvancedOpen(false);

    if (!onCreated) {
      setDialogOpen(false);
    }
    } catch (err: unknown) {
      // Error already handled by mutation's onError
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Exercício
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Novo Exercício</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-none">
          <form onSubmit={handleSubmit} className="space-y-4" id="add-exercise-form">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Informações Básicas</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="name">Nome do Exercício *</Label>
                  <Input
                    id="name"
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
                  <Label htmlFor="movement-pattern">Padrão de Movimento</Label>
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
                  <Label htmlFor="category">Categoria</Label>
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
                  <Label htmlFor="boyle-score">Nível Fabrik</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Nível mínimo recomendado. Exercícios de níveis menores também podem ser usados por alunos mais avançados.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="risk-level">Nível de Risco</Label>
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
                  <Label htmlFor="level">Nível Técnico</Label>
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

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <div className="pt-2">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    aria-label={
                      advancedOpen
                        ? "Ocultar campos avançados do exercício"
                        : "Mostrar campos avançados do exercício"
                    }
                  >
                    <span className="text-left">
                      Campos avançados
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {advancedFieldsFilledCount > 0
                          ? `${advancedFieldsFilledCount} preenchido(s)`
                          : "opcional"}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="space-y-4">
                {/* Classification Section */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-muted-foreground">Classificação Biomecânica</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="laterality">Lateralidade</Label>
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
                  <Label htmlFor="movement-plane">Plano de Movimento</Label>
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
                  <Label htmlFor="stability-position">Posição / Base de Estabilidade</Label>
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
                  <Label htmlFor="surface-modifier">Modificador de Superfície</Label>
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
                  <Label htmlFor="contraction-type">Tipo de Contração</Label>
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
                  <Label htmlFor="plyometric-phase">Fase Pliométrica (1-19)</Label>
                  <Input
                    id="plyometric-phase"
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
                <Label htmlFor="emphasis">Ênfase (articulação/região)</Label>
                <Input
                  id="emphasis"
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
                  <Label htmlFor="default-sets">Séries Padrão</Label>
                  <Input
                    id="default-sets"
                    value={defaultSets}
                    onChange={(e) => setDefaultSets(e.target.value)}
                    placeholder="Ex: 3-4"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-reps">Repetições Padrão</Label>
                  <Input
                    id="default-reps"
                    value={defaultReps}
                    onChange={(e) => setDefaultReps(e.target.value)}
                    placeholder="Ex: 8-12"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="subcategory">Subcategoria</Label>
                  {category === "core_ativacao" ? (
                    <>
                      <Select
                        value={subcategory || "__none__"}
                        onValueChange={(v) => setSubcategory(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger id="subcategory">
                          <SelectValue placeholder="Selecione a função principal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— (sem subcategoria)</SelectItem>
                          {Object.entries(CORE_ATIVACAO_SUBCATEGORIES).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                          {/* Preserva valor legado fora da lista controlada (ex.: dados antigos). */}
                          {subcategory &&
                            !(subcategory in CORE_ATIVACAO_SUBCATEGORIES) && (
                              <SelectItem value={subcategory}>
                                {subcategory} (legado)
                              </SelectItem>
                            )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Use a função principal do exercício na prescrição.
                      </p>
                    </>
                  ) : (
                    <Input
                      id="subcategory"
                      value={subcategory}
                      onChange={(e) => setSubcategory(e.target.value)}
                      placeholder="Ex: Agachamentos, Flexões"
                    />
                  )}
                </div>
              </div>
                </div>

                {/* Video and Description */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-muted-foreground">Mídia e Descrição</h3>
              
              <div className="space-y-2">
                <Label htmlFor="video-url">URL do Vídeo</Label>
                <Input
                  id="video-url"
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
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
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 border rounded-md">
                {ALL_EQUIPMENT.map((equipment) => (
                  <div key={equipment} className="flex items-center space-x-2">
                    <Checkbox
                      id={`equip-${equipment}`}
                      checked={selectedEquipment.includes(equipment)}
                      onCheckedChange={() => handleEquipmentToggle(equipment)}
                    />
                    <label
                      htmlFor={`equip-${equipment}`}
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
              </CollapsibleContent>
            </Collapsible>
          </form>
        </div>

        <div className="pt-4 border-t border-border shrink-0">
          <Button 
            type="button"
            onClick={(e) => {
              const form = document.getElementById('add-exercise-form') as HTMLFormElement;
              if (form) {
                form.requestSubmit();
              }
            }}
            className="w-full" 
            disabled={createExercise.isPending}
          >
            {createExercise.isPending ? "Criando..." : "Criar Exercício"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
