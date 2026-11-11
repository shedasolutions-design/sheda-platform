import { CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function PasswordChangedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <CheckCircle2 size={72} className="mb-6 text-green-600" />
      <h1 className="text-xl font-semibold">Password changed</h1>
      <p className="mb-8 mt-2 text-secondaryText">Your password has been changed successfully.</p>
      <ButtonLink href="/login" full>
        Back to login
      </ButtonLink>
    </div>
  );
}
