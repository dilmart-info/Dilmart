import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OfflineScreenProps {
  onRetry: () => void;
}

const OfflineScreen = ({ onRetry }: OfflineScreenProps) => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6 text-center">
      <WifiOff className="h-20 w-20 text-muted-foreground mb-6" strokeWidth={1.5} />
      <h1 className="text-xl font-bold mb-2">لا يوجد اتصال بالإنترنت</h1>
      <p className="text-muted-foreground mb-8 max-w-sm">
        يبدو أنك غير متصل بالشبكة. تحقق من اتصالك وحاول مرة أخرى.
      </p>
      <Button onClick={onRetry} size="lg" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        إعادة المحاولة
      </Button>
    </div>
  );
};

export default OfflineScreen;
