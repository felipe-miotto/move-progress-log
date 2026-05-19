import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AudioSegmentRecorder } from "./AudioSegmentRecorder";
import { TranscriptionEditor } from "./TranscriptionEditor";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Plus, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";


interface RawObservation {
  observation: string;
}

interface RawExercise {
  name?: string;
  executed_exercise_name?: string;
  exercise_library_id?: string | null;
  reps?: number | null;
  reserve_reps?: string | null;
  load_kg?: number | null;
  load_breakdown?: string | null;
  observations?: string | null;
}

interface AudioSegment {
  segmentOrder: number;
  rawTranscription: string;
  editedTranscription?: string;
  audioDuration: number;
  extractedData?: {
    sessions: Array<{
      student_name: string;
      clinical_observations: RawObservation[];
      exercises: RawExercise[];
    }>;
  };
}

interface MultiSegmentRecorderProps {
  prescriptionId?: string;
  selectedStudents?: Array<{ id: string; name: string; weight_kg?: number }>;
  date: string;
  time: string;
  onComplete: (segments: AudioSegment[]) => void;
  onError?: (error: string) => void;
}

export function MultiSegmentRecorder({
  prescriptionId,
  selectedStudents,
  date,
  time,
  onComplete,
  onError,
}: MultiSegmentRecorderProps) {
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [currentSegmentNumber, setCurrentSegmentNumber] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecorder, setShowRecorder] = useState(true);

  const handleSegmentComplete = (segment: AudioSegment) => {
    setSegments((prev) => [...prev, segment]);
    setIsRecording(false);
    setShowRecorder(false);
  };

  const handleTranscriptionChange = (segmentIndex: number, transcription: string) => {
    setSegments((prev) =>
      prev.map((seg, idx) =>
        idx === segmentIndex
          ? { ...seg, editedTranscription: transcription }
          : seg
      )
    );
  };

  const handleAddAnotherSegment = () => {
    setCurrentSegmentNumber((prev) => prev + 1);
    setShowRecorder(true);
  };

  const handleFinalize = () => {
    if (segments.length === 0) {
      onError?.("Nenhum segmento de áudio foi gravado");
      return;
    }
    onComplete(segments);
  };

  const totalDuration = segments.reduce((acc, seg) => acc + seg.audioDuration, 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho com estatísticas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registro por Áudio Fracionado</CardTitle>
              <CardDescription>
                Grave múltiplos segmentos de áudio e edite as transcrições
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {segments.length} {segments.length === 1 ? "Segmento" : "Segmentos"}
              </Badge>
              <Badge variant="outline" className="text-base px-3 py-1">
                {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, "0")} min
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Gravador de Segmento */}
      {showRecorder && (
        <AudioSegmentRecorder
          currentSegmentNumber={currentSegmentNumber}
          prescriptionId={prescriptionId}
          selectedStudents={selectedStudents}
          date={date}
          time={time}
          onSegmentComplete={handleSegmentComplete}
          onError={onError}
        />
      )}

      {/* Lista de Segmentos Gravados */}
      {segments.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Segmentos Gravados</h3>
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Edições salvas automaticamente
            </Badge>
          </div>

          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {segments.map((segment, index) => (
                <TranscriptionEditor
                  key={index}
                  segmentOrder={segment.segmentOrder}
                  rawTranscription={segment.rawTranscription}
                  initialEditedTranscription={segment.editedTranscription}
                  onTranscriptionChange={(transcription) =>
                    handleTranscriptionChange(index, transcription)
                  }
                  autoSave={false}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Alertas e Instruções */}
      {segments.length > 0 && !showRecorder && (
        <Alert>
          <AlertDescription>
            ✅ Segmento {currentSegmentNumber} processado com sucesso! 
            Você pode adicionar mais segmentos ou finalizar a sessão.
          </AlertDescription>
        </Alert>
      )}

      {/* Botões de Ação */}
      {segments.length > 0 && !showRecorder && (
        <div className="flex gap-3">
          <Button
            onClick={handleAddAnotherSegment}
            variant="outline"
            size="lg"
            className="flex-1"
          >
            <Plus className="h-5 w-5 mr-2" />
            Continuar Gravando (Segmento {currentSegmentNumber + 1})
          </Button>
          <Button
            onClick={handleFinalize}
            size="lg"
            className="flex-1"
          >
            <Save className="h-5 w-5 mr-2" />
            Finalizar e Salvar Sessão
          </Button>
        </div>
      )}
    </div>
  );
}
