import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { buildErrorDescription } from "@/utils/errorParsing";

interface AudioSegment {
  segmentOrder: number;
  rawTranscription: string;
  audioDuration: number;
  extractedData?: {
    sessions: Array<{
      student_name: string;
      clinical_observations: Array<{ observation: string }>;
      exercises: Array<{ name: string; exercise_library_id?: string | null; reps?: number; load_kg?: number; observations?: string }>;
    }>;
  };
}

interface AudioSegmentRecorderProps {
  onSegmentComplete: (segment: AudioSegment) => void;
  onError?: (error: string) => void;
  currentSegmentNumber: number;
  prescriptionId?: string;
  selectedStudents?: Array<{ id: string; name: string; weight_kg?: number }>;
  date: string;
  time: string;
}

export function AudioSegmentRecorder({
  onSegmentComplete,
  onError,
  currentSegmentNumber,
  prescriptionId,
  selectedStudents,
  date,
  time,
}: AudioSegmentRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<number>();

  const processAudioSegment = useCallback(async (duration: number) => {
    setIsProcessing(true);
    setIsRecording(false);

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    let processingToastId: string | number | undefined;

    try {
      processingToastId = sonnerToast.loading(`Processando Segmento ${currentSegmentNumber}...`, {
        description: "Convertendo fala em texto com IA",
      });

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      await new Promise((resolve, reject) => {
        reader.onloadend = resolve;
        reader.onerror = reject;
      });

      const base64Audio = (reader.result as string).split(",")[1];

      const { data, error } = await supabase.functions.invoke("process-voice-session", {
        body: {
          audio: base64Audio,
          prescriptionId,
          students: selectedStudents,
          date,
          time,
          segmentNumber: currentSegmentNumber,
        },
      });

      if (error) throw error;

      if (data.success) {
        const segment: AudioSegment = {
          segmentOrder: currentSegmentNumber,
          rawTranscription: data.transcription,
          audioDuration: duration,
          extractedData: data.data, // 🔥 INCLUIR DADOS ESTRUTURADOS!
        };

        onSegmentComplete(segment);

        sonnerToast.dismiss(processingToastId);
        sonnerToast.success(`Segmento ${currentSegmentNumber} processado! ✅`, {
          description: "Revise e edite a transcrição se necessário",
        });
      } else {
        throw new Error(data.error || "Erro ao processar áudio");
      }
    } catch (error: unknown) {
      logger.error("Error processing audio:", error);

      if (processingToastId) sonnerToast.dismiss(processingToastId);

      const errorMsg = buildErrorDescription(error) || "Erro ao processar gravação";
      sonnerToast.error("Erro no processamento", {
        description: errorMsg,
      });

      if (onError) onError(errorMsg);
    } finally {
      setIsProcessing(false);
      setRecordingDuration(0);
      audioChunksRef.current = [];

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [currentSegmentNumber, date, onError, onSegmentComplete, prescriptionId, selectedStudents, time]);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;

    let permissionToastId: string | number | undefined;

    try {
      permissionToastId = sonnerToast.loading("Solicitando acesso ao microfone...");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        await processAudioSegment(duration);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Atualizar duração a cada segundo
      durationIntervalRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      if (permissionToastId) sonnerToast.dismiss(permissionToastId);

      sonnerToast.success(`Gravando Segmento ${currentSegmentNumber}! 🎙️`, {
        description: "Fale sobre a sessão. Clique em 'Parar' quando terminar este segmento.",
      });
    } catch (error: unknown) {
      logger.error("Error starting recording:", error);
      if (permissionToastId) sonnerToast.dismiss(permissionToastId);

      const errorMsg = buildErrorDescription(error) || "Não foi possível iniciar a gravação";
      sonnerToast.error("Erro ao acessar microfone", {
        description: errorMsg,
      });

      if (onError) onError(errorMsg);
    }
  }, [isRecording, isProcessing, currentSegmentNumber, onError, processAudioSegment]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gravação de Áudio - Segmento {currentSegmentNumber}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRecording && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-destructive font-medium">
              <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
              Gravando... {formatDuration(recordingDuration)}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">
              Processando áudio e transcrevendo...
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {!isRecording && !isProcessing && (
            <Button onClick={startRecording} className="flex-1" size="lg">
              <Mic className="h-5 w-5 mr-2" />
              Iniciar Gravação
            </Button>
          )}

          {isRecording && (
            <Button onClick={stopRecording} variant="destructive" className="flex-1" size="lg">
              <Square className="h-5 w-5 mr-2" />
              Parar Gravação
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
