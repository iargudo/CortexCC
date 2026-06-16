import { Phone, PhoneOff, PhoneIncoming } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";
import { useSipPhoneContext } from "@/providers/sipPhoneContext";
import type { Conversation } from "@/data/mock";
import { toast } from "sonner";

export function VoiceCallBar({ conversation }: { conversation: Conversation }) {
  const { toggleMute, toggleHold, hangup, answer: sipAnswer, reject: sipReject, currentCall } =
    useSipPhoneContext();
  const isVoice = conversation.channel === "VOICE";
  const isWaiting = conversation.status === "WAITING" || conversation.status === "ASSIGNED";
  const isActive = conversation.status === "ACTIVE" || conversation.status === "ON_HOLD";
  const linkedCall = currentCall?.conversationId === conversation.id ? currentCall : null;
  const sipRingingInbound =
    currentCall?.direction === "inbound" &&
    currentCall.state === "ringing" &&
    (!currentCall.conversationId || currentCall.conversationId === conversation.id);

  if (!isVoice) return null;

  const answer = async () => {
    try {
      if (sipRingingInbound) {
        await sipAnswer();
        toast.success("Llamada contestada");
        return;
      }
      await apiJson(`/voice/calls/${encodeURIComponent(conversation.id)}/answer`, { method: "POST" });
      toast.success("Tu extensión está sonando. Contesta en el softphone cuando aparezca la llamada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo contestar");
    }
  };

  const reject = async () => {
    try {
      if (sipRingingInbound) {
        await sipReject();
        return;
      }
      await apiJson(`/voice/calls/${encodeURIComponent(conversation.id)}/reject`, { method: "POST" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo rechazar");
    }
  };

  const endCall = async () => {
    try {
      await apiJson(`/voice/calls/${encodeURIComponent(conversation.id)}/hangup`, { method: "POST" });
      await hangup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo colgar");
    }
  };

  if (isWaiting) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-primary/5">
        <PhoneIncoming size={16} className="text-primary" />
        <span className="text-sm flex-1">Llamada entrante en cola</span>
        <Button size="sm" onClick={() => void answer()}>Contestar</Button>
        <Button size="sm" variant="outline" onClick={() => void reject()}>Rechazar</Button>
      </div>
    );
  }

  if (isActive || linkedCall) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-emerald-500/10">
        <Phone size={16} className="text-emerald-600" />
        <span className="text-sm flex-1">Llamada en curso</span>
        <Button size="sm" variant="outline" onClick={toggleMute}>Mute</Button>
        <Button size="sm" variant="outline" onClick={toggleHold}>Hold</Button>
        <Button size="sm" variant="destructive" onClick={() => void endCall()}>
          <PhoneOff size={14} className="mr-1" /> Colgar
        </Button>
      </div>
    );
  }

  return null;
}
