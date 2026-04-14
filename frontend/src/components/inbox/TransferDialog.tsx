import { AssignDialog } from "@/components/inbox/AssignDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationContact: string;
}

export function TransferDialog({
  open,
  onOpenChange,
  conversationId,
  conversationContact,
}: Props) {
  return (
    <AssignDialog
      open={open}
      onOpenChange={onOpenChange}
      conversationId={conversationId}
      conversationContact={conversationContact}
      mode="transfer"
    />
  );
}
